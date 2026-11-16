// Real body/top/bottom GLB/bind and fit loading; image decode is CPU-only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createEquipment} from '../prototype/src/equipment.js';
import {resolveEquipmentSet} from '../prototype/src/equipment-set.js';
import {validateLayerFit} from '../prototype/src/garment-layer-fit.js';
const sha=data=>createHash('sha256').update(data).digest('hex'),root='assets-source/m2-vest-layer-fit-v1/';
const batch=JSON.parse(await fs.readFile(root+'generated/manifest.json'));
const spec=JSON.parse(await fs.readFile(root+'spec.json'));
const oldParse=GLTFLoader.prototype.parseAsync,oldFetch=globalThis.fetch,oldWindow=globalThis.window;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return oldParse.apply(this,args);};
globalThis.window={location:{href:'http://fixture.invalid/'}};
const checks=[];
try {
for(const row of batch.cases){
  const source=spec.cases.find(c=>c.id===row.id||c.id===row.case);assert(source,'case identity');
  const files=row.files,entry=JSON.parse(await fs.readFile(files['equipment-entry.json'].path));
  const fitBytes=await fs.readFile(files['fit.json'].path),fit=JSON.parse(fitBytes);
  const original=JSON.parse(await fs.readFile(source.equipmentManifest.path));
  entry.layerFitResource={schema:'vest-layer-fit-v1',url:'/assets/fixture-fit.json',sha256:sha(fitBytes),bottom:{id:fit.bottom.id,sha256:fit.bottom.sha256,bytes:fit.bottom.bytes}};
  const extensionBytes=Buffer.from(JSON.stringify({schema:'zbgs-equipment-v1',items:[entry]})),extension={url:'/assets/fixture-extension.json',sha256:sha(extensionBytes)};
  const manifest={schema:'zbgs-equipment-v1',items:[...original.items,entry]},bottom=original.items.find(x=>x.id===fit.bottom.id);assert(bottom);
  validateLayerFit(entry,fit,source.body.sha256,manifest.items);
  const buffer=await fs.readFile(source.body.path),parsed=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');parsed.scene.updateMatrixWorld(true);
  let servedFit=fitBytes;
  const filesByUrl=new Map([[entry.url,files['top.glb'].path],[new URL(bottom.url,'http://fixture.invalid/assets/fixture-equipment.json').pathname,source.bottom.path]]);
  globalThis.fetch=async input=>{const url=new URL(input,window.location.href);if(url.pathname==='/assets/fixture-equipment.json')return new Response(JSON.stringify(original));if(url.pathname==='/assets/fixture-extension.json')return new Response(extensionBytes);if(url.pathname==='/assets/fixture-fit.json')return new Response(servedFit);const file=filesByUrl.get(url.pathname);assert(file,'unexpected URL '+url.pathname);return new Response(await fs.readFile(file));};
  const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:()=>null}},make=()=>createEquipment({vrm,avatarSha256:source.body.sha256,manifestUrl:'/assets/fixture-equipment.json',additionalManifests:[extension]});
  let adapter=await make();assert.deepEqual(adapter.describe(original.items[0].id),original.items[0]);const ids=[entry.id,bottom.id];await adapter.equipSet(ids);assert(adapter.get(entry.id).container.visible);assert(adapter.get(bottom.id).container.visible);
  await assert.rejects(adapter.equipSet([entry.id]),/Unvalidated garment layer pairing/);assert(adapter.get(entry.id).container.visible);assert.throws(()=>adapter.unequip('bottom'),/Unvalidated garment layer pairing/);assert(adapter.get(bottom.id).container.visible);
  adapter.applyLoadedSet([]);assert(!adapter.get(entry.id).container.visible);adapter.dispose();
  servedFit=Buffer.from('{}');adapter=await make();await assert.rejects(adapter.load(entry.id),/fit resource integrity mismatch/);assert.equal(adapter.get(entry.id),null);adapter.dispose();servedFit=fitBytes;
  for(const field of ['body','top','bottom']){const bad=structuredClone(fit);bad[field].sha256='0'.repeat(64);assert.throws(()=>validateLayerFit(entry,bad,source.body.sha256,manifest.items),/identity is incompatible/);}
  const wrong=structuredClone(manifest.items);wrong.find(x=>x.id===bottom.id).sha256='0'.repeat(64);assert.throws(()=>resolveEquipmentSet(wrong,ids,source.body.sha256),/Unvalidated garment layer pairing/);
  const oldDigest=extension.sha256;extension.sha256='0'.repeat(64);await assert.rejects(make(),/extension integrity mismatch/);extension.sha256=oldDigest;
  checks.push({case:source.id,body:source.body.sha256,top:entry.sha256,fit:sha(fitBytes),bottom:bottom.sha256,passed:true,checks:['pinned additive catalog preserves original entry metadata','wrong extension digest refuses','real GLB exact body binds and pair load','missing lower garment refuses without altering visible set','unequip required lower garment refuses atomically','empty diagnostic set removes both','bad fit bytes refuse attachment','wrong body/top/bottom fit hash refuses','same bottom ID different resource refuses']});
}
}finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=oldParse;}
const result={passed:true,checks,scope:'Real loader/GLBs/binds and fit contract; CPU image-decode fixture. No visual/collision/animation acceptance.'};const out=process.argv[2]??'evidence/m2-vest-layer-dependency-v1';await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
