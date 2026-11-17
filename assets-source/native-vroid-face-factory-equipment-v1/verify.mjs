// CPU only. Original image bytes are independently verified; texture decode is a 1px fixture.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,MToonMaterialLoaderPlugin} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {verifyEquipmentBindings} from '../../scripts/verify-catalog-bindings.mjs';

const base=new URL('../../',import.meta.url),pkg=new URL('./',import.meta.url),out=new URL('evidence/native-vroid-face-factory-equipment-v1/',base);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(new URL(p,base));
const sourceBytes=await read('assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm');
assert.equal(sha(sourceBytes),'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce');
const manifest=JSON.parse(await fs.readFile(new URL('equipment.json',pkg))),extraction=JSON.parse(await fs.readFile(new URL('extraction.json',pkg)));
function unpack(b){const n=b.readUInt32LE(12);return {j:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const original=unpack(sourceBytes);
const fixture=()=>({name:'CPUTextureDecodeOnly',loadTexture:async()=>new T.DataTexture(new Uint8Array([255,255,255,255]),1,1)});
async function load(bytes,mode){const loader=new GLTFLoader();loader.register(fixture);if(mode==='vrm')loader.register(p=>new VRMLoaderPlugin(p));if(mode==='mtoon')loader.register(p=>new MToonMaterialLoaderPlugin(p));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const source=await load(sourceBytes,'vrm'),vrm=source.userData.vrm;assert.equal(vrm.meta.metaVersion,'1');
source.scene.updateMatrixWorld(true);
const allMeshes=g=>{const a=[];g.scene.traverse(n=>{if(n.isSkinnedMesh)a.push(n);});return a;};
const bones=new Map();source.scene.traverse(n=>{if(n.isBone){assert(!bones.has(n.name));bones.set(n.name,n);}});
const pairs=[],byteChecks=[],loaderChecks=[];
const weightChecks=[];
function viewBytes(g,id){const v=g.j.bufferViews[id];return g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);}
function restoreTextureIndices(v,inverse){if(Array.isArray(v))v.forEach(x=>restoreTextureIndices(x,inverse));else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(k.toLowerCase().includes('texture')&&x&&typeof x==='object'&&'index'in x)x.index=inverse[x.index];else restoreTextureIndices(x,inverse);}}
for(const row of extraction.records){
 const entry=manifest.items.find(x=>x.id===row.id),bytes=await fs.readFile(new URL(entry.url,pkg)),g=unpack(bytes);
 assert.equal(sha(bytes),entry.sha256);assert.equal(bytes.length,entry.bytes);
 const bound=verifyEquipmentBindings(bytes,sourceBytes,entry);
 for(const [old,next]of Object.entries(row.maps.bufferViews))assert.deepEqual(viewBytes(g,next),viewBytes(original,+old));
 for(const [old,next]of Object.entries(row.maps.accessors)){const a=structuredClone(g.j.accessors[next]);a.bufferView=+Object.keys(row.maps.bufferViews).find(k=>row.maps.bufferViews[k]===a.bufferView);assert.deepEqual(a,original.j.accessors[old]);}
 const mat=structuredClone(g.j.materials[0]);restoreTextureIndices(mat,Object.fromEntries(Object.entries(row.maps.textures).map(([a,b])=>[b,+a])));assert.deepEqual(mat,original.j.materials[row.sourceMaterial]);
 for(const [old,next]of Object.entries(row.maps.textures)){const t=structuredClone(g.j.textures[next]);t.source=+Object.keys(row.maps.images).find(k=>row.maps.images[k]===t.source);assert.deepEqual(t,original.j.textures[old]);}
 assert.deepEqual(g.j.samplers,original.j.samplers);
 g.j.nodes.forEach((node,i)=>{const a=structuredClone(node),b=structuredClone(original.j.nodes[i]);for(const x of[a,b]){delete x.mesh;delete x.skin;}assert.deepEqual(a,b);});
 const imageChecks=Object.entries(row.maps.images).map(([old,next])=>{const a=g.j.images[next],b=original.j.images[old];const ca=structuredClone(a),cb=structuredClone(b);delete ca.bufferView;delete cb.bufferView;assert.deepEqual(ca,cb);return {sourceImage:+old,sha256:sha(viewBytes(g,a.bufferView)),bytes:viewBytes(g,a.bufferView).length};});
 byteChecks.push({id:entry.id,accessorsExact:Object.keys(row.maps.accessors).length,bufferViewsExact:Object.keys(row.maps.bufferViews).length,materialGraphExact:true,nodeTransformsHierarchyExact:160,images:imageChecks,...bound});
 const plain=await load(bytes,'plain'),official=await load(bytes,'mtoon');
 const mats=m=>Array.isArray(m.material)?m.material:[m.material];
 const describe=g=>allMeshes(g).flatMap(m=>mats(m).map(material=>({mesh:m.name,type:material.type,isMToonMaterial:material.isMToonMaterial===true,isOutline:material.isOutline===true})));
 const plainDesc=describe(plain),officialDesc=describe(official);
 assert(plainDesc.every(x=>!x.isMToonMaterial));assert(officialDesc.every(x=>x.isMToonMaterial));
 const embedded=allMeshes(source).filter(m=>mats(m).some(material=>material.name.replace(/ \(Outline\)$/,'')===row.materialName));
 assert.equal(embedded.length,allMeshes(official).length);
 loaderChecks.push({id:entry.id,originalPlainEquipmentLoader:plainDesc,officialPlugin:officialDesc,embedded:embedded.flatMap(m=>mats(m).map(material=>({name:m.name,isMToonMaterial:material.isMToonMaterial===true,isOutline:material.isOutline===true}))),outlineImplementation:'same mesh/index with two geometry groups and surface/outline material array'});
 const container=new T.Group();container.name='CPU Equipment:'+entry.id;
 official.scene.updateMatrixWorld(true);
 for(const mesh of allMeshes(official)){
  const counterpart=embedded[0];assert.equal(embedded.length,1);assert(counterpart);
  assert.deepEqual(mesh.geometry.groups,counterpart.geometry.groups);
  const authoredTransform=mesh.matrixWorld.clone(),authoredBind=mesh.bindMatrix.clone();
  const targetBones=mesh.skeleton.bones.map(b=>{const n=bones.get(b.name);assert(n);return n;});
  const skeleton=new T.Skeleton(targetBones,mesh.skeleton.boneInverses.map(m=>m.clone()));
  container.add(mesh);authoredTransform.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.bind(skeleton,authoredBind);
  for(const name of ['position','normal','uv','skinIndex'])assert.deepEqual(mesh.geometry.getAttribute(name).array,counterpart.geometry.getAttribute(name).array);
  const wa=original.j.accessors[row.sourceAttributes.WEIGHTS_0],wv=original.j.bufferViews[wa.bufferView];
  assert(!wv.byteStride && wa.componentType===5126 && wa.type==='VEC4');
  const rawW=Float32Array.from({length:wa.count*4},(_,i)=>original.bin.readFloatLE((wv.byteOffset||0)+(wa.byteOffset||0)+i*4));
  function normalized(times){const geometry=new T.BufferGeometry();geometry.setAttribute('skinWeight',new T.BufferAttribute(rawW.slice(),4));const probe=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());for(let n=0;n<times;n++)probe.normalizeSkinWeights();return geometry.getAttribute('skinWeight').array;}
  const once=normalized(1),five=normalized(original.j.meshes[row.sourceMesh].primitives.length);
  const own=mesh.geometry.getAttribute('skinWeight').array,src=counterpart.geometry.getAttribute('skinWeight').array;
  assert.deepEqual(own,once);assert.deepEqual(src,five);
  let changed=0,maxDifference=0;for(let i=0;i<own.length;i++){if(own[i]!==src[i])changed++;maxDifference=Math.max(maxDifference,Math.abs(own[i]-src[i]));}
  weightChecks.push({id:entry.id,sourceFileWeightsByteExact:true,sourcePrimitiveConsumers:5,standalonePrimitiveConsumers:1,onceMatchesStandaloneExact:true,fiveMatchesSourceExact:true,changedComponents:changed,maxWeightDifference:maxDifference});
  assert.deepEqual(mesh.geometry.index.array,counterpart.geometry.index.array);
  assert.deepEqual(mesh.bindMatrix.toArray(),counterpart.bindMatrix.toArray());
  const ids=[...new Set(mesh.geometry.index.array)].sort((a,b)=>a-b);
  pairs.push({id:entry.id,outline:false,source:counterpart,equipment:mesh,ids});
 }
 source.scene.add(container);
}
// Exact existing raw-pose fixture from qa-skirt-equivalence.mjs, no skirt update/collider/dance.
const poseSource='scripts/m1-assets/qa-skirt-equivalence.mjs',poseText=await read(poseSource);
const nodes=Object.fromEntries(Object.keys(original.j.extensions.VRMC_vrm.humanoid.humanBones).map(s=>[s,vrm.humanoid.getRawBoneNode(s)]));
const rest=new Map(Object.entries(nodes).map(([s,n])=>[s,{p:n.position.clone(),q:n.quaternion.clone()}]));
const cases=[{id:'rest'},{id:'walk-fixture-step-10',kind:'walk',step:10},{id:'sit-rise-fixture-step-60',kind:'sit-rise',step:60}];
const arrays=[],arrayLayout=[],results=[],restPositions=new Map();let doubleOffset=0;
for(const c of cases){
 for(const [s,n]of Object.entries(nodes)){n.position.copy(rest.get(s).p);n.quaternion.copy(rest.get(s).q);}
 if(c.kind){const time=c.step/119,phase=time*Math.PI*6,sit=c.kind==='walk'?0:Math.sin(time*Math.PI)**2;
  nodes.hips.position.add(new T.Vector3(0,-.37*sit,0));
  nodes.hips.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(-.25*sit,0,0)));
  nodes.leftUpperLeg.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(1.45*sit+.55*Math.sin(phase)*(1-sit),0,.04)));
  nodes.rightUpperLeg.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(1.45*sit-.55*Math.sin(phase)*(1-sit),0,-.04)));
 }
 source.scene.updateMatrixWorld(true);
 const rows=[];
 for(const pair of pairs){
  pair.source.skeleton.update();pair.equipment.skeleton.update();
  const coords=new Float64Array(pair.ids.length*6),a=new T.Vector3(),b=new T.Vector3();let max=0,worst=null,movement=0;
  for(let k=0;k<pair.ids.length;k++){const i=pair.ids[k];pair.source.getVertexPosition(i,a).applyMatrix4(pair.source.matrixWorld);pair.equipment.getVertexPosition(i,b).applyMatrix4(pair.equipment.matrixWorld);assert([...a,...b].every(Number.isFinite));const d=a.distanceTo(b);if(d>max){max=d;worst=i;}coords.set(a.toArray(),k*6);coords.set(b.toArray(),k*6+3);const old=restPositions.get(pair);if(old)movement=Math.max(movement,a.distanceTo(new T.Vector3(...old.subarray(k*6,k*6+3))));}
  if(c.id==='rest')restPositions.set(pair,coords.slice());
  rows.push({id:pair.id,isOutline:pair.outline,referencedVertices:pair.ids.length,maxPositionErrorM:max,worstSourceVertex:worst,maxDisplacementFromRestM:movement,initialToleranceM:1e-9,passesInitialTolerance:max<=1e-9,exact:max===0});
  arrayLayout.push({case:c.id,id:pair.id,isOutline:pair.outline,offsetFloat64:doubleOffset,count:coords.length,sourceVertexIds:pair.ids,columns:['sourceX','sourceY','sourceZ','equipmentX','equipmentY','equipmentZ']});doubleOffset+=coords.length;arrays.push(Buffer.from(coords.buffer));
 }
 results.push({case:c,rows,rawSemanticPose:Object.fromEntries(Object.entries(nodes).map(([s,n])=>[s,{position:n.position.toArray(),quaternion:n.quaternion.toArray()}]))});
}
assert(results.slice(1).every(c=>c.rows.some(r=>r.maxDisplacementFromRestM>.01)));
const numericalPass=results.every(c=>c.rows.every(r=>r.passesInitialTolerance));
const evidence={schema:'native-vroid-equipment-cpu-v1',status:numericalPass?'exact-extraction-cpu-within-initial-tolerance-runtime-pending':'exact-extraction-runtime-weight-normalization-drift-failed-initial-tolerance',sourceSha256:sha(sourceBytes),manifestSha256:sha(await fs.readFile(new URL('equipment.json',pkg))),threeRevision:T.REVISION,byteChecks,loaderChecks,weightChecks,poseSource,poseSourceSha256:sha(poseText),results,limits:['Texture decode replaced by 1px fixture; original compressed images byte-exact checked separately','Outline shares same base vertices via material array/groups; shader outline displacement not evaluated','Original plain equipment loader lacks MToon; root new integration is separate evidence','Two existing raw-bone fixture poses only; no normalized retarget, full animation, collision, fit or visual admission','No VRM0 rotation; VRM1 source coordinate and bind conventions retained']};
await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('skin-coordinates.f64',out),Buffer.concat(arrays),{flag:'wx'});
await fs.writeFile(new URL('skin-coordinates-layout.json',out),JSON.stringify({schema:'native-equipment-coordinate-readback-v1',endianness:'little',arrayLayout},null,2)+'\n',{flag:'wx'});
await fs.writeFile(new URL('result.json',out),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:evidence.status,weightChecks,results:results.map(x=>({case:x.case,rows:x.rows}))}));
