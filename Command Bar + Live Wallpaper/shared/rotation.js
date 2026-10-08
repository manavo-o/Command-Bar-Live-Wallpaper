(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommandBarRotation = api;
}(typeof self !== 'undefined' ? self : this, function () {
  function nextId(items, currentId, order, random) {
    const list = Array.isArray(items) ? items.filter((item) => item && item.id) : [];
    if (!list.length) return null;
    if (order === 'shuffle') {
      const candidates = list.filter((item) => item.id !== currentId);
      const pool = candidates.length ? candidates : list;
      return pool[Math.floor((random || Math.random)() * pool.length)].id;
    }
    const index = list.findIndex((item) => item.id === currentId);
    return list[(index + 1 + list.length) % list.length].id;
  }
  function isDaytime(hour, dayStart, nightStart) {
    if (dayStart === nightStart) return true;
    return dayStart < nightStart ? hour >= dayStart && hour < nightStart : hour >= dayStart || hour < nightStart;
  }
  return { nextId, isDaytime };
}));
