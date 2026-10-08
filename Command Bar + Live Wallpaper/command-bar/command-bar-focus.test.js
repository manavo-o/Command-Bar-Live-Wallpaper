const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
function keyboardHarness() {
  const hostHandlers = {}, frameHandlers = {};
  let closes = 0, toggles = 0;
  const ctx = vm.createContext({
    window: { addEventListener(type, fn) { hostHandlers[type] = fn; } },
    frame: { contentWindow: { addEventListener(type, fn) { frameHandlers[type] = fn; } } },
    isVisible: true, activeShortcut: null, isNewTab: false,
    hideOverlay() { closes++; }, toggleOverlay() { toggles++; }
  });
  vm.runInContext(source.slice(source.indexOf('  [window, frame.contentWindow].forEach'), source.indexOf('  function clearAutocomplete(')), ctx);
  function event(key, modifiers = {}) {
    return { key, ...modifiers, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; } };
  }
  return { ctx, hostHandlers, frameHandlers, event, get closes() { return closes; }, get toggles() { return toggles; } };
}
test('palette frame keeps dismissal and toggle shortcuts without cancelling native typing', () => {
  const h = keyboardHarness();
  const typed = h.event('a'); h.frameHandlers.keydown(typed);
  assert.equal(typed.prevented, false); assert.equal(typed.stopped, false);
  const escape = h.event('Escape'); h.frameHandlers.keydown(escape);
  assert.equal(h.closes, 1); assert.equal(escape.prevented, true);
  h.frameHandlers.keydown(h.event('t', { metaKey: true }));
  h.hostHandlers.keydown(h.event('t', { metaKey: true }));
  assert.equal(h.toggles, 2);
});
test('ordinary page typing is unchanged while the palette is closed', () => {
  const h = keyboardHarness(); h.ctx.isVisible = false;
  const typed = h.event('a'); h.hostHandlers.keydown(typed);
  assert.equal(typed.prevented, false); assert.equal(typed.stopped, false);
});
test('copy title and URL uses the host page title rather than the frame document', () => {
  let copied;
  const ctx = vm.createContext({
    isSelectable: () => true, recordActionUsage() {}, hideOverlay() {},
    navigator: { clipboard: { writeText(text) { copied = text; return Promise.resolve(); } } },
    window: { location: { href: 'https://example.com/page' } },
    hostDocument: { title: 'Original page title' }, document: { title: '' }
  });
  vm.runInContext(source.slice(source.indexOf('  function executeResult('), source.indexOf('  function executeSelected(')), ctx);
  ctx.executeResult({ type: 'ACTION', data: { id: 'copy-title-url' } });
  assert.equal(copied, 'Original page title\nhttps://example.com/page');
});
