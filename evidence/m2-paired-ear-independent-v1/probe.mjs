import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=path.resolve('F:/gamemake');
const out=path.join(root,'evidence/m2-paired-ear-independent-v1',process.argv[2]??'');
await fs.mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['prototype/src/rigid-accessory-layer.js','prototype/src/foundation-avatar.js','prototype/src/main.js'];
const sourceSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
await fs.copyFile(path.join(root,sourceFiles[0]),path.join(out,'tested-rigid-accessory-layer.js'));
const T=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')));
const {GLTFLoader}=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js')));
const {VRMLoaderPlugin,VRMUtils}=await import(pathToFileURL(path.join(root,'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js')));
const {createRigidAccessoryLayer}=await import(pathToFileURL(path.join(root,sourceFiles[0])));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
const source=path.join(root,'prototype/public/assets/m2-paired-ear-accessory-v1');
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json')));
const checks=[],failures=[],requests=[],bodyRecords=[],warnings=[];
const check=(name,ok,details={})=>{const row={name,ok,...details};checks.push(row);if(!ok)failures.push(row);};
function deferred(){let release,started;return{wait:new Promise(r=>release=r),begun:new Promise(r=>started=r),release:()=>release(),started:()=>started()};}
let control={};
const server=http.createServer(async(req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname.slice(1);requests.push(file);
  const action=control;
  if(action.file===file){action.gate?.started();await action.gate?.wait;if(action.status){res.writeHead(action.status);res.end();return;}}
  try{const bytes=await fs.readFile(path.join(source,file));res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/manifest.json`;
const make=(actor,shaOverride)=>createRigidAccessoryLayer({vrm:actor.vrm,avatarSha256:shaOverride??actor.sha256,manifestUrl:url});
const accessories=actor=>actor.head.children.filter(node=>node.name.startsWith('RigidAccessory:')).flatMap(group=>group.children);
const trs=object=>JSON.stringify([object.position.toArray(),object.quaternion.toArray(),object.scale.toArray()]);
const boneSnapshot=actor=>JSON.stringify(actor.bones.map(bone=>[bone.uuid,trs(bone)]));
const geometryDigest=actor=>{
  const rows=[];
  for(const mesh of actor.originalMeshes){
    const g=mesh.geometry;
    const attributes=Object.entries(g.attributes).map(([name,a])=>[name,sha(Buffer.from((a.array??a.data.array).buffer))]);
    const morphs=Object.entries(g.morphAttributes).map(([name,values])=>[name,values.map(a=>sha(Buffer.from(a.array.buffer)))]);
    rows.push([mesh.uuid,g.uuid,attributes,morphs,g.index?sha(Buffer.from(g.index.array.buffer)):null]);
  }
  return sha(JSON.stringify(rows));
};
async function loadActor(bodyType){
  const file=path.join(root,`prototype/public/assets/foundation/base-${bodyType}-roundtrip.vrm`);
  const bytes=await fs.readFile(file),sha256=sha(bytes);
  const loader=new GLTFLoader();
  loader.register(parser=>({name:'CPUTexturePlaceholder',loadTexture:()=>Promise.resolve(new T.Texture())}));
  loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'http://localhost/');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
  const bones=[],originalMeshes=[];vrm.scene.traverse(node=>{if(node.isBone)bones.push(node);if(node.isMesh)originalMeshes.push(node);});
  const head=vrm.humanoid.getRawBoneNode('head');
  const actor={bodyType,vrm,head,bones,originalMeshes,sha256};
  bodyRecords.push({bodyType,sha256,bones:bones.length,meshes:originalMeshes.length,headName:head.name,headParent:head.parent?.name});
  return actor;
}
async function rejected(promise){try{await promise;return null;}catch(e){return e.message;}}
let fatal=null;
const originalWarn=console.warn;console.warn=(...args)=>warnings.push(args.join(' '));
try{
  const actors=[];
  for(const bodyType of ['male','female']){
    const a=await loadActor(bodyType);actors.push(a);
    const layer=make(a),boneBefore=boneSnapshot(a),geometryBefore=geometryDigest(a),beforeRequests=requests.length;
    await layer.setSelection('none');
    check(`${bodyType} empty and none issue no network`,requests.length===beforeRequests&&accessories(a).length===0);
    await layer.setSelection('pair');
    const pair=accessories(a),fitRef=manifest.fits.find(r=>r.baseAvatarSha256===a.sha256);
    const fit=JSON.parse(await fs.readFile(path.join(source,fitRef.file)));
    check(`${bodyType} mounts actual raw head`,pair.length===2&&pair.every(m=>m.parent.parent===a.head));
    check(`${bodyType} exact local TRS`,pair.every(m=>{const mount=fit.mounts.find(r=>r.instanceId===m.name);return trs(m)===JSON.stringify([mount.position,mount.quaternion,mount.scale]);}));
    check(`${bodyType} per-side mutable materials`,pair[0].material!==pair[1].material&&pair[0].material.color!==pair[1].material.color);
    pair[0].material.color.setRGB(.2,.3,.4);
    check(`${bodyType} color mutation isolated`,!pair[0].material.color.equals(pair[1].material.color));
    const oldLocal=pair.map(trs);a.head.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(.1,.2,.05)));a.vrm.scene.updateMatrixWorld(true);
    check(`${bodyType} attachment follows actual head without local rewrite`,pair.every((m,i)=>trs(m)===oldLocal[i]));
    // Return head exactly before comparing all original bone transforms.
    const oldHead=JSON.parse(boneBefore).find(row=>row[0]===a.head.uuid);const saved=JSON.parse(oldHead[1]);a.head.position.fromArray(saved[0]);a.head.quaternion.fromArray(saved[1]);a.head.scale.fromArray(saved[2]);
    await layer.setSelection('left');await layer.setSelection('right');await layer.setSelection('none');
    check(`${bodyType} source bones unchanged`,boneSnapshot(a)===boneBefore);
    check(`${bodyType} source geometry attributes and indices unchanged`,geometryDigest(a)===geometryBefore);
    layer.dispose();layer.dispose();check(`${bodyType} double dispose leaves no attachments`,accessories(a).length===0&&layer.getState().disposed);
  }
  const a=actors[0],b=actors[1];
  const first=make(a),second=make(b);await first.setSelection('pair');await second.setSelection('pair');
  const firstMesh=accessories(a)[0],secondMesh=accessories(b)[0];
  check('independent actors have separate material and geometry ownership',firstMesh.material!==secondMesh.material&&firstMesh.geometry!==secondMesh.geometry);
  let secondReleased=0;secondMesh.geometry.addEventListener('dispose',()=>secondReleased++);first.dispose();
  check('dispose first actor preserves second',secondReleased===0&&accessories(b).length===2);second.dispose();
  const empty=make(a,'0'.repeat(64));const reqBefore=requests.length;await empty.setSelection('none');
  check('unsupported body stays usable as empty layer',requests.length===reqBefore&&empty.getState().selection==='none');
  const unsupported=await rejected(empty.setSelection('pair'));check('unsupported body fails only requested accessory',unsupported?.includes('no exact fit')&&accessories(a).length===0,{error:unsupported});empty.dispose();
  for(const file of ['manifest.json','male-fit.json','stud.glb'])for(const action of ['none','dispose','newer-right','late503']){
    const layer=make(a),gate=deferred();control={file,gate,...(action==='late503'?{status:503}:{})};
    const old=layer.setSelection('pair');await gate.begun;
    let newer;
    if(action==='dispose')layer.dispose();else if(action==='newer-right')newer=layer.setSelection('right');else await layer.setSelection('none');
    gate.release();const result=await old;control={};
    check(`delayed ${file} ${action} cancels old request`,result.applied===false&&result.reason==='cancelled');
    if(newer){const next=await newer;check(`delayed ${file} installs only latest side`,next.applied===true&&accessories(a).length===1&&accessories(a)[0].userData.side==='right');}
    else check(`delayed ${file} no late installation`,accessories(a).length===0&&layer.getState().selection==='none');
    layer.dispose();
  }
  // Fail the second actual per-side material clone after the first clone was
  // prepared. The previous visible side must survive and partial work release.
  const partial=make(a);await partial.setSelection('right');const previous=accessories(a)[0];
  const materialPrototype=Object.getPrototypeOf(previous.material),originalClone=materialPrototype.clone;
  const partialClones=[];let cloneCalls=0,partialReleases=0;
  materialPrototype.clone=function(){if(++cloneCalls===2)throw Error('independent-second-clone-failure');const clone=originalClone.call(this);partialClones.push(clone);clone.addEventListener('dispose',()=>partialReleases++);return clone;};
  let partialError;
  try{partialError=await rejected(partial.setSelection('pair'));}finally{materialPrototype.clone=originalClone;}
  check('second clone failure preserves existing side',partialError==='independent-second-clone-failure'&&accessories(a).length===1&&accessories(a)[0]===previous&&partial.getState().selection==='right');
  check('second clone failure releases prior prepared clone once',partialClones.length===1&&partialReleases===1,{clones:partialClones.length,partialReleases});
  partial.dispose();
  // Actual parsed GLTF materials emit Three dispose events. One bounded reentry
  // detects duplicate release without relying on renderer internals or recursion.
  const cleanup=make(a);await cleanup.setSelection('pair');const pair=accessories(a);const counts=[0,0];let nested;
  pair.forEach((mesh,i)=>mesh.material.addEventListener('dispose',()=>counts[i]++));
  // Set the sentinel before the nested call to bound synchronous event recursion.
  let triggered=false;pair[0].material.addEventListener('dispose',()=>{if(!triggered){triggered=true;nested=cleanup.setSelection('none');}});
  await cleanup.setSelection('none');await nested;
  check('active material cleanup reentry releases each material exactly once',counts.every(n=>n===1),{counts});cleanup.dispose();
  // A genuine Object3D childadded event occurs during installation. Invalidating
  // the layer in that event must not leave a disposed instance attached.
  const commit=make(a);let disposedDuringAdd=false;
  const onAdd=event=>{if(event.child.name.startsWith('RigidAccessory:')){disposedDuringAdd=true;commit.dispose();}};
  a.head.addEventListener('childadded',onAdd);
  const committed=await commit.setSelection('pair');a.head.removeEventListener('childadded',onAdd);
  check('dispose during actual head childadded prevents late commit',disposedDuringAdd&&accessories(a).length===0&&commit.getState().disposed&&commit.getState().status==='disposed',
    {result:committed,state:commit.getState(),attached:accessories(a).length});
  // Ensure this intentionally failing probe cannot leave live scene children.
  for(const group of [...a.head.children])if(group.name.startsWith('RigidAccessory:'))group.removeFromParent();
}catch(error){fatal={message:error.message,stack:error.stack};}
finally{console.warn=originalWarn;await new Promise(resolve=>server.close(resolve));}
const finalSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
check('tested sources unchanged',JSON.stringify(sourceSha256)===JSON.stringify(finalSha256));
const result={schema:'independent-paired-ear-cpu-v1',time:new Date().toISOString(),node:process.version,sourceSha256,finalSha256,
  assets:manifest,bodyRecords,checks,failures,fatal,warnings,requests,limits:['Actual full source VRM parsed with Three187 and VRM3.5.5. Texture objects are CPU placeholders. Image decode/render/occlusion and visual fit are outside this review.','Actual published stud GLTF is parsed by the production layer without substitution. HTTP cancellation uses a real local server.','foundation-avatar/main integration reviewed statically at recorded hashes. Full actor/browser lifecycle is root responsibility.']};
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSha256,checks:checks.length,failures,fatal,bodyRecords},null,2));
