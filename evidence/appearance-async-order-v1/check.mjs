// CPU lifecycle regression. Uses real production modules, catalog, manifests,
// asset SHA/JSON. GLTFParser is a declared one-mesh fixture (no GPU/DOM decoding).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../..');
const T=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')));
const {GLTFLoader}=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js')));
const {createCharacterAppearance}=await import(pathToFileURL(path.join(root,'prototype/src/character-appearance.js')));
const {HAIRSTYLES}=await import(pathToFileURL(path.join(root,'prototype/src/hairstyle-catalog.js')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=['character-appearance.js','facial-palette.js','hairstyle-catalog.js'];
const snapshots={};await fs.mkdir(path.join(here,'source-tested'),{recursive:true});
for(const file of sourceFiles){const bytes=await fs.readFile(path.join(root,'prototype/src',file));snapshots[file]=sha(bytes);await fs.writeFile(path.join(here,'source-tested',file),bytes);}
const female='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95', male='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
function actor(body=male){
 const scene=new T.Group(),head=new T.Group();scene.add(head);const material=new T.MeshBasicMaterial({color:'#00aacc'});material.name=body===female?'F00_000_HairBack_00_HAIR':'M00_000_HairBack_00_HAIR';
 const original=new T.Mesh(new T.BufferGeometry(),material);scene.add(original);
 const a=createCharacterAppearance({vrm:{scene,humanoid:{getRawBoneNode:n=>n==='head'?head:null}},avatarSha256:body});return{a,scene,head,original,material};
}
const tests=[];
for(const body of [female,male]){
 const x=actor(body);const results=await Promise.all([x.a.set({reset:true}),x.a.set({hairColor:'black'})]);assert.equal(x.a.getState().hairColor,'black');
 tests.push({case:'same-tick reset then black',body,results,actual:x.a.getState().hairColor,pass:true});
 await Promise.all([x.a.set({hairColor:'brown'}),x.a.set({reset:true})]);assert.equal(x.a.getState().hairColor,'original');
 tests.push({case:'same-tick brown then reset',body,pass:true});x.a.dispose();
}
let fetches=[],parseCount=0,geometryDisposals=0,materialDisposals=0,gate=null;
const realFetch=globalThis.fetch,realParse=GLTFLoader.prototype.parseAsync;
globalThis.fetch=async url=>{fetches.push(url);if(gate){const g=gate;gate=null;await g;}const bytes=await fs.readFile(path.join(root,'prototype/public',String(url)));return new Response(bytes,{status:200});};
GLTFLoader.prototype.parseAsync=async function(buffer){
 parseCount++;const bytes=Buffer.from(buffer),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));
 assert.equal(doc.nodes.length,1);assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);assert.equal(doc.skins,undefined);
 const scene=new T.Group(),geometry=new T.BufferGeometry(),material=new T.MeshBasicMaterial();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setIndex([0,1,2]);
 geometry.addEventListener('dispose',()=>geometryDisposals++);scene.add(new T.Mesh(geometry,material));return{scene};
};
const identities=[];
try{
 for(const entry of HAIRSTYLES){
  const raw=await fs.readFile(path.join(root,'prototype/public',entry.manifestUrl)),m=JSON.parse(raw),asset=await fs.readFile(path.join(root,'prototype/public',m.url));
  assert.equal(m.id,entry.id);assert.deepEqual(m.compatibleBodies,entry.compatibleBodies);assert.equal(sha(asset),m.sha256);
  identities.push({id:m.id,manifestSha256:sha(raw),assetSha256:sha(asset),sourceMaterial:m.sourceMaterial,compatibleBodies:m.compatibleBodies});
 }
 const x=actor(male);assert.deepEqual(x.a.getState().availableStyles,['original','male-sidepart-v1']);
 const count=fetches.length;const denied=await x.a.set({hairStyle:'female-bob-v1'});assert.equal(denied.applied,false);assert.equal(fetches.length,count);
 tests.push({case:'male rejects female style before network',result:denied,pass:true});
 let release;gate=new Promise(r=>release=r);const pending=x.a.set({hairStyle:'male-sidepart-v1'});await x.a.set({reset:true});await x.a.set({hairColor:'black'});release();const cancelled=await pending;
 assert.equal(cancelled.cancelled,true);assert.equal(x.a.getState().hairStyle,'original');assert.equal(x.a.getState().hairColor,'black');assert.equal(x.original.visible,true);
 assert.equal(x.head.children.length,1);assert.equal(x.head.children[0].visible,false);
 tests.push({case:'delayed male load then reset then black; stale load remains hidden',cancelled,pass:true});
 const beforeFetch=fetches.length;const loaded=await x.a.set({hairStyle:'male-sidepart-v1'});assert.equal(loaded.applied,true);assert.equal(fetches.length,beforeFetch);assert.equal(x.head.children[0].visible,true);assert.equal(x.original.visible,false);
 const m=x.head.children[0].children[0].material;assert.equal(m.name,'M00_000_HairBack_00_HAIR');assert.notEqual(m,x.material);m.addEventListener('dispose',()=>materialDisposals++);
 tests.push({case:'male cached id uses clone of actual male source material',parseCount,noExtraFetch:true,pass:true});
 await x.a.set({hairStyle:'original'});await x.a.set({hairStyle:'male-sidepart-v1'});assert.equal(parseCount,1);x.a.dispose();assert.equal(x.head.children.length,0);assert.equal(x.original.visible,true);assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);
 tests.push({case:'cached switching and disposal restores original, releases owned mesh once',pass:true});
 const y=actor(male);let release2;gate=new Promise(r=>release2=r);const pending2=y.a.set({hairStyle:'male-sidepart-v1'});y.a.dispose();release2();const result2=await pending2;assert.equal(result2.cancelled,true);assert.equal(y.head.children.length,0);assert.equal(geometryDisposals,2);
 tests.push({case:'dispose during pending style releases completed fixture without attachment',result:result2,pass:true});
}finally{globalThis.fetch=realFetch;GLTFLoader.prototype.parseAsync=realParse;}
for(const file of sourceFiles)assert.equal(sha(await fs.readFile(path.join(root,'prototype/src',file))),snapshots[file],'Source changed during test');
const report={scope:'CPU actual production module ordering/catalog/lifecycle; no GPU or image decoding. Parser fixture explicitly replaces parseAsync only, not appearance logic.',sourceSha256:snapshots,tests,identities,fetches,parseCount,geometryDisposals,materialDisposals,pass:true};
await fs.writeFile(path.join(here,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
