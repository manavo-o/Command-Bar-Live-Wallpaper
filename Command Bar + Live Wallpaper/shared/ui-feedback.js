(function (root) {
  function tactile(kind) {
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (root.navigator && typeof root.navigator.vibrate === 'function') {
      const duration = kind === 'snap' ? 8 : kind === 'success' ? 12 : 5;
      try { root.navigator.vibrate(duration); } catch (_) { /* unsupported desktop browser */ }
    }
  }

  root.CommandBarUI = root.CommandBarUI || {};
  root.CommandBarUI.tactile = tactile;
}(typeof self !== 'undefined' ? self : window));
