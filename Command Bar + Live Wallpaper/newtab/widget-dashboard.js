(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../shared/widget-layout') : root.WidgetLayout);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetDashboard = api;
}(typeof self !== 'undefined' ? self : this, function (layout) {
  function mount(document, window, chrome) {
    const dashboard = document.getElementById('widget-dashboard');
    const status = document.getElementById('dashboard-move-status');
    const toolbar = document.querySelector('.layout-toolbar'), controls = document.getElementById('layout-edit-controls');
    const guideX = document.getElementById('layout-guide-x'), guideY = document.getElementById('layout-guide-y');
    const elements = { clock: document.getElementById('widgets-container'), weather: document.getElementById('widget-weather'), focus: document.getElementById('widget-focus'), quote: document.getElementById('widget-quote') };
    const defaults = {showWidgetClock:true,showWidgetDate:true,showWidgetWeather:false,showWidgetFocusTimer:false,showWidgetQuote:false};
    const settings = {...defaults}, positions = {}, handles = {}, lockButtons = {}, centerButtons = {}, editorControls = {}, animations = new Map(), listeners = [];
    const touchedSettings = new Set();
    const cards = window.WidgetCards;
    let locks = cards.sanitizeLocks(null), draftLocks = {...locks};
    let locksRevision = 0, appearanceRevision = 0;
    let layoutRevision = 0;
    let committed = null, draft = null, editing = false, gesture = null, suspended = document.hidden, disposed = false, saving = false, revision = 0, loaded = false, migrationFrame = null;
    const narrow = () => window.innerWidth < 640;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const visible = id => id === 'clock' ? settings.showWidgetClock || settings.showWidgetDate : settings[{weather:'showWidgetWeather',focus:'showWidgetFocusTimer',quote:'showWidgetQuote'}[id]];
    function on(node,name,fn,options) { node.addEventListener(name,fn,options); listeners.push(() => node.removeEventListener(name,fn,options)); }
    function stop(id) { const a = animations.get(id); if (a) { a.cancel(); animations.delete(id); } }
    function animate(id, frames, duration) {
      stop(id); const card = elements[id];
      if (suspended || reduced.matches || !card.animate) return;
      try { const a = card.animate(frames,{duration,easing:'cubic-bezier(.16,1,.3,1)'}); animations.set(id,a);
        a.finished.then(() => { if (animations.get(id) === a) { a.cancel(); animations.delete(id); } }, () => {});
      } catch (_) { /* Final layout is already painted. */ }
    }
    function hideGuides() { guideX.hidden = guideY.hidden = true; }
    function point(id,p) {
      const e = elements[id]; positions[id] = layout.clamp(p,e.offsetWidth,e.offsetHeight,window.innerWidth,window.innerHeight);
      e.style.left = positions[id].left+'px'; e.style.top = positions[id].top+'px';
    }
    function defaultsForCards(value) {
      const origin = value && value.legacyOrigin || {left:32,top:32};
      let left = origin.left, top = origin.top, columnWidth = 0;
      layout.ids.forEach(id => {
        const e = elements[id];
        if (top+e.offsetHeight > window.innerHeight-32 && top !== origin.top) { left += columnWidth+16; top = origin.top; columnWidth = 0; }
        point(id,{left,top});
        if (visible(id)) { top += e.offsetHeight+16; columnWidth = Math.max(columnWidth,e.offsetWidth); }
      });
    }
    function paint(value) {
      defaultsForCards(value);
      layout.ids.forEach(id => {
        const p = value && value.cards && value.cards[id], e = elements[id];
        if (p) point(id,layout.decode(p,e.offsetWidth,e.offsetHeight,window.innerWidth,window.innerHeight));
      });
    }
    function capture() {
      const cards = {...(draft && draft.cards || {})};
      layout.ids.forEach(id => { if (visible(id) && !(draftLocks[id] && cards[id])) { const e = elements[id]; cards[id] = layout.encode(positions[id],e.offsetWidth,e.offsetHeight,window.innerWidth,window.innerHeight); } });
      return {version:1,cards};
    }
    function cancelGesture(restore = true) {
      if (!gesture) return;
      const g = gesture; gesture = null;
      elements[g.id].classList.remove('is-dragging');
      if (handles[g.id].hasPointerCapture(g.pointerId)) handles[g.id].releasePointerCapture(g.pointerId);
      if (restore) point(g.id,g.start);
      hideGuides();
    }
    function setEditing(value) {
      editing = value; dashboard.classList.toggle('is-editing',value); controls.hidden = !value;
      toolbar.hidden = !value; hideGuides();
      layout.ids.forEach(id => { editorControls[id].hidden = !value; });
      updateControls();
    }
    function updateControls() {
      layout.ids.forEach(id => {
        const locked = draftLocks[id];
        elements[id].classList.toggle('is-locked', locked);
        handles[id].disabled = centerButtons[id].disabled = locked || narrow() || saving;
        lockButtons[id].disabled = saving;
        lockButtons[id].setAttribute('aria-pressed', String(locked));
        lockButtons[id].textContent = locked ? 'Locked' : 'Lock';
        lockButtons[id].setAttribute('aria-label', (locked ? 'Unlock ' : 'Lock ')+id+' position');
      });
    }
    function exitEditor() {
      status.classList.add('visually-hidden');
      if (window.location.hash === '#edit-layout') window.history.replaceState(null,'',window.location.pathname+window.location.search);
      dashboard.focus();
    }
    function cancel() { if (!editing || saving) return; cancelGesture(); draft = committed; draftLocks = {...locks}; setEditing(false); paint(committed); status.textContent = 'Layout changes cancelled.'; exitEditor(); }
    function begin() {
      if (!loaded || editing || saving) return;
      status.classList.remove('visually-hidden');
      draftLocks = {...locks}; draft = committed; paint(draft); setEditing(true);
      status.textContent = narrow() ? 'Widgets stack on small screens. Widen the window to arrange them.' : 'Drag a handle or use arrow keys. Done saves; Escape cancels.';
      const first = layout.ids.find(visible); if (first) (handles[first].disabled ? lockButtons[first] : handles[first]).focus();
    }
    function commit() {
      if (saving || !editing) return;
      cancelGesture(false);
      const next = narrow() ? committed : capture();
      saving = true; status.textContent = 'Saving layout…';
      controls.querySelectorAll('button').forEach(button => { button.disabled = true; }); updateControls();
      chrome.storage.local.set({widgetLayout:next,widgetLocks:{...draftLocks}}, () => {
        saving = false; if (disposed) return;
        controls.querySelectorAll('button').forEach(button => { button.disabled = false; }); updateControls();
        if (chrome.runtime.lastError) { status.textContent = 'Layout could not be saved. Try Done again.'; return; }
        committed = draft = next; locks = {...draftLocks}; revision++; setEditing(false); status.textContent = 'Layout saved.'; exitEditor();
      });
    }
    function snapped(id,p) {
      const e = elements[id];
      const others = layout.ids.filter(other => other !== id && visible(other)).map(other => ({...positions[other],width:elements[other].offsetWidth,height:elements[other].offsetHeight}));
      const result = layout.snap(p,e.offsetWidth,e.offsetHeight,window.innerWidth,window.innerHeight,others);
      guideX.hidden = result.guideX == null; guideX.style.left = result.guideX+'px';
      guideY.hidden = result.guideY == null; guideY.style.top = result.guideY+'px';
      return result;
    }
    layout.ids.forEach(id => {
      const e = elements[id], handle = document.createElement('button'); handles[id] = handle; e.hidden = true;
      const panel = document.createElement('div'); panel.className = 'widget-editor-controls'; panel.hidden = true; editorControls[id] = panel;
      const lock = document.createElement('button'), center = document.createElement('button');
      lock.type = center.type = 'button'; lock.className = 'widget-lock'; center.className = 'widget-center';
      lockButtons[id] = lock; centerButtons[id] = center;
      center.textContent = 'Center'; center.setAttribute('aria-label','Center '+id+' on page');
      handle.type = 'button'; handle.className = 'widget-handle'; handle.textContent = '⠿ Move';
      panel.append(handle,lock,center); e.prepend(panel);
      on(lock,'click',() => {
        if (!editing || saving) return;
        cancelGesture(); draft = narrow() ? draft : capture(); draftLocks[id] = !draftLocks[id]; updateControls();
        status.textContent = id+(draftLocks[id] ? ' position locked.' : ' position unlocked.')+' Done saves.';
      });
      on(center,'click',() => {
        if (!editing || saving || draftLocks[id] || narrow()) return;
        cancelGesture(); point(id,{left:(window.innerWidth-e.offsetWidth)/2,top:(window.innerHeight-e.offsetHeight)/2}); draft = capture();
        status.textContent = id+' centered. Done saves.';
      });
      handle.setAttribute('aria-label', 'Move '+id+'. Arrow keys move; Shift moves farther. Done saves; Escape cancels.');
      on(handle,'pointerdown',event => {
        if (!editing || saving || draftLocks[id] || suspended || narrow() || gesture || event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault(); stop(id); handle.focus();
        layout.ids.forEach(other => { elements[other].style.zIndex = other === id ? '2' : '1'; });
        gesture = {id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:{...positions[id]}};
        e.classList.add('is-dragging'); handle.setPointerCapture(event.pointerId);
      });
      on(handle,'pointermove',event => {
        if (!gesture || gesture.id !== id || gesture.pointerId !== event.pointerId) return;
        point(id,snapped(id,{left:gesture.start.left+event.clientX-gesture.x,top:gesture.start.top+event.clientY-gesture.y}));
      });
      on(handle,'pointerup',event => {
        if (!gesture || gesture.id !== id || gesture.pointerId !== event.pointerId) return;
        const before = {...positions[id]}; point(id,snapped(id,positions[id])); cancelGesture(false); draft = capture();
        animate(id,[{translate:`${before.left-positions[id].left}px ${before.top-positions[id].top}px`,scale:'1.015'},{translate:'0 0',scale:'1'}],220);
      });
      on(handle,'pointercancel',() => cancelGesture()); on(handle,'lostpointercapture',() => cancelGesture());
      on(handle,'keydown',event => {
        if (!editing || saving || draftLocks[id] || narrow() || suspended) return;
        const delta = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
        if (!delta) return; event.preventDefault(); stop(id);
        const step = event.shiftKey ? 32 : 8;
        point(id,{left:positions[id].left+delta[0]*step,top:positions[id].top+delta[1]*step}); draft = capture(); hideGuides();
        status.textContent = `${id}: ${Math.round(positions[id].left)}, ${Math.round(positions[id].top)}. Done saves; Escape cancels.`;
      });
    });
    function visibility() {
      dashboard.hidden = !layout.ids.some(visible);
      layout.ids.forEach(id => { const wasHidden = elements[id].hidden; elements[id].hidden = !visible(id);
        if (wasHidden && visible(id)) animate(id,[{opacity:0,translate:'0 6px'},{opacity:1,translate:'0 0'}],220);
      });
      paint(editing ? draft : committed);
    }
    function changed(changes,area) {
      if (area !== 'local' || disposed) return;
      if (Object.keys(defaults).some(key => changes[key])) revision++;
      if (changes.widgetAppearance) {
        appearanceRevision++; cards.applyAppearance(document, changes.widgetAppearance.newValue);
      }
      if (changes.widgetLocks) {
        locksRevision++; locks = cards.sanitizeLocks(changes.widgetLocks.newValue);
        // External locks take effect immediately, including in an open editor.
        draftLocks = {...locks}; cancelGesture(); updateControls();
      }
      if (changes.widgetLayout) {
        committed = layout.sanitize(changes.widgetLayout.newValue); revision++; layoutRevision++;
        if (!editing) draft = committed;
        else { cancelGesture(); draft = committed; status.textContent = 'Layout updated in another tab.'; }
      }
      Object.keys(defaults).forEach(key => { if (changes[key]) { settings[key] = changes[key].newValue; touchedSettings.add(key); } });
      if (changes.widgetLayout || changes.widgetAppearance || Object.keys(defaults).some(key => changes[key])) { cancelGesture(); visibility(); }
    }
    chrome.storage.onChanged.addListener(changed);
    const initialLayoutRevision = layoutRevision, initialLocksRevision = locksRevision, initialAppearanceRevision = appearanceRevision;
    chrome.storage.local.get({...defaults,widgetAppearance:null,widgetLocks:null,widgetLayout:null,dashboardPos:null,storageSchemaVersion:0},data => {
      if (disposed) return;
      Object.keys(defaults).forEach(key => { if (!touchedSettings.has(key)) settings[key] = data[key]; });
      if (layoutRevision === initialLayoutRevision) committed = layout.sanitize(data.widgetLayout) || (data.storageSchemaVersion < 7 ? layout.fromLegacy(data.dashboardPos) : null);
      if (locksRevision === initialLocksRevision) locks = cards.sanitizeLocks(data.widgetLocks);
      draftLocks = {...locks};
      if (appearanceRevision === initialAppearanceRevision) cards.applyAppearance(document,data.widgetAppearance);
      updateControls();
      draft = committed;
      loaded = true; visibility();
      if (!narrow() && committed && committed.legacyOrigin) {
        const migrationRevision = revision;
        migrationFrame = window.requestAnimationFrame(() => {
          migrationFrame = null;
          if (disposed || suspended || editing || narrow() || migrationRevision !== revision) return;
          paint(committed);
          const next = capture();
          chrome.storage.local.set({widgetLayout:next}, () => { if (!chrome.runtime.lastError && !disposed) { committed = next; if (!editing) draft = next; } });
        });
      }
      if (window.location.hash === '#edit-layout') begin();
    });
    on(document.getElementById('layout-done'),'click',commit);
    on(document.getElementById('layout-cancel'),'click',cancel);
    on(document.getElementById('layout-reset'),'click',() => { if (!editing || saving) return; cancelGesture(); if (narrow()) return; draft = layout.resetUnlocked(capture(),draftLocks); paint(draft); status.textContent = 'Unlocked widgets reset. Done saves; Cancel restores.'; });
    on(document,'keydown',event => { if (editing && event.key === 'Escape') { event.preventDefault(); cancel(); } });
    on(window,'resize',() => { cancelGesture(); updateControls(); paint(editing ? draft : committed); hideGuides(); });
    function pause() { if (migrationFrame !== null) window.cancelAnimationFrame(migrationFrame); migrationFrame = null; suspended = true; cancelGesture(); layout.ids.forEach(stop); }
    on(document,'visibilitychange',() => { if (document.hidden) pause(); else { suspended = false; paint(editing ? draft : committed); } });
    on(window,'pagehide',pause); on(window,'pageshow',() => { suspended = false; paint(editing ? draft : committed); });
    on(window,'hashchange',() => { if (window.location.hash === '#edit-layout' && !editing) begin(); });
    if (reduced.addEventListener) on(reduced,'change',() => { if (reduced.matches) layout.ids.forEach(stop); });
    const observer = window.ResizeObserver && new window.ResizeObserver(() => { if (loaded && !gesture && !suspended) paint(editing ? draft : committed); });
    if (observer) layout.ids.forEach(id => observer.observe(elements[id]));
    return () => { disposed = true; pause(); listeners.forEach(remove => remove()); chrome.storage.onChanged.removeListener(changed); if (observer) observer.disconnect(); };
  }
  return { clamp:layout.clamp, mount };
}));
