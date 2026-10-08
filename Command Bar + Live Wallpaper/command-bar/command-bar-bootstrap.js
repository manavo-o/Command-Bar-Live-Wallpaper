(function (hostDocument) {
  if (window.__cmd_bar_overlay_injected) return;
  window.__cmd_bar_overlay_injected = true;

  function isContextValid() {
    return window.CommandBarRuntime ? window.CommandBarRuntime.isContextValid() :
      typeof chrome !== 'undefined' && Boolean(chrome.runtime) && Boolean(chrome.runtime.id);
  }
  function safeSendMessage(message, callback) {
    if (window.CommandBarRuntime) {
      window.CommandBarRuntime.safeSendMessage(message, callback);
      return;
    }
    if (!isContextValid()) return;
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) return;
        if (typeof callback === 'function') callback(res);
      });
    } catch (e) {}
  }

  const container = hostDocument.createElement('div');
  container.id = '__cmd_bar_extension_root__';
  (hostDocument.body || hostDocument.documentElement).appendChild(container);
  const hostShadow = container.attachShadow({ mode: 'closed' });
  // A browsing-context boundary prevents host-page capture listeners from
  // receiving palette keyboard, clipboard, and composition events.
  const frame = hostDocument.createElement('iframe');
  frame.title = 'Command Bar';
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:transparent;pointer-events:none;';
  frame.setAttribute('aria-hidden', 'true');
  frame.inert = true;
  hostShadow.appendChild(frame);
  const document = frame.contentDocument;
  document.documentElement.style.cssText = 'background:transparent;color-scheme:dark;';
  document.body.style.cssText = 'margin:0;background:transparent;';
  const surfaceRoot = document.createElement('div');
  document.body.appendChild(surfaceRoot);
  const shadow = surfaceRoot.attachShadow({ mode: 'closed' });
  container.style.display = 'none';
  const criticalStyle = document.createElement('style');
  criticalStyle.textContent = ':host{visibility:hidden!important;}';
  shadow.appendChild(criticalStyle);
  const linkTag = document.createElement('link');
  linkTag.rel = 'stylesheet';
  linkTag.href = chrome.runtime.getURL('overlay-styles.css');
  let stylesReady = false;
  let styleLoadTimer = null;
  function finishStyleLoading(fallback = false) {
    const wasReady = stylesReady;
    clearTimeout(styleLoadTimer);
    styleLoadTimer = null;
    stylesReady = true;
    container.style.display = '';
    criticalStyle.textContent = ':host{visibility:visible!important;}' + (fallback ? `
      .overlay-backdrop{position:fixed;inset:0;display:flex;justify-content:center;align-items:flex-start;padding:10vh 16px 24px;box-sizing:border-box;background:#0004;visibility:hidden;pointer-events:none;color:#fff;font-family:system-ui;}
      .overlay-backdrop.visible,.overlay-backdrop.exiting{visibility:visible;}
      .overlay-backdrop.visible{pointer-events:auto;}
      .modal-box{width:min(740px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;}
      .input-wrapper,.results-panel{background:#202126;border:1px solid #ffffff24;will-change:transform,opacity;}
      .input-wrapper{padding:22px 28px;border-radius:999px;}
      .input-field{box-sizing:border-box;width:100%;background:transparent;border:0;outline:0;color:inherit;font:22px system-ui;}
      .results-panel{border-radius:28px;overflow:auto;}
      .results-list{list-style:none;padding:12px;margin:0;}
      .result-item{display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:18px;}
      .result-item.selected{background:#ffffff1a;}
      .result-left{display:flex;align-items:center;gap:14px;min-width:0;}
      .result-icon{width:28px;height:28px;}
      .result-text{min-width:0;} .result-title,.result-sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .result-sub{font-size:12px;opacity:.6;} .result-badge{font-size:10px;}
    ` : '');
    if (isVisible && !wasReady) { animateOverlay(true); enforceFocus(); }
  }
  linkTag.onload = () => finishStyleLoading();
  linkTag.onerror = () => finishStyleLoading(true);
  // A failed or stalled stylesheet must not strand an open, hidden iframe.
  styleLoadTimer = setTimeout(() => { if (!stylesReady) finishStyleLoading(true); }, 1500);
  shadow.appendChild(linkTag);

  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';
  backdrop.setAttribute('role', 'presentation');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  const modalBox = document.createElement('div');
  modalBox.className = 'modal-box';
  modalBox.setAttribute('role', 'dialog');
  modalBox.setAttribute('aria-modal', 'true');
  modalBox.setAttribute('aria-label', 'Command Bar');
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'input-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input-field';
  input.setAttribute('aria-controls', '__cmd_bar_results__');
  input.setAttribute('aria-autocomplete', 'list');
  input.placeholder = "Search or enter a command…";
  input.setAttribute('aria-label', 'Search tabs, history, bookmarks, actions, math, or definitions');
  inputWrapper.appendChild(input);

  const contentBody = document.createElement('div');
  contentBody.className = 'content-body';
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'results-container';
  const resultsList = document.createElement('ul');
  resultsList.className = 'results-list';
  resultsList.id = '__cmd_bar_results__';
  resultsList.setAttribute('role', 'listbox');
  resultsContainer.appendChild(resultsList);
  contentBody.appendChild(resultsContainer);

  const resultsPanel = document.createElement('div');
  resultsPanel.className = 'results-panel';
  resultsPanel.appendChild(contentBody);
  modalBox.append(inputWrapper, resultsPanel);
  backdrop.appendChild(modalBox);
  shadow.appendChild(backdrop);

  let isVisible = false;
  let exitCleanupTimer = null;
  let motionAnimations = [];
  let motionGeneration = 0;
  let openGeneration = 0;
  let currentResults = [];
  let selectedIndex = 0;
  let searchAllWindowsByDefault = false;
  let disabledActionIds = [];
  let activeShortcut = null;
  let suggestDebounceTimer = null;
  let currentQueryToken = 0;
  let queryGeneration = 0;
  let activeDefItem = null;
  let lastEditWasDeletion = false;
  let pendingInitialValue = null;
  let autocompleteActive = false;
  let typedQuery = '';
  let completionText = '';
  let completionSource = 'none';
  let completionState = 'inactive';
  let completionTarget = null;
  let autocompleteSuffixSelected = false;
  let isKeyboardNav = false;
  let explicitSelection = false;
  let cancelledCompletionQuery = null;
  let lastAcceptedTypedQuery = '';

  const SEARCH_DEBOUNCE_MS = 45;
  let searchDebounceTimer = null;
  let tabsCachePromises = {};
  let historyCachePromises = new Map();
  let bookmarksCachePromises = new Map();
  let actionUsageMap = {};
  let commandBarUsage = {};
  let actionFavorites = [];
  let resultLimit = 6;
  let suggestionsEnabled = true;
  let autocompleteEnabled = true;
  let customSearchEngines = [];
  let searchRoutingMode = 'balanced';
  let aiDefaultProvider = 'perplexity';
  let rowNodeMap = new Map();

  const MAX_MATCH_RESULTS = 6;
  const SEARCH_ACTION_SCORE = 42;
  const SUGGESTION_BASE_SCORE = 38;
  const SUGGESTION_SCORE_STEP = 3;

  const isNewTab = location.protocol.startsWith('chrome-extension:') && location.pathname.endsWith('newtab.html');

  function customSearchForEvent(e) {
    if (!e || e.key !== 'Enter' || typeof CommandBarSearchEngines === 'undefined') return null;
    const modifiers = ['shift', 'ctrl', 'alt', 'meta'].filter((name) => e[`${name}Key`]);
    if (modifiers.length !== 1) return null;
    // Shift+Enter is reserved for Google. Custom engines
    // remain available through Ctrl/Alt/Meta+Enter.
    if (modifiers[0] === 'shift') return null;
    return CommandBarSearchEngines.findByShortcut(customSearchEngines, modifiers[0]);
  }

  function executeSearch(query, e) {
    const text = String(query || '').trim();
    if (!text) return;
    const engine = e && e.shiftKey ? null : customSearchForEvent(e);
    const destination = window.CommandBarIntent.searchDestination(text, { mode: searchRoutingMode, shiftKey: Boolean(e && e.shiftKey) });
    recordCommandUsage(text, engine ? { type: 'SEARCH_ENGINE', data: { engineId: engine.id, query: text } } : { type: 'SEARCH', data: { query: text } });
    if (engine && typeof CommandBarSearchEngines !== 'undefined') {
      try {
        safeSendMessage({ type: 'CREATE_TAB', url: CommandBarSearchEngines.buildUrl(engine.url, text), visitKind: 'typed' });
      } catch (error) {
        safeSendMessage({ type: 'SEARCH_QUERY', text });
      }
    } else if (destination === 'google') {
      safeSendMessage({ type: 'CREATE_TAB', url: 'https://www.google.com/search?q=' + encodeURIComponent(text), visitKind: 'typed' });
    } else {
      safeSendMessage({ type: 'SEARCH_QUERY', text });
    }
    hideOverlay();
  }

  function aiProviders() {
    const helper = typeof CommandBarSearchEngines !== 'undefined' ? CommandBarSearchEngines : null;
    const builtIns = helper && helper.builtInAiEngines ? helper.builtInAiEngines() : [];
    const configured = customSearchEngines.filter((engine) => engine.isAi || engine.type === 'api');
    const byId = new Map();
    builtIns.concat(configured).forEach((engine) => { if (engine && engine.enabled !== false) byId.set(engine.id, engine); });
    return Array.from(byId.values());
  }

  function renderAiResults(query, forced, providerId) {
    const providers = forced ? aiProviders() : [{ id: 'browser-default', name: 'Browser default (AI)', type: 'browser-default', icon: '✦' }];
    const defaultProvider = providers.find((provider) => provider.id === providerId) || providers.find((provider) => provider.id === aiDefaultProvider) || providers[0];
    currentResults = providers.map((provider, index) => ({
      type: 'AI', data: { provider, query }, title: `${provider.icon || '✦'} Ask ${provider.name}`,
      sub: provider.type === 'browser-default' ? 'Uses your browser default search engine' : provider.type === 'api' ? 'API provider · configure credentials to enable' : `Search with ${provider.name}`,
      badges: ['AI'], score: provider === defaultProvider ? 100 : 90 - index, forced
    })).sort((a, b) => b.score - a.score);
    if (!currentResults.length) currentResults = [{ type: 'SEARCH', data: { query }, title: `Search Web for "${query}"`, sub: 'No AI providers configured', badges: ['SEARCH'], score: 42 }];
    selectedIndex = 0;
    clearAutocomplete();
    renderResults();
  }

  function parseShortcut(shortcutStr) {
    if (!shortcutStr) return null;
    const parts = shortcutStr.split('+').map((s) => s.trim().toLowerCase());
    const res = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: '' };
    parts.forEach((part) => {
      if (part === 'command' || part === 'cmd' || part === 'macctrl') res.metaKey = true;
      else if (part === 'ctrl' || part === 'control') res.ctrlKey = true;
      else if (part === 'alt' || part === 'option') res.altKey = true;
      else if (part === 'shift') res.shiftKey = true;
      else res.key = part;
    });
    return res;
  }
  function isShortcutMatch(e, parsed) {
    if (!parsed || !parsed.key) return false;
    const eventKey = (e.key || '').toLowerCase();
    if (eventKey !== parsed.key) return false;
    const modifierMatch = parsed.metaKey ? (e.metaKey || e.ctrlKey) : parsed.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.metaKey && !e.ctrlKey);
    if (!modifierMatch) return false;
    if (parsed.altKey !== e.altKey) return false;
    if (parsed.shiftKey !== e.shiftKey) return false;
    return true;
  }
  function fetchCurrentShortcut() {
    safeSendMessage({ type: 'GET_SHORTCUT' }, (res) => {
      if (!res) return;
      activeShortcut = parseShortcut(res.shortcut || 'Command+K');
    });
  }
  fetchCurrentShortcut();
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.customSearchEngines) customSearchEngines = typeof CommandBarSearchEngines !== 'undefined' ? CommandBarSearchEngines.sanitizeEngines(changes.customSearchEngines.newValue) : [];
      if (changes.searchRoutingMode) {
        searchRoutingMode = window.CommandBarIntent.normalizeRoutingMode(changes.searchRoutingMode.newValue);
              if (isVisible) updateSearch();
      }
      if (changes.aiDefaultProvider) aiDefaultProvider = changes.aiDefaultProvider.newValue || 'perplexity';
    });
  }

  function enforceFocus() {
    if (!isVisible) return;
    if (shadow.activeElement !== input) input.focus();
  }
  input.addEventListener('blur', () => {
    // Do not continuously steal focus from palette buttons/cards. A short
    // delayed check is enough to recover focus when the page itself takes it.
    setTimeout(() => {
      if (isVisible && !shadow.activeElement) enforceFocus();
    }, 0);
  });
  window.addEventListener('focus', () => {
    fetchCurrentShortcut();
    if (isVisible && !shadow.activeElement) enforceFocus();
  });

  [window, frame.contentWindow].forEach((eventWindow) => {
  ['keydown', 'keyup', 'keypress'].forEach((eventType) => {
    eventWindow.addEventListener(eventType, (e) => {
      const isCmdT = (e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 't';
      const matchesConfigured = activeShortcut && isShortcutMatch(e, activeShortcut);
      if (!isVisible) {
        if (eventType === 'keydown') {
          if (matchesConfigured || isCmdT) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            toggleOverlay();
            return;
          }
          const isPrintableKey = e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
          if (isPrintableKey && isNewTab) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            pendingInitialValue = e.key;
            showOverlay();
            return;
          }
        }
        return;
      }
      if (eventType === 'keydown') {
        if (matchesConfigured || isCmdT) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          toggleOverlay();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          hideOverlay();
          return;
        }
      }
    }, true);
  });

  });

  function clearAutocomplete(state) {
    autocompleteActive = false;
    completionText = '';
    completionSource = 'none';
    completionTarget = null;
    completionState = state || 'inactive';
    autocompleteSuffixSelected = false;
  }

  function cancelAutocomplete(query) {
    autocompleteActive = false;
    completionText = '';
    completionSource = 'none';
    completionTarget = null;
    completionState = 'cancelled';
    autocompleteSuffixSelected = false;
    cancelledCompletionQuery = String(query || typedQuery).trim();
  }

  function completionBlocked(query) {
    return completionState === 'cancelled' && cancelledCompletionQuery === String(query || '').trim();
  }

  function applyAutocomplete(queryText, confidentItem, source) {
    if (!queryText || !confidentItem) { clearAutocomplete(); return; }
    const qLower = queryText.toLowerCase();
    const urlStr = (confidentItem.data && confidentItem.data.url) || '';
    let candidateString = null;
    if (source === 'web') {
      candidateString = confidentItem.data && confidentItem.data.query;
    } else {
      try {
        const parsed = new URL(urlStr);
        const host = parsed.hostname.replace(/^www\./, '');
        const displayUrl = `${host}${parsed.pathname}${parsed.search}`;
        if (host.toLowerCase() === qLower) candidateString = host;
        else if (displayUrl.toLowerCase().startsWith(qLower)) candidateString = displayUrl;
        else if (host.toLowerCase().startsWith(qLower)) candidateString = host;
      } catch (e) {}
    }
    if (source !== 'web' && !candidateString && urlStr.toLowerCase().startsWith(qLower)) {
      candidateString = urlStr;
    }
    if (source !== 'web' && !candidateString) {
      const titleStr = confidentItem.title || '';
      if (titleStr.toLowerCase().startsWith(qLower)) candidateString = titleStr;
    }
    if (!candidateString) { clearAutocomplete(); return; }
    const suffix = candidateString.slice(queryText.length);
    if (!suffix || candidateString.toLowerCase().indexOf(qLower) !== 0) { clearAutocomplete(); return; }
    input.value = queryText + suffix;
    input.setSelectionRange(queryText.length, input.value.length);
    autocompleteActive = true;
    completionText = input.value;
    typedQuery = queryText;
    completionSource = source || 'local';
    completionState = 'highlighted';
    completionTarget = confidentItem;
    autocompleteSuffixSelected = true;
  }

  function acceptAutocomplete() {
    const full = input.value;
    lastAcceptedTypedQuery = typedQuery;
    input.setSelectionRange(full.length, full.length);
    autocompleteActive = false;
    completionText = '';
    completionSource = 'none';
    completionState = 'accepted';
    completionTarget = null;
    autocompleteSuffixSelected = false;
    cancelledCompletionQuery = null;
  }

  function usageBoost(query, item) {
    return window.CommandBarHistory ? window.CommandBarHistory.usageBoost(query, item, commandBarUsage) : 0;
  }

  function recordCommandUsage(query, item) {
    const target = window.CommandBarHistory ? window.CommandBarHistory.usageKey(item) : '';
    const normalizedQuery = window.CommandBarHistory ? window.CommandBarHistory.normalizeQuery(query) : String(query || '').trim().toLowerCase();
    if (normalizedQuery && target) {
      if (!commandBarUsage[normalizedQuery] || typeof commandBarUsage[normalizedQuery] !== 'object') commandBarUsage[normalizedQuery] = {};
      const existing = commandBarUsage[normalizedQuery][target];
      const entry = existing && typeof existing === 'object' ? existing : { count: 0, lastUsed: 0 };
      entry.count += 1;
      entry.lastUsed = Date.now();
      commandBarUsage[normalizedQuery][target] = entry;
    }
    safeSendMessage({ type: 'RECORD_COMMAND_USAGE', query, target });
  }

  function highlightMatches(text, query) {
    if (!text) return '';
    const trimmedQuery = query && query.trim();
    if (!trimmedQuery) {
      const span = document.createElement('span');
      span.textContent = text;
      return span.innerHTML;
    }
    const positions = window.OverlaySearch ? window.OverlaySearch.fuzzyMatchPositions(trimmedQuery, text) : null;
    if (!positions || positions.length === 0) {
      const span = document.createElement('span');
      span.textContent = text;
      return span.innerHTML;
    }
    const posSet = new Set(positions);
    const wrap = document.createElement('span');
    let i = 0;
    while (i < text.length) {
      if (posSet.has(i)) {
        let j = i;
        let runText = '';
        while (j < text.length && posSet.has(j)) { runText += text[j]; j++; }
        const mark = document.createElement('mark');
        mark.className = 'match-highlight';
        mark.textContent = runText;
        wrap.appendChild(mark);
        i = j;
      } else {
        wrap.appendChild(document.createTextNode(text[i]));
        i++;
      }
    }
    return wrap.innerHTML;
  }

  function clearResultNodes() {
    rowNodeMap.forEach((li) => li.remove());
    rowNodeMap.clear();
    resultsList.innerHTML = '';
  }

  // Read before cancelling so reversals begin at the currently painted state.
  function cancelMotion() {
    const nodes = [backdrop, inputWrapper, resultsPanel];
    const states = nodes.map((node) => {
      const style = frame.contentWindow.getComputedStyle(node);
      return { transform: style.transform, opacity: style.opacity };
    });
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    return states;
  }
  function fadeProgress(t) {
    const progress = Math.max(0, Math.min(1, t));
    return progress * progress * (3 - 2 * progress);
  }
  function animateOverlay(opening) {
    const interrupted = motionAnimations.length > 0;
    const states = cancelMotion();
    const generation = ++motionGeneration;
    const nodes = [backdrop, inputWrapper, resultsPanel];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !stylesReady || !backdrop.animate) {
      if (!opening) finishExit();
      return;
    }
    const animations = [];
    try {
    nodes.forEach((node, index) => {
      const start = interrupted ? states[index] : {
        opacity: opening ? '0' : '1',
        transform: opening ? 'translateY(-10px) scale(0.96)' : 'none'
      };
      let keyframes;
      if (index === 0) {
        keyframes = [{ opacity: start.opacity }, { opacity: opening ? 1 : 0 }];
      } else if (opening) {
        // One damped overshoot, sampled at 60 points; normalize the endpoint.
        const response = (t) => 1 - Math.exp(-5 * t) * (Math.cos(9 * t) + 5 / 9 * Math.sin(9 * t));
        const end = response(1);
        const matrix = new frame.contentWindow.DOMMatrixReadOnly(start.transform === 'none' ? undefined : start.transform);
        keyframes = Array.from({ length: 61 }, (_, i) => {
          const t = i / 60;
          const progress = response(t) / end;
          // Limit overshoot to 0.008 at the default starting scale.
          const scale = Math.min(1.008, matrix.a + (1 - matrix.a) * progress);
          return { offset: t, transform: `translateY(${matrix.m42 * (1 - progress)}px) scale(${scale})`,
            opacity: Number(start.opacity) + (1 - Number(start.opacity)) * fadeProgress(t * 460 / 280) };
        });
        keyframes[keyframes.length - 1] = { offset: 1, transform: 'translateY(0) scale(1)', opacity: 1 };
      } else {
        keyframes = [start, { transform: 'translateY(-6px) scale(0.975)', opacity: 0 }];
      }
      animations.push(node.animate(keyframes, {
        duration: opening ? (index === 0 ? 280 : 460) : 240,
        delay: opening && index === 2 && !interrupted ? 25 : 0,
        easing: opening ? (index === 0 ? 'ease-in-out' : 'linear') : 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'both'
      }));
    });
    } catch (error) {
      // A renderer/API failure must never leave an invisible fill animation.
      animations.forEach((animation) => {
        animation.finished.catch(() => {});
        animation.cancel();
      });
      if (!opening) finishExit();
      return;
    }
    motionAnimations = animations;
    Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (generation !== motionGeneration) return;
      animations.forEach((animation) => animation.cancel());
      motionAnimations = [];
      if (!opening) finishExit();
    }).catch(() => {}); // Cancellation is expected when the user reverses direction.
  }
  function finishExit() {
    if (isVisible) return;
    clearTimeout(exitCleanupTimer);
    exitCleanupTimer = null;
    ++motionGeneration;
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    backdrop.classList.remove('exiting');
    clearResultNodes();
    input.value = '';
  }
  function prepareOpening() {
    clearTimeout(exitCleanupTimer);
    exitCleanupTimer = null;
    clearResultNodes();
    input.value = '';
    frame.style.pointerEvents = 'auto';
    frame.inert = false;
    frame.removeAttribute('aria-hidden');
    backdrop.inert = false;
    backdrop.removeAttribute('aria-hidden');
  }

  function hideOverlay() {
    ++openGeneration;
    isVisible = false;
    currentQueryToken = ++queryGeneration;
    clearTimeout(searchDebounceTimer);
    clearTimeout(suggestDebounceTimer);
    resetSessionCaches();
    safeSendMessage({ action: 'COMMAND_BAR_VISIBILITY', active: false });
    backdrop.classList.add('exiting');
    backdrop.classList.remove('visible');
    frame.style.pointerEvents = 'none';
    frame.inert = true;
    frame.setAttribute('aria-hidden', 'true');
    backdrop.inert = true;
    backdrop.setAttribute('aria-hidden', 'true');
    if (shadow.activeElement) shadow.activeElement.blur();
    currentResults = [];
    selectedIndex = 0;
    activeDefItem = null;
    lastEditWasDeletion = false;
    explicitSelection = false;
    lastAcceptedTypedQuery = '';
    cancelledCompletionQuery = null;
    clearAutocomplete();
    clearTimeout(exitCleanupTimer);
    exitCleanupTimer = setTimeout(finishExit, 320);
    animateOverlay(false);
  }

  window.addEventListener('pagehide', () => {
    ++motionGeneration;
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    clearTimeout(exitCleanupTimer);
  });

  function resetSessionCaches() {
    tabsCachePromises = {};
    historyCachePromises = new Map();
    bookmarksCachePromises = new Map();
  }
  function getTabsCached(allWindows) {
    const key = allWindows ? 'all' : 'current';
    if (!tabsCachePromises[key]) {
      tabsCachePromises[key] = new Promise((resolve) => {
        safeSendMessage({ type: 'QUERY_TABS', allWindows }, (res) => resolve((res && res.tabs) || []));
      });
    }
    return tabsCachePromises[key];
  }
  function cachedQuery(cache, key, request, field) {
    if (cache.has(key)) {
      const pending = cache.get(key);
      cache.delete(key);
      cache.set(key, pending);
      return pending;
    }
    const pending = new Promise((resolve) => {
      safeSendMessage(request, (res) => resolve((res && res[field]) || []));
    });
    cache.set(key, pending);
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    return pending;
  }
  function getHistoryCached(query) {
    const key = String(query || '').trim().toLowerCase();
    return cachedQuery(historyCachePromises, key, { type: 'QUERY_HISTORY', query: key, limit: 1000 }, 'history');
  }
  function getBookmarksCached(query) {
    const key = String(query || '').trim().toLowerCase();
    return cachedQuery(bookmarksCachePromises, key, { type: 'QUERY_BOOKMARKS', query: key }, 'bookmarks');
  }

  function showOverlay() {
    if (!isContextValid() || isVisible) return;
    const generation = ++openGeneration;
    resetSessionCaches();
    prepareOpening();
    isVisible = true;
    safeSendMessage({ action: 'COMMAND_BAR_VISIBILITY', active: true });
    backdrop.classList.add('visible');
    backdrop.classList.remove('exiting');
    animateOverlay(true);
    enforceFocus();
    requestAnimationFrame(enforceFocus);
    setTimeout(enforceFocus, 50);
    if (pendingInitialValue !== null) {
      input.value = pendingInitialValue;
      input.setSelectionRange(pendingInitialValue.length, pendingInitialValue.length);
      pendingInitialValue = null;
    }
    updateSearch();
    // Show with the current settings immediately; storage must not gate focus.
    try {
      chrome.storage.local.get(['commandBarDensity', 'searchAllWindowsByDefault', 'disabledActions', 'actionUsage', 'commandBarUsage', 'actionFavorites', 'commandBarResultLimit', 'commandBarSuggestionsEnabled', 'commandBarAutocompleteEnabled', 'customSearchEngines', 'searchRoutingMode', 'aiDefaultProvider'], (res) => {
        if (!isVisible || generation !== openGeneration) return;
        if (chrome.runtime && chrome.runtime.lastError) return;
        searchAllWindowsByDefault = Boolean(res && res.searchAllWindowsByDefault);
        disabledActionIds = Array.isArray(res && res.disabledActions) ? res.disabledActions : [];
        actionUsageMap = (res && res.actionUsage) || {};
        commandBarUsage = (res && res.commandBarUsage && typeof res.commandBarUsage === 'object') ? res.commandBarUsage : {};
        actionFavorites = Array.isArray(res && res.actionFavorites) ? res.actionFavorites : [];
        resultLimit = Math.max(3, Math.min(20, Number(res && res.commandBarResultLimit) || 6));
        suggestionsEnabled = res && res.commandBarSuggestionsEnabled !== false;
        autocompleteEnabled = res && res.commandBarAutocompleteEnabled !== false;
        customSearchEngines = typeof CommandBarSearchEngines !== 'undefined' ? CommandBarSearchEngines.sanitizeEngines(res && res.customSearchEngines) : [];
        searchRoutingMode = window.CommandBarIntent.normalizeRoutingMode(res && res.searchRoutingMode);
        aiDefaultProvider = (res && res.aiDefaultProvider) || 'perplexity';
        surfaceRoot.dataset.density = (res && res.commandBarDensity) === 'compact' ? 'compact' : 'comfortable';
        resetSessionCaches();
        updateSearch();
      });
    } catch (e) {
      // Keep the already-open palette usable if extension storage is unavailable.
    }
  }
  function toggleOverlay() {
    if (isVisible) hideOverlay(); else showOverlay();
  }

  function handleDictionaryLookup(targetWord, token) {
    safeSendMessage({ type: 'FETCH_DEFINITION', word: targetWord }, (res) => {
      if (token !== currentQueryToken) return;
      const defData = res && res.definition;
      if (defData && defData.status === 'success') {
        const firstMeaning = Array.isArray(defData.meanings) && defData.meanings[0];
        const firstDef = firstMeaning && Array.isArray(firstMeaning.definitions) && firstMeaning.definitions[0];
        activeDefItem = {
          type: 'DEF', data: defData,
          title: `${defData.word}${defData.phonetic ? ' • ' + defData.phonetic : ''}`,
          sub: firstDef ? `[${firstMeaning.partOfSpeech}] ${firstDef.definition}` : 'Dictionary Definition'
        };
      } else {
        activeDefItem = {
          type: 'DEF', data: { status: 'not_found', word: targetWord },
          title: `Define "${targetWord}"`,
          sub: `Open "${targetWord}" in macOS Apple Dictionary`
        };
      }
      mergeActiveDefItem(true);
      selectedIndex = 0;
      renderResults();
    });
  }

  function mergeActiveDefItem(isExplicit) {
    if (!activeDefItem) return;
    currentResults = currentResults.filter((r) => r.type !== 'DEF');
    if (isExplicit) {
      currentResults.unshift(activeDefItem);
    } else {
      const searchIdx = currentResults.findIndex((r) => r.type === 'SEARCH');
      if (searchIdx !== -1) currentResults.splice(searchIdx + 1, 0, activeDefItem);
      else currentResults.unshift(activeDefItem);
    }
  }

  function updateSearch() {
    const rawVal = input.value;
    if (!autocompleteActive) typedQuery = rawVal;
    const trimmed = rawVal.trim();
    const hasTrailingWhitespace = /\s$/.test(rawVal);
    activeDefItem = null;
    clearTimeout(searchDebounceTimer);
    const queryToken = ++queryGeneration;
    currentQueryToken = queryToken;
    const suppressGhost = hasTrailingWhitespace || lastEditWasDeletion || completionBlocked(trimmed);

    if (!trimmed) {
      clearAutocomplete();
      fetchUnifiedMatches('', searchAllWindowsByDefault, null, queryToken, false);
      return;
    }

    const calcObj = window.OverlaySearch ? window.OverlaySearch.evaluateCalc(trimmed) : null;
    if (calcObj !== null) {
      clearAutocomplete();
      currentResults = [{ type: 'CALC', data: calcObj, title: `= ${calcObj.query}`, sub: `Expression: ${calcObj.expr}` }];
      selectedIndex = 0;
      renderResults();
      return;
    }

    if (window.OverlaySearch && window.OverlaySearch.looksLikeMath && window.OverlaySearch.looksLikeMath(trimmed)) {
      clearAutocomplete();
      const loading = { kind: 'loading', expression: trimmed, latex: window.OverlaySearch.toLatex(trimmed), query: 'Evaluating…', expr: trimmed };
      currentResults = [{ type: 'CALC', data: loading, title: '= Evaluating…', sub: `Expression: ${trimmed}` }];
      selectedIndex = 0;
      renderResults();
      if (window.CommandBarDesmos && typeof window.CommandBarDesmos.evaluate === 'function') {
        window.CommandBarDesmos.evaluate(trimmed).then((desmosResult) => {
          if (queryToken !== currentQueryToken || trimmed !== input.value.trim()) return;
          const data = desmosResult || { kind: 'error', expression: trimmed, latex: loading.latex, query: 'Unsupported math expression', error: 'Desmos is unavailable and the local engine could not solve this expression' };
          currentResults = [{ type: 'CALC', data, title: `= ${data.query}`, sub: `Expression: ${trimmed}` }];
          selectedIndex = 0;
          renderResults();
        });
      }
      return;
    }

    if (trimmed.startsWith('@history')) {
      clearAutocomplete();
      const q = trimmed.slice(8).trim();
      searchDebounceTimer = setTimeout(() => { if (queryToken !== currentQueryToken) return; fetchHistoryScope(q, queryToken); }, SEARCH_DEBOUNCE_MS);
      return;
    } else if (trimmed.startsWith('@bookmarks')) {
      clearAutocomplete();
      const q = trimmed.slice(10).trim();
      searchDebounceTimer = setTimeout(() => { if (queryToken !== currentQueryToken) return; fetchBookmarksScope(q, queryToken); }, SEARCH_DEBOUNCE_MS);
      return;
    } else if (trimmed.startsWith('/allwindows')) {
      clearAutocomplete();
      const queryText = trimmed.slice(11).trim();
      searchDebounceTimer = setTimeout(() => { if (queryToken !== currentQueryToken) return; fetchUnifiedMatches(queryText, true, null, queryToken, suppressGhost); }, SEARCH_DEBOUNCE_MS);
      return;
    } else if (trimmed.startsWith('/')) {
      clearAutocomplete();
      const actionQuery = trimmed.slice(1).trim();
      filterActions(actionQuery);
      return;
    }

    const intent = window.CommandBarIntent ? window.CommandBarIntent.classify(trimmed, { evaluate: window.OverlaySearch && window.OverlaySearch.evaluateCalc, mode: searchRoutingMode, providers: aiProviders() }) : null;
    if (intent && intent.type === 'AI') {
      renderAiResults(intent.query, intent.forced, intent.providerId);
      if (suggestionsEnabled && !intent.forced) {
        suggestDebounceTimer = setTimeout(() => {
          if (queryToken !== currentQueryToken) return;
          fetchSuggestions(trimmed, queryToken, false, suppressGhost);
        }, SEARCH_DEBOUNCE_MS);
      }
      return;
    }
    const explicitMatch = trimmed.match(/^(?:define|def|dict)\s+(.+)$/i) || trimmed.match(/^(.+)\s+(?:define|def|dict)$/i) || (window.CommandBarIntent && window.CommandBarIntent.explicitDictionary(trimmed) ? trimmed.match(/^(.+)\s*\?$/i) : null);
    const targetWord = explicitMatch ? (explicitMatch[1] || explicitMatch[2] || explicitMatch[0]).replace(/\?$/, '').trim() : null;
    if (targetWord) {
      activeDefItem = { type: 'DEF', data: { status: 'loading', word: targetWord }, title: `Define "${targetWord}"`, sub: 'Fetching definition from FreeDictionaryAPI...' };
    }

    searchDebounceTimer = setTimeout(() => {
      if (queryToken !== currentQueryToken) return;
      fetchUnifiedMatches(trimmed, searchAllWindowsByDefault, () => {
        if (targetWord) handleDictionaryLookup(targetWord, queryToken);
      }, queryToken, suppressGhost);
    }, SEARCH_DEBOUNCE_MS);
  }

  function actionFrecencyScore(actionId) {
    const entry = actionUsageMap[actionId];
    if (!entry) return 0;
    const age = Date.now() - (entry.lastUsed || 0);
    let recencyWeight;
    if (age < 24 * 60 * 60 * 1000) recencyWeight = 100;
    else if (age < 7 * 24 * 60 * 60 * 1000) recencyWeight = 60;
    else if (age < 30 * 24 * 60 * 60 * 1000) recencyWeight = 30;
    else recencyWeight = 10;
    return (entry.count || 0) * recencyWeight;
  }
  function recordActionUsage(actionId) {
    if (!actionId || !isContextValid()) return;
    chrome.storage.local.get(['actionUsage'], (res) => {
      if (chrome.runtime.lastError) return;
      const usage = (res && res.actionUsage) || {};
      const now = Date.now();
      const entry = usage[actionId] || { count: 0, lastUsed: 0 };
      entry.count += 1;
      entry.lastUsed = now;
      usage[actionId] = entry;
      chrome.storage.local.set({ actionUsage: usage });
      actionUsageMap = usage;
    });
  }

  function filterActions(query) {
    const allActions = window.ActionRegistry ? window.ActionRegistry.all() : (window.ACTIONS || []);
    const enabledActions = window.ActionRegistry ? window.ActionRegistry.enabled(disabledActionIds) : allActions.filter((a) => !disabledActionIds.includes(a.id));
    if (!query) {
      currentResults = enabledActions
        .map((a) => ({ type: 'ACTION', data: a, title: a.label, sub: a.keywords.join(', ') }))
        .sort((a, b) => (actionFavorites.includes(b.data.id) - actionFavorites.includes(a.data.id)) || actionFrecencyScore(b.data.id) - actionFrecencyScore(a.data.id));
    } else {
      const scored = [];
      for (const a of enabledActions) {
        const textToSearch = window.ActionRegistry ? window.ActionRegistry.searchText(a) : a.label + ' ' + a.keywords.join(' ') + ' ' + (a.aliases || []).join(' ');
        const baseScore = window.OverlaySearch ? window.OverlaySearch.fuzzyScore(query, textToSearch) : 0;
        if (baseScore > 0) {
          const score = baseScore + actionFrecencyScore(a.id) * 0.05;
          scored.push({ type: 'ACTION', data: a, title: a.label, sub: (a.aliases || []).length ? `${a.keywords.join(', ')} · ${a.aliases.join(', ')}` : a.keywords.join(', '), score: score + (actionFavorites.includes(a.id) ? 20 : 0) });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      currentResults = scored;
    }
    selectedIndex = 0;
    renderResults();
  }

  function fetchHistoryScope(q, token) {
    const activeToken = token || currentQueryToken;
      safeSendMessage({ type: 'QUERY_HISTORY', query: q, limit: 500 }, (res) => {
      if (activeToken !== currentQueryToken) return;
      const items = (res && res.history) || [];
      currentResults = window.CommandBarHistory ? window.CommandBarHistory.groupHistory(items, q, commandBarUsage).map((item) => item.type === 'HISTORY' ? Object.assign(item, { sub: item.sub + (window.CommandBarHistory.relativeTime(item.data.lastVisitTime) ? ' · ' + window.CommandBarHistory.relativeTime(item.data.lastVisitTime) : '') }) : item) : items.map((h) => ({ type: 'HISTORY', data: h, title: h.title, sub: h.url }));
      selectedIndex = firstSelectableIndex();
      renderResults();
    });
  }

  function isSelectable(item) {
    return Boolean(item) && item.type !== 'HISTORY_GROUP';
  }

  function firstSelectableIndex() {
    const index = currentResults.findIndex(isSelectable);
    return index === -1 ? 0 : index;
  }

  function moveSelection(delta) {
    if (!currentResults.length) return;
    let next = selectedIndex;
    for (let i = 0; i < currentResults.length; i++) {
      next = (next + delta + currentResults.length) % currentResults.length;
      if (isSelectable(currentResults[next])) {
        selectedIndex = next;
        return;
      }
    }
  }
  function fetchBookmarksScope(q, token) {
    const activeToken = token || currentQueryToken;
    safeSendMessage({ type: 'QUERY_BOOKMARKS', query: q }, (res) => {
      if (activeToken !== currentQueryToken) return;
      const items = (res && res.bookmarks) || [];
      currentResults = items.map((b) => ({ type: 'BOOKMARK', data: b, title: b.title, sub: b.url }));
      selectedIndex = 0;
      renderResults();
    });
  }

  // Returns true if two candidates would autocomplete to the SAME target
  // (i.e. they share a hostname). Several tabs/history entries open on
  // the same site (e.g. five different claude.ai conversations) are not
  // genuinely ambiguous for autocomplete purposes -- they'd all complete
  // to "claude.ai" anyway -- so the margin-of-confidence check below only
  // needs to fire when the top two candidates would complete to
  // DIFFERENT strings (a real "amazon vs. amtrak" style ambiguity).
  function sameCompletionHost(a, b) {
    try {
      const hostA = new URL((a.data.url || '').toLowerCase()).hostname.replace(/^www\./, '');
      const hostB = new URL((b.data.url || '').toLowerCase()).hostname.replace(/^www\./, '');
      return Boolean(hostA) && hostA === hostB;
    } catch (e) {
      return false;
    }
  }

  // Decides whether the top-scored tab/history match is confident enough
  // to become the default match (both the inline-selection autocomplete
  // AND what Enter opens). Recalibrated for the stricter, substring-based
  // fuzzyScore: a genuine prefix match already scores well above this
  // floor on its own, so CONFIDENCE_THRESHOLD is now a defensive floor
  // rather than the primary gate. The real gate is matchesPrefix (must be
  // a literal hostname/title/url prefix) plus the same-host margin
  // bypass, which is what stops "five tabs on the same domain" from
  // wrongly falling through to a plain web search.
  function pickConfidentTop(queryText, scoredItems) {
    if (!queryText || scoredItems.length === 0) return null;
    const top = scoredItems[0];
    const second = scoredItems[1];
    const qLower = queryText.toLowerCase();
    const urlLower = (top.data.url || '').toLowerCase();
    const titleLower = (top.title || '').toLowerCase();

    let matchesPrefix = false;
    try {
      const host = new URL(urlLower).hostname.replace(/^www\./, '');
      if (host.startsWith(qLower)) matchesPrefix = true;
    } catch (e) {}
    if (!matchesPrefix && (urlLower.startsWith(qLower) || titleLower.startsWith(qLower))) {
      matchesPrefix = true;
    }
    if (!matchesPrefix) return null;

    const CONFIDENCE_THRESHOLD = 40;
    const MARGIN_RATIO = 1.3;
    const clearsThreshold = top.score >= CONFIDENCE_THRESHOLD;
    const noRealAmbiguity = !second || sameCompletionHost(top, second) || top.score >= second.score * MARGIN_RATIO;

    if (clearsThreshold && noRealAmbiguity) return top;
    return null;
  }

  function fetchUnifiedMatches(queryText, allWindows, onComplete, token, suppressGhost) {
    const activeToken = token || currentQueryToken;
    const bookmarkPromise = queryText ? getBookmarksCached(queryText) : Promise.resolve([]);
    Promise.all([getTabsCached(allWindows), getHistoryCached(queryText), bookmarkPromise]).then(([tabs, historyItems, bookmarks]) => {
      if (activeToken !== currentQueryToken || (queryText && queryText !== typedQuery.trim())) return;

      if (!queryText) {
        let tabItems = tabs.map((t) => ({ type: 'TAB', data: t, title: t.title, sub: t.url, icon: t.favIconUrl, frecency: t.frecency || 0 }));
        tabItems.sort((a, b) => b.frecency - a.frecency);
        currentResults = tabItems;
        selectedIndex = 0;
        clearAutocomplete();
        renderResults();
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const itemMap = new Map();
      for (const t of tabs) {
        const itemData = { title: t.title, url: t.url, frecency: t.frecency || 0, source: 'TAB', active: t.active, pinned: t.pinned };
        const score = (window.OverlaySearch ? window.OverlaySearch.calculateCompositeScore(queryText, itemData, { source: 'TAB' }) : 0) + usageBoost(queryText, { type: 'TAB', data: t });
        if (score > 0) {
          const key = window.CommandBarHistory ? window.CommandBarHistory.normalizeUrl(t.url) : (t.url || '').toLowerCase();
          itemMap.set(key, { type: 'TAB', data: t, title: t.title, sub: t.url, icon: t.favIconUrl, score, badges: ['TAB'] });
        }
      }
      const rankedHistory = window.CommandBarHistory ? window.CommandBarHistory.dedupeHistory(historyItems, queryText, commandBarUsage) : historyItems;
      for (const h of rankedHistory) {
        const key = window.CommandBarHistory ? window.CommandBarHistory.normalizeUrl(h.url) : (h.url || '').toLowerCase();
        const itemData = { title: h.title, url: h.url, frecency: h.frecency || 0, visitCount: h.visitCount, typedCount: h.typedCount, source: 'HISTORY' };
        const score = (window.OverlaySearch ? window.OverlaySearch.calculateCompositeScore(queryText, itemData, { source: 'HISTORY' }) : 0) + usageBoost(queryText, { type: 'HISTORY', data: h });
        if (score > 0) {
          if (itemMap.has(key)) {
            const existing = itemMap.get(key);
            if (existing.type === 'TAB' && score > existing.score) {
              itemMap.set(key, { type: 'HISTORY', data: h, title: h.title, sub: h.url, score, badges: ['HISTORY', 'TAB'], tab: existing.data });
            } else {
              existing.score += score * 0.15;
              if (!existing.badges.includes('HISTORY')) existing.badges.push('HISTORY');
            }
          } else {
            itemMap.set(key, { type: 'HISTORY', data: h, title: h.title, sub: h.url, score, badges: ['HISTORY'] });
          }
        }
      }

      for (const b of bookmarks) {
        const itemData = { title: b.title, url: b.url, source: 'BOOKMARK' };
        const score = window.OverlaySearch
          ? window.OverlaySearch.calculateCompositeScore(queryText, itemData, { source: 'BOOKMARK' })
          : 0;
        if (score <= 0) continue;
        const key = window.CommandBarHistory ? window.CommandBarHistory.normalizeUrl(b.url) : (b.url || '').toLowerCase();
        const bookmarkItem = { type: 'BOOKMARK', data: b, title: b.title, sub: b.url, score, badges: ['BOOKMARK'] };
        if (!itemMap.has(key)) {
          itemMap.set(key, bookmarkItem);
        } else {
          const existing = itemMap.get(key);
          if (!existing.badges.includes('BOOKMARK')) existing.badges.push('BOOKMARK');
          // History remains the preferred representation whenever it has a
          // real match; otherwise a bookmark can replace a weaker tab hit.
          if (existing.type === 'TAB' && score > existing.score) itemMap.set(key, bookmarkItem);
        }
      }

      const scoredItems = Array.from(itemMap.values());
      scoredItems.sort((a, b) => b.score - a.score);
      const cappedMatches = scoredItems.slice(0, resultLimit || MAX_MATCH_RESULTS);

      const searchItem = {
        type: 'SEARCH', data: { query: queryText },
        title: `Search Web for "${queryText}"`, sub: 'Helium default',
        badges: ['SEARCH'], score: SEARCH_ACTION_SCORE
      };

      const explicitMatch = queryText.match(/^(?:define|def|dict)\s+(.+)$/i) || queryText.match(/^(.+)\s+(?:define|def|dict)$/i) || queryText.match(/^(.+)\s*\?$/i);
      const isExplicitDef = Boolean(explicitMatch);
      const confidentTop = pickConfidentTop(queryText, cappedMatches);
      if (confidentTop) confidentTop.autocompleted = true;

      // Phase 1: rank everything by relevance only.
      let ranked = [...cappedMatches, searchItem];
      ranked.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Phase 2/3: pick the single default match independently of
      // relevance, then force it into slot zero -- mirrors Chromium's
      // allowed_to_be_default_match + SortAndCull promotion, so the row
      // Enter commits to is always the one visually on top, and the
      // inline-selection autocomplete (driven by this same value) is
      // never out of sync with what pressing Enter actually does.
      const defaultItem = confidentTop || searchItem;
      const defaultIdx = ranked.indexOf(defaultItem);
      if (defaultIdx > 0) {
        ranked.splice(defaultIdx, 1);
        ranked.unshift(defaultItem);
      }
      currentResults = ranked;

      // Explicit "define X" always wins the top slot outright.
      mergeActiveDefItem(isExplicitDef);
      selectedIndex = 0;

      if (autocompleteEnabled && !suppressGhost && !completionBlocked(queryText) && confidentTop) applyAutocomplete(queryText, confidentTop, 'local');
      renderResults();
      if (typeof onComplete === 'function') onComplete();

      if (!suggestionsEnabled) return;
      clearTimeout(suggestDebounceTimer);
      suggestDebounceTimer = setTimeout(() => {
        fetchSuggestions(queryText, activeToken, isExplicitDef, suppressGhost);
      }, 100);
    });
  }

  function fetchSuggestions(queryText, token, isExplicitDef, suppressGhost) {
    const activeToken = token || currentQueryToken;
    if (suppressGhost) return;
    safeSendMessage({ type: 'FETCH_SUGGESTIONS', text: queryText }, (res) => {
      if (activeToken !== currentQueryToken || queryText !== typedQuery.trim() || suppressGhost || completionBlocked(queryText)) return;
      if (!res || !Array.isArray(res.suggestions)) return;
      const suggestions = res.suggestions.filter(
        (s) => typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== queryText.toLowerCase()
      );
      if (suggestions.length === 0) return;

      if (queryText !== typedQuery.trim() || suppressGhost || isKeyboardNav || autocompleteActive || completionBlocked(queryText)) return;

      const aiSearch = currentResults.some((item) => item.type === 'AI');
      const promotesSuggestions = !aiSearch && window.OverlaySearch && window.OverlaySearch.shouldPromoteSuggestions
        ? window.OverlaySearch.shouldPromoteSuggestions(queryText, { hasStrongLocalMatch: currentResults.some((item) => item.autocompleted) })
        : false;

      const suggestItems = suggestions.slice(0, 4).map((s, i) => ({
        type: 'SUGGESTION', data: { query: s }, title: s, sub: 'Search Suggestion',
        badges: ['SUGGESTION'], score: (promotesSuggestions ? SEARCH_ACTION_SCORE + 28 : SUGGESTION_BASE_SCORE) - i * SUGGESTION_SCORE_STEP
      }));

      const previouslySelected = currentResults[selectedIndex];
      const currentDefault = currentResults[0];
      const keepDefault = promotesSuggestions ? null : currentDefault;

      currentResults = currentResults.filter((r) => r.type !== 'SUGGESTION' && r.type !== 'DEF' && r !== keepDefault);
      currentResults.push(...suggestItems);
      currentResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      if (keepDefault && keepDefault.type !== 'DEF') currentResults.unshift(keepDefault);

      mergeActiveDefItem(isExplicitDef);

      if (explicitSelection && previouslySelected) {
        const idx = currentResults.indexOf(previouslySelected);
        selectedIndex = idx !== -1 ? idx : 0;
      } else {
        selectedIndex = 0;
      }
      renderResults();
      if (!isExplicitDef && promotesSuggestions && !explicitSelection && !currentResults.some((item) => item.autocompleted)) {
        const webItem = suggestItems[0];
        if (autocompleteEnabled) applyAutocomplete(queryText, webItem, 'web');
      }
    });
  }

  function getItemKey(item) {
    switch (item.type) {
      case 'HISTORY_GROUP': return 'HISTORY_GROUP:' + item.group;
      case 'TAB': return 'TAB:' + item.data.id;
      case 'HISTORY': return 'HISTORY:' + item.data.url + ':' + item.data.id;
      case 'BOOKMARK': return 'BOOKMARK:' + item.data.id + ':' + item.data.url;
      case 'ACTION': return 'ACTION:' + item.data.id;
      case 'SEARCH': return 'SEARCH:' + item.data.query;
      case 'SUGGESTION': return 'SUGGESTION:' + item.data.query;
      case 'AI': return 'AI:' + item.data.provider.id;
      case 'CALC': return 'CALC';
      case 'DEF': return 'DEF:' + item.data.word;
      default: return item.type + ':' + item.title;
    }
  }

  function buildStandardRow() {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.className = 'result-left';
    const icon = document.createElement('img');
    icon.className = 'result-icon';
    icon.style.display = 'none';
    icon.onerror = () => { icon.style.display = 'none'; };
    left.appendChild(icon);
    const titleSpan = document.createElement('span');
    titleSpan.className = 'result-title';
    const text = document.createElement('div');
    text.className = 'result-text';
    const heading = document.createElement('div');
    heading.className = 'result-heading';
    heading.appendChild(titleSpan);
    text.appendChild(heading);
    left.appendChild(text);

    const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pinSvg.setAttribute('viewBox', '0 0 24 24');
    pinSvg.setAttribute('class', 'status-icon');
    pinSvg.style.display = 'none';
    pinSvg.innerHTML = '<path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z"/>';
    heading.appendChild(pinSvg);

    const muteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    muteSvg.setAttribute('viewBox', '0 0 24 24');
    muteSvg.setAttribute('class', 'status-icon');
    muteSvg.style.display = 'none';
    muteSvg.innerHTML = '<path d="M3.63 3.63L2.22 5.04L7.29 10.11L7 10.4V13.6H10.2L14.2 17.6V17.02L17.7 20.52L19.11 19.11L3.63 3.63ZM14.2 6.4L12.45 8.15L14.2 9.9V6.4ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12Z"/>';
    heading.appendChild(muteSvg);

    const subSpan = document.createElement('span');
    subSpan.className = 'result-sub';
    subSpan.style.display = 'none';
    text.appendChild(subSpan);

    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-container';

    li.appendChild(left);
    li.appendChild(badgeContainer);
    li.refs = { icon, titleSpan, pinSvg, muteSvg, subSpan, badgeContainer };
    return li;
  }

  function updateStandardRow(li, item, query, index) {
    const refs = li.refs;
    if (item.type === 'TAB' && item.icon) {
      if (refs.icon.getAttribute('src') !== item.icon) refs.icon.src = item.icon;
      refs.icon.style.display = '';
    } else {
      refs.icon.style.display = 'none';
      if (refs.icon.hasAttribute('src')) refs.icon.removeAttribute('src');
    }
    refs.titleSpan.innerHTML = highlightMatches(item.title, query);
    refs.pinSvg.style.display = (item.type === 'TAB' && item.data.pinned) ? '' : 'none';
    refs.muteSvg.style.display = (item.type === 'TAB' && item.data.muted) ? '' : 'none';
    if (item.sub) {
      refs.subSpan.innerHTML = highlightMatches(item.sub, query);
      refs.subSpan.style.display = '';
    } else {
      refs.subSpan.innerHTML = '';
      refs.subSpan.style.display = 'none';
    }
    const badgeList = item.badges || (item.type ? [item.type] : []);
    const existingBadges = Array.from(refs.badgeContainer.children).map((b) => b.textContent);
    if (existingBadges.join(',') !== badgeList.join(',')) {
      refs.badgeContainer.innerHTML = '';
      badgeList.forEach((bText) => {
        const badge = document.createElement('span');
        badge.className = 'result-badge';
        badge.textContent = bText;
        refs.badgeContainer.appendChild(badge);
      });
    }
    li.className = 'result-item' + (index === selectedIndex ? ' selected' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
    li.onclick = () => { explicitSelection = true; selectedIndex = index; executeSelected(); };
  }

  function buildCardRow() {
    return document.createElement('li');
  }
  function updateCardRow(li, item, index) {
    li.className = 'result-item result-item-card' + (index === selectedIndex ? ' selected' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
    if (window.OverlayCard) {
      window.OverlayCard.renderInlineCard(li, item, {
        onOpenAppleDict: (word) => {
          safeSendMessage({ type: 'OPEN_APPLE_DICT', word });
          input.value = word;
          hideOverlay();
        }
      });
    }
    li.onclick = () => { explicitSelection = true; selectedIndex = index; executeSelected(); };
  }

  function executeResult(item, e) {
    if (!isSelectable(item)) return;
    if (e && (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) {
      executeSearch(item.data && item.data.query ? item.data.query : input.value, e);
      return;
    }
    if (item.type === 'TAB') {
      recordCommandUsage(completionState === 'accepted' ? lastAcceptedTypedQuery.trim() : input.value.trim(), item);
      safeSendMessage({ type: 'FOCUS_TAB', tabId: item.data.id, windowId: item.data.windowId });
      hideOverlay();
    } else if (item.type === 'HISTORY' || item.type === 'BOOKMARK') {
      recordCommandUsage(completionState === 'accepted' ? lastAcceptedTypedQuery.trim() : input.value.trim(), item);
      safeSendMessage({ type: 'CREATE_TAB', url: item.data.url, visitKind: item.autocompleted ? 'typed' : 'link' });
      hideOverlay();
    } else if (item.type === 'CALC') {
      navigator.clipboard.writeText(item.data.query || item.data.expression || '').catch(() => {});
      hideOverlay();
    } else if (item.type === 'DEF') {
      const defData = item.data;
      if (defData.status === 'success' && Array.isArray(defData.meanings) && defData.meanings[0]) {
        const textToCopy = defData.word + ': ' + (defData.meanings[0].definitions[0] && defData.meanings[0].definitions[0].definition);
        navigator.clipboard.writeText(textToCopy).catch(() => {});
      } else {
        safeSendMessage({ type: 'OPEN_APPLE_DICT', word: defData.word });
        input.value = defData.word;
      }
      hideOverlay();
    } else if (item.type === 'SEARCH' || item.type === 'SUGGESTION') {
      executeSearch(item.data.query, e);
    } else if (item.type === 'AI') {
      const provider = item.data.provider;
      if (provider.type === 'browser-default') {
        safeSendMessage({ type: 'SEARCH_QUERY', text: item.data.query });
        hideOverlay();
      } else if (provider.type === 'url' && typeof CommandBarSearchEngines !== 'undefined') {
        safeSendMessage({ type: 'CREATE_TAB', url: CommandBarSearchEngines.buildUrl(provider.url, item.data.query), visitKind: 'typed' });
        hideOverlay();
      }
    } else if (item.type === 'ACTION') {
      const actionId = item.data.id;
      recordActionUsage(actionId);
      if (actionId === 'copy-url') {
        navigator.clipboard.writeText(window.location.href).catch(() => {});
        hideOverlay();
      } else if (actionId === 'copy-title-url') {
        navigator.clipboard.writeText(`${hostDocument.title}\n${window.location.href}`).catch(() => {});
        hideOverlay();
      } else if (actionId === 'new-tab') {
        safeSendMessage({ type: 'CREATE_TAB' });
        hideOverlay();
      } else {
        safeSendMessage({ type: 'RUN_ACTION', actionId });
        hideOverlay();
      }
    }
  }

  function executeSelected(e) {
    executeResult(currentResults[selectedIndex], e);
  }

  input.addEventListener('input', (e) => {
    e.stopPropagation();
    if (completionState === 'cancelled' && input.value !== cancelledCompletionQuery) {
      cancelledCompletionQuery = null;
      lastEditWasDeletion = false;
      lastAcceptedTypedQuery = '';
      clearAutocomplete();
    } else if (autocompleteActive || completionState === 'accepted') {
      lastAcceptedTypedQuery = '';
      clearAutocomplete();
    }
    typedQuery = input.value;
    explicitSelection = false;
    updateSearch();
  });

  // Keep keyboard events originating in the palette from bubbling back into
  // the host page (Gmail and similar apps use document-level shortcuts), but
  // do this at the input target. Intercepting printable keys at window capture
  // prevents the event from reaching this input at all.
  ['keypress', 'keyup', 'paste', 'drop', 'compositionstart', 'compositionend'].forEach((eventType) => {
    input.addEventListener(eventType, (e) => e.stopPropagation());
  });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const keyLower = (e.key || '').toLowerCase();
    const isVimDown = e.ctrlKey && keyLower === 'j';
    const isVimUp = e.ctrlKey && keyLower === 'k';

    if ((e.key === 'Backspace' || e.key === 'Delete') && autocompleteActive && autocompleteSuffixSelected &&
        input.selectionStart !== input.selectionEnd && input.selectionEnd === input.value.length) {
      e.preventDefault();
      const prefix = input.value.slice(0, input.selectionStart);
      cancelAutocomplete(prefix);
      input.value = prefix;
      input.setSelectionRange(prefix.length, prefix.length);
      lastEditWasDeletion = true;
      updateSearch();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      lastEditWasDeletion = true;
    } else if ((e.key || '').length === 1 || e.key === 'Process' || e.key === 'Dead') {
      lastEditWasDeletion = false;
    }

    if (e.key === 'ArrowRight') {
      if (autocompleteActive && input.selectionStart !== input.selectionEnd && input.selectionEnd === input.value.length) {
        e.preventDefault();
        acceptAutocomplete();
        explicitSelection = true;
        updateSearch();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey && autocompleteActive && input.selectionStart !== input.selectionEnd && input.selectionEnd === input.value.length) {
        acceptAutocomplete();
        explicitSelection = true;
        updateSearch();
        return;
      }
      if (currentResults.length > 0) {
        isKeyboardNav = true;
        moveSelection(e.shiftKey ? -1 : 1);
        renderResults();
      }
      return;
    }

    if (e.key === 'ArrowDown' || isVimDown) {
      e.preventDefault();
      if (autocompleteActive) { acceptAutocomplete(); updateSearch(); }
      if (currentResults.length > 0) {
        isKeyboardNav = true;
        explicitSelection = true;
        moveSelection(1);
        renderResults();
      }
    } else if (e.key === 'ArrowUp' || isVimUp) {
      e.preventDefault();
      if (autocompleteActive) { acceptAutocomplete(); updateSearch(); }
      if (currentResults.length > 0) {
        isKeyboardNav = true;
        explicitSelection = true;
        moveSelection(-1);
        renderResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        executeSearch(autocompleteActive && autocompleteSuffixSelected ? typedQuery : input.value, e);
        return;
      }
      if (autocompleteActive && autocompleteSuffixSelected) {
        const query = typedQuery.trim();
        const target = completionTarget;
        clearAutocomplete();
        if (target && (target.type === 'TAB' || target.type === 'HISTORY' || target.type === 'BOOKMARK')) {
          executeResult(target, e);
        } else {
          executeSearch(query, e);
        }
        return;
      }
      if (!explicitSelection) {
        if (currentResults[0] && currentResults[0].type === 'AI') {
          executeResult(currentResults[0], e);
          return;
        }
        executeSearch(input.value, e);
        return;
      }
      executeSelected(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideOverlay();
    }
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) hideOverlay();
  });

  function renderResults() {
    const query = input.value.trim();

    if (currentResults.length === 0) {
      clearResultNodes();
      const emptyLi = document.createElement('li');
      emptyLi.className = 'result-item empty-state';
      emptyLi.style.cursor = 'default';
      emptyLi.style.color = 'rgba(255, 255, 255, 0.35)';
      emptyLi.textContent = 'No matching tabs, history, actions, or definitions';
      resultsList.appendChild(emptyLi);
      return;
    }

    resultsList.querySelector('.empty-state')?.remove();
    const seenKeys = new Set();
    currentResults.forEach((item, index) => {
      const key = getItemKey(item);
      seenKeys.add(key);
      if (item.type === 'HISTORY_GROUP') {
        let groupLi = rowNodeMap.get(key);
        if (!groupLi) { groupLi = document.createElement('li'); rowNodeMap.set(key, groupLi); }
        groupLi.className = 'history-group-header';
        groupLi.textContent = item.group + ' · ' + item.count;
        resultsList.appendChild(groupLi);
        return;
      }
      const isCard = item.type === 'CALC' || item.type === 'DEF';
      let li = rowNodeMap.get(key);
      if (!li) {
        li = isCard ? buildCardRow() : buildStandardRow();
        rowNodeMap.set(key, li);
      }
      if (isCard) updateCardRow(li, item, index);
      else updateStandardRow(li, item, query, index);
      resultsList.appendChild(li);
    });

    rowNodeMap.forEach((li, key) => {
      if (!seenKeys.has(key)) { li.remove(); rowNodeMap.delete(key); }
    });

    const selectedElem = resultsList.children[selectedIndex];
    if (isKeyboardNav && selectedElem) {
      selectedElem.scrollIntoView({ block: 'nearest' });
    } else {
      resultsContainer.scrollTop = 0;
    }
    isKeyboardNav = false;
  }

  if (isContextValid()) {
    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request) return;
        if (request.action === 'PING') sendResponse({ alive: true });
        else if (request.action === 'TOGGLE_OVERLAY') {
          toggleOverlay();
          sendResponse({ handled: true });
        }
        // runtime messages reach other extension pages too. Visibility is a
        // notification for the background, never a request to rebroadcast.
      });
    } catch (e) {}
  }

  if (isNewTab) {
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q');
    if (initialQuery) {
      pendingInitialValue = initialQuery;
      showOverlay();
    }
  }
})(document);
