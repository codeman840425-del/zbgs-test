import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createFacialGeometry} from '../../prototype/src/facial-geometry.js';
import {captureAppearanceRecipe,applyAppearanceRecipe,validateAppearanceRecipe,appearanceDraftKey,exportAppearanceRecipe,importAppearanceRecipe,readAppearanceRecipeFile,parseAppearanceRecipeText,APPEARANCE_RECIPE_MAX_BYTES} from '../../prototype/src/appearance-recipe.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
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
 const getEquipmentRecipe=vm.runInNewContext('('+getter+')',{config,surfaces,structuredClone,outfitSelection});
 let appearance={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'},revision=0;
 let appearanceGate=null,geometryGate=null,failAppearance=0,outfitFailures=0;const calls=[];
 const actor={config,profile:{bodyType:'male',sha256:source.sha},getEquipmentRecipe,
  appearance:{getState:()=>({...appearance,availableStyles:['original','none'],replacementSHA256:null,hairFit:null,revision}),async prepareUpdate(value){
   const ticket=++revision;calls.push(['appearance',value]);if(failAppearance){failAppearance--;return{applied:false,reason:'injected color failure'};}
   const gate=appearanceGate;appearanceGate=null;if(gate){gate.enter();await gate.promise;}
   if(ticket!==revision)return{applied:false,cancelled:true};let live=true;
   return{isCurrent:()=>live&&ticket===revision,
    commit(){assert(live&&ticket===revision);appearance={...appearance,...value};live=false;return{applied:true};},dispose(){live=false;}};
  }},facialGeometry:createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:async()=>{
   const gate=geometryGate;geometryGate=null;if(gate){gate.enter();await gate.promise;}
  }})};
 actor.appearance.set=async value=>{const update=await actor.appearance.prepareUpdate(value);if(!update.commit)return update;try{return update.commit();}finally{update.dispose();}};
 const controller={actor,outfit:0,outfitRevision:0,command(cmd){assert.equal(cmd.type,'outfit');this.outfitRevision++;this.outfit=cmd.value;calls.push(['outfit',cmd.value]);if(outfitFailures){outfitFailures--;throw Error('injected outfit UI failure');}}};
 controller.prepareOutfit=value=>{
  if(outfitFailures){outfitFailures--;throw Error('injected outfit allocation failure');}
  const revision=controller.outfitRevision;let live=true;
  return{isCurrent:()=>live&&revision===controller.outfitRevision,
   commit(){controller.command({type:'outfit',value});live=false;},dispose(){live=false;}};
 };
 const delay=domain=>{let release,enter;const promise=new Promise(r=>release=r),started=new Promise(r=>enter=r);const gate={promise,enter};if(domain==='appearance')appearanceGate=gate;else geometryGate=gate;return{release,started};};
 return{f,actor,controller,calls,delay,failColor:()=>failAppearance++,failOutfit:()=>outfitFailures++};
}


