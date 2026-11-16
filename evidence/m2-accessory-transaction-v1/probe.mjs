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
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url))),out=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[],layers=[],traces=[],requests=[];
const ear=JSON.parse(await fs.readFile(path.join(root,'prototype/public/assets/m2-paired-ear-accessory-v1/manifest.json'),'utf8'));
const hat=JSON.parse(await fs.readFile(path.join(root,'prototype/public/assets/m2-hat-hair-v1/manifest.json'),'utf8'));
const hair=JSON.parse(await fs.readFile(path.join(root,'prototype/public/assets/m2-long-hair-rootjoin-v2/manifest.json'),'utf8'));
const goodHair={hairStyle:hair.id,replacementSHA256:hair.sha256,hairFit:{kind:'explicit-fit-v1',id:hair.fit.id,version:hair.fit.version,sha256:hair.fit.sha256}};
const earFit=JSON.parse(await fs.readFile(path.join(root,'prototype/public/assets/m2-paired-ear-accessory-v1',ear.fits.find(f=>f.bodyType==='female').file),'utf8'));
const bodySha=earFit.baseAvatarSha256,originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
let gate=null,failure=null,appearance=null,vrm=null;
globalThis.self={URL:globalThis.URL};globalThis.ProgressEvent??=class{constructor(type,data){this.type=type;Object.assign(this,data);}};
globalThis.fetch=async input=>{const u=new URL(String(input),'http://fixture.invalid/');requests.push(u.pathname);if(gate?.path===u.pathname){const action=gate;gate=null;action.started();await action.wait;if(action.status)return new Response(null,{status:action.status});}return new Response(await fs.readFile(path.join(root,'prototype/public',u.pathname)));};
GLTFLoader.prototype.parseAsync=async function(buffer,...rest){
 this.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const gltf=await originalParse.call(this,buffer,...rest),digest=sha(Buffer.from(buffer));
 if([ear.asset.sha256,hat.sha256].includes(digest)){
  const trace={sourceSha256:digest,geometries:new Map(),materials:new Map(),clones:new Map()};gltf.scene.traverse(n=>{if(n.isMesh){trace.geometries.set(n.geometry,0);trace.materials.set(n.material,0);}});
  for(const g of trace.geometries.keys())g.addEventListener('dispose',()=>trace.geometries.set(g,trace.geometries.get(g)+1));
  for(const m of trace.materials.keys()){m.addEventListener('dispose',()=>trace.materials.set(m,trace.materials.get(m)+1));const clone=m.clone;m.clone=function(){const c=clone.call(this);trace.clones.set(c,0);c.addEventListener('dispose',()=>trace.clones.set(c,trace.clones.get(c)+1));return c;};}
  traces.push(trace);
 }
 return gltf;
};
function hold(file,status){let release,started;const action={path:file,status,wait:new Promise(r=>release=r),begun:new Promise(r=>started=r),started:()=>started()};gate=action;return{started:action.begun,release:()=>release()};}
function fixture(){const scene=new THREE.Group(),head=new THREE.Bone();head.name='J_Bip_C_Head';new THREE.Matrix4().fromArray(earFit.headWorldRestMatrixColumnMajor).decompose(head.position,head.quaternion,head.scale);scene.add(head);return{head,vrm:{scene,humanoid:{getRawBoneNode:n=>n==='head'?head:null}}};}
function make(f,options={}){const layer=createRigidAccessoryLayer({vrm:f.vrm,avatarSha256:bodySha,manifestUrl:'http://fixture.invalid/assets/m2-paired-ear-accessory-v1/manifest.json',...options});layers.push(layer);return layer;}
const groups=f=>f.head.children.filter(n=>n.name.startsWith('RigidAccessory:'));
const visible=f=>groups(f).filter(n=>n.visible);
const meshes=group=>{const result=[];group.traverse(n=>{if(n.isMesh)result.push(n);});return result;};
const released=trace=>[...trace.geometries.values(),...trace.materials.values(),...trace.clones.values()].every(n=>n===1);
async function test(name,run){const details=await run();checks.push({name,passed:true,...details});}
try{
 await test('delayed actual GLTF prepare leaves old visible selection untouched and commits without I/O',async()=>{
  const f=fixture(),layer=make(f),delay=hold('/assets/m2-paired-ear-accessory-v1/'+ear.asset.file),job=layer.prepareUpdate('left');await delay.started;assert.equal(layer.getState().selection,'none');assert.equal(visible(f).length,0);delay.release();const u=await job;
  assert.equal(u.revision,layer.getState().revision);assert(u.isCurrent());assert.equal(layer.getState().status,'prepared');assert.equal(groups(f).length,0);const count=requests.length;u.validateCommit();const result=u.commit();assert.equal(result.applied,true);assert.equal(typeof result.then,'undefined');assert.equal(requests.length,count);assert.equal(visible(f).length,1);u.dispose();assert.equal(visible(f).length,1);layer.dispose();assert(released(traces.at(-1)));
 });
 await test('swap and none defer old resource cleanup until dispose while prepare retains old visibility',async()=>{
  const f=fixture(),layer=make(f);await layer.setSelection('left');const old=visible(f)[0],oldMaterial=meshes(old)[0].material,trace=traces.at(-1),u=await layer.prepareUpdate('pair');assert.equal(visible(f)[0],old);assert.equal(trace.clones.get(oldMaterial),0);u.commit();const pair=visible(f)[0];assert.notEqual(pair,old);assert.equal(old.visible,false);assert.equal(trace.clones.get(oldMaterial),0);u.dispose();u.dispose();assert.equal(trace.clones.get(oldMaterial),1);assert.equal(visible(f)[0],pair);
  const none=await layer.prepareUpdate('none');assert.equal(visible(f)[0],pair);none.commit();assert.equal(visible(f).length,0);assert(meshes(pair).every(m=>trace.clones.get(m.material)===0));none.dispose();assert(meshes(pair).every(m=>trace.clones.get(m.material)===1));layer.dispose();assert(released(trace));
 });
 await test('superseded prepared candidate releases only its new materials and cannot revive selection',async()=>{
  const f=fixture(),layer=make(f);await layer.setSelection('left');const old=visible(f)[0],a=await layer.prepareUpdate('pair'),trace=traces.at(-1),b=await layer.prepareUpdate('right');assert(!a.isCurrent());assert.throws(()=>a.commit(),/expired/);a.dispose();assert.equal(visible(f)[0],old);b.commit();b.dispose();assert.equal(layer.getState().selection,'right');layer.dispose();assert(released(trace));
 });
 await test('legacy none still cancels and removes visible accessory synchronously',async()=>{
  const f=fixture(),layer=make(f);await layer.setSelection('pair');const u=await layer.prepareUpdate('left'),promise=layer.setSelection('none');assert.equal(visible(f).length,0);assert.equal(layer.getState().selection,'none');assert(!u.isCurrent());assert.equal((await promise).applied,true);u.dispose();layer.dispose();assert(released(traces.at(-1)));
 });
 await test('late load failure after newer none returns cancelled and preserves current ready state',async()=>{
  const f=fixture(),layer=make(f),delay=hold('/assets/m2-paired-ear-accessory-v1/'+ear.asset.file,503),job=layer.prepareUpdate('pair');await delay.started;await layer.setSelection('none');delay.release();const result=await job;assert(result.cancelled);assert.equal(layer.getState().status,'ready');assert.equal(visible(f).length,0);layer.dispose();
 });
 await test('owner disposal invalidates prepared update and releases cached source plus new candidate once',async()=>{
  const f=fixture(),layer=make(f);await layer.setSelection('left');const u=await layer.prepareUpdate('pair'),trace=traces.at(-1);layer.dispose();assert(!u.isCurrent());assert.throws(()=>u.commit(),/expired/);u.dispose();assert.equal(groups(f).length,0);assert(released(trace));
 });
 await test('old committed update disposal cannot release a newer visible group',async()=>{
  const f=fixture(),layer=make(f);await layer.setSelection('left');const u=await layer.prepareUpdate('pair');u.commit();await layer.setSelection('right');const latest=visible(f)[0];u.dispose();assert.equal(visible(f)[0],latest);assert.equal(layer.getState().selection,'right');layer.dispose();assert(released(traces.at(-1)));
 });
 await test('independent instances and cancelled staged disposal preserve peer visible resources',async()=>{
  const a=fixture(),b=fixture(),la=make(a),lb=make(b);await lb.setSelection('pair');const peer=visible(b)[0],u=await la.prepareUpdate('left');u.dispose();la.dispose();assert.equal(visible(b)[0],peer);assert(meshes(peer).every(m=>!traces.find(t=>t.clones.has(m.material)).clones.get(m.material)));lb.dispose();
 });
 await test('real old hair can prepare exact future hat but commit requires actual hair and respects immutable descriptor snapshot',async()=>{
  const bytes=await fs.readFile(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm')),loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));const parsed=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');vrm=parsed.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.update(0);vrm.scene.updateMatrixWorld(true);let layer;
  appearance=createCharacterAppearance({vrm,avatarSha256:bodySha,validateHairChange:d=>layer?.assertHairSelection(d)});const f={vrm,head:vrm.humanoid.getRawBoneNode('head')};layer=make(f,{kind:'hat',manifestUrl:'http://fixture.invalid/assets/m2-hat-hair-v1/manifest.json',manifestSha256:sha(await fs.readFile(path.join(root,'prototype/public/assets/m2-hat-hair-v1/manifest.json'))),getHairState:()=>appearance.getState()});
  const bad=await layer.prepareUpdate('single',{hairState:goodHair});assert.equal(appearance.getState().hairStyle,'original');assert.equal(visible(f).length,0);bad.validateCommit();assert.throws(()=>bad.commit(),e=>e.code==='hat-hair-incompatible');assert(!bad.isCurrent());bad.dispose();assert.equal(visible(f).length,0);
  const input=structuredClone(goodHair),u=await layer.prepareUpdate('single',{hairState:input});input.hairStyle='original';u.validateCommit();assert.equal(appearance.getState().hairStyle,'original');assert((await appearance.set({hairStyle:hair.id})).applied);u.commit();u.dispose();assert.equal(layer.getState().selection,'single');assert.equal(visible(f).length,1);assert.equal(meshes(visible(f)[0]).length,2);
  const none=await layer.prepareUpdate('none');assert.equal(visible(f).length,1);none.commit();assert((await appearance.set({hairStyle:'original'})).applied);none.dispose();assert.equal(layer.getState().selection,'none');layer.dispose();appearance.dispose();appearance=null;VRMUtils.deepDispose(vrm.scene);vrm=null;
 });
 await test('boolean/function final-state bypass options reject before revision or network changes',async()=>{
  const f=fixture(),layer=make(f),revision=layer.getState().revision,count=requests.length;for(const options of [{hairState:true},{hairState:()=>goodHair},{skipChecks:true}])await assert.rejects(layer.prepareUpdate('left',options));assert.equal(layer.getState().revision,revision);assert.equal(requests.length,count);layer.dispose();
 });
 assert(traces.every(released));checks.push({name:'all actual source and cloned materials release exactly once across transaction cases',passed:true,sourceParses:traces.length});
}catch(error){failure={message:error.message,stack:error.stack};}
finally{for(const layer of layers)layer.dispose();appearance?.dispose();if(vrm)VRMUtils.deepDispose(vrm.scene);globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
const sourceSha256=sha(await fs.readFile(path.join(root,'prototype/src/rigid-accessory-layer.js')));const report={sourceSha256,checks,failure,assets:{ears:ear.asset.sha256,hat:hat.sha256,hair:hair.sha256},limits:['Real published ear/hat GLTFLoader with CPU head fixtures for lifecycle; final-hair case uses actual original female VRM and actual character appearance source.','Texture decode uses1x1 CPU data. No GPU/browser or combined recipe controller validation. Final neutral face preflight remains root recipe integration responsibility.']};await fs.writeFile(path.join(out,process.argv[2]??'transaction-report-v1.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,failure,sourceSha256},null,2));if(failure)process.exitCode=1;
