const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('all entry points load existing scripts in dependency order and retain the math renderer', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json'));
  const injected = fs.readFileSync('background/background-bootstrap.js','utf8').match(/const scripts = \[([\s\S]*?)\];/)[1];
  const lists = [manifest.background.scripts, ...['newtab.html','options.html'].map(file => [...fs.readFileSync(file,'utf8').matchAll(/<script src="([^"]+)"/g)].map(x => x[1])), [...injected.matchAll(/'([^']+\.js)'/g)].map(x => x[1])];
  for (const scripts of lists) {
    for (const file of scripts) assert.ok(fs.existsSync(file), file);
    if (scripts.includes('shared/storage-migrations.js')) assert.ok(scripts.indexOf('shared/search-engines.js') < scripts.indexOf('shared/storage-migrations.js'));
    if (scripts.includes('command-bar/command-bar-bootstrap.js')) assert.ok(scripts.indexOf('command-bar/command-bar-view.bundle.js') >= 0 && scripts.indexOf('command-bar/command-bar-view.bundle.js') < scripts.indexOf('command-bar/command-bar-bootstrap.js'));
    if (scripts.includes('overlay-card.js')) assert.ok(scripts.indexOf('command-bar/math-renderer.js') < scripts.indexOf('overlay-card.js'));
  }
  function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x => x.isDirectory() && !x.name.startsWith('.') && x.name !== 'node_modules' ? files(path.join(dir,x.name)) : x.isFile() && x.name.endsWith('.js') && !x.name.endsWith('.test.js') && !x.name.endsWith('.bundle.js') ? [path.join(dir,x.name)] : []); }
  for (const file of files('.')) assert.doesNotMatch(fs.readFileSync(file,'utf8'), /CommandBarDesmos|perplexity|(?:Background|CommandBar|NewTab|Options)Modules\s*=/i, file);
});
test('search facade exposes suggestion promotion and obsolete prefixes no longer select providers', () => {
  const search = require('./overlay-search'), intent = require('./command-bar/query-intent');
  assert.equal(search.shouldPromoteSuggestions('coffee shops'), true);
  assert.equal(search.shouldPromoteSuggestions('github.com'), false);
  assert.equal(intent.classify('q% coffee').type, 'SEARCH');
  assert.equal(intent.classify('ai% coffee').type, 'SEARCH');
  assert.equal(intent.classify('why is the sky blue?').type, 'AI');
});
test('profile import drops removed settings and sanitizes URL engines; export excludes private runtime caches', () => {
  const source = fs.readFileSync('options/options-bootstrap.js','utf8');
  const root = {};
  for (const file of ['shared/storage-keys.js','shared/search-engines.js']) vm.runInNewContext(fs.readFileSync(file,'utf8'), { self: root, URL });
  const imported = { aiDefaultProvider:'old', customQuickLinks:[], wallpapers:[{id:'wall'}], actionFavorites:['new-tab'], widgetPos:{left:20,top:30}, customSearchEngines:[{id:'url',name:'Search',url:'https://example.com/?q=',isAi:true},{id:'api',name:'API',url:'https://example.com/',type:'api'}] };
  const ctx=vm.createContext({window:root,parsed:imported,allData:{...imported,siteIconCache:{},visitLog:{}},URL});
  const start=source.indexOf('        const allowed =');
  vm.runInContext(source.slice(start,source.indexOf('        saveSettings(safe',start))+'\nglobalThis.result=safe;',ctx);
  assert.equal(ctx.result.aiDefaultProvider,undefined); assert.equal(ctx.result.customQuickLinks,undefined);
  assert.equal(ctx.result.dashboardPos.left,20); assert.equal(ctx.result.wallpapers[0].id,'wall'); assert.equal(ctx.result.actionFavorites[0],'new-tab');
  assert.equal(ctx.result.customSearchEngines.length,1); assert.equal(ctx.result.customSearchEngines[0].isAi,undefined);
  const exportStart=source.indexOf('      const allowed =');
  vm.runInContext('(function(){'+source.slice(exportStart,source.indexOf('      const dataStr',exportStart))+'globalThis.exported=exportData;})()',ctx);
  assert.equal(ctx.exported.siteIconCache,undefined); assert.equal(ctx.exported.visitLog,undefined); assert.equal(ctx.exported.aiDefaultProvider,undefined);
});
