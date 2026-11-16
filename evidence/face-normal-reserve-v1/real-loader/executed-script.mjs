import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {reserveFaceNormalLayout} from '../prototype/src/face-normal-reservation.js';
import {sha} from './face-visible-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||'');assert(process.argv[2]&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const report={scope:'Actual GLTFLoader/VRMLoaderPlugin geometry and expression mapping; texture decode stubbed with empty THREE.Texture only, no GPU or visual test.',bodies:[]};
function load(bytes){
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'/assets/foundation/');
}
function faceMeshes(vrm){const result=[];vrm.scene.traverse(m=>{if(m.isMesh&&m.geometry.morphAttributes.position)result.push(m);});return result;}
try{
 for(const sex of ['female','male']){
  const bytes=fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
  const ga=await load(bytes),gb=await load(bytes),a=ga.userData.vrm,b=gb.userData.vrm;VRMUtils.rotateVRM0(a);VRMUtils.rotateVRM0(b);
  const am=faceMeshes(a),bm=faceMeshes(b);assert.equal(am.length,9);assert.equal(bm.length,9);
  const receipt=reserveFaceNormalLayout(b,sha(bytes));assert.equal(receipt.geometryCount,6);assert.equal(reserveFaceNormalLayout(b,sha(bytes)).alreadyPrepared,true);
  for(let i=0;i<am.length;i++){
   assert.deepEqual(am[i].geometry.groups,bm[i].geometry.groups);
   assert.deepEqual(am[i].morphTargetDictionary,bm[i].morphTargetDictionary);
   for(const [name,attr]of Object.entries(am[i].geometry.attributes))assert.equal(sha(attr.array),sha(bm[i].geometry.attributes[name].array));
   am[i].geometry.morphAttributes.position.forEach((v,j)=>assert.equal(sha(v.array),sha(bm[i].geometry.morphAttributes.position[j].array)));
   for(const z of bm[i].geometry.morphAttributes.normal||[])assert(z.array.every(v=>Object.is(v,0)));
  }
  const names=Object.keys(a.expressionManager.expressionMap),cases=[];
  for(const expression of [...names,'mixed']){
   for(const name of names){a.expressionManager.setValue(name,0);b.expressionManager.setValue(name,0);}
   const values=expression==='mixed'?{happy:.65,blink:.999,aa:.512}: {[expression]:1};
   for(const [k,v]of Object.entries(values)){a.expressionManager.setValue(k,v);b.expressionManager.setValue(k,v);}
   a.expressionManager.update();b.expressionManager.update();
   for(let i=0;i<am.length;i++){
    assert.deepEqual(am[i].morphTargetInfluences,bm[i].morphTargetInfluences);
    assert(bm[i].morphTargetInfluences.every(Number.isFinite));
    // Every additional relative normal term is exactly 0 for each finite
    // influence. Position morph arrays and influences are byte/value identical.
    for(const z of bm[i].geometry.morphAttributes.normal||[])assert(z.array.every(v=>v===0));
   }
   cases.push({expression,passed:true});
  }
  const geometries=new Set(bm.map(m=>m.geometry)),reserved=[...geometries].filter(g=>g.morphAttributes.normal);
  const buffers=new Set(reserved.flatMap(g=>g.morphAttributes.normal.map(a=>a.array.buffer)));
  const n=bm[0].geometry.attributes.position.count,t=bm[0].geometry.morphAttributes.position.length;
  const textureCosts=[2048,4096,8192,16384].map(max=>{
   const packed=stride=>{const width=Math.min(n*stride,max),height=Math.ceil(n*stride/max);return {width,height,bytes:width*height*4*t*4};};
   const old=packed(1),next=packed(2),extra=next.bytes-old.bytes;
   return {maxTextureSize:max,originalPerGeometry:old,reservedPerGeometry:next,additionalCPUBackingAndGPUBytesEach:extra,additionalSixGeometryBytes:6*extra,additionalAllNineBytes:9*extra};
  });
  report.bodies.push({sex,avatarSha256:sha(bytes),meshCount:bm.length,uniqueGeometryCount:geometries.size,reservedGeometryCount:reserved.length,normalZeroBuffers:buffers.size,normalZeroCPUBytes:[...buffers].reduce((s,b)=>s+b.byteLength,0),normalAttributes:reserved[0].morphAttributes.normal.length,groups:bm.map(m=>m.geometry.groups),expressionCases:cases,textureCosts});
  VRMUtils.deepDispose(a.scene);VRMUtils.deepDispose(b.scene);
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=String(e);console.error(e);process.exitCode=1;}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));console.log(JSON.stringify({status:report.status,bodies:report.bodies.map(b=>({sex:b.sex,expressions:b.expressionCases.length,reserved:b.reservedGeometryCount,zeroCPUBytes:b.normalZeroCPUBytes}))}));
