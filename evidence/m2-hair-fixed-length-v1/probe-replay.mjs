import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createHairSpring as candidate} from '../../prototype/src/hair-spring.js';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..');
// Preserve the baseline source bytes and change only bare import specifiers
// for this evidence-directory execution. No node_modules junction is required.
const baselineSource=await fs.readFile(path.join(out,'baseline-hair-spring.mjs'),'utf8');
const baselineExecutable=baselineSource.replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`)
 .replace("from '@pixiv/three-vrm'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js')).href}'`);
const {createHairSpring:baseline}=await import('data:text/javascript;base64,'+Buffer.from(baselineExecutable).toString('base64'));
const capture=JSON.parse(await fs.readFile(path.join(out,'actual508-samples.json'),'utf8'));
const fit=JSON.parse(await fs.readFile(path.join(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json'),'utf8'));
const config={...fit.dynamics,colliders:[]};
const main=await fs.readFile(path.join(root,'prototype/src/main.js'),'utf8');
const chairCollider=new Function('THREE',main.slice(main.indexOf('function chairCollider('),main.indexOf('chairBounds.push('))+'\nreturn chairCollider;')(THREE);
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceSha256={baseline:sha(await fs.readFile(path.join(out,'baseline-hair-spring.mjs'))),candidate:sha(await fs.readFile(path.join(root,'prototype/src/hair-spring.js'))),asset:sha(await fs.readFile(path.join(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb')))};
async function rig(sample){
 const bytes=await fs.readFile(path.join(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb'));
 const loader=new GLTFLoader();loader.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const world=new THREE.Group();world.add(scene);scene.matrixAutoUpdate=false;scene.matrix.fromArray(sample.meshes[0].bones[0].matrixWorld);
 sample.hair.localRotations.forEach((q,i)=>scene.getObjectByName('Pony'+i).quaternion.fromArray(q));
 const boxes=sample.boxes.map(b=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...b.localMax.map((v,i)=>v-b.localMin[i])),new THREE.MeshBasicMaterial());
  mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(b.matrixWorld);world.add(mesh);world.updateMatrixWorld(true);
  const p=chairCollider(mesh,b.name);p.refresh();return p;
 });
 world.updateMatrixWorld(true);const mesh=scene.getObjectByName('LongHairMesh');
 return{world,scene,mesh,boxes};
}
function contact(r){
 r.world.updateMatrixWorld(true);const positions=Array.from({length:r.mesh.geometry.attributes.position.count},(_,i)=>r.mesh.localToWorld(r.mesh.getVertexPosition(i,new THREE.Vector3())));
 return r.boxes.map(b=>{
   let inside=0,maxDepth=0;const local=new THREE.Vector3();
   positions.forEach(p=>{local.copy(p).applyMatrix4(b.inverseMatrixWorld);const lo=b.localBox.min,hi=b.localBox.max;
    if(local.x>lo.x&&local.x<hi.x&&local.y>lo.y&&local.y<hi.y&&local.z>lo.z&&local.z<hi.z){inside++;maxDepth=Math.max(maxDepth,Math.min(local.x-lo.x,hi.x-local.x,local.y-lo.y,hi.y-local.y,local.z-lo.z,hi.z-local.z));}});
   return{box:b.name,inside,maxDepthLocalM:maxDepth};
 });
}
const rows=[];let failure=null;
try{
 for(let i=0;i<capture.samples.length;i++){
  const sample=capture.samples[i],row={sample:i,capturedMs:sample.ms,runs:[]};
  for(const [name,create] of [['baseline',baseline],['candidate',candidate]]){
   const r=await rig(sample);
   const replayError=Math.max(...sample.meshes[0].vertices.map(v=>r.mesh.localToWorld(r.mesh.getVertexPosition(v.id,new THREE.Vector3())).distanceTo(new THREE.Vector3(...v.world))));
   assert(replayError<1e-12);const before=contact(r);
   const manager=create({scene:r.scene,vrm:{humanoid:{getRawBoneNode:()=>null}},config,environmentColliders:r.boxes});manager.reset();manager.update(1/120);
   const oneStep=contact(r);for(let k=1;k<120;k++)manager.update(1/120);
   const after120=contact(r),state=manager.getState();assert(state.localRotations.flat().every(Number.isFinite));
   row.runs.push({name,replayVertexErrorM:replayError,before,oneStep,after120,state});manager.dispose();
   assert(r.boxes.every(b=>b.mesh.children.length===0));
  }
  rows.push(row);
 }
}catch(e){failure={message:e.message,stack:e.stack};}
const report={sourceSha256,sourceReportSha256:capture.sourceReportSha256,rows,failure,limits:['Actual three captured 508 poses reproduce all609 skinned world vertices before testing.','One official solver step and120-step frozen-head fixtures isolate environment collision with unchanged joint parameters and body proxies omitted. Original body proxy frames were not captured. This is not full game replay or browser acceptance.']};
await fs.writeFile(path.join(out,process.argv[2]??'replay-report-final.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceSha256,rows:rows.map(r=>({sample:r.sample,runs:r.runs.map(s=>({name:s.name,replayError:s.replayVertexErrorM,before:s.before,oneStep:s.oneStep,after120:s.after120,diagnostics:s.state.environmentCollisionDiagnostics}))})),failure},null,2));if(failure)process.exitCode=1;
