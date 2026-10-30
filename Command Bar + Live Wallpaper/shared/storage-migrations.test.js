const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function migrate(data, failRemove = false) {
  const writes = [], removed = [];
  const root = { CommandBarSearchEngines: require('./search-engines'), WidgetLayout: require('./widget-layout'), CommandBarStorage: {
    SCHEMA_VERSION: 7, get(defaults, cb) { cb({ ...defaults, ...data }); },
    set(values, cb) { writes.push(values); if (cb) cb(true); }
  } };
  const chrome = { runtime: {}, storage: { local: { remove(keys, cb) { removed.push(...keys); if (failRemove) chrome.runtime.lastError = {}; cb(); } } } };
  vm.runInNewContext(fs.readFileSync('shared/storage-migrations.js', 'utf8'), { self: root, chrome });
  return { writes, removed };
}
test('schema 6 retains legacy placement, favorites and URL engines while removing provider metadata', () => {
  const { writes, removed } = migrate({ storageSchemaVersion: 4, widgetPos: { left: 123, top: 45 }, disabledActions: ['close-window'], actionFavorites: ['new-tab'], customSearchEngines: [
    { id: 'url', name: 'Search', url: 'https://example.com/?q=', type: 'url', isAi: true, trigger: 'ask%', api: {} },
    { id: 'api', name: 'API', url: 'https://example.com/', type: 'api' }
  ] });
  assert.equal(writes[0].dashboardPos.left, 123);
  assert.deepEqual(Array.from(writes[0].actionFavorites), ['new-tab']);
  assert.deepEqual(Array.from(writes[0].disabledActions), ['close-window']);
  assert.equal(writes[0].customSearchEngines.length, 1);
  assert.equal(writes[0].customSearchEngines[0].isAi, undefined);
  assert.equal(writes.at(-1).storageSchemaVersion, 7);
  assert.ok(removed.includes('customQuickLinks'));
  assert.ok(removed.includes('aiDefaultProvider'));
});
test('schema 5 reset stays reset; schema 6 migration is idempotent and failures can retry', () => {
  assert.equal(migrate({ storageSchemaVersion: 5, dashboardPos: null, widgetPos: { left: 1, top: 2 } }).writes[0].dashboardPos, null);
  assert.equal(migrate({ storageSchemaVersion: 7 }).writes.length, 0);
  assert.equal(migrate({ __error: 'Read failed' }).writes.length, 0);
  assert.equal(migrate({ storageSchemaVersion: 4, dashboardPos: { left: 77, top: 88 } }).writes[0].dashboardPos.left, 77);
  assert.equal(migrate({}, true).writes.some(x => x.storageSchemaVersion), false);
});

 test('schema 7 migrates old dashboard position and preserves existing normalized layouts', () => {
  const first = migrate({storageSchemaVersion:6,dashboardPos:{left:120,top:90}});
  assert.deepEqual(JSON.parse(JSON.stringify(first.writes[0].widgetLayout)),{version:1,legacyOrigin:{left:120,top:90}});
  const existing={version:1,cards:{weather:{x:.7,y:.3}}};
  assert.deepEqual(JSON.parse(JSON.stringify(migrate({storageSchemaVersion:6,widgetLayout:existing}).writes[0].widgetLayout)),existing);
  assert.equal(migrate({storageSchemaVersion:6,dashboardPos:null,widgetPos:{left:123,top:456}}).writes[0].widgetLayout,null);
 });
