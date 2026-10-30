let visitLogCache = null;
let isVisitLogDirty = false;
let visitLogRevision = 0;
let visitFlushPending = false;
const VISIT_FLUSH_ALARM = 'command-bar-visit-flush';
let visitFlushTimer = null;
function scheduleVisitFlush() {
  if (visitFlushTimer === null) visitFlushTimer = setTimeout(() => { visitFlushTimer = null; flushVisitLog(); }, 1000);
  if (chrome.alarms) chrome.alarms.create(VISIT_FLUSH_ALARM, { when: Date.now() + 30000 });
}

const MAX_VISITS_PER_URL = 10;
const TYPE_WEIGHTS = { typed: 1.0, focus: 0.85, link: 0.5 };
const RECENCY_BUCKETS = [
  { maxAgeMs: 4 * 60 * 60 * 1000, weight: 100 },
  { maxAgeMs: 24 * 60 * 60 * 1000, weight: 80 },
  { maxAgeMs: 3 * 24 * 60 * 60 * 1000, weight: 60 },
  { maxAgeMs: 7 * 24 * 60 * 60 * 1000, weight: 40 },
  { maxAgeMs: 30 * 24 * 60 * 60 * 1000, weight: 20 },
  { maxAgeMs: 90 * 24 * 60 * 60 * 1000, weight: 10 }
];

function normalizeUrlKey(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (e) {
    return url;
  }
}

function initVisitLogCache(cb) {
  if (visitLogCache !== null) {
    if (cb) cb(visitLogCache);
    return;
  }
  chrome.storage.local.get({ visitLog: {} }, (res) => {
    visitLogCache = (res && res.visitLog) || {};
    if (cb) cb(visitLogCache);
  });
}

function flushVisitLog() {
  if (isVisitLogDirty && visitLogCache !== null && !visitFlushPending) {
    visitFlushPending = true;
    const revision = visitLogRevision;
    chrome.storage.local.set({ visitLog: visitLogCache }, () => {
      visitFlushPending = false;
      if (!chrome.runtime.lastError && revision === visitLogRevision) isVisitLogDirty = false;
      if (isVisitLogDirty) scheduleVisitFlush();
      else if (chrome.alarms && chrome.alarms.clear) chrome.alarms.clear(VISIT_FLUSH_ALARM);
    });
  }
}



function recencyWeight(ts) {
  const age = Date.now() - ts;
  for (const bucket of RECENCY_BUCKETS) {
    if (age <= bucket.maxAgeMs) return bucket.weight;
  }
  return 0;
}

function recordVisit(url, kind) {
  if (!url) return;
  const key = normalizeUrlKey(url);
  if (!key) return;
  initVisitLogCache((log) => {
    if (!log[key]) log[key] = [];
    log[key].push({ t: Date.now(), k: kind || 'link' });
    if (log[key].length > MAX_VISITS_PER_URL) {
      log[key] = log[key].slice(-MAX_VISITS_PER_URL);
    }
    const wasDirty = isVisitLogDirty;
    isVisitLogDirty = true;
    visitLogRevision++;
    if (!wasDirty && !visitFlushPending) scheduleVisitFlush();
  });
}

function computeFrecencyScore(url) {
  if (!visitLogCache) return 0;
  const key = normalizeUrlKey(url);
  const visits = visitLogCache[key];
  if (!visits || visits.length === 0) return 0;
  let sum = 0;
  visits.forEach((v) => {
    const w = recencyWeight(v.t);
    const typeW = TYPE_WEIGHTS[v.k] || TYPE_WEIGHTS.link;
    sum += w * typeW;
  });
  // Do not average repeated visits away: recency is still decayed per event,
  // while this bounded sum lets durable destinations beat one-off tabs.
  return Math.min(180, sum);
}

function getFrecencyMapFor(urls, cb) {
  initVisitLogCache(() => {
    const map = {};
    (urls || []).forEach((u) => {
      map[normalizeUrlKey(u)] = computeFrecencyScore(u);
    });
    cb(map);
  });
}

