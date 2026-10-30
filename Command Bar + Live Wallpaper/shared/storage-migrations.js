(function (root) {
  const storage = root.CommandBarStorage;
  if (!storage || typeof chrome === 'undefined' || !chrome.storage) return;
  const obsolete = ['aiDefaultProvider', 'aiRoutingEnabled', 'questionDetectionEnabled', 'preferredSearchEngine', 'customQuickLinks'];
  storage.get({ storageSchemaVersion: 0, customSearchEngines: [], searchRoutingMode: 'balanced', disabledActions: [], actionFavorites: [], widgetPos: null, dashboardPos: null, widgetLayout: null }, res => {
    if (!res || res.__error) return;
    const current = Number(res.storageSchemaVersion) || 0;
    if (current >= storage.SCHEMA_VERSION) return;
    const legacyPosition = current < 5 && res.widgetPos && Number.isFinite(res.widgetPos.left) && Number.isFinite(res.widgetPos.top) ? res.widgetPos : null;
    const values = {
      dashboardPos: res.dashboardPos || legacyPosition,
      searchRoutingMode: res.searchRoutingMode === 'prefer-ai' ? 'prefer-ai' : 'balanced',
      disabledActions: Array.isArray(res.disabledActions) ? res.disabledActions : [],
      actionFavorites: Array.isArray(res.actionFavorites) ? res.actionFavorites : [],
      customSearchEngines: root.CommandBarSearchEngines.sanitizeEngines(res.customSearchEngines)
    };
    if (current < 7 && root.WidgetLayout) values.widgetLayout = root.WidgetLayout.sanitize(res.widgetLayout) || root.WidgetLayout.fromLegacy(values.dashboardPos);
    storage.set(values, ok => {
      if (!ok) return;
      chrome.storage.local.remove(obsolete, () => {
        if (!chrome.runtime.lastError) storage.set({ storageSchemaVersion: storage.SCHEMA_VERSION });
      });
    });
  });
}(typeof self !== 'undefined' ? self : window));
