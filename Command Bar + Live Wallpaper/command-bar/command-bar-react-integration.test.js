const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
async function harness(suggestions = false) {
  const dom = new JSDOM('<!doctype html><body><p>Host page</p></body>', { url:'https://host.example/', runScripts:'outside-only', pretendToBeVisual:true });
  const pendingSuggestions = [];
  const w = dom.window, messages = [], errors = []; let listener, view, capturedHostKeys = 0;
  w.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  w.document.addEventListener('keydown', () => { capturedHostKeys++; }, true);
  w.matchMedia = () => ({ matches:true, addEventListener() {}, removeEventListener() {} });
  w.chrome = { runtime: { id:'test', getURL:file=>'https://extension.example/'+file,
    onMessage: { addListener(fn) { listener=fn; } },
    sendMessage(message, callback) {
      messages.push(message);
      if (message.type === 'FETCH_SUGGESTIONS' && suggestions) { pendingSuggestions.push(callback); return; }
      const response = message.type === 'GET_SHORTCUT' ? {shortcut:'Command+K'} :
        message.type === 'QUERY_TABS' ? {tabs:[]} : message.type === 'QUERY_HISTORY' ? {history:[]} :
        message.type === 'QUERY_BOOKMARKS' ? {bookmarks:[]} : {suggestions:[]};
      callback?.(response);
    } }, storage: { onChanged:{addListener(){}}, local: { get(keys, callback) { callback({commandBarSuggestionsEnabled:suggestions}); }, set(){} } } };
  const scripts = ['shared/search-engines.js','command-bar/command-bar-results.js','command-bar/fuzzy-search.js','command-bar/calculator-parser.js','command-bar/command-bar-history.js','command-bar/query-intent.js','overlay-search.js','command-bar/math-renderer.js','overlay-card.js','command-bar/command-bar-view.bundle.js'];
  for (const file of scripts) w.eval(fs.readFileSync(file,'utf8'));
  const mount = w.CommandBarView.mount, decorate = w.CommandBarView.createDecorations;
  w.CommandBarView.mount = (...args) => { view = mount(...args); return view; };
  w.CommandBarView.createDecorations = options => {
    options.frame.contentWindow.ResizeObserver = class { observe(){} disconnect(){} };
    options.frame.contentWindow.HTMLElement.prototype.scrollIntoView = function() {};
    return decorate(options);
  };
  w.eval(fs.readFileSync('command-bar/command-bar-bootstrap.js','utf8'));
  view.refs.input.getRootNode().querySelector('link').dispatchEvent(new w.Event('load'));
  listener({action:'TOGGLE_OVERLAY'}, {}, () => {});
  await new Promise(resolve => setImmediate(resolve));
  return {dom,w,view,messages,errors,listener,pendingSuggestions,get capturedHostKeys(){return capturedHostKeys;}};
}
test('real React/controller integration keeps typing in the iframe and ignores IME intermediate input and Enter', async () => {
  const h = await harness(), input=h.view.refs.input, fw=input.ownerDocument.defaultView;
  const before = h.messages.length;
  input.dispatchEvent(new fw.CompositionEvent('compositionstart', {bubbles:true}));
  input.value='1+1'; input.dispatchEvent(new fw.InputEvent('input',{bubbles:true,isComposing:true}));
  input.dispatchEvent(new fw.KeyboardEvent('keydown',{bubbles:true,key:'Enter',isComposing:true}));
  assert.equal(h.messages.length,before); assert.equal(h.capturedHostKeys,0);
  input.dispatchEvent(new fw.CompositionEvent('compositionend',{bubbles:true}));
  assert.ok(h.view.refs.resultsList.textContent.includes('2'));
  assert.equal(h.view.refs.modalBox.dataset.answer,'true'); assert.equal(h.view.refs.input,input);
  h.listener({action:'TOGGLE_OVERLAY'}, {}, () => {});
  assert.equal(h.view.rows.size,0); assert.equal(input.value,'');
  h.listener({action:'TOGGLE_OVERLAY'}, {}, () => {});
  assert.equal(h.view.refs.input,input); assert.deepEqual(h.errors,[]);
  h.w.dispatchEvent(new h.w.PageTransitionEvent('pagehide',{persisted:false})); h.dom.window.close();
});