// A compact, persistent index lets the command bar rank more than the
// browser API's default recent-result window without querying all history on
// every keystroke. The index is rebuilt incrementally in time windows so a
// dense recent period cannot truncate older pages.
const HISTORY_INDEX_VERSION = 2;
const HISTORY_INDEX_KEY = 'historyIndex';
const HISTORY_BACKFILL_ALARM = 'command-bar-history-backfill';
// Keep a broad durable destination index. The browser history API is still
// queried by text for each command-bar query; this limit only protects local
// storage from growing without bound on very long-lived profiles.
const HISTORY_INDEX_LIMIT = 100000;
const HISTORY_PAGE_SIZE = 1000;
const HISTORY_INITIAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
let historyIndexCache = null;
let historyIndexLoadPending = false;
let historyIndexLoadCallbacks = [];
let historyIndexWritePending = false;
let historyBackfillPending = false;

function historyIndexKey(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    return u.href.replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return String(url).trim().toLowerCase();
  }
}

function emptyHistoryIndex() {
  return { version: HISTORY_INDEX_VERSION, entries: {}, backfillEnd: Date.now(), windowMs: HISTORY_INITIAL_WINDOW_MS, complete: false };
}

function loadHistoryIndex(callback) {
  if (historyIndexCache) { callback(historyIndexCache); return; }
  if (historyIndexLoadPending) {
    historyIndexLoadCallbacks.push(callback);
    return;
  }
  historyIndexLoadPending = true;
  chrome.storage.local.get({ [HISTORY_INDEX_KEY]: null }, (res) => {
    const saved = res && res[HISTORY_INDEX_KEY];
    historyIndexCache = saved && saved.version === HISTORY_INDEX_VERSION && saved.entries && typeof saved.entries === 'object'
      ? saved : emptyHistoryIndex();
    historyIndexLoadPending = false;
    const callbacks = historyIndexLoadCallbacks;
    historyIndexLoadCallbacks = [];
    callback(historyIndexCache);
    callbacks.forEach((queued) => queued(historyIndexCache));
  });
}

function persistHistoryIndex() {
  if (!historyIndexCache || historyIndexWritePending) return;
  historyIndexWritePending = true;
  chrome.storage.local.set({ [HISTORY_INDEX_KEY]: historyIndexCache }, () => {
    historyIndexWritePending = false;
    if (historyBackfillPending) scheduleHistoryBackfill();
  });
}

function mergeHistoryIndexItems(items) {
  if (!historyIndexCache) return;
  (items || []).forEach((item) => {
    const key = historyIndexKey(item && item.url);
    if (!key) return;
    const previous = historyIndexCache.entries[key];
    historyIndexCache.entries[key] = {
      id: item.id,
      title: item.title || (previous && previous.title) || item.url,
      url: item.url,
      visitCount: Math.max((previous && previous.visitCount) || 0, item.visitCount || 1),
      typedCount: Math.max((previous && previous.typedCount) || 0, item.typedCount || 0),
      lastVisitTime: Math.max((previous && previous.lastVisitTime) || 0, item.lastVisitTime || 0)
    };
    if (previous && previous.lastVisitTime > historyIndexCache.entries[key].lastVisitTime) {
      historyIndexCache.entries[key].lastVisitTime = previous.lastVisitTime;
    }
  });
  const keys = Object.keys(historyIndexCache.entries);
  if (keys.length > HISTORY_INDEX_LIMIT) {
    keys.sort((a, b) => (historyIndexCache.entries[b].lastVisitTime || 0) - (historyIndexCache.entries[a].lastVisitTime || 0));
    keys.slice(HISTORY_INDEX_LIMIT).forEach((key) => delete historyIndexCache.entries[key]);
  }
}

function scheduleHistoryBackfill() {
  historyBackfillPending = true;
  if (chrome.alarms && chrome.alarms.create) {
    chrome.alarms.create(HISTORY_BACKFILL_ALARM, { when: Date.now() + 250 });
  } else {
    setTimeout(runHistoryBackfill, 250);
  }
}

