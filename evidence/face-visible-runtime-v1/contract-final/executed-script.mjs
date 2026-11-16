import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {glb,fixture,sha} from './face-visible-fixture.mjs';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {captureAppearanceRecipe,validateAppearanceRecipe,applyAppearanceRecipe,exportAppearanceRecipe,importAppearanceRecipe} from '../prototype/src/appearance-recipe.js';
import {LEGACY_FACIAL_PALETTE_VERSION} from '../prototype/src/facial-palette-contract.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const at=process.argv.indexOf('--out');assert(at>=0);const out=path.resolve(process.argv[at+1]);assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
let blocker=null,tamper=null;
globalThis.fetch=async url=>{
 if(blocker&&String(url).includes(blocker.match))await blocker.promise;
 let bytes=fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1)));
 if(tamper&&String(url).includes(tamper))bytes=Buffer.concat([bytes,Buffer.from(' ')]);
 return new Response(bytes);
};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const importCode=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const before=path.join(root,'evidence/face-visible-runtime-v1/source-before');
const oldProfile=pathToFileURL(path.join(before,'facial-geometry-profiles.js')).href;
const oldCode=fs.readFileSync(path.join(before,'facial-geometry.js'),'utf8').replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`).replace("from './facial-geometry-profiles.js'",`from '${oldProfile}'`);
const oldCreate=(await importCode(oldCode)).createFacialGeometry;
function bufferSignature(f){return f.geometries.map(g=>[...Object.values(g.attributes),...(g.morphAttributes.position||[]),...(g.morphAttributes.normal||[]),g.index].map(a=>sha(a.array)));}
function sameOutputs(a,b){
 for(let i=0;i<a.meshes.length;i++){
  const x=a.meshes[i].geometry,y=b.meshes[i].geometry;
  for(const n of ['position','normal'])assert.equal(sha(x.attributes[n].array),sha(y.attributes[n].array));
  for(const n of ['position','normal']){assert.equal(x.morphAttributes[n]?.length||0,y.morphAttributes[n]?.length||0);for(let j=0;j<(x.morphAttributes[n]?.length||0);j++)assert.equal(sha(x.morphAttributes[n][j].array),sha(y.morphAttributes[n][j].array));}
 }
}
const rows=[],source=(sex)=>glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
const reference=jsonNew('evidence/face-visible-runtime-v1/reference-1/manifest.json');
function jsonNew(f){return JSON.parse(fs.readFileSync(path.join(root,f)));}
for(const item of reference.rows){
 const f=fixture(source(item.sex)),raw=bufferSignature(f),api=createFacialGeometry({vrm:f.vrm,avatarSha256:item.sourceSha256});
 assert((await api.set(item.args)).applied);const bytes=fs.readFileSync(path.join(root,'evidence/face-visible-runtime-v1/reference-1',item.file));assert.equal(sha(bytes),item.sha256);
 const blob=zlib.gunzipSync(bytes),data={};for(const [key,v]of Object.entries(item.layout))data[key]=new Float32Array(blob.buffer.slice(blob.byteOffset+v.offset,blob.byteOffset+v.offset+v.floatCount*4));
 let maxPosition=0,maxNormal=0,active=0;const count=data.position.length;
 for(let mi=0;mi<f.meshes.length;mi+=2){
  const g=f.meshes[mi].geometry,orig=f.geometries[mi/2],vertices=g===orig?[...new Set(g.index.array)]:Array.from({length:g.attributes.position.count},(_,i)=>i);if(g!==orig)active++;
  for(let j=-1;j<g.morphAttributes.position.length;j++)for(const v of vertices)for(let c=0;c<3;c++){
   const k=v*3+c;
   maxPosition=Math.max(maxPosition,Math.abs(g.attributes.position.array[k]+(j<0?0:g.morphAttributes.position[j].array[k])-data.position[k]-(j<0?0:data.morph[j*count+k])));
   maxNormal=Math.max(maxNormal,Math.abs(g.attributes.normal.array[k]+(j<0?0:g.morphAttributes.normal?.[j]?.array[k]||0)-data.normal[k]-(j<0?0:data.morphNormal[j*count+k])));
  }
 }
 assert(maxPosition<3e-7);assert(maxNormal<1e-5,{case:item.name,maxNormal});assert.deepEqual(bufferSignature(f),raw);
 api.dispose();assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));rows.push({case:item.sex+'-'+item.name,kind:'independent-parsed-recipe-all-shapes',maxPosition,maxNormal,active});
}
for(const sex of ['female','male']){
 const src=source(sex),a=fixture(src),b=fixture(src),api=createFacialGeometry({vrm:a.vrm,avatarSha256:src.sha}),old=oldCreate({vrm:b.vrm,avatarSha256:src.sha});
 const oldArgs={mouthWidth:.025,browSample:'height1-spacing1-v1',noseSample:'tip-forward05-v1',eyeSample:'aperture-width101-v1'};
 assert((await api.set(oldArgs)).applied);assert((await old.set(oldArgs)).applied);sameOutputs(a,b);const oldPin=api.getState().recipeSha256;
 const tests=[{mouthWidth:.12},{mouthWidth:-.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'},{mouthWidth:.04},{mouthWidth:.025,...oldArgs},{reset:true}];
 for(const args of tests){assert((await api.set(args)).applied);if(args.mouthWidth===.025){sameOutputs(a,b);assert.equal(api.getState().recipeSha256,oldPin);}}
 assert(a.meshes.every((m,i)=>m.geometry===a.geometries[Math.floor(i/2)]));assert((await api.set({mouthWidth:.12})).applied);
 const stable=a.meshes.map(m=>m.geometry);
 for(const args of [{mouthWidth:.06},{mouthWidth:-.08},{mouthWidth:NaN},{mouthWidth:.12,expectedRecipeSha256:oldPin},{browSample:'height2-spacing2-v2'},{noseSample:'tip-forward3-v3'},{eyeSample:'aperture-width110-v3'}]){assert.equal((await api.set(args)).applied,false);assert.deepEqual(a.meshes.map(m=>m.geometry),stable);}
 assert.equal(old.getState().mouthWidth,.025); // No cross-instance effect.
 const g=deferred();blocker={match:'face-brow-visible-v2',...g};
 // Use a fresh actor with only legacy brow cached, so an old network request can lose.
 const c=fixture(src),ca=createFacialGeometry({vrm:c.vrm,avatarSha256:src.sha});assert((await ca.set({browSample:'height1-spacing1-v1'})).applied);
 const stale=ca.set({browSample:'height3-spacing3-v2'});assert((await ca.set({browSample:'height1-spacing1-v1',mouthWidth:.025})).applied);g.resolve();blocker=null;assert((await stale).cancelled);assert.equal(ca.getState().browSample,'height1-spacing1-v1');assert.equal(ca.getState().mouthWidth,.025);
 api.dispose();old.dispose();ca.dispose();rows.push({case:sex+'-legacy-byte-equivalence-switches-and-rejections',passed:true});
}
for(const mode of ['reset','dispose','failure']){
 const src=source('female'),f=fixture(src),gate=deferred();let pending=false;
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha,prepareRender:async()=>{if(pending){if(mode==='failure')throw Error('injected compile failure');await gate.promise;}}});
 assert((await api.set({mouthWidth:.025})).applied);const stable=f.meshes.map(m=>m.geometry);pending=true;
 const job=api.set({mouthWidth:.12});await new Promise(r=>setTimeout(r,15));
 if(mode==='reset')assert((await api.set({reset:true})).applied);if(mode==='dispose')api.dispose();gate.resolve();const result=await job;
 if(mode==='failure'){assert.equal(result.applied,false);assert.deepEqual(f.meshes.map(m=>m.geometry),stable);}else{assert(result.cancelled);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));}
 api.dispose();rows.push({case:'prepareRender-'+mode,passed:true});
}
for(const defect of ['hash','primitive','morph']){
 const src=source('male'),f=fixture(src);if(defect==='primitive')f.geometries[3].index.array[0]++;if(defect==='morph')f.geometries[2].morphAttributes.position[0].array[0]+=.001;
 tamper=defect==='hash'?'male-mouth-width.recipe.json':null;const api=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha});assert.equal((await api.set({mouthWidth:.12})).applied,false);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));api.dispose();tamper=null;rows.push({case:'reject-'+defect,passed:true});
}
{
 const src=glb(path.join(root,'assets-source/m2-male-face-v1/generated/avatar.vrm')),f=fixture(src),api=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha});
 assert.deepEqual(api.getState().mouthSupportedValues,[0,.04]);assert.deepEqual(api.getState().mouthEndpointValues,[]);assert((await api.set({mouthWidth:.04})).applied);
 for(const args of [{mouthWidth:.12},{mouthWidth:.025},{browSample:'height3-spacing3-v2'},{noseSample:'tip-forward2-v2'},{eyeSample:'aperture-width105-v2'}])assert.equal((await api.set(args)).applied,false);
 api.dispose();const unknown=createFacialGeometry({vrm:f.vrm,avatarSha256:'f'.repeat(64)});assert.equal((await unknown.set({mouthWidth:.12})).applied,false);unknown.dispose();rows.push({case:'jaw-and-unknown-no-expanded-admission',passed:true});
}
function controllerFor(sex){
 const src=source(sex),f=fixture(src),geometry=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha});
 let state={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original',revision:0,availableStyles:['original'],replacementSHA256:null};
 const actor={profile:{bodyType:sex,sha256:src.sha},facialGeometry:geometry,appearance:{getState:()=>({...state}),set:async value=>{state={...state,...value,revision:state.revision+1};return{applied:true};}},config:{outfits:[{index:0,role:'base'}],manifestUrl:'/actual-fixture-equipment.json'},getEquipmentRecipe:()=>[{id:'immutable-outfit-fixture',sha256:'a'.repeat(64)}]};
 const controller={actor,outfit:0,outfitRevision:0,command:()=>{controller.outfitRevision++;}};return controller;
}
for(const sex of ['female','male']){
 const c=controllerFor(sex);assert((await c.actor.facialGeometry.set({mouthWidth:.025,browSample:'height1-spacing1-v1'})).applied);
 const legacy=captureAppearanceRecipe(c);legacy.schema='workbench-appearance-recipe-v4';legacy.rulesVersion='workbench-appearance-rules-v4';legacy.paletteVersion=LEGACY_FACIAL_PALETTE_VERSION;const oldGeometry=structuredClone(legacy.geometry);
 assert((await c.actor.facialGeometry.set({reset:true})).applied);const restored=await applyAppearanceRecipe(c,legacy);assert(restored.applied&&restored.notice.includes('新版瞳色'));assert.deepEqual(captureAppearanceRecipe(c).geometry,oldGeometry);
 assert((await c.actor.facialGeometry.set({mouthWidth:.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'})).applied);
 const file=exportAppearanceRecipe(c),record=JSON.parse(file);assert.equal(record.schema,'workbench-appearance-recipe-v5');assert((await c.actor.facialGeometry.set({reset:true})).applied);assert((await importAppearanceRecipe(c,file)).applied);assert.equal(exportAppearanceRecipe(c),file);
 const bad=structuredClone(record);bad.schema='workbench-appearance-recipe-v4';bad.rulesVersion='workbench-appearance-rules-v4';assert.throws(()=>validateAppearanceRecipe(c,bad));
 const wrong=structuredClone(record);wrong.geometry.recipeSha256=oldGeometry.recipeSha256;await assert.rejects(()=>applyAppearanceRecipe(c,wrong));assert.equal(exportAppearanceRecipe(c),file);
 const wrongBrow=structuredClone(record);wrongBrow.geometry.browRecipeSha256=oldGeometry.browRecipeSha256;await assert.rejects(()=>applyAppearanceRecipe(c,wrongBrow));assert.equal(exportAppearanceRecipe(c),file);
 c.actor.facialGeometry.dispose();rows.push({case:sex+'-v4-legacy-v5-file-roundtrip-wrong-identities-rollback',passed:true});
}
const moduleFiles=['facial-geometry.js','facial-geometry-profiles.js','facial-geometry-contract.js','appearance-recipe.js'];
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({modules:Object.fromEntries(moduleFiles.map(n=>[n,sha(fs.readFileSync(path.join(root,'prototype/src',n)))])),rows,limits:['CPU fixture with actual source attributes and real functions; not browser/material or visual approval.','Retained Blender male-mouth88 normal threshold failure is separately recorded, never declared passed here.']},null,2));
console.log(JSON.stringify({out,passed:rows.length,maxPosition:Math.max(...rows.map(r=>r.maxPosition||0)),maxNormal:Math.max(...rows.map(r=>r.maxNormal||0))}));