function type(h, text) {
  const input = h.view.refs.input, fw = input.ownerDocument.defaultView;
  input.value = text; input.dispatchEvent(new fw.InputEvent('input', {bubbles:true}));
}
function key(h, name, options = {}) {
  const input = h.view.refs.input, fw = input.ownerDocument.defaultView;
  input.dispatchEvent(new fw.KeyboardEvent('keydown', {bubbles:true,key:name,...options}));
}
function dispose(h) { h.w.dispatchEvent(new h.w.PageTransitionEvent('pagehide',{persisted:false})); h.dom.window.close(); }
test('AI lives in the input, hides its empty result surface, and submits through browser default', async () => {
  for (const method of ['button','enter','shift']) {
    const h = await harness(); type(h, 'what is light');
    assert.equal(h.view.refs.resultsList.children.length,0);
    assert.equal(h.view.refs.resultsPanel.hidden,true);
    assert.equal(h.view.refs.modalBox.dataset.ai,'true');
    const button = h.view.refs.inputWrapper.querySelector('.ai-submit');
    assert.equal(button.getAttribute('aria-label'),'Ask AI'); assert.ok(button.querySelector('svg'));
    if (method === 'button') button.click(); else key(h,'Enter',{shiftKey:method === 'shift'});
    if (method === 'shift') assert.ok(h.messages.some(x=>x.type==='CREATE_TAB' && x.url==='https://www.google.com/search?q=what%20is%20light'));
    else assert.ok(h.messages.some(x=>x.type==='SEARCH_QUERY' && x.text==='what is light'));
    dispose(h);
  }
});
test('AI suggestions retain original indices, selection IDs, and execution; stale responses cannot restore AI', async () => {
  const h = await harness(true); type(h,'what is light');
  await new Promise(resolve=>setTimeout(resolve,120));
  h.pendingSuggestions.shift()({suggestions:['what is light made of','what is light speed']});
  assert.equal(h.view.refs.resultsPanel.hidden,false);
  assert.equal(h.view.refs.resultsList.children.length,2);
  key(h,'ArrowDown');
  assert.equal(h.view.refs.input.getAttribute('aria-activedescendant'),'__cmd_result_1');
  assert.equal(h.view.refs.resultsList.children[0].getAttribute('aria-selected'),'true');
  key(h,'Enter'); assert.ok(h.messages.some(x=>x.type==='SEARCH_QUERY' && x.text==='what is light made of'));
  h.listener({action:'TOGGLE_OVERLAY'}, {}, () => {});
  type(h,'what is sound'); await new Promise(resolve=>setTimeout(resolve,120));
  const late = h.pendingSuggestions.shift(); type(h,'1+1'); late({suggestions:['what is sound speed']});
  assert.equal(h.view.refs.modalBox.dataset.ai,undefined);
  assert.equal(h.view.refs.inputWrapper.querySelector('.ai-submit'),null);
  assert.equal(h.view.refs.modalBox.dataset.answer,'true');
  assert.deepEqual(h.errors,[]); dispose(h);
});

test('plain Enter opens a typed domain directly even before old results finish updating', async () => {
  const h = await harness(); type(h,'1+1'); type(h,'gmail.com'); key(h,'Enter');
  assert.ok(h.messages.some(x=>x.type==='CREATE_TAB' && x.url==='https://gmail.com/' && x.visitKind==='typed'));
  assert.equal(h.messages.some(x=>x.type==='CREATE_TAB' && x.url.includes('google.com/search')),false);
  dispose(h);
});
