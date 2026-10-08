const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness(settings = {}) {
  const listeners = {}, storageListeners = [], tasks = new Map(), reads = [];
  let next = 1, blobs = [], revoked = [], media = [], fetches = [];
  function element() {
    const classes = new Set();
    return { style: { setProperty() {} }, classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
      classes, addEventListener() {}, closest() { return null; }, removeAttribute() {}, pause() { this.paused = true; },
      play() { this.paused = false; return Promise.resolve(); }, load() { this.released = true; },
      replaceChildren() { media = []; }, appendChild(el) { media.push(el); }, querySelector(tag) { return media.find(el => el.tag === tag); },
      getContext() { return { clearRect() {}, beginPath() {}, arc() {}, fill() {} }; } };
  }
  const elements = new Map();
  const document = { hidden: false, hasFocus: () => true,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement(tag) { return Object.assign(element(), { tag }); },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }, body: element() };
  const state = { wallpapers: [{ id: 'a', mimeType: 'video/mp4' }, { id: 'b', mimeType: 'image/png' }], activeWallpaperId: 'a', ...settings };
  const timer = (fn, ms, type) => { const id = next++; tasks.set(id, { fn, ms, type }); return id; };
  const window = { innerWidth: 1000, innerHeight: 800, focus() {}, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }, removeEventListener() {} };
  const context = vm.createContext({ window, document, navigator: {}, Date, Math, URLSearchParams, AbortController,
    fetch(url, options) { return new Promise((resolve,reject) => fetches.push({url,options,resolve,reject})); },
    matchMedia: window.matchMedia, URL: { createObjectURL: () => `blob:${next++}`, revokeObjectURL: url => revoked.push(url) },
    WallpaperDB: { getWallpaperBlob(id) { return new Promise(resolve => blobs.push({ id, resolve })); } },
    chrome: { runtime: {}, storage: { local: {
      get(keys, cb) { reads.push(() => cb(Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, state[k]])) : { ...keys, ...state })); },
      set(update) { Object.assign(state, update); storageListeners.forEach(fn => fn(Object.fromEntries(Object.entries(update).map(([k,v]) => [k, { newValue:v }])), 'local')); }
    }, onChanged: { addListener: fn => storageListeners.push(fn) } } },
    setTimeout: (fn, ms) => timer(fn, ms, 'timeout'), clearTimeout: id => tasks.delete(id),
    setInterval: (fn, ms) => timer(fn, ms, 'interval'), clearInterval: id => tasks.delete(id),
    requestAnimationFrame: fn => timer(fn, 16, 'frame'), cancelAnimationFrame: id => tasks.delete(id)
  });
  vm.runInContext(fs.readFileSync('newtab/newtab-bootstrap.js', 'utf8'), context);
  function flush() { while (reads.length) reads.shift()(); }
  flush();
  return { tasks, blobs, revoked, fetches, state, document, elements, flush,
    get media() { return media; },
    emit(name) { (listeners[name] || []).forEach(fn => fn({})); flush(); },
    change(update) { Object.assign(state, update); storageListeners.forEach(fn => fn(Object.fromEntries(Object.entries(update).map(([k,v]) => [k, {newValue:v}])), 'local')); flush(); }
  };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('newest wallpaper wins and replacement releases video and URL', async () => {
  const h = harness();
  h.change({ activeWallpaperId: 'b' });
  h.blobs[1].resolve({ type: 'image/png' }); await settle();
  h.blobs[0].resolve({ type: 'video/mp4' }); await settle();
  assert.equal(h.media.length, 1); assert.equal(h.media[0].tag, 'img');
  h.change({ activeWallpaperId: 'a' }); h.blobs[2].resolve({type:'video/mp4'}); await settle();
  const video = h.media[0];
  h.change({ activeWallpaperId: 'b' }); h.blobs[3].resolve({type:'image/png'}); await settle();
  assert.equal(video.paused, true); assert.equal(video.released, true);
  assert.equal(h.revoked.length, 2);
});

