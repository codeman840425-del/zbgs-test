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
let adapter;
const visible=()=>Object.values(cfg.ids).filter(id=>adapter.get(id)?.container.visible).sort();
const normal=[cfg.ids.top,cfg.ids.shoes,cfg.ids.pants];
try{
  adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});
  assert.equal((await adapter.equipSet(normal)).applied,true);
  assert.deepEqual(visible(),normal.toSorted());
  const manifest=JSON.parse(await readFile(new URL('.'+cfg.manifestUrl,base)));
  const shorts=manifest.items.find(x=>x.id===cfg.ids.shorts);
  deferredPath=new URL(shorts.url,'http://fixture.invalid'+cfg.manifestUrl).pathname;
  const begun=new Promise(resolve=>{started=resolve;});
  const stale=adapter.equipSet([cfg.ids.top,cfg.ids.shoes,cfg.ids.shorts]);await begun;
  adapter.applyLoadedSet([cfg.ids.shoes]);release();
  assert.equal((await stale).reason,'superseded');assert.deepEqual(visible(),[cfg.ids.shoes]);
  checks.push('Real male garment loading superseded by body-debug shoe-only set cannot show late shorts');
  deferredPath=null;
  for(const ids of [normal,[cfg.ids.top,cfg.ids.shoes,cfg.ids.shorts],normal]){
    assert.equal((await adapter.equipSet(ids)).applied,true);assert.deepEqual(visible(),ids.toSorted());
  }
  await assert.rejects(adapter.equipSet([cfg.ids.pants,cfg.ids.shorts]),/conflict/);
  await assert.rejects(adapter.equipSet(['missing']),/Unknown/);assert.deepEqual(visible(),normal.toSorted());
  checks.push('Actual long→short→long uses same loaded skeletons; conflicting or unknown final set preserves prior visibility');
  adapter.dispose();
  assert.equal(parsed.scene.getObjectByName('Equipment:'+cfg.ids.shorts),undefined);
  adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});
  await adapter.equipSet([cfg.ids.shoes]);failPath=new URL(shorts.url,'http://fixture.invalid'+cfg.manifestUrl).pathname;
  await assert.rejects(adapter.equipSet([cfg.ids.top,cfg.ids.shorts]),/Injected/);
  // A sibling load may finish after Promise.all rejects. It must remain hidden.
  await adapter.load(cfg.ids.top);assert.deepEqual(visible(),[cfg.ids.shoes]);
  failPath=null;await adapter.equipSet(normal);assert.deepEqual(visible(),normal.toSorted());
  checks.push('Failed partial set keeps old shoes; late successfully loaded sibling stays hidden; retry succeeds');
}finally{adapter?.dispose();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=originalParse;}
const result={passed:true,checks,bodySha256:cfg.sha256,scope:'CPU composition and real loader state/bind checks; texture decode replaced; no rendered/animation/onePiece asset acceptance'};
if(process.argv[2]){await mkdir(process.argv[2],{recursive:true});await writeFile(new URL('file:///'+process.argv[2].replaceAll('\\','/')+'/report.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result,null,2));
