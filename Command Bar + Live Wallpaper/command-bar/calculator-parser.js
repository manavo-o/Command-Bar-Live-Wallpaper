(function (root) {
  const constants = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
  const scalarFunctions = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, log: Math.log10, ln: Math.log, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, exp: Math.exp };
  const listFunctions = {
    sum: (xs) => xs.reduce((a, b) => a + b, 0),
    mean: (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
    average: (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
    min: (xs) => Math.min(...xs), max: (xs) => Math.max(...xs),
    median: (xs) => { const ys = xs.slice().sort((a, b) => a - b); const i = Math.floor(ys.length / 2); return ys.length % 2 ? ys[i] : (ys[i - 1] + ys[i]) / 2; },
    stdev: (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + ((b - m) ** 2), 0) / xs.length); },
    variance: (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, b) => a + ((b - m) ** 2), 0) / xs.length; }
  };
  const numberPattern = /^\d*\.?\d+(?:e[+\-]?\d+)?$/i;
  function normalizeInput(value) { return String(value).trim().toLowerCase().replace(/\bwhat\s+is\s+/i, '').replace(/\b(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)\b/g, '($1/100)*$2').replace(/\b(\d+(?:\.\d+)?)\s*%\b/g, '($1/100)'); }
  function factorial(n) { if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('Invalid factorial'); let result = 1; for (let i = 2; i <= n; i += 1) result *= i; return result; }
  function tokenize(source) { const tokens = source.match(/[a-z]+|\d*\.?\d+(?:e[+\-]?\d+)?|[+\-*/%^(),!\[\]=]/gi); if (!tokens || tokens.join('') !== source.replace(/\s/g, '')) throw Error('Invalid characters'); return tokens.map((token) => token.toLowerCase()); }
  function parseExpression(source, variables) {
    const rawTokens = tokenize(source); const tokens = []; const canEnd = (token) => numberPattern.test(token || '') || /^[a-z]+$/i.test(token || '') || token === ')' || token === ']' || token === '!'; const canStart = (token) => numberPattern.test(token || '') || /^[a-z]+$/i.test(token || '') || token === '(' || token === '[';
    rawTokens.forEach((token) => { const previous = tokens[tokens.length - 1]; const functionCall = token === '(' && /^[a-z]+$/i.test(previous || '') && (Object.prototype.hasOwnProperty.call(scalarFunctions, previous) || Object.prototype.hasOwnProperty.call(listFunctions, previous)); if (previous && !functionCall && canEnd(previous) && canStart(token)) tokens.push('*'); tokens.push(token); });
    let pos = 0; const peek = () => tokens[pos]; const take = () => tokens[pos++];
    const asScalar = (value) => Array.isArray(value) ? (value.length === 1 ? value[0] : value) : value; const asList = (value) => Array.isArray(value) ? value : [value];
    function binary(left, right, fn) { if (Array.isArray(left) || Array.isArray(right)) { const a = asList(left); const b = asList(right); if (a.length !== b.length && a.length !== 1 && b.length !== 1) throw Error('List lengths differ'); const length = Math.max(a.length, b.length); return Array.from({ length }, (_, i) => fn(a.length === 1 ? a[0] : a[i], b.length === 1 ? b[0] : b[i])); } return fn(left, right); }
    function expression() { let value = term(); while (peek() === '+' || peek() === '-') { const op = take(); const right = term(); value = op === '+' ? binary(value, right, (a, b) => a + b) : binary(value, right, (a, b) => a - b); } return value; }
    function term() { let value = unary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = take(); const right = unary(); value = op === '*' ? binary(value, right, (a, b) => a * b) : op === '/' ? binary(value, right, (a, b) => a / b) : binary(value, right, (a, b) => a % b); } return value; }
    function factor() { const base = primary(); if (peek() === '^') { take(); return binary(base, factor(), (a, b) => Math.pow(a, b)); } return base; }
    function unary() { if (peek() === '+') { take(); return unary(); } if (peek() === '-') { take(); const value = unary(); return Array.isArray(value) ? value.map((n) => -n) : -value; } return factor(); }
    function primary() {
      const token = take(); let value;
      if (token === '(') { value = expression(); if (take() !== ')') throw Error('Expected )'); }
      else if (token === '[') { value = []; if (peek() !== ']') { do { value.push(asScalar(expression())); } while (peek() === ',' && take()); } if (take() !== ']') throw Error('Expected ]'); }
      else if (numberPattern.test(token || '')) value = Number(token);
      else if (Object.prototype.hasOwnProperty.call(constants, token)) value = constants[token];
      else if (Object.prototype.hasOwnProperty.call(variables, token)) value = variables[token];
      else if (/^[a-z]+$/i.test(token || '')) { if (take() !== '(') throw Error('Expected ('); const args = []; if (peek() !== ')') { do { args.push(expression()); } while (peek() === ',' && take()); } if (take() !== ')') throw Error('Expected )'); if (Object.prototype.hasOwnProperty.call(scalarFunctions, token)) { if (args.length !== 1 || Array.isArray(args[0])) throw Error('Expected scalar'); value = scalarFunctions[token](args[0]); } else if (Object.prototype.hasOwnProperty.call(listFunctions, token)) { if (args.length !== 1 || !Array.isArray(args[0])) throw Error('Expected list'); value = listFunctions[token](args[0]); } else throw Error('Unknown function'); }
      else throw Error('Unexpected token');
      while (peek() === '!') { take(); value = factorial(asScalar(value)); } return value;
    }
    const value = expression(); if (pos !== tokens.length) throw Error('Unexpected token'); return value;
  }
  function formatNumber(value) { if (Math.abs(value) < 1e-6 || Math.abs(value) > 1e9) return value.toExponential(4); return Number(value.toFixed(8)).toString(); }
  function toLatex(source) { return String(source).trim().replace(/\bpi\b/gi, '\\pi').replace(/\btau\b/gi, '\\tau').replace(/\bsqrt\s*\(([^()]*)\)/gi, '\\sqrt{$1}').replace(/\blog\s*\(/gi, '\\log(').replace(/\bln\s*\(/gi, '\\ln(').replace(/\b(mean|median|sum|stdev|variance)\s*\(/gi, '\\operatorname{$1}('); }
  function result(expression, kind, value, error) { const data = { kind, expression, latex: toLatex(expression), expr: expression }; if (kind === 'number') { data.value = value; data.query = formatNumber(value); data.raw = value; } else if (kind === 'list') { data.value = value; data.query = `[${value.map(formatNumber).join(', ')}]`; } else if (kind === 'solutions') { data.value = value; data.query = value.length ? value.map((x) => `x = ${formatNumber(x)}`).join(', ') : 'No real solutions'; } else { data.query = error || 'Unable to evaluate expression'; data.error = error || data.query; } return data; }
  function solveEquation(expression) {
    const source = String(expression).trim().replace(/^solve\s+/i, '').replace(/\s/g, '').toLowerCase(); if (!source.includes('=')) return null; const parts = source.split('='); if (parts.length !== 2 || (!parts[0].includes('x') && !parts[1].includes('x'))) return null;
    function coefficients(terms, sign) { return terms.reduce((out, term) => { const t = term || '0'; if (t.includes('x^2')) out.a += sign * Number(t.replace('x^2', '') || 1); else if (t.includes('x')) out.b += sign * Number(t.replace('x', '') || 1); else out.c += sign * Number(t || 0); return out; }, { a: 0, b: 0, c: 0 }); }
    const split = (side) => side.replace(/-/g, '+-').split('+').filter(Boolean); const coeff = coefficients(split(parts[0]), 1); const right = coefficients(split(parts[1]), -1); coeff.a += right.a; coeff.b += right.b; coeff.c += right.c; if (![coeff.a, coeff.b, coeff.c].every(Number.isFinite)) return null;
    if (coeff.a === 0 && coeff.b === 0) return result(expression, 'solutions', coeff.c === 0 ? [0] : [], coeff.c === 0 ? null : 'No real solutions'); if (coeff.a === 0) return result(expression, 'solutions', [-coeff.c / coeff.b]); const discriminant = coeff.b * coeff.b - 4 * coeff.a * coeff.c; if (discriminant < 0) return result(expression, 'solutions', [], 'No real solutions'); const root = Math.sqrt(discriminant); const values = [(-coeff.b - root) / (2 * coeff.a), (-coeff.b + root) / (2 * coeff.a)]; return result(expression, 'solutions', Array.from(new Set(values.map((x) => Number(x.toFixed(10))))));
  }
  function evaluate(expr) { if (typeof expr !== 'string' || !expr.trim()) return null; const source = normalizeInput(expr); if (/=/.test(source) || /^solve\s+/i.test(source)) return solveEquation(source); if (!/[0-9]/.test(source) && !/\b(pi|e|tau)\b/.test(source)) return null; try { const value = parseExpression(source, {}); if (Array.isArray(value)) return result(expr, 'list', value); if (!Number.isFinite(value)) return null; return result(expr, 'number', value); } catch (error) { return null; } }
  function looksLikeMath(expr) { const value = String(expr || '').trim(); return /^(?:solve\s+)?[\d\s.+\-*/%^(),!\[\]=a-z]+$/i.test(value) && (/[*+\-/%^=()[\]!]/.test(value) || /\b(mean|median|sum|stdev|variance|sqrt|sin|cos|tan|log|ln)\s*\(/i.test(value)); }
  function evaluateDetailed(expr) { return evaluate(expr) || result(expr, 'error', null, 'Unsupported expression'); }
  root.CommandBarCalculator = { evaluate, evaluateDetailed, solveEquation, toLatex, looksLikeMath };
  if (typeof module === 'object' && module.exports) module.exports = root.CommandBarCalculator;
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
