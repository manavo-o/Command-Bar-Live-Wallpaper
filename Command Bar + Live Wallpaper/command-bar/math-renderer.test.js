const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calculator = require('./calculator-parser');
const renderer = require('./math-renderer');
function dom() {
  const document = { createTextNode(text) { return { textContent: text }; }, createElement(tag) { return {
    tag, ownerDocument: document, children: [], attrs: {}, style: {},
    appendChild(child) { this.children.push(child); return child; }, replaceChildren() { this.children = []; this._text = ''; },
    setAttribute(key, value) { this.attrs[key] = value; }, addEventListener() {},
    set textContent(text) { this._text = text; this.children = []; }, get textContent() { return (this._text || '') + this.children.map(x => x.textContent).join(''); }
  }; } };
  return document;
}
function descendants(node) { return [node, ...(node.children || []).flatMap(descendants)]; }
test('math cards render powers, fractions, roots and symbolic expressions using safe accessible DOM', () => {
  const document = dom(), context = vm.createContext({ document, CommandBarMathRenderer: renderer });
  vm.runInContext(fs.readFileSync('overlay-card.js', 'utf8'), context);
  for (const [query, className] of [['x^(2+3)', 'math-exponent'], ['(x+1)/(x-1)', 'math-fraction'], ['sqrt(x^2+1)', 'math-radicand'], ['1e12', 'math-exponent']]) {
    const root = document.createElement('li');
    context.OverlayCard.renderInlineCard(root, { type: 'CALC', data: calculator.evaluate(query) });
    const nodes = descendants(root);
    assert.ok(nodes.some(x => x.className === className), query);
    assert.ok(nodes.some(x => x.attrs && x.attrs.role === 'math' && x.attrs['aria-label']), query);
    assert.ok(nodes.filter(x => x !== root).every(x => x.innerHTML === undefined));
  }
});
test('results format numbers, scientific notation, lists and equation solutions', () => {
  for (const [query, expected] of [['1000000', '1,000,000'], ['1e-7', '1 × 10−7'], ['x^2-5x+6=0', 'x = 2, x = 3'], ['[1000,2]', '[1,000, 2]']]) {
    const root = dom().createElement('div'); renderer.renderResult(root, calculator.evaluate(query));
    assert.equal(root.textContent, expected);
  }
});
test('Enter copies canonical math values and expressions, while invalid results are not selectable', () => {
  const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
  let copied = null;
  const ctx = vm.createContext({ hideOverlay() {}, navigator: { clipboard: { writeText(value) { copied = value; return Promise.resolve(); } } } });
  vm.runInContext(source.slice(source.indexOf('  function isSelectable('), source.indexOf('  function firstSelectableIndex(')), ctx);
  vm.runInContext(source.slice(source.indexOf('  function executeResult('), source.indexOf('  function executeSelected(')), ctx);
  for (const [input, expected] of [['1000000', '1000000'], ['x^2', 'x^2'], ['1/0', null]]) {
    copied = null; ctx.executeResult({ type: 'CALC', data: calculator.evaluate(input) }); assert.equal(copied, expected);
  }
});
test('search orchestration produces local math cards synchronously without a remote fallback', () => {
  const source = fs.readFileSync('command-bar/command-bar-bootstrap.js', 'utf8');
  const ctx = vm.createContext({ input: { value: '' }, autocompleteActive: false, queryGeneration: 0,
    lastEditWasDeletion: false, completionBlocked: () => false, clearTimeout() {}, searchDebounceTimer: null,
    clearAutocomplete() {}, window: { OverlaySearch: require('../overlay-search') }, renderResults() {} });
  vm.runInContext(source.slice(source.indexOf('  function updateSearch()'), source.indexOf('  function actionFrecencyScore')), ctx);
  for (const [input, kind] of [['x^2', 'symbolic'], ['2^3', 'number'], ['1/0', 'error']]) {
    ctx.input.value = input; ctx.updateSearch();
    assert.equal(ctx.currentResults[0].type, 'CALC'); assert.equal(ctx.currentResults[0].data.kind, kind);
  }
});
