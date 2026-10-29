const test = require('node:test');
const assert = require('node:assert/strict');
const {create, correctedWord} = require('./background-dictionary');
const ok = data => ({ok:true,json:async()=>data});
const entry = word => ({word,entries:[{partOfSpeech:'adjective',senses:[{definition:'Feeling peaceful.'}],pronunciations:[{text:'/kɑːm/'}]}]});
test('spelling correction preserves exact words and limits guesses',()=>{
  assert.equal(correctedWord('calm',[{word:'calms'},{word:'calm'}]),'calm');
  assert.equal(correctedWord('beutiful',[{word:'beautiful'}]),'beautiful');
  assert.equal(correctedWord('xyzzzz',[{word:'beautiful'}]),'xyzzzz');
  assert.equal(correctedWord('cat',[{word:'cut'}]),'cat');
  assert.equal(correctedWord('ice cream',[{word:'ice creams'}]),'ice cream');
});
test('definition spelling is resolved before the dictionary request and disclosed',async()=>{
  const urls=[];
  const api=create(async url=>{urls.push(url);return ok(urls.length===1 ? [{word:'beautiful'}] : entry('beautiful'));});
  const data=await api.lookup('  Beutiful  ');
  assert.match(urls[0],/sp=beutiful/); assert.match(urls[1],/entries\/en\/beautiful$/);
  assert.equal(data.correctedFrom,'beutiful'); assert.equal(data.status,'success'); assert.equal(data.meanings[0].definitions[0].definition,'Feeling peaceful.');
});
test('synonyms use the corrected word, remove duplicate/self entries, and share cached requests',async()=>{
  const urls=[];
  const api=create(async url=>{urls.push(url);return ok(urls.length===1 ? [{word:'beautiful'}] : [{word:'lovely'},{word:'lovely'},{word:'beautiful'},{word:'pretty'}]);});
  const [a,b]=await Promise.all([api.lookup('beutiful','synonyms'),api.lookup('beutiful','synonyms')]);
  assert.equal(urls.length,2); assert.match(urls[1],/rel_syn=beautiful/); assert.deepEqual(a.synonyms,['lovely','pretty']); assert.equal(a,b);
  await api.lookup('beutiful','synonyms'); assert.equal(urls.length,2);
});
test('spelling service failure preserves input and still attempts the actual lookup',async()=>{
  const urls=[];
  const api=create(async url=>{urls.push(url);if(urls.length===1)throw new Error('offline');return ok(entry('calm'));});
  const data=await api.lookup('calm'); assert.equal(data.status,'success'); assert.equal(data.correctedFrom,''); assert.match(urls[1],/\/calm$/);
});
test('empty synonyms, service failures and invalid input have distinct safe outcomes',async()=>{
  const api=create(async()=>ok([]));
  assert.equal((await api.lookup('calm','synonyms')).status,'not_found');
  const offline=create(async()=>{throw new Error('offline');});
  assert.equal((await offline.lookup('calm','synonyms')).status,'unavailable');
  const invalid=create(async()=>{throw new Error('should not fetch');});
  assert.equal((await invalid.lookup('https://example.com')).status,'not_found');
});
