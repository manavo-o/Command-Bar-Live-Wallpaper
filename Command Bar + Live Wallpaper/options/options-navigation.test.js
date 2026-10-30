const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('options/options-bootstrap.js','utf8');
function setup() {
  const specs = [{name:'wallpaper',title:'Wallpaper Library',cards:['Upload wallpaper']},{name:'widgets',title:'Widgets',cards:['Clock Date','Weather Location Units','Focus Work Break']},{name:'commandbar',title:'Command Bar',cards:['Search Suggestions','Keyboard Shortcut']}];
  const panes = specs.map(spec => ({ id:'pane-'+spec.name, dataset:{}, cards:spec.cards.map(textContent=>({textContent,dataset:{}})),
    querySelector:()=>({textContent:spec.title}), querySelectorAll(){return this.cards;} }));
  const navItems=specs.map(spec=>({dataset:{section:spec.name},classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
  const settingsSearch={value:''}, empty={hidden:true};
  const context=vm.createContext({panes,navItems,settingsSearch,document:{getElementById:()=>empty,querySelectorAll:()=>[],body:{classList:{toggle(){}}}}});
  vm.runInContext(source.slice(source.indexOf("  let selectedSection = 'wallpaper';"),source.indexOf('  navItems.forEach(button => button.addEventListener')),context);
  return {panes,navItems,settingsSearch,empty,context};
}
test('settings search switches from a nonmatching active section to the matching settings',()=>{
  const h=setup();h.settingsSearch.value='weather';h.context.selectSection('wallpaper');
  assert.equal(h.panes[0].hidden,true);assert.equal(h.panes[1].hidden,false);assert.equal(h.navItems[1].hidden,false);
  assert.equal(h.panes[1].cards[0].dataset.filterHidden,'true');assert.equal(h.panes[1].cards[1].dataset.filterHidden,'false');
});
test('no matches is explicit, and clearing search restores navigation and groups',()=>{
  const h=setup();h.settingsSearch.value='zzzzmissing';h.context.selectSection('widgets');
  assert.equal(h.empty.hidden,false);assert.ok(h.panes.every(p=>p.hidden));
  h.settingsSearch.value='';h.context.selectSection('wallpaper');
  assert.equal(h.empty.hidden,true);assert.ok(h.navItems.every(button=>!button.hidden));assert.ok(h.panes.every(p=>p.cards.every(card=>card.dataset.filterHidden==='false')));
});
test('save helper announces errors and preserves callbacks for existing settings flows',()=>{
  const status={textContent:'',classList:{toggle(){}}};let called=0;
  const chrome={runtime:{lastError:{message:'quota'}},storage:{local:{set(value,cb){cb();}}}};
  const ctx=vm.createContext({saveStatus:status,chrome});
  vm.runInContext(source.slice(source.indexOf('  function announceSave'),source.indexOf("  document.addEventListener('change'")),ctx);
  ctx.saveSettings({showWidgetClock:false},()=>called++);
  assert.equal(called,1);assert.ok(status.textContent.includes('Could not save'));
  chrome.runtime.lastError=null;ctx.saveSettings({showWidgetClock:true});assert.equal(status.textContent,'Saved');
});
