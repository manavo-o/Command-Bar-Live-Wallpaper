(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusTimer = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function duration(minutes, fallback) { return (Number.isFinite(minutes) && minutes >= 1 && minutes <= 180 ? minutes : fallback) * 60000; }
  function normalize(state, work = 25, rest = 5) {
    if (!state || !['work','break'].includes(state.mode)) return null;
    const durationMs = Number.isFinite(state.durationMs) && state.durationMs > 0 && state.durationMs <= 180 * 60000 ? state.durationMs : duration(state.mode === 'work' ? work : rest, state.mode === 'work' ? 25 : 5);
    if (Number.isFinite(state.endTimestamp) && state.endTimestamp > 0) return {mode:state.mode,endTimestamp:state.endTimestamp,durationMs};
    if (Number.isFinite(state.remainingMs) && state.remainingMs >= 0) return {mode:state.mode,remainingMs:Math.min(durationMs,state.remainingMs),durationMs};
    return null;
  }
  function transition(state, action, now, work = 25, rest = 5, expectedEnd) {
    const s = normalize(state,work,rest);
    if (action === 'reset') return null;
    if (action === 'start' && !s) { const durationMs = duration(work,25); return {mode:'work',endTimestamp:now+durationMs,durationMs}; }
    if (action === 'pause' && s && s.endTimestamp) return {mode:s.mode,remainingMs:Math.max(0,s.endTimestamp-now),durationMs:s.durationMs};
    if (action === 'resume' && s && !s.endTimestamp) return {mode:s.mode,endTimestamp:now+s.remainingMs,durationMs:s.durationMs};
    if (action === 'advance' && s && s.endTimestamp === expectedEnd && s.endTimestamp <= now) {
      const mode = s.mode === 'work' ? 'break' : 'work', durationMs = duration(mode === 'work' ? work : rest,mode === 'work' ? 25 : 5);
      return {mode,endTimestamp:now+durationMs,durationMs};
    }
    return s;
  }
  return {normalize,transition};
}));
