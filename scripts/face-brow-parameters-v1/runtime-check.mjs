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
let gate=null,fetchCount=0,networkFailure=false,tamper=false; let tamperBrowIdentity=false;
globalThis.fetch=async url=>{
 fetchCount++;if(gate)await gate;if(networkFailure && String(url).includes('face-brow'))return new Response('unavailable',{status:503});
 let bytes=fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1)));
 if(tamper && String(url).endsWith('.runtime.json'))bytes=Buffer.concat([bytes,Buffer.from(' ')]);
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
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}
const SAMPLE='height1-spacing1-v1',results=[];
const difference=(a,b)=>{assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
for(const sex of ['female','male']){
 const source=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 const f=fixture(source),peer=fixture(source,f.geometries),api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha});
 const orig=f.geometries[0],originalHashes=f.geometries.map(g=>sha(Buffer.from(g.attributes.position.array.buffer)));
 const influences=f.meshes.map(m=>m.morphTargetInfluences);
 const endpoint=glb(path.join(root,`assets-source/face-brow-parameters-v1/generated/${sex}-brow-height1-spacing1-v1/avatar.vrm`));
 const ep=endpoint.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0];
 const expectedBrow=endpoint.acc(ep.attributes.POSITION).array;
 const browRecipe=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-brow-parameters-v1/${sex}-brow.runtime.json`)));
 assert.equal((await api.set({browSample:SAMPLE})).applied,true);
 let maxEndpointErrorM=0,maxAllExpressionErrorM=0;
 for(const mesh of f.meshes){
  maxEndpointErrorM=Math.max(maxEndpointErrorM,difference(mesh.geometry.attributes.position.array,expectedBrow));
  for(let j=0;j<ep.targets.length;j++)maxAllExpressionErrorM=Math.max(maxAllExpressionErrorM,difference(mesh.geometry.morphAttributes.position[j].array,endpoint.acc(ep.targets[j].POSITION).array));
  const original=f.geometries[Math.floor(f.meshes.indexOf(mesh)/2)];
  assert.equal(difference(mesh.geometry.attributes.normal.array,original.attributes.normal.array),0);
  assert.equal(mesh.geometry.morphAttributes.normal,undefined);
 }
 assert(maxEndpointErrorM<3e-7 && maxAllExpressionErrorM<3e-7);
 for(const mouthWidth of [-.04,.04]){
  assert.equal((await api.set({mouthWidth})).applied,true);
  assert.equal(api.getState().browSample,SAMPLE);
  const mouth=glb(path.join(base,`generated/${sex}-mouth-width-${Math.round((1+mouthWidth)*100)}-v1/avatar.vrm`));
  const mp=mouth.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0],pos=mouth.acc(mp.attributes.POSITION).array;
  for(const i of browRecipe.browVertices)for(let c=0;c<3;c++)pos[i*3+c]=expectedBrow[i*3+c];
  const current=f.meshes[0].geometry;assert(difference(current.attributes.position.array,pos)<3e-7);
  for(let j=0;j<mp.targets.length;j++){
   const delta=mouth.acc(mp.targets[j].POSITION).array;
   const actualAbsolute=current.attributes.position.array.map((v,i)=>v+current.morphAttributes.position[j].array[i]);
   const expectedAbsolute=pos.map((v,i)=>v+delta[i]);
   maxAllExpressionErrorM=Math.max(maxAllExpressionErrorM,difference(actualAbsolute,expectedAbsolute));
  }
  const before=f.meshes[0].geometry;
  assert.equal((await api.set({expectedBrowRecipeSha256:'0'.repeat(64)})).applied,false);
  assert.equal(f.meshes[0].geometry,before);assert.equal(api.getState().mouthWidth,mouthWidth);
  assert.equal((await api.set({browSample:'none'})).applied,true);assert.equal(api.getState().mouthWidth,mouthWidth);
  assert(difference(f.meshes[0].geometry.attributes.position.array,mouth.acc(mp.attributes.POSITION).array)<3e-7);
  assert.equal((await api.set({browSample:SAMPLE})).applied,true);
  assert.equal((await api.set({mouthWidth:0})).applied,true);assert.equal(api.getState().browSample,SAMPLE);
  assert(difference(f.meshes[0].geometry.attributes.position.array,expectedBrow)<3e-7);
 }
 assert(maxAllExpressionErrorM<3e-7);
 assert(f.meshes.every((m,i)=>m.morphTargetInfluences===influences[i]));
 assert(peer.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 assert.deepEqual(f.geometries.map(g=>sha(Buffer.from(g.attributes.position.array.buffer))),originalHashes);
 assert.equal((await api.set({browSample:'height-1-spacing1-v1'})).applied,false);
 await api.set({reset:true});assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 await api.set({mouthWidth:.04,browSample:SAMPLE});const owned=[...new Set(f.meshes.map(m=>m.geometry))];let disposed=0;owned.forEach(g=>g.addEventListener('dispose',()=>disposed++));
 api.dispose();assert.equal(disposed,owned.length);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 results.push({sex,baseSha256:source.sha,maxEndpointErrorM,maxAllExpressionErrorM,expressionCount:ep.targets.length,checks:['actual-nine-primitives-and-outline','source-brow-export','all-expression-mouth-brow-composition-both-mouth-endpoints','independent-reset','exact-normal-preservation-brow-only','exact-original-references-reset-dispose','shared-original-instance-isolation','expression-influence-reference','version-reject-no-mutation','unsupported-sample-reject','owned-geometries-disposed']});
}
const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
for(const mode of ['reset-pending','dispose-pending','partial-latest-wins','brow-http-failure','brow-sha-failure','unknown-body','prepareRender-reset','prepareRender-failure']){
 const f=fixture(source);let release,renderEntered;
 const entered=new Promise(resolve=>renderEntered=resolve);
 const renderGate=new Promise(resolve=>release=resolve);
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:mode==='unknown-body'?'0'.repeat(64):source.sha,
  prepareRender:mode.startsWith('prepareRender')?async()=>{renderEntered();if(mode==='prepareRender-failure')throw Error('Injected shader preflight failure');await renderGate;}:undefined});
 if(['reset-pending','dispose-pending','partial-latest-wins'].includes(mode))gate=new Promise(resolve=>release=resolve);
 networkFailure=mode==='brow-http-failure';tamper=mode==='brow-sha-failure';
 // Prepare a prior mouth result for genuine atomic failure retention.
 if(networkFailure||tamper){assert.equal((await api.set({mouthWidth:.04})).applied,true);}
 const prior=f.meshes[0].geometry;
 const pending=api.set({browSample:SAMPLE});let final;
 if(mode==='reset-pending'){await api.set({reset:true});release();}
 if(mode==='dispose-pending'){api.dispose();release();}
 if(mode==='partial-latest-wins'){final=api.set({mouthWidth:-.04});release();}
 if(mode==='prepareRender-reset'){await entered;await api.set({reset:true});release();}
 const result=await pending;
 if(final){assert.equal((await final).applied,true);assert.equal(api.getState().mouthWidth,-.04);assert.equal(api.getState().browSample,SAMPLE);}
 assert.equal(result.applied,false);
 if(['reset-pending','dispose-pending','partial-latest-wins','prepareRender-reset'].includes(mode))assert.equal(result.cancelled,true);
 if(networkFailure||tamper){assert.equal(f.meshes[0].geometry,prior);assert.equal(api.getState().mouthWidth,.04);assert.equal(api.getState().browSample,'none');}
 if(!final&&!networkFailure&&!tamper)assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 api.dispose();gate=null;networkFailure=false;tamper=false;results.push({scenario:mode,pass:true,result});
}
const output=path.join(root,'evidence/facial-brow-runtime-v1');fs.mkdirSync(output,{recursive:true});
const report={scope:'Actual source VRM attributes plus actual runtime module, CPU Three fixture; no WebGL, texture appearance or skin clearance acceptance',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),manifestSha256:sha(fs.readFileSync(path.join(root,'prototype/public/assets/face-brow-parameters-v1/recipe-manifest.json'))),fetchCount,results};
fs.writeFileSync(path.join(output,'runtime-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
