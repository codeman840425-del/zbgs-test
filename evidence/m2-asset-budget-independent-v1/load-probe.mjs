import fs from 'node:fs/promises';
import {GLTFLoader} from 'file:///F:/gamemake/prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const file='F:/gamemake/evidence/m2-asset-budget-independent-v1/optional-instancing-10000.glb';
const bytes=await fs.readFile(file);
const result=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const meshes=[];
result.scene.traverse(node=>{
 if(node.isMesh)meshes.push({isInstancedMesh:node.isInstancedMesh===true,count:node.count??1,
  trianglesPerInstance:(node.geometry.index?.count??node.geometry.attributes.position.count)/3});
});
const report={scope:'Installed Three GLTFLoader CPU parse only. No renderer, browser or GPU.',
 meshes,effectiveTriangles:meshes.reduce((sum,item)=>sum+item.count*item.trianglesPerInstance,0)};
await fs.writeFile('F:/gamemake/evidence/m2-asset-budget-independent-v1/actual-loader-instancing.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
result.scene.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const material of [node.material].flat())material.dispose();}});
