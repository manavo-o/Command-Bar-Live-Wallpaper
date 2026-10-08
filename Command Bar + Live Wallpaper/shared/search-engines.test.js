const assert = require('assert');
const engines = require('./search-engines.js');

assert.strictEqual(engines.buildUrl('https://example.com/search?q={query}', 'a space & café'), 'https://example.com/search?q=a%20space%20%26%20caf%C3%A9');
assert.strictEqual(engines.buildUrl('https://example.com/search?q=', 'hello'), 'https://example.com/search?q=hello');
assert.strictEqual(engines.buildUrl('https://example.com/search?q=%s', 'hello world'), 'https://example.com/search?q=hello%20world');
assert.strictEqual(engines.buildUrl('https://example.com/search?q={query', 'hello'), 'https://example.com/search?q=hello');
assert.throws(() => engines.buildUrl('javascript:alert({query})', 'x'), /HTTP or HTTPS/);
assert.strictEqual(engines.normalizeShortcut(' Shift + Enter '), 'shift+enter');
assert.strictEqual(engines.normalizeShortcut('ctrl+k'), '');

const list = engines.sanitizeEngines([
  { id: 'one', name: 'One', url: 'https://one.test/?q={query}', shortcut: 'shift+enter' },
  { id: 'duplicate', name: 'Duplicate', url: 'https://two.test/?q=', shortcut: 'shift+enter' },
  { id: 'two', name: 'Two', url: 'https://two.test/?q=', shortcut: 'ctrl+enter', enabled: false }
]);
assert.strictEqual(list.length, 2);
assert.strictEqual(engines.findByShortcut(list, 'shift').id, 'one');
assert.strictEqual(engines.findByShortcut(list, 'ctrl'), null);
console.log('search engine tests passed');
