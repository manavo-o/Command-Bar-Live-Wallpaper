(function (hostDocument) {
  if (window.__cmd_bar_overlay_injected || !window.CommandBarView) return;
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
      .input-wrapper,.results-panel{background:linear-gradient(160deg,#151516,#0d0d0e);border:1px solid #ffffff24;box-shadow:inset 0 1px 0 #ffffff12,0 14px 40px #0005;will-change:transform,opacity;}
      .overlay-backdrop .input-wrapper,.overlay-backdrop .results-panel{visibility:hidden;}
      .overlay-backdrop.visible .input-wrapper,.overlay-backdrop.visible .results-panel,.overlay-backdrop.exiting .input-wrapper,.overlay-backdrop.exiting .results-panel{visibility:visible;}
      .input-wrapper{padding:22px 28px;border-radius:999px;}
      .input-field{box-sizing:border-box;width:100%;background:transparent;border:0;outline:0;color:inherit;font:22px system-ui;}
      .input-field::placeholder{font-size:22px;color:#ffffff70;}
      .input-wrapper{position:relative;}
      .caret-mirror{position:absolute;visibility:hidden;white-space:pre;pointer-events:none;}
      .caret-aura{position:absolute;width:2px;background:#f8fbff;box-shadow:0 0 2px .5px #e2f4ffcc,0 0 4px 0 #b4dbff80;pointer-events:none;}
      .caret-aura[hidden],.results-panel[hidden]{display:none;}
      .ai-submit{flex-shrink:0;width:36px;height:36px;margin-left:16px;border:1px solid #ffffff50;border-radius:50%;background:#ffffff15;color:inherit;}
      .ai-submit svg{width:23px;height:23px;}
      .results-panel{box-sizing:border-box;border-radius:28px;overflow:hidden;}
      .results-container{overflow:auto;max-height:58vh;}
      .results-track{position:relative;isolation:isolate;}
      .selection-highlight{position:absolute;pointer-events:none;background:#ffffff14;border-radius:16px;}
      .results-list{position:relative;}
      .results-list{list-style:none;padding:12px;margin:0;}
      .result-item{display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:16px;}
      .result-item.selected{color:#fff;}
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

  const view = window.CommandBarView.mount(shadow, {
    key: item => getItemKey(item),
    positions: (query, text) => window.OverlaySearch?.fuzzyMatchPositions(query, text),
    icon: item => resolvedIcons.get(getItemKey(item)) || (/^(https?:|data:image\/)/i.test(item.icon || '') ? item.icon : '') || fallbackIcon(item.type),
    fallback: type => fallbackIcon(type),
    onLayout: () => { updateSelectionHighlight(false); decorations.track(250); },
    collapse: () => { selectedIndex = 0; explicitSelection = false; renderResults(); },
    submitAI: () => { if (!isComposing && currentResults.some(item => item.type === 'AI')) executeSearch(input.value); },
    select: index => { explicitSelection = true; selectedIndex = index; executeSelected(); },
    renderCard: (node, item, options) => window.OverlayCard?.renderInlineCard(node, item, options),
    openDictionary: word => { safeSendMessage({ type: 'OPEN_APPLE_DICT', word }); input.value = word; hideOverlay(); }
  });
  const { backdrop, modalBox, inputWrapper, input, resultsContainer, resultsList, selectionHighlight, resultsPanel } = view.refs;
  const decorations = window.CommandBarView.createDecorations({ hostDocument, hostShadow, frame, refs: view.refs, window });

  const caretAura = window.CommandBarView.createCaretAura({ refs: view.refs, frame, hostWindow: window, hostDocument });

  const resultAnimations = new Map();
  let hasRenderedResults = false;
  let highlightReady = false;

  // Result motion owns height/position only; entrance motion owns surface transforms.
  function stopResultAnimation(node) {
    const active = resultAnimations.get(node);
    if (!active) return;
    resultAnimations.delete(node);
    clearTimeout(active.timer);
    active.animation.cancel();
  }
  function playResultAnimation(node, frames, duration) {
    stopResultAnimation(node);
    if (!isVisible || !stylesReady || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !node.animate) return;
    try {
      const animation = node.animate(frames, {
        timeline: hostDocument.timeline, duration,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both'
      });
      const active = { animation, timer: null };
      const settle = () => {
        if (resultAnimations.get(node) !== active) return;
        stopResultAnimation(node);
      };
      resultAnimations.set(node, active);
      active.timer = setTimeout(settle, duration + 100);
      animation.finished.then(settle, settle);
    } catch (error) { /* Final styles are already applied; render immediately. */ }
  }
  function cancelResultMotion(reset = false) {
    for (const node of resultAnimations.keys()) stopResultAnimation(node);
    resultsPanel.style.height = '';
    if (reset) {
      hasRenderedResults = false;
      highlightReady = false;
      selectionHighlight.hidden = true;
    }
  }
  function updateSelectionHighlight(animate = true) {
    const selected = currentResults[selectedIndex] && rowNodeMap.get(getItemKey(currentResults[selectedIndex]));
    if (!isVisible || !selected || selected.getAttribute('aria-selected') !== 'true') {
      stopResultAnimation(selectionHighlight);
      selectionHighlight.hidden = true;
      highlightReady = false;
      return;
    }
    const before = frame.contentWindow.getComputedStyle(selectionHighlight);
    const from = { top: before.top, left: before.left, width: before.width, height: before.height };
    // Layout offsets stay correct while an entrance transform scales the panel.
    const to = { top: `${selected.offsetTop + resultsList.offsetTop}px`,
      left: `${selected.offsetLeft + resultsList.offsetLeft}px`,
      width: `${selected.offsetWidth}px`, height: `${selected.offsetHeight}px` };
    stopResultAnimation(selectionHighlight);
    Object.assign(selectionHighlight.style, to);
    selectionHighlight.hidden = false;
    if (highlightReady && animate && Object.keys(to).some(key => from[key] !== to[key])) {
      playResultAnimation(selectionHighlight, [from, to], 150);
    }
    highlightReady = true;
  }
  function finishResultRender(previousHeight, inserted) {
    stopResultAnimation(resultsPanel);
    resultsPanel.style.height = '';
    const nextHeight = resultsPanel.offsetHeight;
    if (hasRenderedResults && previousHeight !== nextHeight) {
      playResultAnimation(resultsPanel, [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }], 200);
    }
    for (const row of inserted) playResultAnimation(row, [{ opacity: 0 }, { opacity: 1 }], 100);
    updateSelectionHighlight();
    hasRenderedResults = true;
  }
  resultsContainer.addEventListener('scroll', () => { updateSelectionHighlight(false); resolveVisibleIcons(); }, { passive: true });
  frame.contentWindow.addEventListener('resize', () => {
    if (!isVisible) return;
    cancelResultMotion();
    updateSelectionHighlight(false);
  });

  let isVisible = false;
  let exitCleanupTimer = null;
  let motionAnimations = [];
  let motionGeneration = 0;
  let openingMotionTimer = null;
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
  const rowNodeMap = view.rows;

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
    const url = !engine && !(e && e.shiftKey) ? window.CommandBarIntent.navigationUrl(text) : null;
    if (url) {
      recordCommandUsage(text, { type: 'HISTORY', data: { url } });
      safeSendMessage({ type: 'CREATE_TAB', url, visitKind: 'typed' });
      hideOverlay();
      return;
    }
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

  function renderAiResults(query) {
    currentResults = [{ type: 'AI', data: { query }, title: 'Ask AI', score: 100 }];
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
    cancelledCompletionQuery = String(query == null ? typedQuery : query).trim();
  }

  function completionBlocked(query) {
    return completionState === 'cancelled' && cancelledCompletionQuery === String(query || '').trim();
  }

  function applyAutocomplete(queryText, confidentItem, source) {
    if (!queryText || !confidentItem) { clearAutocomplete(); return; }
    const qLower = queryText.toLowerCase();
    let candidateString = null;
    if (source === 'web') {
      candidateString = confidentItem.data && confidentItem.data.query;
    } else {
      candidateString = websiteCompletion(queryText, confidentItem);
      if (!candidateString && (confidentItem.title || '').toLowerCase().startsWith(qLower)) {
        candidateString = confidentItem.title;
      }
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

  function clearResultNodes() {
    cancelResultMotion(true);
    view.clear();
  }

  // Read before cancelling so reversals begin at the currently painted state.
  function cancelMotion() {
    clearTimeout(openingMotionTimer);
    openingMotionTimer = null;
    const nodes = [backdrop, inputWrapper, resultsPanel];
    const states = nodes.map((node) => {
      const style = frame.contentWindow.getComputedStyle(node);
      return { transform: style.transform, opacity: style.opacity };
    });
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    return states;
  }
  function finishOpeningMotion(generation) {
    if (!isVisible || generation !== motionGeneration) return;
    clearTimeout(openingMotionTimer);
    openingMotionTimer = null;
    // Invalidate rejected completion handlers before cancelling stalled effects.
    ++motionGeneration;
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    backdrop.style.opacity = '';
    inputWrapper.style.opacity = resultsPanel.style.opacity = '1';
    inputWrapper.style.transform = resultsPanel.style.transform = 'none';
    decorations.sync();
  }
  function fadeProgress(t) {
    const progress = Math.max(0, Math.min(1, t));
    return progress * progress * (3 - 2 * progress);
  }
  function animateOverlay(opening) {
    decorations.setActive(true);
    caretAura.setActive(opening);
    decorations.track(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);
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
          transform: opening ? 'translateY(-6px) scale(0.98)' : 'none'
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
            // Limit overshoot to 0.003 at the default starting scale.
            const scale = Math.min(1.003, matrix.a + (1 - matrix.a) * progress);
            return { offset: t, transform: `translateY(${matrix.m42 * (1 - progress)}px) scale(${scale})`,
              opacity: Number(start.opacity) + (1 - Number(start.opacity)) * fadeProgress(t * 320 / 180) };
          });
          keyframes[keyframes.length - 1] = { offset: 1, transform: 'translateY(0) scale(1)', opacity: 1 };
        } else {
          keyframes = [start, { transform: 'translateY(-3px) scale(0.99)', opacity: 0 }];
        }
        animations.push(node.animate(keyframes, {
          // The about:blank iframe can be throttled independently during host
          // hover/video activity. Use the same clock as the shortcut handler.
          timeline: hostDocument.timeline,
          duration: opening ? (index === 0 ? 180 : 320) : 180,
          delay: opening && index === 2 && !interrupted ? 16 : 0,
          easing: opening ? (index === 0 ? 'ease-in-out' : 'linear') : 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'both'
        }));
      });
    } catch (error) {
      // A renderer/API failure must never leave an invisible fill animation.
      animations.forEach((animation) => {
        animation.finished.catch(() => {});
        animation.cancel();
      });
      if (opening) finishOpeningMotion(generation); else finishExit();
      return;
    }
    motionAnimations = animations;
    decorations.sync();
    if (opening) openingMotionTimer = setTimeout(() => finishOpeningMotion(generation), 450);
    Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (generation !== motionGeneration) return;
      if (opening) finishOpeningMotion(generation);
      else {
        animations.forEach((animation) => animation.cancel());
        motionAnimations = [];
        finishExit();
      }
    }).catch(() => {
      // Recover unexpected cancellation; old/reversed generations are ignored.
      if (opening) finishOpeningMotion(generation);
    });
  }
  function finishExit() {
    if (isVisible) return;
    clearTimeout(openingMotionTimer);
    openingMotionTimer = null;
    clearTimeout(exitCleanupTimer);
    exitCleanupTimer = null;
    ++motionGeneration;
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    backdrop.classList.remove('exiting');
    decorations.setActive(false);
    caretAura.setActive(false);
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
    cancelResultMotion();
    ++openGeneration;
    isVisible = false;
    currentQueryToken = ++queryGeneration;
    clearTimeout(searchDebounceTimer);
    clearTimeout(suggestDebounceTimer);
    resetSessionCaches();
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

  window.addEventListener('pagehide', (event) => {
    decorations.setActive(false);
    caretAura.setActive(false);
    if (!event.persisted) { caretAura.dispose(); decorations.dispose(); view.dispose(); }
    cancelResultMotion(true);
    clearTimeout(openingMotionTimer);
    openingMotionTimer = null;
    ++motionGeneration;
    motionAnimations.forEach((animation) => animation.cancel());
    motionAnimations = [];
    clearTimeout(exitCleanupTimer);
  });

  window.addEventListener('pageshow', () => { if (isVisible) { decorations.setActive(true); caretAura.setActive(true); } });

  function resetSessionCaches() {
    tabsCachePromises = {};
    historyCachePromises = new Map();
    bookmarksCachePromises = new Map();
    resolvedIcons.clear();
    requestedIcons.clear();
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
      chrome.storage.local.get(['commandBarDensity', 'searchAllWindowsByDefault', 'disabledActions', 'actionUsage', 'commandBarUsage', 'actionFavorites', 'commandBarResultLimit', 'commandBarSuggestionsEnabled', 'commandBarAutocompleteEnabled', 'customSearchEngines', 'searchRoutingMode'], (res) => {
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

  function handleDictionaryLookup(targetWord, token, mode = 'definition') {
    safeSendMessage({ type: 'FETCH_DEFINITION', word: targetWord, mode }, (res) => {
      if (token !== currentQueryToken) return;
      const defData = res && res.definition;
      if (defData) defData.mode = mode;
      if (defData && defData.status === 'success') {
        const firstMeaning = Array.isArray(defData.meanings) && defData.meanings[0];
        const firstDef = firstMeaning && Array.isArray(firstMeaning.definitions) && firstMeaning.definitions[0];
        activeDefItem = {
          type: 'DEF', data: defData,
          title: `${defData.word}${defData.phonetic ? ' • ' + defData.phonetic : ''}`,
          sub: mode === 'synonyms' ? (defData.synonyms || []).join(', ') : firstDef ? `[${firstMeaning.partOfSpeech}] ${firstDef.definition}` : 'Dictionary Definition'
        };
      } else {
        activeDefItem = {
          type: 'DEF', data: defData || { status: 'unavailable', word: targetWord, mode },
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
      currentResults = [{ type: 'CALC', data: calcObj, title: calcObj.query, sub: `Expression: ${calcObj.expr}` }];
      selectedIndex = 0;
      renderResults();
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

    const intent = window.CommandBarIntent ? window.CommandBarIntent.classify(trimmed, { evaluate: window.OverlaySearch && window.OverlaySearch.evaluateCalc, mode: searchRoutingMode }) : null;
    if (intent && intent.type === 'AI') {
      renderAiResults(intent.query);
      if (suggestionsEnabled) {
        suggestDebounceTimer = setTimeout(() => {
          if (queryToken !== currentQueryToken) return;
          fetchSuggestions(trimmed, queryToken, false, suppressGhost);
        }, SEARCH_DEBOUNCE_MS);
      }
      return;
    }
    const lookup = window.CommandBarIntent && window.CommandBarIntent.wordLookup(trimmed);
    const targetWord = lookup && lookup.word;
    if (targetWord) {
      activeDefItem = { type: 'DEF', data: { status: 'loading', word: targetWord, mode: lookup.mode }, title: `${lookup.mode === 'synonyms' ? 'Synonyms for' : 'Define'} "${targetWord}"`, sub: 'Checking spelling and looking up word…' };
    }

    searchDebounceTimer = setTimeout(() => {
      if (queryToken !== currentQueryToken) return;
      fetchUnifiedMatches(trimmed, searchAllWindowsByDefault, () => {
        if (targetWord) handleDictionaryLookup(targetWord, queryToken, lookup.mode);
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
      getTabsCached(searchAllWindowsByDefault).then((tabs) => {
      if (activeToken !== currentQueryToken) return;
      currentResults = window.CommandBarHistory ? window.CommandBarHistory.groupHistory(items, q, commandBarUsage).map((item) => item.type === 'HISTORY' ? Object.assign(item, { sub: item.sub + (window.CommandBarHistory.relativeTime(item.data.lastVisitTime) ? ' · ' + window.CommandBarHistory.relativeTime(item.data.lastVisitTime) : '') }) : item) : items.map((h) => ({ type: 'HISTORY', data: h, title: h.title, sub: h.url }));
      currentResults = attachScopedTabs(currentResults, tabs, 'HISTORY');
      selectedIndex = firstSelectableIndex();
      renderResults();
      });
    });
  }
  function attachScopedTabs(items, tabs, scope) {
    const matching = new Map();
    tabs.forEach(data => {
      const key = window.CommandBarResults.destinationKey(data.url);
      if (!matching.has(key)) matching.set(key, []);
      matching.get(key).push({ type: 'TAB', data, title: data.title, icon: data.favIconUrl });
    });
    return items.map(item => {
      if (item.type !== scope) return item;
      const key = window.CommandBarResults.destinationKey(item.data.url);
      if (!matching.has(key)) return Object.assign(item, { destinationKey: key });
      return window.CommandBarResults.merge([item].concat(matching.get(key)), scope)[0];
    }).map(item => Object.assign(item, { allWindows: searchAllWindowsByDefault }));
  }

  function isSelectable(item) {
    return Boolean(item) && item.type !== 'HISTORY_GROUP' && !(item.type === 'CALC' && item.data.kind === 'error');
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
      getTabsCached(searchAllWindowsByDefault).then(tabs => {
      if (activeToken !== currentQueryToken) return;
      currentResults = attachScopedTabs(window.CommandBarResults.merge(items.map((b) => ({ type: 'BOOKMARK', data: b, title: b.title, sub: b.url })), 'BOOKMARK'), tabs, 'BOOKMARK');
      selectedIndex = 0;
      renderResults();
      });
    });
  }

  // Prefer the first ranked address prefix even when another website scores
  // nearly as highly. A search suggestion must not replace a matching link.
  function websiteCompletion(queryText, item) {
    const query = queryText.toLowerCase();
    const url = item.data && item.data.url || '';
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const address = `${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
      for (const candidate of [address, url.replace(/^https?:\/\//, ''), url]) {
        if (candidate.toLowerCase().startsWith(query)) return candidate;
      }
    } catch (_) {}
    return null;
  }

  function pickConfidentTop(queryText, scoredItems) {
    if (!queryText) return null;
    return scoredItems.find(item => websiteCompletion(queryText, item)) ||
      scoredItems.find(item => (item.title || '').toLowerCase().startsWith(queryText.toLowerCase())) || null;
  }

  function fetchUnifiedMatches(queryText, allWindows, onComplete, token, suppressGhost) {
    const activeToken = token || currentQueryToken;
    const bookmarkPromise = queryText ? getBookmarksCached(queryText) : Promise.resolve([]);
    Promise.all([getTabsCached(allWindows), getHistoryCached(queryText), bookmarkPromise]).then(([tabs, historyItems, bookmarks]) => {
      if (activeToken !== currentQueryToken || (queryText && queryText !== typedQuery.trim())) return;

      if (!queryText) {
        let tabItems = tabs.map((t) => ({ type: 'TAB', data: t, title: t.title, sub: t.url, icon: t.favIconUrl, frecency: t.frecency || 0 }));
        tabItems.sort((a, b) => b.frecency - a.frecency);
        currentResults = window.CommandBarResults.merge(tabItems).map(item => Object.assign(item, { allWindows }));
        selectedIndex = 0;
        clearAutocomplete();
        renderResults();
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const candidates = [];
      for (const [type, entries] of [['TAB', tabs], ['HISTORY', historyItems], ['BOOKMARK', bookmarks]]) {
        for (const data of entries) {
          const score = (window.OverlaySearch ? window.OverlaySearch.calculateCompositeScore(queryText,
            Object.assign({}, data, { source: type }), { source: type }) : 0) + usageBoost(queryText, { type, data });
          if (score > 0) candidates.push({ type, data, title: data.title, sub: data.url, icon: data.favIconUrl, score, badges: [type] });
        }
      }
      // Matching tabs remain actionable even when only history/bookmark metadata matched the query.
      const matchingKeys = new Set(candidates.map(item => window.CommandBarResults.destinationKey(item.data.url)));
      tabs.forEach(data => {
        if (matchingKeys.has(window.CommandBarResults.destinationKey(data.url))) candidates.push({ type: 'TAB', data, title: data.title, sub: data.url, icon: data.favIconUrl, score: 0 });
      });
      const scoredItems = window.CommandBarResults.merge(candidates).map(item => Object.assign(item, { allWindows }));
      scoredItems.sort((a, b) => b.score - a.score);
      const cappedMatches = scoredItems.slice(0, resultLimit || MAX_MATCH_RESULTS);

      const navigationUrl = window.CommandBarIntent?.navigationUrl(queryText);
      const searchItem = {
        type: 'SEARCH', data: { query: queryText },
        title: navigationUrl ? `Open ${queryText}` : `Search Web for "${queryText}"`, sub: navigationUrl || 'Search the web',
        badges: [navigationUrl ? 'URL' : 'SEARCH'], score: SEARCH_ACTION_SCORE
      };

      const isExplicitDef = Boolean(window.CommandBarIntent && window.CommandBarIntent.wordLookup(queryText));
      const confidentTop = !navigationUrl && !suppressGhost && !completionBlocked(queryText)
        ? pickConfidentTop(queryText, cappedMatches) : null;
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
      const promotesSuggestions = !aiSearch && !window.CommandBarIntent?.navigationUrl(queryText) && window.OverlaySearch && window.OverlaySearch.shouldPromoteSuggestions
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
    if (item.destinationKey) return "URL:" + item.destinationKey;
    switch (item.type) {
      case 'HISTORY_GROUP': return 'HISTORY_GROUP:' + item.group;
      case 'TAB': return 'TAB:' + item.data.id;
      case 'HISTORY': return 'HISTORY:' + item.data.url + ':' + item.data.id;
      case 'BOOKMARK': return 'BOOKMARK:' + item.data.id + ':' + item.data.url;
      case 'ACTION': return 'ACTION:' + item.data.id;
      case 'SEARCH': return 'SEARCH:' + item.data.query;
      case 'SUGGESTION': return 'SUGGESTION:' + item.data.query;
      case 'AI': return 'AI:' + item.data.query;
      case 'CALC': return 'CALC';
      case 'DEF': return 'DEF:' + item.data.word;
      default: return item.type + ':' + item.title;
    }
  }

  const resolvedIcons = new Map();
  const requestedIcons = new Set();
  const fallbackPaths = {
    SEARCH: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
    ACTION: 'M13 2L4 14h7l-1 8 10-12h-7z',
    CALC: 'M5 3h14v18H5z M8 7h8 M8 12h2 M14 12h2 M8 17h2 M14 17h2',
    DEF: 'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15',
    AI: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    SITE: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18'
  };
  function fallbackIcon(type) {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#b9c4d5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fallbackPaths[type] || fallbackPaths.SITE) + '"/></svg>');
  }
  function resolveVisibleIcons() {
    const token = currentQueryToken;
    const items = currentResults.filter(item => ['TAB', 'HISTORY', 'BOOKMARK'].includes(item.type))
      .filter(item => {
        const row = rowNodeMap.get(getItemKey(item));
        if (!row || !row.getBoundingClientRect || !resultsContainer.getBoundingClientRect) return true;
        const rect = row.getBoundingClientRect(), viewport = resultsContainer.getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom;
      }).slice(0, 20).map(item => ({ key: getItemKey(item), url: item.data.url, icon: item.icon, tabId: item.tab && item.tab.id || (item.type === 'TAB' ? item.data.id : undefined) }))
      .filter(item => !requestedIcons.has(item.key));
    if (!items.length) return;
    items.forEach(item => requestedIcons.add(item.key));
    if (requestedIcons.size > 512) {
      for (const key of requestedIcons) { if (!items.some(item => item.key === key)) requestedIcons.delete(key); if (requestedIcons.size <= 256) break; }
    }
    // Return each icon independently: one slow site cannot hold up the others.
    items.forEach(item => safeSendMessage({ type: 'RESOLVE_SITE_ICONS', items: [item] }, response => {
      if (token !== currentQueryToken || !isVisible) {
        requestedIcons.delete(item.key);
        if (isVisible) resolveVisibleIcons();
        return;
      }
      (response && response.icons || []).forEach(icon => {
        if (icon.key !== item.key) return;
        if (/^data:image\/(svg\+xml|png|jpeg|gif|webp|x-icon|vnd.microsoft.icon);base64,/.test(icon.src)) {
          resolvedIcons.set(icon.key, icon.src);
          if (resolvedIcons.size > 256) resolvedIcons.delete(resolvedIcons.keys().next().value);
        }
      });
      const current = currentResults.find(result => getItemKey(result) === item.key);
      const row = rowNodeMap.get(item.key);
      if (current && row && row.refs) updateRowIcon(row, current);
    }));
  }

  function updateRowIcon(li, item) {
    const supplied = /^(https?:|data:image\/)/i.test(item.icon || '') ? item.icon : '';
    view.updateIcon(getItemKey(item), resolvedIcons.get(getItemKey(item)) || supplied || fallbackIcon(item.type));
  }

  function executeResult(item, e) {
    if (!isSelectable(item)) return;
    if (e && (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey)) {
      executeSearch(item.data && item.data.query ? item.data.query : input.value, e);
      return;
    }
    if (['TAB', 'HISTORY', 'BOOKMARK'].includes(item.type)) {
      recordCommandUsage(completionState === 'accepted' ? lastAcceptedTypedQuery.trim() : input.value.trim(), item);
      safeSendMessage({ type: 'FOCUS_DESTINATION', url: item.data.url, windowId: (item.tab || item.data).windowId, allWindows: Boolean(item.allWindows) });
      hideOverlay();
    } else if (item.type === 'CALC') {
      navigator.clipboard.writeText(item.data.copyText || item.data.expression || '').catch(() => {});
      hideOverlay();
    } else if (item.type === 'DEF') {
      const defData = item.data;
      if (defData.status === 'success' && defData.mode === 'synonyms') {
        navigator.clipboard.writeText((defData.synonyms || []).join(', ')).catch(() => {});
      } else if (defData.status === 'success' && Array.isArray(defData.meanings) && defData.meanings[0]) {
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
      safeSendMessage({ type: 'SEARCH_QUERY', text: item.data.query });
      hideOverlay();
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
    if (e.isComposing) return;
    if (e.inputType) lastEditWasDeletion = e.inputType.startsWith('delete');
    if (completionState === 'cancelled' && input.value !== cancelledCompletionQuery) {
      cancelledCompletionQuery = null;
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

  let isComposing = false;
  input.addEventListener('compositionstart', () => { isComposing = true; });
  input.addEventListener('compositionend', () => { isComposing = false; typedQuery = input.value; explicitSelection = false; updateSearch(); });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
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
      if (!explicitSelection && !autocompleteActive && !currentResults[0]?.autocompleted && window.CommandBarIntent.navigationUrl(input.value)) {
        executeSearch(input.value, e);
        return;
      }
      if (autocompleteActive && autocompleteSuffixSelected) {
        const query = typedQuery.trim();
        const target = completionTarget;
        clearAutocomplete();
        if (target) {
          executeResult(target, e);
        } else {
          executeSearch(query, e);
        }
        return;
      }
      if (!explicitSelection) {
        if (currentResults[0] && (currentResults[0].autocompleted || ['AI', 'CALC', 'DEF'].includes(currentResults[0].type))) {
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
    const previousHeight = resultsPanel.offsetHeight;
    if (explicitSelection && !isKeyboardNav) {
      const selected = Array.from(rowNodeMap.entries()).find(([, row]) => row.getAttribute('aria-selected') === 'true');
      const index = selected ? currentResults.findIndex(item => getItemKey(item) === selected[0]) : -1;
      if (index >= 0) selectedIndex = index;
    }
    const previous = new Set(rowNodeMap.keys());
    for (const [key, row] of rowNodeMap) {
      if (!currentResults.some(item => getItemKey(item) === key)) stopResultAnimation(row);
    }
    view.update({ items: currentResults, query, selectedIndex, empty: true });
    const inserted = [...rowNodeMap].filter(([key]) => !previous.has(key)).map(([, row]) => row);
    const selectedElem = currentResults[selectedIndex] && rowNodeMap.get(getItemKey(currentResults[selectedIndex]));
    if (isKeyboardNav && selectedElem) selectedElem.scrollIntoView({ block: 'nearest' });
    else resultsContainer.scrollTop = 0;
    isKeyboardNav = false;
    input.setAttribute('aria-activedescendant', selectedElem?.id || '');
    finishResultRender(previousHeight, inserted);
    decorations.track(300);
    caretAura.sync();
    resolveVisibleIcons();
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
        // Ignore unrelated notifications received by other extension pages.
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
