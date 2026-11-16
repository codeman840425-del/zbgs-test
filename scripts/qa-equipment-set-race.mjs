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

const out=process.argv[2];
if(!out)throw Error('Provide a new evidence output directory');
await mkdir(out,{recursive:true});
const expectBug=process.argv.includes('--expect-bug');
const manifest=JSON.parse(await readFile(new URL('.'+cfg.manifestUrl,base)));
const garmentPath=id=>new URL(manifest.items.find(e=>e.id===id).url,'http://fixture.invalid'+cfg.manifestUrl).pathname;
const observations=[];
let adapter;
const visible=()=>Object.values(cfg.ids).filter(id=>adapter.get(id)?.container.visible).sort();
try{
 for(const failure of [false,true]){
  adapter=await createEquipment({vrm,avatarSha256:cfg.sha256,manifestUrl:cfg.manifestUrl});
  await adapter.equipSet([cfg.ids.shoes]);
  deferredPath=garmentPath(cfg.ids.top);let begin=new Promise(resolve=>started=resolve);
  const older=adapter.equip(cfg.ids.top);await begin;const releaseTop=release;
  deferredPath=garmentPath(cfg.ids.shorts);begin=new Promise(resolve=>started=resolve);
  if(failure)failPath=deferredPath;
  const newer=adapter.equipSet([cfg.ids.shoes,cfg.ids.shorts]);
  let setResult;
  if(failure){try{await newer;}catch(error){setResult={error:error.message};}}
  else await begin;
  const releaseShorts=release;
  releaseTop();const oldResult=await older;
  const intermediate=visible();
  if(!failure){releaseShorts();setResult=await newer;}
  observations.push({case:failure?'new set fails while earlier single-slot request loads':'new set waits while earlier single-slot request loads',olderApplied:oldResult.applied,intermediateVisible:intermediate,finalVisible:visible(),setResult});
  adapter.dispose();adapter=null;deferredPath=null;failPath=null;started=null;
 }
}finally{adapter?.dispose();globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;GLTFLoader.prototype.parseAsync=originalParse;}
const product=new URL('../prototype/src/equipment.js',import.meta.url);
const result={sourceSha256:createHash('sha256').update(await readFile(product)).digest('hex'),expectBug,observations,textureDecodeFixture:true,browserStarted:false};
await writeFile(new URL('report.json',new URL('file:///'+out.replaceAll('\\','/')+'/')),JSON.stringify(result,null,2)+'\n');
for(const r of observations){assert.equal(r.olderApplied,expectBug);assert.deepEqual(r.intermediateVisible,expectBug?[cfg.ids.shoes,cfg.ids.top].sort():[cfg.ids.shoes]);}
console.log(JSON.stringify(result,null,2));