function runHistoryBackfill() {
  if (historyBackfillPending === false) return;
  loadHistoryIndex((index) => {
    if (index.complete || !chrome.history) {
      historyBackfillPending = false;
      return;
    }
    const end = index.backfillEnd || Date.now();
    const windowMs = Math.max(60 * 1000, index.windowMs || HISTORY_INITIAL_WINDOW_MS);
    const start = Math.max(0, end - windowMs);
    chrome.history.search({ text: '', startTime: start, endTime: end, maxResults: HISTORY_PAGE_SIZE }, (items) => {
      if (chrome.runtime.lastError) {
        scheduleHistoryBackfill();
        return;
      }
      const list = items || [];
      mergeHistoryIndexItems(list);
      if (list.length >= HISTORY_PAGE_SIZE && start > 0) {
        index.windowMs = Math.max(60 * 1000, Math.floor(windowMs / 2));
      } else {
        index.backfillEnd = start;
        index.windowMs = HISTORY_INITIAL_WINDOW_MS;
      }
      index.complete = start === 0 && !(list.length >= HISTORY_PAGE_SIZE);
      persistHistoryIndex();
      if (!index.complete) scheduleHistoryBackfill();
      else historyBackfillPending = false;
    });
  });
}

function historyIndexResults(query, limit, callback) {
  loadHistoryIndex((index) => {
    const q = String(query || '').trim().toLowerCase();
    const now = Date.now();
    const capacity = limit || 1000;
    const candidates = [];
    function candidateScore(item) {
      const title = String(item.title || '').toLowerCase();
      const url = String(item.url || '').toLowerCase();
      const starts = q && (title.startsWith(q) || url.startsWith(q)) ? 10000 : 0;
      const contains = q && (title.includes(q) || url.includes(q)) ? 1000 : 0;
      const ageDays = Math.max(0, (now - (item.lastVisitTime || 0)) / (24 * 60 * 60 * 1000));
      // Visit and typed counts are the durable signal. Recency is deliberately
      // smaller so a destination used for months can beat a one-off recent hit.
      const recency = 100 / (1 + ageDays / 30);
      const frequency = Math.log1p(item.visitCount || 0) * 520 + Math.log1p(item.typedCount || 0) * 360;
      return starts + contains + recency + frequency;
    }
    // A worst-first heap retains only the requested candidates, while
    // scanning every indexed entry. Scores are computed once per match.
    const compare = (a, b) => (b.score - a.score) ||
      (b.item.lastVisitTime || 0) - (a.item.lastVisitTime || 0) ||
      (b.item.visitCount || 0) - (a.item.visitCount || 0) ||
      a.key.localeCompare(b.key) || a.order - b.order;
    function siftDown() {
      let pos = 0;
      while (pos * 2 + 1 < candidates.length) {
        let child = pos * 2 + 1;
        if (child + 1 < candidates.length && compare(candidates[child + 1], candidates[child]) > 0) child++;
        if (compare(candidates[pos], candidates[child]) >= 0) break;
        [candidates[pos], candidates[child]] = [candidates[child], candidates[pos]];
        pos = child;
      }
    }
    let order = 0;
    for (const key in index.entries) {
      const item = index.entries[key];
      const itemOrder = order++;
      if (q && !String(item.title || '').toLowerCase().includes(q) && !String(item.url || '').toLowerCase().includes(q)) continue;
      const candidate = { item, score: candidateScore(item), key: historyIndexKey(item.url), order: itemOrder };
      if (candidates.length < capacity) {
        candidates.push(candidate);
        let pos = candidates.length - 1;
        while (pos > 0) {
          const parent = (pos - 1) >> 1;
          if (compare(candidates[pos], candidates[parent]) <= 0) break;
          [candidates[pos], candidates[parent]] = [candidates[parent], candidates[pos]];
          pos = parent;
        }
      } else if (compare(candidate, candidates[0]) < 0) {
        candidates[0] = candidate;
        siftDown();
      }
    }
    candidates.sort(compare);
    callback(candidates.map(candidate => candidate.item), index.complete);
  });
}

