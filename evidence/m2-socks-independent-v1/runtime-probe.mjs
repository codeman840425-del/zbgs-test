import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createEquipment} from '../../prototype/src/equipment.js';
import {resolveEquipmentSet} from '../../prototype/src/equipment-set.js';

const root=path.resolve('F:/gamemake'),out=path.join(root,'evidence/m2-socks-independent-v1',process.argv[2]??'');await fs.mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const names=['prototype/src/equipment.js','prototype/src/equipment-set.js','scripts/m2-socks-layer-v1/build.py','assets-source/m2-socks-layer-v1/spec.json'];
const hashes=Object.fromEntries(await Promise.all(names.map(async n=>[n,sha(await fs.readFile(path.join(root,n)))])));
const spec=JSON.parse(await fs.readFile(path.join(root,names[3])));
const catalogs={},entries={},requests=[],checks=[],failures=[],observations=[];
const check=(name,ok,details={})=>{const row={name,ok,...details};checks.push(row);if(!ok)failures.push(row);};
for(const body of ['female','male']){
  const dir=body==='female'?'m1':'m1b';
  const original=JSON.parse(await fs.readFile(path.join(root,`prototype/public/assets/${dir}/equipment.json`)));
  const entry=JSON.parse(await fs.readFile(path.join(root,`assets-source/m2-socks-layer-v1/generated/${body}-entry.json`)));
  entry.url=`/__sock/${body}/${entry.url}`;entries[body]=entry;
  const items=original.items.filter(row=>row.id!==entry.id).map(row=>({...row,url:row.url.startsWith('/')?row.url:`/assets/${dir}/${row.url}`}));
  catalogs[body]={schema:'zbgs-equipment-v1',items:[...items,entry]};
}
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;requests.push(pathname);
  try{
    if(/^\/catalog\/[^/]+.json$/.test(pathname)){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(catalogs[pathname.split('/').pop().split('.')[0]]));return;}
    const file=pathname.startsWith('/__sock/')?path.join(root,'assets-source/m2-socks-layer-v1/generated',path.basename(pathname)):path.join(root,'prototype/public',pathname);
    const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
globalThis.window={location:{href:origin+'/'}};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=new DataView(await blob.arrayBuffer());return{width:b.getUint32(16),height:b.getUint32(20),close(){}};};
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
const oldWarn=console.warn,warnings=[];console.warn=(...a)=>warnings.push(a.join(' '));
const geometryHash=meshes=>sha(JSON.stringify(meshes.map(m=>[m.uuid,m.geometry.uuid,
  Object.entries(m.geometry.attributes).map(([n,a])=>[n,sha(Buffer.from((a.array??a.data.array).buffer))]),
  Object.entries(m.geometry.morphAttributes).map(([n,values])=>[n,values.map(a=>sha(Buffer.from(a.array.buffer)))]),
  m.geometry.index?sha(Buffer.from(m.geometry.index.array.buffer)):null])));
