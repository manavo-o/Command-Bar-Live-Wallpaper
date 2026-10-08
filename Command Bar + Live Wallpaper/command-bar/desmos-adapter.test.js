const assert = require('assert');
const desmos = require('./desmos-adapter.js');

assert.strictEqual(typeof desmos.evaluate, 'function');
assert.strictEqual(typeof desmos.cancel, 'function');
assert.strictEqual(typeof desmos.isAvailable, 'function');
assert.strictEqual(desmos.isAvailable(), false);
desmos.evaluate('x^2').then((value) => {
  assert.strictEqual(value, null);
  console.log('desmos adapter fallback tests passed');
});
