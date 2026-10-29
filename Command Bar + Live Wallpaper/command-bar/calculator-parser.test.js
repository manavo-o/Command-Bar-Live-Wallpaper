const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('./calculator-parser');
test('local arithmetic preserves grouping, powers, negative exponents, functions and lists', () => {
  for (const [input, expected] of [['2+3*4', 14], ['(2+3)*4', 20], ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^-3', .125], ['sqrt(9)', 3], ['sum([1,2,3])', 6], ['mean([1,2,3])', 2], ['5!', 120], ['2(3)', 6], ['20% of 50', 10], ['20%', .2], ['5%2', 1]]) {
    assert.equal(calc.evaluate(input).value, expected, input);
  }
  assert.deepEqual(calc.evaluate('[1,2]*2').value, [2,4]);
  assert.equal(calc.evaluate('x^(2+3)').kind, 'symbolic');
  assert.equal(calc.evaluate('sqrt(x^2+1)').kind, 'symbolic');
  assert.equal(calc.evaluate('x^2').copyText, 'x^2');
});
test('equations use the syntax tree and distinguish roots, identities and unsupported symbolic equations', () => {
  assert.deepEqual(calc.evaluate('x^2-5x+6=0').value, [2,3]);
  assert.deepEqual(calc.evaluate('solve 2x+3=7').value, [2]);
  assert.deepEqual(calc.evaluate('-x+2=0').value, [2]);
  assert.deepEqual(calc.evaluate('2*(x+1)=6').value, [2]);
  assert.equal(calc.evaluate('x=x').query, 'All real numbers');
  assert.equal(calc.evaluate('x=x+1').query, 'No real solutions');
  assert.equal(calc.evaluate('x^2+1=0').query, 'No real solutions');
  assert.equal(calc.evaluate('x^3=1').kind, 'symbolic');
});
test('readable numbers retain separate ungrouped copy strings', () => {
  for (const [input, display, copy] of [['1000000+0', '1,000,000', '1000000'], ['0.1+0.2', '0.3', '0.3'], ['0', '0', '0'], ['-0', '0', '0'], ['1e-7', '1e-7', '1e-7'], ['1e12', '1e12', '1e12']]) {
    const result = calc.evaluate(input); assert.equal(result.query, display); assert.equal(result.copyText, copy);
  }
  assert.equal(calc.evaluate('1/3').query, '0.333333333333');
  assert.equal(calc.evaluate('0.1+0.2').value, .1+.2);
});
test('ordinary searches and malformed input do not become math; invalid numeric results cannot be copied', () => {
  for (const query of ['coffee-shops', 'x-ray', 'https://example.com/a^2', 'what is gravity?', '<img src=x>', '2+(', '2**3', 'window.alert(1)', '1e999', '('.repeat(70)+'2'+')'.repeat(70)]) assert.equal(calc.evaluate(query), null, query);
  for (const query of ['1/0', 'sqrt(-1)', 'mean([])']) { const result = calc.evaluate(query); assert.equal(result.kind, 'error'); assert.equal(result.copyText, undefined); }
});
