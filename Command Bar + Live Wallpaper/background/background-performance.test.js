const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('background/background-bootstrap.js','utf8');
function section(start,end) { return source.slice(source.indexOf(start),source.indexOf(end)); }
test('bounded history selection preserves full-sort ranking including old destinations', () => {
  const now = 1800000000000;
  const entries = Object.fromEntries(Array.from({length:5000},(_,i) => [String(i), {
    url:`https://example.com/${i}`, title: i % 3 ? `Page ${i}` : `Older destination ${i}`,
    lastVisitTime:now - (i % 400) * 86400000, visitCount:(i * 71) % 1000, typedCount:i % 39
  }]));
  const context = vm.createContext({ URL, Date: {now:() => now}, loadHistoryIndex:cb => cb({entries,complete:true}) });
  vm.runInContext(section('function historyIndexKey','function emptyHistoryIndex') + section('function historyIndexResults','function updateHistoryIndexVisit'),context);
  for(const query of ['', 'older', 'example.com/49', 'missing']) {
    const score = item => {
      const title = item.title.toLowerCase(), url = item.url.toLowerCase();
      return (query && (title.startsWith(query)||url.startsWith(query)) ? 10000:0) +
        (query && (title.includes(query)||url.includes(query)) ? 1000:0) +
        100/(1+Math.max(0,(now-item.lastVisitTime)/86400000)/30) + Math.log1p(item.visitCount)*520+Math.log1p(item.typedCount)*360;
    };
    const expected = Object.values(entries).filter(i => !query || i.title.toLowerCase().includes(query)||i.url.includes(query))
      .sort((a,b)=>score(b)-score(a)||b.lastVisitTime-a.lastVisitTime||b.visitCount-a.visitCount||context.historyIndexKey(a.url).localeCompare(context.historyIndexKey(b.url))).slice(0,37);
    context.historyIndexResults(query,37,(items,complete) => {
      assert.equal(complete,true);
      assert.deepEqual(Array.from(items,i => i.url),expected.map(i => i.url));
    });
  }
});
test('visits received during a flush remain dirty and are flushed again', () => {
  const writes = [], alarms = [];
  const context = vm.createContext({ URL, setTimeout:()=>1, chrome: { runtime:{}, alarms:{create:(...args)=>alarms.push(args)}, storage:{local:{
    get:(keys,cb)=>cb({visitLog:{}}), set:(value,cb)=>writes.push(cb)
  }} } });
  vm.runInContext(source.slice(0,source.indexOf('function recencyWeight')) + section('function recordVisit','function computeFrecencyScore'),context);
  context.recordVisit('https://example.com/a','typed');
  context.recordVisit('https://example.com/b','typed'); assert.equal(alarms.length,1);
  context.flushVisitLog(); context.recordVisit('https://example.com/c','typed'); writes.shift()();
  context.flushVisitLog(); assert.equal(writes.length,1); writes.shift()();
  context.flushVisitLog(); assert.equal(writes.length,0);
});
test('concurrent history loads share one read without polling', () => {
  let callback, reads=0;
  const context = vm.createContext({ chrome:{storage:{local:{get(keys,cb){reads++;callback=cb;}}}}, Date });
  vm.runInContext('let historyIndexCache=null; let historyIndexLoadPending=false; let historyIndexLoadCallbacks=[]; const HISTORY_INDEX_KEY="historyIndex"; const HISTORY_INDEX_VERSION=2; const HISTORY_INITIAL_WINDOW_MS=100;'+section('function emptyHistoryIndex','function persistHistoryIndex'),context);
  let delivered=0;
  context.loadHistoryIndex(()=>delivered++); context.loadHistoryIndex(()=>delivered++);
  assert.equal(reads,1); callback({}); assert.equal(delivered,2);
});
