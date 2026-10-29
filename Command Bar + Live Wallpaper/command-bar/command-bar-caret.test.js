const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createCaretAura } = require('./ui/caret-aura');
function harness(supported = true) {
  const dom = new JSDOM('<body><div><input><span></span><span></span></div></body>', { pretendToBeVisual: true });
  const w = dom.window, doc = w.document, wrapper = doc.querySelector('div'), input = doc.querySelector('input');
  const refs = { inputWrapper: wrapper, input, caretAura: doc.querySelectorAll('span')[0], caretMirror: doc.querySelectorAll('span')[1] };
  const reduced = new w.EventTarget(), contrast = new w.EventTarget(); reduced.matches = contrast.matches = false;
  w.CSS = { supports: () => supported };
  w.getComputedStyle = () => ({ font: '22px sans-serif', fontSize: '22px', letterSpacing: '0px' });
  const frames = new Map(), animations = []; let sequence = 0;
  const timeline = { currentTime: 100 };
  const host = { matchMedia: query => query.includes('motion') ? reduced : contrast,
    requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const animate = (keyframes, options) => { const effect = { keyframes, options, finished: new Promise(() => {}), cancel() { this.cancelled = true; } }; animations.push(effect); return effect; };
  input.animate = refs.caretAura.animate = animate;
  Object.defineProperties(input, { offsetLeft: {value:28}, offsetTop:{value:22}, offsetHeight:{value:30}, clientWidth:{value:400} });
  Object.defineProperty(wrapper, 'offsetWidth', {value:500}); wrapper.getBoundingClientRect = () => ({ width:500 });
  refs.caretMirror.getBoundingClientRect = () => ({ width:28 });
  const aura = createCaretAura({ refs, frame: { contentWindow:w, contentDocument:doc }, hostWindow:host, hostDocument:{timeline} });
  function flush() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } }
  input.focus(); input.value = 'hello'; input.setSelectionRange(2,2);
  return { dom, w, refs, aura, animations, frames, timeline, reduced, contrast, flush };
}
test('glowing caret works without manual-blink support; edits restart blinking and idle sync preserves it', () => {
  const h = harness(false);
  const blink = { currentTime: 500 }; h.refs.caretAura.getAnimations = () => [blink];
  h.aura.setActive(true); h.flush();
  assert.equal(blink.currentTime, 0); blink.currentTime = 300;
  assert.equal(h.refs.caretAura.hidden, false);
  assert.equal(h.refs.caretAura.style.left, '56px');
  assert.equal(h.refs.input.style.caretColor, 'transparent');
  h.aura.sync(); assert.equal(blink.currentTime, 300); assert.equal(h.animations.length, 0); assert.equal(h.frames.size, 0);
  h.refs.input.scrollLeft = 12; h.aura.sync(); assert.equal(h.refs.caretAura.style.left, '44px'); assert.equal(blink.currentTime, 0);
  h.reduced.matches = true; h.aura.sync(); assert.equal(h.refs.caretAura.hidden, false);
  h.aura.dispose(); assert.equal(h.refs.input.style.caretColor, ''); h.dom.window.close();
});
test('selection, composition, blur, contrast, hidden state and teardown restore the native caret', () => {
  const h = harness(); h.aura.setActive(true); h.flush();
  h.refs.input.dispatchEvent(new h.w.Event('compositionstart')); assert.equal(h.refs.caretAura.hidden, true);
  h.refs.input.dispatchEvent(new h.w.Event('compositionend')); h.flush(); assert.equal(h.refs.caretAura.hidden, false);
  h.refs.input.setSelectionRange(1,4); h.aura.sync(); assert.equal(h.refs.caretAura.hidden, true);
  assert.equal(h.refs.input.style.caretColor, '');
  h.refs.input.setSelectionRange(2,2); h.aura.sync();
  h.contrast.matches = true; h.contrast.dispatchEvent(new h.w.Event('change'));
  assert.equal(h.refs.caretAura.hidden, true); assert.equal(h.refs.input.style.caretColor, '');
  h.contrast.matches = false; h.aura.sync();
  h.refs.input.blur(); assert.equal(h.refs.caretAura.hidden, true);
  h.refs.input.focus(); h.flush();
  Object.defineProperty(h.w.document, 'hidden', { value:true, configurable:true });
  h.w.document.dispatchEvent(new h.w.Event('visibilitychange')); assert.equal(h.refs.caretAura.hidden, true);
  h.aura.setActive(false); assert.equal(h.frames.size, 0); assert.equal(h.refs.input.style.caretColor, '');
  h.aura.dispose(); h.refs.input.dispatchEvent(new h.w.Event('input')); assert.equal(h.frames.size,0); h.dom.window.close();
});
test('measurement failure and high contrast leave an ordinary native caret', () => {
  const h = harness();
  h.refs.caretMirror.getBoundingClientRect = () => { throw new Error('layout'); };
  h.aura.setActive(true); h.flush(); assert.equal(h.refs.caretAura.hidden, true);
  assert.equal(h.refs.input.style.caretColor, '');
  h.aura.dispose(); h.dom.window.close();
});
