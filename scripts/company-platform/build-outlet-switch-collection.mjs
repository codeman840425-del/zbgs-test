import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {designs} from '../../assets-source/company-outlet-switch-v1/designs.mjs';

globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}).catch(error=>this.onerror?.(error));}};
const root=new URL('../../',import.meta.url), hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceDesign='assets-source/company-outlet-switch-v1/designs.mjs';
const sourceParameters='assets-source/company-outlet-switch-v1/parameters.json';
const contractSource='assets-source/company-environment-specs-v1/branches.json';
const sourceParametersSha256=hash(await fs.readFile(new URL(sourceParameters,root)));
const contractSourceSha256=hash(await fs.readFile(new URL(contractSource,root)));
const generatorSha256=hash(await fs.readFile(new URL('scripts/company-platform/build-outlet-switch-collection.mjs',root)));
const makeMaterial=part=>new THREE.MeshStandardMaterial({color:part.color,roughness:part.roughness,metalness:0});
function build(design){
  const group=new THREE.Group();group.name=design.id;
  for(const part of design.parts){
    const Geometry=THREE[part.geometry];assert(Geometry,part.geometry);
    const mesh=new THREE.Mesh(new Geometry(...part.parameters),makeMaterial(part));
    mesh.name=part.id;mesh.position.fromArray(part.position);mesh.rotation.fromArray(part.rotation);group.add(mesh);
  }
  group.updateMatrixWorld(true);return group;
}
function dispose(rootObject){rootObject.traverse(node=>{node.geometry?.dispose();for(const material of [node.material].flat())material?.dispose();});}
async function encode(design){const object=build(design);try{return Buffer.from(await new GLTFExporter().parseAsync(object,{binary:true}));}finally{dispose(object);}}
const results=[],resources=[];
for(const design of designs){
  const bytes=await encode(design);assert(bytes.equals(await encode(design)),`${design.id} export is not deterministic`);
  const loaded=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;loaded.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(loaded);
  assert(bounds.min.x>=-.061&&bounds.max.x<=.061,`${design.id} width outside wall plate`);
  assert(bounds.min.y>=-.101&&bounds.max.y<=.101,`${design.id} height outside wall plate`);
  assert(bounds.min.z>=-.001&&bounds.max.z<=.042,`${design.id} depth outside wall plate`);
  const meshes=[];let triangles=0;const geometryHash=createHash('sha256');
  loaded.traverse(node=>{if(!node.isMesh)return;meshes.push(node.name);triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;geometryHash.update(Buffer.from(node.geometry.attributes.position.array.buffer));});
  assert(meshes.includes('status-led'),`${design.id} needs a real status mesh`);assert(triangles<3000,`${design.id} exceeds sample budget`);
  const id=`outlet-switch-${design.id}`;
  const resource={
    id,version:1,category:'dynamic',mountRole:'outlet-switch',mount:'wall',productionBranch:'outlet-switch',designId:design.id,displayName:design.label,
    mounting:{origin:'center',width:.12,height:.2,depth:.04},
    coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Wall contact centre; back plane z=0; front +Z',scale:'Identity only'},
    footprint:null,usePoints:[],stateDefaults:{on:false},stateSchema:{on:{type:'boolean'}},stateSemantics:{on:'outlet-switch-status'},
    display:{status:{stateField:'on',nodes:meshes.filter(name=>name.startsWith('status-led')),onColor:'#8de2b3',offColor:'#31413c',emissive:'#62e6ae',onIntensity:1.2}},
    materialSlots:{construction:meshes.filter(name=>!name.startsWith('status-led')),status:meshes.filter(name=>name.startsWith('status-led'))},
    provenance:{license:'Project-authored construction geometry and solid materials. No external assets.',sourceParameters,sourceParametersSha256,sourceDesign:design.id,generator:'scripts/company-platform/build-outlet-switch-collection.mjs',generatorSha256,tools:['Three.js 187','GLTFExporter','GLTFLoader'],functionalContractSource:contractSource,functionalContractBranch:'outlet-switch',functionalContractSourceSha256:contractSourceSha256,method:design.method},
    asset:{format:'glb',url:`/company-assets/outlet-switch-v1/${design.id}/v1/model.glb`,sha256:hash(bytes),bytes:bytes.length}
  };
  const directory=`prototype/public/company-assets/outlet-switch-v1/${design.id}/v1`;
  await fs.mkdir(new URL(directory+'/',root),{recursive:true});
  await fs.writeFile(new URL(directory+'/model.glb',root),bytes);await fs.writeFile(new URL(directory+'/resource.json',root),JSON.stringify(resource,null,2)+'\n');
  results.push({id,designId:design.id,label:design.label,sha256:hash(bytes),bytes:bytes.length,triangles,meshes,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},geometryHash:geometryHash.digest('hex'),repeatByteIdentical:true});resources.push(`/${directory}/resource.json`);
  dispose(loaded);
}
assert.equal(results.length,4);assert.equal(new Set(results.map(row=>row.geometryHash)).size,4);
const output='evidence/company-outlet-switch-v1';await fs.mkdir(new URL(output+'/',root),{recursive:true});
await fs.writeFile(new URL(output+'/report.json',root),JSON.stringify({status:'source-export-readback-passed',branch:'outlet-switch',results,limits:['No electrical simulation','No character C3 usage','State is visual status only']},null,2)+'\n');
await fs.writeFile(new URL('assets-source/company-outlet-switch-v1/collection.json',root),JSON.stringify({schema:'company-outlet-switch-v1',resources},null,2)+'\n');
console.log(JSON.stringify({status:'passed',resources:resources.length,results},null,2));
