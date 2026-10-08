(function (root) {
  const storage = root.CommandBarStorage;
  if (!storage || typeof chrome === 'undefined' || !chrome.storage) return;
  storage.get({ storageSchemaVersion: 0, customSearchEngines: [], searchRoutingMode: 'balanced' }, (res) => {
    const current = Number(res.storageSchemaVersion) || 0;
    if (current >= storage.SCHEMA_VERSION) return;
    storage.set({
      storageSchemaVersion: storage.SCHEMA_VERSION,
      searchRoutingMode: res.searchRoutingMode === 'prefer-ai' ? 'prefer-ai' : 'balanced',
      disabledActions: Array.isArray(res.disabledActions) ? res.disabledActions : [],
      actionFavorites: Array.isArray(res.actionFavorites) ? res.actionFavorites : []
      ,customSearchEngines: Array.isArray(res.customSearchEngines) ? res.customSearchEngines : []
    });
  });
}(typeof self !== 'undefined' ? self : window));
