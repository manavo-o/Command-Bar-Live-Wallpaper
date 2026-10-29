(function (root, factory) {
  const api = factory();
  root.CommandBarIntent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const QUESTION_STARTERS = /^(what|how|why|when|where|who|which|can|should|is|are|explain|compare|summarize)\b/i;

  function scope(query) {
    const q = String(query || '').trim();
    const match = q.match(/^(@history|@bookmarks|\/allwindows)(?=\s|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
  function wordLookup(query) {
    const q = String(query || '').trim();
    // Explicit aliases only: fuzzy matching short commands would capture ordinary searches.
    const commands = { def: 'definition', define: 'definition', dict: 'definition',
      definition: 'definition', dfe: 'definition', df: 'definition', defi: 'definition',
      defintion: 'definition', definiton: 'definition', deifne: 'definition',
      syn: 'synonyms', synonym: 'synonyms', synonyms: 'synonyms',
      sny: 'synonyms', synn: 'synonyms', synomym: 'synonyms', synoynm: 'synonyms' };
    const parts = q.split(/\s+/);
    if (parts.length > 1) {
      const firstKey = parts[0].toLowerCase();
      const first = Object.prototype.hasOwnProperty.call(commands, firstKey) && commands[firstKey];
      const lastKey = parts[parts.length - 1].toLowerCase();
      const last = Object.prototype.hasOwnProperty.call(commands, lastKey) && commands[lastKey];
      if (last) return { mode: last, word: parts.slice(0, -1).join(' ') };
      if (first) return { mode: first, word: parts.slice(1).join(' ') };
    }
    if (/^\S[\w-]{1,40}\s+\?$/i.test(q)) return { mode: 'definition', word: q.replace(/\s*\?$/, '') };
    return null;
  }
  function looksLikeMath(query, evaluate) { return typeof evaluate === 'function' && Boolean(evaluate(String(query || '').trim())); }
  function navigationUrl(query) {
    const text = String(query || '').trim();
    if (!text || /\s/.test(text)) return null;
    const explicit = /^https?:\/\//i.test(text);
    if (!explicit && !/^(?:localhost|(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#]\S*)?$/iu.test(text)) return null;
    try {
      const url = new URL(explicit ? text : 'https://' + text);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
      return url.href;
    } catch (_) { return null; }
  }
  function looksLikeQuestion(query) {
    const q = String(query || '').trim();
    if (!q || /^(?:https?:\/\/|www\.)\S+$|^(?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i.test(q)) return false;
    return QUESTION_STARTERS.test(q) || /\?$/.test(q) ||
      /\b(versus|vs\.?|difference between|pros and cons)\b/i.test(q) ||
      /^(?:please\s+)?(?:help me|tell me|teach me|show me|walk me through|write|draft|rewrite|edit|proofread|translate|summarise|summarize|explain|compare|recommend|suggest|plan|design|create|generate|build|debug|troubleshoot|fix|solve|analyze|analyse|review|optimize|improve)\s+\S/i.test(q) ||
      /^make\s+(?:me\s+)?(?:a|an|the)\s+\S/i.test(q) ||
      /\b(?:not working|won't work|doesn't work|how to|tutorial for|tips for|ideas for|recommendations for)\b/i.test(q);
  }
  function normalizeRoutingMode(value) { return value === 'prefer-ai' ? 'prefer-ai' : 'balanced'; }
  function searchDestination(query, options) {
    const opts = options || {};
    if (opts.shiftKey) return 'google';
    return normalizeRoutingMode(opts.mode) === 'prefer-ai' || looksLikeQuestion(query) ? 'default' : 'google';
  }

  function classify(query, options) {
    const q = String(query || '').trim();
    const opts = options || {};
    if (!q) return { type: 'EMPTY', query: q };
    const scopeName = scope(q);
    if (scopeName) return { type: 'SCOPE', scope: scopeName, query: q };
    if (q.startsWith('/')) return { type: 'ACTION', query: q };
    const lookup = wordLookup(q);
    if (lookup) return { type: 'DICTIONARY', word: lookup.word, mode: lookup.mode, query: q };
    if (looksLikeMath(q, opts.evaluate)) return { type: 'MATH', query: q };
    if (navigationUrl(q)) return { type: 'URL', query: q, url: navigationUrl(q) };
    if (searchDestination(q, { mode: opts.mode }) === 'default') return { type: 'AI', query: q };
    return { type: 'SEARCH', query: q };
  }
  return { navigationUrl, scope, wordLookup, looksLikeQuestion, normalizeRoutingMode, searchDestination, classify };
}));
