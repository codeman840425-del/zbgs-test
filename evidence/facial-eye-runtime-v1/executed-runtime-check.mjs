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
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}

const EYE='aperture-width101-v1',NOSE='tip-forward05-v1',BROW='height1-spacing1-v1',results=[];
const maxDiff=(a,b)=>{assert.equal(a.length,b.length);let m=0;for(let i=0;i<a.length;i++)m=Math.max(m,Math.abs(a[i]-b[i]));return m;};
function referenceNormals(position,indices){
 const n=new Float64Array(position.length);
 for(let t=0;t<indices.length;t+=3){const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
  const u=[position[b]-position[a],position[b+1]-position[a+1],position[b+2]-position[a+2]],v=[position[c]-position[a],position[c+1]-position[a+1],position[c+2]-position[a+2]];
  const q=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const i of[a,b,c])for(let j=0;j<3;j++)n[i+j]+=q[j];
 }
 for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2]);if(l>1e-20)for(let j=0;j<3;j++)n[i+j]/=l;}return n;
}
for(const sex of ['female','male']){
 const source=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`)),f=fixture(source),peer=fixture(source,f.geometries);
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha}),original=f.geometries[0],refs=f.meshes.map(m=>m.morphTargetInfluences);
 const endpoint=glb(path.join(root,`assets-source/face-eye-sample-v1/generated/${sex}-eye-aperture-width101-v1/avatar.vrm`));
 const ep=endpoint.doc.meshes.find(m=>m.name.startsWith('Face')).primitives[0],endPos=endpoint.acc(ep.attributes.POSITION).array,endNormal=endpoint.acc(ep.attributes.NORMAL).array;
 const recipe=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-eye-sample-v1/${sex}-eye.recipe.json`)));
 const brow=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-brow-parameters-v1/${sex}-brow.runtime.json`)));
 const nose=JSON.parse(fs.readFileSync(path.join(root,`prototype/public/assets/face-nose-parameters-v1/${sex}-nose.recipe.json`)));
 const mouth=JSON.parse(fs.readFileSync(path.join(base,`${sex}-mouth-width.recipe.json`)));
 assert.equal(endpoint.sha,recipe.finalEndpointSha256);assert.deepEqual(await api.set({eyeSample:EYE}),{applied:true});
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
 assert(normalError<1e-5 && absoluteExpressionNormalError<1e-5,`Float source/runtime normal equivalence ${positionError} ${normalError} ${absoluteExpressionPositionError} ${absoluteExpressionNormalError}`);
 const indices=f.geometries.flatMap(g=>[...g.index.array]),mouthNormals=new Set();
 for(let t=0;t<indices.length;t+=3)if(indices.slice(t,t+3).some(i=>mouth.weights[i]>0))indices.slice(t,t+3).forEach(i=>mouthNormals.add(i));
 let combinationPositionError=0,combinationNormalError=0;const combinations=[];
 for(const width of[-.04,0,.04])for(const brows of[false,true])for(const noses of[false,true]){
  assert.equal((await api.set({mouthWidth:width,browSample:brows?BROW:'none',noseSample:noses?NOSE:'none',eyeSample:EYE})).applied,true);
  const g=f.meshes[0].geometry,affected=new Set(recipe.normalNeighborhoodVertices);
  if(width)for(const i of mouthNormals)affected.add(i);if(noses)for(const i of nose.normalNeighborhoodVertices)affected.add(i);
  for(let j=-1;j<ep.targets.length;j++){
   // Independent full absolute-shape affine, not a copy of runtime delta logic.
   const expected=new Float32Array(original.attributes.position.array.length);
   for(let k=0;k<expected.length;k++)expected[k]=original.attributes.position.array[k]+(j<0?0:original.morphAttributes.position[j].array[k]);
   for(let i=0;i<mouth.positionCount;i++){
    if(width&&mouth.weights[i])expected[i*3]=mouth.centerX+(expected[i*3]-mouth.centerX)*(1+width*mouth.weights[i]);
    if(recipe.xScale[i]!==1)expected[i*3]=recipe.centerX[i]+(expected[i*3]-recipe.centerX[i])*recipe.xScale[i];
    if(noses)for(let c=0;c<3;c++)expected[i*3+c]+=nose.translationVectors[i][c];
    if(brows)for(let c=0;c<3;c++)expected[i*3+c]+=.001*(brow.heightVectors[i][c]+brow.spacingVectors[i][c]);
   }
   // Positions are Float32 but absolute expressions need not round at addition in actual GPU math.
   for(let k=0;k<expected.length;k++)combinationPositionError=Math.max(combinationPositionError,Math.abs(g.attributes.position.array[k]+(j<0?0:g.morphAttributes.position[j].array[k])-expected[k]));
   // Runtime/source normals are evaluated on Float32(base+delta), independent
   // area-weighted accumulation here uses Float64, matching the source checker.
   const actualAbsolute=Float64Array.from(g.attributes.position.array,(v,k)=>v+(j<0?0:g.morphAttributes.position[j].array[k]));
   const n=referenceNormals(actualAbsolute,indices);
   for(let k=0;k<n.length;k++){
    const expectedN=affected.has(Math.floor(k/3))?n[k]:original.attributes.normal.array[k];
    const actualN=g.attributes.normal.array[k]+(j<0?0:g.morphAttributes.normal[j].array[k]);
    combinationNormalError=Math.max(combinationNormalError,Math.abs(actualN-expectedN));
   }
  }
  combinations.push({width,brows,noses,eye:EYE});
 }
 assert(combinationPositionError<3e-7&&combinationNormalError<1e-5,`${combinationPositionError}, ${combinationNormalError}`);
 // Independent resets retain the other domains, then exact original restore.
 for(const [input,key,value]of [[{mouthWidth:0},'mouthWidth',0],[{browSample:'none'},'browSample','none'],[{noseSample:'none'},'noseSample','none']]){
  await api.set(input);assert.equal(api.getState()[key],value);assert.equal(api.getState().eyeSample,EYE);
 }
 assert(maxDiff(f.meshes[0].geometry.attributes.position.array,endPos)<3e-7);
 await api.set({mouthWidth:.04,browSample:BROW,noseSample:NOSE});await api.set({eyeSample:'none'});
 assert.equal(api.getState().mouthWidth,.04);assert.equal(api.getState().browSample,BROW);assert.equal(api.getState().noseSample,NOSE);
 for(const i of recipe.normalNeighborhoodVertices)for(let c=0;c<3;c++){
  const g=f.meshes[0].geometry;assert.equal(g.attributes.normal.array[i*3+c],original.attributes.normal.array[i*3+c]);
  for(const a of g.morphAttributes.normal)assert.equal(a.array[i*3+c],0);
 }
 const cpuSamples=[];
 for(let repeat=0;repeat<3;repeat++)for(const eyeOn of[false,true]){
  await api.set({reset:true});const start=performance.now();await api.set({mouthWidth:.04,browSample:BROW,noseSample:NOSE,eyeSample:eyeOn?EYE:'none'});cpuSamples.push({repeat,eyeOn,cpuPromiseMs:performance.now()-start});
 }
 const before=f.meshes[0].geometry;assert.equal((await api.set({eyeSample:EYE,expectedEyeRecipeSha256:'0'.repeat(64)})).applied,false);assert.equal(f.meshes[0].geometry,before);
 assert(peer.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));assert(f.meshes.every((m,i)=>m.morphTargetInfluences===refs[i]));
 assert.equal((await api.set({eyeSample:'width102-v1'})).applied,false);await api.set({reset:true});assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 await api.set({eyeSample:EYE});const g=f.meshes[0].geometry;let disposed=0;g.addEventListener('dispose',()=>disposed++);api.dispose();assert.equal(disposed,1);assert(f.meshes.every((m,i)=>m.geometry===f.geometries[Math.floor(i/2)]));
 results.push({sex,sourceSha256:source.sha,endpointSha256:endpoint.sha,expressionCount:ep.targets.length,positionError,normalError,absoluteExpressionPositionError,absoluteExpressionNormalError,combinationPositionError,combinationNormalError,combinations,cpuSamples,cpuScope:"Same Node process, prepared recipes, no render/GPU prewarm; 3-domain vs 4-domain allocation+normal work, not UI longframe acceptance",checks:['all-primitives-outlines-vs-independent-source-endpoint','all-shapes-position-normal','four-domain-combinations','independent-domain-reset','eye-off-restores-original-eye-normals','shared-original-isolation','expression-binding-references','expected-version-reject','unknown-sample-reject','reset-dispose-exact-original-references']});
}
const source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
for(const mode of ['reset-pending','dispose-pending','latest-mouth-wins','http-failure','sha-failure','source-morph-mismatch','source-normal-mismatch','source-uv-mismatch','prepareRender-reset','prepareRender-failure','unknown-body']){
 const f=fixture(source);let release,enter;const entered=new Promise(r=>enter=r),renderGate=new Promise(r=>release=r);
 if(mode==='source-morph-mismatch')for(const g of f.geometries)g.morphAttributes.position[0].array[0]+=.001;
 if(mode==='source-normal-mismatch')for(const g of f.geometries)g.attributes.normal.array[0]+=.001;
 if(mode==='source-uv-mismatch')for(const g of f.geometries)g.attributes.uv.array[0]+=.001;
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:mode==='unknown-body'?'0'.repeat(64):source.sha,prepareRender:mode.startsWith('prepareRender')?async()=>{enter();if(mode==='prepareRender-failure')throw Error('injected preflight failure');await renderGate;}:undefined});
 if(mode==='http-failure'||mode==='sha-failure')await api.set({mouthWidth:.04,browSample:BROW,noseSample:NOSE});
 networkFailure=mode==='http-failure';tamper=mode==='sha-failure';
 if(['reset-pending','dispose-pending','latest-mouth-wins'].includes(mode))gate=new Promise(r=>release=r);
 const prior=f.meshes[0].geometry,pending=api.set({eyeSample:EYE});let newest;
 if(mode==='reset-pending'){await api.set({reset:true});release();}
 if(mode==='dispose-pending'){api.dispose();release();}
 if(mode==='latest-mouth-wins'){newest=api.set({mouthWidth:-.04});release();}
 if(mode==='prepareRender-reset'){await entered;await api.set({reset:true});release();}
 const result=await pending;assert.equal(result.applied,false);
 if(newest){assert.equal((await newest).applied,true);assert.equal(api.getState().eyeSample,EYE);assert.equal(api.getState().mouthWidth,-.04);}
 else assert.equal(f.meshes[0].geometry,prior);
 if(networkFailure||tamper){assert.equal(api.getState().mouthWidth,.04);assert.equal(api.getState().browSample,BROW);assert.equal(api.getState().noseSample,NOSE);assert.equal(api.getState().eyeSample,'none');}
 api.dispose();gate=null;networkFailure=false;tamper=false;results.push({scenario:mode,pass:true,result});
}
const out=path.join(root,'evidence/facial-eye-runtime-v1');fs.mkdirSync(out,{recursive:true});
const report={scope:'Actual VRM attributes and independent source endpoint; CPU Three fixtures/mock HTTP. No GPU/visual acceptance.',moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),manifestSha256:sha(fs.readFileSync(path.join(root,'prototype/public/assets/face-eye-sample-v1/recipe-manifest.json'))),normalTolerance:1e-5,positionToleranceM:3e-7,results};
fs.writeFileSync(path.join(out,'runtime-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
