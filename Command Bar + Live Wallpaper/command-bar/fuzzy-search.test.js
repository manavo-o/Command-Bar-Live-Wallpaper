const assert = require('assert');
const search = require('./fuzzy-search.js');

function score(query, item, source) {
  return search.calculateCompositeScore(query, Object.assign({}, item, { source }), { source });
}

const repeatedHistory = score('docs', {
  title: 'Google Docs', url: 'https://docs.google.com/document/u/0/', visitCount: 80, typedCount: 12
}, 'HISTORY');
const bookmark = score('docs', {
  title: 'Google Docs', url: 'https://docs.google.com/document/u/0/'
}, 'BOOKMARK');
const recentTab = score('docs', {
  title: 'Google Docs', url: 'https://docs.google.com/document/u/0/', active: true
}, 'TAB');

assert(repeatedHistory > bookmark, 'durable history should outrank an equivalent bookmark');
assert(repeatedHistory > recentTab, 'durable history should outrank an equivalent tab');

const typed = score('youtube', {
  title: 'YouTube', url: 'https://youtube.com', visitCount: 3, typedCount: 4
}, 'HISTORY');
const merelyVisited = score('youtube', {
  title: 'YouTube', url: 'https://youtube.com', visitCount: 20, typedCount: 0
}, 'HISTORY');
assert(typed > merelyVisited, 'typed history should receive a strong boost');

assert.strictEqual(search.fuzzyScore('docs', 'Google Docs'), 96);
console.log('fuzzy search tests passed');
