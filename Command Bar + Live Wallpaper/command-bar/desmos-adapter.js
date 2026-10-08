(function (root) {
  let loadPromise = null;
  let calculator = null;
  let host = null;
  let sequence = 0;
  const API_KEY = 'dcb31709b452b1cf9dc26972add0fda6';

  function isAvailable() { return Boolean(root.Desmos && typeof root.Desmos.GraphingCalculator === 'function'); }
  function loadRuntime() {
    if (isAvailable()) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    if (typeof document === 'undefined') return Promise.resolve(false);
    loadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://www.desmos.com/api/v1.13/calculator.js?apiKey=${API_KEY}`;
      script.async = true;
      script.onload = () => resolve(isAvailable());
      script.onerror = () => resolve(false);
      (document.head || document.documentElement).appendChild(script);
    });
    return loadPromise;
  }
  function ensureCalculator() {
    if (calculator) return calculator;
    if (!isAvailable() || typeof document === 'undefined') return null;
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:640px;height:420px;opacity:0;pointer-events:none;';
    document.documentElement.appendChild(host);
    calculator = root.Desmos.GraphingCalculator(host, { expressions: false, settingsMenu: false, zoomButtons: false, keypad: false, border: false });
    return calculator;
  }
  function evaluate(expression) {
    const id = `command-bar-${++sequence}`;
    return loadRuntime().then((loaded) => {
      if (!loaded) return null;
      const instance = ensureCalculator(); if (!instance) return null;
      return new Promise((resolve) => {
        let done = false;
        const finish = (value) => { if (done) return; done = true; clearTimeout(timeout); resolve(value); };
        const timeout = setTimeout(() => finish({ kind: 'error', expression, latex: expression, query: 'Desmos timed out', error: 'Desmos timed out' }), 1200);
        const observe = () => {
          const analysis = instance.expressionAnalysis && instance.expressionAnalysis[id];
          if (!analysis) return;
          if (analysis.isError) finish({ kind: 'error', expression, latex: expression, query: analysis.errorMessage || 'Desmos could not evaluate this expression', error: analysis.errorMessage });
          else if (analysis.evaluation && typeof analysis.evaluation.value !== 'undefined') {
            const value = analysis.evaluation.value;
            const kind = Array.isArray(value) ? 'list' : 'number';
            finish({ kind, expression, latex: expression, value, query: Array.isArray(value) ? `[${value.join(', ')}]` : String(value), expr: expression, source: 'desmos' });
          }
        };
        instance.observe('expressionAnalysis', observe);
        instance.setExpression({ id, latex: String(expression).trim() });
        observe();
      });
    }).catch(() => null);
  }
  function cancel() { if (calculator) calculator.removeExpressions(calculator.getExpressions().map((item) => ({ id: item.id }))); }
  root.CommandBarDesmos = { evaluate, cancel, isAvailable, loadRuntime };
  if (typeof module === 'object' && module.exports) module.exports = root.CommandBarDesmos;
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