const transforms=bones=>JSON.stringify(bones.map(b=>[b.uuid,b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]));
const posed=meshes=>meshes.map(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)).toArray()));
const movement=(before,after)=>{
  let max=0,moved=0;for(let m=0;m<before.length;m++)for(let i=0;i<before[m].length;i++){const distance=Math.hypot(...before[m][i].map((n,k)=>n-after[m][i][k]));if(distance>1e-6)moved++;max=Math.max(max,distance);}return{maxM:max,movedVertices:moved};
};
let fatal=null;
try{
 for(const body of ['female','male']){
  const raw=await fs.readFile(path.join(root,spec.bodies[body].path));const loader=new GLTFLoader();
  loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));loader.register(p=>new VRMLoaderPlugin(p));
  const gltf=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),origin+'/assets/foundation/');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
  const originalMeshes=[],originalBones=[];vrm.scene.traverse(n=>{if(n.isMesh)originalMeshes.push(n);if(n.isBone)originalBones.push(n);});
  const originalGeometry=geometryHash(originalMeshes),originalTransforms=transforms(originalBones),originalTextures=originalMeshes.map(m=>(Array.isArray(m.material)?m.material:[m.material]).map(t=>[t,t.map,t.shadeMultiplyTexture]));
  const entry=entries[body];check(body+' exact avatar identity',sha(raw)===entry.compatibleAvatarSha256);
  const adapter=await createEquipment({vrm,avatarSha256:sha(raw),manifestUrl:origin+`/catalog/${body}.json`});
  const item=await adapter.load(entry.id);vrm.scene.updateMatrixWorld(true);
  check(body+' loader retains hidden until selection',item.container.visible===false);
  check(body+' actual six bone mapping uses original raw skeleton',item.meshes.length===2&&item.meshes.every(m=>m.skeleton.bones.length===6&&m.skeleton.bones.every((b,i)=>b===vrm.scene.getObjectByName(entry.bindings[i].targetRawBone)))&&item.container.children.every(n=>!n.isBone));
  check(body+' all six actual inverse matrices equal pinned entry and source',item.meshes.every(m=>m.skeleton.boneInverses.every((matrix,i)=>matrix.elements.every((n,j)=>Math.abs(n-entry.bindings[i].inverseBindMatrix[j])<1e-7))));
  check(body+' authored mesh rest/bind transforms match declared identity',entry.restMatrix.every((n,i)=>n===(i%5===0?1:0))&&item.meshes.every(m=>m.matrix.elements.every((n,i)=>Math.abs(n-entry.restMatrix[i])<1e-7)&&m.bindMatrix.elements.every((n,i)=>Math.abs(n-entry.restMatrix[i])<1e-7)));
  let finite=true,maxWeightError=0,multi=0;const jointUsage=Array(6).fill(0),ibmHashes=[];
  for(const mesh of item.meshes){const p=mesh.geometry.attributes.position,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
   ibmHashes.push(sha(Buffer.from(new Float32Array(mesh.skeleton.boneInverses.flatMap(m=>m.elements)).buffer)));
   for(let i=0;i<p.count;i++){let sum=0,influences=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);finite&&=Number.isFinite(weight)&&weight>=0&&Number.isInteger(joint)&&joint>=0&&joint<6;sum+=weight;if(weight>1e-6){jointUsage[joint]++;influences++;}}maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));if(influences>1)multi++;}
  }
  check(body+' valid normalized JOINTS/WEIGHTS use every joint',finite&&maxWeightError<1e-5&&jointUsage.every(n=>n>0)&&multi>0,{jointUsage,maxWeightError,multi});
  const rest=posed(item.meshes);let restMax=0;
  item.meshes.forEach((m,k)=>rest[k].forEach((p,i)=>{const raw=new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,i);restMax=Math.max(restMax,Math.hypot(raw.x-p[0],raw.y-p[1],raw.z-p[2]));}));
  check(body+' real runtime rest skin matches authored vertices',restMax<1e-6,{maxLocalDeviationM:restMax});
  const poses=[];
  for(const [semantic,axis,angle] of [['leftFoot','x',.35],['leftToes','x',-.4],['rightFoot','z',-.18],['rightToes','x',.3]]){
   const bone=vrm.humanoid.getRawBoneNode(semantic),before=bone.quaternion.clone();bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),angle));vrm.scene.updateMatrixWorld(true);
   const changed=posed(item.meshes),motion=movement(rest,changed);check(body+' posed '+semantic+' finite and deforming',changed.flat(2).every(Number.isFinite)&&motion.movedVertices>0&&motion.maxM>1e-4,motion);poses.push({semantic,...motion});
   bone.quaternion.copy(before);vrm.scene.updateMatrixWorld(true);
  }
  check(body+' loading and pose restore preserve all original geometry and bones',geometryHash(originalMeshes)===originalGeometry&&transforms(originalBones)===originalTransforms);
  check(body+' loading preserves exact original texture bindings',originalTextures.flat().every(([m,map,shade])=>m.map===map&&m.shadeMultiplyTexture===shade));
  const variantBytes=await fs.readFile(path.join(root,`assets-source/m2-socks-layer-v1/generated/parameter-variant/${body}-plain-crew-socks-v1.glb`));
  const variant=await new GLTFLoader().parseAsync(variantBytes.buffer.slice(variantBytes.byteOffset,variantBytes.byteOffset+variantBytes.byteLength),origin+'/');
  let variantMax=-Infinity,baseMax=-Infinity;variant.scene.traverse(n=>{if(n.isMesh){const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)variantMax=Math.max(variantMax,p.getY(i));}});
  item.meshes.forEach(n=>{const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)baseMax=Math.max(baseMax,p.getY(i));});
  check(body+' actual parameter variant cuff moves ten millimetres',sha(variantBytes)!==entry.sha256&&Math.abs(variantMax-baseMax-.01)<1e-5,{actualCuffDifferenceM:variantMax-baseMax});
  const footwear=spec.bodies[body].shoesId,lower=spec.bodies[body].bottomIds[0];let selection;
  try{selection=resolveEquipmentSet(catalogs[body].items,[entry.id,footwear,lower],entry.compatibleAvatarSha256);}
  catch(error){selection={error:error.message};}
  if(process.argv[2]){
   check(body+' resolver admits actual exact shoes and lower pairing',Array.isArray(selection)&&selection.length===3);
   const valid=await adapter.equipSet([entry.id,footwear,lower]);
   check(body+' actual equipSet loads and displays paired shoes/lower/socks',valid.applied===true&&[entry.id,footwear,lower].every(id=>adapter.get(id)?.container.visible));
   const visible=()=>[entry.id,footwear,lower].filter(id=>adapter.get(id)?.container.visible).join(',');
   const beforeVisible=visible(),beforeRequests=requests.length;let missingShoes;
   try{await adapter.equipSet([entry.id,lower]);}catch(error){missingShoes=error.message;}
   check(body+' missing shoes rejects before network and preserves visible set',missingShoes?.includes('require paired shoes')&&visible()===beforeVisible&&requests.length===beforeRequests,{error:missingShoes});
   const changedShoe=catalogs[body].items.map(row=>row.id===footwear?{...row,sha256:'0'.repeat(64)}:row);let wrongShoe;
   try{resolveEquipmentSet(changedShoe,[entry.id,footwear,lower],entry.compatibleAvatarSha256);}catch(error){wrongShoe=error.message;}
   check(body+' same shoe ID with different exact bytes rejected',wrongShoe?.includes('Unvalidated socks pairing'),{error:wrongShoe});
   const unlisted=catalogs[body].items.find(row=>['bottom','onePiece'].includes(row.slot)&&!entry.pairedWith.lower.some(p=>p.id===row.id));let wrongLower;
   const beforeLowerRequests=requests.length;
   try{await adapter.equipSet([entry.id,footwear,unlisted.id]);}catch(error){wrongLower=error.message;}
   check(body+' undeclared lower rejects before load and preserves visible set',wrongLower?.includes('Unvalidated socks pairing')&&requests.length===beforeLowerRequests&&visible()===beforeVisible,{error:wrongLower,unlistedLower:unlisted.id});
   const originalSock=item.meshes[0].geometry;
   adapter.unequip('socks');check(body+' unequip socks preserves shoes and lower',!item.container.visible&&adapter.get(footwear).container.visible&&adapter.get(lower).container.visible);
   await adapter.equipSet([entry.id,footwear,lower]);check(body+' restore reuses exact loaded sock geometry and raw bones',item.container.visible&&item.meshes[0].geometry===originalSock&&item.meshes[0].skeleton.bones.every((b,i)=>b===vrm.scene.getObjectByName(entry.bindings[i].targetRawBone)));
   const wrongAvatar=await createEquipment({vrm,avatarSha256:'0'.repeat(64),manifestUrl:origin+`/catalog/${body}.json`});
   const beforeWrongBodyRequests=requests.length;let wrongBody;
   try{await wrongAvatar.load(entry.id);}catch(error){wrongBody=error.message;}
   check(body+' wrong avatar identity rejects before garment network',wrongBody?.includes('not approved')&&requests.length===beforeWrongBodyRequests,{error:wrongBody});wrongAvatar.dispose();
   const badCatalog=structuredClone(catalogs[body]);badCatalog.items.find(row=>row.id===entry.id).bindings[0].inverseBindMatrix[12]+=.01;catalogs[body+'-badbind']=badCatalog;
   const wrongBind=await createEquipment({vrm,avatarSha256:sha(raw),manifestUrl:origin+`/catalog/${body}-badbind.json`});
   const beforeWrongBindRequests=requests.length;let bindError;
   try{await wrongBind.load(entry.id);}catch(error){bindError=error.message;}
   check(body+' wrong rest IBM rejects before garment network',bindError?.includes('Rest bind differs')&&requests.length===beforeWrongBindRequests,{error:bindError});wrongBind.dispose();
   check(body+' composition and rejection leave source geometry/bone transforms intact',geometryHash(originalMeshes)===originalGeometry&&transforms(originalBones)===originalTransforms);
  }
  observations.push({body,assetSha256:entry.sha256,entrySha256:sha(await fs.readFile(path.join(root,`assets-source/m2-socks-layer-v1/generated/${body}-entry.json`))),stats:item.stats,jointUsage,ibmHashes,poses,selection});
  adapter.dispose();check(body+' dispose removes only loaded equipment',item.container.parent===null&&geometryHash(originalMeshes)===originalGeometry);
 }
}catch(error){fatal={message:error.message,stack:error.stack};}
finally{console.warn=oldWarn;await new Promise(r=>server.close(r));}
const finalHashes=Object.fromEntries(await Promise.all(names.map(async n=>[n,sha(await fs.readFile(path.join(root,n)))])));
check('tested source hashes unchanged during probe',JSON.stringify(hashes)===JSON.stringify(finalHashes),{hashes,finalHashes});
const report={schema:'independent-socks-runtime-cpu-v1',hashes,finalHashes,checks,failures,fatal,observations,requests,warnings,
 limits:['Actual original VRM and generated GLB parsed by Three187/VRM3.5.5. VRM textures and garment ImageBitmap decoding use CPU placeholders only.','No browser/GPU or visual/contact acceptance. Rest shoe crossings female402/male316 and male long-pants8 from author diagnostics remain known limits. Female original Body painted long socks above cuff remain unchanged.','Loading uses real equipment.js with an in-memory composed test manifest, not the root published game profile. Selection composition is recorded separately if socks slot patch is pending.']};
await fs.writeFile(path.join(out,'runtime-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({hashes,checks:checks.length,failures,fatal,observations:observations.map(o=>({body:o.body,stats:o.stats,poses:o.poses,selection:o.selection.error??'supported'}))},null,2));
