import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import designs from '../../assets-source/company-static-collection/designs.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}).catch(e=>this.onerror?.(e));}};
const root=new URL('../../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const sourcePath='assets-source/company-static-collection/designs.mjs',sourceHash=hash(await fs.readFile(new URL(sourcePath,root)));
const generatorHash=hash(await fs.readFile(new URL(import.meta.url)));
const catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root),'utf8'));
const refs=new Map(catalog.resources.map(r=>[r.id,r]));
refs.set('wall-art',{id:'wall-art-standard',version:1,category:'decor',mountRole:'wall-art',mount:'wall',mounting:{width:.8,height:.8,depth:.12,origin:'center'},coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Wall contact centre; back plane z=0; front +Z'},usePoints:[],stateDefaults:{}});
function make(d){const group=new THREE.Group();group.name=d.id;for(const p of d.parts){const mesh=new THREE.Mesh(new THREE[p.geometry](...p.args),new THREE.MeshStandardMaterial({color:p.color,roughness:p.roughness}));mesh.name=p.name;mesh.position.fromArray(p.position);mesh.rotation.fromArray(p.rotation);mesh.scale.fromArray(p.scale);group.add(mesh);}group.updateMatrixWorld(true);return group;}
function release(g){g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
async function encode(d){const g=make(d);try{return Buffer.from(await new GLTFExporter().parseAsync(g,{binary:true}));}finally{release(g);}}
const results=[],resources=[];
for(const design of designs){
 const reference=refs.get(design.branch);assert(reference,design.branch);
 const bytes=await encode(design);assert(bytes.equals(await encode(design)),'Non-deterministic export');
 const loaded=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;loaded.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(loaded);const fp=reference.footprint;
 if(fp?.blocking)for(const [i,a]of ['x','z'].entries()){assert(bounds.min[a]>=fp.center[i]-fp.halfSize[i]-.001,`${design.id} lower ${a}`);assert(bounds.max[a]<=fp.center[i]+fp.halfSize[i]+.001,`${design.id} upper ${a}`);}
 if(design.branch!=='wall-art')assert(Math.abs(bounds.min.y)<1e-6,`${design.id} must touch support plane`);
 if(reference.surface){for(const x of [-.9,0,.9])for(const z of [-.4,0,.4]){const hit=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(loaded,true)[0];assert(hit&&Math.abs(hit.point.y-reference.surface.topY)<1e-6,'Actual desk top must match declared surface');}}
 if(reference.mount==='desk-surface'){assert(bounds.min.x>=-.3&&bounds.max.x<=.3&&bounds.min.z>=-.18&&bounds.max.z<=.18,'Desk device support envelope');}
 let triangles=0;const geometryHash=createHash('sha256');loaded.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;geometryHash.update(Buffer.from(o.geometry.attributes.position.array.buffer));geometryHash.update(JSON.stringify(o.matrixWorld.toArray()));});assert(triangles<15000,'Technical sample budget');
 const dir=`prototype/public/company-assets/static-collection/${design.id}/v1`;await fs.mkdir(new URL(dir+'/',root),{recursive:true});
 const resource=structuredClone(reference);delete resource.node;delete resource.asset;delete resource.provenance;
 Object.assign(resource,{id:design.id,version:1,displayName:design.label,productionBranch:design.branch,designId:design.id,asset:{format:'glb',url:`/company-assets/static-collection/${design.id}/v1/model.glb`,sha256:hash(bytes),bytes:bytes.length},materialSlots:{finish:design.parts.map(p=>p.name)},provenance:{license:'Project-authored construction geometry and solid materials; no external assets.',sourceParameters:sourcePath,sourceParametersSha256:sourceHash,generator:'scripts/company-platform/build-static-collection.mjs',generatorSha256:generatorHash,tools:[`Three.js ${THREE.REVISION}`,'GLTFExporter','GLTFLoader'],classification:design.classification,reference:`${reference.id}@${reference.version}`}});
 assert(compareFacilityFunction(reference,resource).compatible);
 const prompt=`为公司场景制作 ${design.label}；designId=${design.id}。固定功能规格为 ${JSON.stringify(reference.node?Object.fromEntries(Object.entries(reference).filter(([k])=>!['node','provenance','materialSlots'].includes(k))):reference)}。使用独立构件及轮廓；保留原点、单位、承载和安装区域。以可编辑构造参数为源，导出GLB并核对实际几何，不用配色或改ID计数。`;
 await fs.writeFile(new URL(dir+'/model.glb',root),bytes);await fs.writeFile(new URL(dir+'/resource.json',root),JSON.stringify(resource,null,2)+'\n');
 const record={id:design.id,branch:design.branch,label:design.label,resourcePath:dir+'/resource.json',geometryHash:geometryHash.digest('hex'),sha256:hash(bytes),triangles,meshes:design.parts.length,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},repeatByteIdentical:true,functionCompatible:true,prompt};results.push(record);resources.push(record.resourcePath);release(loaded);
}
for(const branch of new Set(results.map(r=>r.branch))){const list=results.filter(r=>r.branch===branch);assert(list.length>=4);assert.equal(new Set(list.map(r=>r.geometryHash)).size,list.length,'Geometry duplicates do not count');}
const output='evidence/company-static-collection-v1/';await fs.mkdir(new URL(output,root),{recursive:true});
await fs.writeFile(new URL(output+'report.json',root),JSON.stringify({status:'source-export-readback-passed',results,limits:['No character usage verified','Browser replacement and restore tested by integrated coverage QA separately']},null,2)+'\n');
await fs.writeFile(new URL('assets-source/company-static-collection/collection.json',root),JSON.stringify({resources},null,2)+'\n');
console.log(JSON.stringify({resources:resources.length,branches:[...new Set(results.map(r=>r.branch))],status:'passed'}));
