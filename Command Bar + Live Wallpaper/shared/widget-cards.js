(function (root) {
  const variants = {
    clock: { glass: 'Glass card', centered: 'Centered text', analog: 'Analog clock', inline: 'Inline' },
    weather: { glass: 'Glass card', text: 'Text only', icon: 'Condition icon', horizontal: 'Horizontal strip' },
    focus: { ring: 'Circular ring', digits: 'Large digits', bar: 'Progress bar', compact: 'Compact' },
    quote: { glass: 'Glass card', centered: 'Centered text', editorial: 'Editorial', line: 'Single line' }
  };
  const choices = {
    size: { small: 'Small', medium: 'Medium', large: 'Large' },
    surface: { default: 'Default', glass: 'Glass', solid: 'Solid', none: 'None' },
    accent: { neutral: 'Neutral', blue: 'Blue', mint: 'Mint', amber: 'Amber', rose: 'Rose' }
  };
  function sanitizeAppearance(value) {
    const result = {};
    Object.keys(variants).forEach(kind => {
      const input = value && value[kind] || {};
      const defaults = { variant: Object.keys(variants[kind])[0], size: 'medium', surface: 'default', accent: 'neutral' };
      result[kind] = {};
      Object.keys(defaults).forEach(key => {
        const allowed = key === 'variant' ? variants[kind] : choices[key];
        result[kind][key] = typeof input[key] === 'string' && Object.hasOwn(allowed, input[key]) ? input[key] : defaults[key];
      });
    });
    return result;
  }
  function sanitizeLocks(value) {
    return Object.fromEntries(Object.keys(variants).map(kind => [kind, Boolean(value && value[kind] === true)]));
  }
  function applyAppearance(document, value) {
    const appearance = sanitizeAppearance(value);
    document.querySelectorAll('[data-widget-card]').forEach(card => {
      const kind = card.dataset.widgetCard, config = appearance[kind];
      if (!config) return;
      Object.entries(config).forEach(([key, val]) => { card.dataset[key] = val; });
      const plain = { clock: ['centered','inline'], weather: ['text','icon'], focus: ['digits','compact'], quote: ['centered','editorial','line'] };
      card.dataset.material = config.surface === 'default' ? (plain[kind].includes(config.variant) ? 'none' : 'glass') : config.surface;
      const expand = card.querySelector('.quote-expand');
      if (expand) {
        expand.hidden = config.variant !== 'line';
        if (expand.hidden) { card.classList.remove('quote-expanded'); expand.setAttribute('aria-expanded','false'); expand.textContent = 'Read quote'; }
      }
    });
    return appearance;
  }
  function updateClock(card, date, visible = true) {
    if (!card) return;
    const dial = card.querySelector('.analog-clock');
    if (!dial) return;
    dial.hidden = !visible;
    dial.setAttribute('aria-label', date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    card.style.setProperty('--hour-angle', ((date.getHours()%12)*30+date.getMinutes()/2)+'deg');
    card.style.setProperty('--minute-angle', (date.getMinutes()*6)+'deg');
  }
  const templates = {
    clock: `<div class="widget-content"><div class="analog-clock" role="img" aria-label="Clock"><span class="dial-number dial-12">12</span><span class="dial-number dial-3">3</span><span class="dial-number dial-6">6</span><span class="dial-number dial-9">9</span><i class="hour-hand"></i><i class="minute-hand"></i><i class="dial-pin"></i></div><div id="widget-clock" class="widget-clock"></div>
      <div id="widget-date" class="widget-date"></div>
      </div>`,
    weather: `<div class="widget-content">
        <div class="widget-eyebrow">Outside</div>
        <div class="weather-reading"><svg id="weather-condition-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6L7 7m10 10 1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0"/></svg><div class="weather-temp" id="weather-temp">--°</div></div>
        <div class="weather-desc" id="weather-desc" role="status">Loading weather…</div>
        <div class="weather-place" id="weather-place"></div>
      </div>`,
    focus: `<div class="widget-content">
        <div class="focus-mode-label widget-eyebrow" id="focus-mode-label">Focus</div>
        <div class="focus-dial"><svg class="focus-progress" viewBox="0 0 100 100" aria-hidden="true"><circle class="focus-track" cx="50" cy="50" r="46"/><circle id="focus-progress" cx="50" cy="50" r="46" pathLength="1"/></svg><div class="focus-time" id="focus-time">25:00</div></div>
        <div class="focus-controls">
          <button class="focus-btn primary-focus" id="focus-btn-toggle" type="button">Start</button>
          <button class="focus-btn" id="focus-btn-reset" type="button">Reset</button>
        </div>
      </div>`,
    quote: `<div class="widget-content">
        <svg class="quote-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h6v8H2v-8c0-5 2-7 7-8v3c-3 1-5 2-5 5 M16 12h6v8h-8v-8c0-5 2-7 7-8v3c-3 1-5 2-5 5"/></svg>
        <span id="quote-text">“…”</span>
        <span class="quote-author" id="quote-author"></span><button class="quote-expand focus-btn" type="button" aria-expanded="false" hidden>Read quote</button>
      </div>`
  };
  function render(document) {
    document.querySelectorAll('[data-widget-card]').forEach(card => {
      const kind = card.dataset.widgetCard;
      card.classList.add('widget-card', 'widget-' + kind + '-card');
      card.innerHTML = templates[kind] || '';
      const expand = card.querySelector('.quote-expand');
      if (expand) expand.addEventListener('click', () => {
        const expanded = card.classList.toggle('quote-expanded');
        expand.setAttribute('aria-expanded', String(expanded));
        expand.textContent = expanded ? 'Show less' : 'Read quote';
      });
      const preview = card.closest('[data-widget-preview]');
      card.querySelectorAll('[id]').forEach(node => {
        node.dataset.role = node.id;
        if (preview) node.id = 'preview-' + node.id;
      });
      if (expand) expand.setAttribute('aria-controls',card.querySelector('[data-role="quote-text"]').id);
      if (preview) card.querySelectorAll('button').forEach(button => { button.disabled = true; button.tabIndex = -1; });
    });
    applyAppearance(document, null);
  }
  root.WidgetCards = { render, variants, choices, sanitizeAppearance, sanitizeLocks, applyAppearance, updateClock };
  if (typeof module === 'object' && module.exports) module.exports = root.WidgetCards;
  if (typeof document !== 'undefined') render(document);
}(typeof self !== 'undefined' ? self : globalThis));
