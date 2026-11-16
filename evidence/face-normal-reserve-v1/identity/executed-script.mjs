import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {glb,fixture} from './face-visible-fixture.mjs';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {reserveFaceNormalLayout} from '../prototype/src/face-normal-reservation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||'');assert(process.argv[2]&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
const rows=[];
for(const sex of ['female','male']){
 const src=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 for(const mode of ['unknown-body','preexisting-normal','tampered-position','tampered-morph','wrong-recipe']){
  const f=fixture(src);
  if(mode==='unknown-body'){
   assert.equal(reserveFaceNormalLayout(f.vrm,'0'.repeat(64)).reserved,false);assert(f.geometries.every(g=>g.morphAttributes.normal===undefined));rows.push({sex,mode,passed:true});continue;
  }
  if(mode==='preexisting-normal'){
   f.geometries.forEach(g=>g.morphAttributes.normal=[new THREE.BufferAttribute(new Float32Array(g.attributes.position.array.length).fill(.25),3)]);
   assert.throws(()=>reserveFaceNormalLayout(f.vrm,src.sha),/Unexpected original face morph layout/);assert(f.geometries.every(g=>g.morphAttributes.normal[0].array[0]===.25));rows.push({sex,mode,passed:true});continue;
  }
  reserveFaceNormalLayout(f.vrm,src.sha);
  if(mode==='tampered-position')f.geometries.forEach(g=>g.attributes.position.array[0]+=.001);
  if(mode==='tampered-morph')f.geometries.forEach(g=>g.morphAttributes.position[0].array[0]+=.001);
  const api=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha}),result=await api.set({mouthWidth:-.12,...(mode==='wrong-recipe'?{expectedRecipeSha256:'0'.repeat(64)}:{})});
  assert.equal(result.applied,false);assert.equal(api.getState().mouthWidth,0);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));api.dispose();rows.push({sex,mode,passed:true,reason:result.reason});
 }
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({rows,scope:'Small fail-closed CPU checks; source SHA and recipe checks not disabled by reservation.'},null,2));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));console.log(JSON.stringify({passed:rows.length}));
