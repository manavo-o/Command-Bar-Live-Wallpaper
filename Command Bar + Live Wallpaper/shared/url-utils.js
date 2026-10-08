(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommandBarUrl = api;
}(typeof self !== 'undefined' ? self : this, function () {
  return {
    normalize: function (value) {
      if (!value) return '';
      try {
        const url = new URL(value);
        url.hash = '';
        url.hostname = url.hostname.replace(/^www\./, '');
        return url.href.replace(/\/$/, '').toLowerCase();
      } catch (e) {
        return String(value).trim().toLowerCase();
      }
    },
    isWebUrl: function (value) {
      return /^https?:\/\//i.test(String(value || ''));
    }
  };
}));
