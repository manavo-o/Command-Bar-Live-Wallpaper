/* Site-owned image discovery. Remote SVG is only ever displayed as an image. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SiteIcons = api.create(root);
    chrome.runtime.onMessage.addListener((request, sender, respond) => {
      if (!request || request.type !== 'RESOLVE_SITE_ICONS') return;
      root.SiteIcons.batch(request.items, sender.tab).then(icons => respond({ icons }), () => respond({ icons: [] }));
      return true;
    });
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000, MAX_IMAGE = 128 * 1024, MAX_CACHE = 4 * 1024 * 1024;
  function webUrl(value, base) {
    try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  function candidates(document, base) {
    return Array.from(document.querySelectorAll('link[rel][href]')).map(link => ({
      url: webUrl(link.getAttribute('href'), base),
      rel: (link.getAttribute('rel') || '').toLowerCase(), type: (link.getAttribute('type') || '').toLowerCase()
    })).filter(icon => icon.url && /(^|\s)(icon|mask-icon|apple-touch-icon)(\s|$)/.test(icon.rel))
      .sort((a, b) => Number(b.type === 'image/svg+xml' || /\.svg(?:[?#]|$)/i.test(b.url)) - Number(a.type === 'image/svg+xml' || /\.svg(?:[?#]|$)/i.test(a.url)))
      .map(icon => icon.url).slice(0, 6);
  }
  async function limitedBody(response, limit) {
    if (!response.ok || Number(response.headers.get('content-length')) > limit) {
      if (response.body) await response.body.cancel().catch(() => {});
      throw new Error('Invalid image response');
    }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('Response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return bytes;
  }
  function create(env) {
    const { chrome } = env;
    let cache = {}, ready, active = 0, writes = Promise.resolve();
    const pending = new Map(), queue = [];
    function load() {
      return ready ||= new Promise(resolve => chrome.storage.local.get({ siteIconCache: {} }, data => {
        cache = chrome.runtime.lastError ? {} : data.siteIconCache || {};
        resolve();
      }));
    }
    function save() {
      const entries = Object.entries(cache).sort((a, b) => b[1].used - a[1].used);
      let bytes = 0;
      cache = Object.fromEntries(entries.filter(([key, value], index) => {
        bytes += JSON.stringify([key, value]).length * 2;
        return index < 256 && bytes <= MAX_CACHE;
      }));
      const snapshot = Object.assign({}, cache);
      writes = writes.then(() => new Promise(resolve => chrome.storage.local.set({ siteIconCache: snapshot }, () => { void chrome.runtime.lastError; resolve(); })));
      return writes;
    }
    function schedule(job) {
      if (queue.length >= 64) return Promise.resolve({ src: '', source: 'busy' });
      return new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); drain(); });
    }
    function drain() {
      while (active < 4 && queue.length) {
        const { job, resolve, reject } = queue.shift(); active++;
        Promise.resolve().then(job).then(resolve, reject).finally(() => { active--; drain(); });
      }
    }
    async function request(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        // Never follow an icon endpoint into a website/login document. Parsing
        // remote HTML here can activate resource hints in the background page.
        const response = await env.fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', headers: { Accept: 'image/svg+xml,image/*;q=0.9' } });
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
          if (response.body) await response.body.cancel().catch(() => {});
          throw new Error('Icon endpoint returned a document');
        }
        const bytes = await limitedBody(response, MAX_IMAGE);
        let type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const signature = Array.from(bytes.slice(0, 12));
        const rasterType = signature[0] === 137 && signature[1] === 80 && signature[2] === 78 && signature[3] === 71 ? 'image/png'
          : signature[0] === 255 && signature[1] === 216 && signature[2] === 255 ? 'image/jpeg'
          : signature.slice(0, 3).join(',') === '71,73,70' ? 'image/gif'
          : signature.slice(0, 4).join(',') === '82,73,70,70' && signature.slice(8, 12).join(',') === '87,69,66,80' ? 'image/webp'
          : signature.slice(0, 4).join(',') === '0,0,1,0' ? 'image/x-icon' : '';
        if (type !== 'image/svg+xml') {
          if (!rasterType) throw new Error('Invalid image bytes');
          type = rasterType;
        }
        if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(type)) throw new Error('Not an image');
        if (type === 'image/svg+xml') {
          const svg = new env.DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
          if (svg.documentElement.localName !== 'svg' || svg.querySelector('parsererror')) throw new Error('Invalid SVG');
        }
        let binary = ''; for (const value of bytes) binary += String.fromCharCode(value);
        return { src: `data:${type};base64,${env.btoa(binary)}`, format: type === 'image/svg+xml' ? 'svg' : 'raster' };
      } finally { clearTimeout(timeout); controller.abort(); }
    }
    function browserCache(url) {
      if (!env.Image || !env.document) return Promise.reject(new Error('No image cache adapter'));
      return new Promise((resolve, reject) => {
        const image = new env.Image();
        const timeout = setTimeout(() => finish(new Error('Cache timed out')), 1000);
        function finish(error, value) {
          clearTimeout(timeout); image.onload = image.onerror = null; image.src = '';
          if (error) reject(error); else resolve(value);
        }
        image.onload = () => {
          try {
            const canvas = env.document.createElement('canvas'); canvas.width = canvas.height = 32;
            canvas.getContext('2d').drawImage(image, 0, 0, 32, 32);
            finish(null, { src: canvas.toDataURL('image/png'), format: 'raster', source: 'browser-cache' });
          } catch (error) { finish(error); }
        };
        image.onerror = () => finish(new Error('Cache unavailable'));
        image.src = 'chrome://favicon/size/32@2x/' + url;
      });
    }
    async function declared(tabId) {
      if (!Number.isInteger(tabId)) return [];
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve([]), 1000);
        chrome.tabs.executeScript(tabId, {
          code: "Array.from(document.querySelectorAll('link[rel][href]')).filter(el => /(^|\\s)(icon|mask-icon|apple-touch-icon)(\\s|$)/i.test(el.rel)).map(el => ({url: el.href, type: el.type})).slice(0, 12)",
          runAt: 'document_idle'
        }, result => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) { resolve([]); return; }
          resolve((result && result[0] || []).sort((a, b) => Number(/svg/i.test(b.type + b.url)) - Number(/svg/i.test(a.type + a.url))).map(icon => webUrl(icon.url)).filter(Boolean).slice(0, 6));
        });
      });
    }

    async function resolve(item) {
      const url = webUrl(item.url);
      if (!url) return { key: item.key, src: '', source: 'fallback' };
      await load();
      const origin = new URL(url).origin;
      const supplied = webUrl(item.icon);
      const key = supplied ? 'asset:' + supplied : origin;
      if (!pending.has(key)) pending.set(key, schedule(async () => {
        const entry = cache[key] || (!supplied && cache[origin]), now = Date.now();
        if (entry && now - entry.time < (entry.src ? 7 * DAY : DAY / 4)) { entry.used = now; return entry; }
        let browserIcon = null;
        // MV2 Chromium cache endpoint: capability failure is harmless.
        if (supplied) { try { browserIcon = await request(supplied); } catch (_) {} }
        if (!browserIcon) { try { browserIcon = await browserCache(url); } catch (_) {} }
        let urls = browserIcon && browserIcon.format === 'svg' ? [] : await declared(item.tabId);
        // Closed tabs use direct favicon files; never fetch/parse a home page.
        urls = Array.from(new Set(urls.concat(origin + '/favicon.svg', origin + '/favicon.ico')));
        let best = browserIcon;
        for (const candidate of urls) {
          if (best && best.format === 'svg') break;
          try {
            const icon = await request(candidate);
            if (!best || icon.format === 'svg') best = icon;
            if (best.format === 'svg') break;
          } catch (_) {}
        }
        const result = Object.assign({ src: '', format: '', time: now, used: now, source: 'site' }, best);
        cache[key] = result;
        await save();
        return result;
      }).finally(() => pending.delete(key)));
      return Object.assign({ key: item.key }, await pending.get(key));
    }
    return {
      async batch(items, senderTab) {
        // Private browsing never reads or writes a persistent icon cache.
        if (senderTab && senderTab.incognito) return [];
        return Promise.all((Array.isArray(items) ? items : []).slice(0, 20).filter(item => item && typeof item.url === 'string').map(resolve));
      }
    };
  }
  return { create, webUrl, candidates, limitedBody };
}));
