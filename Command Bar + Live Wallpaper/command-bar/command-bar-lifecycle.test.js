const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
function harness(reduced = false) {
  let cleared = 0, blurred = 0;
  const animations = [];
  function surface() { return { style: {}, animate(keyframes, options) {
    let resolve, reject;
    const animation = { keyframes, options, cancelled: false, finished: new Promise((a, b) => { resolve = a; reject = b; }),
      complete() { resolve(); }, cancel() { this.cancelled = true; reject(new Error("cancelled")); } };
    animations.push(animation); return animation;
  } }; }
  const timers = new Map();
  let nextTimer = 0;
  const ctx = vm.createContext({
    caretAura: { setActive() {}, dispose() {} },
    decorations: { setActive() {}, track() {}, sync() {} },
    isVisible: true, queryGeneration: 7, currentQueryToken: 7,
    searchDebounceTimer: null, suggestDebounceTimer: null, exitCleanupTimer: null,
    hostDocument: { timeline: {} }, openingMotionTimer: null, motionAnimations: [], motionGeneration: 0, openGeneration: 0, inputWrapper: surface(), resultsPanel: surface(),
    stylesReady: true, window: { matchMedia: () => ({ matches: reduced }) },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    backdrop: { ...surface(), inert: false, classList: { remove() {}, add() {} }, setAttribute() {}, removeAttribute() {},
      },
    frame: { contentWindow: { getComputedStyle() { return { transform: 'matrix(0.98, 0, 0, 0.98, 0, -4)', opacity: '0.6' }; }, DOMMatrixReadOnly: class { constructor() { this.a = 0.98; this.m42 = -4; } } }, style: {}, setAttribute() {}, removeAttribute() {} }, shadow: { activeElement: { blur() { blurred++; } } }, input: { value: 'query' },
    cancelResultMotion() {}, clearResultNodes() { cleared++; }, clearAutocomplete() {}, resetSessionCaches() {}, safeSendMessage() {},
  });
  vm.runInContext(source.slice(source.indexOf('  // Read before cancelling'), source.indexOf("  window.addEventListener('pagehide'")), ctx);
  return { ctx, timers, animations, get cleared() { return cleared; }, get blurred() { return blurred; },
    async complete() { for (const animation of animations) animation.complete(); await new Promise(resolve => setImmediate(resolve)); },
    flush() { for (const fn of [...timers.values()]) fn(); } };
}
test('dismissal invalidates responses and interaction but retains rows until exit', async () => {
  const h = harness(); h.ctx.hideOverlay();
  assert.equal(h.ctx.currentQueryToken, 8);
  assert.equal(h.ctx.isVisible, false);
  assert.equal(h.ctx.backdrop.inert, true);
  assert.equal(h.ctx.frame.inert, true);
  assert.equal(h.ctx.frame.style.pointerEvents, 'none');
  assert.equal(h.blurred, 1);
  assert.equal(h.cleared, 0);
  assert.equal(h.ctx.input.value, 'query');
  await h.complete(); assert.equal(h.ctx.input.value, ''); assert.equal(h.cleared, 1); assert.equal(h.timers.size, 0);
});
test('exit timeout clears rows when transitionend is unavailable', () => {
  const h = harness(); h.ctx.hideOverlay(); h.flush();
  assert.equal(h.cleared, 1); assert.equal(h.timers.size, 0);
});
test('reopening cancels cleanup and late exit events cannot clear new rows', () => {
  const h = harness(); h.ctx.hideOverlay(); h.ctx.prepareOpening(); h.ctx.isVisible = true;
  assert.equal(h.timers.size, 0); assert.equal(h.ctx.backdrop.inert, false);
  assert.equal(h.ctx.frame.inert, false);
  assert.equal(h.ctx.frame.style.pointerEvents, 'auto');
  h.ctx.animateOverlay(true);
  assert.ok(h.animations.slice(0, 3).every(a => a.cancelled));
  const before = h.cleared; h.flush(); assert.equal(h.cleared, before);
});
test('reduced motion dismisses and clears immediately', () => {
  const h = harness(true); h.ctx.hideOverlay();
  assert.equal(h.cleared, 1); assert.equal(h.timers.size, 0);
});

