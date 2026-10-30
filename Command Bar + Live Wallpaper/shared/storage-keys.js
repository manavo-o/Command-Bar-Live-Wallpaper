(function (root) {
  root.CommandBarStorage = root.CommandBarStorage || {};
  root.CommandBarStorage.KEYS = Object.freeze({
    wallpapers: 'wallpapers',
    activeWallpaperId: 'activeWallpaperId',
    widgetPos: 'widgetPos',
    dashboardPos: 'dashboardPos',
    widgetLayout: 'widgetLayout',
    widgetAppearance: 'widgetAppearance',
    widgetLocks: 'widgetLocks',
    focusTimerState: 'focusTimerState',
    searchAllWindowsByDefault: 'searchAllWindowsByDefault',
    disabledActions: 'disabledActions',
    actionUsage: 'actionUsage',
    commandBarUsage: 'commandBarUsage',
    historyIndex: 'historyIndex',
    visitLog: 'visitLog',
    wallpaperMode: 'wallpaperMode',
    rotationOrder: 'rotationOrder',
    rotationIntervalMinutes: 'rotationIntervalMinutes',
    scheduleUseSunTimes: 'scheduleUseSunTimes',
    scheduleDayStartHour: 'scheduleDayStartHour',
    scheduleNightStartHour: 'scheduleNightStartHour',
    scheduleDayWallpaperId: 'scheduleDayWallpaperId',
    scheduleNightWallpaperId: 'scheduleNightWallpaperId',
    showWidgetClock: 'showWidgetClock',
    showWidgetDate: 'showWidgetDate',
    use24Hour: 'use24Hour',
    showWidgetWeather: 'showWidgetWeather',
    weatherLocationMode: 'weatherLocationMode',
    weatherManualLat: 'weatherManualLat',
    weatherManualLon: 'weatherManualLon',
    weatherManualLabel: 'weatherManualLabel',
    weatherUnits: 'weatherUnits',
    showWidgetQuote: 'showWidgetQuote',
    showWidgetFocusTimer: 'showWidgetFocusTimer',
    focusWorkMinutes: 'focusWorkMinutes',
    focusBreakMinutes: 'focusBreakMinutes',
    wpSpeed: 'wpSpeed',
    wpBrightness: 'wpBrightness',
    wpContrast: 'wpContrast',
    wpTransitionMs: 'wpTransitionMs',
    kenBurnsEnabled: 'kenBurnsEnabled',
    parallaxEnabled: 'parallaxEnabled'
    ,storageSchemaVersion: 'storageSchemaVersion'
    ,actionFavorites: 'actionFavorites'
    ,commandBarResultLimit: 'commandBarResultLimit'
    ,commandBarSuggestionsEnabled: 'commandBarSuggestionsEnabled'
    ,commandBarAutocompleteEnabled: 'commandBarAutocompleteEnabled'
    ,commandBarDensity: 'commandBarDensity'
    ,customSearchEngines: 'customSearchEngines'
    ,searchRoutingMode: 'searchRoutingMode'
  });
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
