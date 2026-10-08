(function (root, factory) {
  const api = factory();
  root.CommandBarIntent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const QUESTION_STARTERS = /^(what|how|why|when|where|who|which|can|should|is|are|explain|compare|summarize)\b/i;
  const AI_PREFIX = /^(q%|ai%)\s*/i;

  function scope(query) {
    const q = String(query || '').trim();
    const match = q.match(/^(@history|@bookmarks|\/allwindows)(?=\s|$)/i);
    return match ? match[1].toLowerCase() : null;
  }
  function explicitDictionary(query) {
    const q = String(query || '').trim();
    if (/^(define|def|dict)\s+\S(?:.*\S)?$/i.test(q)) return q.replace(/^(define|def|dict)\s+/i, '').trim();
    if (/^\S[\w-]{1,40}\s+\?$/i.test(q)) return q.replace(/\s*\?$/, '').trim();
    return null;
  }
  function stripQuestionPrefix(query, providers) {
    let value = String(query || '').trim().replace(AI_PREFIX, '');
    (providers || []).some((provider) => {
      const trigger = String(provider.trigger || '').trim();
      if (!trigger || !value.toLowerCase().startsWith(trigger.toLowerCase())) return false;
      value = value.slice(trigger.length).trim();
      return true;
    });
    return value;
  }
  function looksLikeMath(query, evaluate) { return typeof evaluate === 'function' && Boolean(evaluate(String(query || '').trim())); }
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
    const word = explicitDictionary(q);
    if (word) return { type: 'DICTIONARY', word, query: q };
    if (looksLikeMath(q, opts.evaluate)) return { type: 'MATH', query: q };
    const forced = q.match(AI_PREFIX);
    const configured = (opts.providers || []).find((provider) => provider.trigger && q.toLowerCase().startsWith(String(provider.trigger).toLowerCase()));
    if (forced || configured) return { type: 'AI', forced: true, providerId: configured && configured.id, query: stripQuestionPrefix(q, configured ? [configured] : []), trigger: forced ? forced[1].toLowerCase() : configured.trigger };
    if (searchDestination(q, { mode: opts.mode }) === 'default') return { type: 'AI', forced: false, query: q };
    return { type: 'SEARCH', query: q };
  }
  function rank(query, item) {
    const q = String(query || '').trim().toLowerCase();
    const text = `${item.title || ''} ${item.url || ''}`.toLowerCase();
    let score = 0;
    if (text.startsWith(q)) score += 120;
    if ((item.title || '').toLowerCase().startsWith(q)) score += 80;
    if (q && new RegExp(`(^|[\\s./_-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s./_-])`, 'i').test(text)) score += 35;
    return score;
  }
  return { scope, explicitDictionary, looksLikeQuestion, normalizeRoutingMode, searchDestination, classify, rank };
}));
