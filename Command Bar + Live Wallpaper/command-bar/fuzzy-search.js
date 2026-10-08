(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CommandBarFuzzySearch = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Keep source policy in one place so the command bar can be tuned without
  // changing selection behavior. Browser history is the durable destination
  // signal; bookmarks are valuable fallbacks and tabs are convenience hits.
  const RANKING_CONFIG = Object.freeze({
    sourceWeights: Object.freeze({ HISTORY: 2.4, TAB: 0.45, BOOKMARK: 0.9 }),
    frecencyWeight: 0.9,
    visitFrequencyWeight: 46,
    typedFrequencyWeight: 72,
    activeTabBonus: 8,
    pinnedTabBonus: 5
  });

  function classifyQuery(query, context) {
    const q = String(query || '').trim();
    if (!q) return 'EMPTY';
    if (/^(?:[a-z][a-z0-9+.-]*:\/\/|\/|@)/i.test(q) || /\.[a-z]{2,}(?:\/|$)/i.test(q)) return 'URL_LIKE';
    if (context && context.hasStrongLocalMatch && !/\s/.test(q)) return 'SITE_LIKE';
    if (/\s/.test(q)) return 'NATURAL_LANGUAGE';
    return 'GENERIC_SINGLE_TOKEN';
  }

  function shouldPromoteSuggestions(query, context) {
    const intent = classifyQuery(query, context);
    return intent === 'NATURAL_LANGUAGE' || intent === 'GENERIC_SINGLE_TOKEN';
  }

  // ---- Match scoring ----------------------------------------------------
  // A real address bar treats "the query appears as a run of characters"
  // (a substring/prefix hit) as a fundamentally different, much stronger
  // signal than "the query's letters appear scattered anywhere in the
  // text" (a sparse subsequence hit). The previous version scored both
  // the same way, which is why a 3-letter query like "hel" could match
  // "Google Gemini" (h from "https", e from "gemini", l from "google")
  // and, once frecency was added on top, actually outrank the literal
  // web-search action and the real autosuggest chips.
  //
  // Now: contiguous substring/prefix matches are scored generously.
  // Scattered subsequence matches are only attempted for queries of 4+
  // characters (short queries are the ones most prone to spurious
  // scattered hits) and are heavily discounted relative to a real
  // substring hit, so they only ever surface when nothing better exists.
  function fuzzyScore(pattern, text) {
    if (!pattern) return 1;
    const p = pattern.toLowerCase();
    const t = text.toLowerCase();

    const idx = t.indexOf(p);
    if (idx !== -1) {
      let score = 50 + p.length * 4;
      const prevChar = idx === 0 ? '' : t[idx - 1];
      if (idx === 0 || prevChar === ' ' || prevChar === '/' || prevChar === '.' || prevChar === '-' || prevChar === '_') {
        score += 30;
      }
      return score;
    }

    if (p.length < 4) return 0;

    let pIdx = 0, score = 0, consecutive = 0;
    for (let tIdx = 0; tIdx < t.length; tIdx++) {
      if (t[tIdx] === p[pIdx]) {
        score += 3 + consecutive * 2;
        consecutive++;
        pIdx++;
        if (pIdx === p.length) break;
      } else {
        consecutive = 0;
      }
    }
    if (pIdx !== p.length) return 0;
    return Math.max(0, score - 10);
  }

  // Mirrors fuzzyScore's own matching path (contiguous-first, scattered
  // fallback only for 4+ char patterns) so highlighting always reflects
  // the exact characters that earned the score — never a mismatched or
  // misleading run.
  function fuzzyMatchPositions(pattern, text) {
    if (!pattern) return [];
    const p = pattern.toLowerCase();
    const t = text.toLowerCase();

    const idx = t.indexOf(p);
    if (idx !== -1) {
      const positions = [];
      for (let i = 0; i < p.length; i++) positions.push(idx + i);
      return positions;
    }

    if (p.length < 4) return null;

    let pIdx = 0;
    const positions = [];
    for (let tIdx = 0; tIdx < t.length; tIdx++) {
      if (t[tIdx] === p[pIdx]) {
        positions.push(tIdx);
        pIdx++;
        if (pIdx === p.length) break;
      }
    }
    return pIdx === p.length ? positions : null;
  }

  // item: { title, url, frecency, visitCount, typedCount, source } — frecency
  // is pre-computed from the background visit log; source multipliers then
  // make durable history a stronger default than merely-open tabs.
  function calculateCompositeScore(query, item, options) {
    const textToSearch = (item.title || '') + ' ' + (item.url || '');
    const matchScore = fuzzyScore(query, textToSearch);
    if (matchScore <= 0) return 0;

    let score = matchScore;
    const frecency = item.frecency || 0;

    let prefixBonus = 0;
    const q = query.toLowerCase();
    const urlLower = (item.url || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();

    try {
      const host = new URL(urlLower).hostname.replace(/^www\./, '');
      if (host.startsWith(q)) prefixBonus += 50;
    } catch (e) {}
    if (titleLower.startsWith(q) || urlLower.startsWith(q)) prefixBonus += 40;
    const boundaryPattern = new RegExp(`(^|[\\s./_-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s./_-])`, 'i');
    if (boundaryPattern.test(textToSearch)) prefixBonus += 18;

    const source = String((options && options.source) || item.source || '').toUpperCase();
    const sourceWeight = RANKING_CONFIG.sourceWeights[source] || 1;
    const visitCount = Math.max(0, Number(item.visitCount) || 0);
    const typedCount = Math.max(0, Number(item.typedCount) || 0);
    const frequency = Math.log1p(visitCount) * RANKING_CONFIG.visitFrequencyWeight;
    const typedFrequency = Math.log1p(typedCount) * RANKING_CONFIG.typedFrequencyWeight;
    const tabBonus = source === 'TAB'
      ? (item.active ? RANKING_CONFIG.activeTabBonus : 0) + (item.pinned ? RANKING_CONFIG.pinnedTabBonus : 0)
      : 0;

    score += (frecency * RANKING_CONFIG.frecencyWeight) + prefixBonus + frequency + typedFrequency + tabBonus;
    return score * sourceWeight;
  }

  return { fuzzyScore, fuzzyMatchPositions, calculateCompositeScore, classifyQuery, shouldPromoteSuggestions, RANKING_CONFIG };
}));
