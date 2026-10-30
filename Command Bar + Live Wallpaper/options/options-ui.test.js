const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function harness(initial={},hash='') {
  const dom=new JSDOM(fs.readFileSync('options.html','utf8'),{url:'https://extension.test/options.html'+hash,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,changes=new Set(),state={...initial},writes=[];
  w.matchMedia=()=>({matches:true,addEventListener(){}});
  w.chrome={runtime:{getManifest:()=>({version:'test'})},storage:{local:{get(keys,cb){cb({...(!Array.isArray(keys)?keys:{}),...state});},set(value,cb){writes.push(value);Object.assign(state,value);changes.forEach(fn=>fn(Object.fromEntries(Object.entries(value).map(([k,newValue])=>[k,{newValue}])),'local'));cb?.();}},onChanged:{addListener:fn=>changes.add(fn)}}};
  w.WallpaperDB={getWallpaperBlob:()=>Promise.resolve(null)};
  w.URL.createObjectURL=()=>'';
  for(const file of ['shared/storage-keys.js','shared/storage-defaults.js','shared/storage.js','shared/search-engines.js','shared/widget-layout.js','shared/widget-cards.js','options/options-bootstrap.js']) w.eval(fs.readFileSync(file,'utf8'));
  const click=id=>d.getElementById(id).click();
  const toggle=(id,value)=>{d.getElementById(id).checked=value;d.getElementById(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,d,state,writes,click,toggle,close:()=>dom.window.close()};
}
test('five sections load, legacy links open the correct Wallpaper disclosure and filtering reveals dependent controls',()=>{
  const h=harness({},'#rotation');
  assert.equal(h.d.querySelectorAll('.nav-item').length,5);
  assert.equal(h.d.getElementById('pane-wallpaper').hidden,false);
  assert.equal(h.d.getElementById('wallpaper-rotation').open,true);
  assert.equal(h.d.getElementById('rotate-settings').dataset.dependentHidden,'true');
  const search=h.d.getElementById('settings-search');search.value='interval';search.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.d.body.classList.contains('settings-searching'),true);
  assert.equal(h.d.getElementById('wallpaper-rotation').open,true);
  assert.equal(h.d.getElementById('rotate-settings').dataset.filterHidden,'false');
  search.value='';search.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.d.body.classList.contains('settings-searching'),false);h.close();
});
test('shared preview follows visibility, format, timer duration and weather units without network requests',()=>{
  const h=harness(),preview=h.d.querySelector('[data-widget-preview]');
  assert.equal(preview.querySelector('[data-preview="weather"]').hidden,true);
  h.toggle('toggle-widget-weather',true);
  assert.equal(preview.querySelector('[data-preview="weather"]').hidden,false);
  h.d.querySelector('[data-units="c"]').click();
  assert.equal(h.d.getElementById('preview-weather-temp').textContent,'22°C');
  assert.match(h.d.getElementById('preview-weather-desc').textContent,/sample/);
  h.toggle('toggle-24hour',true);assert.equal(h.d.getElementById('preview-widget-clock').textContent,'21:41');
  h.toggle('toggle-widget-clock',false);assert.equal(h.d.getElementById('preview-widget-clock').hidden,true);
  assert.equal(preview.querySelector('[data-preview="clock"]').hidden,false);
  h.toggle('toggle-widget-date',false);assert.equal(preview.querySelector('[data-preview="clock"]').hidden,true);
  h.d.getElementById('input-focus-work').value='45';h.d.getElementById('input-focus-work').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(h.d.getElementById('preview-focus-time').textContent,'45:00');
  assert.equal(new Set([...h.d.querySelectorAll('[id]')].map(el=>el.id)).size,h.d.querySelectorAll('[id]').length);
  h.click('reset-dashboard-position');assert.equal(h.state.widgetLayout,null);assert.equal(h.state.dashboardPos,null);h.close();
});

test('sixteen design selectors and per-widget controls persist and update live previews',()=>{
  const h=harness({},'#widgets');
  assert.equal(h.d.querySelectorAll('.variant-option').length,16);
  h.d.querySelector('[data-kind="clock"][data-variant="centered"]').click();
  const size=h.d.getElementById('clock-size');size.value='large';size.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const surface=h.d.getElementById('clock-surface');surface.value='none';surface.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const accent=h.d.getElementById('clock-accent');accent.value='mint';accent.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.widgetAppearance.clock)),{variant:'centered',size:'large',surface:'none',accent:'mint'});
  const card=h.d.querySelector('[data-preview="clock"]');assert.equal(card.dataset.variant,'centered');assert.equal(card.dataset.material,'none');assert.equal(card.dataset.size,'large');
  assert.equal(h.d.querySelector('[data-kind="clock"][data-variant="centered"]').getAttribute('aria-pressed'),'true');h.close();
});
test('Options reset respects position locks and exports validated appearance and locks',()=>{
  const h=harness({widgetLayout:{version:1,cards:{clock:{x:.5,y:.5},weather:{x:.2,y:.2}}},widgetLocks:{clock:true},widgetAppearance:{clock:{variant:'analog'}}});
  h.click('reset-dashboard-position');
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.widgetLayout)),{version:1,cards:{clock:{x:.5,y:.5}}});
  let exported;
  h.w.HTMLAnchorElement.prototype.click=function(){exported=JSON.parse(decodeURIComponent(this.href.split(',')[1]));};h.click('btn-export');
  assert.equal(exported.widgetAppearance.clock.variant,'analog');assert.equal(exported.widgetLocks.clock,true);
  assert.equal(exported.widgetLocks.weather,false);h.close();
});
test('backup import validates new settings and restores variant controls and preview',()=>{
  const h=harness();
  const data={widgetAppearance:{clock:{variant:'inline',size:'large',surface:'none',accent:'mint'},weather:{variant:'invalid'}},widgetLocks:{clock:true,weather:'true'}};
  h.w.FileReader=class {readAsText(){this.result=JSON.stringify(data);this.onload();}};
  const input=h.d.getElementById('input-import');Object.defineProperty(input,'files',{value:[{}]});
  input.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert.equal(h.state.widgetAppearance.clock.variant,'inline');assert.equal(h.state.widgetAppearance.weather.variant,'glass');
  assert.equal(h.state.widgetLocks.clock,true);assert.equal(h.state.widgetLocks.weather,false);
  assert.equal(h.d.getElementById('clock-size').value,'large');assert.equal(h.d.querySelector('[data-preview="clock"]').dataset.variant,'inline');h.close();
});
