const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('toolbar icon initializes and follows appearance without tab overrides', () => {
  const calls = [];
  const colors = [];
  let listener;
  const appearance = {
    matches: false,
    addEventListener(event, callback) {
      assert.equal(event, 'change');
      listener = callback;
    }
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/background-icon.js`, 'utf8'), {
    window: { matchMedia: () => appearance },
    document: {
      createElement: () => ({
        getContext: () => ({
          set fillStyle(value) { colors.push(value); },
          beginPath() {},
          arc(x, y, radius) { assert.ok(radius > 0); },
          fill() {},
          getImageData: (x, y, width, height) => ({ width, height })
        })
      })
    },
    chrome: {
      runtime: {},
      browserAction: { setIcon: (details, callback) => { calls.push(details); callback(); } }
    }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(colors, ['#888888', '#888888']);
  appearance.matches = true;
  listener();
  assert.equal(calls.length, 2);
  assert.deepEqual(colors.slice(2), ['#EEEEEE', '#EEEEEE']);
  for (const call of calls) {
    assert.equal(call.tabId, undefined);
    assert.deepEqual(Object.keys(call.imageData), ['16', '32']);
    assert.equal(call.imageData[16].width, 16);
    assert.equal(call.imageData[32].width, 32);
  }
});
