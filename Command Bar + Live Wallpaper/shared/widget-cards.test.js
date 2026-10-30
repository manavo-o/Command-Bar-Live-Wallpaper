const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const widgets = require('./widget-cards');

test('appearance and lock validation safely defaults malformed and unknown values',()=>{
  const config=widgets.sanitizeAppearance({clock:{variant:'bogus',size:'gigantic',surface:'none',accent:'mint'},weather:null});
  assert.deepEqual(config.clock,{variant:'glass',size:'medium',surface:'none',accent:'mint'});
  assert.equal(widgets.sanitizeAppearance({clock:{variant:{toString:null},size:[],accent:12}}).clock.variant,'glass');
  assert.equal(config.focus.variant,'ring');assert.equal(config.weather.variant,'glass');
  assert.deepEqual(widgets.sanitizeAppearance(null),widgets.sanitizeAppearance([]));
  assert.deepEqual(widgets.sanitizeLocks({clock:true,weather:'true',focus:1,quote:false,unknown:true}),{clock:true,weather:false,focus:false,quote:false});
});
test('all sixteen layouts apply equally to live widgets and previews without replacing live elements',()=>{
  const dom=new JSDOM('<div id="live">'+Object.keys(widgets.variants).map(kind=>`<section data-widget-card="${kind}"></section>`).join('')+'</div><div data-widget-preview>'+Object.keys(widgets.variants).map(kind=>`<section data-widget-card="${kind}"></section>`).join('')+'</div>');
  const d=dom.window.document;widgets.render(d);
  let count=0;
  Object.entries(widgets.variants).forEach(([kind,variants])=>{
    const original=d.querySelector(`#live [data-widget-card="${kind}"] .widget-content`);
    Object.keys(variants).forEach(variant=>{
      widgets.applyAppearance(d,{[kind]:{variant,size:'large',surface:'default',accent:'rose'}});
      const [live,preview]=d.querySelectorAll(`[data-widget-card="${kind}"]`);
      assert.deepEqual({...live.dataset},{...preview.dataset});
      assert.equal(live.querySelector('.widget-content'),original);count++;
    });
  });
  assert.equal(count,16);
  const ids=[...d.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length);
  assert.ok([...d.querySelectorAll('[data-widget-preview] button')].every(button=>button.disabled));dom.window.close();
});
test('analog hands reflect the minute and date-only visibility; long single-line quotes expand accessibly',()=>{
  const dom=new JSDOM('<section data-widget-card="clock"></section><section data-widget-card="quote"></section>');
  const d=dom.window.document;widgets.render(d);widgets.applyAppearance(d,{clock:{variant:'analog'},quote:{variant:'line'}});
  const clock=d.querySelector('[data-widget-card="clock"]');widgets.updateClock(clock,new Date(2026,0,1,15,30));
  assert.equal(clock.style.getPropertyValue('--hour-angle'),'105deg');assert.equal(clock.style.getPropertyValue('--minute-angle'),'180deg');
  widgets.updateClock(clock,new Date(),false);assert.equal(clock.querySelector('.analog-clock').hidden,true);
  const text=d.getElementById('quote-text');text.textContent='A very long quote '.repeat(100);
  const button=d.querySelector('.quote-expand');assert.equal(button.hidden,false);button.click();
  assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(text.textContent.length,1800);
  button.click();assert.equal(button.getAttribute('aria-expanded'),'false');
  widgets.applyAppearance(d,{quote:{variant:'editorial'}});assert.equal(button.hidden,true);dom.window.close();
});
