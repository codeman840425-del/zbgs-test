import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as THREE from '../../../prototype/node_modules/three/build/three.module.js';
import {prepareFaceShadowPrograms,waitFaceShadowJob} from '../../../prototype/src/face-shadow-preparation.js';
const out=path.resolve(process.argv[2]);assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('prototype/src/foundation-avatar.js','utf8'),start=source.indexOf('export function createFaceGeometryWarmup'),end=source.indexOf('export async function loadFoundationAvatar',start);
const createWarm=vm.runInNewContext('('+source.slice(start,end).replace('export function','function')+')',{THREE,prepareFaceShadowPrograms,waitFaceShadowJob,AbortController});
const tick=()=>new Promise(r=>setTimeout(r,8));const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
let pump=()=>{},rafClock=()=>performance.now();globalThis.requestAnimationFrame=fn=>setTimeout(()=>{pump();fn(rafClock());},2);globalThis.cancelAnimationFrame=clearTimeout;
function fixture(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),light=new THREE.DirectionalLight();light.castShadow=true;scene.add(light);scene.fog=new THREE.Fog(0,1,2);
 const meshes=Array.from({length:2},()=>{const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));mesh.castShadow=true;scene.add(mesh);return mesh;});
 const prior=meshes.map(m=>m.onBeforeShadow),depth=new THREE.MeshDepthMaterial(),canvas=new EventTarget(),calls=[],materials=[],used=[],disposed=new Set(),maps=new WeakMap();
 let current=null,lost=false;const shadowTarget={uuid:'actual-shadow'},program={program:{},isReady:()=>true,getUniforms(){used.push(program);if(options.uniformThrow)throw Error('uniform throw');if(options.invalid)program.diagnostics={runnable:false};return{};}};
 const options={};
 const renderer={domElement:canvas,shadowMap:{enabled:true,autoUpdate:true,type:THREE.PCFShadowMap},getContext:()=>({isContextLost:()=>lost}),getRenderTarget:()=>current,getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>3,setRenderTarget(t,c,m){current=t;},properties:{get(m){if(!maps.has(m))maps.set(m,{});return maps.get(m);}},
  compileAsync(staging,camera,target){const mats=[];staging.traverse(o=>{if(o.isMesh)mats.push(...(Array.isArray(o.material)?o.material:[o.material]));});const isDepth=mats.some(m=>m.isMeshDepthMaterial);calls.push({isDepth,current,target,mats});
   for(const m of mats){materials.push(m);m.addEventListener('dispose',()=>disposed.add(m));if(m.isMeshDepthMaterial)renderer.properties.get(m).programs=new Map([['depth',program]]);}
   if(isDepth){assert.equal(current,shadowTarget);assert.equal(target.fog,null);assert.equal(target.children.filter(o=>o.isLight).length,1);if(options.depthThrow)throw Error('depth compile failure');}
   return options.gate&&isDepth===options.gateDepth?options.gate.promise:Promise.resolve(staging);
  }};
 pump=()=>{if(options.noCapture)return;current=shadowTarget;for(const m of meshes)m.onBeforeShadow(renderer,m,camera,camera,m.geometry,depth,null);current=null;};
 const warm=createWarm(renderer,scene),parts=meshes.map(mesh=>({mesh,geometry:mesh.geometry.clone()}));
 return{renderer,scene,meshes,prior,warm,parts,calls,materials,disposed,used,program,options,current:()=>current,loss(){lost=true;canvas.dispatchEvent(new Event('webglcontextlost'));},restore(){lost=false;canvas.dispatchEvent(new Event('webglcontextrestored'));}};
}
const rows=[];async function run(name,test){await test();rows.push({name,passed:true});}
try{
 const f=fixture();let losses=0;
 f.program.getUniforms=()=>{queueMicrotask(()=>queueMicrotask(()=>queueMicrotask(()=>{losses++;f.loss();})));return{};};
 const result=await Promise.allSettled([f.warm.prepare(f.parts)]);
 await tick();
 const beforeDispose={created:f.materials.length,released:f.disposed.size};
 f.warm.dispose();
 const witness={losses,result:result.map(x=>({status:x.status,reason:String(x.reason)})),beforeDispose,afterDispose:{created:f.materials.length,released:f.disposed.size}};
 fs.writeFileSync(path.join(out,'witness.json'),JSON.stringify(witness,null,2));
 console.log(JSON.stringify(witness));
 const hashes={};for(const n of ['foundation-avatar.js','face-shadow-preparation.js']){const b=fs.readFileSync('prototype/src/'+n);hashes[n]=crypto.createHash('sha256').update(b).digest('hex');fs.writeFileSync(path.join(out,n),b);}
 fs.copyFileSync(import.meta.filename,path.join(out,'executed-script.mjs'));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({hashes,rows,scope:'Actual warm/helper with Three mesh/material classes; renderer mocked, no GPU or actual compile identity proof.'},null,2));console.log(JSON.stringify({passed:rows.length,hashes}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({rows,error:String(error),stack:error.stack},null,2));throw error;}
