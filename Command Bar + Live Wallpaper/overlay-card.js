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

    if (opts.compact && item.type === 'DEF') {
      const data = item.data;
      const icon = document.createElement('span');
      icon.className = 'dict-preview-icon'; icon.textContent = 'Aa'; icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div'); body.className = 'dict-preview-body';
      const title = document.createElement('div'); title.className = 'dict-preview-title';
      const meaning = data.meanings && data.meanings[0];
      title.textContent = [data.word, data.phonetic, meaning && meaning.partOfSpeech].filter(Boolean).join('  ·  ');
      const definition = document.createElement('div'); definition.className = 'dict-preview-definition';
      definition.textContent = data.status === 'loading' ? 'Checking spelling and looking up word…' :
        data.status === 'unavailable' ? 'Lookup unavailable. Try again shortly.' :
        data.status !== 'success' ? 'No dictionary entry found.' : data.mode === 'synonyms' ? (data.synonyms || []).join(', ') :
        meaning && meaning.definitions && meaning.definitions[0] ? meaning.definitions[0].definition : 'No definition available.';
      const source = document.createElement('div'); source.className = 'dict-preview-source';
      source.textContent = data.mode === 'synonyms' ? 'Datamuse' : 'FreeDictionaryAPI';
      body.appendChild(title); body.appendChild(definition); body.appendChild(source);
      if (data.correctedFrom) {
        const correction = document.createElement('div'); correction.className = 'dict-card-phonetic';
        correction.textContent = `Corrected from “${data.correctedFrom}”`; body.appendChild(correction);
      }
      const preview = document.createElement('div'); preview.className = 'dict-preview';
      preview.appendChild(icon); preview.appendChild(body); containerElem.appendChild(preview);
      const details = document.createElement('details'); details.className = 'dict-preview-details';
      const summary = document.createElement('summary'); summary.textContent = 'Show definition details';
      if (data.mode === 'synonyms') summary.textContent = 'Show synonym details';
      const content = document.createElement('div'); content.className = 'dict-full-details';
      renderInlineCard(content, item, Object.assign({}, opts, { compact: false }));
      details.appendChild(summary); details.appendChild(content);
      details.addEventListener('click', event => event.stopPropagation());
      details.addEventListener('keydown', event => event.stopPropagation());
      containerElem.appendChild(details);
      return;
    }

    if (item.type === 'CALC') {
      const badge = document.createElement('div');
      badge.className = 'card-badge math';
      badge.textContent = item.data.kind === 'symbolic' ? 'Math Preview' : 'Math Result';

      const val = document.createElement('div');
      val.className = 'math-card-value';
      val.textContent = item.data.query;

      const expr = document.createElement('div');
      expr.className = 'math-card-expr';
      expr.textContent = item.data.expr;
      const renderer = typeof CommandBarMathRenderer !== 'undefined' ? CommandBarMathRenderer : null;
      if (renderer) renderer.renderResult(val, item.data);
      if (renderer && item.data.tree) {
        renderer.render(item.data.kind === 'symbolic' ? val : expr, item.data.tree, item.data.expr);
        if (item.data.kind === 'symbolic') expr.textContent = 'Symbolic expression';
      }

      if (item.data.kind === 'error') {
        val.classList.add('math-card-error');
      }

      const hint = document.createElement('div');
      hint.className = 'card-action-hint';
      hint.textContent = item.data.kind === 'error' ? 'Check the expression' : item.data.kind === 'symbolic' ? '↵ Copy expression' : '↵ Copy result';

      containerElem.appendChild(badge);
      containerElem.appendChild(val);
      containerElem.appendChild(expr);
      containerElem.appendChild(hint);
    } else if (item.type === 'DEF') {
      const defData = item.data;

      const badge = document.createElement('div');
      badge.className = 'card-badge dict';
      badge.textContent = defData.mode === 'synonyms' ? 'Synonyms · Datamuse' : 'FreeDictionaryAPI';

      const word = document.createElement('div');
      word.className = 'dict-card-word';
      word.textContent = defData.word || 'Definition';

      containerElem.appendChild(badge);
      containerElem.appendChild(word);

      if (defData.correctedFrom) {
        const correction = document.createElement('div');
        correction.className = 'dict-card-phonetic';
        correction.textContent = `Showing results for “${defData.word}” · corrected from “${defData.correctedFrom}”`;
        containerElem.appendChild(correction);
      }
      if (defData.mode === 'synonyms' && defData.status === 'success') {
        const synonyms = document.createElement('div');
        synonyms.className = 'dict-synonyms';
        (defData.synonyms || []).forEach(value => {
          const tag = document.createElement('span');
          tag.className = 'dict-syn-tag';
          tag.textContent = value;
          synonyms.appendChild(tag);
        });
        containerElem.appendChild(synonyms);
      }
      if (defData.status === 'loading') {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'dict-def-item';
        loadingEl.style.opacity = '0.6';
        loadingEl.textContent = 'Checking spelling and looking up word…';
        containerElem.appendChild(loadingEl);
      } else if (defData.status === 'not_found' || defData.status === 'unavailable') {
        const errorEl = document.createElement('div');
        errorEl.className = 'dict-def-item';
        errorEl.style.color = 'rgba(255, 255, 255, 0.6)';
        errorEl.textContent = defData.status === 'unavailable' ? 'Lookup unavailable. Try again shortly.' : defData.mode === 'synonyms' ? 'No synonyms found for this word.' : 'No dictionary entry found.';
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
      hint.innerHTML = defData.status === 'success' ? '<span class="kbd-shortcut">↵</span> Copy result' : '<span class="kbd-shortcut">↵</span> Open in Apple Dictionary';
      containerElem.appendChild(hint);
    }
  }

  return {
    renderInlineCard
  };
}));
