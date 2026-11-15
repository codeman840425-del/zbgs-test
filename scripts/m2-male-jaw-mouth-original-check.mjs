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




const {pathToFileURL}=await import('node:url');
const baselineArg=process.argv.indexOf('--baseline'),baselineFile=path.resolve(root,baselineArg>=0?process.argv[baselineArg+1]:'evidence/m2-male-jaw-mouth-runtime-v1/original-byte-equivalence/baseline-module.js');
const oldBytes=fs.readFileSync(baselineFile);
const oldText=oldBytes.toString().replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`);
assert(!oldText.includes("from './"),'baseline changed; review relative imports');
const {createFacialGeometry:oldCreate}=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
const outputArg=process.argv.indexOf('--out');if(outputArg<0)throw Error('--out NEW_DIR required');
const out=path.resolve(root,process.argv[outputArg+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const checks=[];
for(const sex of ['female','male']){
 const source=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`)),a=fixture(source),b=fixture(source);
 const old=oldCreate({vrm:a.vrm,avatarSha256:source.sha}),now=createFacialGeometry({vrm:b.vrm,avatarSha256:source.sha});
 for(const mouthWidth of[-.04,0,.04])for(const extra of[false,true]){
  const args={mouthWidth,browSample:extra?SAMPLE:'none',noseSample:extra?NOSE:'none',eyeSample:extra?EYE:'none'};
  assert.equal((await old.set(args)).applied,true);assert.equal((await now.set(args)).applied,true);
  for(let mi=0;mi<a.meshes.length;mi++){
   const ga=a.meshes[mi].geometry,gb=b.meshes[mi].geometry;
   for(const key of ['position','normal']){assert.equal(sha(ga.attributes[key].array),sha(gb.attributes[key].array));
    assert.equal(ga.morphAttributes[key]?.length,gb.morphAttributes[key]?.length);
    for(let j=0;j<(ga.morphAttributes[key]?.length||0);j++)assert.equal(sha(ga.morphAttributes[key][j].array),sha(gb.morphAttributes[key][j].array));
   }
  }
  checks.push({sex,...args,byteEqual:true});
 }
 old.dispose();now.dispose();
}
fs.writeFileSync(path.join(out,'baseline-module.js'),oldBytes);fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baselineSHA:sha(oldBytes),currentSHA:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),checks},null,2));
console.log(JSON.stringify({passed:checks.length,out}));
