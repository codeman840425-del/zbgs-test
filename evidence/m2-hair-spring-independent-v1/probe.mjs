// Real appearance loader and official spring solver with a small authored GLB fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMSpringBoneManager,VRMSpringBoneJoint,VRMSpringBoneCollider} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createCharacterAppearance} from '../../prototype/src/character-appearance.js';
import {HAIRSTYLES} from '../../prototype/src/hairstyle-catalog.js';
import {validateHairSkin} from '../../prototype/src/hair-spring.js';

const root=path.resolve('F:/gamemake'),out=path.join(root,'evidence/m2-hair-spring-independent-v1',process.argv[2]??'');
await fs.mkdir(out,{recursive:true});
await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-probe.mjs'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceNames=['prototype/src/hair-spring.js','prototype/src/character-appearance.js','prototype/src/hair-fit-contract.js','prototype/src/foundation-avatar.js','scripts/qa-hair-spring.mjs'];
const sourceSha256=Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
for(const name of sourceNames)await fs.copyFile(path.join(root,name),path.join(out,'tested-'+path.basename(name)));
const checks=[],failures=[],cases=[],routes=new Map(),allFixtures=[],traces=[];
const check=(name,passed,details={})=>{const row={name,passed,...details};checks.push(row);if(!passed)failures.push(row);};
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const bodySha='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const sourceMaterial='F00_000_HairBack_00_HAIR';
const config={schema:'hair-spring-v1',joints:[{bone:'SpringRoot',child:'SpringTip',hitRadius:.005,stiffness:1,gravityPower:.15,gravityDir:[0,-1,0],dragForce:.4}],colliders:[{bone:'head',shape:'sphere',offset:[0,.35,0],radius:.05}]};
function fixtureGlb({badBind=false}={}){
  const chunks=[],views=[],accessors=[];let offset=0;
  const add=(array,type,componentType,count)=>{const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;accessors.push({bufferView:views.length-1,componentType,count,type});return accessors.length-1;};
  const position=add(new Float32Array([0,0,0,.01,-.15,0,-.01,-.15,0]),'VEC3',5126,3);
  accessors[position].min=[-.01,-.15,0];accessors[position].max=[.01,0,0];
  const joints=add(new Uint16Array([0,0,0,0,0,1,0,0,0,1,0,0]),'VEC4',5123,3);
  const weights=add(new Float32Array([1,0,0,0,.5,.5,0,0,.5,.5,0,0]),'VEC4',5126,3);
  const indices=add(new Uint32Array([0,1,2]),'SCALAR',5125,3);
  const identity=new THREE.Matrix4().toArray(),tipInverse=new THREE.Matrix4().makeTranslation(0,badBind?0:.2,0).toArray();
  const inverse=add(new Float32Array([...identity,...tipInverse]),'MAT4',5126,2);
  const doc={asset:{version:'2.0',generator:'independent CPU spring fixture'},scene:0,scenes:[{name:'IndependentSpringScene',nodes:[0,1]}],
    nodes:[{name:'IndependentSpringMesh',mesh:0,skin:0},{name:'SpringRoot',children:[2]},{name:'SpringTip',translation:[0,-.2,0]}],
    meshes:[{primitives:[{attributes:{POSITION:position,JOINTS_0:joints,WEIGHTS_0:weights},indices,material:0}]}],
    skins:[{joints:[1,2],inverseBindMatrices:inverse}],materials:[{name:'IndependentSourceMaterial',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1}}],
    accessors,bufferViews:views,buffers:[{byteLength:offset}]};
  let text=json(doc);text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);const binary=Buffer.concat(chunks);
  const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+binary.length,8);
  const jc=Buffer.alloc(8);jc.writeUInt32LE(text.length);jc.write('JSON',4);const bc=Buffer.alloc(8);bc.writeUInt32LE(binary.length);bc.write('BIN\0',4);
  return Buffer.concat([header,jc,text,bc,binary]);
}
function deferred(){let release,enter;return{promise:new Promise(r=>release=r),started:new Promise(r=>enter=r),release:()=>release(),enter:()=>enter()};}
let control=null;
const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const action=control;
  if(action?.path===pathname){action.gate.enter();await action.gate.promise;if(action.status){res.writeHead(action.status);res.end();return;}}
  const bytes=routes.get(pathname);res.writeHead(bytes?200:404);res.end(bytes);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const originalParse=GLTFLoader.prototype.parseAsync,originalSkeletonDispose=THREE.Skeleton.prototype.dispose;
