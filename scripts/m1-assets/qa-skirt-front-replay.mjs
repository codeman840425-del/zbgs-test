// Replay actual captured hips/thigh/chair geometry through both isolated solvers.
// No renderer, animation sweep, synthetic bone poses or production file edits.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=path.resolve(process.argv[2]||'');
const out=path.join(root,'assets-source/m1/seated-front-v1');
const reportOut=process.env.QA_SKIRT_OUTPUT?path.resolve(process.env.QA_SKIRT_OUTPUT):out;
const json=async p=>JSON.parse(await readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const capture=await json(path.join(dir,'capture.json')),target=await json(path.join(out,'target.json'));
const original=await readFile(path.join(root,'prototype/src/m1-skirt.js'),'utf8');
assert.equal(hash(original),target.solverSha256);
assert.equal(capture.sourceSkirtSha256,target.sourceSha256);
assert.equal(capture.originCaptureSha256??hash(await readFile(path.join(dir,'capture.json'))),target.captureJsonSha256);
const asset=await readFile(path.join(root,'prototype/public/assets/m1/m1-uniform-skirt.glb'));assert.equal(hash(asset),target.sourceSha256);
const localTopology=path.join(dir,'source-topology.json');
const topo=await json(await access(localTopology).then(()=>localTopology,()=>path.join(root,'experiments/skirt-offline-corrective/source-topology.json')));
const V=THREE.Vector3,M=THREE.Matrix4,loader=new GLTFLoader();
loader.register(()=>({name:'ReplayTextureStub',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
const gltf=await loader.parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
let source;gltf.scene.traverse(m=>{if(m.isSkinnedMesh)source=m;});assert.ok(source);
const parent=new THREE.Group();parent.add(source);parent.updateMatrixWorld(true);
const hips=source.skeleton.bones.find(b=>/J_Bip_C_Hips$/.test(b.name));assert.ok(hips);
const nodes={hips};
for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg'])nodes[side+part]={p:new V(),getWorldPosition(out){return out.copy(this.p);}};
const vrm={scene:{updateMatrixWorld(){}},humanoid:{getRawBoneNode:name=>nodes[name]}};
// Bind geometry is the actual GLB; radius is the actual runtime's measured fit.
// Only this offline harness bypasses its body-fit constructor, avoiding texture
// decode/full VRM load. Every update still receives actual captured world poses.
const fitToken='for (const leg of legs) {\n    leg.upper.getWorldPosition(leg.a);';
const bodyBypass=text=>{assert.equal(text.split(fitToken).length,2);return text.replace(fitToken,
 `for (const leg of legs) { leg.radius=${JSON.stringify(capture.topology.thighRadii)}[legs.indexOf(leg)]; continue;\n    leg.upper.getWorldPosition(leg.a);`);};
const injection=`
      // Isolated editable seated surface, before the unchanged contact solver.
      const authoredMix = bendDrape * authoredTarget.frontWeight[i];
      if (authoredMix > 0) {
        target.fromArray(authoredTarget.targetHipLocal[i]).applyMatrix4(hips.matrixWorld);
        particles[i].lerp(target, authoredMix);
      }
`;
const insert='      if (r.y < 0.09) collision(particles[i], boxes);';
assert.equal(original.split(insert).length,2);
const candidate=original.replace('  const V = THREE.Vector3,',`  const authoredTarget = ${JSON.stringify(target)};\n  const V = THREE.Vector3,`).replace(insert,injection+insert);
await writeFile(path.join(out,'candidate-solver.js'),candidate);
const instantiate=text=>new Function('THREE',bodyBypass(text).replace(/import \* as THREE from [^;]+;/,'').replace('export function createM1Skirt','function createM1Skirt')+';return createM1Skirt;')(THREE)({vrm,source,body:[]});
const reference=instantiate(original),next=instantiate(candidate);
parent.updateMatrixWorld(true);
const boxes=capture.topology.chair.map(b=>{
 const localBox=new THREE.Box3(new V(...b.min),new V(...b.max)),matrixWorld=new M().fromArray(b.matrixWorld),inverse=matrixWorld.clone().invert(),p=new V();
 return {localBox,matrixWorld,projectOut(world,margin){
  p.copy(world).applyMatrix4(inverse);const lo=localBox.min,hi=localBox.max;
  if(p.x<lo.x-margin||p.x>hi.x+margin||p.y<lo.y-margin||p.y>hi.y+margin||p.z<lo.z-margin||p.z>hi.z+margin)return false;
  const faces=[[p.x-lo.x+margin,'x',lo.x-margin],[hi.x+margin-p.x,'x',hi.x+margin],[p.y-lo.y+margin,'y',lo.y-margin],[hi.y+margin-p.y,'y',hi.y+margin],[p.z-lo.z+margin,'z',lo.z-margin],[hi.z+margin-p.z,'z',hi.z+margin]];
  const best=faces.reduce((a,b)=>a[0]<b[0]?a:b);p[best[1]]=best[2];world.copy(p).applyMatrix4(matrixWorld);return true;}};
});
async function f32(name){const bytes=await readFile(path.join(dir,name));assert.equal(hash(bytes),capture[name].sha256);return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}
const displayed=await f32('displayed.f32'),count=capture.topology.displayed.vertexCount;
const resultPositions=new Float32Array(displayed.length),records=[];
let maxReplayError=0,maxPinChange=0,maxIdleChange=0;
const points=Array.from({length:count},()=>new V()),p=new V(),local=new V(),axis=new V(),near=new V(),delta=new V();
function measure(solver,frame){
 const arr=solver.mesh.geometry.attributes.position.array;
 for(let i=0;i<count;i++)points[i].fromArray(arr,i*3);
 let chairSamples=0,capsuleSamples=0,maxCapsuleDepth=0,maxChairDepth=0;
 // All raw faces, no alpha filtering: a conservative diagnostic, not final
 // rendered-surface acceptance. Full actual body triangles are stored in input.
 for(const face of topo.renderTriangles)for(const bary of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){
  p.set(0,0,0);face.forEach((id,k)=>p.addScaledVector(points[id],bary[k]));
  for(const b of boxes){local.copy(p).applyMatrix4(b.matrixWorld.clone().invert());if(b.localBox.containsPoint(local)){chairSamples++;maxChairDepth=Math.max(maxChairDepth,Math.min(local.x-b.localBox.min.x,b.localBox.max.x-local.x,local.y-b.localBox.min.y,b.localBox.max.y-local.y,local.z-b.localBox.min.z,b.localBox.max.z-local.z));}}
  frame.legs.forEach((leg,i)=>{near.fromArray(leg.a);axis.fromArray(leg.b).sub(near);const t=THREE.MathUtils.clamp(delta.copy(p).sub(near).dot(axis)/axis.lengthSq(),0,1);near.addScaledVector(axis,t);const depth=capture.topology.thighRadii[i]-p.distanceTo(near);if(depth>.002){capsuleSamples++;maxCapsuleDepth=Math.max(maxCapsuleDepth,depth);}});
 }
 return {...solver.getInfo(),chairSamples,capsuleSamples,maxCapsuleDepth,maxChairDepth};
}
for(let f=0;f<capture.frames.length;f++){
 const frame=capture.frames[f];hips.matrixWorld.fromArray(frame.hipWorld);
 for(const leg of frame.legs){nodes[leg.side+'UpperLeg'].p.fromArray(leg.a);nodes[leg.side+'LowerLeg'].p.fromArray(leg.b);}
 reference.update(1/capture.fps,boxes);next.update(1/capture.fps,boxes);
 const a=reference.mesh.geometry.attributes.position.array,b=next.mesh.geometry.attributes.position.array;
 resultPositions.set(b,f*count*3);
 for(let i=0;i<a.length;i++)maxReplayError=Math.max(maxReplayError,Math.abs(a[i]-displayed[f*a.length+i]));
 for(const weld of target.pinnedWeldedIndices){const render=topo.renderToWeld.indexOf(weld);for(let k=0;k<3;k++)maxPinChange=Math.max(maxPinChange,Math.abs(a[render*3+k]-b[render*3+k]));}
 if(frame.sitProgress===0)for(let i=0;i<a.length;i++)maxIdleChange=Math.max(maxIdleChange,Math.abs(a[i]-b[i]));
 records.push({frame:frame.frame,time:frame.time,sitProgress:frame.sitProgress,reference:measure(reference,frame),candidate:measure(next,frame)});
}
const summarize=name=>({maxStretch:Math.max(...records.map(r=>r[name].maxEdgeStretch)),capsuleFrames:records.filter(r=>r[name].capsuleSamples).length,chairFrames:records.filter(r=>r[name].chairSamples).length,maxCapsuleDepth:Math.max(...records.map(r=>r[name].maxCapsuleDepth)),maxChairDepth:Math.max(...records.map(r=>r[name].maxChairDepth))});
const report={status:'isolated-numeric-candidate-not-visual-acceptance',captureBuild:capture.identity.runtimeBuild.shortId,frames:capture.frames.length,subset:Boolean(capture.originCaptureSha256),sourceSha256:target.sourceSha256,candidateSha256:hash(candidate),maxReplayError,maxPinChange,maxIdleChange,reference:summarize('reference'),candidate:summarize('candidate'),records,
 limits:[`Actual ${capture.frames.length}-frame room input${capture.originCaptureSha256?' (selected subset)':''}, original body/garments retained. No animation/controller changes.`,'Contact counts here are all-face samples against actual fitted thigh/OBB, not exact skin triangle or alpha-filtered acceptance.','No rendering, temporal CCD, self-intersection or target-device performance conclusion.']};
await mkdir(reportOut,{recursive:true});await writeFile(path.join(reportOut,'replay-report.json'),JSON.stringify(report,null,2));await writeFile(path.join(reportOut,'candidate-world.f32'),Buffer.from(resultPositions.buffer));
console.log(JSON.stringify({...report,records:undefined},null,2));
assert.ok(maxReplayError<2e-5,'Offline reference must reproduce actual captured displayed mesh before interpreting candidate');
assert.equal(maxPinChange,0,'Pins changed');assert.equal(maxIdleChange,0,'Standing changed');
