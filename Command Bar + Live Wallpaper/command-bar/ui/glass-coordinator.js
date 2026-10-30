/* Decorative surfaces stay in the host document; all interactive nodes remain
   inside the iframe. Sample only while geometry is changing, never while idle. */
function createDecorations({ hostDocument, hostShadow, frame, refs, window: hostWindow }) {
  const innerWindow = frame.contentWindow;
  const style = hostDocument.createElement('style');
  style.textContent = `
    .glass-stage{position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;}
    .glass-dim{position:absolute;inset:0;background:rgba(0,0,0,.14);}
    .glass-plate{position:absolute;box-sizing:border-box;pointer-events:none;overflow:hidden;background:linear-gradient(175deg,rgba(38,38,40,.56),rgba(28,28,30,.43));backdrop-filter:blur(28px) saturate(145%);-webkit-backdrop-filter:blur(28px) saturate(145%);border:1px solid rgba(255,255,255,.17);box-shadow:inset 0 1px 1px #ffffff16,inset 0 -1px 1px #ffffff0c,0 18px 48px #0006,0 3px 12px #0003;}
    .glass-plate[hidden]{display:none}.glass-input{background:linear-gradient(180deg,rgba(0,0,0,.88),rgba(14,14,16,.71));backdrop-filter:blur(22px) saturate(125%);-webkit-backdrop-filter:blur(22px) saturate(125%);border-color:rgba(255,255,255,.14);}
    .glass-plate::before,.glass-plate::after{content:"";position:absolute;pointer-events:none;opacity:0;}
    .glass-plate::before{inset:-60% -40%;background:linear-gradient(110deg,transparent 38%,#ffffff12 48%,#ffffff28 50%,#ffffff08 54%,transparent 64%);transform:translateX(-65%);}
    .glass-stage[data-reflections="true"] .glass-plate::before{animation:glass-arrival 620ms cubic-bezier(.16,1,.3,1) both;}
    .glass-plate::after{left:-180px;top:-120px;width:360px;height:240px;border-radius:50%;background:radial-gradient(ellipse,#ffffff16,transparent 68%);transform:translate(var(--light-x,0px),var(--light-y,0px));transition:transform 240ms cubic-bezier(.16,1,.3,1),opacity 180ms ease;}
    .glass-stage[data-reflections="true"] .glass-plate[data-lit="true"]::after{opacity:1;}
    @keyframes glass-arrival{0%{transform:translateX(-65%);opacity:0}22%{opacity:.9}100%{transform:translateX(65%);opacity:0}}
    @media(prefers-reduced-motion:reduce),(prefers-reduced-transparency:reduce),(prefers-contrast:more),(forced-colors:active){.glass-plate::before,.glass-plate::after{display:none;animation:none!important;transition:none!important}}
    @supports not (backdrop-filter:blur(1px)){.glass-plate{background:#202022}.glass-plate[hidden]{display:none}.glass-input{background:#111113}}
    @media(prefers-reduced-transparency:reduce),(prefers-contrast:more){.glass-plate{background:#202022;backdrop-filter:none;-webkit-backdrop-filter:none;border-color:#aaa}.glass-plate[hidden]{display:none}.glass-input{background:#111113}}
    @media(forced-colors:active){.glass-plate{background:Canvas;border:1px solid CanvasText;backdrop-filter:none}}
  `;
  const stage = hostDocument.createElement('div'); stage.className = 'glass-stage';
  stage.setAttribute('aria-hidden', 'true'); stage.inert = true;
  const dim = hostDocument.createElement('div'); dim.className = 'glass-dim';
  const plates = ['input', 'results'].map(name => {
    const node = hostDocument.createElement('div'); node.className = `glass-plate glass-${name}`; return node;
  });
  stage.append(dim, ...plates);
  hostShadow.insertBefore(style, frame); hostShadow.insertBefore(stage, frame);
  let active = false, disposed = false, raf = null, until = 0;
  const removers = [];
  const preference = hostWindow.matchMedia?.('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');
  let pointer = null, reflecting = false;
  function resetReflections() {
    pointer = null;
    plates.forEach(plate => { delete plate.dataset.lit; plate.style.removeProperty('--light-x'); plate.style.removeProperty('--light-y'); });
  }
  function reflectionsAllowed() { return active && reflecting && !hostDocument.hidden && !preference?.matches; }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    removers.push(() => target.removeEventListener(name, handler, options));
  }
  function sync() {
    if (!active || disposed || hostDocument.hidden) return;
    const backdrop = innerWindow.getComputedStyle(refs.backdrop);
    const backdropOpacity = Number(backdrop.opacity);
    dim.style.opacity = String(backdropOpacity);
    [refs.inputWrapper, refs.resultsPanel].forEach((surface, index) => {
      let rect = surface.getBoundingClientRect();
      const answer = refs.modalBox?.dataset.answer === 'true';
      plates[index].hidden = index === 1 && (answer || refs.resultsPanel.hidden);
      if (answer && index === 0) {
        const panel = refs.resultsPanel.getBoundingClientRect();
        rect = { left: rect.left, top: rect.top, width: rect.width, height: panel.bottom - rect.top };
      }
      if (pointer && reflectionsAllowed() && !plates[index].hidden) {
        const x = pointer.x - rect.left, y = pointer.y - rect.top;
        plates[index].dataset.lit = String(x >= 0 && y >= 0 && x <= rect.width && y <= rect.height);
        plates[index].style.setProperty('--light-x', `${x}px`);
        plates[index].style.setProperty('--light-y', `${y}px`);
      }
      const computed = innerWindow.getComputedStyle(surface);
      Object.assign(plates[index].style, {
        left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        borderRadius: answer ? '40px' : computed.borderRadius,
        opacity: String(Number(computed.opacity) * backdropOpacity),
        visibility: computed.visibility
      });
    });
  }
  function tick(now) {
    raf = null;
    if (!active || disposed || hostDocument.hidden) return;
    sync();
    if (now < until) raf = hostWindow.requestAnimationFrame(tick);
  }
  function track(milliseconds = 0) {
    if (!active || disposed || hostDocument.hidden) return;
    until = Math.max(until, hostWindow.performance.now() + milliseconds);
    if (raf === null) raf = hostWindow.requestAnimationFrame(tick);
  }
  const observer = new innerWindow.ResizeObserver(() => track());
  function syncPageVisibility() {
    refs.backdrop.dataset.pageHidden = String(!active || hostDocument.hidden);
    stage.dataset.reflections = String(reflectionsAllowed());
    if (!reflectionsAllowed()) resetReflections();
    if (hostDocument.hidden) {
      if (raf !== null) hostWindow.cancelAnimationFrame(raf);
      raf = null; until = 0;
    } else if (active) { sync(); track(); }
  }
  listen(innerWindow, 'pointermove', event => {
    if (!reflectionsAllowed() || event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY }; track();
  }, { passive: true });
  listen(innerWindow, 'pointerout', event => { if (!event.relatedTarget) resetReflections(); });
  listen(innerWindow, 'blur', resetReflections);
  if (preference?.addEventListener) listen(preference, 'change', syncPageVisibility);
  listen(hostDocument, 'visibilitychange', syncPageVisibility);
  function setActive(value) {
    if (disposed) return;
    active = value;
    reflecting = value;
    syncPageVisibility();
    if (value) {
      stage.style.display = 'block';
      observer.observe(refs.inputWrapper); observer.observe(refs.resultsPanel);
      sync(); track();
    } else {
      resetReflections();
      observer.disconnect();
      if (raf !== null) hostWindow.cancelAnimationFrame(raf);
      raf = null; until = 0; stage.style.display = 'none';
    }
  }
  listen(innerWindow, 'resize', () => track());
  listen(hostWindow, 'pagehide', () => setActive(false));
  return {
    setActive, track, sync,
    stopReflections() { reflecting = false; stage.dataset.reflections = 'false'; resetReflections(); },
    dispose() {
      if (disposed) return;
      setActive(false); disposed = true;
      removers.forEach(remove => remove()); stage.remove(); style.remove();
    }
  };
}
module.exports = { createDecorations };
