(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WallpaperDB = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const DB_NAME = 'WallpaperStorageDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'wallpapers';

  function openWallpaperDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  function transact(mode, operation) {
    return openWallpaperDB().then((db) => new Promise((resolve, reject) => {
      let result;
      try {
        const tx = db.transaction(STORE_NAME, mode);
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Wallpaper transaction failed')); };
        const req = operation(tx.objectStore(STORE_NAME));
        req.onsuccess = () => { result = req.result; };
      } catch (error) {
        db.close();
        reject(error);
      }
    }));
  }

  function putWallpaperBlob(id, blob) {
    return transact('readwrite', (store) => store.put({ id, blob })).then(() => undefined);
  }

  function getWallpaperBlob(id) {
    return transact('readonly', (store) => store.get(id)).then((record) => record ? record.blob : null);
  }

  function deleteWallpaperBlob(id) {
    return transact('readwrite', (store) => store.delete(id)).then(() => undefined);
  }

  return {
    openWallpaperDB,
    putWallpaperBlob,
    getWallpaperBlob,
    deleteWallpaperBlob
  };
}));