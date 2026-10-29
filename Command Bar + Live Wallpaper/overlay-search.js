// Compatibility facade for consumers that historically loaded overlay-search.js.
// The implementation now lives in command-bar/fuzzy-search.js and
// command-bar/calculator-parser.js.
(function (root) {
  const fuzzy = root.CommandBarFuzzySearch || (typeof require === 'function' ? require('./command-bar/fuzzy-search') : {});
  const calculator = root.CommandBarCalculator || (typeof require === 'function' ? require('./command-bar/calculator-parser') : {});
  const api = {
    fuzzyScore: fuzzy.fuzzyScore,
    fuzzyMatchPositions: fuzzy.fuzzyMatchPositions,
    calculateCompositeScore: fuzzy.calculateCompositeScore,
    evaluateCalc: calculator.evaluate,
    shouldPromoteSuggestions: fuzzy.shouldPromoteSuggestions
  };
  root.OverlaySearch = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
