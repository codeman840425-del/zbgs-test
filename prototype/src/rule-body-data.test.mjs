import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FOUNDATION_PROFILES,foundationProfile,initializeRuleBodyData} from './foundation-profiles.js';
import {createRuleBodyRegistry} from './rule-body-data.js';
import {productionRuleBodyPointers,validateCharacterRecordInput} from './character-record-input.js';

const source=name=>readFile(new URL('../../'+name,import.meta.url));
const bytes=value=>Buffer.from(JSON.stringify(value));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pin=(path,b)=>({path,sha256:hash(b),bytes:b.length});

// Reconstruct the publisher wire format from committed real model, equipment,
// production recipe and first-reception evidence. No dependence on local output/.
async function example(label) {
  const fitBytes=await source('evidence/m2-first-rule-delivery-v1/fit/'+label+'.json');
  const fit=JSON.parse(fitBytes), id=fit.bodyType;
  const profile=FOUNDATION_PROFILES[id], store=new Map(), metadata='/character-data/'+id+'/';
  const catalog=await source('prototype/public'+profile.manifestUrl);
  const files=new Map([
    ['profile.json',bytes(profile)],['recipe.json',await source('assets-source/rule-body-recipe-v1/'+label+'.json')],
    ['fit.json',fitBytes],[profile.manifestUrl.slice(1),catalog],
    [profile.url.slice(1),await source('prototype/public'+profile.url)],
  ]);
  for (const row of JSON.parse(catalog).items) files.set(row.url.slice(1),await source('prototype/public'+row.url));
  function publish(change=()=>{}) {
    const payloads=new Map(files);
    const index={schema:'shape-data-pack-v1',bodyType:id,templateSha256:fit.templateSha256,
      sourceBodySha256:fit.sourceBodySha256,recipeSha256:fit.recipeSha256};
    change(index,payloads);
    index.files=[...payloads].map(([name,b])=>pin(name,b));
    for (const key of ['profile','recipe','fit']) index[key]=index.files.find(row=>row.path===key+'.json');
    for (const [name,b] of payloads) store.set(name.startsWith('assets/')?'/'+name:metadata+name,b);
    const raw=bytes(index),url=metadata+'index.json';
    store.set(url,raw);
    return {bodyType:id,url,sha256:hash(raw),bytes:raw.length};
  }
  return {id,profile,store,publish,readBytes:async url=>{
    assert(store.has(url),'Unexpected resource '+url);return store.get(url);
  }};
}

test('independent catalogs, atomic batch install/retry and intersecting lifetimes',async()=>{
  const [a,b]=await Promise.all(['candidate','control'].map(example));
  const [pa,pb]=[a.publish(),b.publish()];
  const catalog={}, registry=createRuleBodyRegistry();
  const combined=new Map([...a.store,...b.store]);
  const readBytes=async url=>combined.get(url);
  const missing=b.profile.url;
  combined.delete(missing);
  await assert.rejects(registry.initialize(catalog,[pa,pb],{readBytes}),/payload mismatch/);
  assert.deepEqual(Object.keys(catalog),[]);
  combined.set(missing,b.store.get(missing));
  const [pair,single]=await Promise.all([registry.initialize(catalog,[pa,pb],{readBytes}),registry.initialize(catalog,[pa],{readBytes})]);
  assert.deepEqual(pair.bodyTypes,[a.id,b.id]);assert.deepEqual(catalog[a.id],a.profile);
  assert(registry.hasSha(a.profile.sha256));assert(registry.hasSha(b.profile.sha256));
  await assert.rejects(registry.initialize(catalog,[{...pa,sha256:'a'.repeat(64)}],{readBytes}),/changed publication/);
  await assert.rejects(registry.initialize(catalog,[{...pa,bytes:pa.bytes+1}],{readBytes}),/changed publication/);
  assert.throws(()=>{catalog[a.id].ids.top='another-item';},TypeError);
  pair.dispose();pair.dispose();assert.deepEqual(Object.keys(catalog),[a.id]);assert(!registry.hasSha(b.profile.sha256));
  single.dispose();assert.deepEqual(Object.keys(catalog),[]);assert(!registry.hasSha(a.profile.sha256));
  const absent=()=>{throw Error('Unexpected fetch');};
  await assert.rejects(initializeRuleBodyData([pa],{readBytes:absent}),/existing profile/);
  assert.equal(foundationProfile(a.id).sha256,a.profile.sha256);
});

