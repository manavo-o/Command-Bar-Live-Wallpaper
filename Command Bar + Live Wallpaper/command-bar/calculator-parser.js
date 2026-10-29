(function (root) {
  const constants = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
  const scalarFunctions = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, log: Math.log10, ln: Math.log, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, exp: Math.exp };
  const listFunctions = {
    sum: xs => xs.reduce((a, b) => a + b, 0),
    mean: xs => xs.reduce((a, b) => a + b, 0) / xs.length,
    average: xs => xs.reduce((a, b) => a + b, 0) / xs.length,
    min: xs => Math.min(...xs), max: xs => Math.max(...xs),
    median: xs => { const ys = xs.slice().sort((a, b) => a - b), i = Math.floor(ys.length / 2); return ys.length % 2 ? ys[i] : (ys[i - 1] + ys[i]) / 2; },
    variance: xs => { const m = listFunctions.mean(xs); return listFunctions.mean(xs.map(x => (x - m) ** 2)); },
    stdev: xs => Math.sqrt(listFunctions.variance(xs))
  };
  function normalizeInput(value) {
    return String(value).trim().toLowerCase().replace(/^what\s+is\s+/, '').replace(/^solve\s+/, '')
      .replace(/\b(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/g, '($1/100)*$2')
      .replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\d)/g, '($1/100)');
  }
  function parse(source) {
    if (!source || source.length > 1000) throw Error('Expression too long or empty');
    const tokens = source.match(/\d*\.?\d+(?:e[+\-]?\d+)?|[a-z]+|[+\-*/%^(),!\[\]=]/gi);
    if (!tokens || tokens.length > 256 || tokens.join('') !== source.replace(/\s/g, '')) throw Error('Invalid characters');
    let pos = 0, depth = 0;
    const peek = () => tokens[pos], take = () => tokens[pos++];
    const binary = (op, left, right) => ({ type: 'binary', op, left, right });
    const startsPrimary = token => /^(?:\d*\.?\d+(?:e[+\-]?\d+)?|[a-z]+|\(|\[)$/i.test(token || '');
    function expression() {
      let node = term();
      while (peek() === '+' || peek() === '-') { const op = take(); node = binary(op, node, term()); }
      return node;
    }
    function term() {
      let node = unary();
      while (['*', '/', '%'].includes(peek()) || startsPrimary(peek())) {
        const implicit = startsPrimary(peek()), op = implicit ? '*' : take();
        node = binary(op, node, unary());
      }
      return node;
    }
    function unary() {
      if (++depth > 64) throw Error('Expression nesting too deep');
      let node;
      if (peek() === '+' || peek() === '-') node = { type: 'unary', op: take(), value: unary() };
      else node = power();
      depth--; return node;
    }
    function power() {
      let node = primary();
      while (peek() === '!') { take(); node = { type: 'factorial', value: node }; }
      if (peek() === '^') { take(); node = binary('^', node, unary()); }
      return node;
    }
    function primary() {
      const token = take();
      if (token === '(') { const value = expression(); if (take() !== ')') throw Error('Expected )'); return { type: 'group', value }; }
      if (token === '[') {
        const values = [];
        if (peek() !== ']') { do { values.push(expression()); } while (peek() === ',' && take()); }
        if (take() !== ']') throw Error('Expected ]');
        return { type: 'list', values };
      }
      if (/^\d*\.?\d+(?:e[+\-]?\d+)?$/i.test(token || '')) {
        if (!Number.isFinite(Number(token))) throw Error('Number out of range');
        return { type: 'number', value: Number(token) };
      }
      if (Object.hasOwn(constants, token)) return { type: 'constant', name: token };
      if (Object.hasOwn(scalarFunctions, token) || Object.hasOwn(listFunctions, token)) {
        if (take() !== '(') throw Error('Expected (');
        const value = expression(); if (take() !== ')') throw Error('Expected )');
        return { type: 'call', name: token, value };
      }
      if (/^[a-z]$/.test(token || '')) return { type: 'variable', name: token };
      throw Error('Unknown symbol');
    }
    let tree = expression();
    if (peek() === '=') { take(); tree = { type: 'equation', left: tree, right: expression() }; }
    if (pos !== tokens.length) throw Error('Unexpected token');
    return tree;
  }
  function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('Invalid factorial');
    let value = 1; for (let i = 2; i <= n; i++) value *= i; return value;
  }
  function binaryValue(a, b, fn) {
    if (!Array.isArray(a) && !Array.isArray(b)) return fn(a, b);
    const xs = Array.isArray(a) ? a : [a], ys = Array.isArray(b) ? b : [b];
    if (xs.length !== ys.length && xs.length !== 1 && ys.length !== 1) throw Error('List lengths differ');
    return Array.from({ length: Math.max(xs.length, ys.length) }, (_, i) => fn(xs.length === 1 ? xs[0] : xs[i], ys.length === 1 ? ys[0] : ys[i]));
  }
  function calculate(node) {
    switch (node.type) {
      case 'number': return node.value;
      case 'constant': return constants[node.name];
      case 'group': return calculate(node.value);
      case 'variable': throw Error('Symbolic expression');
      case 'list': { const xs = node.values.map(calculate); if (xs.some(Array.isArray)) throw Error('Nested lists unsupported'); return xs; }
      case 'factorial': return factorial(calculate(node.value));
      case 'unary': { const value = calculate(node.value); return node.op === '-' ? binaryValue(0, value, (a, b) => a - b) : value; }
      case 'call': {
        const value = calculate(node.value);
        if (Object.hasOwn(listFunctions, node.name)) { if (!Array.isArray(value) || !value.length) throw Error('Expected nonempty list'); return listFunctions[node.name](value); }
        if (Array.isArray(value)) throw Error('Expected scalar');
        return scalarFunctions[node.name](value);
      }
      case 'binary': return binaryValue(calculate(node.left), calculate(node.right), (a, b) => {
        switch (node.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b; case '^': return a ** b; }
      });
      default: throw Error('Unsupported equation');
    }
  }
  // Polynomial coefficients [constant, x, x²], derived from the same syntax tree.
  function polynomial(node) {
    if (node.type === 'variable') { if (node.name !== 'x') throw Error('Only x equations supported'); return [0, 1, 0]; }
    if (node.type === 'group') return polynomial(node.value);
    if (node.type === 'unary') return polynomial(node.value).map(n => node.op === '-' ? -n : n);
    if (node.type === 'binary') {
      const a = polynomial(node.left), b = polynomial(node.right);
      if (node.op === '+' || node.op === '-') return a.map((n, i) => n + (node.op === '+' ? b[i] : -b[i]));
      if (node.op === '/' && b[1] === 0 && b[2] === 0 && b[0] !== 0) return a.map(n => n / b[0]);
      if (node.op === '^' && b[1] === 0 && b[2] === 0 && [0, 1, 2].includes(b[0])) {
        if (b[0] === 0) return [1, 0, 0];
        if (b[0] === 1) return a;
        return multiply(a, a);
      }
      if (node.op === '*') return multiply(a, b);
    }
    const value = calculate(node);
    if (!Number.isFinite(value)) throw Error('Unsupported polynomial');
    return [value, 0, 0];
  }
  function multiply(a, b) {
    const c = [0, 0, 0, 0, 0];
    a.forEach((x, i) => b.forEach((y, j) => { c[i + j] += x * y; }));
    if (c[3] || c[4]) throw Error('Only quadratic equations supported');
    return c.slice(0, 3);
  }
  function solve(tree) {
    const left = polynomial(tree.left), right = polynomial(tree.right);
    const [c, b, a] = left.map((n, i) => n - right[i]);
    if (![a, b, c].every(Number.isFinite)) throw Error('Invalid equation');
    if (!a && !b) return { values: [], message: c === 0 ? 'All real numbers' : 'No real solutions' };
    if (!a) return { values: [-c / b] };
    const d = b * b - 4 * a * c;
    if (d < 0) return { values: [], message: 'No real solutions' };
    if (!Number.isFinite(d)) throw Error('Equation out of range');
    const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(d));
    return { values: [...new Set(q === 0 ? [0] : [q / a, c / q])].sort((x, y) => x - y) };
  }
  function formatNumber(value, grouped = true) {
    if (!Number.isFinite(value)) throw Error('Nonfinite result');
    if (value === 0) return '0';
    const rounded = Number(value.toPrecision(12)), magnitude = Math.abs(rounded);
    if (magnitude < 1e-6 || magnitude >= 1e12) return rounded.toExponential().replace('e+', 'e');
    return grouped ? rounded.toLocaleString('en-US', { maximumSignificantDigits: 12 }) : String(rounded);
  }
  function containsVariable(tree) {
    return tree.type === 'variable' || (tree.value && typeof tree.value === 'object' && containsVariable(tree.value)) ||
      (tree.left && (containsVariable(tree.left) || containsVariable(tree.right))) || (tree.values && tree.values.some(containsVariable));
  }
  function evaluate(input) {
    if (typeof input !== 'string' || !input.trim()) return null;
    const expr = input.trim(), source = normalizeInput(expr);
    // Require a mathematical cue; single words and ordinary searches stay searches.
    if (!/[\d+\-*/^=()[\]!%]/.test(source) && !/^(?:pi|tau|e)$/.test(source)) return null;
    let tree;
    try { tree = parse(source); } catch (_) { return null; }
    const base = { expression: expr, expr, tree };
    try {
      if (tree.type === 'equation') {
        const solved = solve(tree), query = solved.message || solved.values.map(n => `x = ${formatNumber(n)}`).join(', ');
        return { ...base, kind: 'solutions', value: solved.values, query, copyText: solved.message || solved.values.map(n => `x = ${formatNumber(n, false)}`).join(', ') };
      }
      if (containsVariable(tree)) return { ...base, kind: 'symbolic', query: expr, copyText: expr };
      const value = calculate(tree), values = Array.isArray(value) ? value : [value];
      if (!values.every(Number.isFinite)) throw Error('Result is not finite');
      return { ...base, kind: Array.isArray(value) ? 'list' : 'number', value,
        query: Array.isArray(value) ? `[${values.map(n => formatNumber(n)).join(', ')}]` : formatNumber(value),
        copyText: Array.isArray(value) ? `[${values.map(n => formatNumber(n, false)).join(', ')}]` : formatNumber(value, false) };
    } catch (error) {
      if (tree.type === 'equation' && containsVariable(tree)) return { ...base, kind: 'symbolic', query: expr, copyText: expr };
      return { ...base, kind: 'error', query: error.message };
    }
  }
  root.CommandBarCalculator = { evaluate, parse, formatNumber };
  if (typeof module === 'object' && module.exports) module.exports = root.CommandBarCalculator;
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
