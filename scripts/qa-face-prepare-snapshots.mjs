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

const EYE='aperture-width101-v1',BROW='height1-spacing1-v1',NOSE='tip-forward05-v1';
const results=[],failures=[],lifecycle=[];
const bytesEqual=(a,b)=>assert.equal(sha(a),sha(b));
function geometryHashes(g){return {attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,sha(a.array||a.data.array)])),index:sha(g.index.array),morph:Object.fromEntries(Object.entries(g.morphAttributes).map(([k,as])=>[k,as.map(a=>sha(a.array||a.data.array))]))};}
function compare(a,b,aparts,bparts){
 assert.deepEqual(a.api.getState(),b.api.getState());
 assert.deepEqual(aparts.map(parts=>parts.map(p=>a.meshes.indexOf(p.mesh))),bparts.map(parts=>parts.map(p=>b.meshes.indexOf(p.mesh))));
 for(let i=0;i<a.meshes.length;i++){
  const ga=a.meshes[i].geometry,gb=b.meshes[i].geometry;
  assert.deepEqual(geometryHashes(ga),geometryHashes(gb));
  assert.equal(ga===a.geometries[Math.floor(i/2)],gb===b.geometries[Math.floor(i/2)]);
  assert.deepEqual(ga.boundingBox,gb.boundingBox);assert.deepEqual(ga.boundingSphere,gb.boundingSphere);
  assert.equal(b.meshes[i].morphTargetInfluences,b.originalInfluences[i]);
  // All base/delta buffers were compared byte-for-byte above. This also checks
  // the same finite simultaneous expression mixture over the complete buffer.
  for(const kind of ['position','normal'])for(let k=0;k<ga.attributes[kind].array.length;k++){
   let x=ga.attributes[kind].array[k],y=gb.attributes[kind].array[k];
   for(let j=0;j<ga.morphAttributes.position.length;j++){
    const w=j%11===0?.73:j%7===0?.2:0;
    x+=(ga.morphAttributes[kind]?.[j]?.array[k]??0)*w;y+=(gb.morphAttributes[kind]?.[j]?.array[k]??0)*w;
   }
   assert.equal(x,y);
  }
 }
}
function sourceFile(sex){return sex==='jaw'?'assets-source/m2-male-face-v1/generated/avatar.vrm':`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`;}
for(const sex of ['female','male','jaw'])for(const shared of [false,true]){
 const source=glb(path.join(root,sourceFile(sex))),a=fixture(source,null,shared),b=fixture(source,null,shared),original=b.geometries.map(geometryHashes),aparts=[],bparts=[];
 b.originalInfluences=b.meshes.map(m=>m.morphTargetInfluences);
 a.api=baselineCreate({vrm:a.vrm,avatarSha256:source.sha,prepareRender:async p=>aparts.push(p)});
 b.api=createFacialGeometry({vrm:b.vrm,avatarSha256:source.sha,prepareRender:async p=>bparts.push(p)});
 const combos=[];
 for(const width of sex==='jaw'?[0,.04]:[-.04,0,.04])for(const brow of sex==='jaw'?[false]:[false,true])for(const nose of sex==='jaw'?[false]:[false,true])for(const eye of sex==='jaw'?[false]:[false,true])combos.push({mouthWidth:width,browSample:brow?BROW:'none',noseSample:nose?NOSE:'none',eyeSample:eye?EYE:'none'});
 if(sex!=='jaw')combos.push({reset:true},{mouthWidth:.04},{eyeSample:EYE},{browSample:BROW},{mouthWidth:0});
 for(const args of combos){aparts.length=0;bparts.length=0;assert.equal((await a.api.set(args)).applied,true);assert.equal((await b.api.set(args)).applied,true);compare(a,b,aparts,bparts);}
 assert.deepEqual(b.geometries.map(geometryHashes),original);a.api.dispose();b.api.dispose();b.meshes.forEach((m,i)=>assert.equal(m.geometry,b.geometries[Math.floor(i/2)]));
 results.push({sex,shared,sourceSha256:source.sha,scenarios:combos.length,allSourceAndOutputBuffersByteIdentical:true});
}
// Source gate failures must match the unchanged implementation. No cache may
// stand in for a different primitive's expected identity or independent data.
for(const sex of ['female','jaw'])for(const mode of ['position','uv','index','morph','morphNaN','normal','expectedSHA','interleaved-offset']){
 if(sex==='female'&&mode==='normal'||sex==='jaw'&&mode==='expectedSHA')continue;
 const source=glb(path.join(root,sourceFile(sex))),pair=[fixture(source,null,true),fixture(source,null,true)];
 const originalFetch=globalThis.fetch;
 if(mode==='expectedSHA'){
  const recipeUrl='/assets/face-parameters-v1/female-mouth-width.recipe.json';
  const recipe=JSON.parse(fs.readFileSync(path.join(root,'prototype/public',recipeUrl.slice(1))));
  recipe.primitiveIdentities[1].positionSha256='0'.repeat(64);const replacement=Buffer.from(JSON.stringify(recipe));
  globalThis.fetch=async url=>{
   if(String(url)===recipeUrl)return new Response(replacement);
   if(String(url)==='/assets/face-parameters-v1/recipe-manifest.json'){
    const m=JSON.parse(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));m.recipes.find(r=>r.baseAvatarSha256===source.sha).sha256=sha(replacement);return new Response(JSON.stringify(m));
   }return originalFetch(url);
  };
 }
 for(const f of pair){
  const g=f.geometries[1];
  if(['position','uv','normal'].includes(mode)){const v=g.attributes[mode].clone();v.array[0]+=.001;g.setAttribute(mode,v);}
  if(mode==='index'){const v=g.index.clone();v.array[0]=v.array[0]===0?1:0;g.setIndex(v);}
  if(mode.startsWith('morph')){const v=g.morphAttributes.position[0].clone();v.array[0]=mode==='morphNaN'?NaN:v.array[0]+.001;g.morphAttributes.position=[...g.morphAttributes.position];g.morphAttributes.position[0]=v;}
  if(mode==='interleaved-offset'){
   const base=f.geometries[0].attributes.position,values=new Float32Array(base.count*6);
   for(let i=0;i<base.count;i++)for(let c=0;c<3;c++){values[i*6+c]=base.array[i*3+c];values[i*6+3+c]=base.array[i*3+c]+.001;}
   const data=new THREE.InterleavedBuffer(values,6);
   f.geometries[0].setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,3));
  }
 }
 const ap=baselineCreate({vrm:pair[0].vrm,avatarSha256:source.sha}),bp=createFacialGeometry({vrm:pair[1].vrm,avatarSha256:source.sha});
 try{const a=await ap.set({mouthWidth:.04}),b=await bp.set({mouthWidth:.04});assert.equal(a.applied,false,mode);assert.deepEqual(a,b,mode);failures.push({sex,mode,reason:b.reason,passed:true});}finally{globalThis.fetch=originalFetch;ap.dispose();bp.dispose();}
}
{
 const source=glb(path.join(root,sourceFile('female'))),f=fixture(source,null,true),original=f.geometries.map(geometryHashes),g=f.geometries[1],position=g.attributes.position,uv=f.geometries[0].attributes.uv;
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha});g.setAttribute('position',position.clone());g.attributes.position.array[0]+=.001;
 assert.equal((await api.set({mouthWidth:.04})).applied,false);g.setAttribute('position',position);
 f.geometries[0].setAttribute('uv',uv.clone());f.geometries[0].attributes.uv.array[0]+=.001;
 assert.equal((await api.set({mouthWidth:.04})).applied,false);f.geometries[0].setAttribute('uv',uv);
 assert.equal((await api.set({mouthWidth:.04})).applied,true);api.dispose();assert.deepEqual(f.geometries.map(geometryHashes),original);
 lifecycle.push({case:'failure-retry-fresh-transaction-rechecks-previously-valid-source',passed:true});
}
for(const mode of ['reset-pending','dispose-pending','newer-brow','prepare-failure']){
 const source=glb(path.join(root,sourceFile('female'))),f=fixture(source,null,true),peer=fixture(source,f.geometries),original=f.geometries.map(geometryHashes);
 let release,enter,pending=false;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r),created=new Map(),originalDispose=[];
 f.geometries.forEach(g=>g.addEventListener('dispose',()=>originalDispose.push(g)));
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:async parts=>{for(const {geometry}of parts)if(!created.has(geometry)){created.set(geometry,0);geometry.addEventListener('dispose',()=>created.set(geometry,created.get(geometry)+1));}if(pending){enter();if(mode==='prepare-failure')throw Error('injected');await gate;}}});
 await api.set({mouthWidth:.04});const before=f.meshes.map(m=>m.geometry);pending=true;const job=api.set({eyeSample:EYE});await entered;
 if(mode==='reset-pending')await api.set({reset:true});if(mode==='dispose-pending')api.dispose();
 if(mode==='newer-brow'){pending=false;await api.set({mouthWidth:0,eyeSample:'none',browSample:BROW});}
 release();const r=await job;assert.equal(r.applied,false);
 if(mode==='prepare-failure')f.meshes.forEach((m,i)=>assert.equal(m.geometry,before[i]));else assert.equal(r.cancelled,true);
 peer.meshes.forEach((m,i)=>assert.equal(m.geometry,f.geometries[Math.floor(i/2)]));api.dispose();assert.equal(originalDispose.length,0);for(const n of created.values())assert.equal(n,1);assert.deepEqual(f.geometries.map(geometryHashes),original);
 lifecycle.push({case:mode,passed:true});
}
// Getter counts prove transaction-local sharing, not device performance/heap.
const reads=[];
for(const shared of [false,true]){
 const source=glb(path.join(root,sourceFile('female'))),f=fixture(source,null,shared),peer=fixture(source,f.geometries);let count=0;
 const attrs=new Set(f.geometries.flatMap(g=>[g.attributes.position,g.attributes.uv,g.index,...g.morphAttributes.position]));
 for(const attr of attrs){const old=attr.getComponent;attr.getComponent=function(...args){count++;return old.apply(this,args);};}
 const a=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha}),b=createFacialGeometry({vrm:peer.vrm,avatarSha256:source.sha});
 await a.set({mouthWidth:.04});const first=count;await b.set({mouthWidth:.04});const second=count-first;assert.equal(second,first);assert(first>0);
 const bg=peer.meshes.map(m=>m.geometry);a.dispose();peer.meshes.forEach((m,i)=>assert.equal(m.geometry,bg[i]));b.dispose();
 reads.push({shared,uniqueSourceAttributes:attrs.size,firstActorReads:first,secondActorReads:second,noCrossActorCache:true});
}
assert(reads[1].firstActorReads<reads[0].firstActorReads);
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'candidate-facial-geometry.js'),fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js')));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baselineSHA:sha(oldBytes),candidateSHA:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),scope:'All attribute and every expression POSITION/NORMAL full buffers byte-equal, including inactive primitives; real F/M/jaw, shared and independent attribute fixtures. No GPU/heap/performance claims.',results,failures,lifecycle,reads},null,2));
console.log(JSON.stringify({out,scenarios:results,failures:failures.length,lifecycle:lifecycle.length,reads}));
