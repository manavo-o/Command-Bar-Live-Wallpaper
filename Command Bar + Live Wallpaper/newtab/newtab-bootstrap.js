(function () {
  const mediaRoot = document.getElementById('media-root');
  const fallbackUi = document.getElementById('fallback-ui');
  const widgetsContainer = document.getElementById('widgets-container');
  const widgetClock = document.getElementById('widget-clock');
  const widgetDate = document.getElementById('widget-date');
  const fxCanvas = document.getElementById('fx-canvas');

  const weatherWidget = document.getElementById('widget-weather');
  const weatherTempEl = document.getElementById('weather-temp');
  const weatherDescEl = document.getElementById('weather-desc');
  const weatherPlaceEl = document.getElementById('weather-place');

  const quoteWidget = document.getElementById('widget-quote');
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');

  const focusWidget = document.getElementById('widget-focus');
  const focusModeLabel = document.getElementById('focus-mode-label');
  const focusTimeEl = document.getElementById('focus-time');
  const focusBtnToggle = document.getElementById('focus-btn-toggle');
  const focusBtnReset = document.getElementById('focus-btn-reset');

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) {
      if (window.CommandBarUI) window.CommandBarUI.tactile('press');
    }
  });

  let activeVideoElement = null;
  let currentObjectUrl = null;
  let particleAnimFrameId = null;
  let mediaActivationFrame = null;
  let currentDisplayedId = null;
  let rotationAdvanceTimer = null;
  let scheduleTickTimer = null;
  let shuffleBag = [];
  let mediaGeneration = 0;
  let pendingWallpaperId = null;
  let pageSuspended = false;
  let rotationKey = null;
  let rotationDeadline = 0;
  let rotationRemaining = null;
  let wallpaperResolveGeneration = 0;
  const isInactive = () => document.hidden || pageSuspended;
  const widgetContentAnimations = new Map();
  const widgetMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  function stopWidgetContentMotion() {
    widgetContentAnimations.forEach(animation => animation.cancel()); widgetContentAnimations.clear();
  }
  function animateWidgetContent(element) {
    const node = element.querySelector('.widget-content') || element;
    const previous = widgetContentAnimations.get(node);
    if (previous) { previous.cancel(); widgetContentAnimations.delete(node); }
    if (isInactive() || widgetMotionPreference.matches || !node.animate) return;
    try {
      const animation = node.animate([{opacity:.4},{opacity:1}],{duration:200,easing:'ease-out'});
      widgetContentAnimations.set(node,animation);
      animation.finished.then(() => { if (widgetContentAnimations.get(node) === animation) { animation.cancel(); widgetContentAnimations.delete(node); } }, () => {});
    } catch (_) { /* Content is already readable at its final state. */ }
  }
  const updateWidgetMotionPreference = () => { if (widgetMotionPreference.matches) stopWidgetContentMotion(); };
  if (widgetMotionPreference.addEventListener) widgetMotionPreference.addEventListener('change',updateWidgetMotionPreference);
  window.addEventListener('unload',() => { stopWidgetContentMotion(); if (widgetMotionPreference.removeEventListener) widgetMotionPreference.removeEventListener('change',updateWidgetMotionPreference); });
  const pageSettings = {
    showWidgetClock: true, showWidgetDate: true, use24Hour: false,
    focusWorkMinutes: 25, focusBreakMinutes: 5, focusTimerState: null,
    showWidgetFocusTimer: false
  };

  // ----------------------------------------------------------------------
  // Focus reclaim (unchanged from v1) — new-tab pages can otherwise lose
  // keyboard focus to the content-script overlay living in other frames.
  // ----------------------------------------------------------------------
  function reclaimFocus() {
    if (document.hasFocus && !document.hasFocus()) {
      window.focus();
    }
  }
  window.focus();
  requestAnimationFrame(reclaimFocus);
  setTimeout(reclaimFocus, 50);
  ['pointermove', 'mousemove', 'mousedown', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, reclaimFocus, { capture: true, passive: true });
  });

  // ----------------------------------------------------------------------
  // Media plumbing
  // ----------------------------------------------------------------------
  function clearActiveMedia() {
    if (mediaActivationFrame !== null) cancelAnimationFrame(mediaActivationFrame);
    mediaActivationFrame = null;
    if (activeVideoElement) {
      activeVideoElement.pause();
      activeVideoElement.removeAttribute('src');
      activeVideoElement.load();
    }
    mediaRoot.replaceChildren();
    activeVideoElement = null;
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function showFallback() {
    mediaGeneration++;
    pendingWallpaperId = null;
    clearActiveMedia();
    currentDisplayedId = null;
    fallbackUi.style.display = 'block';
  }

  function hideFallback() {
    fallbackUi.style.display = 'none';
  }

  // ----------------------------------------------------------------------
  // Mouse parallax — translates the whole media container a few pixels
  // toward the cursor. Applied to the *container*, not the media element
  // itself, so it composes cleanly with the Ken Burns animation living on
  // the media element without the two fighting over the transform property.
  // ----------------------------------------------------------------------
  let parallaxHandler = null;
  let parallaxFrame = null;
  let parallaxPoint = null;
  function setupParallax(enabled) {
    if (parallaxFrame !== null) cancelAnimationFrame(parallaxFrame);
    parallaxFrame = null;
    if (parallaxHandler) {
      window.removeEventListener('mousemove', parallaxHandler);
      parallaxHandler = null;
      mediaRoot.style.transform = '';
    }
    if (!enabled || prefersReducedMotion || matchMedia('(pointer: coarse)').matches) return;

    parallaxHandler = (e) => {
      if (isInactive()) return;
      parallaxPoint = { x: e.clientX, y: e.clientY };
      if (parallaxFrame !== null) return;
      parallaxFrame = requestAnimationFrame(() => {
        parallaxFrame = null;
        if (isInactive()) return;
        const nx = parallaxPoint.x / window.innerWidth - 0.5;
        const ny = parallaxPoint.y / window.innerHeight - 0.5;
        mediaRoot.style.transform = `translate(${(-nx * 10).toFixed(2)}px, ${(-ny * 10).toFixed(2)}px)`;
      });
    };
    window.addEventListener('mousemove', parallaxHandler, { passive: true });
  }

  function applyKenBurns(mediaElem, enabled) {
    if (!enabled || prefersReducedMotion) return;
    const tx = (Math.random() * 3 + 1) * (Math.random() < 0.5 ? -1 : 1);
    const ty = (Math.random() * 3 + 1) * (Math.random() < 0.5 ? -1 : 1);
    mediaElem.style.setProperty('--kb-tx', `${tx}%`);
    mediaElem.style.setProperty('--kb-ty', `${ty}%`);
    mediaElem.classList.add('ken-burns');
  }

  // Loads a specific wallpaper (by id) from the library into the DOM.
  // Refactored out of the old top-level IIFE body so rotation/schedule
  // logic can call it repeatedly instead of only running once at page load.
  function loadWallpaperMedia(id) {
    if (isInactive()) return;
    if (id === currentDisplayedId) {
      if (pendingWallpaperId && pendingWallpaperId !== id) { mediaGeneration++; pendingWallpaperId = null; }
      return;
    }
    if (pendingWallpaperId === id) return;
    const generation = ++mediaGeneration;
    pendingWallpaperId = id;
    chrome.storage.local.get(['wallpapers', 'wpSpeed', 'wpBrightness', 'wpContrast', 'wpTransitionMs', 'kenBurnsEnabled'], (res) => {
      if (generation !== mediaGeneration || isInactive()) return;
      if (chrome.runtime.lastError || !res || !res.wallpapers) {
        showFallback();
        return;
      }
      const activeMeta = res.wallpapers.find((w) => w.id === id);
      if (!activeMeta) {
        showFallback();
        return;
      }

      WallpaperDB.getWallpaperBlob(id)
        .then((blob) => {
          if (generation !== mediaGeneration || isInactive()) return;
          pendingWallpaperId = null;
          if (!blob) {
            showFallback();
            return;
          }

          clearActiveMedia();
          hideFallback();
          currentDisplayedId = id;

          currentObjectUrl = URL.createObjectURL(blob);
          const mimeType = activeMeta.mimeType || blob.type || '';
          const playbackRate = res.wpSpeed || 1.0;
          const brightness = res.wpBrightness || 100;
          const contrast = res.wpContrast || 100;
          const transitionMs = res.wpTransitionMs || 600;
          mediaRoot.style.setProperty('--wp-transition', `${transitionMs}ms`);

          const filterStyle = `brightness(${brightness}%) contrast(${contrast}%)`;

          if (mimeType.startsWith('video/')) {
            const video = document.createElement('video');
            video.className = 'media-element';
            video.autoplay = true;
            video.loop = true;
            video.playsInline = true;
            video.muted = true;
            video.volume = 0;
            video.src = currentObjectUrl;
            video.style.filter = filterStyle;
            video.playbackRate = playbackRate;

            mediaRoot.appendChild(video);
            mediaActivationFrame = requestAnimationFrame(() => { mediaActivationFrame = null; if (generation === mediaGeneration && !isInactive()) video.classList.add('active'); });
            activeVideoElement = video;

            if (document.hidden) video.pause();
          } else {
            const img = document.createElement('img');
            img.className = 'media-element';
            img.src = currentObjectUrl;
            img.style.filter = filterStyle;
            mediaRoot.appendChild(img);
            mediaActivationFrame = requestAnimationFrame(() => { mediaActivationFrame = null; if (generation === mediaGeneration && !isInactive()) img.classList.add('active'); });
            applyKenBurns(img, res.kenBurnsEnabled !== false);
          }
        })
        .catch(() => {
          if (generation !== mediaGeneration || isInactive()) return;
          showFallback();
        });
    });
  }

  // ----------------------------------------------------------------------
  // Wallpaper mode resolution: single / rotate / schedule
  // ----------------------------------------------------------------------
  function pickNextRotationId(wallpapers, order) {
    if (wallpapers.length === 0) return null;
    if (order === 'shuffle') {
      if (shuffleBag.length === 0) {
        shuffleBag = wallpapers.map((w) => w.id).sort(() => Math.random() - 0.5);
        // avoid immediately repeating the last shown wallpaper if possible
        if (shuffleBag[0] === currentDisplayedId && shuffleBag.length > 1) {
          [shuffleBag[0], shuffleBag[1]] = [shuffleBag[1], shuffleBag[0]];
        }
      }
      return shuffleBag.shift();
    }
    return window.CommandBarRotation
      ? window.CommandBarRotation.nextId(wallpapers, currentDisplayedId, 'sequential')
      : wallpapers[(wallpapers.findIndex((w) => w.id === currentDisplayedId) + 1) % wallpapers.length].id;
  }

  function clearRotationTimer() {
    if (rotationAdvanceTimer) {
      clearTimeout(rotationAdvanceTimer);
      rotationAdvanceTimer = null;
    }
  }

  function resolveActiveWallpaper() {
    if (isInactive()) return;
    const resolveGeneration = ++wallpaperResolveGeneration;
    chrome.storage.local.get(
      {
        wallpapers: [],
        activeWallpaperId: null,
        wallpaperMode: 'single',
        rotationOrder: 'sequential',
        rotationIntervalMinutes: 30,
        scheduleDayWallpaperId: null,
        scheduleNightWallpaperId: null,
        scheduleUseSunTimes: false,
        scheduleDayStartHour: 7,
        scheduleNightStartHour: 19,
        weatherSunrise: null,
        weatherSunset: null
      },
      (res) => {
        if (resolveGeneration !== wallpaperResolveGeneration || isInactive()) return;
        const wallpapers = res.wallpapers || [];
        clearTimeout(scheduleTickTimer);
        scheduleTickTimer = null;
        if (res.wallpaperMode !== 'rotate') {
          clearRotationTimer();
          rotationKey = null;
          rotationRemaining = null;
        }

        if (wallpapers.length === 0) {
          showFallback();
          return;
        }

        if (res.wallpaperMode === 'rotate') {
          if (!currentDisplayedId || !wallpapers.some(w => w.id === currentDisplayedId)) {
            loadWallpaperMedia(res.activeWallpaperId && wallpapers.some((w) => w.id === res.activeWallpaperId) ? res.activeWallpaperId : wallpapers[0].id);
          }
          const intervalMs = Math.max(1, res.rotationIntervalMinutes) * 60 * 1000;
          const key = JSON.stringify([intervalMs, res.rotationOrder, wallpapers.map((w) => w.id)]);
          if (rotationKey !== key) {
            clearRotationTimer();
            rotationRemaining = null;
            rotationKey = key;
            shuffleBag = [];
          }
          if (!rotationAdvanceTimer) {
            const delay = rotationRemaining === null ? intervalMs : rotationRemaining;
            rotationRemaining = null;
            rotationDeadline = Date.now() + delay;
            rotationAdvanceTimer = setTimeout(() => {
              rotationAdvanceTimer = null;
              if (isInactive()) return;
              const nextId = pickNextRotationId(wallpapers, res.rotationOrder);
              if (nextId) loadWallpaperMedia(nextId);
              resolveActiveWallpaper();
            }, delay);
          }
          return;
        }

        if (res.wallpaperMode === 'schedule') {
          const now = new Date();
          const useSun = res.scheduleUseSunTimes && res.weatherSunrise != null && res.weatherSunset != null;
          const boundaries = useSun ? [res.weatherSunrise, res.weatherSunset] : [res.scheduleDayStartHour, res.scheduleNightStartHour];
          const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
          let nextBoundary = midnight.getTime();
          boundaries.forEach((hour) => {
            const boundary = new Date(now);
            boundary.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
            if (boundary.getTime() > now.getTime()) nextBoundary = Math.min(nextBoundary, boundary.getTime());
          });
          scheduleTickTimer = setTimeout(resolveActiveWallpaper, Math.max(1, nextBoundary - Date.now()));
          const hour = now.getHours() + now.getMinutes() / 60;
          let isDaytime;
          if (res.scheduleUseSunTimes && res.weatherSunrise != null && res.weatherSunset != null) {
            isDaytime = hour >= res.weatherSunrise && hour < res.weatherSunset;
          } else {
            isDaytime = window.CommandBarRotation
              ? window.CommandBarRotation.isDaytime(hour, res.scheduleDayStartHour, res.scheduleNightStartHour)
              : hour >= res.scheduleDayStartHour && hour < res.scheduleNightStartHour;
          }
          const targetId = isDaytime ? res.scheduleDayWallpaperId : res.scheduleNightWallpaperId;
          const validTarget = targetId && wallpapers.some((w) => w.id === targetId) ? targetId : wallpapers[0].id;
          loadWallpaperMedia(validTarget);
          return;
        }

        // Single mode
        const singleId = res.activeWallpaperId && wallpapers.some((w) => w.id === res.activeWallpaperId)
          ? res.activeWallpaperId
          : wallpapers[0].id;
        loadWallpaperMedia(singleId);
      }
    );
  }

  resolveActiveWallpaper();

  function pausePage() {
    stopWidgetContentMotion();
    mediaGeneration++;
    wallpaperResolveGeneration++;
    pendingWallpaperId = null;
    if (mediaActivationFrame !== null) cancelAnimationFrame(mediaActivationFrame);
    mediaActivationFrame = null;
    if (activeVideoElement) activeVideoElement.pause();
    mediaRoot.classList.add('paused');
    if (rotationAdvanceTimer) rotationRemaining = Math.max(0, rotationDeadline - Date.now());
    clearRotationTimer();
    clearTimeout(scheduleTickTimer); scheduleTickTimer = null;
    clearTimeout(widgetClockInterval); widgetClockInterval = null;
    clearInterval(focusTickInterval); focusTickInterval = null;
    if (particleAnimFrameId !== null) cancelAnimationFrame(particleAnimFrameId);
    particleAnimFrameId = null;
    if (parallaxFrame !== null) cancelAnimationFrame(parallaxFrame);
    parallaxFrame = null;
  }
  function resumePage() {
    if (isInactive()) return;
    mediaRoot.classList.remove('paused');
    if (activeVideoElement) {
      activeVideoElement.classList.add('active');
      activeVideoElement.play().catch(() => {});
    }
    const image = mediaRoot.querySelector('img');
    if (image) image.classList.add('active');
    resolveActiveWallpaper();
    updateWidgets();
    restartFocusTick();
    if (resumeParticles) resumeParticles();
  }
  document.addEventListener('visibilitychange', () => {
    if (isInactive()) pausePage(); else resumePage();
  });
  window.addEventListener('pagehide', () => {
    pageSuspended = true;
    pausePage();
    clearActiveMedia();
    currentDisplayedId = null;
    weatherGeneration++;
    weatherInitGeneration++;
    weatherRequestPending = false;
    if (weatherController) weatherController.abort();
  });
  window.addEventListener('pageshow', () => { const restored = pageSuspended; pageSuspended = false; resumePage(); if (restored) initWeatherWidget(); });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.wallpaperMode || changes.activeWallpaperId || changes.scheduleDayWallpaperId ||
        changes.scheduleNightWallpaperId || changes.rotationOrder || changes.rotationIntervalMinutes ||
        changes.wallpapers || changes.scheduleUseSunTimes || changes.scheduleDayStartHour ||
        changes.scheduleNightStartHour || changes.weatherSunrise || changes.weatherSunset) {
      resolveActiveWallpaper();
    }
    if (changes.parallaxEnabled) {
      setupParallax(changes.parallaxEnabled.newValue);
    }
  });

  chrome.storage.local.get({ parallaxEnabled: false }, (res) => setupParallax(res.parallaxEnabled));

  window.addEventListener('unload', () => {
    clearActiveMedia();
    clearRotationTimer();
    if (scheduleTickTimer) clearTimeout(scheduleTickTimer);
  });

  // ----------------------------------------------------------------------
  // Draggable widgets container with magnetic safe-zone snapping.
  // ----------------------------------------------------------------------
  if (window.WidgetDashboard) {
    const disposeDashboard = window.WidgetDashboard.mount(document, window, chrome);
    window.addEventListener('unload', disposeDashboard, { once: true });
  }

  // ----------------------------------------------------------------------
  // Clock / date widget (unchanged from v1)
  // ----------------------------------------------------------------------
  let widgetClockInterval = null;
  function updateWidgets() {
        clearTimeout(widgetClockInterval);
        widgetClockInterval = null;
        if (isInactive()) return;
        const { showWidgetClock, showWidgetDate, use24Hour } = pageSettings;
        if (!showWidgetClock && !showWidgetDate) {
          widgetsContainer.style.display = 'none';
          return;
        }

        widgetsContainer.style.display = 'flex';
        const now = new Date();
        if (window.WidgetCards) window.WidgetCards.updateClock(widgetsContainer, now, showWidgetClock);
        const next = new Date(now);
        if (showWidgetClock) next.setSeconds(60, 0); else next.setHours(24, 0, 0, 0);
        widgetClockInterval = setTimeout(updateWidgets, Math.max(1, next - now));

        if (showWidgetClock) {
          widgetClock.style.display = 'block';
          if (use24Hour) {
            const hrs = String(now.getHours()).padStart(2, '0');
            const mins = String(now.getMinutes()).padStart(2, '0');
            widgetClock.textContent = `${hrs}:${mins}`;
          } else {
            let hrs = now.getHours();
            const ampm = hrs >= 12 ? 'PM' : 'AM';
            hrs = hrs % 12 || 12;
            const mins = String(now.getMinutes()).padStart(2, '0');
            widgetClock.textContent = `${hrs}:${mins}`;
            const period = document.createElement('span');
            period.className = 'clock-period';
            period.textContent = ` ${ampm}`;
            widgetClock.appendChild(period);
          }
        } else {
          widgetClock.style.display = 'none';
        }

        if (showWidgetDate) {
          widgetDate.style.display = 'block';
          const options = { weekday: 'long', month: 'long', day: 'numeric' };
          const date = now.toLocaleDateString(undefined, options);
          if (widgetDate.textContent !== date) widgetDate.textContent = date;
        } else {
          widgetDate.style.display = 'none';
        }
  }
  chrome.storage.local.get({ showWidgetClock: true, showWidgetDate: true, use24Hour: false }, (res) => {
    Object.assign(pageSettings, res || {});
    updateWidgets();
  });


  // ----------------------------------------------------------------------
  // Ambient particle canvas (unchanged from v1)
  // ----------------------------------------------------------------------
  let resumeParticles = null;
  function initOverlayCanvas() {
    const ctx = fxCanvas.getContext('2d');
    let width = (fxCanvas.width = window.innerWidth);
    let height = (fxCanvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = fxCanvas.width = window.innerWidth;
      height = fxCanvas.height = window.innerHeight;
    });

    const particles = Array.from({ length: 30 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2 + 1,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4
    }));

    function draw() {
      if (isInactive()) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > width) p.dx *= -1;
        if (p.y < 0 || p.y > height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      particleAnimFrameId = requestAnimationFrame(draw);
    }

    resumeParticles = () => { if (!isInactive() && particleAnimFrameId === null) draw(); };
    resumeParticles();
  }
  initOverlayCanvas();

  // ----------------------------------------------------------------------
  // Weather widget — Open-Meteo, no API key. Cached for 20 minutes so
  // opening several new tabs in a row doesn't re-fetch every time.
  // ----------------------------------------------------------------------
  const WMO_DESCRIPTIONS = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Icy fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
  };

  function renderWeather(data, units) {
    if (!data || !data.current) {
      weatherDescEl.textContent = weatherWidget.dataset.cached === 'true' ? 'Saved weather · update unavailable' : 'Weather unavailable';
      return;
    }
    const previousContent = weatherTempEl.textContent + weatherDescEl.textContent;
    const temp = Math.round(data.current.temperature_2m);
    weatherTempEl.textContent = `${temp}°${units === 'c' ? 'C' : 'F'}`;
    weatherDescEl.textContent = WMO_DESCRIPTIONS[data.current.weather_code] || 'Weather';
    weatherDescEl.title = '';
    if (previousContent !== weatherTempEl.textContent + weatherDescEl.textContent) animateWidgetContent(weatherWidget);
    const icon = document.getElementById('weather-condition-icon');
    if (icon && icon.querySelector) {
      const code = Number(data.current.weather_code);
      const path = icon.querySelector('path');
      if (path) path.setAttribute('d', code < 2 ? 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6L7 7m10 10 1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0' : code < 50 ? 'M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-1 4.5 4.5 0 0 0-1 9' : 'M6 15h12a3 3 0 0 0 0-6 5 5 0 0 0-9-1 3.5 3.5 0 0 0-3 7 M8 18l-1 3m6-3-1 3m6-3-1 3');
    }
  }

  let weatherGeneration = 0;
  let weatherController = null;
  let weatherRequestKey = null;
  let weatherRequestPending = false;
  function fetchWeather(lat, lon, units, placeLabel) {
    const key = JSON.stringify([lat, lon, units]);
    if (weatherRequestPending && weatherRequestKey === key) return;
    if (weatherController) weatherController.abort();
    weatherController = new AbortController();
    weatherRequestKey = key;
    weatherRequestPending = true;
    const generation = ++weatherGeneration;
    const tempUnit = units === 'c' ? 'celsius' : 'fahrenheit';
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m,weather_code',
      daily: 'sunrise,sunset',
      temperature_unit: tempUnit,
      timezone: 'auto'
    });
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: weatherController.signal })
      .then((r) => { if (r.ok === false) throw new Error('Weather request failed'); return r.json(); })
      .then((data) => {
        if (generation !== weatherGeneration || pageSuspended) return;
        if (!data || !data.current || !Number.isFinite(data.current.temperature_2m)) throw new Error('Invalid weather');
        renderWeather(data, units);
        if (placeLabel) weatherPlaceEl.textContent = placeLabel;

        const toDecimalHour = (iso) => {
          const d = new Date(iso);
          return d.getHours() + d.getMinutes() / 60;
        };
        const update = {
          weatherCache: { data, fetchedAt: Date.now(), lat, lon, units, locationMode: pageSettings.weatherLocationMode }
        };
        if (data.daily && data.daily.sunrise && data.daily.sunset) {
          update.weatherSunrise = toDecimalHour(data.daily.sunrise[0]);
          update.weatherSunset = toDecimalHour(data.daily.sunset[0]);
        }
        chrome.storage.local.set(update);
      })
      .catch((error) => {
        if (generation === weatherGeneration && error.name !== 'AbortError') weatherDescEl.textContent = weatherWidget.dataset.cached === 'true' ? 'Saved weather · update unavailable' : 'Weather unavailable';
      })
      .finally(() => { if (generation === weatherGeneration) weatherRequestPending = false; });
  }

  let weatherInitGeneration = 0;
  function initWeatherWidget() {
    const generation = ++weatherInitGeneration;
    weatherGeneration++;
    weatherRequestPending = false;
    if (weatherController) weatherController.abort();
    chrome.storage.local.get(
      {
        showWidgetWeather: false,
        weatherLocationMode: 'auto',
        weatherManualLat: null,
        weatherManualLon: null,
        weatherManualLabel: '',
        weatherUnits: 'f',
        weatherCache: null
      },
      (res) => {
        if (generation !== weatherInitGeneration || pageSuspended) return;
        Object.assign(pageSettings, res || {});
        if (!res.showWidgetWeather) {
          weatherWidget.style.display = 'none';
          return;
        }
        weatherWidget.style.display = 'block';

        const cacheMatches = res.weatherCache && res.weatherCache.data && res.weatherCache.units === res.weatherUnits
          && (res.weatherLocationMode !== 'manual' || (res.weatherCache.lat === res.weatherManualLat && res.weatherCache.lon === res.weatherManualLon))
          && res.weatherCache.locationMode === res.weatherLocationMode;
        const cacheFresh = cacheMatches && (Date.now() - res.weatherCache.fetchedAt) < 20 * 60 * 1000;
        weatherWidget.dataset.cached = String(Boolean(cacheMatches));
        if (cacheMatches) {
          renderWeather(res.weatherCache.data, res.weatherUnits);
          weatherDescEl.title = cacheFresh ? 'Saved forecast · updates automatically' : 'Saved forecast · refreshing';
          if (res.weatherLocationMode === 'manual') weatherPlaceEl.textContent = res.weatherManualLabel || '';
        } else {
          weatherTempEl.textContent = '--°'; weatherDescEl.textContent = 'Loading weather…'; weatherPlaceEl.textContent = '';
        }
        if (cacheFresh) return;

        if (res.weatherLocationMode === 'manual') {
          if (res.weatherManualLat != null && res.weatherManualLon != null) {
            fetchWeather(res.weatherManualLat, res.weatherManualLon, res.weatherUnits, res.weatherManualLabel);
          } else {
            weatherDescEl.textContent = 'Set a city in Options';
          }
          return;
        }

        if (!navigator.geolocation) {
          weatherDescEl.textContent = cacheMatches ? 'Saved weather · location unavailable' : 'Location unavailable';
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => { if (generation === weatherInitGeneration && !pageSuspended) fetchWeather(pos.coords.latitude, pos.coords.longitude, res.weatherUnits, ''); },
          () => {
            if (generation !== weatherInitGeneration || pageSuspended) return;
            weatherDescEl.textContent = cacheMatches ? 'Saved weather · location unavailable' : 'Location permission denied';
          },
          { maximumAge: 15 * 60 * 1000, timeout: 8000 }
        );
      }
    );
  }
  initWeatherWidget();

  // ----------------------------------------------------------------------
  // Quote of the day widget — offline dataset, new pick every load.
  // ----------------------------------------------------------------------
  const QUOTES = [
    ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
    ['The details are not the details. They make the design.', 'Charles Eames'],
    ['Focus is a matter of deciding what things you\u2019re not going to do.', 'John Carmack'],
    ['Make it work, make it right, make it fast.', 'Kent Beck'],
    ['Whatever you are, be a good one.', 'Abraham Lincoln'],
    ['The best way to predict the future is to invent it.', 'Alan Kay'],
    ['Do the work that matters, then rest.', 'Unknown'],
    ['Small steps, every day.', 'Unknown'],
    ['Clarity comes from action, not thought.', 'Marie Forleo'],
    ['A calm mind is the ultimate weapon against your challenges.', 'Bryant McGill']
  ];

  function initQuoteWidget() {
    chrome.storage.local.get({ showWidgetQuote: false }, (res) => {
      if (!res.showWidgetQuote) {
        quoteWidget.style.display = 'none';
        return;
      }
      const previousQuote = quoteTextEl.textContent;
      const [text, author] = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      quoteTextEl.textContent = `\u201c${text}\u201d`;
      quoteAuthorEl.textContent = author;
      quoteAuthorEl.hidden = !author || author === 'Unknown';
      quoteWidget.style.display = 'block';
      if (previousQuote !== quoteTextEl.textContent) animateWidgetContent(quoteWidget);
    });
  }
  initQuoteWidget();

  // ----------------------------------------------------------------------
  // Focus timer widget — Pomodoro-style, state persisted so it survives
  // closing and reopening the new-tab page.
  // ----------------------------------------------------------------------
  let focusTickInterval = null;

  function formatMMSS(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  let focusActionPending = false;
  const focusStatus = document.createElement('span');
  focusStatus.className = 'widget-feedback'; focusStatus.setAttribute('role','status'); focusWidget.appendChild(focusStatus);
  function timerAction(action, expectedEnd) {
    if (focusActionPending) return;
    focusActionPending = true; focusBtnToggle.disabled = focusBtnReset.disabled = true;
    chrome.runtime.sendMessage({type:'FOCUS_TIMER_ACTION',action,expectedEnd},response => {
      focusActionPending = false; focusBtnToggle.disabled = focusBtnReset.disabled = false;
      if (chrome.runtime.lastError || !response || !response.ok) { focusStatus.textContent = 'Timer could not be saved. Try again.'; return; }
      focusStatus.textContent = '';
      pageSettings.focusTimerState = response.state;
      restartFocusTick();
    });
  }
  function renderFocusTick(state, workMinutes, breakMinutes) {
    if (isInactive()) return;
    const normalized = window.FocusTimer.normalize(state,workMinutes,breakMinutes);
    const duration = normalized ? normalized.durationMs : workMinutes * 60000;
    const remaining = normalized ? normalized.endTimestamp ? Math.max(0,normalized.endTimestamp-Date.now()) : normalized.remainingMs : duration;
    focusModeLabel.textContent = normalized && normalized.mode === 'break' ? 'Break' : 'Focus';
    focusTimeEl.textContent = formatMMSS(remaining);
    focusBtnToggle.textContent = !normalized ? 'Start' : normalized.endTimestamp ? 'Pause' : 'Resume';
    focusWidget.style.setProperty('--focus-progress', String(Math.max(0,Math.min(1,1-remaining/duration))));
    const progress = document.getElementById('focus-progress');
    if (progress) progress.setAttribute('aria-label', `${Math.round(remaining/1000)} seconds remaining`);
    if (normalized && normalized.endTimestamp && remaining <= 0) timerAction('advance',normalized.endTimestamp);
  }

  function restartFocusTick() {
    clearInterval(focusTickInterval);
    focusTickInterval = null;
    if (isInactive() || !pageSettings.showWidgetFocusTimer) return;
    renderFocusTick(pageSettings.focusTimerState, pageSettings.focusWorkMinutes, pageSettings.focusBreakMinutes);
    if (!focusTickInterval && pageSettings.focusTimerState && pageSettings.focusTimerState.endTimestamp) {
      focusTickInterval = setInterval(() => renderFocusTick(pageSettings.focusTimerState, pageSettings.focusWorkMinutes, pageSettings.focusBreakMinutes), 1000);
    }
  }

  function initFocusWidget() {
    chrome.storage.local.get(
      { showWidgetFocusTimer: false, focusWorkMinutes: 25, focusBreakMinutes: 5, focusTimerState: null },
      (res) => {
        Object.assign(pageSettings, res || {});
        if (!res.showWidgetFocusTimer) {
          focusWidget.style.display = 'none';
          restartFocusTick();
          return;
        }
        focusWidget.style.display = 'block';
        restartFocusTick();
      }
    );
  }
  initFocusWidget();

  focusBtnToggle.addEventListener('click', () => {
    const state = window.FocusTimer.normalize(pageSettings.focusTimerState,pageSettings.focusWorkMinutes,pageSettings.focusBreakMinutes);
    timerAction(!state ? 'start' : state.endTimestamp ? 'pause' : 'resume');
  });
  focusBtnReset.addEventListener('click', () => timerAction('reset'));

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.showWidgetWeather || changes.weatherLocationMode || changes.weatherUnits ||
        changes.weatherManualLat || changes.weatherManualLon || changes.weatherManualLabel) {
      initWeatherWidget();
    }
    if (changes.showWidgetQuote) {
      initQuoteWidget();
    }
    if (changes.showWidgetFocusTimer || changes.focusWorkMinutes || changes.focusBreakMinutes) {
      initFocusWidget();
    }
    if (changes.focusTimerState) {
      pageSettings.focusTimerState = changes.focusTimerState.newValue;
      restartFocusTick();
    }
    ['showWidgetClock', 'showWidgetDate', 'use24Hour', 'focusWorkMinutes', 'focusBreakMinutes'].forEach((key) => {
      if (changes[key]) pageSettings[key] = changes[key].newValue;
    });
    if (changes.showWidgetClock || changes.showWidgetDate || changes.use24Hour) updateWidgets();
  });
}());
