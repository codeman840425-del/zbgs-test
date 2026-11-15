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



const vm=await import('node:vm');
const foundation=fs.readFileSync(path.join(root,'prototype/src/foundation-avatar.js'),'utf8');
const start=foundation.indexOf('export function createFaceGeometryWarmup'),end=foundation.indexOf('export async function loadFoundationAvatar',start);
assert(start>=0&&end>start);const actual=foundation.slice(start,end).replace('export function','function');
const createWarm=vm.runInNewContext('('+actual+')',{THREE});
const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const report=[],source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
function rendererFixture(delayed=false){
 const calls=[],disposed=new Map();
 return{calls,disposed,renderer:{compileAsync(staging,camera,targetScene){
  const materials=[];staging.traverse(m=>{if(m.isMesh)for(const mat of(Array.isArray(m.material)?m.material:[m.material])){materials.push(mat);disposed.set(mat,0);mat.addEventListener('dispose',()=>disposed.set(mat,disposed.get(mat)+1));}});
  let resolve,reject;const promise=delayed?new Promise((yes,no)=>{resolve=yes;reject=no;}):Promise.resolve();calls.push({children:staging.children.length,materials,resolve,reject,targetScene});return promise;
 }}};
}
{
 const f=fixture(source),r=rendererFixture(),scene=new THREE.Scene(),warm=createWarm(r.renderer,scene),parts=[];
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:ps=>{parts.push(ps);return warm.prepare(ps);}});
 const scenarios=[
 [{mouthWidth:.04},1,4],
 [{mouthWidth:-.04},1,0],
 [{mouthWidth:0,eyeSample:'aperture-width101-v1'},2,6],
 [{eyeSample:'none',browSample:'height1-spacing1-v1'},3,2],
 [{mouthWidth:.04,eyeSample:'aperture-width101-v1'},4,2],
 [{reset:true},4,0],
 [{mouthWidth:.04},4,0],
 ];
 const records=[];
 for(const [args,count,newParts] of scenarios){const previous=r.calls.length;assert.equal((await api.set(args)).applied,true);assert.equal(r.calls.length,count);if(newParts)assert.equal(r.calls.at(-1).children,newParts);records.push({args,newCompileCalls:r.calls.length-previous,compilePartCount:newParts});}
 const lastParts=parts.at(-1),original=lastParts[0].mesh.material;original.needsUpdate=true;
 await warm.prepare(lastParts);assert.equal(r.calls.length,5);assert.equal(r.calls.at(-1).children,1);
 const replacement=original.clone();lastParts[0].mesh.material=replacement;await warm.prepare(lastParts);assert.equal(r.calls.length,6);assert.equal(r.calls.at(-1).children,1);
 lastParts[0].mesh.material=original;
 const variant={...lastParts[0],geometry:lastParts[0].geometry.clone()};variant.geometry.morphTargetsRelative=false;await warm.prepare([variant]);assert.equal(r.calls.length,7);
 variant.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(variant.geometry.attributes.position.count*3),3));await warm.prepare([variant]);assert.equal(r.calls.length,8);
 for(const n of r.disposed.values())assert.equal(n,0);
 warm.dispose();warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);
 await assert.rejects(warm.prepare(lastParts),/人物已卸载/);api.dispose();variant.geometry.dispose();replacement.dispose();
 report.push({case:'actual-geometry-mouth-eye-brow-overlap-reset-parts',records,materialVersionAndIdentityAndRelativeAndAttributeChanges:true,allMaterialsReleasedOnce:true});
}
{
 const f=fixture(source),r=rendererFixture(true),warm=createWarm(r.renderer,new THREE.Scene());
 const A={mesh:f.meshes[0],geometry:f.meshes[0].geometry},B={mesh:f.meshes[2],geometry:f.meshes[2].geometry};
 const pa=warm.prepare([A]);await Promise.resolve();assert.equal(r.calls.length,1);
 const pab=warm.prepare([A,B]);const failed=assert.rejects(pab,/injected B/);await Promise.resolve();assert.equal(r.calls.length,2);assert.equal(r.calls[1].children,1);
 r.calls[1].reject(Error('injected B'));await failed;for(const mat of r.calls[0].materials)assert.equal(r.disposed.get(mat),0);for(const mat of r.calls[1].materials)assert.equal(r.disposed.get(mat),1);
 r.calls[0].resolve();await pa;await warm.prepare([A]);assert.equal(r.calls.length,2);
 const retry=warm.prepare([A,B]);await Promise.resolve();assert.equal(r.calls.length,3);assert.equal(r.calls[2].children,1);
 warm.dispose();for(const mat of r.calls[0].materials)assert.equal(r.disposed.get(mat),1);for(const mat of r.calls[2].materials)assert.equal(r.disposed.get(mat),0);
 r.calls[2].resolve();await retry;for(const n of r.disposed.values())assert.equal(n,1);
 report.push({case:'concurrent-batch-failure-preserves-stable-and-pending-then-retry-dispose',passed:true,calls:r.calls.length});
}
{
 const f=fixture(source),a=rendererFixture(),b=rendererFixture(),wa=createWarm(a.renderer,new THREE.Scene()),wb=createWarm(b.renderer,new THREE.Scene()),parts=[{mesh:f.meshes[0],geometry:f.meshes[0].geometry}];
 await wa.prepare(parts);await wb.prepare(parts);assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);wa.dispose();for(const n of b.disposed.values())assert.equal(n,0);wb.dispose();for(const n of b.disposed.values())assert.equal(n,1);
 report.push({case:'per-actor-independent-cache-and-disposal',passed:true});
}
{
 const f=fixture(source),r=rendererFixture(),warm=createWarm(r.renderer,new THREE.Scene()),part={mesh:f.meshes[0],geometry:f.meshes[0].geometry};
 const original=f.meshes[2].material.clone;f.meshes[2].material.clone=()=>{throw Error('material clone failed');};
 await assert.rejects(warm.prepare([part,{mesh:f.meshes[2],geometry:f.meshes[2].geometry}]),/material clone failed/);assert.equal(r.calls.length,0);
 f.meshes[2].material.clone=original;await warm.prepare([part]);assert.equal(r.calls.length,1);warm.dispose();
 report.push({case:'synchronous-stage-failure-does-not-poison-cache',passed:true});
}
{
 const f=fixture(source),r=rendererFixture(),warm=createWarm(r.renderer,new THREE.Scene());
 const promise=warm.prepare([{mesh:f.meshes[0],geometry:f.meshes[0].geometry}]);warm.dispose();
 await assert.rejects(promise,/人物已卸载/);assert.equal(r.calls.length,0);
 report.push({case:'dispose-before-compile-microtask-does-not-start-renderer',passed:true});
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'actual-helper.js'),actual);fs.writeFileSync(path.join(out,'foundation-avatar.tested.js'),foundation);
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({foundationSha:sha(Buffer.from(foundation)),scope:'Exact exported helper extracted from product source, real Three objects/actual Face inputs; renderer.compileAsync controlled mock (no GPU, no program/cache performance claims).',report},null,2));
console.log(JSON.stringify({out,passed:report.length}));
