import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {MToonMaterial} from '../../prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js';
import {createBodyTextureCoverage} from '../../prototype/src/body-texture-coverage.js';
import {BODY_TEXTURE_COVERAGE_ADMISSIONS as admissions} from '../../prototype/src/body-texture-coverage-admissions.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=[
 {name:'female',manifestPath:'assets-source/native-vroid-body-texture-fit-v1/manifest.json',equipmentPath:'assets-source/native-vroid-factory-fit-v1/equipment.json',vrmPath:'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'},
 {name:'male',manifestPath:'assets-source/native-vroid-male-body-texture-fit-v1/generated/manifest.json',equipmentPath:'assets-source/native-vroid-male-equipment-v1/generated/equipment.json',vrmPath:'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'},
];
const resources=new Map();
for(const s of sources){
 s.bytes=fs.readFileSync(s.manifestPath);s.manifest=JSON.parse(s.bytes);s.entries=JSON.parse(fs.readFileSync(s.equipmentPath)).items;
 s.descriptor={url:`https://test.local/${s.name}/manifest.json`,sha256:sha(s.bytes)};
 s.pngURL=new URL(s.manifest.covered.url,s.descriptor.url).href;
 s.png=fs.readFileSync(new URL(s.manifest.covered.url,new URL(s.manifestPath.replaceAll('\\','/'),'file:///'+process.cwd().replaceAll('\\','/')+'/')));
 const admission=admissions.find(a=>a.manifestSha256===s.descriptor.sha256);assert(admission);assert.equal(admission.avatarSha256,s.manifest.avatarSha256);assert.equal(admission.maskedPngSha256,sha(s.png));
 const vrm=fs.readFileSync(s.vrmPath);assert.equal(sha(vrm),admission.avatarSha256);
 const jsonSize=vrm.readUInt32LE(12),doc=JSON.parse(vrm.subarray(20,20+jsonSize)),binStart=28+jsonSize;
 const mats=doc.materials.filter(m=>m.name===s.manifest.materialName);assert.equal(mats.length,1);s.material=mats[0];
 const texture=s.material.pbrMetallicRoughness.baseColorTexture,shade=s.material.extensions.VRMC_materials_mtoon.shadeMultiplyTexture;
 assert.equal(texture.index,shade.index);assert.equal(texture.texCoord??0,0);assert.equal(shade.texCoord??0,0);assert.equal(s.material.alphaMode,'MASK');
 s.sampler=doc.samplers[doc.textures[texture.index].sampler];
 const view=doc.bufferViews[doc.images[doc.textures[texture.index].source].bufferView];
 const png=vrm.subarray(binStart+(view.byteOffset??0),binStart+(view.byteOffset??0)+view.byteLength);
 assert.equal(sha(png),admission.basePngSha256);s.basePNG=png;
 assert.equal(png.readUInt32BE(16),2048);assert.equal(png.readUInt32BE(20),2048);
 resources.set(s.descriptor.url,s.bytes);resources.set(s.pngURL,s.png);
}
const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;let replacement=null,waitURL=null,arrive=null,release=null;
const bitmaps=[];
globalThis.fetch=async url=>{url=String(url);if(url===waitURL){arrive();await new Promise(r=>release=r);}return new Response(replacement?.url===url?replacement.bytes:resources.get(url),{status:resources.has(url)?200:404});};
globalThis.createImageBitmap=async blob=>{const bytes=Buffer.from(await blob.arrayBuffer());assert(sources.some(s=>sha(s.png)===sha(bytes)));const bitmap={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),closed:0,close(){this.closed++;assert.equal(this.closed,1);}};bitmaps.push(bitmap);return bitmap;};
function fixture(s){
 const m=s.material;assert.equal(s.sampler.minFilter,9729);assert.equal(s.sampler.magFilter,9729);assert.equal(s.sampler.wrapS??10497,10497);assert.equal(s.sampler.wrapT??10497,10497);
 const map=new T.Texture({width:s.basePNG.readUInt32BE(16),height:s.basePNG.readUInt32BE(20)});
 Object.assign(map,{flipY:false,colorSpace:T.SRGBColorSpace,wrapS:T.RepeatWrapping,wrapT:T.RepeatWrapping,minFilter:T.LinearFilter,magFilter:T.LinearFilter,generateMipmaps:false});
 const shade=map.clone(),factor=m.pbrMetallicRoughness.baseColorFactor??[1,1,1,1];
 const material=new MToonMaterial({map,shadeMultiplyTexture:shade,alphaTest:m.alphaCutoff??.5,transparent:false,opacity:factor[3]});
 material.name=m.name;material.color.fromArray(factor);material.shadeColorFactor.fromArray(m.extensions.VRMC_materials_mtoon.shadeColorFactor);material.update(0);
 const outline=material.clone();outline.name=m.name+' (Outline)';outline.isOutline=true;
 const mesh=new T.SkinnedMesh(new T.BufferGeometry(),[material,outline]);let originalDisposes=0;
 for(const x of [map,shade])x.addEventListener('dispose',()=>originalDisposes++);
 return{s,body:[mesh],material,outline,map,shade,originalDisposes:()=>originalDisposes};
}
const create=(f,overrides={})=>createBodyTextureCoverage({body:f.body,avatarSha256:f.s.manifest.avatarSha256,entries:f.s.entries,descriptor:f.s.descriptor,...overrides});
const restored=f=>{assert.equal(f.material.map,f.map);assert.equal(f.material.shadeMultiplyTexture,f.shade);assert.equal(f.outline.map,f.map);assert.equal(f.originalDisposes(),0);};
const owners=[],checks=[];
try{
 for(const s of sources){
  const f=fixture(s),o=await create(f);owners.push(o);restored(f);
  const ids=s.entries.map(e=>e.id),shoe=s.entries.find(e=>e.slot==='shoes').id;
  const c=f.material.color.clone(),sh=f.material.shadeColorFactor.clone();
  const older=o.prepareEquipmentSet(ids),latest=o.prepareEquipmentSet([shoe]);assert(!older.isCurrent());assert.throws(()=>older.commit(),/superseded/);older.dispose();latest.commit();restored(f);
  o.prepareEquipmentSet(ids).commit();assert.notEqual(f.material.map,f.map);assert.equal(o.getInfo().maskedPngSha256,sha(s.png));assert(f.material.color.equals(c));assert(f.material.shadeColorFactor.equals(sh));
  assert.throws(()=>o.prepareEquipmentSet(['unknown']),/unknown/);assert.throws(()=>o.prepareEquipmentSet([shoe,shoe]),/duplicate/);assert(o.getInfo().covered);
  const pending=o.prepareEquipmentSet([shoe]);o.dispose();assert(!pending.isCurrent());assert.throws(()=>pending.commit(),/disposed/);restored(f);
  const bad=fixture(s);await assert.rejects(create(bad,{descriptor:{...s.descriptor,sha256:'0'.repeat(64)}}),/unadmitted/);restored(bad);
  const other=sources.find(x=>x!==s);
  const forged=Buffer.from(JSON.stringify({...s.manifest,covered:other.manifest.covered}));
  await assert.rejects(create(bad,{descriptor:{...s.descriptor,sha256:sha(forged)}}),/unadmitted/);restored(bad);
  replacement={url:s.descriptor.url,bytes:other.bytes};await assert.rejects(create(bad),/identity mismatch/);replacement=null;restored(bad);
  await assert.rejects(create(bad,{descriptor:other.descriptor}),/unadmitted/);restored(bad);
  await assert.rejects(create(bad,{entries:other.entries}),/equipment/);restored(bad);
  for(const change of [{sha256:'0'.repeat(64)},{slot:'shoes'},{compatibleAvatarSha256:other.manifest.avatarSha256}])await assert.rejects(create(bad,{entries:s.entries.map((e,i)=>i?e:{...e,...change})}),/equipment/);
  replacement={url:s.pngURL,bytes:other.png};await assert.rejects(create(bad),/identity mismatch/);restored(bad);replacement=null;
  const reacquired=await create(bad);owners.push(reacquired);reacquired.dispose();
  const samplerBad=fixture(s);samplerBad.map.minFilter=T.NearestFilter;await assert.rejects(create(samplerBad),/sampler/);restored(samplerBad);
  const alphaBad=fixture(s);alphaBad.material.alphaTest=0;await assert.rejects(create(alphaBad),/alpha/);restored(alphaBad);
  checks.push(`${s.name}: actual source material/base PNG/entry pins; commit/restore/tint; stale and disposed transactions; wrong avatar manifest/PNG/entry/slot/sampler/alpha rejected`);
 }
 const female=fixture(sources[0]),male=fixture(sources[1]);const [fo,mo]=await Promise.all([create(female),create(male)]);owners.push(fo,mo);
 fo.prepareEquipmentSet(sources[0].entries.map(e=>e.id)).commit();mo.prepareEquipmentSet(sources[1].entries.map(e=>e.id)).commit();
 assert.notEqual(female.material.map,male.material.map);assert.notEqual(female.material.map.image,male.material.map.image);
 const maleMap=male.material.map;fo.dispose();restored(female);assert.equal(male.material.map,maleMap);assert.equal(maleMap.image.closed,0);mo.dispose();restored(male);
 checks.push('Concurrent female+male own different textures/bitmaps; disposing female preserves committed male');
 const delayed=fixture(sources[1]);waitURL=sources[1].pngURL;const arrived=new Promise(r=>arrive=r),construction=create(delayed);await arrived;restored(delayed);
 await assert.rejects(create(delayed),/owned/);restored(delayed);waitURL=null;release();const delayedOwner=await construction;owners.push(delayedOwner);restored(delayed);
 const first=delayedOwner.prepareEquipmentSet(sources[1].entries.map(e=>e.id));await Promise.resolve();const newest=delayedOwner.prepareEquipmentSet([]);assert.throws(()=>first.commit(),/superseded/);newest.commit();restored(delayed);delayedOwner.dispose();
 checks.push('Deferred resource fetch never publishes; duplicate in-flight owner rejected; late stale prepared cannot overwrite newer base state');
 const report={passed:true,checks,sourcePins:sources.map(s=>({name:s.name,manifestSHA:s.descriptor.sha256,avatarSHA:s.manifest.avatarSha256,basePNGsha:sha(s.basePNG),maskedPNGsha:sha(s.png),equipmentSHA:sha(fs.readFileSync(s.equipmentPath)),sampler:s.sampler,material:s.material})),implementationSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage.js')),admissionsSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage-admissions.js')),scope:'Actual pinned source VRM JSON/material/base PNG + supplied entry readback, real Three/MToon/update(0); fetch/bitmap decode CPU mock. No browser/GPU/shadow/fit claim.'};
 fs.writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,checks,implementationSHA:report.implementationSHA,admissionsSHA:report.admissionsSHA}));
}finally{for(const o of owners)o.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}
