import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { createFacialGeometry } from '../prototype/src/facial-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'assets-source/face-parameters-v1');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'recipe-manifest.json')));
let gate=null,fetchCount=0,networkFailure=false,tamper=false; let tamperBrowIdentity=false;
globalThis.fetch=async url=>{
 fetchCount++;if(gate)await gate;
 if(networkFailure&&String(url).includes('face-eye'))return new Response('unavailable',{status:503});
 let bytes=fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1)));
 if(tamper&&String(url).endsWith('-eye.recipe.json'))bytes=Buffer.concat([bytes,Buffer.from(' ')]);
 return new Response(bytes);
};

function glb(filename){
 const bytes=fs.readFileSync(filename),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
 function acc(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Type=types[a.componentType],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];assert(!a.sparse&&!v.byteStride);const b=bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*size*Type.BYTES_PER_ELEMENT);return {array:new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),size};}
 return {doc,acc,sha:sha(bytes)};
}
function fixture(source,geometries=null,shared=false){
 const scene=new THREE.Group(),face=source.doc.meshes.find(m=>m.name.startsWith('Face')),meshes=[];
 const attributes=new Map();
 const attribute=(i)=>{if(shared&&attributes.has(i))return attributes.get(i);const a=source.acc(i),value=new THREE.BufferAttribute(a.array,a.size);attributes.set(i,value);return value;};
 if(!geometries)geometries=face.primitives.map(p=>{
  const g=new THREE.BufferGeometry();
  for(const [semantic,i]of Object.entries(p.attributes)){
   const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'},a=source.acc(i);if(names[semantic])g.setAttribute(names[semantic],attribute(i));
  }
  const index=source.acc(p.indices);g.setIndex(attribute(p.indices));
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return attribute(t.POSITION);});if(p.targets[0].NORMAL!==undefined)g.morphAttributes.normal=p.targets.map(t=>{const a=source.acc(t.NORMAL);return attribute(t.NORMAL);});g.computeBoundingBox();g.computeBoundingSphere();return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}


const {pathToFileURL}=await import('node:url');
const evidence=path.join(root,'evidence/face-prepare-snapshots-v1'),oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');
const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const oldBytes=fs.readFileSync(path.join(evidence,'baseline-facial-geometry.js')),profileBytes=fs.readFileSync(path.join(evidence,'baseline-facial-geometry-profiles.js'));
const baselineText=oldBytes.toString().replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`).replace("from './facial-geometry-profiles.js'",`from 'data:text/javascript;base64,${profileBytes.toString('base64')}'`);
const {createFacialGeometry:baselineCreate}=await import('data:text/javascript;base64,'+Buffer.from(baselineText).toString('base64'));


const cases=[];
for(const mode of ['reset','dispose']){
 const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm')),f=fixture(source,null,true),originals=f.meshes.map(m=>m.geometry);
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha});
 let enter,release,paused=false;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
 const originalDigest=crypto.webcrypto.subtle.digest;
 crypto.webcrypto.subtle.digest=async function(algorithm,bytes){
  if(!paused&&bytes instanceof Float32Array){paused=true;enter();await hold;}
  return originalDigest.call(this,algorithm,bytes);
 };
 try{
  const pending=api.set({mouthWidth:.04});await entered;
  if(mode==='reset')await api.set({reset:true});else api.dispose();
  release();const r=await pending;assert.equal(r.applied,false);assert.equal(r.cancelled,true);
  f.meshes.forEach((m,i)=>assert.equal(m.geometry,originals[i]));
  if(mode==='reset'){assert.equal((await api.set({mouthWidth:-.04})).applied,true);await api.set({reset:true});f.meshes.forEach((m,i)=>assert.equal(m.geometry,originals[i]));}
  cases.push({mode,gate:'actual source position digest pending inside prepare transaction',cancelled:true,originalReferencesRestored:true});
 }finally{crypto.webcrypto.subtle.digest=originalDigest;api.dispose();release();}
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),cases},null,2));
console.log(JSON.stringify({out,cases}));
