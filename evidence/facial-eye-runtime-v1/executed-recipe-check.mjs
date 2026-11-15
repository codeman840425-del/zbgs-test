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
const SAMPLE='height1-spacing1-v1',NOSE='tip-forward05-v1',EYE='aperture-width101-v1';
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
const checks=async(name,fn)=>{await fn();results.push({name,pass:true});};
const full={mouthWidth:.04,browSample:SAMPLE,noseSample:NOSE,eyeSample:EYE};
await checks('v4-capture-roundtrip-four-exact-identities',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set(full);const r=captureAppearanceRecipe(f.controller);
 assert.equal(r.schema,'workbench-appearance-recipe-v4');assert.equal(r.rulesVersion,'workbench-appearance-rules-v4');
 for(const k of['recipeSha256','browRecipeSha256','noseRecipeSha256','eyeRecipeSha256'])assert.match(r.geometry[k],/^[a-f0-9]{64}$/);
 assert.equal(r.base.sha256,f.actor.profile.sha256);await f.actor.facialGeometry.set({reset:true});assert.equal((await applyAppearanceRecipe(f.controller,r)).applied,true);assert.deepEqual(captureAppearanceRecipe(f.controller),r);f.actor.facialGeometry.dispose();
});
for(const version of [1,2,3])await checks('v'+version+'-migration-missing-eye-none-and-reject-mixed-new-fields',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set(full);const r=captureAppearanceRecipe(f.controller);
 r.schema=`workbench-appearance-recipe-v${version}`;r.rulesVersion=`workbench-appearance-rules-v${version}`;
 for(const name of['eye',...(version<3?['nose']:[]),...(version<2?['brow']:[])]){delete r.geometry[name+'Sample'];delete r.geometry[name+'RecipeSha256'];}
 const unchanged=JSON.stringify(r);assert.equal((await applyAppearanceRecipe(f.controller,r)).applied,true);assert.equal(JSON.stringify(r),unchanged);
 const g=f.actor.facialGeometry.getState();assert.equal(g.eyeSample,'none');assert.equal(g.browSample,version>=2?SAMPLE:'none');assert.equal(g.noseSample,version>=3?NOSE:'none');
 for(const field of['eyeSample','eyeRecipeSha256']){const mixed=structuredClone(r);mixed.geometry[field]=field==='eyeSample'?'none':null;assert.throws(()=>validateAppearanceRecipe(f.controller,mixed),/旧版配方不能携带新版眼部数据/);}
 f.actor.facialGeometry.dispose();
});
for(const kind of['wrong-version','wrong-base','unknown-sample','none-with-sha'])await checks(kind+'-preserves-current-geometry',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set(full);const before=captureAppearanceRecipe(f.controller),r=structuredClone(before),geo=f.f.meshes[0].geometry;
 if(kind==='wrong-version')r.geometry.eyeRecipeSha256='0'.repeat(64);
 if(kind==='wrong-base')r.base.sha256='0'.repeat(64);
 if(kind==='unknown-sample')r.geometry.eyeSample='width102-v1';
 if(kind==='none-with-sha')r.geometry.eyeSample='none';
 await assert.rejects(applyAppearanceRecipe(f.controller,r));assert.deepEqual(captureAppearanceRecipe(f.controller),before);assert.equal(f.f.meshes[0].geometry,geo);f.actor.facialGeometry.dispose();
});
for(const fault of['appearance','outfit'])await checks(fault+'-failure-rolls-back-all-four-domains',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set(full);const before=captureAppearanceRecipe(f.controller),r=structuredClone(before);
 r.geometry={mouthWidth:0,recipeSha256:null,browSample:'none',browRecipeSha256:null,noseSample:'none',noseRecipeSha256:null,eyeSample:'none',eyeRecipeSha256:null};r.appearance.hairColor='black';
 if(fault==='appearance')f.failColor();else{f.failOutfit();r.equipment={index:2,role:'shorts',manifestUrl:f.actor.config.manifestUrl,resources:f.actor.getEquipmentRecipe(2)};}
 await assert.rejects(applyAppearanceRecipe(f.controller,r),/先前外观已保留/);assert.deepEqual(captureAppearanceRecipe(f.controller),before);f.actor.facialGeometry.dispose();
});
for(const domain of['geometry','appearance'])await checks('new-eye-none-during-'+domain+'-restore-wins',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set(full);const r=captureAppearanceRecipe(f.controller);r.geometry.mouthWidth=-.04;r.appearance.hairColor='black';
 const delay=f.delay(domain),pending=applyAppearanceRecipe(f.controller,r);await delay.started;
 await f.actor.facialGeometry.set({eyeSample:'none'});delay.release();assert.equal((await pending).cancelled,true);assert.equal(f.actor.facialGeometry.getState().eyeSample,'none');assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);f.actor.facialGeometry.dispose();
});
await checks('new-body-during-eye-restore-does-not-touch-new-actor',async()=>{
 const f=controllerFixture(),other=controllerFixture();await f.actor.facialGeometry.set(full);const r=captureAppearanceRecipe(f.controller);r.geometry.mouthWidth=-.04;
 const delay=f.delay('geometry'),pending=applyAppearanceRecipe(f.controller,r);await delay.started;f.controller.actor=other.actor;delay.release();assert.equal((await pending).cancelled,true);assert.equal(other.actor.facialGeometry.getState().eyeSample,'none');assert.equal(other.calls.length,0);f.actor.facialGeometry.dispose();other.actor.facialGeometry.dispose();
});
const out=path.join(root,'evidence/facial-eye-runtime-v1');fs.mkdirSync(out,{recursive:true});
const report={scope:'Actual recipe/geometry modules with actual male Face attributes + equipment getter, mock colors/control and HTTP. No browser.',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/appearance-recipe.js'))),results};fs.writeFileSync(path.join(out,'recipe-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
