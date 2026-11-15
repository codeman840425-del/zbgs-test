// Scoped lifecycle/config/identity tests. No browser, renderer or product edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createGarmentMaterialRecipes} from '../../assets-source/m1b/shorts/material-recipe-candidate-v1/src/material-recipes.js';
const dir='assets-source/m1b/shorts/material-recipe-candidate-v1/';
const manifest=JSON.parse(await readFile(dir+'public/assets/m1b/equipment.json','utf8'));
const entry=manifest.items.find(x=>x.id==='m1b-uniform-shorts-v1'),ref=entry.materialRecipes[0];
const bytes=await readFile(dir+'public'+ref.url),recipe=JSON.parse(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const response=b=>({ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
const checks=[];
function fixture(fetchImpl=async()=>response(bytes),customEntry=entry){
 const map=new THREE.DataTexture(new Uint8Array([10,20,30,0,50,60,70,255]),2,1),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2]);
 const originals=recipe.materialNames.map(name=>{const m=new THREE.MeshBasicMaterial({map,alphaTest:.5,side:THREE.DoubleSide});m.name=name;return m;});
 const meshes=[new THREE.SkinnedMesh(geometry,[originals[0]]),new THREE.SkinnedMesh(geometry,originals[1])];
 const slots=meshes.map(m=>m.material),snapshot=JSON.stringify(geometry.toJSON()),source=originals.map(m=>JSON.stringify(m.toJSON()));
 const counts={textures:0,originals:0,clones:0};map.addEventListener('dispose',()=>counts.textures++);originals.forEach(m=>m.addEventListener('dispose',()=>counts.originals++));
 const adapter=createGarmentMaterialRecipes({entry:customEntry,meshes,avatarSha256:entry.compatibleAvatarSha256,manifestBase:new URL('https://local.invalid/assets/m1b/equipment.json'),threeRevision:THREE.REVISION,fetchImpl,cryptoImpl:webcrypto});
 return {adapter,meshes,originals,slots,counts,map,verify(){assert.equal(JSON.stringify(geometry.toJSON()),snapshot);originals.forEach((m,i)=>assert.equal(JSON.stringify(m.toJSON()),source[i]));assert.deepEqual(Array.from(map.image.data),[10,20,30,0,50,60,70,255]);}};
}
const a=fixture(),b=fixture();
await a.adapter.select(ref.id);await b.adapter.select(ref.id);
const am=a.meshes[0].material[0],bm=b.meshes[0].material[0];assert.notEqual(am,bm);assert.equal(am.map,a.map);assert.equal(am.alphaTest,.5);
assert.equal(a.adapter.getState().active.recipeSha256,ref.sha256);assert.equal(a.adapter.getState().active.garmentSha256,entry.sha256);
await a.adapter.select(ref.id);assert.equal(a.meshes[0].material[0],am,'Same selection must be idempotent');
for(const mesh of a.meshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.addEventListener('dispose',()=>a.counts.clones++);
await a.adapter.select(null);a.meshes.forEach((m,i)=>assert.equal(m.material,a.slots[i]));assert.equal(a.counts.clones,2);assert.equal(b.meshes[0].material[0],bm);
a.verify();b.verify();a.adapter.dispose();b.adapter.dispose();assert.equal(a.counts.textures+a.counts.originals+b.counts.textures+b.counts.originals,0);
checks.push('Two instances isolated, same-selection idempotent, exact material array restore; geometry/UV/skin/alpha source unchanged; clone-only disposal');
let release;const delayed=fixture(()=>new Promise(resolve=>release=resolve));
const pending=delayed.adapter.select(ref.id);await delayed.adapter.select(null);release(response(bytes));assert.equal((await pending).applied,false);assert.equal(delayed.adapter.getState().status,'original');delayed.verify();
let releaseDisposed;const dead=fixture(()=>new Promise(resolve=>releaseDisposed=resolve));const inFlight=dead.adapter.select(ref.id);dead.adapter.dispose();releaseDisposed(response(bytes));assert.equal((await inFlight).applied,false);assert.equal(dead.adapter.getState().status,'disposed');assert.equal(dead.counts.clones+dead.counts.textures+dead.counts.originals,0);
await assert.rejects(dead.adapter.select(ref.id),/disposed/);checks.push('Late completion after clear/dispose cannot apply, requested state cleared, no texture/mesh retention');
let fetchCount=0;const raced=fixture(()=>{fetchCount++;return new Promise(resolve=>{if(fetchCount===1)release=resolve;else releaseDisposed=resolve;});});
const old=raced.adapter.select(ref.id),latest=raced.adapter.select(ref.id);releaseDisposed(response(bytes));assert.equal((await latest).applied,true);const chosen=raced.meshes[0].material[0];release(response(bytes));assert.equal((await old).applied,false);assert.equal(raced.meshes[0].material[0],chosen);raced.adapter.dispose();checks.push('Newest async material request wins even when transport ignores abort');
for(const [name,fetcher,pattern]of [
 ['http',async()=>({ok:false,status:503}),/HTTP 503/],
 ['hash',async()=>response(Buffer.from('x'.repeat(bytes.length))),/integrity/],
]){const x=fixture(fetcher);await assert.rejects(x.adapter.select(ref.id),pattern);assert.equal(x.adapter.getState().requested,null);assert.equal(x.adapter.getState().active,null);x.meshes.forEach((m,i)=>assert.equal(m.material,x.slots[i]));x.adapter.dispose();checks.push(name+' failure preserves original and clears pending');}
for(const [name,change,pattern]of [
 ['fit',r=>r.fit.avatarSha256='0'.repeat(64),/incompatible/],
 ['implementation',r=>r.implementation.sha256='0'.repeat(64),/implementation/],
 ['primitive',r=>r.materialNames.pop(),/primitive/],
 ['settings',r=>r.settings.fabricStart=[.3,.2],/increasing/],
]){const bad=structuredClone(recipe);change(bad);const buffer=Buffer.from(JSON.stringify(bad));const e=structuredClone(entry);e.materialRecipes[0]={...ref,sha256:hash(buffer),bytes:buffer.length};const x=fixture(async()=>response(buffer),e);await assert.rejects(x.adapter.select(ref.id),pattern);x.meshes.forEach((m,i)=>assert.equal(m.material,x.slots[i]));x.verify();x.adapter.dispose();checks.push('Pinned but incompatible '+name+' rejected atomically');}
const retry=fixture(async()=>({ok:false,status:503}));await assert.rejects(retry.adapter.select(ref.id));await retry.adapter.select(null);assert.equal(retry.adapter.getState().error,null);retry.adapter.dispose();
const partial=fixture();let disposedPartial=0;const clone=partial.originals[0].clone.bind(partial.originals[0]);
partial.originals[0].clone=()=>{const m=clone();m.addEventListener('dispose',()=>disposedPartial++);return m;};
partial.originals[1].onBeforeCompile=()=>{};
await assert.rejects(partial.adapter.select(ref.id),/unpatched/);assert.equal(disposedPartial,1);
partial.meshes.forEach((m,i)=>assert.equal(m.material,partial.slots[i]));partial.adapter.dispose();
checks.push('Second primitive construction failure disposes first clone and swaps no materials');
assert.equal(hash(await readFile(dir+'src/cloth-material.js')),recipe.implementation.sha256);
assert.equal(hash(await readFile('prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb')),entry.sha256);
const result={passed:true,checks,recipeSha256:ref.sha256,garmentSha256:entry.sha256,implementationSha256:recipe.implementation.sha256,browserStarted:false,
 limits:['Lifecycle/config tests use real Three material/geometry objects, not a GPU or actual animated browser acceptance.','Existing reviewed GPU overlay evidence does not pass this new production-loading path.','Local avatar-record-v2 has no recipe field; this candidate does not silently persist it.']};
await writeFile(dir+'node-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