function updateHistoryIndexVisit(item) {
  loadHistoryIndex((index) => {
    mergeHistoryIndexItems([item]);
    persistHistoryIndex();
    if (!index.complete) scheduleHistoryBackfill();
  });
}

function removeHistoryIndexUrls(urls) {
  loadHistoryIndex((index) => {
    (urls || []).forEach((url) => delete index.entries[historyIndexKey(url)]);
    persistHistoryIndex();
  });
}

function clearHistoryIndex() {
  loadHistoryIndex((index) => {
    index.entries = {};
    index.backfillEnd = Date.now();
    index.windowMs = HISTORY_INITIAL_WINDOW_MS;
    index.complete = false;
    persistHistoryIndex();
    scheduleHistoryBackfill();
  });
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === VISIT_FLUSH_ALARM) flushVisitLog();
    if (alarm && alarm.name === HISTORY_BACKFILL_ALARM) runHistoryBackfill();
  });
}

scheduleHistoryBackfill();


function injectOverlayScripts(tabId, callback) {
  chrome.tabs.sendMessage(tabId, { action: 'PING' }, (res) => {
    if (chrome.runtime.lastError || !res || !res.alive) {
      chrome.tabs.insertCSS(tabId, { file: 'overlay-styles.css', runAt: 'document_idle' }, () => {
        if (chrome.runtime.lastError) {}
        const scripts = [
          'actions.js',
          'shared/search-engines.js',
          'command-bar-runtime.js',
          'command-bar/command-bar-results.js',
          'command-bar/fuzzy-search.js', 'command-bar/calculator-parser.js',
          'command-bar/command-bar-history.js', 'command-bar/query-intent.js',
          'overlay-search.js', 'command-bar/math-renderer.js', 'overlay-card.js', 'command-bar/command-bar-view.bundle.js', 'command-bar/command-bar-bootstrap.js'
        ];
        const runNext = (index) => {
          if (index >= scripts.length) {
            if (typeof callback === 'function') callback();
            return;
          }
          chrome.tabs.executeScript(tabId, { file: scripts[index], runAt: 'document_idle' }, () => {
            if (chrome.runtime.lastError) {}
            runNext(index + 1);
          });
        };
        runNext(0);
      });
    } else {
      if (typeof callback === 'function') callback();
    }
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-command-bar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs[0]) return;
      toggleCommandBarForTab(tabs[0].id);
    });
  }
});

const pendingCommandBarToggles = new Set();
function toggleCommandBarForTab(tabId) {
  if (pendingCommandBarToggles.has(tabId)) return;
  if (typeof tabId !== 'number') return;
  pendingCommandBarToggles.add(tabId);
  const timeout = setTimeout(() => pendingCommandBarToggles.delete(tabId), 5000);
  injectOverlayScripts(tabId, () => {
    chrome.tabs.sendMessage(tabId, { action: 'TOGGLE_OVERLAY' }, () => {
      clearTimeout(timeout);
      pendingCommandBarToggles.delete(tabId);
      if (chrome.runtime.lastError) {}
    });
  });
}

if (chrome.browserAction && chrome.browserAction.onClicked) {
  chrome.browserAction.onClicked.addListener((tab) => toggleCommandBarForTab(tab && tab.id));
}

chrome.omnibox.onInputEntered.addListener((text) => {
  const query = text ? text.trim() : '';
  if (!query) return;

  chrome.search.query(
    { text: query, disposition: 'CURRENT_TAB' },
    () => {
      if (chrome.runtime.lastError) {}
    }
  );
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    recordVisit(tab.url, 'focus');
  });
});

if (chrome.history && chrome.history.onVisited) {
  chrome.history.onVisited.addListener((item) => {
    updateHistoryIndexVisit(item);
  });
}

