const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('background/background-bootstrap.js', 'utf8');
test('concurrent first-open requests inject and toggle once, then allow another toggle', () => {
  const injections = [], sends = [], timers = new Map(); let id = 0;
  const ctx = vm.createContext({
    Set, setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    injectOverlayScripts(tab, callback) { injections.push({tab, callback}); },
    chrome: { runtime: {}, tabs: { sendMessage(tab, message, callback) { sends.push({tab, message, callback}); } } },
  });
  vm.runInContext(source.slice(source.indexOf('const pendingCommandBarToggles'), source.indexOf('if (chrome.browserAction')), ctx);
  ctx.toggleCommandBarForTab(3); ctx.toggleCommandBarForTab(3);
  assert.equal(injections.length, 1);
  injections[0].callback(); assert.equal(sends.length, 1); sends[0].callback();
  assert.equal(timers.size, 0);
  ctx.toggleCommandBarForTab(3); assert.equal(injections.length, 2);
  ctx.toggleCommandBarForTab(4); assert.equal(injections.length, 3);
  for (const callback of [...timers.values()]) callback();
  ctx.toggleCommandBarForTab(3); assert.equal(injections.length, 4);
});