const skeletonTraces=new Map();
THREE.Skeleton.prototype.dispose=function(){if(skeletonTraces.has(this))skeletonTraces.get(this).skeletonDisposals++;return originalSkeletonDispose.call(this);};
GLTFLoader.prototype.parseAsync=async function(...args){const parsed=await originalParse.apply(this,args);
  const meshes=[];parsed.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
  const trace={scene:parsed.scene,meshes,geometries:new Set(meshes.map(m=>m.geometry)),materials:new Set(meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material])),skeletons:new Set(meshes.filter(m=>m.isSkinnedMesh).map(m=>m.skeleton)),geometryDisposals:0,materialDisposals:0,skeletonDisposals:0};
  for(const g of trace.geometries)g.addEventListener('dispose',()=>trace.geometryDisposals++);
  for(const m of trace.materials)m.addEventListener('dispose',()=>trace.materialDisposals++);
  for(const s of trace.skeletons)skeletonTraces.set(s,trace);
  traces.push(trace);return parsed;
};
const originalCatalogLength=HAIRSTYLES.length;
async function fixture(tag,{badBind=false,outline=false}={}){
  const id='independent-spring-'+tag,base='/'+id,asset=fixtureGlb({badBind});
  const entry={id,label:id,compatibleBodies:[bodySha],sourceBodySha256:bodySha,sourceMaterial,assetSha256:sha(asset),manifestUrl:origin+base+'/manifest.json',fit:{id:id+'-fit',version:2,url:origin+base+'/fit.json',sha256:null}};
  const fit={schema:'character-hair-fit-v2',id:entry.fit.id,version:2,styleId:id,targetBodySha256:bodySha,sourceBodySha256:bodySha,assetSha256:entry.assetSha256,sourceMaterial,rawBone:'IndependentRawHead',physics:'vrm-spring',attachment:{bone:'head',space:'raw-head-bind-local',position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]},hideOriginal:{hideWholeBody:false,materialNames:[sourceMaterial]},dynamics:config};
  const fitBytes=json(fit);entry.fit.sha256=sha(fitBytes);
  const manifest={schema:'character-hairstyle-v1',id,mount:'head',headLocal:true,physics:'vrm-spring',skinned:true,sha256:entry.assetSha256,sourceMaterial,compatibleBodies:[bodySha],fit:entry.fit,url:origin+base+'/asset.glb'};
  const manifestBytes=json(manifest);entry.manifestSha256=sha(manifestBytes);HAIRSTYLES.push(entry);
  routes.set(base+'/asset.glb',asset);routes.set(base+'/fit.json',fitBytes);routes.set(base+'/manifest.json',manifestBytes);
  const fixtureDir=path.join(out,tag);await fs.mkdir(fixtureDir,{recursive:true});await fs.writeFile(path.join(fixtureDir,'asset.glb'),asset);await fs.writeFile(path.join(fixtureDir,'fit.json'),fitBytes);await fs.writeFile(path.join(fixtureDir,'manifest.json'),manifestBytes);
  const scene=new THREE.Group(),neck=new THREE.Bone(),head=new THREE.Bone();neck.name='IndependentRawNeck';head.name='IndependentRawHead';neck.position.y=1.2;head.position.y=.2;scene.add(neck);neck.add(head);
  const sourceTexture=new THREE.Texture({width:1,height:1});let sourceTextureDisposals=0;sourceTexture.addEventListener('dispose',()=>sourceTextureDisposals++);
  const source=new THREE.MeshBasicMaterial({map:sourceTexture});source.name=sourceMaterial;const sourceMaterials=[source];
  if(outline){const m=source.clone();m.name=sourceMaterial+' (Outline)';m.isOutline=true;sourceMaterials.push(m);}
  const originalHair=new THREE.Mesh(new THREE.BufferGeometry(),outline?sourceMaterials:source);head.add(originalHair);scene.updateMatrixWorld(true);
  const vrm={scene,humanoid:{getRawBoneNode:name=>name==='head'?head:name==='neck'?neck:null}};
  const appearance=createCharacterAppearance({vrm,avatarSha256:bodySha});
  const fixture={tag,id,assetPath:base+'/asset.glb',entry,scene,neck,head,sourceMaterials,sourceTexture,get sourceTextureDisposals(){return sourceTextureDisposals;},originalHair,vrm,appearance};allFixtures.push(fixture);return fixture;
}
const replacement=f=>f.head.children.find(n=>n.name==='IndependentSpringScene');
const colliders=f=>f.head.children.filter(n=>n instanceof VRMSpringBoneCollider);
const counts=trace=>({geometry:trace.geometryDisposals,material:trace.materialDisposals,skeleton:trace.skeletonDisposals});
let fatal=null;
try{
  const good=await fixture('good');const result=await good.appearance.set({hairStyle:good.id});const trace=traces.at(-1);good.scene.updateMatrixWorld(true);
  const mesh=trace.meshes[0],authored=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,1),rest=mesh.getVertexPosition(1,new THREE.Vector3());
  check('actual GLTF rest fixture has compatible inverse bind',result.applied===true&&authored.distanceTo(rest)<1e-6,{deviationM:authored.distanceTo(rest)});
  const bodyBefore=good.head.quaternion.toArray();good.head.rotation.z=.4;
  for(let i=0;i<15;i++){good.scene.updateMatrixWorld(true);good.appearance.updateDynamics(1/60);}
  check('actual appearance drives official solver once per visible update',good.appearance.getState().hairDynamics.updates===15&&good.appearance.getState().hairDynamics.localRotations.flat().every(Number.isFinite));
  const active=replacement(good),updates=good.appearance.getState().hairDynamics.updates;
  good.appearance.setBodyMode('base');for(let i=0;i<3;i++)good.appearance.updateDynamics(1/60);
  check('base mode hides and freezes replacement manager',!active.visible&&good.appearance.getState().hairDynamics.updates===updates);
  good.appearance.setBodyMode('dressed');check('showing cached spring resets its local pose',active.visible&&good.appearance.getState().hairDynamics.resets>=2);
  check('spring did not write raw body head rotation',Math.abs(good.head.rotation.z-.4)<1e-12,{before:bodyBefore,after:good.head.quaternion.toArray()});
  good.appearance.dispose();check('ordinary dispose releases parsed scene skeleton and colliders',!active.parent&&counts(trace).geometry===1&&counts(trace).skeleton===1&&colliders(good).length===0,{counts:counts(trace)});
  check('ordinary replacement disposal preserves original borrowed texture',good.sourceTextureDisposals===0&&good.sourceMaterials[0].map===good.sourceTexture);

  const invalid=await fixture('bad-bind',{badBind:true});const bad=await invalid.appearance.set({hairStyle:invalid.id});const badTrace=traces.at(-1);invalid.scene.updateMatrixWorld(true);
  const badMesh=badTrace.meshes[0],badVertex=badMesh.getVertexPosition(1,new THREE.Vector3()),expected=new THREE.Vector3().fromBufferAttribute(badMesh.geometry.attributes.position,1);
  let rejected=false;try{validateHairSkin(badTrace.scene,badTrace.meshes);}catch{rejected=true;}
  check('finite but incompatible inverse bind must reject before visible commit',bad.applied===false&&rejected,{result:bad,validatorRejected:rejected,restVertexDeviationM:badVertex.distanceTo(expected),state:invalid.appearance.getState()});invalid.appearance.dispose();

  const cloning=await fixture('clone-failure',{outline:true});const sourceOutline=cloning.sourceMaterials[1];const originalClone=sourceOutline.clone;
  const firstSource=cloning.sourceMaterials[0],firstSourceClone=firstSource.clone;let partialCloneDisposals=0;
  firstSource.clone=function(){const material=firstSourceClone.call(this);material.addEventListener('dispose',()=>partialCloneDisposals++);return material;};
  sourceOutline.clone=()=>{throw Error('Independent outline clone failure');};
  const failed=await cloning.appearance.set({hairStyle:cloning.id});sourceOutline.clone=originalClone;firstSource.clone=firstSourceClone;const cloneTrace=traces.at(-1);
  check('material clone rejection preserves old visible hair',failed.applied===false&&cloning.originalHair.visible&&cloning.appearance.getState().hairStyle==='original',{result:failed});
  check('material clone rejection releases parsed geometry material skeleton and partial clone',cloneTrace.geometryDisposals===1&&cloneTrace.materialDisposals===1&&cloneTrace.skeletonDisposals===1&&partialCloneDisposals===1,{counts:counts(cloneTrace),partialCloneDisposals});cloning.appearance.dispose();
  check('clone failure cleanup preserves original borrowed texture',cloning.sourceTextureDisposals===0&&cloning.sourceMaterials[0].map===cloning.sourceTexture);

  const reentry=await fixture('dispose-during-add');let triggered=false;
  const onAdd=event=>{if(event.child.name==='IndependentSpringScene'){triggered=true;reentry.appearance.dispose();}};reentry.head.addEventListener('childadded',onAdd);
  const late=await reentry.appearance.set({hairStyle:reentry.id});reentry.head.removeEventListener('childadded',onAdd);const reentryTrace=traces.at(-1);
  check('dispose during head childadded prevents late cache/proxy installation',triggered&&late.cancelled===true&&!replacement(reentry)&&colliders(reentry).length===0&&reentryTrace.geometryDisposals===1&&reentryTrace.skeletonDisposals===1,
    {result:late,attachedReplacement:Boolean(replacement(reentry)),colliderCount:colliders(reentry).length,counts:counts(reentryTrace)});

  const cancelled=await fixture('cancelled-load');const gate=deferred();control={path:cancelled.assetPath,gate};const pending=cancelled.appearance.set({hairStyle:cancelled.id});await gate.started;
  await cancelled.appearance.set({hairStyle:'original'});gate.release();const old=await pending;control=null;
  check('ordinary newer selection cancels deferred load and keeps it hidden',old.cancelled===true&&cancelled.appearance.getState().hairStyle==='original'&&!replacement(cancelled)?.visible,{result:old});
  const cancelledTrace=traces.at(-1);cancelled.appearance.dispose();check('cancelled hidden cache releases on owner disposal',!replacement(cancelled)&&colliders(cancelled).length===0&&cancelledTrace.geometryDisposals===1&&cancelledTrace.skeletonDisposals===1,{counts:counts(cancelledTrace)});

  const bodyManagerFixture=await fixture('independent-managers');const oldRoot=new THREE.Bone(),oldTip=new THREE.Bone();oldTip.position.y=-.1;oldRoot.add(oldTip);bodyManagerFixture.head.add(oldRoot);bodyManagerFixture.scene.updateMatrixWorld(true);
  const originalManager=new VRMSpringBoneManager();const originalJoint=new VRMSpringBoneJoint(oldRoot,oldTip,{hitRadius:0,stiffness:1,gravityPower:.1,gravityDir:new THREE.Vector3(0,-1,0),dragForce:.4},[]);originalManager.addJoint(originalJoint);originalManager.setInitState();originalManager.reset();
  oldRoot.rotation.x=.12;const originalRotation=oldRoot.quaternion.toArray();await bodyManagerFixture.appearance.set({hairStyle:bodyManagerFixture.id});bodyManagerFixture.appearance.resetDynamics();
  check('replacement initialization/reset leaves original manager joint pose intact',JSON.stringify(oldRoot.quaternion.toArray())===JSON.stringify(originalRotation));
  bodyManagerFixture.appearance.dispose();originalManager.deleteJoint(originalJoint);
}catch(error){fatal={message:error.message,stack:error.stack};}
finally{
  for(const f of allFixtures)f.appearance.dispose();
  HAIRSTYLES.splice(originalCatalogLength);GLTFLoader.prototype.parseAsync=originalParse;THREE.Skeleton.prototype.dispose=originalSkeletonDispose;
  await new Promise(r=>server.close(r));
}
const finalSha256=Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
check('reviewed sources stable through probe',JSON.stringify(sourceSha256)===JSON.stringify(finalSha256),{sourceSha256,finalSha256});
const report={schema:'independent-hair-spring-cpu-v1',probeSourceSha256:sha(await fs.readFile(new URL(import.meta.url))),sourceSha256,finalSha256,checks,failures,fatal,
  limits:['Real Three187 GLTFLoader, appearance/fit modules and official three-vrm3.5.5 solver. The GLB is a small authored CPU fixture, not the forthcoming actual ponytail source.','The hairstyle catalog is extended only in this test process memory and restored. HTTP resources are pinned generated fixture bytes.','No browser, GPU, real long-hair collision/occlusion, performance or visual acceptance. Foundation update ordering was reviewed statically, not executed through a renderer.']};
await fs.writeFile(path.join(out,'report.json'),json(report));console.log(JSON.stringify({checks:checks.length,failures,fatal,sourceSha256},null,2));
