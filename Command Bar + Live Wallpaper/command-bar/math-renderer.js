(function (root) {
  function render(container, tree, label) {
    const document = container.ownerDocument;
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    function build(node) {
      const out = element('span', 'math-node');
      const text = value => out.appendChild(document.createTextNode(value));
      switch (node.type) {
        case 'number': {
          const value = node.value === 0 ? 0 : Number(node.value.toPrecision(12));
          if (value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e12)) {
            const [coefficient, power] = value.toExponential().split('e');
            text(coefficient.replace('-', '−') + ' × 10');
            out.appendChild(element('sup', 'math-exponent', String(Number(power)).replace('-', '−')));
          } else text(value.toLocaleString('en-US', { maximumSignificantDigits: 12 }).replace('-', '−'));
          break;
        }
        case 'constant': text({ pi: 'π', tau: 'τ', e: 'e' }[node.name]); break;
        case 'variable': out.appendChild(element('i', '', node.name)); break;
        case 'group': text('('); out.appendChild(build(node.value)); text(')'); break;
        case 'sequence': node.values.forEach((value, i) => { if (i) text(', '); out.appendChild(build(value)); }); break;
        case 'list': text('['); node.values.forEach((value, i) => { if (i) text(', '); out.appendChild(build(value)); }); text(']'); break;
        case 'unary': text(node.op === '-' ? '−' : '+'); out.appendChild(build(node.value)); break;
        case 'factorial': out.appendChild(build(node.value)); text('!'); break;
        case 'equation': out.appendChild(build(node.left)); text(' = '); out.appendChild(build(node.right)); break;
        case 'call':
          if (node.name === 'sqrt') { text('√'); const radicand = element('span', 'math-radicand'); radicand.appendChild(build(node.value)); out.appendChild(radicand); }
          else { text(node.name + '('); out.appendChild(build(node.value)); text(')'); }
          break;
        case 'binary':
          if (node.op === '/') {
            const fraction = element('span', 'math-fraction');
            for (const value of [node.left, node.right]) { const part = element('span', 'math-fraction-part'); part.appendChild(build(value)); fraction.appendChild(part); }
            out.appendChild(fraction);
          } else if (node.op === '^') {
            out.appendChild(build(node.left)); const exponent = element('sup', 'math-exponent'); exponent.appendChild(build(node.right)); out.appendChild(exponent);
          } else { out.appendChild(build(node.left)); text(' ' + ({ '*': '×', '-': '−', '%': 'mod' }[node.op] || node.op) + ' '); out.appendChild(build(node.right)); }
          break;
      }
      return out;
    }
    container.replaceChildren();
    container.setAttribute('role', 'math');
    container.setAttribute('aria-label', label);
    const visual = build(tree); visual.setAttribute('aria-hidden', 'true'); container.appendChild(visual);
  }
  function renderResult(container, data) {
    let tree;
    if (data.kind === 'number') tree = { type: 'number', value: data.value };
    else if (data.kind === 'list') tree = { type: 'list', values: data.value.map(value => ({ type: 'number', value })) };
    else if (data.kind === 'solutions' && data.value.length) tree = { type: 'sequence', values: data.value.map(value => ({ type: 'equation', left: { type: 'variable', name: 'x' }, right: { type: 'number', value } })) };
    if (tree) render(container, tree, data.query);
  }
  root.CommandBarMathRenderer = { render, renderResult };
  if (typeof module === 'object' && module.exports) module.exports = root.CommandBarMathRenderer;
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
