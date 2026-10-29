const test = require('node:test');
const assert = require('node:assert/strict');
const { create, webUrl, limitedBody, candidates } = require('./background-site-icons');
const png = 'data:image/png;base64,aWNvbg==';
function harness(initial = {}) {
  let stored = initial, fetches = [], writes = 0, inFlight = 0, peak = 0;
  const env = {
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    DOMParser: class { parseFromString(text, kind) { return kind === 'text/html' ? { querySelectorAll: () => [] } : { documentElement: { localName: text.startsWith('<svg') ? 'svg' : 'html' }, querySelector: () => null }; } },
    chrome: { runtime: {}, tabs: { executeScript(id, options, cb) { cb([[]]); } }, storage: { local: {
      get(defaults, cb) { cb({ siteIconCache: stored }); }, set(data, cb) { writes++; stored = data.siteIconCache; cb(); }
    } } },
    async fetch(url, options) {
      fetches.push({ url, options }); inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1)); inFlight--;
      if (url.endsWith('/favicon.svg')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'content-type': 'image/svg+xml' } });
      throw new Error('Unavailable');
    }
  };
  return { env, service: create(env), fetches, get stored() { return stored; }, get writes() { return writes; }, get peak() { return peak; } };
}
test('fresh persistent cache is used without network requests; private browsing does not touch it', async () => {
  const h = harness({ 'https://example.com': { src: png, time: Date.now(), used: Date.now() } });
  assert.equal((await h.service.batch([{ key: 'a', url: 'https://example.com/private?q=x' }]))[0].src, png);
  assert.equal(h.fetches.length, 0);
  assert.deepEqual(await h.service.batch([{ url: 'https://other.test' }], { incognito: true }), []);
  assert.equal(h.fetches.length, 0);
});
test('discovery shares origin requests, prefers SVG, persists images, and omits private path and credentials', async () => {
  const h = harness();
  const rows = await h.service.batch([{ key: 'a', url: 'https://example.com/private?q=x' }, { key: 'b', url: 'https://example.com/other' }]);
  assert.equal(rows[0].format, 'svg'); assert.equal(rows[1].key, 'b');
  assert.equal(h.fetches.filter(request => request.url === 'https://example.com/').length, 0);
  assert.ok(h.fetches.every(request => request.options.redirect === 'error'));
  assert.equal(h.writes, 1);
  assert.ok(h.fetches.every(request => request.options.credentials === 'omit' && request.options.referrerPolicy === 'no-referrer'));
  assert.ok(h.fetches.filter(request => request.url.startsWith('https:')).every(request => !request.url.includes('private')));
  const second = create(h.env); await second.batch([{ key: 'c', url: 'https://example.com' }]);
  assert.equal(h.writes, 1);
});
test('negative cache prevents repeated discovery and expires', async () => {
  const h = harness(); h.env.fetch = async url => { h.fetches.push(url); throw new Error('offline'); };
  await h.service.batch([{ url: 'https://example.com' }]); const count = h.fetches.length;
  await h.service.batch([{ url: 'https://example.com' }]); assert.equal(h.fetches.length, count);
  h.stored['https://example.com'].time = 0;
  await h.service.batch([{ url: 'https://example.com' }]); assert.ok(h.fetches.length > count);
});
test('discovery concurrency and persistent cache size remain bounded', async () => {
  const initial = Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['https://old' + i + '.test', { src: png, time: Date.now(), used: i }]));
  const h = harness(initial);
  await h.service.batch(Array.from({ length: 12 }, (_, i) => ({ url: 'https://new' + i + '.test' })));
  assert.ok(h.peak <= 4); assert.ok(Object.keys(h.stored).length <= 256);
  assert.ok(JSON.stringify(h.stored).length * 2 <= 4 * 1024 * 1024);
});
test('URL validation and bounded body reads reject unsupported schemes and oversized assets', async () => {
  assert.equal(webUrl('javascript:alert(1)'), ''); assert.equal(webUrl('https://user:pass@example.com'), '');
  assert.equal(webUrl('/icon.svg', 'https://example.com'), 'https://example.com/icon.svg');
  await assert.rejects(limitedBody(new Response('123456'), 3));
});
test('declared SVG icons rank before raster and relative URLs resolve', () => {
  const links = [{ href: '/icon.png', rel: 'shortcut icon', type: 'image/png' }, { href: '/vector.svg', rel: 'icon', type: 'image/svg+xml' }, { href: '/script', rel: 'preload' }];
  const doc = { querySelectorAll: () => links.map(link => ({ getAttribute: key => link[key] || '' })) };
  assert.deepEqual(candidates(doc, 'https://example.com'), ['https://example.com/vector.svg', 'https://example.com/icon.png']);
});
test('icon discovery never downloads or parses website HTML or follows document redirects', async () => {
  const h = harness();
  let parsed = 0, cancelled = 0;
  h.env.DOMParser = class { parseFromString() { parsed++; throw new Error('HTML must not be parsed'); } };
  h.env.fetch = async (url, options) => {
    h.fetches.push({url,options});
    assert.equal(options.redirect,'error');
    assert.match(options.headers.Accept,/image\/svg\+xml/);
    return {ok:true, headers:new Headers({'content-type':'text/html'}),body:{async cancel(){cancelled++;},getReader(){throw new Error('HTML must not be read');}}};
  };
  const result = await h.service.batch([{url:'https://chatgpt.com/private?query=secret',icon:'https://chatgpt.com/icon'}]);
  assert.equal(result[0].src,''); assert.equal(parsed,0); assert.equal(cancelled,3);
  assert.deepEqual(h.fetches.map(x=>x.url),['https://chatgpt.com/icon','https://chatgpt.com/favicon.svg','https://chatgpt.com/favicon.ico']);
});
test('open-tab declared SVG discovery works without fetching a home page', async () => {
  const h = harness();
  h.env.chrome.tabs.executeScript = (id,options,cb) => {assert.equal(id,7); cb([[{url:'https://cdn.example.com/favicon.svg',type:'image/svg+xml'}]]);};
  const result = await h.service.batch([{url:'https://example.com/private',tabId:7}]);
  assert.equal(result[0].format,'svg');
  assert.deepEqual(h.fetches.map(x=>x.url),['https://cdn.example.com/favicon.svg']);
});
