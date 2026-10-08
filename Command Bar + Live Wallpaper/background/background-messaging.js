// Central message-router boundary. The compatibility router remains in the
// bootstrap so every legacy request name and response shape is unchanged.
(function (root) { root.BackgroundModules = root.BackgroundModules || {}; root.BackgroundModules.messaging = true; }(typeof self !== 'undefined' ? self : window));
