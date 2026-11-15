import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {captureAppearanceRecipe,applyAppearanceRecipe,validateAppearanceRecipe,appearanceDraftKey,exportAppearanceRecipe,importAppearanceRecipe,readAppearanceRecipeFile,parseAppearanceRecipeText,APPEARANCE_RECIPE_MAX_BYTES} from '../prototype/src/appearance-recipe.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'..');
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
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});if(p.targets[0].NORMAL!==undefined)g.morphAttributes.normal=p.targets.map(t=>{const a=source.acc(t.NORMAL);return new THREE.BufferAttribute(a.array,a.size);});return g;
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
 const source=glb(path.join(root,'assets-source/m2-male-face-v1/generated/avatar.vrm')),f=fixture(source);
 const config=foundationProfile('m2-male-jaw-v1'),manifest=JSON.parse(fs.readFileSync(path.join(root,'prototype/public',config.manifestUrl)));
 const surfaces={equipment:new Map(manifest.items.map(entry=>[entry.id,{entry}]))};
 const getEquipmentRecipe=vm.runInNewContext('('+getter+')',{config,surfaces,structuredClone});
 let appearance={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'},revision=0;
 let appearanceGate=null,geometryGate=null,failAppearance=0,outfitFailures=0;const calls=[];
 const actor={config,profile:{bodyType:'m2-male-jaw-v1',sha256:source.sha},getEquipmentRecipe,
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



const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW required');
const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite '+out);fs.mkdirSync(out,{recursive:true});
const result=[],check=async(name,fn)=>{await fn();result.push({name,passed:true});};
const maxDiff=(a,b)=>{assert.equal(a.length,b.length);let v=0;for(let i=0;i<a.length;i++)v=Math.max(v,Math.abs(a[i]-b[i]));return v;};
let numbers={};
const recipe=JSON.parse(fs.readFileSync(path.join(root,'assets-source/m2-male-jaw-mouth-v1/male-jaw-mouth-width.recipe.json')));
const derived=glb(path.join(root,'assets-source/m2-male-jaw-mouth-v1/generated/male-jaw-mouth-width-104-v1/avatar.vrm'));
const target=derived.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0];
await check('actual-jaw-source-basis-54-shapes-and-normals',async()=>{
 const f=controllerFixture(),originals=f.f.meshes.map(m=>m.geometry),before=originals.map(g=>sha(g.attributes.position.array));
 const cap=f.actor.facialGeometry.getState();assert.equal(cap.available,true);assert.deepEqual(cap.mouthSupportedValues,[0,.04]);
 for(const k of ['browAvailable','noseAvailable','eyeAvailable'])assert.equal(cap[k],false);
 assert.equal((await f.actor.facialGeometry.set({mouthWidth:.04,expectedRecipeSha256:sha(fs.readFileSync(path.join(root,'assets-source/m2-male-jaw-mouth-v1/male-jaw-mouth-width.recipe.json')))})).applied,true);
 const g=f.f.meshes[0].geometry,p=derived.acc(target.attributes.POSITION).array,n=derived.acc(target.attributes.NORMAL).array;
 numbers.position=maxDiff(g.attributes.position.array,p);numbers.normal=maxDiff(g.attributes.normal.array,n);
 numbers.shapePosition=0;numbers.shapeNormal=0;
 for(let j=0;j<54;j++){
  const d=derived.acc(target.targets[j].POSITION).array,dn=derived.acc(target.targets[j].NORMAL).array;
  for(let i=0;i<p.length;i++){
   numbers.shapePosition=Math.max(numbers.shapePosition,Math.abs(g.attributes.position.array[i]+g.morphAttributes.position[j].array[i]-p[i]-d[i]));
   numbers.shapeNormal=Math.max(numbers.shapeNormal,Math.abs(g.attributes.normal.array[i]+g.morphAttributes.normal[j].array[i]-n[i]-dn[i]));
  }
 }
 console.log(JSON.stringify(numbers));fs.writeFileSync(path.join(out,'measured.json'),JSON.stringify(numbers,null,2));
 assert(numbers.position<3e-7&&numbers.shapePosition<3e-7&&numbers.normal<1e-5&&numbers.shapeNormal<1e-5);
 const affected=new Set(recipe.normalNeighborhoodVertices);
 for(let mi=0;mi<f.f.meshes.length;mi++){
  const current=f.f.meshes[mi].geometry,old=originals[mi];
  assert.equal(sha(old.attributes.position.array),before[mi]);assert.equal(maxDiff(current.attributes.position.array,g.attributes.position.array),0);
  for(const vertex of recipe.protectedVertices)for(let c=0;c<3;c++)assert.equal(current.attributes.position.array[vertex*3+c],old.attributes.position.array[vertex*3+c]);
  for(let v=0;v<recipe.positionCount;v++)if(!affected.has(v))for(let c=0;c<3;c++){
   const i=v*3+c;assert.equal(current.attributes.normal.array[i],old.attributes.normal.array[i]);
   for(let j=0;j<54;j++)assert.equal(current.morphAttributes.normal[j].array[i],old.morphAttributes.normal?.[j]?.array[i]||0);
  }
 }
 assert.equal((await f.actor.facialGeometry.set({mouthWidth:0})).applied,true);f.f.meshes.forEach((m,i)=>assert.equal(m.geometry,originals[i]));f.actor.facialGeometry.dispose();
});
await check('discrete-rejects-negative-intermediate-and-unavailable-three-domains',async()=>{
 const f=controllerFixture();await f.actor.facialGeometry.set({mouthWidth:.04});const current=f.f.meshes[0].geometry;
 for(const args of[{mouthWidth:-.04},{mouthWidth:.02},{browSample:SAMPLE},{noseSample:NOSE},{eyeSample:EYE}]){
  assert.equal((await f.actor.facialGeometry.set(args)).applied,false);assert.equal(f.f.meshes[0].geometry,current);
 }
 f.actor.facialGeometry.dispose();
});
await check('two-actors-sharing-source-remain-isolated',async()=>{
 const source=glb(path.join(root,'assets-source/m2-male-face-v1/generated/avatar.vrm')),a=fixture(source),b=fixture(source,a.geometries);
 const ga=createFacialGeometry({vrm:a.vrm,avatarSha256:source.sha}),gb=createFacialGeometry({vrm:b.vrm,avatarSha256:source.sha}),original=b.meshes[0].geometry;
 await ga.set({mouthWidth:.04});assert.equal(b.meshes[0].geometry,original);await gb.set({mouthWidth:.04});assert.notEqual(a.meshes[0].geometry,b.meshes[0].geometry);ga.dispose();assert.notEqual(b.meshes[0].geometry,original);gb.dispose();assert.equal(b.meshes[0].geometry,original);
});
await check('file-roundtrip-new-jaw-identity-and-no-2pct',async()=>{
 const a=controllerFixture();await a.actor.facialGeometry.set({mouthWidth:.04});const text=exportAppearanceRecipe(a.controller);fs.writeFileSync(path.join(out,'male-jaw-mouth04.recipe.json'),text);
 const b=controllerFixture();assert.equal((await importAppearanceRecipe(b.controller,text)).applied,true);assert.equal(exportAppearanceRecipe(b.controller),text);
 const record=JSON.parse(text);record.geometry.mouthWidth=.02;await assert.rejects(async()=>importAppearanceRecipe(b.controller,JSON.stringify(record)),/离散/);
 assert.equal(exportAppearanceRecipe(b.controller),text);a.actor.facialGeometry.dispose();b.actor.facialGeometry.dispose();
});
for(const kind of ['base','position','normal','morph','expected','manifest-pin','recipe-bytes'])await check('reject-'+kind,async()=>{
 const source=glb(path.join(root,'assets-source/m2-male-face-v1/generated/avatar.vrm')),f=fixture(source),original=f.meshes[0].geometry;
 if(kind==='position')f.meshes[0].geometry.attributes.position.array[0]+=.001;
 if(kind==='normal')f.meshes[0].geometry.attributes.normal.array[0]+=.001;
 if(kind==='morph')f.meshes[0].geometry.morphAttributes.position[0].array[0]+=.001;
 const oldFetch=fetch;if(kind==='manifest-pin')globalThis.fetch=async url=>{const response=await oldFetch(url);if(String(url).endsWith('recipe-manifest.json')){const data=await response.json();data.recipes[0].sha256='0'.repeat(64);return Response.json(data);}return response;};
 if(kind==='recipe-bytes')globalThis.fetch=async url=>String(url).endsWith('male-jaw-mouth-width.recipe.json')?new Response('{}'):oldFetch(url);
 const geom=createFacialGeometry({vrm:f.vrm,avatarSha256:kind==='base'?'0'.repeat(64):source.sha});
 try{const r=await geom.set({mouthWidth:.04,...(kind==='expected'?{expectedRecipeSha256:'0'.repeat(64)}:{})});assert.equal(r.applied,false);assert.equal(f.meshes[0].geometry,original);}finally{globalThis.fetch=oldFetch;geom.dispose();}
});
await check('pending-prepare-reset-and-dispose-cancel',async()=>{
 for(const action of ['reset','dispose']){const f=controllerFixture(),original=f.f.meshes[0].geometry,gate=f.delay('geometry'),job=f.actor.facialGeometry.set({mouthWidth:.04});await gate.started;
 if(action==='reset')await f.actor.facialGeometry.set({reset:true});else f.actor.facialGeometry.dispose();gate.release();assert.equal((await job).cancelled,true);assert.equal(f.f.meshes[0].geometry,original);f.actor.facialGeometry.dispose();}
});
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
for(const filename of ['facial-geometry.js','appearance-recipe.js','appearance-workbench.js'])fs.writeFileSync(path.join(out,filename),fs.readFileSync(path.join(root,'prototype/src',filename)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Actual jaw Face attributes/source final + actual geometry and recipe functions; mock rendering, colors, control. No GPU/visual claims.',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),recipeSha256:sha(fs.readFileSync(path.join(root,'assets-source/m2-male-jaw-mouth-v1/male-jaw-mouth-width.recipe.json'))),numbers,result},null,2));
console.log(JSON.stringify({passed:result.length,out}));
