const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function database() {
  let tx, request, closed = 0;
  const db = { close() { closed++; }, transaction() {
    tx = { objectStore() { return { get() { return request = {}; }, put() { return request = {}; }, delete() { return request = {}; } }; } };
    return tx;
  } };
  const context = vm.createContext({ module: {exports:{}}, indexedDB: { open() {
    const open = {}; queueMicrotask(() => open.onsuccess({target:{result:db}})); return open;
  } } });
  vm.runInContext(fs.readFileSync('db.js','utf8'),context);
  return { api: context.module.exports, db, get tx() {return tx;}, get request() {return request;}, get closed() {return closed;} };
}
test('database closes on completion and writes wait for commit', async () => {
  const h = database(); let resolved = false;
  const pending = h.api.putWallpaperBlob('a', {}).then(() => { resolved = true; });
  await new Promise(resolve => setImmediate(resolve));
  h.request.onsuccess(); await Promise.resolve(); assert.equal(resolved,false);
  h.tx.oncomplete(); await pending; assert.equal(h.closed,1);
  h.db.onversionchange(); assert.equal(h.closed,2);
});
test('database returns blobs and closes on abort', async () => {
  const h = database(); const read = h.api.getWallpaperBlob('a');
  await new Promise(resolve => setImmediate(resolve));
  h.request.result = {blob:'payload'}; h.request.onsuccess(); h.tx.oncomplete();
  assert.equal(await read,'payload'); assert.equal(h.closed,1);
  const write = h.api.deleteWallpaperBlob('a');
  await new Promise(resolve => setImmediate(resolve));
  h.tx.error = new Error('aborted'); h.tx.onabort();
  await assert.rejects(write,/aborted/); assert.equal(h.closed,2);
});
