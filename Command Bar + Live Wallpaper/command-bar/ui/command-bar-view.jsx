import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createCaretAura } from './caret-aura';
import { createDecorations } from './glass-coordinator';

function MatchText({ text = '', query, positions }) {
  const hits = new Set(query && positions ? positions(query.trim(), text) || [] : []);
  const parts = [];
  for (let start = 0; start < text.length;) {
    const marked = hits.has(start);
    let end = start + 1;
    while (end < text.length && hits.has(end) === marked) end++;
    parts.push(marked ? <mark className="match-highlight" key={start}>{text.slice(start, end)}</mark> : text.slice(start, end));
    start = end;
  }
  return parts;
}
function ResultRow({ item, index, model, api }) {
  const key = api.key(item);
  const card = item.type === 'CALC' || item.type === 'DEF';
  const node = useRef(null);
  const cardBody = useRef(null);
  const bind = useCallback(element => {
    node.current = element;
    if (element) api.rows.set(key, element); else api.rows.delete(key);
  }, [key, api]);
  useLayoutEffect(() => {
    if (!card) return;
    api.renderCard(cardBody.current, item, { onOpenAppleDict: api.openDictionary, compact: model.answer });
    return () => cardBody.current?.replaceChildren();
  }, [card, item, api, model.answer]);
  if (item.type === 'HISTORY_GROUP') return <li ref={bind} className="history-group-header">{item.group} · {item.count}</li>;
  const selected = index === model.selectedIndex;
  const icon = api.icons.get(key) || api.icon(item);
  return <li ref={bind} role="option" aria-selected={selected} id={`__cmd_result_${index}`}
    className={`result-item${card ? ' result-item-card' : ''}${selected ? ' selected' : ''}`}
    onClick={() => api.select(index)}>
    {card ? <><div className="card-content" ref={cardBody}/>
      {model.answer && item.type === 'CALC' && item.data.kind !== 'error' && <button type="button" className="answer-copy" aria-label="Copy result"
        onClick={event => { event.stopPropagation(); api.select(index); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h10v14H8z M5 17H3V3h10v2"/></svg></button>}
    </> : <>
      <div className="result-left">
        <img className="result-icon" src={icon} alt="" aria-hidden="true" onError={event => {
          const image = event.currentTarget;
          if (image.getAttribute('src') !== api.fallback(item.type)) image.src = api.fallback(item.type);
        }}/>
        <div className="result-text"><div className="result-heading">
          <span className="result-title"><MatchText text={item.title} query={model.query} positions={api.positions}/></span>
          {item.type === 'TAB' && item.data?.pinned && <svg className="status-icon" viewBox="0 0 24 24"><path d="M16 12V4H17V2H7V4H8V12L6 14V16H11V22H13V16H18V14L16 12Z"/></svg>}
          {item.type === 'TAB' && item.data?.muted && <svg className="status-icon" viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z M16 9l5 6m0-6-5 6"/></svg>}
        </div>{item.sub && <span className="result-sub"><MatchText text={item.sub} query={model.query} positions={api.positions}/></span>}</div>
      </div>
      <div className="badge-container">{(item.badges || (item.type ? [item.type] : [])).map((badge, i) => <span className="result-badge" key={`${badge}-${i}`}>{badge}</span>)}</div>
    </>}
  </li>;
}
function Shell({ model, api, refs }) {
  const [expanded, setExpanded] = useState(false);
  const answerKey = model.answer ? api.key(model.items[0]) : null;
  useLayoutEffect(() => { setExpanded(false); }, [answerKey]);
  const layoutMounted = useRef(false);
  useLayoutEffect(() => {
    if (layoutMounted.current) api.onLayout?.();
    layoutMounted.current = true;
  }, [expanded]);
  const bind = name => element => { refs[name] = element; };
  const ai = model.items.some(item => item.type === 'AI');
  const hasResults = model.items.some(item => item.type !== 'AI') || (model.empty && !ai);
  // The controller owns visibility, focus, selection geometry, and animation styles.
  // These constant props never overwrite those imperative attributes on updates.
  return <div ref={bind('backdrop')} className="overlay-backdrop" role="presentation">
    <div ref={bind('modalBox')} className="modal-box" data-ai={ai ? "true" : undefined} data-results={hasResults ? "true" : "false"} data-answer={model.answer ? "true" : undefined} data-expanded={expanded || model.selectedIndex > 0 ? "true" : "false"} role="dialog" aria-modal="true" aria-label="Command Bar">
      <div ref={bind('inputWrapper')} className="input-wrapper">
        <input ref={bind('input')} type="text" className="input-field" defaultValue="" placeholder="Search or enter a command…"
          aria-controls="__cmd_bar_results__" aria-autocomplete="list" aria-label="Search tabs, history, bookmarks, actions, math, definitions, or synonyms"/>
        {ai && <button type="button" className="ai-submit" aria-label="Ask AI" title="Ask AI" onClick={() => api.submitAI?.()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A5.985 5.985 0 0 0 10.747 0a6.046 6.046 0 0 0-5.76 4.187 5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.092 5.985 5.985 0 0 0 .516 4.91 6.046 6.046 0 0 0 6.51 2.9A5.985 5.985 0 0 0 13.253 24a6.046 6.046 0 0 0 5.76-4.187 5.985 5.985 0 0 0 3.998-2.9 6.046 6.046 0 0 0-.729-7.092zM13.253 22.43a4.473 4.473 0 0 1-2.871-1.04l.142-.08 4.77-2.754a.785.785 0 0 0 .397-.68v-6.726l2.016 1.164a.071.071 0 0 1 .04.056v5.57a4.497 4.497 0 0 1-4.494 4.49zM3.61 18.304a4.473 4.473 0 0 1-.533-3.006l.142.085 4.774 2.755a.79.79 0 0 0 .785 0l5.831-3.363v2.329a.08.08 0 0 1-.035.066l-4.826 2.786a4.497 4.497 0 0 1-6.138-1.652zM2.354 7.904A4.473 4.473 0 0 1 4.7 5.938V11.6a.785.785 0 0 0 .393.68l5.831 3.363-2.016 1.164a.075.075 0 0 1-.075.005l-4.83-2.79a4.497 4.497 0 0 1-1.649-6.118zm16.592 3.852-5.831-3.363 2.016-1.164a.075.075 0 0 1 .075-.005l4.83 2.79a4.497 4.497 0 0 1-.697 8.084v-5.661a.79.79 0 0 0-.393-.681zm2.01-3.024-.142-.085-4.765-2.76a.79.79 0 0 0-.79 0L9.43 9.25V6.921a.08.08 0 0 1 .035-.066l4.826-2.781a4.497 4.497 0 0 1 6.665 4.658zM8.33 12.886l-2.02-1.164a.08.08 0 0 1-.04-.057V6.082a4.497 4.497 0 0 1 7.366-3.454l-.142.08-4.77 2.754a.785.785 0 0 0-.396.68zm1.095-.635v-2.502L12 8.26l2.575 1.489v2.502L12 13.74z"/></svg>
        </button>}
        <span className="ai-ripple" aria-hidden="true"/>
        <span className="caret-aura" ref={bind('caretAura')} aria-hidden="true" hidden/>
        <span className="caret-mirror" ref={bind('caretMirror')} aria-hidden="true"/>
      </div>
      <div ref={bind('resultsPanel')} className="results-panel" hidden={!hasResults}><div className="content-body">
        <div ref={bind('resultsContainer')} className="results-container"><div className="results-track">
          <div ref={bind('selectionHighlight')} className="selection-highlight" aria-hidden="true"/>
          <ul ref={bind('resultsList')} className="results-list" id="__cmd_bar_results__" role="listbox">
            {model.items.map((item, index) => item.type === 'AI' ? null : <ResultRow key={api.key(item)} item={item} index={index} model={model} api={api}/>)}
            {model.empty && !ai && !model.items.length && <li className="result-item empty-state">No matching tabs, history, actions, or definitions</li>}
          </ul>
        </div></div>
      </div></div>
      {model.answer && model.items.length > 1 && <button className="answer-results-toggle" type="button" aria-expanded={expanded || model.selectedIndex > 0}
        onClick={() => { const wasExpanded = expanded || model.selectedIndex > 0; if (model.selectedIndex > 0) api.collapse?.(); setExpanded(!wasExpanded); }}> {expanded || model.selectedIndex > 0 ? 'Hide Results' : 'Show Results'} </button>}
    </div>
  </div>;
}
function mount(shadow, options) {
  const mountPoint = shadow.ownerDocument.createElement('div');
  shadow.appendChild(mountPoint);
  const root = createRoot(mountPoint);
  const refs = {};
  const api = { ...options, rows: new Map(), icons: new Map() };
  let model = { items: [], query: '', selectedIndex: 0, empty: false };
  let disposed = false;
  function paint() { if (!disposed) flushSync(() => root.render(<Shell model={model} api={api} refs={refs}/>)); }
  paint();
  refs.backdrop.setAttribute('aria-hidden', 'true');
  refs.backdrop.inert = true;
  refs.selectionHighlight.hidden = true;
  return {
    refs, rows: api.rows,
    update(next) {
      model = { ...model, ...next };
      model.answer = ['CALC', 'DEF'].includes(model.items[0]?.type);
      const keys = new Set(model.items.map(api.key));
      for (const key of api.icons.keys()) if (!keys.has(key)) api.icons.delete(key);
      paint();
    },
    updateIcon(key, src) { if (api.rows.has(key)) { api.icons.set(key, src); paint(); } },
    clear() { api.icons.clear(); model = { ...model, items: [], empty: false, answer: false }; paint(); },
    dispose() { if (disposed) return; disposed = true; flushSync(() => root.unmount()); api.rows.clear(); api.icons.clear(); mountPoint.remove(); }
  };
}
window.CommandBarView = { mount, createDecorations, createCaretAura };
