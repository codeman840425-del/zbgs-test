import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createFacialGeometry} from '../../prototype/src/facial-geometry.js';
import {captureAppearanceRecipe,applyAppearanceRecipe,validateAppearanceRecipe,appearanceDraftKey} from '../../prototype/src/appearance-recipe.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
function glb(filename){
 const bytes=fs.readFileSync(filename),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
 function acc(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Type=types[a.componentType],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];assert(!a.sparse&&!v.byteStride);const b=bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*size*Type.BYTES_PER_ELEMENT);return {array:new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),size};}
 return {doc,acc,sha:sha(bytes)};
}
function fixture(source,geometries=null){
 const scene=new THREE.Group(),face=source.doc.meshes.find(m=>m.name.startsWith('Face')),meshes=[];
 if(!geometries)geometries=face.primitives.map(p=>{
  const g=new THREE.BufferGeometry();
  for(const [semantic,i]of Object.entries(p.attributes)){
   const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'},a=source.acc(i);if(names[semantic])g.setAttribute(names[semantic],new THREE.BufferAttribute(a.array,a.size));
  }
  const index=source.acc(p.indices);g.setIndex(new THREE.BufferAttribute(index.array,1));
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}
const foundation=fs.readFileSync(path.join(root,'prototype/src/foundation-avatar.js'),'utf8');
const start=foundation.indexOf('getEquipmentRecipe: (index) => {');
const getter=foundation.slice(start+'getEquipmentRecipe: '.length,foundation.indexOf('\n    setMaterialRecipe:',start)).trim().replace(/,$/,'');
const SAMPLE='height1-spacing1-v1';
function controllerFixture(){
 const source=glb(path.join(root,'prototype/public/assets/foundation/base-male-roundtrip.vrm')),f=fixture(source);
 const config=foundationProfile('male'),manifest=JSON.parse(fs.readFileSync(path.join(root,'prototype/public',config.manifestUrl)));
 const surfaces={equipment:new Map(manifest.items.map(entry=>[entry.id,{entry}]))};
 const getEquipmentRecipe=vm.runInNewContext('('+getter+')',{config,surfaces,structuredClone});
 let appearance={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'},revision=0;
 let appearanceGate=null,geometryGate=null,failAppearance=0,outfitFailures=0;const calls=[];
 const actor={config,profile:{bodyType:'male',sha256:source.sha},getEquipmentRecipe,
  appearance:{getState:()=>({...appearance,availableStyles:['original','none'],replacementSHA256:null,revision}),async set(value){
   const ticket=++revision;calls.push(['appearance',value]);if(failAppearance){failAppearance--;return{applied:false,reason:'injected color failure'};}
   const gate=appearanceGate;appearanceGate=null;if(gate){gate.enter();await gate.promise;}
   if(ticket!==revision)return{applied:false,cancelled:true};appearance={...appearance,...value};return{applied:true};
  }},facialGeometry:createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:async()=>{
   const gate=geometryGate;geometryGate=null;if(gate){gate.enter();await gate.promise;}
  }})};
 const controller={actor,outfit:0,outfitRevision:0,command(cmd){assert.equal(cmd.type,'outfit');this.outfitRevision++;this.outfit=cmd.value;calls.push(['outfit',cmd.value]);if(outfitFailures){outfitFailures--;throw Error('injected outfit UI failure');}}};
 const delay=domain=>{let release,enter;const promise=new Promise(r=>release=r),started=new Promise(r=>enter=r);const gate={promise,enter};if(domain==='appearance')appearanceGate=gate;else geometryGate=gate;return{release,started};};
 return{f,actor,controller,calls,delay,failColor:()=>failAppearance++,failOutfit:()=>outfitFailures++};
}
const results=[];
const snapshot=f=>({geometry:f.actor.facialGeometry.getState(),appearance:f.actor.appearance.getState(),outfit:f.controller.outfit});
const checks=async(name,fn)=>{await fn();results.push({name,pass:true});};
await checks('v2-capture-both-resource-identities',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE});
 const r=captureAppearanceRecipe(f.controller);assert.equal(r.schema,'workbench-appearance-recipe-v2');assert.equal(r.geometry.browSample,SAMPLE);assert.equal(r.geometry.mouthWidth,.04);
 assert.match(r.geometry.recipeSha256,/^[a-f0-9]{64}$/);assert.match(r.geometry.browRecipeSha256,/^[a-f0-9]{64}$/);
 validateAppearanceRecipe(f.controller,JSON.parse(JSON.stringify(r)));assert.equal(r.base.sha256,f.actor.profile.sha256);
 await f.actor.facialGeometry.set({reset:true});assert.equal((await applyAppearanceRecipe(f.controller,r)).applied,true);
 assert.equal(f.actor.facialGeometry.getState().browSample,SAMPLE);assert.equal(f.actor.facialGeometry.getState().mouthWidth,.04);f.actor.facialGeometry.dispose();
});
await checks('old-v1-read-normalizes-only-absent-brow-no-record-mutation',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:-.04});const r=captureAppearanceRecipe(f.controller);
 r.schema='workbench-appearance-recipe-v1';r.rulesVersion='workbench-appearance-rules-v1';delete r.geometry.browSample;delete r.geometry.browRecipeSha256;const before=JSON.stringify(r);
 await f.actor.facialGeometry.set({browSample:SAMPLE,mouthWidth:.04});assert.equal((await applyAppearanceRecipe(f.controller,r)).applied,true);
 assert.equal(f.actor.facialGeometry.getState().browSample,'none');assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);assert.equal(JSON.stringify(r),before);
 assert.equal(captureAppearanceRecipe(f.controller).schema,'workbench-appearance-recipe-v2');assert.equal(appearanceDraftKey('male'),'zbgs:appearance-draft:v1:male');f.actor.facialGeometry.dispose();
});
for(const fault of ['legacy-brow-smuggling','v2-missing-brow','v2-none-with-hash','wrong-brow-hash','wrong-mouth-hash'])await checks(fault+'-retains-both-domains',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE});const r=captureAppearanceRecipe(f.controller);
 r.geometry.mouthWidth=-.04;
 if(fault==='legacy-brow-smuggling'){r.schema='workbench-appearance-recipe-v1';r.rulesVersion='workbench-appearance-rules-v1';}
 if(fault==='v2-missing-brow')delete r.geometry.browSample;
 if(fault==='v2-none-with-hash')r.geometry.browSample='none';
 if(fault==='wrong-brow-hash')r.geometry.browRecipeSha256='0'.repeat(64);
 if(fault==='wrong-mouth-hash')r.geometry.recipeSha256='0'.repeat(64);
 const before=f.f.meshes[0].geometry;await assert.rejects(applyAppearanceRecipe(f.controller,r));
 assert.equal(f.actor.facialGeometry.getState().mouthWidth,.04);assert.equal(f.actor.facialGeometry.getState().browSample,SAMPLE);assert.equal(f.f.meshes[0].geometry,before);f.actor.facialGeometry.dispose();
});
await checks('recipe-independent-mouth-and-brow-zero',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE});
 const r=captureAppearanceRecipe(f.controller);r.geometry.mouthWidth=0;r.geometry.recipeSha256=null;
 await applyAppearanceRecipe(f.controller,r);assert.equal(f.actor.facialGeometry.getState().browSample,SAMPLE);
 const r2=captureAppearanceRecipe(f.controller);r2.geometry.browSample='none';r2.geometry.browRecipeSha256=null;r2.geometry.mouthWidth=-.04;r2.geometry.recipeSha256=f.actor.facialGeometry.getState().recipeSha256;
 await applyAppearanceRecipe(f.controller,r2);assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);assert.equal(f.actor.facialGeometry.getState().browSample,'none');f.actor.facialGeometry.dispose();
});
for(const fault of ['appearance','outfit'])await checks(fault+'-failure-restores-preexisting-brow-and-mouth',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE});const before=captureAppearanceRecipe(f.controller),r=structuredClone(before);
 r.geometry={mouthWidth:-.04,recipeSha256:before.geometry.recipeSha256,browSample:'none',browRecipeSha256:null};r.appearance.hairColor='black';
 if(fault==='appearance')f.failColor();else{f.failOutfit();r.equipment={index:2,role:'shorts',manifestUrl:f.actor.config.manifestUrl,resources:f.actor.getEquipmentRecipe(2)};}
 await assert.rejects(applyAppearanceRecipe(f.controller,r),/先前外观已保留/);assert.deepEqual(captureAppearanceRecipe(f.controller),before);f.actor.facialGeometry.dispose();
});
for(const domain of ['geometry','appearance'])await checks('new-brow-request-during-'+domain+'-does-not-rollback-winner',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE});const r=captureAppearanceRecipe(f.controller);r.geometry.mouthWidth=-.04;r.appearance.hairColor='black';
 const delay=f.delay(domain),pending=applyAppearanceRecipe(f.controller,r);await delay.started;
 const result=await f.actor.facialGeometry.set({browSample:'none'});assert.equal(result.applied,true);delay.release();const old=await pending;
 assert.equal(old.cancelled,true);assert.equal(f.actor.facialGeometry.getState().browSample,'none');assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);f.actor.facialGeometry.dispose();
});
await checks('new-mouth-request-during-brow-restore-keeps-latest-vector',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({browSample:SAMPLE});const r=captureAppearanceRecipe(f.controller);r.geometry.mouthWidth=.04;r.geometry.recipeSha256=f.actor.facialGeometry.getState().recipeSha256;
 await f.actor.facialGeometry.set({reset:true});const delay=f.delay('geometry'),pending=applyAppearanceRecipe(f.controller,r);await delay.started;
 await f.actor.facialGeometry.set({mouthWidth:-.04});delay.release();assert.equal((await pending).cancelled,true);
 assert.equal(f.actor.facialGeometry.getState().browSample,SAMPLE);assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);f.actor.facialGeometry.dispose();
});
const sources=['appearance-recipe.js','facial-geometry.js','appearance-workbench.js'];fs.mkdirSync(path.join(dir,'source-tested'),{recursive:true});
const sourceHashes=Object.fromEntries(sources.map(file=>{const b=fs.readFileSync(path.join(root,'prototype/src',file));fs.writeFileSync(path.join(dir,'source-tested',file),b);return[file,sha(b)];}));
const report={scope:'Actual appearance recipe and facial geometry modules, original male GLB CPU Three fixture, installed recipe resources, real equipment getter; mocked color API and controlled awaits. No browser/GPU. Targeted brow/v1-v2 delta only.',sourceHashes,results};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