if (chrome.history && chrome.history.onVisitRemoved) {
  chrome.history.onVisitRemoved.addListener((removed) => {
    if (removed && removed.allHistory) clearHistoryIndex();
    else if (removed) removeHistoryIndexUrls(removed.urls || []);
  });
}

const suggestionCache = new Map();
const MAX_CACHE_SIZE = 100;
const MAX_COMMAND_USAGE_ENTRIES = 500;
let commandUsageCache = null;
let commandUsageLoadPending = false;
let commandUsageQueue = [];

function persistCommandUsage() {
  if (!commandUsageCache) return;
  const allEntries = [];
  Object.keys(commandUsageCache).forEach((q) => Object.keys(commandUsageCache[q] || {}).forEach((key) => {
    const entry = commandUsageCache[q][key];
    allEntries.push({ q, key, lastUsed: entry && typeof entry === 'object' ? entry.lastUsed || 0 : 0 });
  }));
  allEntries.sort((a, b) => b.lastUsed - a.lastUsed);
  allEntries.slice(MAX_COMMAND_USAGE_ENTRIES).forEach(({ q, key }) => {
    if (commandUsageCache[q]) delete commandUsageCache[q][key];
    if (commandUsageCache[q] && Object.keys(commandUsageCache[q]).length === 0) delete commandUsageCache[q];
  });
  chrome.storage.local.set({ commandBarUsage: commandUsageCache });
}

function applyCommandUsage(query, target) {
  if (!commandUsageCache) return;
  if (!commandUsageCache[query] || typeof commandUsageCache[query] !== 'object') commandUsageCache[query] = {};
  const existing = commandUsageCache[query][target];
  const entry = existing && typeof existing === 'object' ? existing : { count: 0, lastUsed: 0 };
  entry.count = Math.min(1000, (entry.count || 0) + 1);
  entry.lastUsed = Date.now();
  commandUsageCache[query][target] = entry;
  persistCommandUsage();
}

