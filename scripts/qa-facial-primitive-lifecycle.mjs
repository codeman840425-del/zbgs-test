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
function fixture(source,geometries=null){
 const scene=new THREE.Group(),face=source.doc.meshes.find(m=>m.name.startsWith('Face')),meshes=[];
 if(!geometries)geometries=face.primitives.map(p=>{
  const g=new THREE.BufferGeometry();
  for(const [semantic,i]of Object.entries(p.attributes)){
   const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'},a=source.acc(i);if(names[semantic])g.setAttribute(names[semantic],new THREE.BufferAttribute(a.array,a.size));
  }
  const index=source.acc(p.indices);g.setIndex(new THREE.BufferAttribute(index.array,1));
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});if(p.targets[0].NORMAL!==undefined)g.morphAttributes.normal=p.targets.map(t=>{const a=source.acc(t.NORMAL);return new THREE.BufferAttribute(a.array,a.size);});g.computeBoundingBox();g.computeBoundingSphere();return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}



const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm')),cases=[];
{
 const f=fixture(source),g=fixture(source,f.geometries),a=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha}),b=createFacialGeometry({vrm:g.vrm,avatarSha256:source.sha});
 await a.set({mouthWidth:.04});await b.set({eyeSample:'aperture-width101-v1'});
 const bGeo=g.meshes.map(m=>m.geometry),bValues=bGeo.map(x=>sha(x.attributes.position.array)),aGeo=f.meshes.map(m=>m.geometry);
 for(let i=0;i<f.meshes.length;i++)if(aGeo[i]!==f.geometries[Math.floor(i/2)]&&bGeo[i]!==f.geometries[Math.floor(i/2)])assert.notEqual(aGeo[i],bGeo[i]);
 a.dispose();for(let i=0;i<g.meshes.length;i++){assert.equal(g.meshes[i].geometry,bGeo[i]);assert.equal(sha(g.meshes[i].geometry.attributes.position.array),bValues[i]);}
 await b.set({reset:true});g.meshes.forEach((m,i)=>assert.equal(m.geometry,f.geometries[Math.floor(i/2)]));b.dispose();cases.push({name:'two-simultaneously-active-actors-share-only-immutable-originals',passed:true});
}
{
 const f=fixture(source),api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha});await api.set({mouthWidth:.04});const before=f.meshes.map(m=>m.geometry),fetchOriginal=fetch;
 globalThis.fetch=async url=>String(url).includes('face-eye-sample-v1')?new Response('offline',{status:503}):fetchOriginal(url);
 try{const r=await api.set({eyeSample:'aperture-width101-v1'});assert.equal(r.applied,false);assert.match(r.reason,/503/);f.meshes.forEach((m,i)=>assert.equal(m.geometry,before[i]));assert.equal(api.getState().mouthWidth,.04);assert.equal(api.getState().eyeSample,'none');}finally{globalThis.fetch=fetchOriginal;}
 assert.equal((await api.set({eyeSample:'aperture-width101-v1'})).applied,true);api.dispose();cases.push({name:'new-domain-http-failure-keeps-prior-scoped-geometries-and-retry-works',passed:true});
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),cases},null,2));console.log(JSON.stringify({out,passed:cases.length}));
