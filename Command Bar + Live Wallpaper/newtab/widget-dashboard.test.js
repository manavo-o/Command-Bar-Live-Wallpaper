const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {mount} = require('./widget-dashboard');
const layout = require('../shared/widget-layout');
function harness(initial = {}, reduced = true, delayRead = false) {
  const dom = new JSDOM(fs.readFileSync('newtab.html','utf8'), {url:'https://extension.test/newtab.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w = dom.window, d = w.document, changes = new Set(), writes = [], effects = [], sizes = {clock:130,weather:130,focus:240,quote:130};
  w.eval(fs.readFileSync('shared/widget-cards.js','utf8'));
  w.matchMedia = () => ({matches:reduced,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w,'innerWidth',{value:1200,writable:true}); Object.defineProperty(w,'innerHeight',{value:900,writable:true});
  const cards = {clock:d.getElementById('widgets-container'),weather:d.getElementById('widget-weather'),focus:d.getElementById('widget-focus'),quote:d.getElementById('widget-quote')};
  for (const [id,e] of Object.entries(cards)) {
    Object.defineProperty(e,'offsetWidth',{get:()=>320}); Object.defineProperty(e,'offsetHeight',{get:()=>sizes[id]});
    e.animate = () => { let resolve; const a = {cancelled:false,finished:new Promise(r=>resolve=r),cancel(){this.cancelled=true;resolve();}}; effects.push(a);return a; };
  }
  const captured = new Set();
  w.HTMLElement.prototype.setPointerCapture = id => captured.add(id);
  w.HTMLElement.prototype.hasPointerCapture = id => captured.has(id);
  w.HTMLElement.prototype.releasePointerCapture = id => captured.delete(id);
  let initialRead = null;
  const state = {...initial}, chrome = {runtime:{},storage:{local:{get(defaults,cb){const snapshot={...defaults,...state}; if(delayRead) initialRead=()=>cb(snapshot);else cb(snapshot);},set(update,cb){
    writes.push(update); if (!chrome.runtime.lastError) {Object.assign(state,update); notify(update);} cb?.();
  }},onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
  function notify(update) {changes.forEach(fn=>fn(Object.fromEntries(Object.entries(update).map(([key,newValue])=>[key,{newValue}])),'local'));}
  const dispose = mount(d,w,chrome);
  const click = id => d.getElementById(id).click();
  const edit = () => { w.history.replaceState(null,'','#edit-layout'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); };
  const key = (id,name,shift=false) => cards[id].querySelector('button').dispatchEvent(new w.KeyboardEvent('keydown',{key:name,shiftKey:shift,bubbles:true,cancelable:true}));
  function pointer(id,type,x,y) { const e = new w.Event(type,{bubbles:true,cancelable:true}); Object.assign(e,{pointerId:1,button:0,clientX:x,clientY:y}); cards[id].querySelector('button').dispatchEvent(e); }
  return {w,d,cards,edit,state,writes,chrome,effects,changes,sizes,click,key,pointer,dispose,update(values){Object.assign(state,values);notify(values);},flushRead(){initialRead?.();initialRead=null;},close(){dispose();dom.window.close();}};
}
test('normalized positions round trip, reject malformed profiles and snap to nearby card edges',()=>{
  const p = {left:410,top:220}; assert.deepEqual(layout.decode(layout.encode(p,320,130,1200,900),320,130,1200,900),p);
  assert.equal(layout.sanitize({cards:{clock:{x:NaN,y:1}}}),null);
  assert.deepEqual(layout.sanitize({cards:{clock:{x:9,y:-1},unknown:{x:1,y:1}}}),{version:1,cards:{clock:{x:1,y:0}}});
  const snapped = layout.snap({left:355,top:182},320,130,1200,900,[{left:32,top:32,width:320,height:130}]);
  assert.equal(snapped.left,352); assert.equal(snapped.guideX,352);
  assert.deepEqual(layout.clamp({left:99999,top:-1},320,130,1200,900),{left:848,top:32});
});
test('keyboard edits remain draft until Done, and Cancel restores the committed arrangement',()=>{
  const h=harness(); h.edit(); const initial=h.cards.clock.style.left;
  h.key('clock','ArrowRight');h.key('clock','ArrowDown',true);assert.equal(h.writes.length,0);
  h.click('layout-cancel');assert.equal(h.cards.clock.style.left,initial);assert.equal(h.writes.length,0);
  h.edit();h.key('clock','ArrowRight');h.click('layout-done');
  assert.equal(h.writes.length,1);assert.equal(h.state.widgetLayout.version,1);
  const saved=h.cards.clock.style.left;h.edit();h.key('clock','ArrowRight');h.key('clock','Escape');
  assert.equal(h.cards.clock.style.left,saved);h.close();
});
test('drag snaps, pointer cancellation rolls back, overlap is allowed and reset remains a draft',()=>{
  const h=harness({showWidgetWeather:true});h.edit();
  const left=h.cards.clock.style.left;h.pointer('clock','pointerdown',40,40);h.pointer('clock','pointermove',100,100);
  assert.notEqual(h.cards.clock.style.left,left);h.pointer('clock','pointercancel',100,100);assert.equal(h.cards.clock.style.left,left);
  h.pointer('weather','pointerdown',40,190);h.pointer('weather','pointermove',40,40);h.pointer('weather','pointerup',40,40);
  assert.equal(h.writes.length,0);assert.equal(h.cards.weather.style.zIndex,'2');
  h.click('layout-done');const saved=JSON.stringify(h.state.widgetLayout);
  h.edit();h.click('layout-reset');assert.equal(JSON.stringify(h.state.widgetLayout),saved);
  h.click('layout-cancel');assert.equal(JSON.stringify(h.state.widgetLayout),saved);h.close();
});
test('narrow view, disabling widgets and resize do not overwrite saved positions',()=>{
  const saved={version:1,cards:{clock:{x:.8,y:.8},weather:{x:.4,y:.4}}};const h=harness({widgetLayout:saved,showWidgetWeather:true});
  h.w.innerWidth=390;h.w.dispatchEvent(new h.w.Event('resize'));h.edit();h.key('clock','ArrowRight');h.click('layout-done');
  assert.deepEqual(h.state.widgetLayout,saved);
  h.update({showWidgetClock:false,showWidgetDate:false,showWidgetWeather:false});assert.equal(h.d.getElementById('widget-dashboard').hidden,true);
  h.update({showWidgetClock:true});assert.equal(h.cards.clock.hidden,false);
  h.w.innerWidth=1200;h.w.dispatchEvent(new h.w.Event('resize'));assert.equal(h.cards.clock.style.left,'684.8000000000001px');h.close();
});
test('failed saving keeps editor open; hide cancels drag and motion; disposal removes storage listener',()=>{
  const h=harness({},false);h.edit();h.key('clock','ArrowRight');h.chrome.runtime.lastError={message:'quota'};h.click('layout-done');
  assert.equal(h.d.getElementById('layout-edit-controls').hidden,false);assert.match(h.d.getElementById('dashboard-move-status').textContent,/could not/);
  h.chrome.runtime.lastError=null;
  h.pointer('clock','pointerdown',40,40);h.pointer('clock','pointermove',80,80);h.w.dispatchEvent(new h.w.Event('pagehide'));
  assert.equal(h.cards.clock.classList.contains('is-dragging'),false);assert.ok(h.effects.every(a=>a.cancelled));
  h.close();assert.equal(h.changes.size,0);
});
test('legacy placement migrates after measurement and reopened pages keep independent layout',async()=>{
  const h=harness({dashboardPos:{left:120,top:80},showWidgetWeather:true});
  h.sizes.weather=164; // Data/stylesheet sizing settles before the migration frame.
  await new Promise(resolve=>h.w.requestAnimationFrame(resolve));
  assert.equal(h.cards.clock.style.left,'120px');assert.ok(h.state.widgetLayout.cards.weather);assert.equal(h.writes.length,1);
  assert.ok(Math.abs(layout.decode(h.state.widgetLayout.cards.weather,320,164,1200,900).top-226)<.001);
  const reopened=harness(h.state);assert.equal(reopened.cards.clock.style.left,'120px');assert.equal(reopened.writes.length,0);h.close();reopened.close();
});

test('schema 7 explicit layout reset cannot resurrect a retained legacy dashboard position',()=>{
  const h=harness({storageSchemaVersion:7,widgetLayout:null,dashboardPos:{left:500,top:300}});
  assert.equal(h.cards.clock.style.left,'32px');assert.equal(h.writes.length,0);h.close();
});

test('late initial reads retain newer layout and visibility without discarding untouched settings',()=>{
  const h=harness({showWidgetWeather:true},true,true);
  const newer={version:1,cards:{clock:{x:.5,y:.5}}};h.update({widgetLayout:newer,showWidgetDate:false});h.flushRead();
  assert.equal(h.cards.weather.hidden,false);assert.equal(h.cards.clock.style.left,'440px');
  h.update({showWidgetClock:false});assert.equal(h.cards.clock.hidden,true);h.close();
});

test('ordinary home has no navigation buttons or editor UI; Options hash opens and exits accessibly',()=>{
  const h=harness();
  assert.equal(h.d.getElementById('layout-edit'),null);
  assert.equal(h.d.querySelector('.layout-toolbar a'),null);
  assert.equal(h.d.querySelector('.layout-toolbar').hidden,true);
  assert.ok([...h.d.querySelectorAll('.widget-editor-controls')].every(node=>node.hidden));
  h.edit(); assert.equal(h.d.querySelector('.layout-toolbar').hidden,false);
  h.click('layout-cancel'); assert.equal(h.w.location.hash,'');
  assert.equal(h.d.activeElement,h.d.getElementById('widget-dashboard')); h.close();
});
test('center and locks are draft changes, locks block all movement and resets retain locked positions',()=>{
  const h=harness({showWidgetWeather:true}); h.edit();
  h.cards.clock.querySelector('.widget-center').click();
  assert.equal(h.cards.clock.style.left,'440px'); assert.equal(h.cards.clock.style.top,'385px');
  h.cards.clock.querySelector('.widget-lock').click();
  h.key('clock','ArrowRight'); h.pointer('clock','pointerdown',0,0); h.pointer('clock','pointermove',80,80);
  assert.equal(h.cards.clock.style.left,'440px');
  h.click('layout-reset'); assert.equal(h.cards.clock.style.left,'440px');
  assert.equal(h.writes.length,0); h.click('layout-done');
  assert.equal(h.state.widgetLocks.clock,true); assert.equal(h.w.location.hash,'');
  h.edit(); h.cards.clock.querySelector('.widget-lock').click();h.key('clock','ArrowRight');h.key('clock','Escape');
  assert.equal(h.cards.clock.style.left,'440px');assert.equal(h.state.widgetLocks.clock,true);
  h.edit(); assert.equal(h.cards.clock.querySelector('.widget-handle').disabled,true);
  h.cards.clock.querySelector('.widget-lock').click(); h.key('clock','ArrowRight'); h.click('layout-done');
  assert.equal(h.state.widgetLocks.clock,false);assert.equal(h.cards.clock.style.left,'448px');h.close();
});
test('failed lock save retains draft and retry saves both position and lock',()=>{
  const h=harness();h.edit();h.cards.clock.querySelector('.widget-center').click();h.cards.clock.querySelector('.widget-lock').click();
  h.chrome.runtime.lastError={message:'quota'};h.click('layout-done');
  assert.equal(h.state.widgetLocks,undefined);assert.equal(h.d.querySelector('.layout-toolbar').hidden,false);
  assert.equal(h.cards.clock.querySelector('.widget-lock').getAttribute('aria-pressed'),'true');
  h.chrome.runtime.lastError=null;h.click('layout-done');
  assert.equal(h.state.widgetLocks.clock,true);assert.equal(h.state.widgetLayout.cards.clock.x,.5);h.close();
});
test('appearance updates preserve live nodes, locked positions and state; cross-tab locks cancel a drag',()=>{
  const h=harness({widgetLocks:{clock:true},widgetLayout:{version:1,cards:{clock:{x:.5,y:.5}}}});
  const content=h.cards.clock.querySelector('#widget-clock');content.textContent='12:34';
  h.update({widgetAppearance:{clock:{variant:'analog',size:'large',surface:'none',accent:'mint'}}});
  assert.equal(h.cards.clock.dataset.variant,'analog');assert.equal(h.cards.clock.dataset.material,'none');
  assert.equal(h.cards.clock.querySelector('#widget-clock'),content);assert.equal(content.textContent,'12:34');assert.equal(h.writes.length,0);
  h.update({widgetLocks:{clock:false}});h.edit();h.pointer('clock','pointerdown',10,10);h.pointer('clock','pointermove',50,50);
  h.update({widgetLocks:{clock:true}});assert.equal(h.cards.clock.classList.contains('is-dragging'),false);
  assert.equal(h.cards.clock.querySelector('.widget-handle').disabled,true);h.close();
});
test('narrow editing disables center and move but permits locks without replacing desktop coordinates',()=>{
  const saved={version:1,cards:{clock:{x:.7,y:.8}}};const h=harness({widgetLayout:saved});
  h.w.innerWidth=390;h.w.dispatchEvent(new h.w.Event('resize'));h.edit();
  assert.equal(h.cards.clock.querySelector('.widget-center').disabled,true);
  h.cards.clock.querySelector('.widget-lock').click();h.click('layout-done');
  assert.deepEqual(h.state.widgetLayout,saved);assert.equal(h.state.widgetLocks.clock,true);h.close();
});
test('viewport midpoint snapping and settings reset preserve only locked cards',()=>{
  const snapped=layout.snap({left:443,top:387},320,130,1200,900,[]);
  assert.equal(snapped.left,440);assert.equal(snapped.top,385);assert.equal(snapped.guideX,600);assert.equal(snapped.guideY,450);
  const value={version:1,cards:{clock:{x:.7,y:.8},weather:{x:.3,y:.4}}};
  assert.deepEqual(layout.resetUnlocked(value,{clock:true}),{version:1,cards:{clock:{x:.7,y:.8}}});
  assert.equal(layout.resetUnlocked(value,{}),null);
});
test('saving another widget after viewport clamping does not overwrite locked coordinates',()=>{
  const saved={version:1,cards:{clock:{x:.85,y:.9},weather:{x:.1,y:.1}}};
  const h=harness({widgetLayout:saved,widgetLocks:{clock:true},showWidgetWeather:true});
  h.w.innerHeight=250;h.w.dispatchEvent(new h.w.Event('resize'));h.edit();
  h.key('weather','ArrowRight');h.click('layout-done');
  assert.deepEqual(h.state.widgetLayout.cards.clock,saved.cards.clock);h.close();
});
