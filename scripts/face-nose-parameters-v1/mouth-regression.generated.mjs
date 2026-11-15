// Existing regression with only report destination changed; sourceSHA bd80d9b2559b56e591d16bf4fbb8e3b49e954d6cad901744e153c57396834ae1
// Frozen legacy runner with only report destination changed. Input SHA256: 336c4b21e4fda6c12cb09e511f5ddd0a508d280d8b57c967fded2885b874ba42
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { createFacialGeometry } from '../../prototype/src/facial-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base=path.join(root,'assets-source/face-parameters-v1');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'recipe-manifest.json')));
let gate=null,fetchCount=0,networkFailure=false,tamper=false;
globalThis.fetch=async url=>{
 fetchCount++;if(gate)await gate;if(networkFailure)return new Response('unavailable',{status:503});
 const bytes=fs.readFileSync(path.join(base,path.basename(url)));
 return new Response(tamper&&url!== '/assets/face-parameters-v1/recipe-manifest.json'?Buffer.concat([bytes,Buffer.from(' ')]):bytes);
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
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}
const all=[];
for(const sex of ['female','male']){
 const source=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 const f=fixture(source),other=fixture(source,f.geometries),api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha});
 const initial=f.geometries.map(g=>sha(Buffer.from(g.attributes.position.array.buffer))),influences=f.meshes.map(m=>m.morphTargetInfluences);
 const rec=manifest.recipes.find(r=>r.baseAvatarSha256===source.sha);let maxError=0;
 for(const value of [-.04,.04,-.04]){
  assert.equal((await api.set({mouthWidth:value})).applied,true);
  const endpoint=glb(path.join(base,`generated/${sex}-mouth-width-${Math.round((1+value)*100)}-v1/avatar.vrm`));
  const p=endpoint.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0],pos=endpoint.acc(p.attributes.POSITION).array;
  const actual=f.meshes[0].geometry.attributes.position.array;
  for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-pos[i]));
  assert(maxError<3e-7);assert.equal(api.getState().geometryIdentity.recipeSha256,rec.sha256);
  for(let j=0;j<p.targets.length;j++){
   const expected=endpoint.acc(p.targets[j].POSITION).array,values=f.meshes[0].geometry.morphAttributes.position[j].array;
   for(let i=0;i<values.length;i++)assert(Math.abs(expected[i]-values[i])<3e-7);
  }
  assert(f.meshes.every((mesh,i)=>mesh.morphTargetInfluences===influences[i]));
  assert(other.meshes.every((mesh,i)=>mesh.geometry===f.geometries[Math.floor(i/2)]));
  assert.deepEqual(f.geometries.map(g=>sha(Buffer.from(g.attributes.position.array.buffer))),initial);
  const recipe=JSON.parse(fs.readFileSync(path.join(base,rec.file)));
  const affected=new Set();for(const g of f.geometries){const ix=g.index.array;for(let i=0;i<ix.length;i+=3)if([ix[i],ix[i+1],ix[i+2]].some(v=>recipe.weights[v]>0))[ix[i],ix[i+1],ix[i+2]].forEach(v=>affected.add(v));}
  for(const mesh of f.meshes){
   const g=mesh.geometry,n=g.attributes.normal.array;assert(n.every(Number.isFinite));assert.equal(g.morphAttributes.normal.length,p.targets.length);
   const original=f.geometries[Math.floor(f.meshes.indexOf(mesh)/2)].attributes.normal.array;
   for(let i=0;i<recipe.positionCount;i++)if(!affected.has(i))for(let c=0;c<3;c++)assert.equal(n[i*3+c],original[i*3+c]);
   for(const attr of g.morphAttributes.normal)assert(attr.array.every(Number.isFinite));
   assert(g.boundingSphere.radius>0&&Number.isFinite(g.boundingSphere.radius));
  }
 }
 const before=f.meshes[0].geometry;assert.equal((await api.set({mouthWidth:0.01,expectedRecipeSha256:'0'.repeat(64)})).applied,false);assert.equal(f.meshes[0].geometry,before);assert.equal(api.getState().mouthWidth,-.04);
 assert.equal((await api.set({mouthWidth:0})).applied,true);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 assert.equal((await api.set({mouthWidth:.041})).applied,false);
 await api.set({mouthWidth:.04});api.dispose();assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));assert.equal((await api.set({mouthWidth:.04})).applied,false);
 all.push({sex,sourceSha256:source.sha,recipeSha256:rec.sha256,maxEndpointErrorM:maxError,passed:['actual-source-9-primitives-with-outlines','all-morph-endpoints','no-accumulation','shared-original-instance-isolation','expression-bindings-retained','merged-normals-finite-and-unaffected-preserved','bounds','expected-version-rejection-before-mutation','reset-exact-reference','dispose-restore','range-reject']});
}
const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
for(const mode of ['reset-pending','dispose-pending','last-wins','http-failure','sha-failure','unknown-body','attribute-mismatch']){
 const f=fixture(source);let release;gate=['reset-pending','dispose-pending','last-wins'].includes(mode)?new Promise(resolve=>release=resolve):null;
 networkFailure=mode==='http-failure';tamper=mode==='sha-failure';
 if(mode==='attribute-mismatch')f.geometries[0].attributes.position.array[0]+=.001;
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:mode==='unknown-body'?'0'.repeat(64):source.sha});
 const pending=api.set({mouthWidth:.04});let final;
 if(mode==='reset-pending'){await api.set({mouthWidth:0});release();}
 if(mode==='dispose-pending'){api.dispose();release();}
 if(mode==='last-wins'){final=api.set({mouthWidth:-.04});release();}
 const result=await pending;if(final)assert.equal((await final).applied,true);
 assert.equal(result.applied,false);
 if(['reset-pending','dispose-pending','last-wins'].includes(mode))assert.equal(result.cancelled,true);
 if(mode==='last-wins')assert.equal(api.getState().mouthWidth,-.04);else assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 api.dispose();all.push({scenario:mode,pass:true,result});gate=null;networkFailure=false;tamper=false;
}
const out={scope:'CPU Three objects built from actual original VRM attributes/morphs; real runtime module; mocked HTTP transport; no WebGL/VRMLoader visual acceptance',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),fetchCount,results:all};
fs.writeFileSync(path.join(root,'evidence/facial-nose-runtime-v1/mouth-regression.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
