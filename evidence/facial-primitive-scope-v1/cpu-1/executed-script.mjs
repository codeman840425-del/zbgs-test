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


const {pathToFileURL}=await import('node:url');
const evidence=path.join(root,'evidence/facial-primitive-scope-v1'),oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');
const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const oldBytes=fs.readFileSync(path.join(evidence,'baseline-facial-geometry.js')),profileBytes=fs.readFileSync(path.join(evidence,'baseline-facial-geometry-profiles.js'));
const baselineText=oldBytes.toString().replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`).replace("from './facial-geometry-profiles.js'",`from 'data:text/javascript;base64,${profileBytes.toString('base64')}'`);
const {createFacialGeometry:baselineCreate}=await import('data:text/javascript;base64,'+Buffer.from(baselineText).toString('base64'));
const EYE='aperture-width101-v1',NOSE='tip-forward05-v1',BROW='height1-spacing1-v1',results=[];
const equal=(a,b)=>assert.equal(sha(a),sha(b));
const component=(g,kind,target,i)=>target<0?g.attributes[kind].array[i]:(g.morphAttributes[kind]?.[target]?.array[i]??0);
function inputsFor(sex){return sex==='jaw'?{file:'assets-source/m2-male-face-v1/generated/avatar.vrm',mouth:'assets-source/m2-male-jaw-mouth-v1/male-jaw-mouth-width.recipe.json'}:{file:`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`,mouth:`assets-source/face-parameters-v1/${sex}-mouth-width.recipe.json`};}
function recipeUnion(sex,source,args){
 const recipe=JSON.parse(fs.readFileSync(path.join(root,inputsFor(sex).mouth))),selected=new Set();
 const face=source.doc.meshes.find(m=>m.name.startsWith('Face'));
 if(args.mouthWidth)for(const p of face.primitives){const idx=source.acc(p.indices).array;for(let i=0;i<idx.length;i+=3){const tri=[idx[i],idx[i+1],idx[i+2]];if(tri.some(v=>recipe.weights[v]>0))tri.forEach(v=>selected.add(v));}}
 for(const [domain,file,field]of[['brow',`prototype/public/assets/face-brow-parameters-v1/${sex}-brow.runtime.json`,'browVertices'],['nose',`prototype/public/assets/face-nose-parameters-v1/${sex}-nose.recipe.json`,'normalNeighborhoodVertices'],['eye',`prototype/public/assets/face-eye-sample-v1/${sex}-eye.recipe.json`,'normalNeighborhoodVertices']])if(args[domain+'Sample']!=='none')for(const v of JSON.parse(fs.readFileSync(path.join(root,file)))[field])selected.add(v);
 return selected;
}
const representation={skippedPrimitiveObservations:0,skippedWithDifferentFullPositionBuffer:0,skippedWithDifferentFullNormalRepresentation:0,referencedComponentsCompared:0};
function compare(a,b,source,args,sex,prepared){
 const union=recipeUnion(sex,source,args),expectedParts=[],active=[];
 for(let mi=0;mi<a.meshes.length;mi++){
  const old=a.meshes[mi].geometry,now=b.meshes[mi].geometry,original=b.geometries[Math.floor(mi/2)],indices=new Set(original.index.array),needed=[...indices].some(v=>union.has(v));
  const originalInfluences=b.influences[mi];assert.equal(b.meshes[mi].morphTargetInfluences,originalInfluences);
  if(needed){
   assert.notEqual(now,original);expectedParts.push(b.meshes[mi]);if(mi%2===0)active.push(Math.floor(mi/2));
   for(const name of Object.keys(old.attributes))equal(old.attributes[name].array,now.attributes[name].array);
   for(const name of ['position','normal']){assert.equal(old.morphAttributes[name]?.length,now.morphAttributes[name]?.length);for(let j=0;j<(old.morphAttributes[name]?.length||0);j++)equal(old.morphAttributes[name][j].array,now.morphAttributes[name][j].array);}
   assert.deepEqual(now.boundingBox,old.boundingBox);assert.deepEqual(now.boundingSphere,old.boundingSphere);
  }else{
   assert.equal(now,original);representation.skippedPrimitiveObservations++;
   if(sha(old.attributes.position.array)!==sha(now.attributes.position.array))representation.skippedWithDifferentFullPositionBuffer++;
   if(old.morphAttributes.normal?.length!==now.morphAttributes.normal?.length||sha(old.attributes.normal.array)!==sha(now.attributes.normal.array))representation.skippedWithDifferentFullNormalRepresentation++;
  }
  equal(old.index.array,now.index.array);
  for(const attribute of ['uv','skinIndex','skinWeight'])equal(old.attributes[attribute].array,now.attributes[attribute].array);
  const count=old.morphAttributes.position.length;
  for(const v of indices)for(let c=0;c<3;c++){
   const i=v*3+c;
   for(const kind of ['position','normal']){
    for(let j=-1;j<count;j++){assert.equal(component(now,kind,j,i),component(old,kind,j,i),`${sex} mesh${mi} ${kind} target${j} vertex${v}`);representation.referencedComponentsCompared++;}
    // A nontrivial simultaneous blend. Coefficient equality above also proves
    // every finite linear blend, without only checking selected presets.
    let x=component(now,kind,-1,i),y=component(old,kind,-1,i);
    for(let j=0;j<count;j++){const w=j%5===0?.37:j%7===0?.81:j%3===0?.12:0;x+=w*component(now,kind,j,i);y+=w*component(old,kind,j,i);}assert.equal(x,y);
   }
  }
  // All actually referenced single-shape positions must remain inside the
  // selected geometry's bounds. Inactive geometry keeps its original bounds.
  for(const v of indices)for(let j=-1;j<count;j++){
   const p=new THREE.Vector3(...[0,1,2].map(c=>component(now,'position',-1,v*3+c)+(j<0?0:component(now,'position',j,v*3+c))));
   assert(now.boundingBox.containsPoint(p)||now.boundingBox.distanceToPoint(p)<1e-7);
   assert(p.distanceTo(now.boundingSphere.center)<=now.boundingSphere.radius+1e-7);
  }
 }
 if(prepared){assert.deepEqual(prepared.map(p=>p.mesh),expectedParts);prepared.forEach(p=>assert.equal(p.geometry,p.mesh.geometry));}
 assert.equal(b.api.getState().facialGeometryCloneCount,active.length);
 return active;
}
for(const sex of ['female','male','jaw']){
 const source=glb(path.join(root,inputsFor(sex).file)),a=fixture(source),b=fixture(source),originalBytes=b.geometries.map(g=>sha(g.attributes.position.array));b.influences=b.meshes.map(m=>m.morphTargetInfluences);
 a.api=baselineCreate({vrm:a.vrm,avatarSha256:source.sha});let prepareCalls=[];
 b.api=createFacialGeometry({vrm:b.vrm,avatarSha256:source.sha,prepareRender:async parts=>{prepareCalls.push(parts);}});
 const combinations=[];
 for(const width of sex==='jaw'?[0,.04]:[-.04,0,.04])for(const brow of sex==='jaw'?[false]:[false,true])for(const nose of sex==='jaw'?[false]:[false,true])for(const eye of sex==='jaw'?[false]:[false,true])combinations.push({mouthWidth:width,browSample:brow?BROW:'none',noseSample:nose?NOSE:'none',eyeSample:eye?EYE:'none'});
 if(sex!=='jaw')combinations.push(...[{mouthWidth:.04},{eyeSample:EYE},{browSample:BROW},{mouthWidth:.04,eyeSample:EYE},{mouthWidth:0}].map(p=>({mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none',...p})));
 const rows=[];
 for(const args of combinations){prepareCalls=[];assert.equal((await a.api.set(args)).applied,true);assert.equal((await b.api.set(args)).applied,true);rows.push({...args,activePrimitiveIndices:compare(a,b,source,args,sex,prepareCalls.at(-1)),prepareCalls:prepareCalls.length});}
 for(let i=0;i<b.geometries.length;i++)assert.equal(sha(b.geometries[i].attributes.position.array),originalBytes[i]);
 a.api.dispose();b.api.dispose();b.meshes.forEach((m,i)=>assert.equal(m.geometry,b.geometries[Math.floor(i/2)]));results.push({sex,sourceSha:source.sha,combinations:rows});
}
const failures=[];
for(const mode of ['reset-pending','dispose-pending','newer-brow','prepare-failure']){
 const source=glb(path.join(root,inputsFor('female').file)),f=fixture(source),peer=fixture(source,f.geometries);let release,enter,pending=false;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),created=new Map(),originalDispose=[];
 f.geometries.forEach(g=>g.addEventListener('dispose',()=>originalDispose.push(g)));
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:async parts=>{for(const {geometry}of parts)if(!created.has(geometry)){created.set(geometry,0);geometry.addEventListener('dispose',()=>created.set(geometry,created.get(geometry)+1));}if(pending){enter();if(mode==='prepare-failure')throw Error('injected');await gate;}}});
 await api.set({mouthWidth:.04});const before=f.meshes.map(m=>m.geometry);pending=true;const job=api.set({eyeSample:EYE});await entered;
 if(mode==='reset-pending')await api.set({reset:true});if(mode==='dispose-pending')api.dispose();
 if(mode==='newer-brow'){pending=false;await api.set({mouthWidth:0,eyeSample:'none',browSample:BROW});}
 release();const r=await job;assert.equal(r.applied,false);
 if(mode==='prepare-failure')f.meshes.forEach((m,i)=>assert.equal(m.geometry,before[i]));else assert.equal(r.cancelled,true);
 peer.meshes.forEach((m,i)=>assert.equal(m.geometry,f.geometries[Math.floor(i/2)]));api.dispose();assert.equal(originalDispose.length,0);for(const n of created.values())assert.equal(n,1);
 failures.push({mode,passed:true,clonesDisposedOnce:created.size});
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'candidate-facial-geometry.js'),fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js')));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baselineSHA:sha(oldBytes),candidateSHA:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),scope:'Actual source buffers and actual baseline/candidate functions. Active primitive whole-buffer byte comparison; inactive original geometry identity + every referenced base/delta strictly identical, missing NORMAL interpreted zero; all expressions/mixed and bounds. No GPU/performance claim.',representation,results,failures},null,2));
console.log(JSON.stringify({out,scenarios:results.map(r=>[r.sex,r.combinations.length]),representation,failures}));
