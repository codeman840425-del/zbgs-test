import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from '../../../prototype/node_modules/three/build/three.module.js';
import {MToonMaterial} from '../../../prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js';
import {createBodyTextureCoverage} from '../../../prototype/src/body-texture-coverage.js';
import {BODY_TEXTURE_COVERAGE_ADMISSIONS as admissions} from '../../../prototype/src/body-texture-coverage-admissions.js';
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
const expectBug=process.argv.includes('--expect-bug'),owners=[],results=[];
try{
 const fixtures=sources.map(fixture),controllers=await Promise.all(fixtures.map(f=>create(f)));owners.push(...controllers);
 for(let i=0;i<sources.length;i++){
  const s=sources[i],f=fixtures[i],o=controllers[i],top=s.entries.find(e=>e.slot==='top').id,shoe=s.entries.find(e=>e.slot==='shoes').id;
  const ids=[top],prepared=o.prepareEquipmentSet(ids);ids[0]='unknown';ids.push('also-unknown');prepared.commit();prepared.dispose();
  const observed=o.getInfo();assert.equal(observed.covered,true);assert.notEqual(f.material.map,f.map);
  if(expectBug){assert.deepEqual(observed.activeIds,ids);results.push({name:s.name,expectedIds:[top],callerIds:ids,observedIds:observed.activeIds,confirmedAliasFailure:true});continue;}
  assert.deepEqual(observed.activeIds,[top]);ids.length=0;assert.deepEqual(o.getInfo().activeIds,[top]);
  const oldIds=[top],stale=o.prepareEquipmentSet(oldIds),latestIds=[shoe],latest=o.prepareEquipmentSet(latestIds);
  oldIds[0]='unknown';latestIds[0]=top;assert(!stale.isCurrent());assert.throws(()=>stale.commit(),/superseded/);stale.dispose();latest.commit();latest.dispose();
  assert.deepEqual(o.getInfo().activeIds,[shoe]);assert.equal(o.getInfo().covered,false);restored(f);
  const empty=[],emptyPrepared=o.prepareEquipmentSet(empty);empty.push(top);emptyPrepared.commit();assert.deepEqual(o.getInfo().activeIds,[]);assert.equal(o.getInfo().covered,false);
  const frozen=o.prepareEquipmentSet(Object.freeze([top]));frozen.commit();assert.deepEqual(o.getInfo().activeIds,[top]);assert(o.getInfo().covered);
  assert.throws(()=>o.prepareEquipmentSet(['unknown']),/unknown/);assert.deepEqual(o.getInfo().activeIds,[top]);
  results.push({name:s.name,callerMutationAfterPrepare:'ignored',mutateAfterCommit:'ignored',emptyArrayLaterPush:'ignored',stalePrepared:'rejected',frozenInput:'accepted',unknownInitialInput:'rejected'});
 }
 if(!expectBug){const maleMap=fixtures[1].material.map,maleIds=controllers[1].getInfo().activeIds;controllers[0].dispose();restored(fixtures[0]);assert.equal(fixtures[1].material.map,maleMap);assert.deepEqual(controllers[1].getInfo().activeIds,maleIds);assert.equal(maleMap.image.closed,0);controllers[1].dispose();restored(fixtures[1]);}
 const report={status:expectBug?'pre-fix-alias-failure-confirmed':'fixed-regressions-passed',results,implementationSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage.js')),admissionsSHA:sha(fs.readFileSync('prototype/src/body-texture-coverage-admissions.js')),scope:'Same actual two-source material and entries fixture, real Three/MToon/update(0), mocked fetch/decode; no GPU.'};
 fs.writeFileSync(new URL(expectBug?'./before.json':'./after.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{for(const o of owners)o.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}
