// CPU loader checks with the real male Body, author GLB and fit/shape sidecars.
// No browser, renderer, animation or image decoding is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createEquipment} from '../prototype/src/equipment.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const bodyURL='/assets/foundation/base-male-roundtrip.vrm',manifestURL='/assets/m1b/equipment.json',onePiece='m2-male-training-onepiece-v1';
const baseURL=new URL('../prototype/public/',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
let gate=null,failPath=null;
globalThis.window={location:{href:'http://fixture.invalid/'}};
globalThis.self={URL:globalThis.URL};
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return originalParse.apply(this,args);};
globalThis.fetch=async input=>{
  const url=new URL(input,window.location.href);
  if(url.pathname===gate?.path){const current=gate;gate=null;current.started();await current.promise;}
  if(url.pathname===failPath)return new Response('broken',{status:200});
  if(url.pathname===manifestURL)return new Response(await fs.readFile(new URL('.'+manifestURL,baseURL)));
  if(url.pathname.startsWith('/assets/'))return new Response(await fs.readFile(new URL('.'+url.pathname,baseURL)));
  throw Error('Unexpected fetch '+url.pathname);
};
function hold(pathname){let release,started;const promise=new Promise(r=>release=r),begin=new Promise(r=>started=r);gate={path:pathname,promise,started:()=>started()};return{started:begin,release};}
const bufferOf=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const bytes=await fs.readFile(new URL('.'+bodyURL,baseURL));
const loader=new GLTFLoader();
const parsed=await loader.parseAsync(bufferOf(bytes),'');parsed.scene.updateMatrixWorld(true);
parsed.scene.traverse(mesh=>{if(mesh.isMesh&&((Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.name==='M00_001_01_Body_00_SKIN'))){} });
const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:name=>parsed.scene.getObjectByName(name)}};
const bodyMesh=()=>{let found=null;vrm.scene.traverse(mesh=>{if(mesh.isMesh&&!found&&((Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.name==='M00_001_01_Body_00_SKIN')))found=mesh;});return found;};
const faceMesh=()=>{let found=null;vrm.scene.traverse(mesh=>{if(mesh.isMesh&&!found&&((Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.name==='M00_000_00_Face_00_SKIN')))found=mesh;});return found;};
const results=[];
try{
  const adapter=await createEquipment({vrm,avatarSha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',manifestUrl:manifestURL});
  const item=await adapter.load(onePiece);assert(item&&adapter.get(onePiece));results.push({case:'actual onePiece load validates fit/shape and author GLB',passed:true,vertices:item.stats.verticesAcrossPrimitives});
  const update=adapter.prepareLoadedSet([onePiece]);update.commit();update.dispose();
  const body=bodyMesh();assert(body);const position=body.geometry.getAttribute('position'),before=position.getX(0);position.setX(0,before+.03);position.needsUpdate=true;
  const stale=adapter.prepareLoadedSet([onePiece]);assert.throws(()=>stale.commit(),/Body surface .* changed|refit is required/);stale.dispose();position.setX(0,before);position.needsUpdate=true;
  adapter.dispose();
  const freshParsed=await loader.parseAsync(bufferOf(bytes),'');freshParsed.scene.updateMatrixWorld(true);const freshVrm={scene:freshParsed.scene,humanoid:{getRawBoneNode:name=>freshParsed.scene.getObjectByName(name)}};
  const freshAdapter=await createEquipment({vrm:freshVrm,avatarSha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',manifestUrl:manifestURL});await freshAdapter.load(onePiece);
  let freshFace=null;freshVrm.scene.traverse(mesh=>{if(mesh.isMesh&&!freshFace&&((Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.name==='M00_000_00_Face_00_SKIN')))freshFace=mesh;});assert(freshFace);const facePosition=freshFace.geometry.getAttribute('position'),faceBefore=facePosition.getX(0);facePosition.setX(0,faceBefore+.03);facePosition.needsUpdate=true;
  const faceOnly=freshAdapter.prepareLoadedSet([onePiece]);faceOnly.commit();faceOnly.dispose();freshAdapter.dispose();results.push({case:'Body change rejects while face-only geometry change reuses fit',passed:true});
  const badAdapter=await createEquipment({vrm,avatarSha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',manifestUrl:manifestURL});failPath='/assets/m2-onepiece-v1/fit.json';await assert.rejects(badAdapter.load(onePiece),/fit resource integrity mismatch/);failPath=null;badAdapter.dispose();results.push({case:'bad fit bytes reject before garment attach',passed:true});
  const lateAdapter=await createEquipment({vrm,avatarSha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',manifestUrl:manifestURL});const pending=hold('/assets/m2-onepiece-v1/fit.json'),job=lateAdapter.load(onePiece);await pending.started;lateAdapter.dispose();pending.release();await assert.rejects(job,/disposed|fit resource/);assert.equal(lateAdapter.get(onePiece),null);results.push({case:'dispose during fit preparation prevents late attach',passed:true});
await fs.mkdir(path.resolve('evidence/shape-fit-dependency-v1'),{recursive:true});await fs.writeFile(path.resolve('evidence/shape-fit-dependency-v1/report.json'),JSON.stringify({passed:true,results,scope:'Real male VRM and onePiece author GLB/fit/shape resources. CPU Three loader only; no renderer/browser/GPU.'},null,2)+'\n');console.log(JSON.stringify({passed:true,results},null,2));
}finally{globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
