(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OverlayCard = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  // Renders a CALC/DEF result directly into its own result row (inline,
  // Google-OneBox style) instead of a separate side preview panel.
  // DEF items only ever arrive here as 'loading', 'success', or
  // 'not_found' — dictionary lookups now only fire on an explicit
  // trigger, so there's no lazy 'idle' state to render anymore.
  function renderInlineCard(containerElem, item, options) {
    if (!containerElem || !item) return;
    const opts = options || {};

    containerElem.innerHTML = '';

    if (item.type === 'CALC') {
      const badge = document.createElement('div');
      badge.className = 'card-badge math';
      badge.textContent = item.data.source === 'desmos' ? 'Desmos Math' : 'Math Result';

      const val = document.createElement('div');
      val.className = 'math-card-value';
      val.textContent = item.data.kind === 'loading' ? 'Evaluating…' : item.data.query;

      const expr = document.createElement('div');
      expr.className = 'math-card-expr';
      expr.textContent = item.data.latex || item.data.expr;

      if (item.data.kind === 'error') {
        val.classList.add('math-card-error');
      }

      const hint = document.createElement('div');
      hint.className = 'card-action-hint';
      hint.innerHTML = item.data.kind === 'loading' ? 'Waiting for a math engine…' : '<span class="kbd-shortcut">↵</span> Copy result to clipboard';

      containerElem.appendChild(badge);
      containerElem.appendChild(val);
      containerElem.appendChild(expr);
      containerElem.appendChild(hint);
    } else if (item.type === 'DEF') {
      const defData = item.data;

      const badge = document.createElement('div');
      badge.className = 'card-badge dict';
      badge.textContent = 'FreeDictionaryAPI';

      const word = document.createElement('div');
      word.className = 'dict-card-word';
      word.textContent = defData.word || 'Definition';

      containerElem.appendChild(badge);
      containerElem.appendChild(word);

      if (defData.status === 'loading') {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'dict-def-item';
        loadingEl.style.opacity = '0.6';
        loadingEl.textContent = 'Searching definition...';
        containerElem.appendChild(loadingEl);
      } else if (defData.status === 'not_found') {
        const errorEl = document.createElement('div');
        errorEl.className = 'dict-def-item';
        errorEl.style.color = 'rgba(255, 255, 255, 0.6)';
        errorEl.textContent = 'No entry found in FreeDictionaryAPI.';
        containerElem.appendChild(errorEl);
      } else if (defData.phonetic) {
        const phon = document.createElement('div');
        phon.className = 'dict-card-phonetic';
        phon.textContent = defData.phonetic;
        containerElem.appendChild(phon);
      }

      if (defData.status === 'success' && Array.isArray(defData.meanings) && defData.meanings.length > 0) {
        defData.meanings.forEach((m) => {
          const pos = document.createElement('div');
          pos.className = 'dict-pos-tag';
          pos.textContent = m.partOfSpeech;
          containerElem.appendChild(pos);

          if (Array.isArray(m.definitions)) {
            m.definitions.forEach((d, idx) => {
              const defEl = document.createElement('div');
              defEl.className = 'dict-def-item';
              defEl.textContent = `${idx + 1}. ${d.definition}`;

              if (d.example) {
                const exEl = document.createElement('div');
                exEl.className = 'dict-def-example';
                exEl.textContent = `"${d.example}"`;
                defEl.appendChild(exEl);
              }
              containerElem.appendChild(defEl);
            });
          }

          if (Array.isArray(m.synonyms) && m.synonyms.length > 0) {
            const synContainer = document.createElement('div');
            synContainer.className = 'dict-synonyms';
            m.synonyms.forEach((syn) => {
              const synTag = document.createElement('span');
              synTag.className = 'dict-syn-tag';
              synTag.textContent = syn;
              synContainer.appendChild(synTag);
            });
            containerElem.appendChild(synContainer);
          }
        });
      }

      const appleBtn = document.createElement('button');
      appleBtn.className = 'apple-dict-btn';
      appleBtn.innerHTML = ' Open in Apple Dictionary';
      appleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof opts.onOpenAppleDict === 'function') {
          opts.onOpenAppleDict(defData.word);
        }
      });
      containerElem.appendChild(appleBtn);

      const hint = document.createElement('div');
      hint.className = 'card-action-hint';
      hint.innerHTML = '<span class="kbd-shortcut">↵</span> Copy / Open &nbsp;|&nbsp; Click  for Apple App';
      containerElem.appendChild(hint);
    }
  }

  return {
    renderInlineCard
  };
}));
