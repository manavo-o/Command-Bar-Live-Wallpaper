(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetLayout = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const ids = ['clock', 'weather', 'focus', 'quote'];
  const unit = n => Math.max(0, Math.min(1, n));
  function sanitize(value) {
    if (!value || typeof value !== 'object') return null;
    const cards = {};
    ids.forEach(id => { const p = value.cards && value.cards[id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) cards[id] = { x: unit(p.x), y: unit(p.y) };
    });
    if (Object.keys(cards).length) return { version: 1, cards };
    const p = value.legacyOrigin;
    return p && Number.isFinite(p.left) && Number.isFinite(p.top) ? { version: 1, legacyOrigin: { left: p.left, top: p.top } } : null;
  }
  function resetUnlocked(value, locks) {
    const current = sanitize(value), cards = {};
    ids.forEach(id => { if (locks && locks[id] === true && current && current.cards && current.cards[id]) cards[id] = current.cards[id]; });
    return Object.keys(cards).length ? {version:1,cards} : null;
  }
  function fromLegacy(position) { return sanitize({ legacyOrigin: position }); }
  function clamp(p, width, height, vw, vh) {
    const margin = vw < 640 ? 16 : 32;
    return { left: Math.max(margin, Math.min(vw - width - margin, Number.isFinite(p && p.left) ? p.left : margin)),
      top: Math.max(margin, Math.min(vh - height - margin, Number.isFinite(p && p.top) ? p.top : margin)) };
  }
  function decode(p, width, height, vw, vh) {
    const m = vw < 640 ? 16 : 32;
    return clamp({ left: m + (p ? unit(p.x) : 0) * Math.max(0, vw - width - 2*m), top: m + (p ? unit(p.y) : 0) * Math.max(0, vh - height - 2*m) }, width, height, vw, vh);
  }
  function encode(p, width, height, vw, vh) {
    const m = vw < 640 ? 16 : 32;
    return { x: unit((p.left-m)/Math.max(1,vw-width-2*m)), y: unit((p.top-m)/Math.max(1,vh-height-2*m)) };
  }
  function snap(p, width, height, vw, vh, others) {
    const m = vw < 640 ? 16 : 32;
    const xs = [m, vw/2, vw-m], ys = [m, vh/2, vh-m];
    others.forEach(r => { xs.push(r.left,r.left+r.width/2,r.left+r.width); ys.push(r.top,r.top+r.height/2,r.top+r.height); });
    function axis(start, size, lines) {
      let best = null;
      for (const line of lines) for (const offset of [0,size/2,size]) {
        const delta = line-offset-start;
        if (Math.abs(delta) <= 8 && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
      }
      return { value: best ? start+best.delta : Math.round(start/8)*8, line: best && best.line };
    }
    const x = axis(p.left,width,xs), y = axis(p.top,height,ys);
    const point = clamp({left:x.value,top:y.value},width,height,vw,vh);
    return { ...point, guideX: point.left === x.value ? x.line : null, guideY: point.top === y.value ? y.line : null };
  }
  return { ids, sanitize, resetUnlocked, fromLegacy, clamp, encode, decode, snap };
}));
