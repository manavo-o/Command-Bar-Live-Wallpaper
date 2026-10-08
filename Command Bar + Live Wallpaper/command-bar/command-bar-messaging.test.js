const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('command-bar/command-bar-bootstrap.js','utf8');
const start = source.lastIndexOf('      chrome.runtime.onMessage.addListener(');
const listenerSource = source.slice(start,source.indexOf('\n    } catch',start));
function pages(count) {
  const handlers=[], queue=[]; let toggles=0;
  for(let i=0;i<count;i++) {
    vm.runInNewContext(listenerSource, {
      chrome:{runtime:{onMessage:{addListener:fn=>handlers[i]=fn}}},
      toggleOverlay(){toggles++;}, safeSendMessage:message=>queue.push({from:i,message})
    });
  }
  return {handlers,queue,get toggles(){return toggles;}};
}
test('visibility notifications terminate across multiple extension pages',()=>{
  const p=pages(5);
  for(const active of [true,false]) {
    p.queue.push({from:0,message:{action:'COMMAND_BAR_VISIBILITY',active}});
    let deliveries=0;
    while(p.queue.length && deliveries<100) {
      const {from,message}=p.queue.shift();
      p.handlers.forEach((handler,i)=>{if(i!==from){handler(message,{},()=>{});deliveries++;}});
    }
    assert.equal(p.queue.length,0,'visibility messages must not rebroadcast');
    assert.equal(deliveries,4);
  }
  assert.equal(p.toggles,0);
});
test('ping and toggle requests acknowledge once without broadcasting',()=>{
  const p=pages(2); const responses=[];
  p.handlers[0]({action:'PING'},{},r=>responses.push(r));
  p.handlers[0]({action:'TOGGLE_OVERLAY'},{},r=>responses.push(r));
  assert.equal(responses.length,2); assert.equal(responses[0].alive,true);
  assert.equal(responses[1].handled,true); assert.equal(p.toggles,1); assert.equal(p.queue.length,0);
});
