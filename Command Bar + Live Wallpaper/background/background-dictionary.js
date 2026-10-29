(function (root, factory) {
  const api = factory();
  root.BackgroundDictionary = api.create(typeof fetch === 'function' ? fetch.bind(root) : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function distance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  }
  function correctedWord(word, candidates) {
    const words = (Array.isArray(candidates) ? candidates : []).map(x => x && x.word).filter(x => typeof x === 'string' && /^[a-z]+(?:[-' ][a-z]+)*$/i.test(x));
    if (words.some(x => x.toLowerCase() === word)) return word;
    // Avoid guessing at phrases, very short words, or distant alternatives.
    if (!/^[a-z]{4,}$/.test(word)) return word;
    const limit = word.length < 6 ? 1 : 2;
    const best = words.map(value => ({ value, distance: distance(word, value.toLowerCase()) })).sort((a, b) => a.distance - b.distance)[0];
    return best && best.distance <= limit ? best.value.toLowerCase() : word;
  }
  function create(fetcher) {
    const cache = new Map(), pending = new Map();
    async function json(url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetcher(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) { const error = new Error('Lookup failed'); error.notFound = res.status === 404; throw error; }
        return await res.json();
      } finally { clearTimeout(timer); }
    }
    async function resolve(word) {
      try { return correctedWord(word, await json('https://api.datamuse.com/words?sp=' + encodeURIComponent(word) + '&max=8')); }
      catch (_) { return word; }
    }
    async function run(original, mode) {
      const word = await resolve(original);
      const base = { word, mode, correctedFrom: word !== original ? original : '' };
      try {
        if (mode === 'synonyms') {
          const data = await json('https://api.datamuse.com/words?rel_syn=' + encodeURIComponent(word) + '&max=18');
          const synonyms = [...new Set((Array.isArray(data) ? data : []).map(x => x && x.word).filter(x => typeof x === 'string' && x.toLowerCase() !== word))];
          return { ...base, status: synonyms.length ? 'success' : 'not_found', synonyms };
        }
        const data = await json('https://freedictionaryapi.com/api/v1/entries/en/' + encodeURIComponent(word));
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const meanings = entries.map(entry => ({
          partOfSpeech: entry.partOfSpeech || 'general',
          definitions: (Array.isArray(entry.senses) ? entry.senses : []).slice(0, 3).map(s => ({ definition: s.definition || '', example: Array.isArray(s.examples) ? s.examples[0] : '' })).filter(d => d.definition),
          synonyms: (Array.isArray(entry.synonyms) ? entry.synonyms : []).filter(x => typeof x === 'string').slice(0, 6)
        })).filter(m => m.definitions.length);
        const pronunciation = entries.flatMap(e => Array.isArray(e.pronunciations) ? e.pronunciations : []).find(p => p && typeof p.text === 'string' && p.text.trim());
        return { ...base, status: meanings.length ? 'success' : 'not_found', word: data.word || word, phonetic: pronunciation ? pronunciation.text : '', meanings };
      } catch (error) { return { ...base, status: error.notFound ? 'not_found' : 'unavailable' }; }
    }
    function lookup(value, requestedMode) {
      const mode = requestedMode === 'synonyms' ? 'synonyms' : 'definition';
      const word = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
      if (!word || word.length > 80 || !/^[a-z]+(?:[-' ][a-z]+)*$/i.test(word)) return Promise.resolve({ status: 'not_found', word, mode });
      const key = mode + ':' + word, saved = cache.get(key);
      if (saved && saved.expires > Date.now()) return Promise.resolve(saved.data);
      if (pending.has(key)) return pending.get(key);
      const task = run(word, mode).then(data => {
        cache.delete(key);
        cache.set(key, { data, expires: Date.now() + (data.status === 'success' ? 3600000 : 30000) });
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return data;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    }
    return { lookup };
  }
  return { create, correctedWord, distance };
}));
