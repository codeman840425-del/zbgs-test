import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import imageCodecs from '../node_modules/playwright-core/lib/utilsBundle.js';
import {runtimePath} from '../../scripts/runtime-package/files.mjs';
import {collectRecordResources} from '../../scripts/runtime-package/record-resources.mjs';
import {fittedHeadAppearance,indexFittedHeadAppearances} from './fitted-head-appearance.js';
import glassesRegistry from './glasses-temple-fit-manifest.json' with {type:'json'};
import {updateCharacterRecord} from './character-record.js';

const hooks=registerHooks({load(url,context,next){
  return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
}});
const {THREE}=await import('../../scripts/headless-avatar-node.mjs');
const {prepareRecordedCharacter}=await import('./character-record-consumer.js');
const {performCharacterProduction}=await import('./character-production.js');
const {admitAppearanceCandidate,queryAppearanceCandidates}=await import('./appearance-candidates.js');
const {deriveCharacterResourceIdentities,restoreRuntimeCharacterRecord}=await import('./character-runtime-record.js');
test.after(()=>hooks.deregister());
const publicFile=path=>new URL('../public/'+path,import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL('../../'+path,import.meta.url)));
const currentPair=await load('evidence/m2-uniform-lite-operator-v1/records.json');
const [original,male]=currentPair;
const registration=fittedHeadAppearance(original.appearanceRecipe.base.sha256);
const [historic]=await load('evidence/m2-uniform-agent-handoff-v1/records.json');
const look={hairStyle:'female-bob-v1',hairColor:'blonde',eyeColor:'brown',lipColor:'coral'};

// The real loaders and palette functions consume RGBA bytes. Use the PNG
// decoder from the locked test runtime. The CPU canvas only copies pixels.
function imageTransport(t){
  t.mock.method(globalThis,'createImageBitmap',async blob=>{
    const bytes=Buffer.from(await blob.arrayBuffer());
    if(bytes.readUInt32BE(0)!==0x89504e47)return {width:1,height:1,close(){}};
    let pixels;
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){},
      get pixels(){return pixels??=imageCodecs.PNG.sync.read(bytes).data;}};
  });
  const previous=globalThis.document;
  globalThis.document={createElement(tag){
    assert.equal(tag,'canvas');
    const canvas={};
    const ctx={
      clearRect(){canvas.pixels=null;},
      drawImage(source){assert.equal(source.width,canvas.width);assert.equal(source.height,canvas.height);
        canvas.pixels=new Uint8ClampedArray(source.pixels);},
      getImageData(){return {data:canvas.pixels.slice()};},
      putImageData(image){canvas.pixels=image.data.slice();},
    };
    canvas.getContext=()=>ctx;
    return canvas;
  }};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
}

async function closure(record){
  const files=new Set();
  await collectRecordResources({record,sourceRoot:fileURLToPath(new URL('../../',import.meta.url)),
    async add(url,_reason,{parent,sha256,bytes:size}){
      const name=runtimePath(url,parent),bytes=await readFile(publicFile(name));
      if(sha256)assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);
      if(size)assert.equal(bytes.length,size);
      files.add('/'+name);
      return {path:name,bytes,value:name.endsWith('.json')?JSON.parse(bytes):null};
    }});
  return files;
}

