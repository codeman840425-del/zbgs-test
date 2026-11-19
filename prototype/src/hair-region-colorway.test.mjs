import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import imageCodecs from '../node_modules/playwright-core/lib/utilsBundle.js';
import {prepareHairRegionColorway,validateHairFitData,validateHairSelection,hairFitIdentity,verifyRegionPrimitive} from './hair-fit-contract.js';
import {assertHatHairSelection,validateHatHairCatalog} from './hat-accessory-contract.js';
import {collectRecordResources} from '../../scripts/runtime-package/record-resources.mjs';
import {runtimePath} from '../../scripts/runtime-package/files.mjs';
import {createCharacterRecord} from './character-record.js';
import {deriveCharacterResourceIdentities} from './character-runtime-record.js';

const body='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const style='female-ponytail-mauve-rose-v1',oldStyle='female-ponytail-v1';
const entry=validateHairSelection(body,style), old=validateHairSelection(body,oldStyle);
const bytes=url=>readFile(new URL('../public'+url,import.meta.url));
const json=async url=>JSON.parse(await bytes(url));
const manifest=await json(entry.manifestUrl),fit=await json(entry.fit.url);
const region=manifest.regionColorway;
const maskUrl=new URL('mask.rg8','http://test'+region.regions.url).pathname;
const sha=b=>createHash('sha256').update(b).digest('hex');
const mats=m=>Array.isArray(m.material)?m.material:[m.material];

test('real derived fit rejects old fit reuse, rig changes, wrong bytes and wrong stream order',async()=>{
  assert.notDeepEqual(hairFitIdentity(entry),hairFitIdentity(old));
  assert.equal(entry.assetSha256,old.assetSha256);
  assert.throws(()=>validateHairSelection(body,style,{expectedHairFit:hairFitIdentity(old)}));
  const changed=structuredClone(fit);changed.attachment.position[0]+=.01;
  await assert.rejects(prepareHairRegionColorway(entry,manifest,changed,body,bytes),/原网格/);
  for(const url of [region.regions.url,region.palette.url,maskUrl,old.fit.url]) {
    await assert.rejects(prepareHairRegionColorway(entry,manifest,fit,body,async file=>{
      const value=await bytes(file);if(file===url)value[0]^=1;return value;
    }),/数据不符/);
  }
  const mismatched=structuredClone(fit);mismatched.regionColorway.sourceStyle.version++;
  assert.throws(()=>validateHairFitData(mismatched,entry,body,manifest),/区域身份/);
  const colored=await prepareHairRegionColorway(entry,manifest,fit,body,bytes);
  const glb=await bytes(manifest.url),doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
  await verifyRegionPrimitive(colored,doc,glb);
  colored.regions.streams.triangleIndicesUint32Le='0'.repeat(64);
  await assert.rejects(verifyRegionPrimitive(colored,doc,glb),/三角形顺序/);
  const hat=await json('/assets/m2-hat-hair-v1/fit.json'), hatHair=validateHatHairCatalog(hat,body);
  assert.throws(()=>assertHatHairSelection({hairStyle:style,replacementSHA256:entry.assetSha256,
    hairFit:hairFitIdentity(entry)},hat,hatHair),{code:'hat-hair-incompatible'});
});

