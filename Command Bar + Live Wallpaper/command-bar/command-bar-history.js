(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./command-bar-results.js'));
  else root.CommandBarHistory = factory(root.CommandBarResults);
}(typeof self !== 'undefined' ? self : this, function (results) {
  function normalizeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.hostname = u.hostname.replace(/^www\./, '');
      u.hash = '';
      return u.href.replace(/\/$/, '').toLowerCase();
    } catch (e) {
      return String(url).trim().toLowerCase();
    }
  }

  function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
    catch (e) { return ''; }
  }

  function usageKey(item) {
    if (!item) return '';
    if (item.type === 'SEARCH') return 'SEARCH:' + normalizeQuery(item.data && item.data.query);
    if (item.type === 'SEARCH_ENGINE') return 'SEARCH_ENGINE:' + String(item.data && item.data.engineId || '');
    if (item.type === 'ACTION') return 'ACTION:' + String(item.data && item.data.id || '');
    return String(item.type || 'RESULT') + ':' + normalizeUrl(item.data && item.data.url);
  }

  function normalizeQuery(query) {
    return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function usageBoost(query, item, usage) {
    const entry = usage && usage[normalizeQuery(query)] && usage[normalizeQuery(query)][usageKey(item)];
    if (!entry) return 0;
    const age = Math.max(0, Date.now() - (entry.lastUsed || 0));
    const recency = age < 24 * 60 * 60 * 1000 ? 10 : age < 7 * 24 * 60 * 60 * 1000 ? 5 : 2;
    return Math.min(18, (entry.count || 0) * recency);
  }

  function rankHistory(items, query, usage) {
    const q = normalizeQuery(query);
    return (items || []).map((item) => {
      const literal = ((item.title || '') + ' ' + (item.url || '')).toLowerCase();
      const prefix = q && (String(item.title || '').toLowerCase().startsWith(q) ||
        String(item.url || '').toLowerCase().startsWith(q)) ? 100 : 0;
      const frequency = Math.log1p(Math.max(0, Number(item.visitCount) || 0)) * 18;
      const typedFrequency = Math.log1p(Math.max(0, Number(item.typedCount) || 0)) * 12;
      return Object.assign({}, item, {
        historyScore: prefix + (item.frecency || 0) * 1.4 + frequency + typedFrequency + usageBoost(query, { type: 'HISTORY', data: item }, usage),
        historyLiteral: q ? (literal.indexOf(q) !== -1 ? 1 : 0) : 0
      });
    }).sort((a, b) =>
      (b.historyScore - a.historyScore) ||
      (b.historyLiteral - a.historyLiteral) ||
      ((b.lastVisitTime || 0) - (a.lastVisitTime || 0)) ||
      ((b.visitCount || 0) - (a.visitCount || 0)) ||
      normalizeUrl(a.url).localeCompare(normalizeUrl(b.url))
    );
  }

  function dedupeHistory(items, query, usage) {
    const chosen = new Map();
    rankHistory(items, query, usage).forEach((item) => {
      const key = results.destinationKey(item.url);
      if (key && !chosen.has(key)) chosen.set(key, item);
    });
    return Array.from(chosen.values());
  }

  function groupHistory(items, query, usage) {
    const groups = new Map();
    dedupeHistory(items, query, usage).forEach((item) => {
      const key = hostname(item.url) || '(other)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const aBest = a[1][0], bBest = b[1][0];
      return ((bBest.historyScore || 0) - (aBest.historyScore || 0)) || a[0].localeCompare(b[0]);
    }).flatMap(([group, groupItems]) => [{ type: 'HISTORY_GROUP', group, title: group, count: groupItems.length }, ...groupItems.map((item) => ({
      type: 'HISTORY', data: item, title: item.title, sub: item.url, historyGroup: group
    }))]);
  }

  function relativeTime(timestamp, now) {
    if (!timestamp) return '';
    const seconds = Math.max(0, Math.floor(((now || Date.now()) - timestamp) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    if (seconds < 2592000) return Math.floor(seconds / 604800) + 'w ago';
    return Math.floor(seconds / 2592000) + 'mo ago';
  }

  return { normalizeUrl, normalizeQuery, hostname, usageKey, usageBoost, rankHistory, dedupeHistory, groupHistory, relativeTime };
}));
