(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommandBarResults = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function destinationKey(value) {
    if (!value) return '';
    try { return new URL(value).href; }
    catch (_) { return String(value).trim(); }
  }
  function preferredTab(a, b) {
    return Number(Boolean(b.active)) - Number(Boolean(a.active)) ||
      (b.lastAccessed || 0) - (a.lastAccessed || 0) || a.id - b.id;
  }
  function merge(items, scope) {
    const chosen = new Map();
    const others = [];
    for (const original of items) {
      if (!['TAB', 'HISTORY', 'BOOKMARK'].includes(original.type)) { others.push(original); continue; }
      const key = destinationKey(original.data && original.data.url);
      if (!key) continue;
      const item = Object.assign({}, original, { destinationKey: key });
      const existing = chosen.get(key);
      const tabs = [].concat(existing && existing.tabs || [], item.tabs || (item.type === 'TAB' ? [item.data] : item.tab ? [item.tab] : []));
      const uniqueTabs = Array.from(new Map(tabs.map(tab => [tab.id, tab])).values()).sort(preferredTab);
      const badges = Array.from(new Set([].concat(existing && existing.badges || [], item.badges || [item.type])));
      let best = !existing || (item.score || 0) > (existing.score || 0) ? item : existing;
      if (scope && existing && existing.type === scope) best = existing;
      if (scope && item.type === scope) best = item;
      const result = Object.assign({}, best, {
        score: Math.max(item.score || 0, existing && existing.score || 0),
        badges, tabs: uniqueTabs, tab: uniqueTabs[0], destinationKey: key,
        icon: uniqueTabs.find(tab => tab.favIconUrl)?.favIconUrl || best.icon || existing && existing.icon,
        title: best.title || existing && existing.title || item.data.url
      });
      if (!scope && result.tab) {
        result.type = 'TAB'; result.data = result.tab;
      }
      chosen.set(key, result);
    }
    return Array.from(chosen.values()).concat(others);
  }
  return { destinationKey, preferredTab, merge };
}));