const oi=process.argv.indexOf('--out');
if(oi<0)throw Error('--out NEW_DIR required');
const out=path.resolve(root,process.argv[oi+1]);
if(fs.existsSync(out))throw Error('Refuse overwrite: '+out);
fs.mkdirSync(out,{recursive:true});
const results=[],check=async(name,fn)=>{await fn();results.push({name,pass:true});};
const file=text=>({size:new TextEncoder().encode(text).byteLength,text:async()=>text});
const f=controllerFixture();
await f.actor.facialGeometry.set({mouthWidth:.04,browSample:SAMPLE,noseSample:NOSE,eyeSample:EYE});
await f.actor.appearance.set({hairColor:'black'});
const textA=exportAppearanceRecipe(f.controller),recordA=JSON.parse(textA);
await f.actor.facialGeometry.set({mouthWidth:-.04,browSample:'none',noseSample:'none',eyeSample:'none'});
await f.actor.appearance.set({hairColor:'original',eyeColor:'original'});f.controller.command({type:'outfit',value:2});
const textB=exportAppearanceRecipe(f.controller),recordB=JSON.parse(textB);
fs.writeFileSync(path.join(out,'recipe-a.json'),textA);fs.writeFileSync(path.join(out,'recipe-b.json'),textB);
f.actor.facialGeometry.dispose();
for(const [id,text,expected]of[['a',textA,recordA],['b',textB,recordB]])await check('fresh-instance-file-'+id+'-without-local-storage',async()=>{
 const fresh=controllerFixture();assert.equal((await readAppearanceRecipeFile(fresh.controller,file(text))).applied,true);
 assert.equal(JSON.stringify(captureAppearanceRecipe(fresh.controller)),JSON.stringify(expected));fresh.actor.facialGeometry.dispose();
});
for(const [id,mutate]of[
 ['wrong-base',r=>r.base.bodyType='female'],['wrong-avatar-sha',r=>r.base.sha256='0'.repeat(64)],
 ['bad-equipment-binding',r=>r.equipment.resources={invalid:true}],['bad-geometry-dependency',r=>r.geometry.eyeRecipeSha256='0'.repeat(64)],
 ['bad-rules',r=>r.rulesVersion='unknown'],['bad-hair-dependency',r=>r.hairAssetSha256='0'.repeat(64)]
])await check(id+'-preserves-current',async()=>{
 const fresh=controllerFixture(),before=captureAppearanceRecipe(fresh.controller),r=structuredClone(recordA);mutate(r);
 await assert.rejects(async()=>importAppearanceRecipe(fresh.controller,JSON.stringify(r)));
 assert.deepEqual(captureAppearanceRecipe(fresh.controller),before);fresh.actor.facialGeometry.dispose();
});
await check('invalid-json-object-byte-size-and-file-size-rejected',async()=>{
 for(const text of['{','null','[]','0',' '.repeat(APPEARANCE_RECIPE_MAX_BYTES+1),'中'.repeat(APPEARANCE_RECIPE_MAX_BYTES/2)])assert.throws(()=>parseAppearanceRecipeText(text));
 const fresh=controllerFixture();let read=false;
 await assert.rejects(readAppearanceRecipeFile(fresh.controller,{size:APPEARANCE_RECIPE_MAX_BYTES+1,text:async()=>{read=true;return textA;}}));
 assert.equal(read,false);fresh.actor.facialGeometry.dispose();
});
for(const change of['geometry','appearance','outfit','actor','dispose'])await check('file-read-pending-'+change+'-cancels',async()=>{
 const fresh=controllerFixture(),other=controllerFixture();let release,cancel=false;
 const pending=readAppearanceRecipeFile(fresh.controller,{size:textA.length,text:()=>new Promise(r=>release=r)},{isCancelled:()=>cancel});
 if(change==='geometry')await fresh.actor.facialGeometry.set({mouthWidth:.01});
 if(change==='appearance')await fresh.actor.appearance.set({hairColor:'black'});
 if(change==='outfit')fresh.controller.command({type:'outfit',value:2});
 if(change==='actor')fresh.controller.actor=other.actor;
 if(change==='dispose')cancel=true;
 const before=captureAppearanceRecipe(fresh.controller);release(textA);assert.equal((await pending).cancelled,true);
 assert.deepEqual(captureAppearanceRecipe(fresh.controller),before);fresh.actor.facialGeometry.dispose();other.actor.facialGeometry.dispose();
});
await check('concurrent-import-keeps-only-latest-whole-request',async()=>{
 const fresh=controllerFixture(),gate=fresh.delay('geometry'),pending=importAppearanceRecipe(fresh.controller,textA);await gate.started;
 assert((await importAppearanceRecipe(fresh.controller,textB)).applied);gate.release();
 assert.equal((await pending).cancelled,true);assert.equal(JSON.stringify(captureAppearanceRecipe(fresh.controller)),JSON.stringify(recordB));fresh.actor.facialGeometry.dispose();
});
await check('newer-color-during-import-is-not-rolled-back',async()=>{
 const fresh=controllerFixture(),gate=fresh.delay('geometry'),pending=importAppearanceRecipe(fresh.controller,textA);await gate.started;
 await fresh.actor.appearance.set({hairColor:'black'});gate.release();assert.equal((await pending).cancelled,true);
 assert.equal(fresh.actor.appearance.getState().hairColor,'black');fresh.actor.facialGeometry.dispose();
});
await check('HTTP-dependency-failure-preserves-original',async()=>{
 const fresh=controllerFixture(),before=captureAppearanceRecipe(fresh.controller),fetchOriginal=globalThis.fetch;
 globalThis.fetch=async()=>new Response('unavailable',{status:503});
 try{await assert.rejects(importAppearanceRecipe(fresh.controller,textA));}finally{globalThis.fetch=fetchOriginal;}
 assert.deepEqual(captureAppearanceRecipe(fresh.controller),before);fresh.actor.facialGeometry.dispose();
});
const files=['prototype/src/appearance-recipe.js','prototype/src/appearance-workbench.js','prototype/src/main.js'];
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
const report={scope:'Real recipe + facial geometry + actual male GLB/equipment getter; mock colors/controller and file IO. No localStorage or browser. UI download/file chooser awaits fixed browser QA.',inputs:files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),results};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:results.length,out}));
