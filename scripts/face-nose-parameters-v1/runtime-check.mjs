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
 fetchCount++;if(gate)await gate;
 if(networkFailure&&String(url).includes('face-nose'))return new Response('unavailable',{status:503});
 let bytes=fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1)));
 if(tamper&&String(url).endsWith('-nose.recipe.json'))bytes=Buffer.concat([bytes,Buffer.from(' ')]);
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
const NOSE='tip-forward05-v1',BROW='height1-spacing1-v1',results=[];
const maxDiff=(a,b)=>{assert.equal(a.length,b.length);let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-b[i]));return m;};
for(const sex of ['female','male']){
 const source=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`)),f=fixture(source),peer=fixture(source,f.geometries);
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha}),original=f.geometries[0],refs=f.meshes.map(m=>m.morphTargetInfluences);
 const endpoint=glb(path.join(root,`assets-source/face-nose-parameters-v1/generated/${sex}-nose-tip-forward05-v1/avatar.vrm`));
 const ep=endpoint.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0],endPos=endpoint.acc(ep.attributes.POSITION).array,endNormal=endpoint.acc(ep.attributes.NORMAL).array;
 const recipe=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-nose-parameters-v1/${sex}-nose.recipe.json`)));
 const brow=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-brow-parameters-v1/${sex}-brow.runtime.json`)));
 assert.equal(endpoint.sha,recipe.finalEndpointSha256);assert.equal((await api.set({noseSample:NOSE})).applied,true);
 let positionError=0,normalError=0,absoluteExpressionPositionError=0,absoluteExpressionNormalError=0;
 for(const mesh of f.meshes){
  const g=mesh.geometry;positionError=Math.max(positionError,maxDiff(g.attributes.position.array,endPos));normalError=Math.max(normalError,maxDiff(g.attributes.normal.array,endNormal));
  for(const i of recipe.protectedVertices)for(let c=0;c<3;c++)assert.equal(g.attributes.position.array[i*3+c],original.attributes.position.array[i*3+c]);
  const changedNormals=new Set(recipe.normalNeighborhoodVertices);
  for(let i=0;i<recipe.positionCount;i++)if(!changedNormals.has(i))for(let c=0;c<3;c++){
   assert.equal(g.attributes.normal.array[i*3+c],original.attributes.normal.array[i*3+c]);
   for(const n of g.morphAttributes.normal)assert.equal(n.array[i*3+c],0);
  }
  for(let j=0;j<ep.targets.length;j++){
   const p=endpoint.acc(ep.targets[j].POSITION).array,n=endpoint.acc(ep.targets[j].NORMAL).array;
   for(let k=0;k<endPos.length;k++){
    absoluteExpressionPositionError=Math.max(absoluteExpressionPositionError,Math.abs((g.attributes.position.array[k]+g.morphAttributes.position[j].array[k])-(endPos[k]+p[k])));
    absoluteExpressionNormalError=Math.max(absoluteExpressionNormalError,Math.abs((g.attributes.normal.array[k]+g.morphAttributes.normal[j].array[k])-(endNormal[k]+n[k])));
   }
  }
 }
 assert(positionError<3e-7 && absoluteExpressionPositionError<3e-7);
 assert(normalError<1e-5 && absoluteExpressionNormalError<1e-5,'Float source/runtime normal equivalence');
 let combinationPositionError=0,combinationNormalError=0;
 const noseDomain=new Set(recipe.normalNeighborhoodVertices);
 for(const width of [-.04,.04]){
  await api.set({mouthWidth:width,noseSample:'none',browSample:'none'});
  const mouthOnly=f.meshes[0].geometry,normals=mouthOnly.attributes.normal.array.slice(),normalMorphs=mouthOnly.morphAttributes.normal.map(a=>a.array.slice());
  const mouth=glb(path.join(base,`generated/${sex}-mouth-width-${Math.round((1+width)*100)}-v1/avatar.vrm`)),mp=mouth.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0];
  const expectedPosition=mouth.acc(mp.attributes.POSITION).array;
  for(const i of recipe.changedVertices)for(let c=0;c<3;c++)expectedPosition[i*3+c]=endPos[i*3+c];
  for(const i of brow.browVertices)for(let c=0;c<3;c++)expectedPosition[i*3+c]+=.001*(brow.heightVectors[i][c]+brow.spacingVectors[i][c]);
  await api.set({noseSample:NOSE,browSample:BROW});
  const composed=f.meshes[0].geometry;
  combinationPositionError=Math.max(combinationPositionError,maxDiff(composed.attributes.position.array,expectedPosition));
  for(let j=-1;j<mp.targets.length;j++){
   const p=j<0?null:mouth.acc(mp.targets[j].POSITION).array;
   const noseDelta=j<0?null:endpoint.acc(ep.targets[j].NORMAL).array;
   for(let k=0;k<expectedPosition.length;k++){
    const actualP=composed.attributes.position.array[k]+(j<0?0:composed.morphAttributes.position[j].array[k]);
    combinationPositionError=Math.max(combinationPositionError,Math.abs(actualP-(expectedPosition[k]+(p?p[k]:0))));
    const expectedN=noseDomain.has(Math.floor(k/3))?endNormal[k]+(noseDelta?noseDelta[k]:0):normals[k]+(j<0?0:normalMorphs[j][k]);
    const actualN=composed.attributes.normal.array[k]+(j<0?0:composed.morphAttributes.normal[j].array[k]);
    combinationNormalError=Math.max(combinationNormalError,Math.abs(actualN-expectedN));
   }
  }
  // Each domain reset retains the other two and recomputes from originals.
  await api.set({mouthWidth:0});assert.equal(api.getState().noseSample,NOSE);assert.equal(api.getState().browSample,BROW);
  await api.set({browSample:'none'});assert.equal(api.getState().noseSample,NOSE);assert(maxDiff(f.meshes[0].geometry.attributes.position.array,endPos)<3e-7);
  const before=f.meshes[0].geometry;assert.equal((await api.set({expectedNoseRecipeSha256:'0'.repeat(64)})).applied,false);assert.equal(f.meshes[0].geometry,before);
  await api.set({mouthWidth:width,browSample:BROW});await api.set({noseSample:'none'});assert.equal(api.getState().mouthWidth,width);assert.equal(api.getState().browSample,BROW);
  const cleared=f.meshes[0].geometry;for(const i of noseDomain)for(let c=0;c<3;c++){
   assert.equal(cleared.attributes.normal.array[i*3+c],original.attributes.normal.array[i*3+c]);
   for(const a of cleared.morphAttributes.normal)assert.equal(a.array[i*3+c],0);
  }
 }
 assert(combinationPositionError<3e-7&&combinationNormalError<1e-5);
 assert(peer.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));assert(f.meshes.every((m,i)=>m.morphTargetInfluences===refs[i]));
 assert.equal((await api.set({noseSample:'tip-back05-v1'})).applied,false);await api.set({reset:true});assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 await api.set({noseSample:NOSE});const g=f.meshes[0].geometry;let disposed=0;g.addEventListener('dispose',()=>disposed++);api.dispose();assert.equal(disposed,1);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 results.push({sex,sourceSha256:source.sha,endpointSha256:endpoint.sha,expressionCount:ep.targets.length,positionError,normalError,absoluteExpressionPositionError,absoluteExpressionNormalError,combinationPositionError,combinationNormalError,checks:['all-primitives-and-outlines','all-authored-position-and-normal-expressions-vs-independent-export','both-mouth-endpoints-plus-brow-plus-nose','nose-off-clears-only-nose-normal-neighborhood','three-domain-independent-reset','shared-original-isolation','expression-binding-references','expected-version-reject','unknown-sample-reject','reset-dispose-exact-original-references']});
}
const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
for(const mode of ['reset-pending','dispose-pending','latest-mouth-wins','http-failure','sha-failure','source-morph-mismatch','source-normal-mismatch','prepareRender-reset','prepareRender-failure']){
 const f=fixture(source);let release,enter;const entered=new Promise(r=>enter=r),renderGate=new Promise(r=>release=r);
 if(mode==='source-morph-mismatch')for(const g of f.geometries)g.morphAttributes.position[0].array[0]+=.001;
 if(mode==='source-normal-mismatch')for(const g of f.geometries)g.attributes.normal.array[0]+=.001;
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:mode.startsWith('prepareRender')?async()=>{enter();if(mode==='prepareRender-failure')throw Error('injected preflight failure');await renderGate;}:undefined});
 if(mode==='http-failure'||mode==='sha-failure'){await api.set({mouthWidth:.04,browSample:BROW});}
 networkFailure=mode==='http-failure';tamper=mode==='sha-failure';
 if(['reset-pending','dispose-pending','latest-mouth-wins'].includes(mode))gate=new Promise(r=>release=r);
 const prior=f.meshes[0].geometry,pending=api.set({noseSample:NOSE});let newest;
 if(mode==='reset-pending'){await api.set({reset:true});release();}
 if(mode==='dispose-pending'){api.dispose();release();}
 if(mode==='latest-mouth-wins'){newest=api.set({mouthWidth:-.04});release();}
 if(mode==='prepareRender-reset'){await entered;await api.set({reset:true});release();}
 const result=await pending;assert.equal(result.applied,false);
 if(newest){assert.equal((await newest).applied,true);assert.equal(api.getState().noseSample,NOSE);assert.equal(api.getState().mouthWidth,-.04);}
 else assert.equal(f.meshes[0].geometry,prior);
 if(networkFailure||tamper){assert.equal(api.getState().mouthWidth,.04);assert.equal(api.getState().browSample,BROW);assert.equal(api.getState().noseSample,'none');}
 api.dispose();gate=null;networkFailure=false;tamper=false;results.push({scenario:mode,pass:true,result});
}
const out=path.join(root,'evidence/facial-nose-runtime-v1');fs.mkdirSync(out,{recursive:true});
const report={scope:'Actual VRM attributes, independent source POSITION/NORMAL endpoint, actual runtime; CPU Three objects/mock HTTP only, no GPU/visual acceptance',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),manifestSha256:sha(fs.readFileSync(path.join(root,'prototype/public/assets/face-nose-parameters-v1/recipe-manifest.json'))),normalTolerance:1e-5,positionToleranceM:3e-7,results};
fs.writeFileSync(path.join(out,'runtime-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
