(function () {
  // ---------------------------------------------------------------------
  // Sidebar navigation — swap which .pane is visible, no page reload.
  // ---------------------------------------------------------------------
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.pane');
  const navPaths = {
    library: 'M3 3h18v18H3z M3 15l5-5 5 5 4-4 4 4 M8 7h.01',
    effects: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    rotation: 'M20 7a8 8 0 1 0 1 8 M20 3v5h-5',
    widgets: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    commandbar: 'M3 5h18v14H3z M7 9l3 3-3 3 M13 15h4',
    backup: 'M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6',
    about: 'M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'
  };
  document.querySelectorAll('.nav-icon').forEach((icon) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', navPaths[icon.dataset.icon] || navPaths.about);
    svg.appendChild(path);
    icon.appendChild(svg);
  });
  const saveStatus = document.getElementById('settings-save-status');
  function announceSave(ok) {
    saveStatus.textContent = ok ? 'Saved' : 'Could not save settings. Try again.';
    saveStatus.classList.toggle('is-error', !ok);
  }
  function saveSettings(values, callback) {
    chrome.storage.local.set(values, () => {
      announceSave(!chrome.runtime.lastError);
      if (callback) callback();
    });
  }
  document.addEventListener('change', event => {
    const control = event.target;
    if (control.type !== 'number') return;
    const valid = control.checkValidity();
    control.setAttribute('aria-invalid', String(!valid));
    if (!valid) {
      event.stopImmediatePropagation(); control.reportValidity();
      saveStatus.textContent = 'Enter a number in the allowed range.';
      saveStatus.classList.add('is-error');
    }
  }, true);
  const settingsSearch = document.getElementById('settings-search');

  let selectedSection = 'library';
  function selectSection(section) {
    selectedSection = section;
    const query = settingsSearch ? settingsSearch.value.trim().toLowerCase() : '';
    const matching = [];
    panes.forEach(pane => {
      const titleMatches = pane.querySelector('.pane-header').textContent.toLowerCase().includes(query);
      let hasMatch = !query || titleMatches;
      pane.querySelectorAll('.card').forEach(card => {
        const match = !query || titleMatches || card.textContent.toLowerCase().includes(query);
        card.dataset.filterHidden = String(!match);
        hasMatch ||= match;
      });
      pane.dataset.searchMatch = String(hasMatch);
      if (hasMatch) matching.push(pane.id.replace('pane-', ''));
    });
    if (!matching.includes(selectedSection)) selectedSection = matching[0] || '';
    navItems.forEach(button => {
      const active = button.dataset.section === selectedSection;
      button.classList.toggle('active', active);
      button.hidden = !matching.includes(button.dataset.section);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    panes.forEach(pane => { pane.hidden = pane.id !== `pane-${selectedSection}`; });
    document.getElementById('settings-empty').hidden = matching.length > 0;
  }
  navItems.forEach(button => button.addEventListener('click', () => selectSection(button.dataset.section)));
  if (settingsSearch) settingsSearch.addEventListener('input', () => selectSection(selectedSection));

  document.getElementById('input-day-hour').setAttribute('aria-label', 'Day starts at hour');
  document.getElementById('input-night-hour').setAttribute('aria-label', 'Night starts at hour');
  const linkedSection = window.location.hash.slice(1);
  if (Array.from(navItems).some(item => item.dataset.section === linkedSection)) selectSection(linkedSection);

  // Keep the native controls, but give every control an explicit accessible label.
  document.querySelectorAll('.setting-row').forEach((row, index) => {
    const title = row.querySelector('strong');
    if (!title) return;
    title.id ||= 'setting-label-' + index;
    row.querySelectorAll('input, select').forEach(control => {
      if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) control.setAttribute('aria-labelledby', title.id);
    });
  });
  const rangeUnits = { 'input-transition': ' ms', 'input-speed': '×', 'input-brightness': '%', 'input-contrast': '%' };
  document.querySelectorAll('input[type="range"]').forEach(control => {
    const wrap = document.createElement('div'); wrap.className = 'range-control';
    control.before(wrap); wrap.appendChild(control);
    const output = document.createElement('output'); output.htmlFor = control.id; wrap.appendChild(output);
    const update = () => { output.value = control.value + (rangeUnits[control.id] || ''); control.setAttribute('aria-valuetext', output.value); };
    control.addEventListener('input', update);
    control.syncOutput = update;
    update();
  });
  function syncDashboardPreview() {
    const toggles = { clock: 'toggle-widget-clock', date: 'toggle-widget-date', weather: 'toggle-widget-weather', focus: 'toggle-widget-focus', quote: 'toggle-widget-quote' };
    let count = 0;
    Object.entries(toggles).forEach(([name, id]) => {
      const enabled = document.getElementById(id).checked;
      document.querySelector(`[data-preview="${name}"]`).hidden = !enabled;
      if (enabled) count++;
    });
    const preview = document.querySelector('.dashboard-preview');
    preview.classList.toggle('is-empty', count === 0);
    preview.querySelector('.preview-tiles').hidden = !document.getElementById('toggle-widget-weather').checked && !document.getElementById('toggle-widget-focus').checked;
    document.querySelector('[data-preview="focus"] strong').textContent = (document.getElementById('input-focus-work').value || '25') + ':00';
  }
  document.getElementById('pane-widgets').addEventListener('change', syncDashboardPreview);
  document.getElementById('reset-dashboard-position').addEventListener('click', () => {
    saveSettings({ dashboardPos: null }, () => {
      document.getElementById('dashboard-settings-status').textContent = chrome.runtime.lastError ? 'Position could not be reset.' : 'Dashboard position reset.';
    });
  });

  document.addEventListener('click', (event) => {
    const interactive = event.target.closest('.btn, .segment, .action-item, .focus-btn');
    if (interactive) tactile('press');
  });

  // ---------------------------------------------------------------------
  // Wallpaper Library (unchanged behavior from v1)
  // ---------------------------------------------------------------------
  const wallpaperInput = document.getElementById('wallpaper-input');
  document.getElementById('upload-wallpaper-button').addEventListener('click', () => wallpaperInput.click());
  const wallpaperList = document.getElementById('wallpaper-list');
  const uploadArea = document.getElementById('upload-area');
  const wallpaperPreview = document.getElementById('wallpaper-preview');
  const selectDayWallpaper = document.getElementById('select-day-wallpaper');
  const selectNightWallpaper = document.getElementById('select-night-wallpaper');
  let currentPreviewUrl = null;
  let thumbnailUrls = [];

  function tactile(kind) {
    if (window.CommandBarUI) window.CommandBarUI.tactile(kind);
  }

  function renderWallpaperPreview(id) {
    if (!wallpaperPreview || !id) return;
    WallpaperDB.getWallpaperBlob(id).then((blob) => {
      if (!blob) return;
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      wallpaperPreview.innerHTML = '';
      const media = document.createElement(blob.type.startsWith('video/') ? 'video' : 'img');
      currentPreviewUrl = URL.createObjectURL(blob);
      media.src = currentPreviewUrl;
      media.alt = 'Active wallpaper preview';
      if (media.tagName === 'VIDEO') { media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true; }
      wallpaperPreview.appendChild(media);
      wallpaperPreview.classList.add('has-preview');
      updatePreviewFilter();
    }).catch(() => {});
  }

  function populateWallpaperSelects(wallpapers, res) {
    [selectDayWallpaper, selectNightWallpaper].forEach((sel) => {
      if (!sel) return;
      const prevValue = sel.value;
      sel.innerHTML = '';
      if (wallpapers.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No wallpapers uploaded yet';
        opt.value = '';
        sel.appendChild(opt);
        return;
      }
      wallpapers.forEach((wp) => {
        const opt = document.createElement('option');
        opt.value = wp.id;
        opt.textContent = wp.filename;
        sel.appendChild(opt);
      });
      const restored = sel === selectDayWallpaper ? res.scheduleDayWallpaperId : res.scheduleNightWallpaperId;
      sel.value = restored || prevValue || wallpapers[0].id;
    });
  }

  function renderWallpapers() {
    chrome.storage.local.get(['wallpapers', 'activeWallpaperId', 'scheduleDayWallpaperId', 'scheduleNightWallpaperId'], (res) => {
      const wallpapers = res.wallpapers || [];
      const activeId = res.activeWallpaperId;
      thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrls = [];
      wallpaperList.innerHTML = '';
      if (!activeId) {
        wallpaperPreview.classList.remove('has-preview');
        wallpaperPreview.innerHTML = '';
        if (currentPreviewUrl) { URL.revokeObjectURL(currentPreviewUrl); currentPreviewUrl = null; }
      }
      renderWallpaperPreview(activeId);

      if (wallpapers.length === 0) {
        wallpaperList.innerHTML = '<p class="empty-msg">No wallpapers uploaded yet.</p>';
      }

      wallpapers.forEach((wp) => {
        const item = document.createElement('div');
        item.className = `wallpaper-item ${wp.id === activeId ? 'active' : ''}`;

        const info = document.createElement('div');
        info.className = 'wp-info';

        const thumb = document.createElement('div');
        thumb.className = 'wp-thumb';
        WallpaperDB.getWallpaperBlob(wp.id).then((blob) => {
          if (!blob || !item.isConnected) return;
          const media = document.createElement(blob.type.startsWith('video/') ? 'video' : 'img');
          const thumbUrl = URL.createObjectURL(blob);
          thumbnailUrls.push(thumbUrl);
          media.src = thumbUrl;
          media.alt = '';
          if (media.tagName === 'VIDEO') { media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true; }
          thumb.appendChild(media);
        }).catch(() => {});

        const name = document.createElement('div');
        name.className = 'wp-name';
        name.textContent = wp.filename;

        const meta = document.createElement('div');
        meta.className = 'wp-meta';
        meta.textContent = `${wp.mimeType} · Uploaded ${new Date(wp.uploadedAt).toLocaleDateString()}`;

        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'wp-actions';

        if (wp.id === activeId) {
          const badge = document.createElement('span');
          badge.className = 'badge-active';
          badge.textContent = 'Active';
          actions.appendChild(badge);
        } else {
          const btnActive = document.createElement('button');
          btnActive.className = 'btn secondary-btn btn-sm';
          btnActive.textContent = 'Set Active';
          btnActive.addEventListener('click', () => setActiveWallpaper(wp.id));
          actions.appendChild(btnActive);
        }

        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn danger-btn btn-sm';
        btnDelete.textContent = 'Delete';
        btnDelete.addEventListener('click', () => {
          if (window.confirm(`Delete “${wp.filename}”?`)) { tactile('press'); deleteWallpaper(wp.id); }
        });
        actions.appendChild(btnDelete);

        item.appendChild(thumb);
        item.appendChild(info);
        item.appendChild(actions);
        wallpaperList.appendChild(item);
      });

      populateWallpaperSelects(wallpapers, res);
    });
  }

  function setActiveWallpaper(id) {
    saveSettings({ activeWallpaperId: id }, () => {
      renderWallpapers();
    });
  }

  function deleteWallpaper(id) {
    WallpaperDB.deleteWallpaperBlob(id)
      .then(() => {
        chrome.storage.local.get(['wallpapers', 'activeWallpaperId'], (res) => {
          let wallpapers = res.wallpapers || [];
          wallpapers = wallpapers.filter((w) => w.id !== id);
          let activeId = res.activeWallpaperId;
          if (activeId === id) {
            activeId = wallpapers.length > 0 ? wallpapers[0].id : null;
          }
          saveSettings({ wallpapers, activeWallpaperId: activeId }, () => {
            renderWallpapers();
          });
        });
      })
      .catch(() => {});
  }

  wallpaperInput.addEventListener('change', (e) => {
    handleWallpaperFile(e.target.files[0]);
  });

  function handleWallpaperFile(file) {
    if (!file) return;

    const id = 'wp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    WallpaperDB.putWallpaperBlob(id, file)
      .then(() => {
        chrome.storage.local.get(['wallpapers', 'activeWallpaperId'], (res) => {
          const wallpapers = res.wallpapers || [];
          const newMeta = {
            id,
            filename: file.name,
            mimeType: file.type,
            uploadedAt: Date.now()
          };
          wallpapers.push(newMeta);
          const activeId = res.activeWallpaperId || id;
          saveSettings({ wallpapers, activeWallpaperId: activeId }, () => {
            wallpaperInput.value = '';
            tactile('success');
            renderWallpapers();
          });
        });
      })
      .catch(() => {});
  }

  if (uploadArea) {
    ['dragenter', 'dragover'].forEach((eventName) => uploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadArea.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach((eventName) => uploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadArea.classList.remove('is-dragover');
    }));
    uploadArea.addEventListener('drop', (event) => handleWallpaperFile(event.dataTransfer.files[0]));
  }

  // ---------------------------------------------------------------------
  // Playback & Effects
  // ---------------------------------------------------------------------
  const inputSpeed = document.getElementById('input-speed');
  const inputBrightness = document.getElementById('input-brightness');
  const inputContrast = document.getElementById('input-contrast');
  const inputTransition = document.getElementById('input-transition');
  const toggleKenBurns = document.getElementById('toggle-ken-burns');
  const toggleParallax = document.getElementById('toggle-parallax');
  const queueSettings = window.CommandBarStorage && window.CommandBarStorage.debounceWrite ? window.CommandBarStorage.debounceWrite(120) : null;
  const debouncedSettingWrite = values => queueSettings ? queueSettings(values, announceSave) : saveSettings(values);
  function updatePreviewFilter() {
    const media = wallpaperPreview && wallpaperPreview.firstElementChild;
    if (!media) return;
    media.style.filter = `brightness(${inputBrightness.value}%) contrast(${inputContrast.value}%)`;
  }

  inputSpeed.addEventListener('input', () => {
    debouncedSettingWrite({ wpSpeed: parseFloat(inputSpeed.value) });
  });
  inputBrightness.addEventListener('input', () => {
    debouncedSettingWrite({ wpBrightness: parseInt(inputBrightness.value, 10) });
    updatePreviewFilter();
  });
  inputContrast.addEventListener('input', () => {
    debouncedSettingWrite({ wpContrast: parseInt(inputContrast.value, 10) });
    updatePreviewFilter();
  });
  inputTransition.addEventListener('input', () => {
    debouncedSettingWrite({ wpTransitionMs: parseInt(inputTransition.value, 10) });
  });
  toggleKenBurns.addEventListener('change', () => {
    saveSettings({ kenBurnsEnabled: toggleKenBurns.checked });
  });
  toggleParallax.addEventListener('change', () => {
    saveSettings({ parallaxEnabled: toggleParallax.checked });
  });

  // ---------------------------------------------------------------------
  // Rotation & Schedule
  // ---------------------------------------------------------------------
  const modeSegmented = document.getElementById('wallpaper-mode-segmented');
  const rotationOrderSegmented = document.getElementById('rotation-order-segmented');
  const inputRotationInterval = document.getElementById('input-rotation-interval');
  const rotateSettingsCard = document.getElementById('rotate-settings');
  const scheduleSettingsCard = document.getElementById('schedule-settings');
  const toggleUseSuntimes = document.getElementById('toggle-use-suntimes');
  const manualHoursRow = document.getElementById('manual-hours-row');
  const inputDayHour = document.getElementById('input-day-hour');
  const inputNightHour = document.getElementById('input-night-hour');

  function showModeCards(mode) {
    rotateSettingsCard.style.display = mode === 'rotate' ? 'block' : 'none';
    scheduleSettingsCard.style.display = mode === 'schedule' ? 'block' : 'none';
  }

  function setSegmentedActive(container, attr, value) {
    container.querySelectorAll('.segment').forEach((seg) => {
      seg.classList.toggle('active', seg.dataset[attr] === value);
    });
  }

  modeSegmented.addEventListener('click', (e) => {
    const seg = e.target.closest('.segment');
    if (!seg) return;
    const mode = seg.dataset.mode;
    setSegmentedActive(modeSegmented, 'mode', mode);
    showModeCards(mode);
    saveSettings({ wallpaperMode: mode });
  });

  rotationOrderSegmented.addEventListener('click', (e) => {
    const seg = e.target.closest('.segment');
    if (!seg) return;
    const order = seg.dataset.order;
    setSegmentedActive(rotationOrderSegmented, 'order', order);
    saveSettings({ rotationOrder: order });
  });

  inputRotationInterval.addEventListener('input', () => {
    saveSettings({ rotationIntervalMinutes: parseInt(inputRotationInterval.value, 10) || 30 });
  });

  selectDayWallpaper.addEventListener('change', () => {
    saveSettings({ scheduleDayWallpaperId: selectDayWallpaper.value });
  });
  selectNightWallpaper.addEventListener('change', () => {
    saveSettings({ scheduleNightWallpaperId: selectNightWallpaper.value });
  });

  toggleUseSuntimes.addEventListener('change', () => {
    saveSettings({ scheduleUseSunTimes: toggleUseSuntimes.checked });
    manualHoursRow.style.opacity = toggleUseSuntimes.checked ? '0.4' : '1';
  });
  inputDayHour.addEventListener('input', () => {
    saveSettings({ scheduleDayStartHour: parseInt(inputDayHour.value, 10) });
  });
  inputNightHour.addEventListener('input', () => {
    saveSettings({ scheduleNightStartHour: parseInt(inputNightHour.value, 10) });
  });

  // ---------------------------------------------------------------------
  // Widgets: Clock / Date
  // ---------------------------------------------------------------------
  const toggleWidgetClock = document.getElementById('toggle-widget-clock');
  const toggleWidgetDate = document.getElementById('toggle-widget-date');
  const toggle24Hour = document.getElementById('toggle-24hour');

  toggleWidgetClock.addEventListener('change', () => {
    saveSettings({ showWidgetClock: toggleWidgetClock.checked });
  });
  toggleWidgetDate.addEventListener('change', () => {
    saveSettings({ showWidgetDate: toggleWidgetDate.checked });
  });
  toggle24Hour.addEventListener('change', () => {
    saveSettings({ use24Hour: toggle24Hour.checked });
  });

  // ---------------------------------------------------------------------
  // Widgets: Weather
  // ---------------------------------------------------------------------
  const toggleWidgetWeather = document.getElementById('toggle-widget-weather');
  const weatherLocationSegmented = document.getElementById('weather-location-segmented');
  const weatherCityRow = document.getElementById('weather-city-row');
  const inputWeatherCity = document.getElementById('input-weather-city');
  const btnWeatherCitySave = document.getElementById('btn-weather-city-save');
  const weatherUnitsSegmented = document.getElementById('weather-units-segmented');
  const weatherStatus = document.getElementById('weather-status');

  toggleWidgetWeather.addEventListener('change', () => {
    saveSettings({ showWidgetWeather: toggleWidgetWeather.checked });
  });

  weatherLocationSegmented.addEventListener('click', (e) => {
    const seg = e.target.closest('.segment');
    if (!seg) return;
    const loc = seg.dataset.loc;
    setSegmentedActive(weatherLocationSegmented, 'loc', loc);
    weatherCityRow.style.display = loc === 'manual' ? 'flex' : 'none';
    saveSettings({ weatherLocationMode: loc });
  });

  weatherUnitsSegmented.addEventListener('click', (e) => {
    const seg = e.target.closest('.segment');
    if (!seg) return;
    const units = seg.dataset.units;
    setSegmentedActive(weatherUnitsSegmented, 'units', units);
    saveSettings({ weatherUnits: units });
  });

  // Geocode the manual city name once, via Open-Meteo's free geocoding
  // endpoint (no API key), then store lat/lon so newtab.js never needs to
  // geocode on every load.
  btnWeatherCitySave.addEventListener('click', () => {
    const cityName = inputWeatherCity.value.trim();
    if (!cityName) return;
    weatherStatus.textContent = 'Looking up city…';
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`)
      .then((r) => r.json())
      .then((data) => {
        const result = data && data.results && data.results[0];
        if (!result) {
          weatherStatus.textContent = 'City not found — try a different spelling.';
          return;
        }
        const label = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
        saveSettings({
          weatherManualLat: result.latitude,
          weatherManualLon: result.longitude,
          weatherManualLabel: label
        }, () => {
          weatherStatus.textContent = `Saved: ${label}`;
        });
      })
      .catch(() => {
        weatherStatus.textContent = 'Could not reach the geocoding service.';
      });
  });

  // ---------------------------------------------------------------------
  // Widgets: Quote & Focus Timer
  // ---------------------------------------------------------------------
  const toggleWidgetQuote = document.getElementById('toggle-widget-quote');
  const toggleWidgetFocus = document.getElementById('toggle-widget-focus');
  const inputFocusWork = document.getElementById('input-focus-work');
  const inputFocusBreak = document.getElementById('input-focus-break');

  toggleWidgetQuote.addEventListener('change', () => {
    saveSettings({ showWidgetQuote: toggleWidgetQuote.checked });
  });
  toggleWidgetFocus.addEventListener('change', () => {
    saveSettings({ showWidgetFocusTimer: toggleWidgetFocus.checked });
  });
  inputFocusWork.addEventListener('input', () => {
    saveSettings({ focusWorkMinutes: parseInt(inputFocusWork.value, 10) || 25 });
  });
  inputFocusBreak.addEventListener('input', () => {
    saveSettings({ focusBreakMinutes: parseInt(inputFocusBreak.value, 10) || 5 });
  });

  // ---------------------------------------------------------------------
  // Command Bar
  // ---------------------------------------------------------------------
  const btnShortcuts = document.getElementById('btn-shortcuts');
  const toggleAllWindows = document.getElementById('toggle-all-windows');
  const actionsList = document.getElementById('actions-list');
  const inputResultLimit = document.getElementById('input-result-limit');
  const toggleSuggestions = document.getElementById('toggle-suggestions');
  const toggleAutocomplete = document.getElementById('toggle-autocomplete');
  const selectDensity = document.getElementById('select-density');
  const enginesList = document.getElementById('search-engines-list');
  const engineEditor = document.getElementById('search-engine-editor');
  const engineName = document.getElementById('engine-name');
  const engineUrl = document.getElementById('engine-url');
  const engineShortcut = document.getElementById('engine-shortcut');
  const engineEnabled = document.getElementById('engine-enabled');
  const engineSave = document.getElementById('engine-save');
  const engineCancel = document.getElementById('engine-cancel');
  const engineAdd = document.getElementById('engine-add');
  const engineStatus = document.getElementById('engine-status');
  let editingEngineId = null;

  function engineStore(next, callback) {
    saveSettings({ customSearchEngines: next }, callback);
  }

  function closeEngineEditor() {
    editingEngineId = null;
    engineEditor.hidden = true;
    engineStatus.textContent = '';
  }

  function openEngineEditor(engine) {
    editingEngineId = engine ? engine.id : null;
    engineName.value = engine ? engine.name : '';
    engineUrl.value = engine ? engine.url : '';
    engineShortcut.value = engine && engine.shortcut !== 'shift+enter' ? engine.shortcut : '';
    engineEnabled.checked = !engine || engine.enabled !== false;
    engineStatus.textContent = '';
    engineEditor.hidden = false;
    engineName.focus();
  }

  function renderSearchEngines() {
    if (!enginesList) return;
    chrome.storage.local.get({ customSearchEngines: [] }, (res) => {
      const engines = window.CommandBarSearchEngines.sanitizeEngines(res.customSearchEngines);
      enginesList.innerHTML = '';
      if (!engines.length) {
        const empty = document.createElement('p'); empty.className = 'empty-msg'; empty.textContent = 'No custom search engines yet.'; enginesList.appendChild(empty); return;
      }
      engines.forEach((engine) => {
        const row = document.createElement('div'); row.className = `search-engine-item${engine.enabled ? '' : ' is-disabled'}`;
        const info = document.createElement('div'); info.className = 'engine-info';
        const name = document.createElement('div'); name.className = 'engine-name'; name.textContent = engine.name + (engine.enabled ? '' : ' (disabled)');
        const meta = document.createElement('div'); meta.className = 'engine-meta'; meta.textContent = `${engine.shortcut ? window.CommandBarSearchEngines.shortcutLabel(engine.shortcut) : 'No shortcut'} · ${engine.url}`;
        info.append(name, meta);
        const actions = document.createElement('div'); actions.className = 'engine-actions';
        const toggle = document.createElement('button'); toggle.className = 'btn btn-sm secondary-btn'; toggle.textContent = engine.enabled ? 'Disable' : 'Enable';
        toggle.onclick = () => { engine.enabled = !engine.enabled; engineStore(engines, renderSearchEngines); };
        const edit = document.createElement('button'); edit.className = 'btn btn-sm secondary-btn'; edit.textContent = 'Edit'; edit.onclick = () => openEngineEditor(engine);
        const remove = document.createElement('button'); remove.className = 'btn btn-sm danger-btn'; remove.textContent = 'Delete'; remove.onclick = () => { if (confirm(`Delete ${engine.name}?`)) engineStore(engines.filter((item) => item.id !== engine.id), renderSearchEngines); };
        actions.append(toggle, edit, remove); row.append(info, actions); enginesList.appendChild(row);
      });
    });
  }

  engineAdd.addEventListener('click', () => openEngineEditor(null));
  engineCancel.addEventListener('click', closeEngineEditor);
  engineSave.addEventListener('click', () => {
    const helper = window.CommandBarSearchEngines;
    let normalizedUrl;
    try { normalizedUrl = helper.normalizeUrlTemplate(engineUrl.value); } catch (error) { engineStatus.textContent = error.message; return; }
    const shortcut = helper.normalizeShortcut(engineShortcut.value);
    chrome.storage.local.get({ customSearchEngines: [] }, (res) => {
      const engines = helper.sanitizeEngines(res.customSearchEngines);
      if (shortcut && engines.some((item) => item.shortcut === shortcut && item.id !== editingEngineId)) { engineStatus.textContent = 'That shortcut is already assigned.'; return; }
      if (!next.name) { engineStatus.textContent = 'Name is required.'; return; }
      const updated = editingEngineId ? engines.map((item) => item.id === editingEngineId ? next : item) : engines.concat(next);
      engineStore(updated, () => { closeEngineEditor(); renderSearchEngines(); });
    });
  });

  btnShortcuts.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  toggleAllWindows.addEventListener('change', () => {
    saveSettings({ searchAllWindowsByDefault: toggleAllWindows.checked });
  });
  inputResultLimit.addEventListener('change', () => saveSettings({ commandBarResultLimit: Math.max(3, Math.min(20, parseInt(inputResultLimit.value, 10) || 6)) }));
  toggleSuggestions.addEventListener('change', () => saveSettings({ commandBarSuggestionsEnabled: toggleSuggestions.checked }));
  toggleAutocomplete.addEventListener('change', () => saveSettings({ commandBarAutocompleteEnabled: toggleAutocomplete.checked }));
  const routingRadios = Array.from(document.querySelectorAll('input[name="search-routing-mode"]'));
  function syncRoutingMode(value) {
    const mode = value === 'prefer-ai' ? 'prefer-ai' : 'balanced';
    routingRadios.forEach((radio) => { radio.checked = radio.value === mode; });
  }
  routingRadios.forEach((radio) => radio.addEventListener('change', () => {
    if (!radio.checked) return;
    syncRoutingMode(radio.value);
    saveSettings({ searchRoutingMode: radio.value });
  }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.searchRoutingMode) syncRoutingMode(changes.searchRoutingMode.newValue);
  });
  selectDensity.addEventListener('change', () => saveSettings({ commandBarDensity: selectDensity.value }));

  function renderActions() {
    const allActions = window.ActionRegistry ? window.ActionRegistry.all() : (window.ACTIONS || []);
    chrome.storage.local.get(['disabledActions', 'actionFavorites'], (res) => {
      const disabled = Array.isArray(res.disabledActions) ? res.disabledActions : [];
      const favorites = Array.isArray(res.actionFavorites) ? res.actionFavorites : [];
      actionsList.innerHTML = '';

      allActions.forEach((action) => {
        const row = document.createElement('label');
        row.className = 'action-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !disabled.includes(action.id);

        checkbox.addEventListener('change', () => {
          chrome.storage.local.get(['disabledActions'], (innerRes) => {
            let currentDisabled = Array.isArray(innerRes.disabledActions) ? innerRes.disabledActions : [];
            if (checkbox.checked) {
              currentDisabled = currentDisabled.filter((id) => id !== action.id);
            } else if (!currentDisabled.includes(action.id)) {
              currentDisabled.push(action.id);
            }
            saveSettings({ disabledActions: currentDisabled });
          });
        });

        const span = document.createElement('span');
        span.textContent = `${action.label} (${action.id})`;

        row.appendChild(checkbox);
        const favorite = document.createElement('input');
        favorite.type = 'checkbox';
        favorite.title = 'Show this action first';
        favorite.checked = favorites.includes(action.id);
        favorite.addEventListener('change', () => {
          chrome.storage.local.get(['actionFavorites'], (innerRes) => {
            let current = Array.isArray(innerRes.actionFavorites) ? innerRes.actionFavorites : [];
            current = favorite.checked ? Array.from(new Set(current.concat(action.id))) : current.filter((id) => id !== action.id);
            saveSettings({ actionFavorites: current });
          });
        });
        row.appendChild(favorite);
        row.appendChild(span);
        actionsList.appendChild(row);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Backup
  // ---------------------------------------------------------------------
  const btnExport = document.getElementById('btn-export');
  const inputImport = document.getElementById('input-import');
  document.getElementById('import-profile-button').addEventListener('click', () => inputImport.click());
  const backupStatus = document.getElementById('backup-status');
  btnExport.addEventListener('click', () => {
    chrome.storage.local.get(null, (allData) => {
      const allowed = Object.values(window.CommandBarStorage.KEYS);
      const exportData = Object.fromEntries(Object.entries(allData).filter(([key]) => allowed.includes(key)));
      exportData.customSearchEngines = window.CommandBarSearchEngines.sanitizeEngines(allData.customSearchEngines);
      ['tabFrecency', 'visitLog', 'historyIndex', 'weatherCache', 'actionUsage', 'commandBarUsage', 'siteIconCache'].forEach((key) => delete exportData[key]);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'cmd-bar-wallpaper-config.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  });
  inputImport.addEventListener('change', () => {
    const file = inputImport.files && inputImport.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Profile must be a JSON object.');
        const allowed = (window.CommandBarStorage && window.CommandBarStorage.KEYS) || {};
        const safe = {};
        Object.keys(parsed).forEach((key) => { if (Object.values(allowed).includes(key)) safe[key] = parsed[key]; });
        if (Object.prototype.hasOwnProperty.call(safe, 'customSearchEngines')) {
          safe.customSearchEngines = window.CommandBarSearchEngines.sanitizeEngines(safe.customSearchEngines);
        }
        if (Number(parsed.storageSchemaVersion || 0) < 5 && !safe.dashboardPos && safe.widgetPos &&
            Number.isFinite(safe.widgetPos.left) && Number.isFinite(safe.widgetPos.top)) {
          safe.dashboardPos = safe.widgetPos;
        }
        delete safe.storageSchemaVersion;
        saveSettings(safe, () => {
          backupStatus.textContent = chrome.runtime.lastError ? 'Import failed.' : `Imported ${Object.keys(safe).length} settings. Reload to apply all changes.`;
          renderWallpapers();
        });
      } catch (error) {
        backupStatus.textContent = `Import failed: ${error.message}`;
      }
    };
    reader.readAsText(file);
    inputImport.value = '';
  });

  // ---------------------------------------------------------------------
  // About
  // ---------------------------------------------------------------------
  const aboutVersion = document.getElementById('about-version');
  if (chrome.runtime.getManifest) {
    aboutVersion.textContent = chrome.runtime.getManifest().version;
  }

  // ---------------------------------------------------------------------
  // Initial load — restore every stored setting into its control
  // ---------------------------------------------------------------------
  chrome.storage.local.get(
    (window.CommandBarStorage && window.CommandBarStorage.DEFAULTS) || {},
    (res) => {
      toggleAllWindows.checked = Boolean(res.searchAllWindowsByDefault);
      inputResultLimit.value = res.commandBarResultLimit;
      toggleSuggestions.checked = Boolean(res.commandBarSuggestionsEnabled);
      toggleAutocomplete.checked = Boolean(res.commandBarAutocompleteEnabled);
      syncRoutingMode(res.searchRoutingMode);
      selectDensity.value = res.commandBarDensity || 'comfortable';
      renderSearchEngines();
      toggleWidgetClock.checked = Boolean(res.showWidgetClock);
      toggleWidgetDate.checked = Boolean(res.showWidgetDate);
      toggle24Hour.checked = Boolean(res.use24Hour);
      inputSpeed.value = res.wpSpeed;
      inputBrightness.value = res.wpBrightness;
      inputContrast.value = res.wpContrast;
      inputTransition.value = res.wpTransitionMs;
      toggleKenBurns.checked = Boolean(res.kenBurnsEnabled);
      toggleParallax.checked = Boolean(res.parallaxEnabled);

      setSegmentedActive(modeSegmented, 'mode', res.wallpaperMode);
      showModeCards(res.wallpaperMode);
      setSegmentedActive(rotationOrderSegmented, 'order', res.rotationOrder);
      inputRotationInterval.value = res.rotationIntervalMinutes;
      toggleUseSuntimes.checked = Boolean(res.scheduleUseSunTimes);
      manualHoursRow.style.opacity = res.scheduleUseSunTimes ? '0.4' : '1';
      inputDayHour.value = res.scheduleDayStartHour;
      inputNightHour.value = res.scheduleNightStartHour;

      toggleWidgetWeather.checked = Boolean(res.showWidgetWeather);
      setSegmentedActive(weatherLocationSegmented, 'loc', res.weatherLocationMode);
      weatherCityRow.style.display = res.weatherLocationMode === 'manual' ? 'flex' : 'none';
      if (res.weatherManualLabel) {
        inputWeatherCity.value = res.weatherManualLabel;
      }
      setSegmentedActive(weatherUnitsSegmented, 'units', res.weatherUnits);

      toggleWidgetQuote.checked = Boolean(res.showWidgetQuote);
      toggleWidgetFocus.checked = Boolean(res.showWidgetFocusTimer);
      inputFocusWork.value = res.focusWorkMinutes;
      inputFocusBreak.value = res.focusBreakMinutes;
      updatePreviewFilter();
      document.querySelectorAll('input[type="range"]').forEach(control => control.syncOutput());
      syncDashboardPreview();
    }
  );

  renderWallpapers();
  renderActions();
}());
