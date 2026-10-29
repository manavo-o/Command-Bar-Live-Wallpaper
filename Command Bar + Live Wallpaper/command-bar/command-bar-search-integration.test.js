const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
const results = require('./command-bar-results');
const history = require('./command-bar-history');
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness(query = '', datasets = {}) {
  const tabs = datasets.tabs || [{id:1,url:'https://example.com/',title:'Example',windowId:3}, {id:2,url:'https://example.com/',title:'Example copy',windowId:3}];
  let renders = 0;
  const context = vm.createContext({ URL, Promise, Set, Map,
    window: {CommandBarResults: results, CommandBarHistory: history, OverlaySearch:{ calculateCompositeScore: () => 80 }},
    getTabsCached: () => Promise.resolve(tabs), getHistoryCached: () => Promise.resolve(datasets.history || []), getBookmarksCached: () => Promise.resolve(datasets.bookmarks || []),
    safeSendMessage(req, cb) { cb({history: datasets.history || [], bookmarks: datasets.bookmarks || []}); },
    renderResults() { renders++; }, clearAutocomplete() {}, mergeActiveDefItem() {}, pickConfidentTop: () => null,
    completionBlocked: () => false, usageBoost: () => 0, currentQueryToken: 1, typedQuery: query, resultLimit: 6, MAX_MATCH_RESULTS: 6, SEARCH_ACTION_SCORE: 50,
    searchAllWindowsByDefault: true, commandBarUsage: {}, currentResults: [], selectedIndex:0, autocompleteEnabled:false, suggestionsEnabled:false
  });
  vm.runInContext(source.slice(source.indexOf('  function fetchHistoryScope'), source.indexOf('  // Prefer the first ranked address prefix')), context);
  vm.runInContext(source.slice(source.indexOf('  function fetchUnifiedMatches'),source.indexOf('  function fetchSuggestions')),context);
  return { context, get renders() {return renders;} };
}
test('empty-query integration deduplicates repeated tabs without needing a typed search', async () => {
  const h = harness(); h.context.fetchUnifiedMatches('', true); await settle();
  assert.equal(h.context.currentResults.length,1); assert.equal(h.context.currentResults[0].tabs.length,2); assert.equal(h.renders,1);
});
test('unified results deduplicate before the limit, retain badges, and keep distinct fragments', async () => {
  const h = harness('example', {history:[{url:'https://example.com/', title:'History match'}, {url:'https://example.com/#route',title:'Route'}],bookmarks:[{url:'https://example.com/',title:'Bookmark match'}]});
  h.context.fetchUnifiedMatches('example',true); await settle();
  const rows = h.context.currentResults.filter(item=>item.type !== 'SEARCH'); assert.equal(rows.length,2);
  const main = rows.find(item=>item.data.url==='https://example.com/');
  assert.equal(main.type,'TAB'); assert.deepEqual(Array.from(main.badges).sort(),['BOOKMARK','HISTORY','TAB']); assert.equal(main.allWindows,true);
});
test('scoped bookmarks deduplicate independently; scoped history counts preserve unique fragment routes', async () => {
  const h = harness('example',{bookmarks:[{id:1,url:'https://example.com/'},{id:2,url:'https://example.com/'}],history:[{url:'https://example.com/'},{url:'https://example.com/'},{url:'https://example.com/#route'}]});
  h.context.fetchBookmarksScope('example'); await settle();
  assert.equal(h.context.currentResults.length,1); assert.equal(h.context.currentResults[0].type,'BOOKMARK'); assert.equal(h.context.currentResults[0].tab.id,1);
  h.context.fetchHistoryScope('example'); await settle();
  assert.equal(h.context.currentResults.length,3); assert.equal(h.context.currentResults[0].count,2);
  assert.equal(h.context.currentResults.filter(item=>item.type==='HISTORY').length,2);
});
test('late query responses cannot replace newer results', async () => {
  const h = harness('example'); h.context.fetchUnifiedMatches('example',true); h.context.currentQueryToken=2; await settle();
  assert.equal(h.renders,0); assert.equal(h.context.currentResults.length,0);
});
test('icons reject stale replies and pass safe fallback to the React view', () => {
  let callback;
  const item = {type:'HISTORY',data:{url:'https://example.com/'},destinationKey:'https://example.com/'};
  const image = {style:{},getAttribute(){return '';}};
  const row = {refs:{icon:image}};
  const ctx = vm.createContext({encodeURIComponent, currentQueryToken:1, currentResults:[item], isVisible:true,
    getItemKey:item=>item.destinationKey, rowNodeMap:new Map([[item.destinationKey,row]]), resultsContainer:{},
    view: { updateIcon(key, src) { image.src = src; } },
    safeSendMessage(req, cb) { callback=cb; }
  });
  vm.runInContext(source.slice(source.indexOf('  const resolvedIcons ='),source.indexOf('  function executeResult(')),ctx);
  ctx.resolveVisibleIcons(); ctx.currentQueryToken=2;
  callback({icons:[{key:item.destinationKey,src:'data:image/png;base64,aA=='}]});
  ctx.updateRowIcon(row,item); assert.ok(image.src.startsWith('data:image/svg+xml,'));
  assert.equal(ctx.resolvedIcons?.size || 0, 0);
});

test('website defaults survive close ranking and become plain search after Backspace', async () => {
  const h = harness('cha', { tabs: [], history: [
    { url: 'https://chatgpt.com/', title: 'ChatGPT' },
    { url: 'https://chat.example/', title: 'Chat' }
  ] });
  vm.runInContext(source.slice(source.indexOf('  function websiteCompletion('), source.indexOf('  function fetchUnifiedMatches')), h.context);
  h.context.fetchUnifiedMatches('cha', true, null, 1, false);
  await settle();
  assert.equal(h.context.currentResults[0].data.url, 'https://chatgpt.com/');
  assert.equal(h.context.currentResults[0].autocompleted, true);
  h.context.fetchUnifiedMatches('cha', true, null, 1, true);
  await settle();
  assert.equal(h.context.currentResults[0].type, 'SEARCH');
  assert.equal(h.context.currentResults[0].data.query, 'cha');
  assert.equal(h.context.currentResults.some(item => item.autocompleted), false);
});
