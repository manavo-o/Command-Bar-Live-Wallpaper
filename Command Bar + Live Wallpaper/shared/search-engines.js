(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommandBarSearchEngines = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MODIFIERS = ['shift', 'ctrl', 'alt', 'meta'];
  const SHORTCUT_LABELS = {
    shift: 'Shift+Enter', ctrl: 'Ctrl+Enter', alt: 'Alt+Enter', meta: 'Meta+Enter'
  };

  function normalizeShortcut(value) {
    const raw = String(value || '').toLowerCase().replace(/\s+/g, '');
    if (!raw) return '';
    const parts = raw.split('+');
    if (parts.length !== 2 || parts[1] !== 'enter' || !MODIFIERS.includes(parts[0])) return '';
    return `${parts[0]}+enter`;
  }

  function shortcutLabel(value) {
    const normalized = normalizeShortcut(value);
    return SHORTCUT_LABELS[normalized.split('+')[0]] || 'No shortcut';
  }

  function normalizeUrlTemplate(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('Search URL is required.');
    const malformedPlaceholder = /\{query\}?/g;
    const candidate = raw.includes('{query}') ? raw : raw.includes('%s') ? raw.replace(/%s/g, '{query}') : raw.includes('q%') ? raw.replace(/q%/g, 'q={query}') : raw.includes('{query') ? raw.replace(malformedPlaceholder, '{query}') : `${raw}{query}`;
    let parsed;
    try { parsed = new URL(candidate.replace('{query}', 'test')); } catch (e) { throw new Error('Search URL must be a valid HTTP or HTTPS URL.'); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('Search URL must use HTTP or HTTPS.');
    if (!candidate.includes('{query}')) throw new Error('Search URL must contain a {query} placeholder or be a URL prefix.');
    return candidate;
  }

  function buildUrl(template, query) {
    const normalized = normalizeUrlTemplate(template);
    return normalized.replace(/\{query\}/g, encodeURIComponent(String(query || '')));
  }

  function sanitizeEngine(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim();
    let url = String(raw.url || raw.template || '').trim();
    const shortcut = normalizeShortcut(raw.shortcut);
    if (!name || !url) return null;
    try { url = normalizeUrlTemplate(url); } catch (e) { return null; }
    return {
      id: String(raw.id || `engine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      name: name.slice(0, 80), url, shortcut, enabled: raw.enabled !== false,
      type: raw.type === 'api' ? 'api' : 'url', icon: String(raw.icon || '').slice(0, 300),
      trigger: String(raw.trigger || '').trim().slice(0, 40), isAi: Boolean(raw.isAi),
      api: raw.api && typeof raw.api === 'object' ? { endpoint: String(raw.api.endpoint || '').slice(0, 300), model: String(raw.api.model || '').slice(0, 100) } : null
    };
  }

  function sanitizeEngines(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map(sanitizeEngine).filter((engine) => {
      if (!engine || (engine.shortcut && seen.has(engine.shortcut))) return false;
      if (engine.shortcut) seen.add(engine.shortcut);
      return true;
    });
  }

  function findByShortcut(engines, modifier) {
    const shortcut = normalizeShortcut(`${modifier}+enter`);
    return sanitizeEngines(engines).find((engine) => engine.enabled && engine.shortcut === shortcut) || null;
  }

  function builtInAiEngines() {
    return [{ id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q={query}', shortcut: '', enabled: true, type: 'url', icon: '✦', trigger: 'q%', isAi: true, api: null }];
  }

  return { MODIFIERS, SHORTCUT_LABELS, normalizeShortcut, shortcutLabel, normalizeUrlTemplate, buildUrl, sanitizeEngine, sanitizeEngines, findByShortcut, builtInAiEngines };
}));