test('a dictionary response received during exit cannot restore dismissed results', () => {
  const h = harness(); let callback, renders = 0;
  h.ctx.safeSendMessage = (message, fn) => { if (message.type === 'FETCH_DEFINITION') callback = fn; };
  h.ctx.mergeActiveDefItem = () => { throw new Error('stale definition merged'); };
  h.ctx.renderResults = () => { renders++; };
  vm.runInContext(source.slice(source.indexOf('  function handleDictionaryLookup('), source.indexOf('  function mergeActiveDefItem(')), h.ctx);
  h.ctx.handleDictionaryLookup('calm', h.ctx.currentQueryToken);
  h.ctx.hideOverlay();
  callback({ definition: { status: 'success', word: 'calm', meanings: [] } });
  assert.equal(renders, 0); assert.equal(h.ctx.activeDefItem, null);
});

test('spring starts at captured state on reversal and settles exactly', () => {
  const h = harness(); h.ctx.hideOverlay(); h.ctx.prepareOpening(); h.ctx.isVisible = true; h.ctx.animateOverlay(true);
  const spring = h.animations[4];
  assert.equal(spring.options.delay, 0);
  assert.equal(spring.keyframes[0].opacity, 0.6);
  assert.match(spring.keyframes[0].transform, /-4px/);
  assert.equal(spring.keyframes.at(-1).transform, 'translateY(0) scale(1)');
  assert.equal(spring.keyframes.at(-1).opacity, 1);
});
test('fresh opening staggers surfaces and reduced motion creates no animations', () => {
  const h = harness(); h.ctx.animateOverlay(true);
  assert.equal(h.animations[1].options.duration, 320);
  assert.equal(h.animations[2].options.delay, 16);
  const reduced = harness(true); reduced.ctx.animateOverlay(true);
  assert.equal(reduced.animations.length, 0);
});

test('old animation completions cannot clear a rapidly reopened session', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    h.ctx.hideOverlay(); h.ctx.prepareOpening(); h.ctx.isVisible = true; h.ctx.animateOverlay(true);
  }
  h.ctx.input.value = 'new session';
  const cleared = h.cleared;
  await h.complete();
  assert.equal(h.cleared, cleared);
  assert.equal(h.ctx.input.value, 'new session');
  assert.equal(h.ctx.motionAnimations.length, 0);
  assert.equal(h.timers.size, 0);
});

