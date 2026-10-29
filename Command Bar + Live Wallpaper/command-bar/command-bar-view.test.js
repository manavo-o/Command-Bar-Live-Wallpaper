const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
function harness() {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = []; w.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  w.eval(fs.readFileSync('command-bar/command-bar-view.bundle.js', 'utf8'));
  const shadow = w.document.body.attachShadow({ mode: 'open' });
  let selected, cardRenders = 0;
  const view = w.CommandBarView.mount(shadow, {
    key: item => item.key,
    positions: () => [0, 1],
    icon: () => 'data:image/png;base64,aA==', fallback: () => 'fallback.svg',
    select(index) { selected = index; },
    renderCard(node, item) { cardRenders++; node.textContent = item.data.value; }
  });
  const row = (key, title = key) => ({ key, title, type: 'TAB', data: {} });
  return { dom, w, shadow, view, row, errors, get selected() { return selected; }, get cardRenders() { return cardRenders; } };
}
test('React keeps the input, focus, autocomplete range, and stable rows during asynchronous view updates', () => {
  const h = harness(), { view } = h;
  const input = view.refs.input;
  assert.equal(h.shadow.querySelector('.caret-glow'), null);
  view.update({ items: [h.row('one'), h.row('two')], query: 'on', selectedIndex: 0 });
  const first = view.rows.get('one');
  input.focus(); input.value = 'github.com'; input.setSelectionRange(3, 10);
  view.update({ items: [h.row('two'), h.row('one', 'new title')], selectedIndex: 1 });
  assert.equal(view.refs.input, input); assert.equal(h.shadow.activeElement, input);
  assert.equal(input.value, 'github.com'); assert.equal(input.selectionStart, 3); assert.equal(input.selectionEnd, 10);
  assert.equal(view.rows.get('one'), first); assert.equal(first.getAttribute('aria-selected'), 'true');
  view.rows.get('two').click(); assert.equal(h.selected, 0);
  view.dispose(); h.dom.window.close();
});
test('React escapes result content, updates icons without rebuilding rows, and falls back on image errors', () => {
  const h = harness(); const item = h.row('safe', '<img onerror="alert(1)">');
  h.view.update({ items: [item], query: 'im' });
  const row = h.view.rows.get('safe'), image = row.querySelector('img');
  assert.equal(row.querySelectorAll('img').length, 1);
  assert.ok(row.textContent.includes(item.title));
  assert.equal(row.querySelectorAll('mark').length, 1);
  h.view.updateIcon('safe', 'data:image/png;base64,bA==');
  assert.equal(h.view.rows.get('safe'), row);
  assert.equal(image.getAttribute('src'), 'data:image/png;base64,bA==');
  image.dispatchEvent(new h.w.Event('error')); assert.equal(image.getAttribute('src'), 'fallback.svg');
  h.view.dispose(); h.dom.window.close();
});
test('isolated cards rerender on data changes, selection updates preserve their contents, and disposal releases every row', () => {
  const h = harness();
  const card = { key: 'math', type: 'CALC', data: { value: '42' } };
  h.view.update({ items: [card] });
  const node = h.view.rows.get('math'); assert.equal(node.textContent, '42');
  h.view.update({ selectedIndex: 1 }); assert.equal(h.cardRenders, 1); assert.equal(node.textContent, '42');
  h.view.update({ items: [{ ...card, data: { value: '43' } }] }); assert.equal(node.textContent, '43');
  h.view.clear(); assert.equal(h.view.rows.size, 0); assert.equal(node.textContent, '');
  h.view.update({ items: [], empty: true }); assert.ok(h.shadow.querySelector('.empty-state'));
  assert.deepEqual(h.errors, []);
  h.view.dispose(); h.view.dispose(); assert.equal(h.shadow.children.length, 0); h.dom.window.close();
});
test('answer mode unifies the enclosure, exposes other results on request, and preserves the input through clearing', async () => {
  const h = harness();
  const input = h.view.refs.input;
  const card = { key: 'math', type: 'CALC', data: { value: '2' } };
  h.view.update({ items: [card, h.row('other')], selectedIndex: 0 });
  assert.equal(h.view.refs.modalBox.dataset.answer, 'true');
  assert.equal(h.view.refs.modalBox.dataset.expanded, 'false');
  h.shadow.querySelector('.answer-results-toggle').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.view.refs.modalBox.dataset.expanded, 'true');
  h.shadow.querySelector('.answer-copy').click(); assert.equal(h.selected, 0);
  h.view.clear(); assert.equal(h.view.refs.input, input);
  h.view.update({ items: [h.row('other')], selectedIndex: 0 });
  assert.equal(h.view.refs.modalBox.dataset.answer, undefined);
  assert.deepEqual(h.errors, []); h.view.dispose(); h.dom.window.close();
});
test('compact dictionary preview keeps full content and Dictionary action inside an accessible disclosure', () => {
  const h = harness(); h.w.eval(fs.readFileSync('overlay-card.js', 'utf8'));
  const root = h.w.document.createElement('div'); let opened;
  h.w.OverlayCard.renderInlineCard(root, { type: 'DEF', data: {
    word: 'hello', phonetic: '/hello/', status: 'success', meanings: [{ partOfSpeech: 'exclamation', definitions: [{definition:'A greeting.'},{definition:'Another sense.'}] }]
  } }, { compact: true, onOpenAppleDict(word) { opened = word; } });
  assert.equal(root.querySelector('.dict-preview-definition').textContent, 'A greeting.');
  assert.ok(root.querySelector('details').textContent.includes('Another sense.'));
  root.querySelector('.apple-dict-btn').click(); assert.equal(opened, 'hello');
  h.view.dispose(); h.dom.window.close();
});
