import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createEquipment} from '../prototype/src/equipment.js';
import {resolveEquipmentSet, commitLoadedEquipmentSet} from '../prototype/src/equipment-set.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';

const checks = [];
const catalog = ['top','bottom','shoes','onePiece','outerwear'].map(slot =>
  ({id:slot,slot,sha256:slot,compatibleAvatarSha256:'body'}));
catalog[4].layerWith = ['top'];
assert.deepEqual(resolveEquipmentSet(catalog,['top','bottom','outerwear'],'body').map(x=>x.id),['top','bottom','outerwear']);
for(const ids of [['top','onePiece'],['bottom','onePiece'],['onePiece','outerwear'],['top','top'],['missing']])
  assert.throws(()=>resolveEquipmentSet(catalog,ids,'body'));
assert.throws(()=>resolveEquipmentSet(catalog,['top'],'other'));
const loaded=new Map([['top',{container:{visible:true}}]]);
assert.throws(()=>commitLoadedEquipmentSet(loaded,catalog,['shoes'],'body'),/not loaded/);
assert.equal(loaded.get('top').container.visible,true);
checks.push('Synthetic composition conflicts, explicit outer pairing, exact body and missing-loaded failure preserve state; not garment fit proof');

// Actual current loader, actual body and garment bytes/binds. Replace only image
// decoding so these CPU checks do not pretend to verify rendered cloth quality.
const originalParse=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=function(...args){
  this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
  return originalParse.apply(this,args);
};
const base=new URL('../prototype/public/',import.meta.url);
const cfg=foundationProfile('male');
const bodyBytes=await readFile(new URL('.'+cfg.url,base));
assert.equal(createHash('sha256').update(bodyBytes).digest('hex'),cfg.sha256);
const parsed=await new GLTFLoader().parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset,bodyBytes.byteOffset+bodyBytes.byteLength),'');
parsed.scene.updateMatrixWorld(true);
const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:()=>null}};
const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
globalThis.window={location:{href:'http://fixture.invalid/'}};
let release,started,deferredPath,failPath;
const response=bytes=>({ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
globalThis.fetch=async input=>{
  const url=new URL(input,window.location.href);
  if(url.pathname===failPath)throw Error('Injected garment network failure');
  const bytes=await readFile(new URL('.'+url.pathname,base));
  if(url.pathname===deferredPath){started?.();await new Promise(resolve=>{release=resolve;});}
  return response(bytes);
};

const out=process.argv[2];if(!out)throw Error('New evidence output directory required');await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(new URL('.'+cfg.manifestUrl,base)));
const garmentPath=id=>new URL(manifest.items.find(e=>e.id===id).url,'http://fixture.invalid'+cfg.manifestUrl).pathname;
const parsedResources=new Map();const parseWithTextureFixture=GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync=async function(...args){const g=await parseWithTextureFixture.apply(this,args);g.scene.traverse(n=>{if(!n.isMesh)return;const resources=[n.geometry,...(Array.isArray(n.material)?n.material:[n.material])];for(const m of Array.isArray(n.material)?n.material:[n.material])for(const v of Object.values(m))if(v?.isTexture)resources.push(v);for(const r of resources)if(!parsedResources.has(r)){const row={kind:r.isTexture?'texture':r.isMaterial?'material':'geometry',disposals:0};parsedResources.set(r,row);r.addEventListener('dispose',()=>row.disposals++);}});return g;};
let adapter;const observations=[];const visible=()=>Object.values(cfg.ids).filter(id=>adapter.get(id)?.container.visible).sort();
try{
 for(const failure of ['network','unknown']){
  adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});await adapter.equipSet([cfg.ids.shoes]);
  deferredPath=garmentPath(cfg.ids.shorts);const begun=new Promise(resolve=>started=resolve);
  const earlier=adapter.equipSet([cfg.ids.shoes,cfg.ids.shorts]);await begun;const releaseEarlier=release;
  if(failure==='network')failPath=garmentPath(cfg.ids.top);
  await assert.rejects(adapter.equip(failure==='network'?cfg.ids.top:'missing'),failure==='network'?/Injected/:/Unknown/);
  assert.deepEqual(visible(),[cfg.ids.shoes]);releaseEarlier();const settled=await earlier;
  assert.equal(settled.reason,'superseded');assert.deepEqual(visible(),[cfg.ids.shoes]);
  observations.push({case:'set followed by failing single-slot '+failure,result:settled,visible:visible(),oldRequestResurrected:false});
  adapter.dispose();adapter=null;failPath=null;deferredPath=null;started=null;
 }
 adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});await adapter.equipSet([cfg.ids.shoes]);
 deferredPath=garmentPath(cfg.ids.shorts);let begun=new Promise(resolve=>started=resolve);const pending=adapter.equipSet([cfg.ids.shorts]);await begun;
 const rejectPending=assert.rejects(pending,/disposed/);adapter.dispose();release();await rejectPending;
 assert.equal(parsed.scene.getObjectByName('Equipment:'+cfg.ids.shorts),undefined);assert.equal(parsed.scene.getObjectByName('Equipment:'+cfg.ids.shoes),undefined);
 observations.push({case:'dispose during pending set',allContainersDetached:true});adapter.dispose();adapter=null;deferredPath=null;started=null;
 adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});await adapter.equipSet([cfg.ids.shoes]);
 deferredPath=garmentPath(cfg.ids.top);begun=new Promise(resolve=>started=resolve);const top=adapter.equip(cfg.ids.top);await begun;const releaseTop=release;deferredPath=null;
 assert.equal((await adapter.equip(cfg.ids.pants)).applied,true);releaseTop();assert.equal((await top).applied,true);
 assert.deepEqual(visible(),[cfg.ids.top,cfg.ids.shoes,cfg.ids.pants].sort());observations.push({case:'legacy distinct slot requests remain independent',visible:visible()});
 adapter.dispose();adapter=null;
}finally{adapter?.dispose();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=originalParse;}
const resourceRows=[...parsedResources.values()];assert(resourceRows.length>0);assert(resourceRows.every(r=>r.disposals===1),JSON.stringify(resourceRows.filter(r=>r.disposals!==1)));
const result={passed:true,sourceSha256:createHash('sha256').update(await readFile(new URL('../prototype/src/equipment.js',import.meta.url))).digest('hex'),observations,resources:Object.fromEntries(['geometry','material','texture'].map(kind=>[kind,resourceRows.filter(r=>r.kind===kind).length])),allObservedRenderResourcesDisposedExactlyOnce:true,scope:'Actual garment GLB loader, image decode fixture; CPU events only, no GPU allocation claim'};
await writeFile(new URL('report.json',new URL('file:///'+out.replaceAll('\\','/')+'/')),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
