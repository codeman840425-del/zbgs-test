import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { createFacialGeometry } from '../prototype/src/facial-geometry.js';
import { prepareFaceProgramFirstUse } from '../prototype/src/face-program-firstuse.js';
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
const createWarm=vm.runInNewContext('('+actual+')',{THREE,prepareFaceProgramFirstUse,AbortController});
const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const report=[],source=glb(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
function rendererFixture(delayed=false,options={}){
 const calls=[],disposed=new Map(),uses=[],readyChecks=[],canvas=new EventTarget();let lost=false;
 const gl={isContextLost:()=>lost};
 const newProperties=()=>{const maps=new WeakMap();return{get(m){if(!maps.has(m))maps.set(m,{});return maps.get(m);},remove(m){maps.delete(m);}};};
 const makeProgram=()=>({program:{},refs:0,ready:options.ready!==false,isReady(){readyChecks.push(this);return this.ready;},getUniforms(){uses.push(this);options.onUse?.(this,r);if(options.shaderFailure)this.diagnostics={runnable:false};return{};}});
 const r={calls,disposed,uses,readyChecks,canvas,lose(){lost=true;canvas.dispatchEvent(new Event('webglcontextlost'));},restore(){lost=false;r.renderer.properties=newProperties();canvas.dispatchEvent(new Event('webglcontextrestored'));},renderer:{
  domElement:canvas,getContext:()=>gl,properties:newProperties(),debug:{checkShaderErrors:true,onShaderError:()=>{}},
  compileAsync(staging,camera,targetScene){
   const materials=[],programs=[],shared=options.shared?Array.from({length:options.variants||1},makeProgram):null;
   staging.traverse(m=>{if(m.isMesh)for(const mat of(Array.isArray(m.material)?m.material:[m.material])){
    materials.push(mat);disposed.set(mat,0);
    const variants=shared||Array.from({length:options.variants||1},makeProgram);
    for(const program of variants){program.refs++;if(!programs.includes(program))programs.push(program);}
    const props=r.renderer.properties;props.get(mat).programs=new Map(variants.map((program,i)=>[String(i),program]));props.get(mat).currentProgram=variants.at(-1);
    mat.addEventListener('dispose',()=>{disposed.set(mat,disposed.get(mat)+1);props.remove(mat);for(const program of variants)if(--program.refs===0)program.program=undefined;});
   }});
   let resolve,reject;const promise=delayed?new Promise((yes,no)=>{resolve=yes;reject=no;}):Promise.resolve();calls.push({children:staging.children.length,materials,programs,resolve,reject,targetScene});return promise;
  }
 }};return r;
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

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
 for(const n of r.disposed.values())assert(n===0||n===1);
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
 const retry=warm.prepare([A,B]);const retryRejected=assert.rejects(retry,/人物已卸载/);await Promise.resolve();assert.equal(r.calls.length,3);assert.equal(r.calls[2].children,1);
 warm.dispose();for(const mat of r.calls[0].materials)assert.equal(r.disposed.get(mat),1);for(const mat of r.calls[2].materials)assert.equal(r.disposed.get(mat),1);
 r.calls[2].resolve();await retryRejected;for(const n of r.disposed.values())assert.equal(n,1);
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
{
 const f=fixture(source),r=rendererFixture(),warm=createWarm(r.renderer,new THREE.Scene()),mesh=f.meshes[0];
 const normalGeometry=mesh.geometry.clone();normalGeometry.morphAttributes.normal=normalGeometry.morphAttributes.position.map(a=>new THREE.BufferAttribute(new Float32Array(a.array.length),3));
 const plain={mesh,geometry:mesh.geometry},normal={mesh,geometry:normalGeometry};
 const liveCount=()=>[...r.disposed.values()].filter(n=>n===0).length;
 await warm.prepare([plain,normal]);assert.equal(liveCount(),2);
 mesh.material.needsUpdate=true;await warm.prepare([normal]);assert.equal(liveCount(),1);assert(r.calls[0].materials.every(m=>r.disposed.get(m)===1));
 await warm.prepare([plain]);assert.equal(liveCount(),2);const before=r.calls.length;await warm.prepare([plain,normal]);assert.equal(r.calls.length,before);
 for(let i=0;i<20;i++){mesh.material.needsUpdate=true;await warm.prepare([normal]);assert.equal(liveCount(),1);}
 const previousMaterial=mesh.material;mesh.material=previousMaterial.clone();await warm.prepare([normal]);assert.equal(liveCount(),1);
 warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);normalGeometry.dispose();mesh.material.dispose();mesh.material=previousMaterial;
 report.push({case:'obsolete-material-versions-evicted-across-layouts-and-20-repeated-color-versions-bounded',passed:true,totalCompileBatches:r.calls.length,maxStableCloneMaterials:2});
}
{
 const f=fixture(source),r=rendererFixture(true),warm=createWarm(r.renderer,new THREE.Scene()),mesh=f.meshes[0],part={mesh,geometry:mesh.geometry};
 const first=warm.prepare([part]);await Promise.resolve();mesh.material.needsUpdate=true;const second=warm.prepare([part]);await Promise.resolve();
 r.calls[1].resolve();await second;assert.equal(r.disposed.get(r.calls[1].materials[0]),0);assert.equal(r.disposed.get(r.calls[0].materials[0]),0);
 r.calls[0].resolve();await first;assert.equal(r.disposed.get(r.calls[0].materials[0]),1);assert.equal(r.disposed.get(r.calls[1].materials[0]),0);
 await warm.prepare([part]);assert.equal(r.calls.length,2);
 mesh.material.needsUpdate=true;const failed=warm.prepare([part]),rejected=assert.rejects(failed,/new-version-failed/);await Promise.resolve();r.calls[2].reject(Error('new-version-failed'));await rejected;
 assert.equal(r.disposed.get(r.calls[1].materials[0]),0);assert.equal(r.disposed.get(r.calls[2].materials[0]),1);
 const retry=warm.prepare([part]);await Promise.resolve();r.calls[3].resolve();await retry;assert.equal(r.disposed.get(r.calls[1].materials[0]),1);assert.equal(r.disposed.get(r.calls[3].materials[0]),0);
 warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);
 report.push({case:'reversed-version-pending-settle-and-failed-new-version-do-not-release-current-stable',passed:true});
}

