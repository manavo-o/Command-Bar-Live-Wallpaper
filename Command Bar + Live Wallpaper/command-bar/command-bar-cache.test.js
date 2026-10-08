const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js','utf8');
test('query cache keeps 20 recent responses and refetches evicted queries', async () => {
  let calls = 0;
  const context = vm.createContext({safeSendMessage(req, cb) { calls++; cb({history:[{url:req.query}]}); }});
  vm.runInContext(source.slice(source.indexOf('  function cachedQuery'),source.indexOf('  function getHistoryCached')) + '\nthis.cachedQuery = cachedQuery;',context);
  const cache = new Map();
  const query = key => context.cachedQuery(cache,key,{query:key},'history');
  const first = await query('first');
  for(let i=0;i<19;i++) await query(String(i));
  await query('first'); await query('next');
  assert.equal(cache.size,20); assert.ok(cache.has('first')); assert.equal(cache.has('0'),false);
  await query('0'); assert.equal(calls,22); assert.equal(first[0].url,'first');
});
test('closing invalidates outstanding results and releases session caches', () => {
  let released = false;
  const context = vm.createContext({ openGeneration:0, isVisible:true, queryGeneration:5, currentQueryToken:5, searchDebounceTimer:1, suggestDebounceTimer:2,
    clearTimeout(){}, safeSendMessage(){}, backdrop:{classList:{remove(){},add(){}}, setAttribute(){}}, input:{value:'query'},
    frame: { style: {}, setAttribute() {}, removeAttribute() {} }, shadow:{activeElement:null}, exitCleanupTimer:null, stylesReady:true,
    window:{addEventListener(){},matchMedia:()=>({matches:false})}, setTimeout(){return 3;}, finishExit(){}, animateOverlay(){},
    clearAutocomplete(){},clearResultNodes(){}, resetSessionCaches(){released=true;} });
  vm.runInContext(source.slice(source.indexOf('  function hideOverlay'),source.indexOf('  function resetSessionCaches'))+'\nhideOverlay();',context);
  assert.equal(context.currentQueryToken,6); assert.equal(context.isVisible,false); assert.equal(released,true);
});
