const assert = require('assert');
const intent = require('./query-intent.js');
const calc = require('./calculator-parser.js');

assert.strictEqual(intent.scope('@history github'), '@history');
assert.strictEqual(intent.scope('@historyxyz'), null);
assert.strictEqual(intent.explicitDictionary('define ephemeral'), 'ephemeral');
assert.strictEqual(intent.explicitDictionary('what is gravity?'), null);
assert.strictEqual(intent.classify('how do I use git rebase', { evaluate: calc.evaluate }).type, 'AI');
assert.strictEqual(intent.classify('2 + 2', { evaluate: calc.evaluate }).type, 'MATH');
assert.strictEqual(intent.classify('/open bookmarks', { evaluate: calc.evaluate }).type, 'ACTION');
assert.strictEqual(intent.classify('q% latest browser news', { evaluate: calc.evaluate }).type, 'AI');
assert.strictEqual(calc.evaluate('mean([1, 2, 3])').query, '2');
assert.deepStrictEqual(calc.evaluate('median([1, 3, 2, 8])').value, 2.5);
assert.deepStrictEqual(calc.evaluate('solve 2x+3=7').value, [2]);
assert.deepStrictEqual(calc.evaluate('x^2-5x+6=0').value, [2, 3]);
assert.strictEqual(calc.evaluate('2(3)').query, '6');
assert.strictEqual(calc.evaluate('window.alert(1)'), null);
console.log('query intent tests passed');

for (const query of ['write an email', 'help me debug a crash', 'plan a trip', 'make a workout routine', 'recommend a laptop', 'git rebase vs merge', 'my printer is not working', 'translate this into Spanish']) {
  assert.strictEqual(intent.searchDestination(query, { mode: 'balanced' }), 'default', query);
}
for (const query of ['github', 'chicago weather', 'best buy login', 'https://example.com/how', 'github.com', 'coffee shops']) {
  assert.strictEqual(intent.searchDestination(query, { mode: 'balanced' }), 'google', query);
  assert.strictEqual(intent.searchDestination(query, { mode: 'prefer-ai' }), 'default', query);
}
for (const mode of ['balanced', 'prefer-ai']) {
  assert.strictEqual(intent.searchDestination('write an email', { mode, shiftKey: true }), 'google');
  for (const [query, type] of [['/open bookmarks', 'ACTION'], ['@history github', 'SCOPE'], ['define ephemeral', 'DICTIONARY'], ['2 + 2', 'MATH']]) {
    assert.strictEqual(intent.classify(query, { mode, evaluate: calc.evaluate }).type, type);
  }
  const explicit = intent.classify('ask% hello', { mode, providers: [{ id: 'custom', trigger: 'ask%' }] });
  assert.strictEqual(explicit.providerId, 'custom');
  assert.strictEqual(explicit.query, 'hello');
  assert.strictEqual(explicit.forced, true);
}
assert.strictEqual(intent.normalizeRoutingMode(undefined), 'balanced');
assert.strictEqual(intent.normalizeRoutingMode('invalid'), 'balanced');