{
 const f=fixture(source),r=rendererFixture(false,{variants:2,shared:true,ready:false}),warm=createWarm(r.renderer,new THREE.Scene());
 const parts=f.meshes.slice(0,2).map(mesh=>({mesh,geometry:mesh.geometry}));
 const p=warm.prepare(parts);await tick();const ps=r.calls[0].programs;assert.equal(ps.length,2);
 ps[1].ready=true;await tick();assert.equal(r.uses.length,0); // currentProgram ready is insufficient
 let timerBetween=false;r.calls[0].programs[0].getUniforms=function(){r.uses.push(this);setTimeout(()=>{timerBetween=true;},0);};
 r.calls[0].programs[1].getUniforms=function(){assert(timerBetween);r.uses.push(this);};ps[0].ready=true;
 await p;assert.equal(r.uses.length,2);assert.equal(new Set(r.uses).size,2);assert(r.calls[0].programs.every(p=>p.diagnostics===undefined));
 await warm.prepare(parts);assert.equal(r.uses.length,2);warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);
 report.push({case:'all-map-variants-ready-before-first-use-dedup-real-task-between-and-cache-reuse',passed:true});
}
for(const failure of ['diagnostics','callback-throws','ready-throws','missing-map','released-handle','diagnostics-disabled']){
 const f=fixture(source),r=rendererFixture(true),warm=createWarm(r.renderer,new THREE.Scene());
 const A={mesh:f.meshes[0],geometry:f.meshes[0].geometry},B={mesh:f.meshes[2],geometry:f.meshes[2].geometry};
 const stable=warm.prepare([A]);await Promise.resolve();r.calls[0].resolve();await stable;
 const callback=r.renderer.debug.onShaderError,p=warm.prepare([B]),rejected=assert.rejects(p);await Promise.resolve();
 const program=r.calls[1].programs[0];
 if(failure==='diagnostics')program.getUniforms=function(){this.diagnostics={runnable:false};};
 if(failure==='callback-throws'){r.renderer.debug.onShaderError=()=>{throw Error('shader callback');};program.getUniforms=()=>r.renderer.debug.onShaderError();}
 if(failure==='ready-throws')program.isReady=()=>{throw Error('ready');};
 if(failure==='missing-map')r.renderer.properties.get(r.calls[1].materials[0]).programs=undefined;
 if(failure==='released-handle')program.program=undefined;
 if(failure==='diagnostics-disabled')r.renderer.debug.checkShaderErrors=false;
 const heldCallback=r.renderer.debug.onShaderError;r.calls[1].resolve();await rejected;
 assert.equal(r.renderer.debug.onShaderError,heldCallback);assert.equal(r.disposed.get(r.calls[0].materials[0]),0);assert.equal(r.disposed.get(r.calls[1].materials[0]),1);
 r.renderer.debug.checkShaderErrors=true;r.renderer.debug.onShaderError=callback;await warm.prepare([A]);assert.equal(r.calls.length,2);warm.dispose();
 report.push({case:'failure-'+failure+'-cleans-fresh-preserves-stable-and-diagnostics',passed:true});
}
for(const mode of ['dispose-during-compile','dispose-between-programs','loss-during-compile','loss-during-readiness','loss-between-programs','restore-without-loss-event','properties-change']){
 const f=fixture(source),r=rendererFixture(true,{variants:2,ready:mode!=='loss-during-readiness'}),warm=createWarm(r.renderer,new THREE.Scene()),part={mesh:f.meshes[0],geometry:f.meshes[0].geometry};
 const p=warm.prepare([part]),rejected=assert.rejects(p);await Promise.resolve();
 if(mode==='dispose-during-compile')warm.dispose();
 else if(mode==='loss-during-compile')r.lose();
 else if(mode==='restore-without-loss-event')r.restore();
 else if(mode==='properties-change'){r.renderer.properties={get:()=>({})};r.calls[0].resolve();}
 else {
  if(mode.endsWith('between-programs'))r.calls[0].programs[0].getUniforms=()=>{r.uses.push(r.calls[0].programs[0]);setTimeout(()=>mode.startsWith('dispose')?warm.dispose():r.lose(),0);};
  r.calls[0].resolve();
  if(mode==='loss-during-readiness'){await tick();r.lose();}
 }
 await rejected;assert.equal(r.uses.length,mode.endsWith('between-programs')?1:0);for(const n of r.disposed.values())assert.equal(n,1);
 // Old underlying compile settles after a restored batch and must not erase it.
 if(!mode.startsWith('dispose')){
  r.restore();const retry=warm.prepare([part]);await Promise.resolve();for(const program of r.calls[1].programs)program.ready=true;r.calls[1].resolve();await retry;
  r.calls[0].resolve();await tick();await warm.prepare([part]);assert.equal(r.calls.length,2);assert.equal(r.disposed.get(r.calls[1].materials[0]),0);
 }
 warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);
 report.push({case:mode+'-no-invalid-use-and-old-settle-cannot-clear-restored-cache',passed:true});
}
{
 const f=fixture(source),r=rendererFixture(true),warm=createWarm(r.renderer,new THREE.Scene()),part={mesh:f.meshes[0],geometry:f.meshes[0].geometry};
 const a=warm.prepare([part]),b=warm.prepare([part]);await Promise.resolve();assert.equal(r.calls.length,1);
 let aDone=false,bDone=false;a.then(()=>aDone=true);b.then(()=>bDone=true);r.calls[0].resolve();await Promise.resolve();assert(!aDone&&!bDone);
 await Promise.all([a,b]);assert.equal(r.uses.length,1);assert(aDone&&bDone);warm.dispose();
 report.push({case:'shared-signature-awaits-full-first-use-phase',passed:true});
}
{
 const f=fixture(source),r=rendererFixture(true),warm=createWarm(r.renderer,new THREE.Scene());
 const api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha,prepareRender:parts=>warm.prepare(parts)}),original=f.meshes.map(mesh=>mesh.geometry);
 const first=api.set({mouthWidth:.04});while(r.calls.length===0)await tick();
 const second=api.set({mouthWidth:-.04});await tick();assert.equal(r.calls.length,1);
 r.calls[0].resolve();const [a,b]=await Promise.all([first,second]);assert.equal(a.applied,false);assert.equal(b.applied,true);assert.equal(api.getState().mouthWidth,-.04);
 assert(f.meshes.some((mesh,i)=>mesh.geometry!==original[i]));assert.equal(r.calls.length,1);
 const zero=await api.set({mouthWidth:0});assert(zero.applied);assert(f.meshes.every((mesh,i)=>mesh.geometry===original[i]));
 // A failure after the first-use phase has started cannot commit new geometry.
 f.meshes.forEach(mesh=>{mesh.material.needsUpdate=true;});const failed=api.set({mouthWidth:.04});while(r.calls.length<2)await tick();
 r.calls[1].programs[0].getUniforms=()=>{throw Error('actual geometry prepare failed');};r.calls[1].resolve();
 const result=await failed;assert.equal(result.applied,false);assert(f.meshes.every((mesh,i)=>mesh.geometry===original[i]));
 api.dispose();warm.dispose();for(const n of r.disposed.values())assert.equal(n,1);
 report.push({case:'actual-facialGeometry-generations-share-warm-only-latest-commits-reset-and-firstuse-failure-retains-original',passed:true});
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'firstuse.tested.js'),fs.readFileSync(path.join(root,'prototype/src/face-program-firstuse.js')));
fs.writeFileSync(path.join(out,'actual-helper.js'),actual);fs.writeFileSync(path.join(out,'foundation-avatar.tested.js'),foundation);
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({foundationSha:sha(Buffer.from(foundation)),scope:'Exact warm helper and imported production first-use helper; real Three objects/actual Face attributes. Mock WebGLProgram/properties/context plus real task timers. No GPU/performance claims.',report},null,2));
console.log(JSON.stringify({out,passed:report.length}));