test('MToon and real skinned ponytail use the exact per-vertex multipliers, survive retry and stay actor-local',async t=>{
  const hooks=registerHooks({load(url,context,next){
    return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
  }});
  t.after(()=>hooks.deregister());
  const {loadGeometryAvatar}=await import('../../scripts/headless-avatar-node.mjs');
  // The Node avatar has no canvas. Decode the actual PNGs used by the blonde base.
  t.mock.method(globalThis,'createImageBitmap',async blob=>{
    const data=Buffer.from(await blob.arrayBuffer());
    if(data.readUInt32BE()!==0x89504e47)return {width:1,height:1,close(){}};
    return {width:data.readUInt32BE(16),height:data.readUInt32BE(20),close(){},pixels:()=>imageCodecs.PNG.sync.read(data).data};
  });
  const document=globalThis.document;
  globalThis.document={createElement(tag){
    assert.equal(tag,'canvas');let pixels;
    return {getContext:()=>({drawImage(image){pixels=new Uint8ClampedArray(image.pixels());},
      getImageData:()=>({data:pixels}),putImageData(image){pixels=image.data;}})};
  }};
  t.after(()=>{if(document)globalThis.document=document;else delete globalThis.document;});
  const first=(await loadGeometryAvatar('female')).avatar, peer=(await loadGeometryAvatar('female')).avatar;
  const fetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=fetch;peer.dispose();first.dispose();});
  function hair(actor){const result=[];actor.vrm.scene.traverse(m=>{if(m.userData.assetRole==='hair')result.push(m);});return result;}
  for(const actor of [first,peer]){
    actor.setDebugBody(false);
    assert.equal((await actor.appearance.set({hairStyle:oldStyle})).applied,true);
  }
  const [original]=hair(first),[peerMesh]=hair(peer), base=new Map();
  first.vrm.scene.traverse(m=>{if(m.isMesh)for(const mat of mats(m))base.set(mat,[mat.color?.toArray(),mat.ignoreVertexColor,mat.vertexColors]);});
  globalThis.fetch=(url,init)=>url===maskUrl?new Response(null,{status:503}):fetch(url,init);
  assert.equal((await first.appearance.set({hairStyle:style})).applied,false);
  assert.equal(first.appearance.getState().hairStyle,oldStyle);
  assert.deepEqual(hair(first),[original]);
  globalThis.fetch=fetch;
  assert.equal((await first.appearance.set({hairStyle:style})).applied,true);
  const colored=hair(first).find(m=>m!==original);
  const colors=colored.geometry.getAttribute('color'),mask=await bytes(maskUrl), palette=await json(region.palette.url);
  assert.equal(colors.count,609);
  for(let i=0;i<colors.count;i++)for(let c=0;c<3;c++){
    const expected=1+(palette.rootLinearRgb[c]-1)*mask[2*i]/255+(palette.tipLinearRgb[c]-1)*mask[2*i+1]/255;
    assert.equal(colors.array[3*i+c],Math.fround(expected));
  }
  for(const mat of mats(colored)){
    assert.ok(mat.isMToonMaterial && mat.vertexColors && !mat.ignoreVertexColor);
    assert.match(mat.fragmentShader,/diffuseColor\.rgb \*= vColor\.rgb;/);
    assert.match(mat.fragmentShader,/material\.shadeColor\.rgb \*= vColor\.rgb;/);
    assert.doesNotMatch(mat.fragmentShader,/\.rgb \*= vColor;/);
  }
  for(const [mat,state] of base)assert.deepEqual([mat.color?.toArray(),mat.ignoreVertexColor,mat.vertexColors],state);
  assert.notEqual(colored.geometry,original.geometry);
  for(const key of ['position','normal','uv','skinIndex','skinWeight'])assert.deepEqual(colored.geometry.attributes[key].array,original.geometry.attributes[key].array);
  assert.deepEqual(colored.geometry.index.array,original.geometry.index.array);
  assert.deepEqual(colored.skeleton.bones.map(b=>b.name),original.skeleton.bones.map(b=>b.name));
  assert.deepEqual(colored.skeleton.boneInverses,original.skeleton.boneInverses);
  assert.equal(peerMesh.geometry.getAttribute('color'),undefined);
  assert.equal(first.appearance.getState().hairColor,'original');
  assert.deepEqual(first.appearance.getState().hairFit,hairFitIdentity(entry));
  assert.equal((await first.appearance.set({hairColor:'blonde'})).applied,true);
  assert.equal(first.appearance.getState().hairColor,'blonde');
  const savedColors=new Float32Array(colors.array);
  const switchBack=await first.appearance.prepareUpdate({hairStyle:oldStyle});
  assert.equal(switchBack.commit().applied,true);
  switchBack.rollback();switchBack.dispose();
  assert.equal(first.appearance.getState().hairStyle,style);
  assert.equal(first.appearance.getState().hairColor,'blonde');
  assert.deepEqual(colors.array,savedColors);
  assert.equal(peer.appearance.getState().hairColor,'original');
  assert.equal((await first.appearance.set({hairStyle:oldStyle})).applied,true);
  assert.equal(original.geometry.getAttribute('color'),undefined);
  let disposed=0;colored.geometry.addEventListener('dispose',()=>{disposed++;});
  first.dispose();assert.equal(disposed,1);
  assert.equal(peer.appearance.getState().hairStyle,oldStyle);
});

test('ordinary collector validates and includes only the selected colorway assets',async()=>{
  const historical=JSON.parse(await readFile(new URL('../../evidence/m2-accessory-record-room-785-v1/female-v8.json',import.meta.url)));
  const off={enabled:false,identity:null},liveAccessories={schema:'live-accessory-record-v1',
    selections:{glasses:off,mic:off},microphonePresentation:null};
  for(const item of [old,entry]){
    const recipe=structuredClone(historical);
    recipe.appearance.hairStyle=item.id;recipe.hairFit=hairFitIdentity(item);recipe.hairAssetSha256=item.assetSha256;
    recipe.accessories={hat:{selection:'none',resource:null},ears:{selection:'none',resource:null}};
    const record=await createCharacterRecord({identity:{id:'cpu-ponytail',name:'CPU ponytail',gender:'female'},
      appearanceRecipe:recipe,liveAccessories,provenance:{producer:'CPU fixture',sourceRefs:[]},
      resourceIdentities:deriveCharacterResourceIdentities(recipe,liveAccessories),now:'2026-11-19T00:00:00.000Z'},
    {validateResources:()=>({status:'pending'})});
    const paths=new Set();
    await collectRecordResources({record,sourceRoot:fileURLToPath(new URL('../../',import.meta.url)),
      async add(url,reason,{sha256,bytes:size,parent}){
        const name=runtimePath(url,parent),data=await bytes('/'+name);
        if(sha256)assert.equal(sha(data),sha256,reason);
        if(size)assert.equal(data.length,size,reason);
        paths.add('/'+name);return {path:name,bytes:data,value:name.endsWith('.json')?JSON.parse(data):null};
      }});
    for(const url of [old.manifestUrl,old.fit.url,manifest.url])assert.ok(paths.has(url),url);
    for(const url of [region.palette.url,region.regions.url,maskUrl,entry.manifestUrl,entry.fit.url])
      assert.equal(paths.has(url),item===entry,url);
  }
});