function recordCommandUsage(query, target) {
  const normalizedQuery = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const targetKey = String(target || '').trim();
  if (!normalizedQuery || !targetKey) return;
  if (commandUsageCache) {
    applyCommandUsage(normalizedQuery, targetKey);
    return;
  }
  commandUsageQueue.push({ query: normalizedQuery, target: targetKey });
  if (commandUsageLoadPending) return;
  commandUsageLoadPending = true;
  chrome.storage.local.get({ commandBarUsage: {} }, (res) => {
    const loaded = res && res.commandBarUsage;
    commandUsageCache = loaded && typeof loaded === 'object' ? loaded : {};
    commandUsageLoadPending = false;
    const queued = commandUsageQueue;
    commandUsageQueue = [];
    queued.forEach((entry) => applyCommandUsage(entry.query, entry.target));
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === 'FOCUS_TIMER_ACTION') return BackgroundFocusTimer.handle(request, sendResponse);
  if (!request) return false;
  if (!request.type) return false;

  switch (request.type) {
    case 'GET_SHORTCUT': {
      chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError) {
          sendResponse({ shortcut: 'Command+K' });
          return;
        }
        const cmd = (commands || []).find((c) => c.name === 'toggle-command-bar');
        sendResponse({ shortcut: cmd && cmd.shortcut ? cmd.shortcut : 'Command+K' });
      });
      return true;
    }

    case 'OPEN_APPLE_DICT': {
      const w = request.word;
      if (typeof w === 'string' && w.trim()) {
        chrome.tabs.create({ url: `dict://${encodeURIComponent(w.trim())}` }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
      return false;
    }

    case 'FETCH_SUGGESTIONS': {
      const query = request.text;
      if (typeof query !== 'string' || !query.trim()) {
        sendResponse({ suggestions: [] });
        return false;
      }
      const trimmedQuery = query.trim().toLowerCase();
      if (suggestionCache.has(trimmedQuery)) {
        sendResponse({ suggestions: suggestionCache.get(trimmedQuery) });
        return false;
      }

      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query.trim())}`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
          if (suggestionCache.size >= MAX_CACHE_SIZE) {
            const firstKey = suggestionCache.keys().next().value;
            suggestionCache.delete(firstKey);
          }
          suggestionCache.set(trimmedQuery, suggestions);
          sendResponse({ suggestions });
        })
        .catch(() => {
          sendResponse({ suggestions: [] });
        });
      return true;
    }

    case 'RECORD_COMMAND_USAGE': {
      recordCommandUsage(request.query, request.target);
      return false;
    }

    case 'FETCH_DEFINITION': {
      BackgroundDictionary.lookup(request.word, request.mode).then(definition => sendResponse({ definition }));
      return true;
    }

    case 'QUERY_TABS': {
      const isAllWindows = Boolean(request.allWindows);
      const queryOpts = isAllWindows ? {} : { currentWindow: true };

      chrome.tabs.query(queryOpts, (tabs) => {
        if (chrome.runtime.lastError) {
          sendResponse({ tabs: [], frecency: {} });
          return;
        }
        const list = tabs || [];
        getFrecencyMapFor(list.map((t) => t.url), (frecency) => {
          const result = list.map((t) => ({
            id: t.id,
            title: t.title || t.url || 'Untitled Tab',
            url: t.url || '',
            favIconUrl: t.favIconUrl || '',
            windowId: t.windowId,
            active: Boolean(t.active),
            lastAccessed: t.lastAccessed || 0,
            pinned: t.pinned,
            muted: t.mutedInfo ? t.mutedInfo.muted : false,
            frecency: frecency[normalizeUrlKey(t.url)] || 0
          }));
          sendResponse({ tabs: result, frecency });
        });
      });
      return true;
    }

    case 'QUERY_BOOKMARKS': {
      if (!chrome.bookmarks) {
        sendResponse({ bookmarks: [] });
        return false;
      }
      chrome.bookmarks.search(request.query || '', (nodes) => {
        if (chrome.runtime.lastError) {
          sendResponse({ bookmarks: [] });
          return;
        }
        const results = (nodes || [])
          .filter((n) => n.url)
          .slice(0, 30)
          .map((n) => ({
            id: n.id,
            title: n.title || n.url,
            url: n.url
          }));
        sendResponse({ bookmarks: results });
      });
      return true;
    }

    case 'QUERY_HISTORY': {
      if (!chrome.history) {
        sendResponse({ history: [] });
        return false;
      }
      const query = request.query || '';
      const maxResults = Math.min(2000, request.limit || 200);
      historyIndexResults(query, maxResults, (indexedItems, complete) => {
        if (complete) {
          getFrecencyMapFor(indexedItems.map((h) => h.url), (frecency) => {
            sendResponse({ history: indexedItems.map((h) => Object.assign({}, h, {
              frecency: frecency[normalizeUrlKey(h.url)] || 0
            })) });
          });
          return;
        }

        // During the one-time backfill, merge a bounded API result so the
        // command bar remains useful even before the index is complete.
        chrome.history.search({ text: query, startTime: 0, maxResults: maxResults }, (items) => {
          if (chrome.runtime.lastError) {
            sendResponse({ history: indexedItems });
            return;
          }
          const merged = new Map();
          indexedItems.concat(items || []).forEach((item) => {
            const key = historyIndexKey(item.url);
            if (key && !merged.has(key)) merged.set(key, item);
          });
          const list = Array.from(merged.values()).slice(0, maxResults);
          mergeHistoryIndexItems(list);
          persistHistoryIndex();
          getFrecencyMapFor(list.map((h) => h.url), (frecency) => {
            sendResponse({ history: list.map((h) => Object.assign({}, h, {
              frecency: frecency[normalizeUrlKey(h.url)] || 0
            })) });
          });
        });
      });
      return true;
    }

    case 'FOCUS_DESTINATION': {
      const key = CommandBarResults.destinationKey(request.url);
      if (!key) { sendResponse({ ok: false }); return false; }
      chrome.tabs.query(request.allWindows ? {} : Number.isInteger(request.windowId) ? { windowId: request.windowId } : { currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) { sendResponse({ ok: false }); return; }
        const matching = (tabs || []).filter(tab => CommandBarResults.destinationKey(tab.url) === key).sort(CommandBarResults.preferredTab);
        const focus = (remaining) => {
          const tab = remaining.shift();
          if (!tab) {
            recordVisit(request.url, 'link');
            chrome.tabs.create({ url: request.url }, () => { void chrome.runtime.lastError; sendResponse({ ok: true }); });
            return;
          }
          chrome.tabs.update(tab.id, { active: true }, () => {
            if (chrome.runtime.lastError) { focus(remaining); return; }
            chrome.windows.update(tab.windowId, { focused: true }, () => { void chrome.runtime.lastError; sendResponse({ ok: true }); });
          });
        };
        focus(matching);
      });
      return true;
    }

    case 'CREATE_TAB': {
      if (request.url) {
        recordVisit(request.url, request.visitKind || 'link');
      }
      chrome.tabs.create({ url: request.url || undefined }, () => {
        if (chrome.runtime.lastError) {}
      });
      return false;
    }

    case 'SEARCH_QUERY': {
      if (typeof request.text === 'string' && request.text.trim()) {
        chrome.search.query(
          { text: request.text.trim(), disposition: 'NEW_TAB' },
          () => {
            if (chrome.runtime.lastError) {}
          }
        );
      }
      return false;
    }

    case 'RUN_ACTION': {
      const actionId = request.actionId;
      const tabId = sender.tab ? sender.tab.id : null;

      switch (actionId) {
        case 'new-tab':
          chrome.tabs.create({}, () => {
            if (chrome.runtime.lastError) {}
          });
          break;

        case 'reload-tab':
          if (tabId) {
            chrome.tabs.reload(tabId, {}, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          break;

        case 'close-tab':
          if (tabId) {
            chrome.tabs.remove(tabId, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          break;

        case 'duplicate-tab':
          if (tabId) {
            chrome.tabs.duplicate(tabId, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          break;

        case 'reopen-closed-tab':
          chrome.sessions.restore(null, () => {
            if (chrome.runtime.lastError) {}
          });
          break;

        case 'close-other-tabs':
          chrome.tabs.query({ currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) return;
            if (!tabs) return;
            const toRemove = tabs.filter((t) => t.id !== tabId).map((t) => t.id);
            if (toRemove.length > 0) {
              chrome.tabs.remove(toRemove, () => {
                if (chrome.runtime.lastError) {}
              });
            }
          });
          break;

        case 'toggle-pin-tab':
          if (tabId) {
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return;
              chrome.tabs.update(tabId, { pinned: !tab.pinned });
            });
          }
          break;

        case 'toggle-mute-tab':
          if (tabId) {
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return;
              const isMuted = tab.mutedInfo ? tab.mutedInfo.muted : false;
              chrome.tabs.update(tabId, { muted: !isMuted });
            });
          }
          break;

        case 'discard-background-tabs':
          chrome.tabs.query({ active: false, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs) return;
            tabs.forEach((t) => {
              if (chrome.tabs.discard) {
                chrome.tabs.discard(t.id);
              }
            });
          });
          break;

        case 'move-tab-new-window':
          if (tabId) {
            chrome.windows.create({ tabId: tabId });
          }
          break;

        case 'open-history':
          chrome.tabs.create({ url: 'chrome://history' }, () => {
            if (chrome.runtime.lastError) {}
          });
          break;

        case 'open-downloads':
          chrome.downloads.showDefaultFolder();
          break;

        case 'open-bookmarks':
          chrome.tabs.create({ url: 'chrome://bookmarks' }, () => {
            if (chrome.runtime.lastError) {}
          });
          break;

        case 'go-back':
          if (tabId) {
            chrome.tabs.executeScript(tabId, { code: 'history.back()' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          break;

        case 'go-forward':
          if (tabId) {
            chrome.tabs.executeScript(tabId, { code: 'history.forward()' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
          break;

        default:
          break;
      }
      return false;
    }

    default:
      return false;
  }
});
