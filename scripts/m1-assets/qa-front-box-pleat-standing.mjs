// Original solver, actual captured standing hips/thigh/body/top. No browser or controller changes.
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import path from 'node:path';
const root=path.resolve('.'),out=path.join(root,'assets-source/m1/front-box-pleat-v1'),capdir=path.resolve(process.argv[2]||path.join(root,'experiments/skirt-offline-corrective/front-input-175a487d5ea3'));
const hash=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'));
const cfg=await json(path.join(out,'parameters.json')),build=await json(path.join(out,'build-report.json')),cap=await json(path.join(capdir,'capture.json')),code=await readFile(path.join(root,'prototype/src/m1-skirt.js'),'utf8');
assert.equal(hash(code),'10a072d3ceecaeb798f5025c19387e7b7a65ee6ad1adf2f9fbb67507b6184e86');assert.equal(cap.identity.primary.actualSha256,cfg.bodySha256);
const V=THREE.Vector3,M=THREE.Matrix4,loader=new GLTFLoader();loader.register(()=>({name:'OfflineTextureStub',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
const oldAsset=await readFile(path.join(root,cfg.source)),newAsset=await readFile(path.join(out,cfg.id+'.glb'));assert.equal(hash(oldAsset),cfg.sourceSha256);assert.equal(hash(newAsset),build.outputSha256);
const getDoc=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()),oldDoc=getDoc(oldAsset),newDoc=getDoc(newAsset);assert.deepEqual(newDoc.skins,oldDoc.skins);assert.deepEqual(newDoc.nodes.slice(1),oldDoc.nodes.slice(1));assert.deepEqual(newDoc.materials,oldDoc.materials);assert.deepEqual(newDoc.images,oldDoc.images);
const fitToken='for (const leg of legs) {\n    leg.upper.getWorldPosition(leg.a);';assert.equal(code.split(fitToken).length,2);
const source=code.replace(fitToken,`for (const leg of legs) {leg.radius=${JSON.stringify(cap.topology.thighRadii)}[legs.indexOf(leg)];continue;\n leg.upper.getWorldPosition(leg.a);`).replace(/import \* as THREE from [^;]+;/,'').replace('export function createM1Skirt','function createM1Skirt');
async function load(bytes){
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let mesh;gltf.scene.traverse(m=>{if(m.isSkinnedMesh)mesh=m;});assert(mesh);
 const parent=new THREE.Group();parent.add(mesh);parent.updateMatrixWorld(true);const hips=mesh.skeleton.bones.find(b=>b.name==='J_Bip_C_Hips'),nodes={hips};
 for(const side of ['left','right'])for(const part of ['UpperLeg','LowerLeg'])nodes[side+part]={p:new V(),getWorldPosition(v){return v.copy(this.p);}};
 const vrm={scene:{updateMatrixWorld(){}},humanoid:{getRawBoneNode:name=>nodes[name]}};
 const solver=new Function('THREE',source+';return createM1Skirt;')(THREE)({vrm,source:mesh,body:[]});parent.updateMatrixWorld(true);
 return {mesh,hips,nodes,solver};
}
const original=await load(oldAsset),candidate=await load(newAsset);let originalMaxError=0,rootPinDelta=0;const count=candidate.mesh.geometry.attributes.position.count;
const displayedBytes=await readFile(path.join(capdir,'displayed.f32')),displayed=new Float32Array(displayedBytes.buffer.slice(displayedBytes.byteOffset,displayedBytes.byteOffset+displayedBytes.byteLength));
const results=new Float32Array(60*count*3),originalCount=original.mesh.geometry.attributes.position.count,records=[];
for(let frame=0;frame<60;frame++){
 const f=cap.frames[frame];assert.equal(f.sitProgress,0);
 for(const x of [original,candidate]){x.hips.matrixWorld.fromArray(f.hipWorld);for(const leg of f.legs){x.nodes[leg.side+'UpperLeg'].p.fromArray(leg.a);x.nodes[leg.side+'LowerLeg'].p.fromArray(leg.b);}x.solver.update(1/30,[]);}
 const a=original.solver.mesh.geometry.attributes.position.array,b=candidate.solver.mesh.geometry.attributes.position.array;results.set(b,frame*count*3);
 for(let i=0;i<a.length;i++)originalMaxError=Math.max(originalMaxError,Math.abs(a[i]-displayed[frame*a.length+i]));
 for(const i of build.preservedPinRenderVertices)for(let k=0;k<3;k++)rootPinDelta=Math.max(rootPinDelta,Math.abs(a[i*3+k]-b[i*3+k]));
 records.push({frame:f.frame,original:original.solver.getInfo(),candidate:candidate.solver.getInfo()});
}
assert(originalMaxError<2e-5,'Original offline replay must agree with actual room capture');assert.equal(rootPinDelta,0,'Original waist pins moved');
const captured=structuredClone(cap);captured.frames=cap.frames.slice(0,60);captured.purpose='OFFLINE derived source-pattern replay, not actual integrated asset playback';captured.offlineCandidate={assetSha256:hash(newAsset),id:cfg.id,solverSha256:hash(code),radiusSource:'actual unchanged175 body calibration',originalMaxError,rootPinDelta};
const topo=captured.topology.displayed;topo.name=cfg.id+'-offline';topo.vertexCount=count;topo.triangles=Array.from(candidate.mesh.geometry.index.array);topo.uv=Array.from(candidate.mesh.geometry.attributes.uv.array);
const dir=path.join(out,'standing-derived-input');await mkdir(dir,{recursive:true});const body=await readFile(path.join(capdir,'colliders.f32')),stride=cap.topology.colliders.reduce((n,m)=>n+m.vertexCount*12,0),subset=body.subarray(0,60*stride);
for(const [name,bytes]of [['colliders.f32',subset],['displayed.f32',Buffer.from(results.buffer)]]){await writeFile(path.join(dir,name),bytes);captured[name]={sha256:hash(bytes),bytes:bytes.length};}
await writeFile(path.join(dir,'capture.json'),JSON.stringify(captured));
const report={status:'source-bind-and-original-solver-standing-replay-only',id:cfg.id,assetSha256:hash(newAsset),originalMaxError,rootPinDelta,frames:60,realSourceBindings:true,materialsAndEmbeddedImagesUnchanged:true,weightTransferGate:build.weightTransferGate,maxInterpolatedWeightDropped:build.maxInterpolatedWeightDropped,records,limits:['Radius copied from actual unchanged175 runtime; no live new-equipment binding render yet.','Actual source body/top unchanged and captured standing only. No sit/playback validation.','Triangle gate follows separately; this report cannot pass contacts.']};
await writeFile(path.join(out,'standing-replay.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,records:undefined},null,2));