function openingHarness() {
  const h = harness();
  const callbacks = []; let focused = 0, searches = 0;
  Object.assign(h.ctx, {
    isVisible: false, pendingInitialValue: null, isContextValid: () => true,
    enforceFocus() { focused++; }, requestAnimationFrame() {}, updateSearch() { searches++; },
    chrome: { runtime: {}, storage: { local: { get(keys, callback) { callbacks.push(callback); } } } },
    surfaceRoot: { dataset: {} }, CommandBarSearchEngines: undefined,
  });
  h.ctx.backdrop.classList.add = () => {};
  h.ctx.window.CommandBarIntent = { normalizeRoutingMode: () => 'legacy' };
  vm.runInContext(source.slice(source.indexOf('  function showOverlay()'), source.indexOf('  function toggleOverlay()')), h.ctx);
  return { ...h, callbacks, get focused() { return focused; }, get searches() { return searches; } };
}
test('opening appears and focuses without waiting for storage', () => {
  const h = openingHarness(); h.ctx.showOverlay();
  assert.equal(h.ctx.isVisible, true); assert.equal(h.focused, 1); assert.equal(h.searches, 1);
  h.ctx.input.value = 'keep typing'; h.callbacks[0]({});
  assert.equal(h.ctx.input.value, 'keep typing'); assert.equal(h.searches, 2);
});
test('late settings cannot reopen dismissed bars or overwrite a newer session', () => {
  const h = openingHarness(); h.ctx.showOverlay(); h.ctx.hideOverlay();
  h.callbacks[0]({commandBarDensity: 'compact'});
  assert.equal(h.ctx.isVisible, false); assert.equal(h.ctx.surfaceRoot.dataset.density, undefined);
  h.ctx.showOverlay(); h.callbacks[1]({commandBarDensity: 'comfortable'});
  h.callbacks[0]({commandBarDensity: 'compact'});
  assert.equal(h.ctx.surfaceRoot.dataset.density, 'comfortable');
});
test('storage and animation errors leave the palette visible and focused', () => {
  const h = openingHarness(); h.ctx.chrome.storage.local.get = () => { throw new Error('unavailable'); };
  h.ctx.resultsPanel.animate = () => { throw new Error('renderer'); };
  h.ctx.showOverlay();
  assert.equal(h.ctx.isVisible, true); assert.equal(h.focused, 1);
  assert.equal(h.ctx.motionAnimations.length, 0);
  assert.ok(h.animations.every(animation => animation.cancelled));
});
test('surface opacity eases continuously through the longer opening fade', () => {
  const h = harness(); h.ctx.animateOverlay(true);
  const frames = h.animations[1].keyframes;
  assert.ok(frames[20].opacity > 0 && frames[20].opacity < 1);
  assert.ok(frames.every((frame, i) => i === 0 || frame.opacity >= frames[i - 1].opacity));
  assert.equal(frames.at(-1).opacity, 1);
  assert.equal(h.animations[0].options.duration, 180);
});
test('stylesheet failure reveals a usable fallback and late load does not replay entrance', () => {
  const h = harness(); let focuses = 0;
  Object.assign(h.ctx, { stylesReady: false, styleLoadTimer: 2, container: {style:{}}, criticalStyle:{textContent:''},
    enforceFocus() { focuses++; } });
  vm.runInContext(source.slice(source.indexOf('  function finishStyleLoading('), source.indexOf('  linkTag.onload =')), h.ctx);
  h.ctx.finishStyleLoading(true);
  assert.equal(h.ctx.stylesReady, true); assert.equal(h.ctx.container.style.display, '');
  assert.match(h.ctx.criticalStyle.textContent, /\.modal-box/); assert.equal(focuses, 1);
  const count = h.animations.length; h.ctx.finishStyleLoading();
  assert.equal(h.animations.length, count); assert.equal(focuses, 1);
});

test('stalled opening is settled by watchdog with visible surfaces and no retained effects', async () => {
  const h = harness(); h.ctx.animateOverlay(true);
  assert.equal(h.timers.size, 1);
  assert.equal(h.animations[1].options.timeline, h.ctx.hostDocument.timeline);
  h.flush();
  assert.equal(h.ctx.inputWrapper.style.opacity, '1');
  assert.equal(h.ctx.resultsPanel.style.opacity, '1');
  assert.equal(h.ctx.resultsPanel.style.transform, 'none');
  assert.equal(h.ctx.motionAnimations.length, 0); assert.equal(h.timers.size, 0);
  assert.ok(h.animations.every(animation => animation.cancelled));
  await h.complete(); assert.equal(h.cleared, 0);
});
test('unexpected opening animation cancellation recovers instead of leaving an invisible bar', async () => {
  const h = harness(); h.ctx.animateOverlay(true); h.animations[1].cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.ctx.resultsPanel.style.opacity, '1');
  assert.equal(h.ctx.motionAnimations.length, 0); assert.equal(h.timers.size, 0);
});
test('old opening watchdog cannot settle or reveal a dismissed or newer session', () => {
  const h = harness(); h.ctx.animateOverlay(true);
  const old = [...h.timers.values()][0]; h.ctx.hideOverlay(); old();
  assert.equal(h.ctx.isVisible, false); assert.equal(h.ctx.resultsPanel.style.opacity, undefined);
  h.ctx.prepareOpening(); h.ctx.isVisible = true; h.ctx.animateOverlay(true);
  const count = h.ctx.motionAnimations.length; old();
  assert.equal(h.ctx.motionAnimations.length, count);
});
