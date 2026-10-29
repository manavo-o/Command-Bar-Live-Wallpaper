/* One glowing caret. Reveal it only after measuring successfully, then hide the native caret. */
function createCaretAura({ refs, frame, hostWindow }) {
  const win = frame.contentWindow, doc = frame.contentDocument;
  const input = refs.input, aura = refs.caretAura, mirror = refs.caretMirror;
  const contrast = hostWindow.matchMedia('(prefers-contrast: more), (forced-colors: active)');
  let active = false, composing = false, disposed = false, raf = null, signature = '';
  const removers = [];
  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    removers.push(() => target.removeEventListener(event, handler));
  }
  function restoreNativeCaret() {
    input.style.caretColor = ''; aura.hidden = true; signature = '';
  }
  function sync() {
    if (disposed) return;
    const position = input.selectionStart;
    if (!active || contrast.matches || composing || doc.hidden ||
        input.getRootNode().activeElement !== input || position === null || position !== input.selectionEnd) {
      restoreNativeCaret(); return;
    }
    try {
      const style = win.getComputedStyle(input);
      mirror.style.font = style.font; mirror.style.letterSpacing = style.letterSpacing;
      mirror.textContent = input.value.slice(0, position);
      const scale = refs.inputWrapper.getBoundingClientRect().width / refs.inputWrapper.offsetWidth || 1;
      const x = input.offsetLeft + mirror.getBoundingClientRect().width / scale - input.scrollLeft;
      if (x < input.offsetLeft || x > input.offsetLeft + input.clientWidth - 1) { restoreNativeCaret(); return; }
      Object.assign(aura.style, { left: `${x}px`, top: `${input.offsetTop + (input.offsetHeight - parseFloat(style.fontSize) * 1.15) / 2}px`, height: `${parseFloat(style.fontSize) * 1.15}px` });
      if (!Number.isFinite(x) || !Number.isFinite(parseFloat(style.fontSize))) { restoreNativeCaret(); return; }
      const nextSignature = `${input.value}:${position}:${input.scrollLeft}`;
      if (signature !== nextSignature) {
        for (const animation of aura.getAnimations?.() || []) animation.currentTime = 0;
        signature = nextSignature;
      }
      aura.hidden = false;
      input.style.caretColor = 'transparent';
    } catch (_) { restoreNativeCaret(); }
  }

  function schedule() {
    if (!active || disposed || raf !== null) return;
    raf = hostWindow.requestAnimationFrame(() => { raf = null; sync(); });
  }
  function setActive(value) {
    active = value;
    if (value) schedule();
    else { if (raf !== null) hostWindow.cancelAnimationFrame(raf); raf = null; restoreNativeCaret(); }
  }
  for (const event of ['input', 'select', 'keyup', 'pointerup', 'focus', 'scroll']) listen(input, event, schedule);
  listen(input, 'blur', restoreNativeCaret);
  listen(input, 'compositionstart', () => { composing = true; restoreNativeCaret(); });
  listen(input, 'compositionend', () => { composing = false; schedule(); });
  listen(doc, 'selectionchange', schedule);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) restoreNativeCaret(); else schedule(); });
  listen(contrast, 'change', sync);
  listen(win, 'resize', schedule);
  return { setActive, sync, dispose() { if (disposed) return; setActive(false); disposed = true; removers.forEach(remove => remove()); mirror.textContent = ''; } };
}
module.exports = { createCaretAura };
