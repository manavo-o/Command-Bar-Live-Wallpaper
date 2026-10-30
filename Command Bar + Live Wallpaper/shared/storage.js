(function (root) {
  const storage = root.CommandBarStorage = root.CommandBarStorage || {};
  const defaults = storage.DEFAULTS || {};

  function get(request, callback) {
    const query = request == null ? defaults : request;
    try {
      chrome.storage.local.get(query, (result) => {
        if (chrome.runtime.lastError) {
          if (callback) callback(Object.assign({}, typeof query === 'object' ? query : {}, { __error: chrome.runtime.lastError.message }));
          return;
        }
        callback && callback(result || {});
      });
    } catch (error) {
      callback && callback(Object.assign({}, typeof query === 'object' ? query : {}, { __error: error.message }));
    }
  }

  function set(values, callback) {
    try {
      chrome.storage.local.set(values, () => callback && callback(!chrome.runtime.lastError));
    } catch (error) {
      callback && callback(false, error);
    }
  }


  function debounceWrite(delay) {
    let timer = null;
    let pending = {};
    return function (values, callback) {
      Object.assign(pending, values || {});
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = pending;
        pending = {};
        set(next, callback);
      }, delay || 150);
    };
  }

  storage.get = get;
  storage.set = set;
  storage.debounceWrite = debounceWrite;
  storage.SCHEMA_VERSION = 7;
}(typeof self !== 'undefined' ? self : window));
