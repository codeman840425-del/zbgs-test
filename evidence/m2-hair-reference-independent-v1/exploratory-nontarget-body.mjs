import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..');
const candidateRoot=path.resolve(process.argv[2]||'F:/gamemake-hat-hair');
const folder='assets-source/m2-long-hair-v1/revisions/raw-head-reference-v3';
const read=async(base,p)=>fs.readFile(path.join(base,p));
const json=async(base,p)=>JSON.parse(await read(base,p));
const arrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[];const check=(name,passed,data={})=>checks.push({name,passed,...data});
globalThis.self={URL:globalThis.URL};
globalThis.ProgressEvent??=class{constructor(type,details){this.type=type;Object.assign(this,details);}};
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return originalParse.apply(this,args);};
const dependencyHook=registerHooks({resolve(specifier,context,next){return next(specifier,(specifier==='three'||specifier.startsWith('@pixiv/'))?{...context,parentURL:pathToFileURL(path.join(root,'prototype/src/hair-spring.js')).href}:context);}});
const {createHairSpring,validateHairSpringConfig,validateHairSkin}=await import(pathToFileURL(path.join(candidateRoot,'prototype/src/hair-spring.js')));
const {validateHairFitData,hairFitIdentity,sameHairFit}=await import(pathToFileURL(path.join(candidateRoot,'prototype/src/hair-fit-contract.js')));
let dynamics=null,vrm=null,originalUpdate=null,fatal=null;
const circularWarnings=[],originalWarn=console.warn;
console.warn=(...args)=>{if(String(args[0]).includes('Circular dependency'))circularWarnings.push(args.map(String));else originalWarn(...args);};
try{
 const fit=await json(candidateRoot,folder+'/fit.json'),manifest=await json(candidateRoot,folder+'/manifest.json'),spec=await json(candidateRoot,folder+'/source-spec.json');
 const old=await json(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json');
 const oldManifest=await json(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/manifest.json');
 const oldCopy=structuredClone(old),newCopy=structuredClone(fit);
 for(const value of [oldCopy,newCopy])for(const key of ['id','styleId','version'])delete value[key];
 delete newCopy.dynamics.simulationReference;
 check('candidate changes only fit identity and declared reference while retaining forces colliders attachment hide and acceptance',JSON.stringify(oldCopy)===JSON.stringify(newCopy)&&fit.runtimeAccepted===false&&fit.version===3&&fit.dynamics.simulationReference==='raw-head'&&fit.styleId==='female-ponytail-headref-v3');
 const oldMCopy=structuredClone(oldManifest),newMCopy=structuredClone(manifest);
 for(const value of [oldMCopy,newMCopy])for(const key of ['id','version','label','fit'])delete value[key];
 const assetBytes=await read(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb');
 check('manifest retains exact original GLB path bytes SHA and all nonidentity fields',JSON.stringify(oldMCopy)===JSON.stringify(newMCopy)&&sha(assetBytes)===manifest.sha256&&manifest.sha256==='1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385'&&manifest.bytes===assetBytes.length&&spec.runtimeAccepted===false);
 const entry={id:manifest.id,sourceBodySha256:fit.sourceBodySha256,assetSha256:manifest.sha256,sourceMaterial:manifest.sourceMaterial,fit:manifest.fit};
 check('actual validator accepts new exact fit and identifies version separately from original',Boolean(validateHairFitData(fit,entry,fit.targetBodySha256,manifest))&&!sameHairFit(hairFitIdentity(entry),{kind:'explicit-fit-v1',id:old.id,version:old.version,sha256:sha(await read(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json'))}));
 let badBody=false,badStyle=false,badReference=false;
 try{validateHairFitData(fit,entry,'0'.repeat(64),manifest);}catch{badBody=true;}
 try{validateHairFitData(fit,{...entry,id:old.styleId},fit.targetBodySha256,manifest);}catch{badStyle=true;}
 try{validateHairSpringConfig({...fit.dynamics,simulationReference:'normalized-head'});}catch{badReference=true;}
 check('actual validators reject wrong body old style and unsupported reference',badBody&&badStyle&&badReference);
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const avatar=await loader.parseAsync(arrayBuffer(await read(root,'prototype/public/assets/foundation/base-female.vrm')),'');
 vrm=avatar.userData.vrm;assert(vrm);const head=vrm.humanoid.getRawBoneNode('head'),chest=vrm.humanoid.getRawBoneNode('chest');
 const hair=await new GLTFLoader().parseAsync(arrayBuffer(assetBytes),'');const meshes=[];hair.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});validateHairSkin(hair.scene,meshes);
 const initialChildren={head:head.children.length,chest:chest.children.length};head.add(hair.scene);vrm.scene.updateMatrixWorld(true);
 const actualConfig=structuredClone(fit.dynamics);dynamics=createHairSpring({vrm,scene:hair.scene,config:actualConfig});dynamics.reset();
 originalUpdate=vrm.springBoneManager.update;let originalUpdates=0;
 vrm.springBoneManager.update=function(...args){originalUpdates++;return originalUpdate.apply(this,args);};
 let maxRawLocalChange=0,maxHeadWorldError=0,allFinite=true;
 for(let i=0;i<12;i++){
  vrm.humanoid.getNormalizedBoneNode('head').rotation.x=.2*Math.sin(i/4);
  vrm.scene.position.set(.1*i,-.01*i,0);
  vrm.update(1/60);
  const before=[...head.position.toArray(),...head.quaternion.toArray(),...head.scale.toArray(),...chest.position.toArray(),...chest.quaternion.toArray()];
  dynamics.update(1/60);
  const after=[...head.position.toArray(),...head.quaternion.toArray(),...head.scale.toArray(),...chest.position.toArray(),...chest.quaternion.toArray()];
  maxRawLocalChange=Math.max(maxRawLocalChange,...before.map((v,k)=>Math.abs(v-after[k])));
  const expected=new THREE.Matrix4().multiplyMatrices(head.parent.matrixWorld,head.matrix);
  maxHeadWorldError=Math.max(maxHeadWorldError,...expected.elements.map((v,k)=>Math.abs(v-head.matrixWorld.elements[k])));
  allFinite&&=dynamics.getState().worldTails.flat().every(Number.isFinite);
 }
 check('actual VRM humanoid then isolated manager update is finite and does not rewrite raw head chest local TRS',allFinite&&maxRawLocalChange===0&&maxHeadWorldError<1e-12,{maxRawLocalChange,maxHeadWorldError,frames:12});
 check('actual isolated update adds no original manager update or dependency cycle',originalUpdates===12&&circularWarnings.length===0,{originalUpdates,circularWarnings});
 check('actual new reference has six joints and unchanged three body colliders',dynamics.getState().jointCount===6&&dynamics.getState().bodyColliderCount===3&&dynamics.getState().simulationFrame==='raw-head');
 dynamics.dispose();dynamics=null;
 check('disposing actual candidate removes body proxies and preserves original root centers',head.children.length===initialChildren.head+1&&chest.children.length===initialChildren.chest&&[...vrm.springBoneManager.joints].every(j=>j.center?.name==='Root'));
 const missingVRM={scene:vrm.scene,humanoid:{getRawBoneNode:()=>null}};let missingError;
 try{createHairSpring({vrm:missingVRM,scene:hair.scene,config:fit.dynamics});}catch(e){missingError=e.message;}
 check('missing raw head fails before creating any collider',Boolean(missingError)&&head.children.length===initialChildren.head+1&&chest.children.length===initialChildren.chest,{missingError});
}catch(e){fatal={message:e.message,stack:e.stack};}
finally{dynamics?.dispose();if(vrm&&originalUpdate)vrm.springBoneManager.update=originalUpdate;console.warn=originalWarn;GLTFLoader.prototype.parseAsync=originalParse;dependencyHook.deregister();}
const files=['prototype/src/hair-spring.js','prototype/src/hair-fit-contract.js',folder+'/fit.json',folder+'/manifest.json',folder+'/source-spec.json','scripts/m2-long-hair-v1/raw-head-reference-v3.py'];
const sourceSha256=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await read(candidateRoot,f))])));
const report={candidateRoot,sourceSha256,checks,fatal,limits:['Real original female VRM + exact rootjoin-v2 skinned GLB, actual validation and installed solver. CPU 1x1 texture decode placeholders only.','Twelve simple normalized-head/root-motion steps test ordering, finiteness, ownership and manager count. They do not reconstruct e9b trajectory, measure naturalness, or test room contacts.','Root catalog publication and browser same-camera comparison remain root-owned. No runtime/source files changed and no GPU/browser started.']};
await fs.writeFile(path.join(out,'candidate-review.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:checks.length,failures:checks.filter(c=>!c.passed),fatal},null,2));
if(fatal||checks.some(c=>!c.passed))process.exitCode=1;
