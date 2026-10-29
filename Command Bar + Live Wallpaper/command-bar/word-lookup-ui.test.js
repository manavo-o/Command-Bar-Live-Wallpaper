const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js','utf8');
function lookupHarness() {
  const callbacks=[],messages=[];
  const ctx=vm.createContext({currentQueryToken:1,currentResults:[],selectedIndex:0,
    safeSendMessage(message,callback){messages.push(message);callbacks.push(callback);},mergeActiveDefItem(){},renderResults(){}});
  vm.runInContext(source.slice(source.indexOf('  function handleDictionaryLookup('),source.indexOf('  function mergeActiveDefItem(')),ctx);
  return {ctx,callbacks,messages};
}
test('synonym mode is sent, rendered as a successful card, and stale replies are ignored',()=>{
  const h=lookupHarness(); h.ctx.handleDictionaryLookup('calm',1,'synonyms');
  assert.equal(h.messages[0].word,'calm'); assert.equal(h.messages[0].mode,'synonyms');
  h.callbacks[0]({definition:{word:'calm',status:'success',synonyms:['peaceful','serene']}});
  assert.equal(h.ctx.activeDefItem.data.mode,'synonyms'); assert.equal(h.ctx.activeDefItem.sub,'peaceful, serene');
  h.ctx.handleDictionaryLookup('loud',1,'synonyms'); h.ctx.currentQueryToken=2;
  h.callbacks[1]({definition:{word:'loud',status:'success',synonyms:['noisy']}});
  assert.equal(h.ctx.activeDefItem.data.word,'calm');
});
test('synonym cards expose corrections and use text nodes for API content',()=>{
  function element(){return {children:[],style:{},appendChild(child){this.children.push(child);},addEventListener(){}};}
  const ctx=vm.createContext({document:{createElement:element}});
  vm.runInContext(fs.readFileSync('overlay-card.js','utf8'),ctx);
  const root=element();
  ctx.OverlayCard.renderInlineCard(root,{type:'DEF',data:{status:'success',mode:'synonyms',word:'beautiful',correctedFrom:'beutiful',synonyms:['lovely','<b>pretty</b>']}});
  assert.ok(root.children.some(x=>x.textContent==='Synonyms · Datamuse'));
  assert.ok(root.children.some(x=>x.textContent && x.textContent.includes('corrected from “beutiful”')));
  const chips=root.children.find(x=>x.className==='dict-synonyms');
  assert.deepEqual(chips.children.map(x=>x.textContent),['lovely','<b>pretty</b>']);
  assert.equal(chips.children[1].innerHTML,undefined);
});
