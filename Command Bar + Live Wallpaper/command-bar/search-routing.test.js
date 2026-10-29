const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const intent = require('./query-intent');
const engines = require('../shared/search-engines');
const source = fs.readFileSync(require.resolve('./command-bar-bootstrap.js'), 'utf8');
const routing = source.slice(source.indexOf('  function customSearchForEvent'), source.indexOf('  function renderAiResults'));
const messages = [];
const context = {
  URL, window: { CommandBarIntent: intent }, CommandBarSearchEngines: engines,
  customSearchEngines: [{ id: 'legacy', name: 'Legacy', url: 'https://legacy.test/?q=', shortcut: 'shift+enter' }, { id: 'custom', name: 'Custom', url: 'https://custom.test/?q=', shortcut: 'ctrl+enter' }],
  searchRoutingMode: 'balanced', recordCommandUsage() {}, hideOverlay() {},
  safeSendMessage(message) { messages.push(message); }
};
vm.createContext(context);
vm.runInContext(routing, context);
function submit(query, event = {}) {
  messages.length = 0;
  context.executeSearch(query, { key: 'Enter', ...event });
  return messages[0];
}
assert.equal(submit('write an email').type, 'SEARCH_QUERY');
assert.equal(submit('coffee & café').url, 'https://www.google.com/search?q=coffee%20%26%20caf%C3%A9');
for (const mode of ['balanced', 'prefer-ai']) {
  context.searchRoutingMode = mode;
  assert.equal(submit('write an email', { shiftKey: true }).url, 'https://www.google.com/search?q=write%20an%20email');
  assert.equal(submit('hello', { ctrlKey: true }).url, 'https://custom.test/?q=hello');
  assert.equal(submit('hello', { shiftKey: true, ctrlKey: true }).url, 'https://www.google.com/search?q=hello');
}
assert.equal(submit('coffee').type, 'SEARCH_QUERY');
assert.equal(submit('  '), undefined);
// Exercise the Enter handler before it delegates to selected/local results.
const enter = source.slice(source.indexOf("      if (e.shiftKey) {", source.indexOf("} else if (e.key === 'Enter')")), source.indexOf("    } else if (e.key === 'Escape')"));
context.input = { value: 'selected local query' };
context.typedQuery = 'typed query';
context.autocompleteActive = true;
context.autocompleteSuffixSelected = true;
context.e = { key: 'Enter', shiftKey: true };
messages.length = 0;
vm.runInContext('(function () {' + enter + '\n})()', context);
assert.equal(messages[0].url, 'https://www.google.com/search?q=typed%20query');
context.autocompleteActive = false;
messages.length = 0;
vm.runInContext('(function () {' + enter + '\n})()', context);
assert.equal(messages[0].url, 'https://www.google.com/search?q=selected%20local%20query');

// Every command-bar entrypoint must load the routing helper first.
const newtab = fs.readFileSync(require.resolve('../newtab.html'), 'utf8');
const intentScript = newtab.indexOf('src="command-bar/query-intent.js"');
const bootstrapScript = newtab.indexOf('src="command-bar/command-bar-bootstrap.js"');
assert.ok(intentScript >= 0 && intentScript < bootstrapScript, 'New-tab page loads intent helper before command bar');
const background = fs.readFileSync(require.resolve('../background/background-bootstrap.js'), 'utf8');
assert.ok(background.indexOf("'command-bar/query-intent.js'") < background.indexOf("'command-bar/command-bar-bootstrap.js'"), 'Injected command bar loads intent helper first');

// Plain Enter commits the displayed math/dictionary card without arrow navigation.
context.e = { key: 'Enter' };
context.autocompleteActive = false;
context.explicitSelection = false;
let executed;
context.executeResult = item => { executed = item; };
for (const type of ['CALC', 'DEF', 'AI']) {
  context.currentResults = [{ type }];
  executed = null;
  vm.runInContext('(function () {' + enter + '\n})()', context);
  assert.equal(executed.type, type);
}

for (const mode of ['balanced', 'prefer-ai']) {
  context.searchRoutingMode = mode;
  for (const [query, url] of [['gmail.com','https://gmail.com/'], ['https://example.com/a?q=1#b','https://example.com/a?q=1#b'], ['localhost:3000','https://localhost:3000/']]) {
    assert.equal(submit(query).url, url);
    assert.equal(submit(query).visitKind, 'typed');
    assert.ok(submit(query, {shiftKey:true}).url.startsWith('https://www.google.com/search?'));
    assert.ok(submit(query, {ctrlKey:true}).url.startsWith('https://custom.test/'));
  }
}
