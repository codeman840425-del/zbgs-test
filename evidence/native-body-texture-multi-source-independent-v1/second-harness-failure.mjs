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

const liveOwners=[],checks=[],findings=[];
try {
 assert(Object.isFrozen(admissions));
 assert.equal(admissions.length,2);
 for(const row of admissions)assert(Object.isFrozen(row));
 checks.push('Exactly two deeply frozen admission rows match actual pinned source/PNG resources');

 for(const s of sources) {
  const f=fixture(s),g=fixture(s);
  // Separate live materials may borrow the exact same original texture objects.
  g.material.map=f.map;g.material.shadeMultiplyTexture=f.shade;
  g.outline.map=f.map;g.outline.shadeMultiplyTexture=f.shade;
  const a=await create(f),b=await create(g);liveOwners.push(a,b);
  const selected=s.entries.filter(e=>e.slot!=='top'||e.id===s.manifest.equipment.find(r=>r.slot==='top'&&r.required).id).map(e=>e.id);
  a.prepareEquipmentSet(selected).commit();b.prepareEquipmentSet(selected).commit();
  assert.notEqual(f.material.map,g.material.map);
  assert.notEqual(f.material.map.source,g.material.map.source);
  assert.notEqual(f.material.map.image,g.material.map.image);
  let aDisposals=0,bDisposals=0;
  f.material.map.addEventListener('dispose',()=>aDisposals++);
  const bTexture=g.material.map;
  bTexture.addEventListener('dispose',()=>bDisposals++);
  a.dispose();a.dispose();
  assert.equal(aDisposals,1);assert.equal(bDisposals,0);
  assert.equal(g.material.map,bTexture);assert.equal(bTexture.image.closed,0);
  assert.equal(f.originalDisposes(),0);
  b.dispose();b.dispose();assert.equal(bDisposals,1);
  checks.push(`${s.name}: two same-source owners sharing borrowed base textures keep independent masks/bitmaps; disposal once`);

  const failed=fixture(s),update=failed.material.update;
  failed.material.update=function(){throw Error('independent staging updater failure');};
  await assert.rejects(create(failed),/staging updater failure/);
  restored(failed);
  failed.material.update=update;
  const recovered=await create(failed);liveOwners.push(recovered);
  recovered.prepareEquipmentSet(selected).commit();
  recovered.dispose();restored(failed);
  checks.push(`${s.name}: staging failure restores ownership for a successful retry without publishing maps`);

  const mut=fixture(s),o=await create(mut);liveOwners.push(o);
  const ids=[s.entries.find(e=>e.slot==='top').id];
  const transaction=o.prepareEquipmentSet(ids);
  ids[0]='unadmitted-after-prepare';
  transaction.commit();
  const state=o.getInfo();
  assert.equal(state.covered,true);
  assert.deepEqual(state.activeIds,['unadmitted-after-prepare']);
  findings.push({kind:'pre-existing-api-input-aliasing',source:s.name,
    observed:state,
    trigger:'Mutate the caller-owned ids array after prepareEquipmentSet and before commit',
    impact:'getInfo.activeIds reports an unvalidated ID although the mask reflects the originally validated top selection',
    integrationBoundary:'Factory creates and retains its own selected array; this review has not found a normal UI path that mutates it',
    minimalSuggestion:'Snapshot ids before validation and retain that snapshot for activeIds at commit'});
  o.dispose();
 }
 const report={schema:'native-body-texture-multi-source-independent-v1',
  status:'no-new-multi-source-blocker;pre-existing-input-aliasing-reproduced',checks,findings,
  implementationSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage.js')),
  admissionsSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage-admissions.js')),
  scope:'Actual source VRM JSON, base PNG and mask SHA, real Three/MToon materials. CPU fetch and bitmap decoding substitutes. No WebGL/GPU/fit/visual claim.'};
 fs.writeFileSync(new URL('./independent-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
} finally {
 for(const o of liveOwners)o.dispose();
 globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;
}
