(function (root) {
  // MV2-compatible shared runtime helpers. Keep this file dependency-free so
  // it can be loaded before the command-bar modules in every execution path.
  root.CommandBarRuntime = {
    isContextValid: function () {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime) && Boolean(chrome.runtime.id);
    },
    safeSendMessage: function (message, callback) {
      if (!this.isContextValid()) return;
      try {
        chrome.runtime.sendMessage(message, function (res) {
          if (chrome.runtime.lastError) return;
          if (typeof callback === 'function') callback(res);
        });
      } catch (e) {}
    }
  };
}(typeof self !== 'undefined' ? self : window));
