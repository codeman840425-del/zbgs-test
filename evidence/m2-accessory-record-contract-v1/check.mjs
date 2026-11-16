// Actual Node imports and committed resource bytes. No browser or transactions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'../..'),out=import.meta.dirname;
const modulePath=path.join(root,'prototype/src/accessory-recipe.js');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const initial=await fs.readFile(modulePath),checks=[],rejections=[],findings=[],resources=[];
let networkCalls=0;
const previousFetch=globalThis.fetch;
globalThis.fetch=()=>{networkCalls++;throw Error('Network forbidden in pure contract CPU review');};
const report={status:'running',moduleSHA256:sha(initial),checks,rejections,findings,resources,
  scope:'Direct actual accessory-recipe and hair catalog Node modules. Input record/actor-state fixtures exercise pure contracts only. No transaction, resource loading, browser, rendering or runtime acceptance.',
  GPUUsed:false,browserStarted:false,transactionsTested:false,runtimeAccepted:false};
const check=async(name,fn)=>{
  try{await fn();checks.push({name,passed:true});}
  catch(error){checks.push({name,passed:false});findings.push({case:name,error:error.stack});}
};
const reject=(name,fn)=>{assert.throws(fn);rejections.push(name);};
async function bytes(name,expected){
  const raw=await fs.readFile(path.join(root,name));
  const digest=sha(raw);if(expected)assert.equal(digest,expected,name);
  resources.push({path:name,bytes:raw.length,sha256:digest});return raw;
}
const diskJson=async(name,expected)=>JSON.parse(await bytes(name,expected));
const urlPath=url=>{assert(url.startsWith('/assets/'));return'prototype/public'+url;};
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
try{
  const m=await import(pathToFileURL(modulePath));
  const hairModule=await import(pathToFileURL(path.join(root,'prototype/src/hair-fit-contract.js')));
  const female='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
  const male='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
  const derived='968a9d997683cd99de4eea8f77965184eea6d7bc639a6ae062085928325189d8';
  const none=body=>({ears:m.accessorySelection(body,'ears','none'),hat:m.accessorySelection(body,'hat','none')});
  const hat=()=>({...none(female),hat:m.accessorySelection(female,'hat','single')});
  const neutral={mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none'};
  const hair=hairModule.hairEntry(female,'female-ponytail-v1');
  const descriptor={hairStyle:hair.id,replacementSHA256:hair.assetSha256,hairFit:hairModule.hairFitIdentity(hair),hairManifestSha256:hair.manifestSha256};

  await check('manifest constants and actual resource/fit/dependency bytes agree',async()=>{
    const ear=await diskJson('prototype/public/assets/m2-paired-ear-accessory-v1/manifest.json',m.EAR_MANIFEST_SHA);
    await bytes('prototype/public/assets/m2-paired-ear-accessory-v1/'+ear.asset.file,ear.asset.sha256);
    for(const ref of ear.fits){
      const fit=await diskJson('prototype/public/assets/m2-paired-ear-accessory-v1/'+ref.file,ref.sha256);
      assert.equal(fit.fitId,ref.fitId);assert.equal(fit.baseAvatarSha256,ref.baseAvatarSha256);assert.equal(fit.assetSha256,ear.asset.sha256);
      assert.deepEqual(fit.mounts.map(x=>x.side).sort(),['left','right']);
    }
    const manifest=await diskJson('prototype/public/assets/m2-hat-hair-v1/manifest.json',m.HAT_MANIFEST_SHA);
    await bytes(urlPath(manifest.url),manifest.sha256);
    const fit=await diskJson(urlPath(manifest.fit.url),manifest.fit.sha256);
    assert.equal(fit.id,manifest.fit.id);assert.equal(fit.assetSha256,manifest.sha256);assert.equal(fit.targetBodySha256,female);
    const dependency=fit.hairDependency;
    await bytes(dependency.path,dependency.sha256);
    const hairManifest=await diskJson(dependency.manifestPath,dependency.manifestSha256);
    const hairFit=await diskJson(dependency.fitPath,dependency.fitSha256);
    assert.equal(hairManifest.version,2);assert.equal(hairFit.version,2);assert.equal(hairManifest.id,hair.id);
    await bytes(urlPath(hairManifest.url),dependency.sha256);await bytes(urlPath(hairManifest.fit.url),dependency.fitSha256);
    assert.equal(hair.assetSha256,dependency.sha256);assert.equal(hair.manifestSha256,dependency.manifestSha256);
    assert.equal(hair.fit.sha256,dependency.fitSha256);
  });
  await check('original female/male none and left/right/pair ears use exact per-body fit',()=>{
    for(const body of [female,male]){
      assert.equal(m.validateAccessories(body,none(body)),true);
      const query=m.queryAccessoryCandidates(body);
      assert.deepEqual(query.ears.choices.map(x=>x.selection),['none','left','right','pair']);
      for(const selection of ['left','right','pair']){
        const value={...none(body),ears:m.accessorySelection(body,'ears',selection)};
        assert.equal(value.ears.selection,selection);assert.equal(m.validateAccessories(body,value),true);
        assert(value.ears.resource.fitId.includes(body===female?'female':'male'));
      }
    }
    assert.deepEqual(m.queryAccessoryCandidates(male).hat.choices.map(x=>x.selection),['none']);
    assert.deepEqual(m.queryAccessoryCandidates(derived).hat.choices.map(x=>x.selection),['none']);
    reject('male hat rejected',()=>m.accessorySelection(male,'hat','single'));
    reject('derived hat rejected',()=>m.accessorySelection(derived,'hat','single'));
    reject('derived ears rejected',()=>m.accessorySelection(derived,'ears','pair'));
  });
  await check('original female hat requires exact ponytail and neutral geometry',()=>{
    const value=hat();assert.equal(m.validateAccessories(female,value),true);
    m.assertAccessoryHair(female,value,descriptor);m.assertAccessoryGeometry(female,value,neutral);
    for(const patch of [{hairStyle:'original'},{replacementSHA256:'0'.repeat(64)},{hairFit:{...descriptor.hairFit,version:1}},
      {hairFit:{...descriptor.hairFit,sha256:'0'.repeat(64)}},{hairManifestSha256:'0'.repeat(64)}])
      reject('incompatible hat hair '+Object.keys(patch)[0],()=>m.assertAccessoryHair(female,value,{...descriptor,...patch}));
    for(const [key,bad] of [['mouthWidth',.04],['browSample','changed'],['noseSample','changed'],['eyeSample','changed']])
      reject('hat nonneutral '+key,()=>m.assertAccessoryGeometry(female,value,{...neutral,[key]:bad}));
    reject('hat missing neutral geometry fields',()=>m.assertAccessoryGeometry(female,value,{}));
    reject('male cannot reuse female hat record',()=>m.validateAccessories(male,value));
    reject('derived cannot reuse female hat record',()=>m.validateAccessories(derived,value));
  });
  await check('unknown/missing fields, unsupported selections and resource versions reject',()=>{
    const base=hat();
    for(const key of ['ears','hat']){
      const missing=structuredClone(base);delete missing[key];reject('missing '+key,()=>m.validateAccessories(female,missing));
      for(const field of ['selection','resource']){
        const value=structuredClone(base);delete value[key][field];reject('missing '+key+'.'+field,()=>m.validateAccessories(female,value));
      }
    }
    const extra=structuredClone(base);extra.unknown={};reject('unknown top field',()=>m.validateAccessories(female,extra));
    const bad=structuredClone(base);bad.hat.selection='pair';reject('unsupported hat selection',()=>m.validateAccessories(female,bad));
    for(const kind of ['ears','hat']){
      const value=kind==='hat'?hat():{...none(female),ears:m.accessorySelection(female,'ears','left')};
      for(const key of Object.keys(value[kind].resource)){
        const missing=structuredClone(value);delete missing[kind].resource[key];reject('missing '+kind+'.resource.'+key,()=>m.validateAccessories(female,missing));
      }
      const version=structuredClone(value);version[kind].resource.version=999;reject('bad '+kind+' version',()=>m.validateAccessories(female,version));
      const identity=structuredClone(value);identity[kind].resource.fitSha256='0'.repeat(64);reject('bad '+kind+' fit SHA',()=>m.validateAccessories(female,identity));
      const unknown=structuredClone(value);unknown[kind].resource.unknown=1;reject('unknown '+kind+' resource field',()=>m.validateAccessories(female,unknown));
    }
    const unselected=none(female);unselected.hat.resource={};reject('none carrying resource',()=>m.validateAccessories(female,unselected));
  });
  await check('query and validation are network-free, return independent metadata and preserve inputs',()=>{
    const value=freeze(hat()),input=JSON.stringify(value);assert.equal(m.validateAccessories(female,value),true);
    const hairInput=freeze(structuredClone(descriptor)),geometry=freeze(structuredClone(neutral));
    m.assertAccessoryHair(female,value,hairInput);m.assertAccessoryGeometry(female,value,geometry);
    assert.equal(JSON.stringify(value),input);assert.deepEqual(hairInput,descriptor);assert.deepEqual(geometry,neutral);
    const expected=m.queryAccessoryCandidates(female),changed=m.queryAccessoryCandidates(female);
    changed.ears.choices[1].resource.version=999;changed.hat.dependency.hair.sha256='0'.repeat(64);
    assert.deepEqual(m.queryAccessoryCandidates(female),expected);
    assert.equal(networkCalls,0);
  });
  await check('capture uses actual selection identities and refuses pending or mismatched states',()=>{
    const value=hat();
    const earsState={status:'ready',selection:'pair',assetSha256:m.accessorySelection(female,'ears','pair').resource.assetSha256,
      fitId:m.accessorySelection(female,'ears','pair').resource.fitId};
    const hatState={status:'ready',selection:'single',assetSha256:value.hat.resource.assetSha256,fitId:value.hat.resource.fitId};
    const actor={profile:{sha256:female},rigidAccessories:{getState:()=>earsState},headwear:{getState:()=>hatState}};
    assert.equal(m.validateAccessories(female,m.captureAccessories(actor)),true);
    for(const status of ['loading','prepared']){hatState.status=status;reject('capture '+status,()=>m.captureAccessories(actor));}
    hatState.status='ready';hatState.fitId='wrong';reject('capture mismatched fit',()=>m.captureAccessories(actor));
    assert.equal(networkCalls,0);
  });
  report.sourceStableDuringRun=sha(await fs.readFile(modulePath))===report.moduleSHA256;
  assert(report.sourceStableDuringRun,'Root module changed during review; rerun against one snapshot');
  report.networkCalls=networkCalls;report.status=findings.length?'findings':'passed';
}catch(error){report.status='failed';report.error=error.stack;}
finally{
  globalThis.fetch=previousFetch;
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if(report.status!=='passed')process.exitCode=1;
