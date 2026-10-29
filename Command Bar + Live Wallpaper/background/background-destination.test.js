const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const results = require('../command-bar/command-bar-results');
const source = fs.readFileSync('background/background-bootstrap.js','utf8');
const handler = source.slice(source.indexOf("    case 'FOCUS_DESTINATION':"), source.indexOf("    case 'CREATE_TAB':"));
function run(tabs, request = {}, dead = []) {
  const focused = [], created = [], windows = [], queries = [], responses = [];
  const chrome = {runtime:{},tabs:{
    query(options,cb){ queries.push(options); cb(tabs); },
    update(id,options,cb){ focused.push(id); chrome.runtime.lastError = dead.includes(id) ? new Error('closed') : null; cb(); chrome.runtime.lastError=null; },
    create(options,cb){ created.push(options); cb(); }
  },windows:{update(id,options,cb){windows.push(id);cb();}}};
  const ctx = vm.createContext({request:{type:'FOCUS_DESTINATION',url:'https://example.com/',...request},CommandBarResults:results,chrome,sendResponse:value=>responses.push(value),recordVisit(){}});
  vm.runInContext('(function(){ switch(request.type){'+handler+'} })()',ctx);
  return {focused,created,windows,queries,responses};
}
test('execution rechecks the eligible window and switches to one deterministic tab',()=>{
  const h = run([{id:5,url:'https://example.com/',windowId:1,active:false},{id:8,url:'https://example.com/',windowId:2,active:true}],{allWindows:true});
  assert.deepEqual(h.focused,[8]); assert.deepEqual(h.windows,[2]); assert.equal(h.created.length,0);
});
test('closed tabs fall through to another match or exactly one new destination',()=>{
  const h = run([{id:1,url:'https://example.com/',windowId:3},{id:2,url:'https://example.com/',windowId:3}],{windowId:3},[1,2]);
  assert.deepEqual(h.focused,[1,2]); assert.equal(h.created.length,1); assert.equal(h.created[0].url,'https://example.com/');
  assert.equal(h.responses.length,1); assert.equal(h.queries[0].windowId,3);
});
test('history without an attached tab still checks current-window tabs before opening',()=>{
  const h = run([{id:1,url:'https://example.com/',windowId:3}]);
  assert.equal(h.queries[0].currentWindow,true); assert.deepEqual(h.focused,[1]); assert.equal(h.created.length,0);
});
