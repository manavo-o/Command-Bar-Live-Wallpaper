(function (root) {
  root.CommandBarStorage = root.CommandBarStorage || {};
  root.CommandBarStorage.DEFAULTS = Object.freeze({
    wallpapers: [],
    activeWallpaperId: null,
    widgetPos: null,
    dashboardPos: null,
    widgetLayout: null,
    widgetAppearance: {},
    widgetLocks: {},
    focusTimerState: null,
    searchAllWindowsByDefault: false,
    commandBarUsage: {},
    historyIndex: null,
    showWidgetClock: true,
    showWidgetDate: true,
    use24Hour: false,
    wpSpeed: 1.0,
    wpBrightness: 100,
    wpContrast: 100,
    wpTransitionMs: 600,
    kenBurnsEnabled: true,
    parallaxEnabled: false,
    wallpaperMode: 'single',
    rotationOrder: 'sequential',
    rotationIntervalMinutes: 30,
    scheduleUseSunTimes: false,
    scheduleDayStartHour: 7,
    scheduleNightStartHour: 19,
    showWidgetWeather: false,
    weatherLocationMode: 'auto',
    weatherManualLabel: '',
    weatherUnits: 'f',
    showWidgetQuote: false,
    showWidgetFocusTimer: false,
    focusWorkMinutes: 25,
    focusBreakMinutes: 5
    ,storageSchemaVersion: 7
    ,actionFavorites: []
    ,commandBarResultLimit: 6
    ,commandBarSuggestionsEnabled: true
    ,commandBarAutocompleteEnabled: true
    ,commandBarDensity: 'comfortable'
    ,customSearchEngines: []
    ,searchRoutingMode: 'balanced'
  });
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis)));