const env=()=>({scene:new THREE.Scene(),renderer:{compileAsync(){throw Error('Unexpected GPU compilation');}}});
test('fitted head data selects a second exact body and rejects ambiguous or crossed registrations',()=>{
  const second=structuredClone(registration);
  second.bodySha256='c'.repeat(64);
  second.hair.compatibleBodies=[second.bodySha256];
  second.hair.fit.id='fixture-second-fit';
  const index=indexFittedHeadAppearances([registration,second]);
  assert.equal(index.get(second.bodySha256).hair.fit.id,'fixture-second-fit');
  assert.equal(index.get(registration.bodySha256),registration);
  assert.equal(fittedHeadAppearance(second.bodySha256),undefined);
  assert.throws(()=>indexFittedHeadAppearances([registration,registration]),/duplicate/);
  assert.throws(()=>indexFittedHeadAppearances([{...registration,hair:second.hair}]),/Invalid/);
});
test('create, sign and cold restore the exact lightweight bob and three colors',async t=>{
  imageTransport(t);
  const request=await load('evidence/m2-uniform-lite-head-intake-v1/female-request.json');
  const {record}=await performCharacterProduction(request,env());
  assert.deepEqual(record.appearanceRecipe.appearance,{...look,skinTone:'original'});
  assert.equal(record.appearanceRecipe.paletteVersion,registration.palette.version);
  assert.deepEqual(record.appearanceRecipe.hairFit,{
    kind:'explicit-fit-v1',id:registration.hair.fit.id,version:1,sha256:registration.hair.fit.sha256});
  const baseline=await closure(original),selected=await closure(record);
  const manifest=JSON.parse(await readFile(publicFile(registration.palette.url.slice(1))));
  const {iris,lips}=manifest.variants[0].parts;
  const extra=[registration.hair.manifestUrl,registration.hair.fit.url,'/assets/m2-hairstyle-v1/female-bob.glb',
    registration.palette.url,iris.maskUrl,iris.neutralMapUrl,lips.maskUrl];
  assert.deepEqual([...selected].filter(path=>!baseline.has(path)).sort(),extra.sort());
  const restored=await prepareRecordedCharacter(JSON.parse(JSON.stringify(record)),env());
  t.after(()=>restored.dispose());
  const capture=async()=>(await restored.capture()).appearanceRecipe;
  assert.deepEqual(await capture(),record.appearanceRecipe);
  const choices=queryAppearanceCandidates(restored.controller).appearance;
  for(const [key,selection] of Object.entries(look))
    assert.deepEqual(choices[key].choices.map(x=>x.value),['original',selection]);
  assert.deepEqual(choices.skinTone.choices.map(x=>x.value),['original','warm']);
  const state=restored.avatar.appearance.getState();
  assert.equal(state.facialTextureCount,4);
  assert.equal(state.neutralTextureCount,4);
  for(const [key,value] of Object.entries({skinTone:'deep',eyeColor:'green',hairColor:'brown',lipColor:'rose',hairStyle:'female-ponytail-v1'})){
    const attempt=await restored.avatar.appearance.set({[key]:value});
    assert.equal(attempt.applied,false);
  }
  assert.deepEqual(await capture(),record.appearanceRecipe);
  const stale={...record.appearanceRecipe,paletteVersion:original.appearanceRecipe.paletteVersion};
  assert.equal(admitAppearanceCandidate(restored.controller,stale).accepted,false);
  assert.equal((await restoreRuntimeCharacterRecord(restored.controller,original)).applied,true);
  assert.deepEqual(await capture(),original.appearanceRecipe);
  const changed=await restored.avatar.appearance.set({lipColor:'coral'});
  assert.equal(changed.applied,true,changed.reason);
  assert.equal((await capture()).paletteVersion,registration.palette.version);
});

test('warm material factor is signed and cannot inherit the original-skin palette identity',async t=>{
  imageTransport(t);
  const [saved] = await load('evidence/m2-uniform-lite-head-intake-v1/signed-pair.json');
  const request = await load('evidence/m2-uniform-lite-head-intake-v1/female-request.json');
  request.edits.at(-1).values.skinTone='warm';
  const {record} = await performCharacterProduction(request,env());
  const recipe = record.appearanceRecipe;
  assert.equal(recipe.paletteVersion,registration.palette.version+'|skin-multiply-v1:warm:ddc5b4');
  assert.equal(recipe.appearance.skinTone,'warm');
  assert.deepEqual(await closure(saved),await closure(record));
  const loaded=await prepareRecordedCharacter(JSON.parse(JSON.stringify(record)),env());
  t.after(()=>loaded.dispose());
  const capture=async()=>(await loaded.capture()).appearanceRecipe;
  assert.deepEqual(await capture(),recipe);
  for(const staleVersion of [registration.palette.version,recipe.paletteVersion.replace('ddc5b4','eec5b4')])
    assert.equal(admitAppearanceCandidate(loaded.controller,{...recipe,paletteVersion:staleVersion}).accepted,false);
  assert.equal(admitAppearanceCandidate(loaded.controller,{...recipe,appearance:{...recipe.appearance,skinTone:'original'}}).accepted,false);
  assert.deepEqual(await capture(),recipe);
  assert.equal((await restoreRuntimeCharacterRecord(loaded.controller,saved)).applied,true);
  assert.deepEqual(await capture(),saved.appearanceRecipe);
});

