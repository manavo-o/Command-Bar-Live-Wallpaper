const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(require.resolve('./command-bar-bootstrap.js'), 'utf8');
function setup() {
  const listeners = {};
  const executions = [];
  const searches = [];
  const updates = [];
  const input = {
    value: '', selectionStart: 0, selectionEnd: 0,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const context = vm.createContext({
    window: { CommandBarIntent: require('./query-intent') },
    input, URL, autocompleteActive: false, typedQuery: '', completionText: '', completionSource: 'none',
    completionState: 'inactive', completionTarget: null, autocompleteSuffixSelected: false,
    cancelledCompletionQuery: null, lastAcceptedTypedQuery: '', lastEditWasDeletion: false,
    explicitSelection: false, isKeyboardNav: false, selectedIndex: 0, currentResults: [],
    executeResult(item) { executions.push(item); },
    executeSearch(query, event) { searches.push({ query, shiftKey: event.shiftKey }); },
    executeSelected() { executions.push(context.currentResults[context.selectedIndex]); },
    updateSearch() {
      if (!context.autocompleteActive) context.typedQuery = input.value;
      updates.push({ query: input.value, suppressed: context.lastEditWasDeletion || context.completionBlocked(input.value) });
    },
    moveSelection() {}, renderResults() {}, hideOverlay() {}
  });
  vm.runInContext(source.slice(source.indexOf('  function websiteCompletion('), source.indexOf('  function fetchUnifiedMatches')), context);
  vm.runInContext(source.slice(source.indexOf('  function clearAutocomplete('), source.indexOf('  function usageBoost(')), context);
  vm.runInContext(source.slice(source.indexOf("  input.addEventListener('input'"), source.indexOf("  backdrop.addEventListener('click'")), context);
  function event(type, values) {
    const e = { stopPropagation() {}, preventDefault() { this.defaultPrevented = true; }, ...values };
    listeners[type](e);
    return e;
  }
  function complete(type = 'SUGGESTION') {
    const item = type === 'SUGGESTION'
      ? { type, data: { query: 'weather tomorrow' } }
      : { type, title: 'Weather', data: { url: 'https://weather.example/forecast' } };
    input.value = 'wea';
    context.typedQuery = 'wea';
    context.currentResults = [item];
    context.applyAutocomplete('wea', item, type === 'SUGGESTION' ? 'web' : 'local');
    return item;
  }
  return { context, input, event, complete, executions, searches, updates };
}

test('Enter commits the highlighted completion target, including web suggestions', () => {
  for (const type of ['SUGGESTION', 'TAB', 'HISTORY', 'BOOKMARK']) {
    const h = setup();
    const item = h.complete(type);
    assert.equal(h.context.autocompleteActive, true);
    h.event('keydown', { key: 'Enter' });
    assert.equal(h.executions[0], item);
    assert.equal(h.searches.length, 0, 'must not search the uncompleted prefix');
  }
});

test('Shift+Enter still searches the typed prefix instead of accepting autocomplete', () => {
  const h = setup();
  h.complete();
  h.event('keydown', { key: 'Enter', shiftKey: true });
  assert.equal(h.searches[0].query, 'wea');
  assert.equal(h.searches[0].shiftKey, true);
  assert.equal(h.executions.length, 0);
});

test('Backspace/Delete dismiss the selected suffix and Enter uses the remaining text', () => {
  for (const key of ['Backspace', 'Delete']) {
    const h = setup();
    h.complete();
    const e = h.event('keydown', { key });
    assert.equal(e.defaultPrevented, true);
    assert.equal(h.input.value, 'wea');
    assert.equal(h.input.selectionStart, h.input.selectionEnd);
    assert.equal(h.context.autocompleteActive, false);
    assert.equal(h.updates.at(-1).suppressed, true);
    assert.equal(h.context.completionBlocked('wea'), true);
    h.event('keydown', { key: 'Enter' });
    assert.equal(h.searches[0].query, 'wea');
    assert.equal(h.executions.length, 0);
  }
});

test('continued deletion stays suppressed; inserting text enables completion again', () => {
  const h = setup();
  h.complete();
  h.event('keydown', { key: 'Backspace' });
  for (const value of ['we', 'w']) {
    h.event('keydown', { key: 'Backspace' });
    h.input.value = value;
    h.event('input', { inputType: 'deleteContentBackward' });
    assert.equal(h.updates.at(-1).suppressed, true);
  }
  h.input.value = 'we';
  h.event('input', { inputType: 'insertText' });
  assert.equal(h.updates.at(-1).suppressed, false);
});

test('input deletion without a keydown (such as mobile editing) also suppresses completion', () => {
  const h = setup();
  h.complete();
  h.input.value = 'we';
  h.event('input', { inputType: 'deleteContentBackward' });
  assert.equal(h.context.autocompleteActive, false);
  assert.equal(h.updates.at(-1).suppressed, true);
});

test('empty cancelled prefix does not fall back to the previous typed query', () => {
  const h = setup();
  h.complete();
  h.context.cancelAutocomplete('');
  assert.equal(h.context.cancelledCompletionQuery, '');
});


test('the first matching website completes its link despite similarly ranked websites', () => {
  const h = setup();
  const first = { type: 'HISTORY', title: 'Chat', data: { url: 'https://www.chatgpt.com/' }, score: 100 };
  const second = { type: 'BOOKMARK', title: 'Chat', data: { url: 'https://chat.example/' }, score: 99 };
  assert.equal(h.context.pickConfidentTop('cha', [first, second]), first);
  h.context.applyAutocomplete('cha', first, 'local');
  assert.equal(h.input.value, 'chatgpt.com/');
  assert.equal(h.input.selectionStart, 3);
  h.event('keydown', { key: 'Enter' });
  assert.equal(h.executions[0].data.url, 'https://www.chatgpt.com/');
});

test('a title-only match does not displace a website address completion', () => {
  const h = setup();
  const titleMatch = { type: 'HISTORY', title: 'Google news article', data: { url: 'https://news.example/article' }, score: 300 };
  const link = { type: 'HISTORY', title: 'Search', data: { url: 'https://google.com/' }, score: 200 };
  assert.equal(h.context.pickConfidentTop('goo', [titleMatch, link]), link);
  assert.equal(h.context.pickConfidentTop('no match', [titleMatch, link]), null);
});

test('URL completions preserve paths, fragments, schemes and www when typed', () => {
  const h = setup();
  const item = { data: { url: 'https://www.example.com/docs#intro' } };
  for (const prefix of ['exa', 'www.exa', 'https://www.exa', 'example.com/docs#i']) {
    const result = h.context.websiteCompletion(prefix, item);
    assert.ok(result.startsWith(prefix));
    assert.ok(result.endsWith('/docs#intro'));
  }
});

test('Enter opens the default website even when its address is already fully typed', () => {
  const h = setup();
  const item = { type: 'HISTORY', autocompleted: true, data: { url: 'https://example.com/' } };
  h.context.currentResults = [item];
  h.input.value = 'example.com/';
  h.context.applyAutocomplete(h.input.value, item, 'local');
  assert.equal(h.context.autocompleteActive, false);
  h.event('keydown', { key: 'Enter' });
  assert.equal(h.executions[0], item);
});
