const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
function harness(reduced = false) {
  const animations = [], timers = new Map();
  let nextTimer = 0;
  function surface() {
    return { style: {}, animate(frames, options) {
      let complete, reject;
      const animation = { frames, options, cancelled: false,
        finished: new Promise((a, b) => { complete = a; reject = b; }),
        complete() { complete(); }, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
      animations.push(animation); return animation;
    } };
  }
  const panel = surface(); panel.naturalHeight = 200;
  Object.defineProperty(panel, 'offsetHeight', { get() { return panel.naturalHeight; } });
  const highlight = surface(); highlight.hidden = true;
  const row = top => ({ offsetTop: top, offsetLeft: 12, offsetWidth: 700, offsetHeight: 68,
    getAttribute() { return 'true'; } });
  const ctx = vm.createContext({ resultAnimations: new Map(), hasRenderedResults: false, highlightReady: false,
    isVisible: true, stylesReady: true, selectedIndex: 0, resultsPanel: panel, selectionHighlight: highlight,
    resultsList: { children: [row(12), row(80)], offsetTop: 0, offsetLeft: 0 },
    caretAura: { setActive() {}, dispose() {} },
    decorations: { setActive() {}, dispose() {} }, view: { dispose() {} },
    window: { matchMedia: () => ({ matches: reduced }) }, hostDocument: { timeline: {} },
    frame: { contentWindow: { getComputedStyle(node) { return { top: '12px', left: '12px', width: '700px', height: '68px', ...node.style, ...node.painted }; } } },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); }
  });
  ctx.currentResults = [{key:'one'}, {key:'two'}];
  ctx.getItemKey = item => item.key;
  ctx.rowNodeMap = new Map(ctx.currentResults.map((item, index) => [item.key, ctx.resultsList.children[index]]));
  vm.runInContext(source.slice(source.indexOf('  function stopResultAnimation('), source.indexOf("  resultsContainer.addEventListener('scroll'")), ctx);
  return { ctx, panel, highlight, animations, timers,
    async settle() { await new Promise(resolve => setImmediate(resolve)); } };
}
test('selection retargets from its painted position and stale completion cannot cancel new motion', async () => {
  const h = harness(); h.ctx.updateSelectionHighlight();
  assert.equal(h.animations.length, 0);
  h.ctx.selectedIndex = 1; h.ctx.updateSelectionHighlight();
  const old = h.animations[0];
  h.highlight.painted = { top: '42px', height: '75px' };
  h.ctx.selectedIndex = 0; h.ctx.updateSelectionHighlight();
  const latest = h.animations[1];
  assert.equal(latest.frames[0].top, '42px'); assert.equal(latest.frames[0].height, '75px');
  assert.equal(latest.frames[1].top, '12px'); assert.equal(old.cancelled, true);
  await h.settle(); assert.equal(latest.cancelled, false);
  latest.complete(); await h.settle(); assert.equal(h.ctx.resultAnimations.size, 0); assert.equal(h.timers.size, 0);
});
test('panel retargets interrupted height to new natural size without transforming content', async () => {
  const h = harness(); h.ctx.finishResultRender(0, []);
  h.panel.naturalHeight = 400; h.ctx.finishResultRender(200, []);
  const first = h.animations[0];
  h.panel.naturalHeight = 260; h.ctx.finishResultRender(315, []);
  const next = h.animations[1];
  assert.equal(first.cancelled, true);
  assert.equal(next.frames[0].height, '315px'); assert.equal(next.frames[1].height, '260px');
  assert.equal(next.frames[0].transform, undefined); assert.equal(next.options.duration, 200);
  assert.equal(next.options.timeline, h.ctx.hostDocument.timeline);
  await h.settle(); assert.equal(next.cancelled, false);
});
test('navigation does not replay row fades and cleanup removes every effect and watchdog', async () => {
  const h = harness(); const row = { style: {}, animate: h.panel.animate };
  h.ctx.finishResultRender(200, [row]);
  assert.equal(h.animations[0].options.duration, 100);
  h.ctx.finishResultRender(200, []); assert.equal(h.animations.length, 1);
  h.ctx.selectedIndex = 1; h.ctx.updateSelectionHighlight();
  h.panel.naturalHeight = 300; h.ctx.finishResultRender(200, []);
  h.ctx.cancelResultMotion(true); await h.settle();
  assert.ok(h.animations.every(a => a.cancelled)); assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.resultAnimations.size, 0); assert.equal(h.highlight.hidden, true);
  assert.equal(h.panel.style.height, ''); assert.equal(h.ctx.hasRenderedResults, false);
});
test('reduced motion and renderer failures leave final layout and highlight usable', () => {
  for (const reduced of [true, false]) {
    const h = harness(reduced);
    if (!reduced) { h.panel.animate = h.highlight.animate = () => { throw new Error('renderer'); }; }
    h.ctx.finishResultRender(200, []); h.panel.naturalHeight = 350;
    h.ctx.selectedIndex = 1; h.ctx.finishResultRender(200, []);
    assert.equal(h.animations.length, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.highlight.style.top, '80px'); assert.equal(h.highlight.hidden, false);
    assert.equal(h.panel.style.height, '');
  }
});
test('watchdog releases stalled result animations and missing selection hides highlight', async () => {
  const h = harness(); h.ctx.finishResultRender(200, []);
  h.ctx.selectedIndex = 1; h.ctx.updateSelectionHighlight();
  for (const callback of [...h.timers.values()]) callback();
  await h.settle(); assert.equal(h.ctx.resultAnimations.size, 0); assert.equal(h.timers.size, 0);
  h.ctx.selectedIndex = 99; h.ctx.updateSelectionHighlight();
  assert.equal(h.highlight.hidden, true); assert.equal(h.ctx.highlightReady, false);
});

test('pagehide invokes result cleanup and resets decoration alongside entrance effects', async () => {
  const h = harness(); h.ctx.finishResultRender(200, []);
  h.ctx.selectedIndex = 1; h.ctx.updateSelectionHighlight();
  Object.assign(h.ctx, { openingMotionTimer: null, motionGeneration: 0, motionAnimations: [], exitCleanupTimer: null });
  h.ctx.window.addEventListener = (event, callback) => { if (event === 'pagehide') h.ctx.pagehide = callback; };
  vm.runInContext(source.slice(source.indexOf("  window.addEventListener('pagehide'"), source.indexOf('  function resetSessionCaches')), h.ctx);
  h.ctx.pagehide({ persisted: true }); await h.settle();
  assert.equal(h.ctx.resultAnimations.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.highlight.hidden, true); assert.equal(h.ctx.highlightReady, false);
});
