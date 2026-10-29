(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetDashboard = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function clamp(position, width, height, viewportWidth, viewportHeight) {
    const margin = viewportWidth < 640 ? 16 : 32;
    return {
      left: Math.max(margin, Math.min(viewportWidth - width - margin, Number.isFinite(position && position.left) ? position.left : margin)),
      top: Math.max(margin, Math.min(viewportHeight - height - margin, Number.isFinite(position && position.top) ? position.top : margin))
    };
  }
  function mount(document, window, chrome) {
    const dashboard = document.getElementById('widget-dashboard');
    const handle = document.getElementById('dashboard-handle');
    const status = document.getElementById('dashboard-move-status');
    let position = null, committed = null, gesture = null, frame = null, suspended = Boolean(document.hidden);
    let keyboardStart = null, observer = null, revision = 0;
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds = value => clamp(value, dashboard.offsetWidth, dashboard.offsetHeight, window.innerWidth, window.innerHeight);
    function paint(value) {
      position = bounds(value);
      dashboard.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
    }
    function stop() { if (frame !== null) window.cancelAnimationFrame(frame); frame = null; }
    function save() {
      committed = Object.assign({}, position); revision++;
      chrome.storage.local.set({ dashboardPos: committed }, () => { status.textContent = chrome.runtime.lastError ? 'Position could not be saved.' : 'Dashboard position saved.'; });
    }
    function settle(target, velocity = {x: 0, y: 0}) {
      stop(); target = bounds(target);
      if (reduced()) { paint(target); return; }
      let last = null, elapsed = 0, vx = velocity.x, vy = velocity.y;
      function step(time) {
        const dt = Math.min((time - (last === null ? time - 16 : last)) / 1000, .032); last = time; elapsed += dt;
        // Critically damped spring; a new press starts at the current painted position.
        vx += ((target.left - position.left) * 280 - vx * 34) * dt;
        vy += ((target.top - position.top) * 280 - vy * 34) * dt;
        paint({ left: position.left + vx * dt, top: position.top + vy * dt });
        if (elapsed > 1 || Math.abs(target.left - position.left) + Math.abs(target.top - position.top) < .15) { paint(target); frame = null; }
        else frame = window.requestAnimationFrame(step);
      }
      frame = window.requestAnimationFrame(step);
    }
    function releaseCapture() {
      const previous = gesture; gesture = null;
      if (previous && handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
    }
    function cancel() {
      stop(); const start = gesture && gesture.start || keyboardStart;
      releaseCapture(); gesture = null; keyboardStart = null;
      dashboard.classList.remove('is-dragging');
      if (start) paint(start);
    }
    function finish(event) {
      if (!gesture || event && event.pointerId !== gesture.id) return;
      const target = bounds({ left: Math.round(position.left / 8) * 8, top: Math.round(position.top / 8) * 8 });
      const velocity = event && event.timeStamp - gesture.last.time < 80 ? gesture.velocity : {x: 0, y: 0};
      releaseCapture(); gesture = null; dashboard.classList.remove('is-dragging');
      // Persist the resting position, even if the page hides before the spring completes.
      committed = target; revision++;
      chrome.storage.local.set({ dashboardPos: target }, () => { status.textContent = chrome.runtime.lastError ? 'Position could not be saved.' : 'Dashboard position saved.'; });
      settle(target, velocity);
    }
    function down(event) {
      if (suspended || gesture || event.isPrimary === false || event.button !== 0) return;
      event.preventDefault(); stop(); handle.focus();
      keyboardStart = null;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: Object.assign({}, position), last: { x: event.clientX, y: event.clientY, time: event.timeStamp || 0 }, velocity: {x: 0, y: 0} };
      handle.setPointerCapture(event.pointerId);
    }
    function move(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.hypot(dx, dy) < 6 && !dashboard.classList.contains('is-dragging')) return;
      const dt = (event.timeStamp - gesture.last.time) / 1000;
      if (dt > 0 && dt < .15) gesture.velocity = {x: (event.clientX - gesture.last.x) / dt, y: (event.clientY - gesture.last.y) / dt};
      gesture.last = {x: event.clientX, y: event.clientY, time: event.timeStamp || 0};
      dashboard.classList.add('is-dragging');
      paint({ left: gesture.start.left + dx, top: gesture.start.top + dy });
    }
    function key(event) {
      if (event.key === 'Escape') { event.preventDefault(); cancel(); status.textContent = 'Move cancelled.'; return; }
      if (event.key === 'Enter' && keyboardStart) { event.preventDefault(); keyboardStart = null; save(); return; }
      const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!deltas[event.key]) return;
      event.preventDefault(); stop();
      keyboardStart ||= Object.assign({}, position);
      const amount = event.shiftKey ? 32 : 8, delta = deltas[event.key];
      paint({ left: position.left + delta[0] * amount, top: position.top + delta[1] * amount });
      status.textContent = `Position ${Math.round(position.left)}, ${Math.round(position.top)}. Enter saves; Escape cancels.`;
    }
    function blur() { if (keyboardStart) { keyboardStart = null; save(); } }
    function resize() { stop(); if (!dashboard.hidden) paint(position); }
    const defaults = { showWidgetClock: true, showWidgetDate: true, showWidgetWeather: false, showWidgetQuote: false, showWidgetFocusTimer: false };
    const settings = Object.assign({}, defaults);
    function visibility() {
      dashboard.hidden = !Object.keys(defaults).some(key => settings[key]);
      dashboard.dataset.header = String(Boolean(settings.showWidgetClock || settings.showWidgetDate));
      dashboard.dataset.weather = String(Boolean(settings.showWidgetWeather));
      dashboard.dataset.focus = String(Boolean(settings.showWidgetFocusTimer));
      dashboard.dataset.quote = String(Boolean(settings.showWidgetQuote));
      if (!dashboard.hidden && !suspended) paint(position);
    }
    chrome.storage.local.get(Object.assign({ dashboardPos: null, widgetPos: null, storageSchemaVersion: 0 }, defaults), data => {
      if (revision) return;
      Object.assign(settings, data);
      const legacy = data.storageSchemaVersion < 5 ? data.widgetPos : null;
      position = data.dashboardPos || legacy;
      visibility(); committed = Object.assign({}, position);
    });
    function changed(changes, area) {
      if (area !== 'local' || !changes.dashboardPos && !Object.keys(defaults).some(key => changes[key])) return;
      Object.keys(defaults).forEach(key => { if (changes[key]) settings[key] = changes[key].newValue; });
      if (changes.dashboardPos) {
        const value = changes.dashboardPos.newValue;
        if (!value || !committed || value.left !== committed.left || value.top !== committed.top) { cancel(); position = value; committed = position; revision++; }
      }
      visibility();
    }
    function pause() { suspended = true; cancel(); if (committed) paint(committed); }
    function resume() { suspended = false; resize(); }
    function hidden() { if (document.hidden) pause(); else resume(); }
    function lost() { if (gesture) cancel(); }
    handle.addEventListener('pointerdown', down);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', cancel);
    handle.addEventListener('lostpointercapture', lost);
    handle.addEventListener('keydown', key);
    handle.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', hidden);
    chrome.storage.onChanged.addListener(changed);
    if (window.ResizeObserver) { observer = new window.ResizeObserver(resize); observer.observe(dashboard); }
    return () => {
      cancel(); if (observer) observer.disconnect();
      [['pointerdown', down], ['pointermove', move], ['pointerup', finish], ['pointercancel', cancel], ['lostpointercapture', lost], ['keydown', key], ['blur', blur]].forEach(([name, listener]) => handle.removeEventListener(name, listener));
      window.removeEventListener('resize', resize); window.removeEventListener('pagehide', pause); window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', hidden); chrome.storage.onChanged.removeListener(changed);
    };
  }
  return { clamp, mount };
}));
