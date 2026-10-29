const test = require('node:test');
const assert = require('node:assert/strict');
const { destinationKey, merge } = require('./command-bar-results');
const item = (type, url, score, extra = {}) => ({ type, title: type, score, data: { url, ...extra }, badges: [type] });
test('destination identity normalizes URL syntax while preserving distinct routes', () => {
  assert.equal(destinationKey('HTTPS://EXAMPLE.COM:443'), destinationKey('https://example.com/'));
  for (const url of ['http://example.com/a', 'https://www.example.com/a', 'https://example.com/A', 'https://example.com/a/', 'https://example.com/a?q=1', 'https://example.com/a#one']) {
    assert.notEqual(destinationKey(url), destinationKey('https://example.com/a'), url);
  }
  assert.notEqual(destinationKey('https://example.com/?a=1&b=2'), destinationKey('https://example.com/?b=2&a=1'));
  assert.equal(destinationKey('chrome://settings/'), 'chrome://settings/');
});
test('repeated tabs and cross-source hits keep one destination and all metadata without score inflation', () => {
  const rows = merge([
    item('TAB', 'https://example.com', 10, { id: 2, windowId: 1, active: false, lastAccessed: 100, favIconUrl: 'https://example.com/icon.svg' }),
    item('TAB', 'https://example.com/', 15, { id: 3, windowId: 2, active: true, lastAccessed: 10 }),
    item('HISTORY', 'https://example.com/', 80), item('BOOKMARK', 'https://example.com/', 100)
  ]);
  assert.equal(rows.length, 1); const row = rows[0];
  assert.equal(row.type, 'TAB'); assert.equal(row.tab.id, 3); assert.equal(row.data.id, 3);
  assert.equal(row.title, 'BOOKMARK'); assert.equal(row.score, 100);
  assert.equal(row.icon, 'https://example.com/icon.svg');
  assert.deepEqual(row.badges.sort(), ['BOOKMARK', 'HISTORY', 'TAB']);
  assert.equal(row.tabs.length, 2);
});
test('tab selection is deterministic and scoped rows retain their source', () => {
  const tabs = [item('TAB', 'https://example.com/', 90, { id: 8, lastAccessed: 9 }), item('TAB', 'https://example.com/', 90, { id: 2, lastAccessed: 9 })];
  const scoped = merge([item('BOOKMARK', 'https://example.com/', 1), ...tabs], 'BOOKMARK')[0];
  assert.equal(scoped.type, 'BOOKMARK'); assert.equal(scoped.title, 'BOOKMARK'); assert.equal(scoped.tab.id, 2);
  assert.equal(merge(tabs.slice().reverse())[0].tab.id, 2);
});
test('empty URL records are ignored; non-destination actions remain independent', () => {
  assert.deepEqual(merge([item('TAB', '', 1)]), []);
  assert.equal(merge([{ type: 'SEARCH', data: { query: 'x' } }, { type: 'ACTION', data: { id: 'x' } }]).length, 2);
});