test('a valid index digest cannot authorize extra paths, models, outfits or approval claims',async()=>{
  const sample=await example('candidate'), catalog={}, registry=createRuleBodyRegistry();
  const {readBytes,publish}=sample;
  const changeJson=(files,path,change)=>{
    const row=JSON.parse(files.get(path));change(row);files.set(path,bytes(row));
  };
  const cases=[
    [(index)=>index.templateSha256='a'.repeat(64),/index identity/],
    [(index)=>index.sourceBodySha256='a'.repeat(64),/index identity/],
    [(index)=>index.recipeSha256='a'.repeat(64),/recipe digest/],
    [(index)=>index.approved=true,/index identity/],
    [(_,files)=>files.set('evil.js',Buffer.from('unknown')),/payload count/],
    [(_,files)=>changeJson(files,'profile.json',profile=>profile.url='https://example.invalid/a.vrm'),/profile differs/],
    [(_,files)=>changeJson(files,'profile.json',profile=>profile.approved=true),/profile differs/],
    [(_,files)=>changeJson(files,'profile.json',profile=>profile.ids.top=profile.ids.shoes),/profile differs/],
    [(_,files)=>changeJson(files,'fit.json',fit=>fit.scope='approved'),/fit identity/],
    [(_,files)=>changeJson(files,'fit.json',fit=>fit.equipment.top.approved=true),/fit slot/],
    [(_,files)=>files.set(sample.profile.url.slice(1),Buffer.from('different model')),/content-addressed/],
  ];
  for (const [mutate,error] of cases)
    await assert.rejects(registry.initialize(catalog,[publish(mutate)],{readBytes}),error);
  const ptr=publish();
  const url='/character-data/'+sample.id+'/profile.json';
  const raw=sample.store.get(url);
  sample.store.set(url,Buffer.from(raw).fill(32,0,1));
  await assert.rejects(registry.initialize(catalog,[ptr],{readBytes}),/payload mismatch/);
  assert.deepEqual(catalog,{});
});

test('manifest selection is explicit, same-site and bound to the body ID',async()=>{
  const sample=await example('candidate'), ptr=sample.publish();
  const entry={id:'aa',url:'/records/aa.json',recordSha256:'0'.repeat(64)};
  const manifest={schema:'character-record-input-v1',entries:[entry]};
  assert.deepEqual(validateCharacterRecordInput(manifest,'/records/manifest.json'),[entry]);
  for (const url of ['https://example.invalid/index.json','//example.invalid/index.json','/assets/a.js',
    '/character-data/../index.json',ptr.url+'?code=1'])
    assert.throws(()=>validateCharacterRecordInput({...manifest,ruleBodyDataPacks:[{...ptr,url}]},'/records/manifest.json'),/pointer/);
  assert.throws(()=>productionRuleBodyPointers({schema:'published-rule-body-packs-v1',ruleBodyDataPacks:[ptr,ptr]}),/duplicate/);
  assert.throws(()=>productionRuleBodyPointers({schema:'published-rule-body-packs-v1',approved:true,ruleBodyDataPacks:[ptr]}),/Invalid/);
  assert.throws(()=>foundationProfile('__proto__'),/Unknown foundation/);
  assert.deepEqual(productionRuleBodyPointers({schema:'published-rule-body-packs-v1',ruleBodyDataPacks:[ptr]}),[ptr]);
});

test('browser byte reader pins response length and rejects a redirected or oversized resource',async t=>{
  const sample=await example('control'),ptr=sample.publish(),catalog={},registry=createRuleBodyRegistry();
  const calls=[];
  let fault='redirect';
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'same-origin');
    assert(sample.store.has(url));calls.push(url);
    if (url===ptr.url && fault==='redirect') throw new TypeError('redirect rejected');
    const b=sample.store.get(url);
    return new Response(url===ptr.url && fault==='length'?Buffer.concat([b,Buffer.from(' ')]):b);
  });
  await assert.rejects(registry.initialize(catalog,[ptr]),/redirect rejected/);
  fault='length';
  await assert.rejects(registry.initialize(catalog,[ptr]),/Oversize/);
  assert.deepEqual(Object.keys(catalog),[]);
  fault=null;
  const registration=await registry.initialize(catalog,[ptr]);
  assert.equal(catalog[sample.id].sha256,sample.profile.sha256);
  assert.equal(new Set(calls).size,9);
  registration.dispose();
});
