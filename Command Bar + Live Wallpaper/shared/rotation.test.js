const assert = require('assert');
const rotation = require('./rotation.js');

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
assert.strictEqual(rotation.nextId(items, 'a', 'sequential'), 'b');
assert.strictEqual(rotation.nextId(items, 'c', 'sequential'), 'a');
assert.strictEqual(rotation.nextId(items, 'a', 'shuffle', () => 0), 'b');
assert.strictEqual(rotation.isDaytime(8, 7, 19), true);
assert.strictEqual(rotation.isDaytime(23, 19, 7), true);
console.log('rotation tests passed');
