// Run from the project root. node PATH_TO_THIS_SCRIPT NEW_OUTPUT
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),destination=path.resolve(process.argv[2]);
await fs.mkdir(destination,{recursive:false});
const read=relative=>fs.readFile(path.join(root,relative));
const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const THREE=await load('prototype/node_modules/three/build/three.module.js');
const {GLTFLoader}=await load('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {createEquipment}=await load('prototype/src/equipment.js');
const batch=JSON.parse(await read('assets-source/m2-vest-layer-fit-v1/generated/manifest.json'));
const source=JSON.parse(await read('assets-source/m2-vest-layer-fit-v1/spec.json')).cases.find(c=>c.id==='female');
const row=batch.cases.find(c=>c.id==='female');
const original=JSON.parse(await read(source.equipmentManifest.path));
const fit=await read(row.files['fit.json'].path),fitData=JSON.parse(fit);
const entry=JSON.parse(await read(row.files['equipment-entry.json'].path));
entry.layerFitResource={schema:'vest-layer-fit-v1',url:'/assets/review-fit.json',sha256:sha(fit),bottom:{id:fitData.bottom.id,sha256:fitData.bottom.sha256,bytes:fitData.bottom.bytes}};
const extension=Buffer.from(JSON.stringify({schema:'zbgs-equipment-v1',items:[entry]}));
const oldParse=GLTFLoader.prototype.parseAsync,oldFetch=globalThis.fetch,oldWindow=globalThis.window;
const owned=new Map();let track=false,adapter,parsed;
GLTFLoader.prototype.parseAsync=async function(...args){
 this.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 const gltf=await oldParse.apply(this,args);
 if(track){
  const resources=new Set();
  gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
  for(const resource of resources){owned.set(resource,0);resource.addEventListener('dispose',()=>owned.set(resource,owned.get(resource)+1));}
 }
 return gltf;
};
const result={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),moduleSha256:sha(await read('prototype/src/equipment.js')),passed:false,scope:'Actual original female GLB bones, authored fitted top, Three Object3D childadded event and equipment loader. Only HTTP routing and CPU texture decode are fixtures. No browser/GPU.'};
try{
 const bytes=await read(source.body.path);assert.equal(sha(bytes),source.body.sha256);
 parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');parsed.scene.updateMatrixWorld(true);
 globalThis.window={location:{href:'http://fixture.invalid/'}};
 globalThis.fetch=async input=>{
  const url=new URL(input,window.location.href);
  if(url.pathname==='/assets/review-equipment.json')return new Response(JSON.stringify(original));
  if(url.pathname==='/assets/review-extension.json')return new Response(extension);
  if(url.pathname===entry.layerFitResource.url)return new Response(fit);
  assert.equal(url.pathname,entry.url);return new Response(await read(row.files['top.glb'].path));
 };
 adapter=await createEquipment({vrm:{scene:parsed.scene,humanoid:{getRawBoneNode:()=>null}},avatarSha256:source.body.sha256,manifestUrl:'/assets/review-equipment.json',additionalManifests:[{url:'/assets/review-extension.json',sha256:sha(extension)}]});
 const onChild=event=>{if(event.child.name.startsWith('Equipment:'))adapter.dispose();};
 parsed.scene.addEventListener('childadded',onChild);track=true;
 try{await assert.rejects(adapter.load(entry.id),/disposed while attaching/);}finally{parsed.scene.removeEventListener('childadded',onChild);}
 assert.equal(adapter.get(entry.id),null);
 assert(!parsed.scene.children.some(child=>child.name.startsWith('Equipment:')));
 assert(owned.size>0);assert([...owned.values()].every(count=>count===1));
 result.passed=true;result.checks=['load rejects synchronous disposal at parent.add','no cached or attached resource survives disposal','each imported geometry/material/texture disposed exactly once'];
}catch(error){result.error=String(error.stack||error);process.exitCode=1;}
finally{
 result.resourceDisposalCounts=[...owned].map(([resource,count])=>({type:resource.type??resource.constructor.name,count}));
 globalThis.fetch=oldFetch;globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=oldParse;
 await fs.writeFile(path.join(destination,'report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
