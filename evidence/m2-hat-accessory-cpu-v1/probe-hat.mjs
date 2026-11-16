import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createRigidAccessoryLayer} from '../../prototype/src/rigid-accessory-layer.js';
import {createCharacterAppearance} from '../../prototype/src/character-appearance.js';
import {validateHatManifest,validateHatFit,validateHatSourceDocument} from '../../prototype/src/hat-accessory-contract.js';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..'),origin='http://cpu-fixture.invalid';
const hatPrefix='/assets/m2-hat-hair-v1/',hairPrefix='/assets/m2-long-hair-rootjoin-v2/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const routes=new Map(),requests=[],checks=[],traces=[],actors=[],layers=[];
for(const name of ['manifest.json','fit.json','baseball-cap.glb'])routes.set(hatPrefix+name,await fs.readFile(path.join(out,'inputs',name)));
for(const name of ['manifest.json','fit.json','female-ponytail.glb'])routes.set(hairPrefix+name,await fs.readFile(path.join(root,'prototype/public',hairPrefix,name)));
const rawManifest=JSON.parse(routes.get(hatPrefix+'manifest.json')),rawFit=JSON.parse(routes.get(hatPrefix+'fit.json'));
const manifestSha256=sha(routes.get(hatPrefix+'manifest.json')),bodySha=rawFit.targetBodySha256;
const hatAssetHashes=new Set([rawManifest.sha256]),structureVariants=[];
const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
let control=null,failure=null;
globalThis.self={URL:globalThis.URL};globalThis.ProgressEvent??=class{constructor(type,details){this.type=type;Object.assign(this,details);}};
globalThis.fetch=async input=>{
 const pathname=new URL(String(input),origin).pathname;requests.push(pathname);const action=control;
 if(action?.path===pathname){action.started?.();await action.wait;if(action.status)return new Response(null,{status:action.status});if(action.bytes)return new Response(action.bytes);}
 const bytes=routes.get(pathname);return new Response(bytes??null,{status:bytes?200:404});
};
GLTFLoader.prototype.parseAsync=async function(...args){
 if(sha(Buffer.from(args[0]))===rawFit.hairDependency.sha256)this.register(()=>({name:'CPUHairTexturePlaceholder',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const gltf=await originalParse.apply(this,args);
 if(hatAssetHashes.has(sha(Buffer.from(args[0])))){
  const meshes=[];gltf.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
  const trace={meshes,geometryReleases:new Map(),materialReleases:new Map()};
  for(const g of new Set(meshes.map(m=>m.geometry))){trace.geometryReleases.set(g,0);g.addEventListener('dispose',()=>trace.geometryReleases.set(g,trace.geometryReleases.get(g)+1));}
  for(const m of new Set(meshes.map(m=>m.material))){trace.materialReleases.set(m,0);m.addEventListener('dispose',()=>trace.materialReleases.set(m,trace.materialReleases.get(m)+1));}
  traces.push(trace);
 }
 return gltf;
};
function deferred(){let release,started;return{wait:new Promise(r=>release=r),begun:new Promise(r=>started=r),release:()=>release(),started:()=>started()};}
function check(name,ok,details={}){checks.push({name,passed:ok,...details});assert(ok,name);}
const clone=x=>JSON.parse(JSON.stringify(x));
const meshList=a=>a.head.children.filter(n=>n.name.startsWith('RigidAccessory:')).flatMap(n=>n.children);
const groups=a=>a.head.children.filter(n=>n.name.startsWith('RigidAccessory:'));
function fixture(){const scene=new THREE.Group(),head=new THREE.Bone();head.name='J_Bip_C_Head';scene.add(head);return{scene,head,vrm:{scene,humanoid:{getRawBoneNode:n=>n==='head'?head:null}},avatarSha256:bodySha};}
async function actualActor(){
 const bytes=await fs.readFile(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm')),loader=new GLTFLoader();
 loader.register(parser=>new VRMLoaderPlugin(parser));loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),vrm=gltf.userData.vrm;
 VRMUtils.rotateVRM0(vrm);vrm.update(0);vrm.scene.updateMatrixWorld(true);
 const appearance=createCharacterAppearance({vrm,avatarSha256:bodySha});assert.equal((await appearance.set({hairStyle:rawFit.hairDependency.styleId})).applied,true);
 const a={vrm,appearance,head:vrm.humanoid.getRawBoneNode('head'),avatarSha256:bodySha};actors.push(a);return a;
}
function make(a,getHairState,options={}){
 const layer=createRigidAccessoryLayer({kind:'hat',vrm:a.vrm,avatarSha256:a.avatarSha256,manifestUrl:origin+hatPrefix+'manifest.json',manifestSha256,getHairState,...options});layers.push(layer);return layer;
}
function sourceReleased(trace){return [...trace.geometryReleases.values()].every(n=>n===1)&&[...trace.materialReleases.values()].every(n=>n===1);}
function originalState(a){const rows=[];a.vrm.scene.traverse(n=>{if(n.isBone&&!/^Pony|HairAnchor/.test(n.name))rows.push([n.uuid,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]);if(n.isMesh&&!n.userData.rigidAccessoryId)rows.push([n.uuid,n.visible,sha(Buffer.from(n.geometry.attributes.position.array.buffer)),n.geometry.index?sha(Buffer.from(n.geometry.index.array.buffer)):null]);});return JSON.stringify(rows);}
try{
 const a=await actualActor(),b=await actualActor(),good=clone(a.appearance.getState());
 const before=originalState(a),first=make(a,()=>a.appearance.getState()),second=make(b,()=>b.appearance.getState());
 first.assertHairSelection({hairStyle:'original'});assert.equal(meshList(a).length,0);
 await first.setSelection('single');const traceA=traces.at(-1);await second.setSelection('single');const traceB=traces.at(-1);
 let ma=meshList(a),mb=meshList(b);assert.equal(ma.length,2);assert.equal(ma[0].material,ma[1].material);assert.notEqual(ma[0].material,mb[0].material);assert.notEqual(ma[0].geometry,mb[0].geometry);
 assert.equal(ma.reduce((s,m)=>s+m.geometry.attributes.position.count,0),2238);assert.equal(ma.reduce((s,m)=>s+m.geometry.index.count/3,0),4472);
 ma[0].material.color.setRGB(.7,.1,.2);assert.notDeepEqual(ma[0].material.color.toArray(),mb[0].material.color.toArray());
 check('actual female VRM plus actual v2 hair and two-mesh hat load through shared layer with per-actor material isolation',true,{meshes:2,vertices:2238,triangles:4472,assetSha256:rawManifest.sha256});
 const headRotation=a.head.quaternion.clone();a.head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.2));a.vrm.scene.updateMatrixWorld(true);
 let worldError=0;for(const mesh of ma)for(let i=0;i<mesh.geometry.attributes.position.count;i++){const point=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i);worldError=Math.max(worldError,point.clone().applyMatrix4(mesh.matrixWorld).distanceTo(point.applyMatrix4(a.head.matrixWorld)));}
 a.head.quaternion.copy(headRotation);a.vrm.scene.updateMatrixWorld(true);assert(worldError<1e-12);
 check('both actual hat meshes follow raw head identity mount under owner-applied yaw without source transforms',true,{rawHeadYawRad:.2,maximumWorldErrorM:worldError});
 first.setBodyMode('base');assert.equal(groups(a)[0].visible,false);assert.equal(first.getState().selection,'single');first.setBodyMode('dressed');assert.equal(groups(a)[0].visible,true);
 assert.equal(originalState(a),before);const state=first.getState();state.hairDependency.sha256='0'.repeat(64);first.assertHairSelection(good);
 assert.throws(()=>first.assertHairSelection({...good,hairStyle:'original'}),e=>e.code==='hat-hair-incompatible');
 check('base hides only hat and restores selection; source body hair bone TRS and buffers unchanged; state copies cannot rewrite dependency',true);
 const active=ma[0],materialPrototype=THREE.MeshStandardMaterial.prototype,oldClone=materialPrototype.clone,ownClone=Object.hasOwn(materialPrototype,'clone');
 materialPrototype.clone=()=>{throw Error('fixture material clone failure');};
 try{await assert.rejects(first.setSelection('single'),/fixture/);}finally{if(ownClone)materialPrototype.clone=oldClone;else delete materialPrototype.clone;}
 assert.equal(meshList(a)[0],active);assert.equal(first.getState().selection,'single');
 check('actual material clone failure preserves current visible hat',true);
 const meshPrototype=THREE.Mesh.prototype,oldMeshClone=meshPrototype.clone,ownMeshClone=Object.hasOwn(meshPrototype,'clone');let cloneCalls=0,partialMaterialDisposals=0;
 meshPrototype.clone=function(...args){if(++cloneCalls===2)throw Error('fixture second mesh clone');return oldMeshClone.apply(this,args);};
 materialPrototype.clone=function(){const m=oldClone.call(this);m.addEventListener('dispose',()=>partialMaterialDisposals++);return m;};
 try{await assert.rejects(first.setSelection('single'),/second mesh/);}finally{if(ownMeshClone)meshPrototype.clone=oldMeshClone;else delete meshPrototype.clone;if(ownClone)materialPrototype.clone=oldClone;else delete materialPrototype.clone;}
 assert.equal(partialMaterialDisposals,1);assert.equal(meshList(a)[0],active);
 check('second source mesh clone failure releases partially prepared shared material exactly once and preserves old hat',true);
 let released=0;
 for(let i=0;i<5;i++){const m=meshList(a)[0].material;m.addEventListener('dispose',()=>released++);await first.setSelection('none');await first.setSelection('single');}
 assert.equal(released,5);assert.equal(first.getState().cachedGeometries,2);first.dispose();first.dispose();assert(sourceReleased(traceA));assert.equal(meshList(b).length,2);second.dispose();assert(sourceReleased(traceB));
 check('repeated equip none and double dispose release each source geometry/material once and preserve peer instance',true);
 for(const [name,change] of [['wrong-style',d=>({...d,hairStyle:'original'})],['wrong-asset',d=>({...d,replacementSHA256:'0'.repeat(64)})],['wrong-fit',d=>({...d,hairFit:{...d.hairFit,version:1}})]]){
  const f=fixture(),layer=make(f,()=>change(good)),start=requests.filter(p=>p===hatPrefix+'baseball-cap.glb').length;
  await assert.rejects(layer.setSelection('single'),e=>e.code==='hat-hair-incompatible');assert.equal(layer.getState().selection,'none');assert.equal(meshList(f).length,0);assert.equal(requests.filter(p=>p===hatPrefix+'baseball-cap.glb').length,start);layer.dispose();
  check(name+' rejected before hat asset preparation',true);
 }
 {const f=fixture(),layer=make(f,()=>good,{avatarSha256:'0'.repeat(64)});await assert.rejects(layer.setSelection('single'),/identity/);assert.equal(meshList(f).length,0);layer.dispose();check('wrong body exact SHA rejected without attachment',true);}
 for(const [name,pathName,bytes] of [['manifest-hash',hatPrefix+'manifest.json',Buffer.from('{}')],['fit-hash',hatPrefix+'fit.json',Buffer.from('{}')],['asset-hash',hatPrefix+'baseball-cap.glb',Buffer.from('bad')],['hair-manifest-hash',hairPrefix+'manifest.json',Buffer.from('{}')]]){
  const f=fixture(),layer=make(f,()=>good);control={path:pathName,bytes};await assert.rejects(layer.setSelection('single'),/integrity/);control=null;assert.equal(meshList(f).length,0);layer.dispose();check(name+' mismatch rejects and preserves none',true);
 }
 for(const mode of ['none','dispose','late503','newer-single','changed-hair']){
  const f=fixture();let descriptor=good;const layer=make(f,()=>descriptor),gate=deferred();control={path:hatPrefix+'baseball-cap.glb',wait:gate.wait,started:gate.started,status:mode==='late503'?503:null};
  const pending=layer.setSelection('single');await gate.begun;let newer=null;
  if(mode==='dispose')layer.dispose();else if(mode==='changed-hair')descriptor={...good,hairStyle:'original'};else{await layer.setSelection('none');if(mode==='newer-single')newer=layer.setSelection('single');}
  gate.release();if(mode==='changed-hair')await assert.rejects(pending,e=>e.code==='hat-hair-incompatible');else assert.deepEqual(await pending,{applied:false,reason:'cancelled'});
  if(newer){assert.equal((await newer).applied,true);assert.equal(meshList(f).length,2);}else assert.equal(meshList(f).length,0);control=null;layer.dispose();
  check(mode+' during delayed real asset load cannot revive stale hat',true);
 }
 {const f=fixture();let descriptor=good;const layer=make(f,()=>descriptor);const onAdd=e=>{if(e.child.name.startsWith('RigidAccessory:'))descriptor={...good,hairStyle:'original'};};f.head.addEventListener('childadded',onAdd);await assert.rejects(layer.setSelection('single'),e=>e.code==='hat-hair-incompatible');f.head.removeEventListener('childadded',onAdd);assert.equal(meshList(f).length,0);assert.equal(layer.getState().selection,'none');layer.dispose();check('hair change during actual head attachment fails final commit guard and cleans candidate',true);}
 {const f=fixture(),layer=make(f,()=>good);let materials=0;const onAdd=e=>{if(!e.child.name.startsWith('RigidAccessory:'))return;const seen=new Set();e.child.traverse(n=>{if(n.isMesh)seen.add(n.material);});seen.forEach(m=>m.addEventListener('dispose',()=>materials++));layer.dispose();};f.head.addEventListener('childadded',onAdd);assert.deepEqual(await layer.setSelection('single'),{applied:false,reason:'cancelled'});f.head.removeEventListener('childadded',onAdd);assert.equal(meshList(f).length,0);assert.equal(materials,1);assert(sourceReleased(traces.at(-1)));check('dispose during head childadded releases shared candidate material and both source geometries exactly once',true);}
 {const f=fixture();let fail=false;const layer=make(f,()=>{if(fail)throw Error('fixture neutral-face dependency');return good;});await layer.setSelection('single');const old=meshList(f)[0];fail=true;await assert.rejects(layer.setSelection('single'),/neutral-face dependency/);assert.equal(meshList(f)[0],old);assert.equal(layer.getState().selection,'single');layer.dispose();check('current dependency callback exception propagates and preserves already equipped hat',true);}
 const docBytes=routes.get(hatPrefix+'baseball-cap.glb'),jsonLength=docBytes.readUInt32LE(12),doc=JSON.parse(docBytes.subarray(20,20+jsonLength));
 for(const [name,change] of [['external-buffer',d=>d.buffers[0].uri='https://outside.invalid/b.bin'],['skin',d=>d.skins=[{}]],['animation',d=>d.animations=[{}]],['texture',d=>d.images=[{uri:'x.png'}]],['node-transform',d=>d.nodes[0].translation=[0,0,0]],['extension',d=>d.extensionsUsed=['UNKNOWN']],['unreferenced-mesh',d=>d.meshes.push(clone(d.meshes[0]))],['node-limit',d=>{while(d.nodes.length<9)d.nodes.push(clone(d.nodes[0]));d.scenes[0].nodes=d.nodes.map((_,i)=>i);}],['material-limit',d=>{while(d.materials.length<9)d.materials.push(clone(d.materials[0]));}]]){
  const bad=clone(doc);change(bad);assert.throws(()=>validateHatSourceDocument(bad));check(name+' source dependency/transform rejected by actual contract',true);
 }

 function encodedGlb(document){
  const encoded=Buffer.from(JSON.stringify(document)),json=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
  const binaryLength=docBytes.readUInt32LE(20+jsonLength),binary=docBytes.subarray(28+jsonLength,28+jsonLength+binaryLength),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);jsonHeader.writeUInt32LE(json.length);jsonHeader.write('JSON',4);binHeader.writeUInt32LE(binary.length);binHeader.write('BIN\0',4);
  return Buffer.concat([header,jsonHeader,json,binHeader,binary]);
 }
 const originalHatRoutes=new Map(['manifest.json','fit.json','baseball-cap.glb'].map(n=>[n,routes.get(hatPrefix+n)]));
 for(const count of [1,3]){
  const document=clone(doc);
  if(count===1){document.meshes=[document.meshes[0]];document.nodes=[document.nodes[0]];document.scenes[0].nodes=[0];}
  else{
   document.meshes.push(clone(document.meshes[0]));document.meshes[2].name='ThirdIdentityMeshFixture';document.nodes.push({name:'ThirdIdentityMeshFixture',mesh:2});document.scenes[0].nodes=[0,1,2];
   document.materials.push({...clone(document.materials[0]),name:'SecondUntexturedPbrFixture'});document.meshes[1].primitives[0].material=1;document.meshes[2].primitives[0].material=1;
  }
  const asset=encodedGlb(document),fit=clone(rawFit),manifest=clone(rawManifest);fit.assetSha256=sha(asset);
  const fitBytes=Buffer.from(JSON.stringify(fit));manifest.sha256=sha(asset);manifest.bytes=asset.length;manifest.fit.sha256=sha(fitBytes);
  const manifestBytes=Buffer.from(JSON.stringify(manifest));hatAssetHashes.add(manifest.sha256);
  routes.set(hatPrefix+'baseball-cap.glb',asset);routes.set(hatPrefix+'fit.json',fitBytes);routes.set(hatPrefix+'manifest.json',manifestBytes);
  const directory=path.join(out,'structure-fixtures',count+'-meshes');await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'asset.glb'),asset);await fs.writeFile(path.join(directory,'fit.json'),fitBytes);await fs.writeFile(path.join(directory,'manifest.json'),manifestBytes);
  const actor=fixture(),layer=make(actor,()=>good,{manifestSha256:sha(manifestBytes)});await layer.setSelection('single');const meshes=meshList(actor),trace=traces.at(-1);
  assert.equal(meshes.length,count);assert.equal(layer.getState().cachedGeometries,trace.geometryReleases.size);
  assert.equal(new Set(meshes.map(m=>m.material)).size,document.materials.length);
  if(count===3){assert.equal(meshes[1].material,meshes[2].material);assert.notEqual(meshes[0].material,meshes[1].material);}
  const materialReleases=new Map();for(const m of new Set(meshes.map(m=>m.material))){materialReleases.set(m,0);m.addEventListener('dispose',()=>materialReleases.set(m,materialReleases.get(m)+1));}
  await layer.setSelection('none');assert([...materialReleases.values()].every(n=>n===1));layer.dispose();layer.dispose();assert(sourceReleased(trace));
  structureVariants.push({meshNodes:count,sourceMeshDeclarations:document.meshes.length,sourceMaterials:trace.materialReleases.size,sourceGeometries:trace.geometryReleases.size,assetSha256:manifest.sha256,fixture:'Count/identity structure fixture reuses actual source geometry bytes; no new hat art or controller branch'});
  check(count+'-mesh same hat contract loads and disposes actual resource sets without runtime/controller branches',true,structureVariants.at(-1));
 }
 for(const [name,bytes] of originalHatRoutes)routes.set(hatPrefix+name,bytes);
 const manifest=validateHatManifest(rawManifest,new URL(origin+hatPrefix+'manifest.json'));
 const badFit=clone(rawFit);badFit.coverage.hideHair=true;assert.throws(()=>validateHatFit(badFit,manifest,bodySha,fixture().head));
 const badManifest=clone(rawManifest);badManifest.fit.url='https://outside.invalid/fit.json';assert.throws(()=>validateHatManifest(badManifest,new URL(origin+hatPrefix+'manifest.json')));
 check('unknown nested fit coverage and external fit URL reject',true);
 for(const layer of layers)layer.dispose();
 assert(traces.every(sourceReleased));check('every parsed hat source and structure fixture releases each actual geometry/material exactly once across all cases',true,{parsedSources:traces.length});
}catch(e){failure={message:e.message,stack:e.stack};}
finally{
 for(const layer of layers)layer.dispose();for(const a of actors){a.appearance.dispose();VRMUtils.deepDispose(a.vrm.scene);}
 globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;
}
const sourceSha256=Object.fromEntries(await Promise.all(['prototype/src/rigid-accessory-layer.js','prototype/src/hat-accessory-contract.js'].map(async n=>[n,sha(await fs.readFile(path.join(root,n)))])));
const report={checks,failure,sourceSha256,structureVariants,source:{authorCommit:'ed19dcfd8816ab74633a543d5a08b11cbd10efed',manifestSha256,fitSha256:sha(routes.get(hatPrefix+'fit.json')),assetSha256:rawManifest.sha256},requests,limits:['Controlled in-memory fetch responses serve exact source bytes without starting a service. Actual GLTFLoader, original female VRM and actual v2 ponytail appearance are used in first two actors. Remaining async cases use raw-head CPU fixtures.','VRM textures use1x1 CPU placeholders. No browser/GPU, visual cap fit, dynamic hair contact, appearance outer transaction integration or save/reload acceptance. Root owns those integration paths.']};
await fs.writeFile(path.join(out,process.argv[2]??'hat-report-structure-v1.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,failure,sourceSha256},null,2));if(failure)process.exitCode=1;
