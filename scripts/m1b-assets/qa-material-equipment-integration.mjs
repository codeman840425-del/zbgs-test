// Actual male/shorts GLB bind/load path with in-memory texture-decode fixture.
// Does not render, start a browser, or modify the production loader.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const base=new URL('../../',import.meta.url),candidate=new URL('assets-source/m1b/shorts/material-recipe-candidate-v1/',base);
const loadText=p=>readFile(new URL(p,candidate),'utf8');
const bodyBytes=await readFile(new URL('prototype/public/assets/foundation/base-male-roundtrip.vrm',base));
const sha=b=>createHash('sha256').update(b).digest('hex'),bodySHA=sha(bodyBytes);
assert.equal(bodySHA,'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff');
const fixture=()=>({name:'NodeTextureDecodeOnly',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)});
const body=await new GLTFLoader().register(fixture).parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset,bodyBytes.byteOffset+bodyBytes.byteLength),'');body.scene.updateMatrixWorld(true);
const bodyJSON=JSON.parse(bodyBytes.subarray(20,20+bodyBytes.readUInt32LE(12))),bones={};
for(const entry of bodyJSON.extensions.VRM.humanoid.humanBones)bones[entry.bone]=body.scene.getObjectByName(bodyJSON.nodes[entry.node].name);
const vrm={scene:body.scene,humanoid:{getRawBoneNode:name=>bones[name]}};
let code=await loadText('src/equipment.js');
code=code.replace('from "three"',`from ${JSON.stringify(new URL('prototype/node_modules/three/build/three.module.js',base).href)}`)
 .replace('from "three/addons/loaders/GLTFLoader.js"',`from ${JSON.stringify(new URL('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js',base).href)}`)
 .replace('from "./material-recipes.js"',`from ${JSON.stringify(new URL('src/material-recipes.js',candidate).href)}`)
 .replace('const loader = new GLTFLoader(),','const loader = new GLTFLoader().register(()=>({name:"NodeTextureDecodeOnly",loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)})),');
const {createEquipment}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const manifestBytes=Buffer.from(await loadText('public/assets/m1b/equipment.json'));
const id='m1b-uniform-shorts-v1',ref=JSON.parse(manifestBytes).items.find(x=>x.id===id).materialRecipes[0];
const recipeBytes=await readFile(new URL('public'+ref.url,candidate));
const response=b=>({ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
const oldFetch=globalThis.fetch,oldWindow=globalThis.window;let requestCount=0,release=null,started=null,defer=false;
globalThis.window={location:{href:'https://fixture.invalid/'}};
globalThis.fetch=async input=>{
 const url=new URL(input,'https://fixture.invalid/');
 if(url.pathname==='/assets/m1b/equipment.json')return response(manifestBytes);
 if(url.pathname===ref.url){requestCount++;if(defer){started?.();return new Promise(resolve=>release=()=>resolve(response(recipeBytes)));}return response(recipeBytes);}
 return response(await readFile(new URL('prototype/public'+url.pathname,base)));
};
const checks=[];let adapter;
try{
 adapter=await createEquipment({vrm,avatarSha256:bodySHA,manifestUrl:'/assets/m1b/equipment.json'});
 const item=await adapter.load(id);assert.equal(requestCount,0,'Material is opt-in, not auto-enabled');assert.equal(item.meshes.length,2);assert(item.stats.multiBoneVerticesAcrossPrimitives>0);
 const geometry=item.meshes.map(m=>m.geometry),originals=item.meshes.map(m=>m.material),bonesBefore=item.meshes.map(m=>m.skeleton.bones.slice());
 await adapter.equip(id);assert(item.container.visible);await adapter.setMaterialRecipe(id,ref.id);assert.equal(requestCount,1);
 for(let i=0;i<2;i++){assert.equal(item.meshes[i].geometry,geometry[i]);assert.deepEqual(item.meshes[i].skeleton.bones,bonesBefore[i]);assert.notEqual(item.meshes[i].material,originals[i]);}
 await adapter.setMaterialRecipe(id,null);item.meshes.forEach((m,i)=>assert.equal(m.material,originals[i]));
 await adapter.setMaterialRecipe(id,ref.id);assert.equal(requestCount,1,'Validated per-instance recipe cache');
 adapter.unequip('bottom');assert.equal(item.container.visible,false);await adapter.equip(id);assert.equal(adapter.getMaterialRecipeState(id).active.recipeId,ref.id);
 checks.push('Actual male VRM + 2-primitive weighted shorts pass existing exact bind/SHA loader; opt-in recipe keeps geometry/skeleton and restores originals');
 adapter.dispose();assert.equal(body.scene.getObjectByName('Equipment:'+id),undefined);await assert.rejects(adapter.setMaterialRecipe(id,null),/disposed/);
 checks.push('Equipment dispose restores/disposes owned resources; later clear rejected');
 adapter=await createEquipment({vrm,avatarSha256:bodySHA,manifestUrl:'/assets/m1b/equipment.json'});await adapter.load(id);
 defer=true;const begun=new Promise(resolve=>started=resolve),pending=adapter.setMaterialRecipe(id,ref.id);await begun;
 adapter.dispose();release();assert.equal((await pending).applied,false);assert.equal(body.scene.getObjectByName('Equipment:'+id),undefined);
 checks.push('Real loader recipe request completing after adapter disposal cannot reattach/apply');
 const result={passed:true,checks,bodySha256:bodySHA,recipeSha256:ref.sha256,
  fixture:'Only image decoding replaced by1x1 texture in memory; actual VRM/garment geometry, weights, bind matrices and recipe byte hashing used.',
  limits:['No GPU compile or animation/movie verdict','Only isolated candidate equipment source exercised; shared production source unchanged']};
 await writeFile(new URL('equipment-checks.json',candidate),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{adapter?.dispose();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