test('hidden page stops display tasks and repeated resume does not duplicate them', async () => {
  const h = harness({ wallpaperMode: 'rotate', rotationIntervalMinutes: 30, showWidgetFocusTimer: true,
    focusTimerState: { mode: 'work', endTimestamp: Date.now() + 60000 } });
  h.blobs[0].resolve({type:'video/mp4'}); await settle();
  h.document.hidden = true; h.emit('visibilitychange');
  // Startup focus reclaim is a one-shot, not recurring display work.
  assert.equal([...h.tasks.values()].filter(t => t.type === 'interval' || t.type === 'frame' || t.ms > 50).length, 1);
  h.document.hidden = false; h.emit('visibilitychange');
  const count = h.tasks.size;
  h.emit('visibilitychange'); assert.equal(h.tasks.size, count);
  assert.equal([...h.tasks.values()].filter(t => t.ms > 60000).length, 1);
  h.emit('pagehide'); assert.equal(h.media.length, 0);
  h.emit('pageshow'); assert.equal(h.blobs.length, 2);
});

test('rotation survives unrelated updates and hidden settings cannot restart it', () => {
  const h = harness({wallpaperMode:'rotate', rotationIntervalMinutes:30});
  const rotation = [...h.tasks].find(([,t]) => t.ms === 1800000)[0];
  h.change({weatherSunrise:7}); assert.ok(h.tasks.has(rotation));
  h.document.hidden = true; h.emit('visibilitychange');
  h.change({rotationIntervalMinutes:10});
  assert.equal([...h.tasks.values()].some(t => t.ms >= 60000), false);
});

test('disabled clock and stopped focus do not create display timers', () => {
  const h = harness({showWidgetClock:false, showWidgetDate:false, showWidgetFocusTimer:true});
  assert.equal([...h.tasks.values()].some(t => t.ms >= 1000), false);
});

test('returning to the displayed wallpaper invalidates a pending replacement', async () => {
  const h = harness(); h.blobs[0].resolve({type:'video/mp4'}); await settle();
  const displayed = h.media[0];
  h.change({activeWallpaperId:'b'}); h.change({activeWallpaperId:'a'});
  h.blobs[1].resolve({type:'image/png'}); await settle();
  assert.equal(h.media[0], displayed);
});

test('schedule uses a boundary timer and restarts only on visibility', () => {
  const h = harness({wallpaperMode:'schedule', scheduleDayWallpaperId:'a', scheduleNightWallpaperId:'b'});
  assert.equal([...h.tasks.values()].filter(t=>t.ms>50).length,2); // clock and boundary
  h.document.hidden = true; h.emit('visibilitychange');
  h.change({scheduleDayStartHour:9});
  assert.equal([...h.tasks.values()].some(t=>t.ms>50),false);
  h.document.hidden = false; h.emit('visibilitychange');
  assert.equal([...h.tasks.values()].filter(t=>t.ms>50).length,2);
});

test('focus timestamp survives hiding and expiration reconciles on return', () => {
  const h = harness({showWidgetFocusTimer:true,focusTimerState:{mode:'work',endTimestamp:Date.now()+60000}});
  const timestamp = h.state.focusTimerState.endTimestamp;
  h.document.hidden = true; h.emit('visibilitychange');
  assert.equal(h.state.focusTimerState.endTimestamp,timestamp);
  h.change({focusTimerState:{mode:'work',endTimestamp:Date.now()-1000}});
  assert.equal(h.state.focusTimerState.mode,'work');
  h.document.hidden = false; h.emit('visibilitychange');
  assert.equal(h.state.focusTimerState.mode,'break');
  assert.equal([...h.tasks.values()].filter(t=>t.type==='interval').length,1);
  h.change({showWidgetFocusTimer:false});
  assert.equal([...h.tasks.values()].filter(t=>t.type==='interval').length,0);
});

test('weather honors a fresh matching cache and supersedes old requests', async () => {
  const h = harness({showWidgetWeather:true,weatherLocationMode:'manual',weatherManualLat:1,weatherManualLon:2,
    weatherCache:{fetchedAt:Date.now(),lat:1,lon:2,units:'f',locationMode:'manual',data:{current:{temperature_2m:72,weather_code:0}}}});
  assert.equal(h.fetches.length,0);
  h.change({weatherManualLat:3}); assert.equal(h.fetches.length,1);
  h.change({weatherManualLat:4}); assert.equal(h.fetches.length,2);
  assert.equal(h.fetches[0].options.signal.aborted,true);
  h.fetches[0].resolve({json:()=>Promise.resolve({current:{temperature_2m:99,weather_code:0}})});
  for(let i=0;i<5;i++) await settle();
  assert.equal(h.elements.get('weather-temp').textContent,'72°F');
  h.fetches[1].resolve({json:()=>Promise.resolve({current:{temperature_2m:65,weather_code:0}})});
  for(let i=0;i<5;i++) await settle();
  assert.equal(h.elements.get('weather-temp').textContent,'65°F');
});
