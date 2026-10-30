const test = require('node:test');
const assert = require('node:assert/strict');
const timer = require('./focus-timer');
const fs = require('node:fs'), vm = require('node:vm');
test('pause preserves mode and remaining time through reload, then resume uses a fresh deadline',()=>{
  const running=timer.transition(null,'start',1000,25,5);
  assert.equal(running.durationMs,1500000);
  const paused=timer.transition(running,'pause',61000,25,5);
  assert.equal(paused.remainingMs,1440000);assert.equal(paused.endTimestamp,undefined);
  const reloaded=JSON.parse(JSON.stringify(paused));
  const resumed=timer.transition(reloaded,'resume',900000,25,5);
  assert.equal(resumed.endTimestamp,2340000);assert.equal(resumed.mode,'work');
  assert.equal(timer.transition(resumed,'reset',900000),null);
});
test('legacy states normalize and duplicate or stale transition requests cannot advance the next session',()=>{
  const legacy={mode:'work',endTimestamp:100};
  assert.equal(timer.normalize(legacy).durationMs,1500000);
  const rest=timer.transition(legacy,'advance',100,25,5,100);
  assert.equal(rest.mode,'break');assert.equal(rest.durationMs,300000);
  assert.deepEqual(timer.transition(rest,'advance',200,25,5,100),rest);
  const paused=timer.transition(rest,'pause',200);
  assert.equal(paused.mode,'break');assert.equal(timer.transition(paused,'resume',300).mode,'break');
  assert.equal(timer.normalize({mode:'bogus',remainingMs:10}),null);
});
test('background serializes competing tabs, shares paused state and reports failed writes',async()=>{
  const root={FocusTimer:timer}, reads=[], writes=[], state={focusTimerState:{mode:'work',endTimestamp:1},focusWorkMinutes:25,focusBreakMinutes:5};
  const chrome={runtime:{},storage:{local:{get(defaults,cb){reads.push(()=>cb({...defaults,...state}));},set(update,cb){writes.push(()=>{if(!chrome.runtime.lastError) Object.assign(state,update);cb();});}}}};
  vm.runInNewContext(fs.readFileSync('background/background-focus-timer.js','utf8'),{self:root,chrome,Date:{now:()=>1000},Promise});
  const responses=[];
  root.BackgroundFocusTimer.handle({action:'advance',expectedEnd:1},r=>responses.push(r));
  root.BackgroundFocusTimer.handle({action:'advance',expectedEnd:1},r=>responses.push(r));
  await new Promise(setImmediate);assert.equal(reads.length,1);reads.shift()();assert.equal(writes.length,1);
  writes.shift()();await new Promise(setImmediate);reads.shift()();await new Promise(setImmediate);
  assert.equal(writes.length,0);assert.equal(state.focusTimerState.mode,'break');assert.equal(responses.length,2);
  root.BackgroundFocusTimer.handle({action:'pause'},r=>responses.push(r));await new Promise(setImmediate);reads.shift()();writes.shift()();await new Promise(setImmediate);
  assert.equal(state.focusTimerState.remainingMs,300000);assert.equal(state.focusTimerState.endTimestamp,undefined);
  root.BackgroundFocusTimer.handle({action:'resume'},r=>responses.push(r));await new Promise(setImmediate);reads.shift()();chrome.runtime.lastError={message:'quota'};writes.shift()();await new Promise(setImmediate);
  assert.equal(responses.at(-1).ok,false);assert.equal(state.focusTimerState.endTimestamp,undefined);
});