test('historical warm signed female bob and original male retain their recipe and resource identities',async t=>{
  imageTransport(t);
  for(const record of [historic,male]){
    const instance=await prepareRecordedCharacter(record,env());
    try{
      const again=await instance.capture();
      assert.equal(again.integrity.recipeSha256,record.integrity.recipeSha256);
      assert.deepEqual(JSON.parse(JSON.stringify(again.appearanceRecipe)),record.appearanceRecipe);
      assert.deepEqual(again.resourceIdentities,record.resourceIdentities);
    }finally{instance.dispose();}
  }
});

test('a restricted glasses record restores over a bob and rejects mismatched final head identities atomically',async t=>{
  imageTransport(t);
  const [bob]=await load('evidence/m2-uniform-skin-v1/signed-pair.json');
  assert.deepEqual(bob.appearanceRecipe.base,original.appearanceRecipe.base);
  const {profiles}=await load('prototype/public/assets/native-glasses-candidate-v2/manifest.json');
  const candidate=profiles.find(row=>row.bodySHA256===original.appearanceRecipe.base.sha256);
  // Install this candidate only in this test process to exercise formal restore.
  const previous=glassesRegistry.profiles;
  glassesRegistry.profiles=[...previous.filter(row=>row.bodySHA256!==candidate.bodySHA256),
    {...candidate,headDependency:{hairStyle:'original',faceGeometry:'neutral'}}];
  t.after(()=>{glassesRegistry.profiles=previous;});
  const instance=await prepareRecordedCharacter(original,env());
  t.after(()=>instance.dispose());
  const restore=record=>restoreRuntimeCharacterRecord(instance.controller,record);
  const enabled=await instance.avatar.livePresentation.setAccessory('glasses',true);
  assert.equal(enabled.applied,true,enabled.reason);
  const fitted=await instance.capture();
  assert.equal(fitted.liveAccessories.selections.glasses.identity.fit.sha256,candidate.sha256);
  assert.equal((await restore(bob)).applied,true);
  assert.equal((await instance.capture()).integrity.recipeSha256,bob.integrity.recipeSha256);
  assert.equal((await restore(fitted)).applied,true);
  const temple=instance.avatar.root.getObjectByName('Temple-1');
  assert(temple?.isMesh);
  const recipe=fitted.appearanceRecipe;
  for(const [appearanceRecipe,error] of [
    [bob.appearanceRecipe,/仅支持原发/],
    [{...recipe,hairAssetSha256:bob.appearanceRecipe.hairAssetSha256},/hairAssetSha256/],
    [{...recipe,hairFit:bob.appearanceRecipe.hairFit},/hairFit/],
    [{...recipe,geometry:{...recipe.geometry,eyeRecipeSha256:candidate.sha256}},/geometry.eyeRecipeSha256/],
  ]){
    const resourceIdentities=deriveCharacterResourceIdentities(appearanceRecipe,fitted.liveAccessories,fitted.equipmentMaterials);
    const invalid=await updateCharacterRecord(fitted,{appearanceRecipe,resourceIdentities},{},
      {validateResources:()=>({status:'pending'})});
    await assert.rejects(restore(invalid),error);
    await assert.rejects(closure(invalid),error);
    assert.equal(instance.avatar.root.getObjectByName('Temple-1'),temple);
  }
  const retained=await instance.capture();
  assert.deepEqual(retained.liveAccessories,fitted.liveAccessories);
  assert.equal(retained.integrity.recipeSha256,fitted.integrity.recipeSha256);
});
