const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, mount } = require('./widget-dashboard');
function harness(settings = {}) {
  const handlers = new Map(), frames = new Map(), storageListeners = new Set(); let next = 0, captured = false;
  function target() { return {
    addEventListener(name, fn) { handlers.set(this.name + ':' + name, fn); },
    removeEventListener(name) { handlers.delete(this.name + ':' + name); }
  }; }
  const classes = new Set();
  const dashboard = Object.assign(target(), { name: 'dashboard', offsetWidth: 560, offsetHeight: 420, dataset: {}, style: {}, hidden: true,
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) } });
  const handle = Object.assign(target(), { name: 'handle', focus() {}, hasPointerCapture: () => captured,
    setPointerCapture() { captured = true; }, releasePointerCapture() { captured = false; fire('handle', 'lostpointercapture'); } });
  const status = { textContent: '' }, state = Object.assign({ storageSchemaVersion: 5 }, settings), writes = [];
  const document = Object.assign(target(), { name: 'document', hidden: false, getElementById: id => id === 'widget-dashboard' ? dashboard : id === 'dashboard-handle' ? handle : status });
  const window = Object.assign(target(), { name: 'window', innerWidth: 1200, innerHeight: 900,
    matchMedia: () => ({ matches: true }), requestAnimationFrame(fn) { frames.set(++next, fn); return next; }, cancelAnimationFrame(id) { frames.delete(id); } });
  const chrome = { runtime: {}, storage: {
    local: { get(defaults, cb) { cb(Object.assign({}, defaults, state)); }, set(values, cb) {
      writes.push(values); Object.assign(state, values);
      storageListeners.forEach(fn => fn(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local')); cb && cb();
    } }, onChanged: { addListener: fn => storageListeners.add(fn), removeListener: fn => storageListeners.delete(fn) }
  } };
  const dispose = mount(document, window, chrome);
  function fire(name, event, extra = {}) { handlers.get(name + ':' + event)?.({ preventDefault() {}, ...extra }); }
  return { dashboard, handle, status, state, writes, window, frames, handlers, storageListeners, dispose, fire,
    change(values) { Object.assign(state, values); storageListeners.forEach(fn => fn(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, {newValue}])), 'local')); } };
}
test('bounds keep the handle reachable with invalid, old, and narrow-window positions', () => {
  assert.deepEqual(clamp({left: 9999, top: -2}, 560, 420, 1200, 900), {left:608, top:32});
  assert.deepEqual(clamp(null, 280, 200, 320, 400), {left:16, top:16});
  assert.deepEqual(clamp({left:NaN, top:Infinity}, 560, 420, 1200, 900), {left:32, top:32});
});
test('old position is retained on first migration; disabling all widgets hides the whole dashboard', () => {
  const h = harness({storageSchemaVersion:4, widgetPos:{left:100, top:80}});
  assert.equal(h.dashboard.style.transform, 'translate3d(100px, 80px, 0)');
  h.change({showWidgetClock:false, showWidgetDate:false}); assert.equal(h.dashboard.hidden, true);
  h.change({showWidgetWeather:true}); assert.equal(h.dashboard.hidden, false);
  assert.equal(h.dashboard.dataset.weather, 'true'); h.dispose();
});
test('keyboard movement commits on Enter and Escape rolls back without writing', () => {
  const h = harness();
  h.fire('handle', 'keydown', {key:'ArrowRight'}); h.fire('handle', 'keydown', {key:'ArrowDown', shiftKey:true});
  assert.equal(h.dashboard.style.transform, 'translate3d(40px, 64px, 0)');
  h.fire('handle', 'keydown', {key:'Escape'}); assert.equal(h.writes.length, 0);
  assert.equal(h.dashboard.style.transform, 'translate3d(32px, 32px, 0)');
  h.fire('handle', 'keydown', {key:'ArrowRight'}); h.fire('handle', 'keydown', {key:'Enter'});
  assert.deepEqual(h.state.dashboardPos, {left:40, top:32}); h.dispose();
});
test('drag respects grab offset, commits once, and pointer cancellation restores origin', () => {
  const h = harness();
  h.fire('handle','pointerdown',{button:0,pointerId:1,clientX:50,clientY:50});
  h.fire('handle','pointermove',{pointerId:1,clientX:90,clientY:74});
  assert.equal(h.dashboard.style.transform,'translate3d(72px, 56px, 0)');
  h.fire('handle','pointerup',{pointerId:1}); assert.equal(h.writes.length,1);
  assert.deepEqual(h.state.dashboardPos,{left:72,top:56});
  h.fire('handle','pointerdown',{button:0,pointerId:2,clientX:90,clientY:74});
  h.fire('handle','pointermove',{pointerId:2,clientX:190,clientY:174});
  h.fire('handle','pointercancel',{pointerId:2});
  assert.equal(h.dashboard.style.transform,'translate3d(72px, 56px, 0)'); assert.equal(h.writes.length,1);
  h.dispose();
});
test('reset and resize clamp immediately; pagehide cancels work and disposal releases listeners', () => {
  const h = harness({dashboardPos:{left:300,top:200}});
  h.change({dashboardPos:null}); assert.equal(h.dashboard.style.transform,'translate3d(32px, 32px, 0)');
  h.window.innerWidth=620; h.dashboard.offsetWidth=588;
  h.fire('window','resize'); assert.equal(h.dashboard.style.transform,'translate3d(16px, 32px, 0)');
  h.fire('window','pagehide'); assert.equal(h.frames.size,0);
  h.fire('window','pageshow'); h.fire('window','pageshow');
  h.dispose(); assert.equal(h.handlers.size,0); assert.equal(h.storageListeners.size,0);
});
test('spring can be interrupted at its painted position and suspension stops it', () => {
  const h = harness(); h.window.matchMedia = () => ({matches:false});
  h.fire('handle','pointerdown',{button:0,pointerId:1,clientX:0,clientY:0});
  h.fire('handle','pointermove',{pointerId:1,clientX:35,clientY:35});
  h.fire('handle','pointerup',{pointerId:1}); assert.equal(h.frames.size,1);
  const [id, step] = h.frames.entries().next().value; h.frames.delete(id); step(16);
  const painted = h.dashboard.style.transform;
  h.fire('handle','pointerdown',{button:0,pointerId:2,clientX:100,clientY:100});
  assert.equal(h.frames.size,0); assert.equal(h.dashboard.style.transform,painted);
  h.fire('window','pagehide'); assert.equal(h.frames.size,0); h.dispose();
});
