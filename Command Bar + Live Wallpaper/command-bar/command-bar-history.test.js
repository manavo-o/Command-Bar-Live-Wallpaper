const assert = require('assert');
const history = require('./command-bar-history.js');

const now = 2_000_000;
const items = [
  { id: '1', title: 'Example', url: 'https://www.example.com/a#one', visitCount: 2, lastVisitTime: now - 10, frecency: 1 },
  { id: '2', title: 'Example newer', url: 'https://www.example.com/a#two', visitCount: 5, lastVisitTime: now - 1, frecency: 2 },
  { id: '3', title: 'Other', url: 'https://other.test/x', visitCount: 1, lastVisitTime: now - 100, frecency: 1 }
];

assert.strictEqual(history.normalizeUrl(items[0].url), 'https://example.com/a');
assert.strictEqual(history.dedupeHistory(items, 'example').length, 2);
assert.deepStrictEqual(history.groupHistory(items, 'example').filter((x) => x.type === 'HISTORY_GROUP').map((x) => x.group), ['example.com', 'other.test']);
assert.strictEqual(history.relativeTime(now - 60 * 60 * 1000, now), '1h ago');
assert(history.usageBoost('example', { type: 'HISTORY', data: items[0] }, {
  example: { ['HISTORY:' + history.normalizeUrl(items[0].url)]: { count: 1, lastUsed: Date.now() } }
}) > 0);
console.log('command-bar-history tests passed');
