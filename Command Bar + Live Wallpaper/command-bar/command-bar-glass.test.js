const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createDecorations } = require('./ui/glass-coordinator');
function harness() {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const w = dom.window, doc = w.document;
  const host = doc.createElement('div'); doc.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const frame = doc.createElement('iframe'); doc.body.append(frame);
  const inner = frame.contentWindow, idoc = frame.contentDocument;
  const refs = {};
  for (const name of ['backdrop', 'inputWrapper', 'resultsPanel', 'caretGlow']) refs[name] = idoc.createElement('div');
  refs.input = idoc.createElement('input');
  idoc.body.append(refs.backdrop, refs.inputWrapper, refs.resultsPanel);
  refs.inputWrapper.append(refs.input, refs.caretGlow);
  shadow.append(frame);
  // Moving a frame between DOM trees replaces its document in JSDOM; use the
  // retained browsing context explicitly for this geometry unit harness.
  const frameProxy = { contentWindow: inner, contentDocument: idoc };
  shadow.replaceChildren();
  const anchor = doc.createElement('div'); shadow.append(anchor);
  const frames = new Map(); let sequence = 0, now = 0, connected = false;
  const listeners = {};
  inner.ResizeObserver = class { observe() { connected = true; } disconnect() { connected = false; } };
  inner.getComputedStyle = element => element === refs.input ? {font:'22px sans-serif',letterSpacing:'0px',fontSize:'22px'} : element === refs.inputWrapper ?
    { opacity: '0.5', visibility: 'visible', borderRadius: '999px', paddingTop: '22px' } : { opacity: '0.8', visibility: 'visible', borderRadius: '28px' };
  refs.inputWrapper.getBoundingClientRect = () => ({ left: 100, top: 40, width: 740, height: 80 });
  refs.resultsPanel.getBoundingClientRect = () => ({ left: 100, top: 132, width: 740, height: 300 });
  Object.defineProperties(refs.input, { offsetLeft: {value:28}, offsetHeight:{value:30}, clientWidth:{value:680} });
  const win = { performance: { now: () => now }, requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); }, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener(name) { delete listeners[name]; } };
  // insertBefore needs a real DOM anchor while the coordinator reads the proxy.
  const hostShadow = { insertBefore(node) { shadow.insertBefore(node, anchor); } };
  const decorations = createDecorations({ hostDocument: doc, hostShadow, frame: frameProxy, refs, window: win });
  function advance(time) { now = time; for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } }
  return { dom, inner, refs, shadow, frames, decorations, advance, listeners, get connected() { return connected; } };
}
test('glass follows painted bounds, radius and combined opacity, then stops sampling after transitions', () => {
  const h = harness(); h.decorations.setActive(true); h.decorations.track(450);
  const input = h.shadow.querySelector('.glass-input'), results = h.shadow.querySelector('.glass-results');
  assert.equal(input.style.left, '100px'); assert.equal(input.style.borderRadius, '999px'); assert.equal(input.style.opacity, '0.4');
  assert.equal(results.style.height, '300px');
  h.refs.resultsPanel.getBoundingClientRect = () => ({ left: 100, top: 132, width: 740, height: 210 });
  h.advance(200); assert.equal(results.style.height, '210px');
  h.advance(500); assert.equal(h.frames.size, 0); assert.equal(h.connected, true);
  h.decorations.setActive(false); assert.equal(h.connected, false); assert.equal(h.frames.size, 0);
  assert.equal(h.shadow.querySelector('.glass-stage').style.display, 'none');
  h.decorations.dispose(); h.dom.window.close();
});
test('pagehide cancels work and restoration can reactivate the same surfaces', () => {
  const h = harness(); h.decorations.setActive(true); h.listeners.pagehide();
  assert.equal(h.frames.size, 0); assert.equal(h.connected, false);
  h.decorations.setActive(true); assert.equal(h.connected, true);
  assert.equal(h.shadow.querySelectorAll('.glass-stage').length, 1);
  h.decorations.dispose(); h.dom.window.close();
});
test('focused answer mode uses one glass enclosure and restores the separate results surface for search', () => {
  const h = harness(); h.refs.modalBox = { dataset: { answer: 'true' } };
  h.refs.resultsPanel.getBoundingClientRect = () => ({ left: 100, top: 120, bottom: 300, width: 740, height: 180 });
  h.decorations.setActive(true);
  const input = h.shadow.querySelector('.glass-input'), results = h.shadow.querySelector('.glass-results');
  assert.equal(input.style.height, '260px'); assert.equal(input.style.borderRadius, '40px'); assert.equal(results.hidden, true);
  h.refs.modalBox.dataset.answer = ''; h.decorations.sync();
  assert.equal(input.style.height, '80px'); assert.equal(results.hidden, false);
  h.decorations.dispose(); h.dom.window.close();
});
test('empty AI results hide their glass surface; visibility changes pause the ripple state', () => {
  const h = harness(); h.refs.resultsPanel.hidden = true; h.decorations.setActive(true);
  assert.equal(h.shadow.querySelector('.glass-results').hidden, true);
  assert.equal(h.refs.backdrop.dataset.pageHidden, 'false');
  Object.defineProperty(h.dom.window.document, 'hidden', { value:true, configurable:true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  assert.equal(h.refs.backdrop.dataset.pageHidden, 'true');
  h.refs.resultsPanel.hidden = false; h.decorations.sync();
  assert.equal(h.shadow.querySelector('.glass-results').hidden, false);
  h.decorations.setActive(false); assert.equal(h.refs.backdrop.dataset.pageHidden, 'true');
  h.decorations.dispose(); h.dom.window.close();
});
