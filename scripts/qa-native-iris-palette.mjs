// Real source PNGs, native VRM and imported runtime modules. Pillow decodes the
// PNG bytes for CPU bitmap/Canvas transport fixtures. No browser or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createFacialPalette,EYE_COLORS} from '../prototype/src/facial-palette.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {appearanceColorSupport,appearanceColorPresets} from '../prototype/src/appearance-color-policy.js';
import {facialPaletteContract,FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION} from '../prototype/src/facial-palette-contract.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../prototype/src/appearance-candidates.js';
import {validateAppearanceRecipe,captureAppearanceRecipe,applyAppearanceRecipe} from '../prototype/src/appearance-recipe.js';

const out=path.resolve(process.argv[2]??'evidence/native-iris-palette-runtime-v1');await fs.mkdir(out);
const publicRoot=path.resolve('prototype/public'),body='native-male-7586-v1',config=foundationProfile(body);
const contract=facialPaletteContract(config.sha256),sha=b=>createHash('sha256').update(b).digest('hex');
const files=new Map(),images=new Map();
for(const name of ['manifest.json','source-iris.png','iris-green.png']) {
  const url='/assets/native-iris-palette-v1/'+name,file=path.join(publicRoot,url),bytes=await fs.readFile(file);files.set(url,bytes);
  if(name.endsWith('.png'))images.set(sha(bytes),{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),
    pixels:new Uint8ClampedArray(execFileSync('python',['-c','from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())',file],{maxBuffer:8*1024*1024}))});
}
assert.equal(sha(files.get(contract.url)),contract.sha256);
const manifest=JSON.parse(files.get(contract.url));
assert.equal(sha(files.get(manifest.iris.source.url)),manifest.iris.source.sha256);
const original=images.get(manifest.iris.source.sha256),colored=images.get(manifest.iris.colors.green.sha256);
const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap,originalDocument=globalThis.document;
const originalParse=GLTFLoader.prototype.parseAsync;
let corruptURL=null,held=null,fetches=0;const bitmaps=[];
globalThis.fetch=async input=>{
  const url=new URL(input,'http://localhost/').pathname;fetches++;
  if(held?.url===url){const gate=held;held=null;gate.enter();await gate.promise;}
  const data=files.get(url);return new Response(corruptURL===url?Buffer.from('wrong source bytes'):data,{status:data?200:404});
};
globalThis.createImageBitmap=async(blob,options)=>{
  assert.deepEqual(options,{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
  const bytes=Buffer.from(await blob.arrayBuffer()),image=images.get(sha(bytes));assert(image);
  const bitmap={...image,pixels:new Uint8ClampedArray(image.pixels),closed:0,close(){this.closed++;assert.equal(this.closed,1);}};
  bitmaps.push(bitmap);return bitmap;
};
globalThis.document={createElement:()=>{
  let data;return{width:0,height:0,getContext:()=>({drawImage:image=>{data=new Uint8ClampedArray(image.pixels);},getImageData:()=>({data})})};
}};
GLTFLoader.prototype.parseAsync=function(...args){
  this.register(()=>({name:'IrisCpuImageTransport',loadTexture:async()=>{
    const texture=new THREE.Texture({...original,pixels:new Uint8ClampedArray(original.pixels)});
    Object.assign(texture,{flipY:false,colorSpace:THREE.SRGBColorSpace,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
      wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,generateMipmaps:false});return texture;
  }}));return originalParse.apply(this,args);
};
const fixtures=[],checks=[];
async function fixture(type=body,character=false) {
  const profile=foundationProfile(type),bytes=await fs.readFile(path.join(publicRoot,profile.url));assert.equal(sha(bytes),profile.sha256);
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;vrm.update(0);
  const materials=[];vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.name===manifest.iris.materialName)materials.push(m);
  });
  const material=materials[0];assert(material);
  const owner=character?createCharacterAppearance({vrm,avatarSha256:profile.sha256,preserveHairInBaseMode:true}):createFacialPalette({vrm,avatarSha256:profile.sha256});
  const f={vrm,profile,owner,material,map:material.map,shade:material.shadeMultiplyTexture};fixtures.push(f);return f;
}
function parameters(material) {
  const values={};for(const [key,uniform] of Object.entries(material.uniforms)) {
    const value=uniform.value;if(value?.isTexture)continue;
    values[key]=value?.toArray?value.toArray():value;
  }
  return {values,opacity:material.opacity,transparent:material.transparent,alphaTest:material.alphaTest,
    side:material.side,depthWrite:material.depthWrite,blending:material.blending};
}
function originalMaps(f){assert.equal(f.material.map,f.map);assert.equal(f.material.shadeMultiplyTexture,f.shade);}
function hold(url){let enter,release;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);held={url,enter,promise};return{started,release};}
try {
  assert.deepEqual(appearanceColorPresets(config.sha256,'eyeColor',EYE_COLORS),{original:null,green:'#4f7a4a'});
  assert.deepEqual(appearanceColorSupport(config.sha256),{hairColor:false,skinTone:false,eyeColor:true,lipColor:false});
  const f=await fixture(),before=parameters(f.material);let sourceDisposals=0;
  for(const texture of new Set([f.map,f.shade]))texture.addEventListener('dispose',()=>sourceDisposals++);
  const prepared=await f.owner.prepareUpdate({eyeColor:'green'});assert(prepared.isCurrent,JSON.stringify(prepared));assert(prepared.isCurrent());originalMaps(f);
  prepared.commit();prepared.dispose();assert.equal(f.owner.getState().eyeColor,'green');assert.notEqual(f.material.map,f.map);
  assert.equal(f.material.map.image.width,1024);assert.deepEqual(f.material.map.image.pixels,colored.pixels);
  assert.deepEqual(parameters(f.material),before);
  for(const key of ['wrapS','wrapT','minFilter','magFilter','flipY','colorSpace','channel'])assert.equal(f.material.map[key],f.map[key]);
  assert((await f.owner.set({reset:true})).applied);originalMaps(f);
  const old=await f.owner.prepareUpdate({eyeColor:'green'}),fresh=await f.owner.prepareUpdate({eyeColor:'original'});
  assert(!old.isCurrent());assert.throws(()=>old.commit(),/过期/);old.dispose();fresh.commit();fresh.dispose();originalMaps(f);
  checks.push('Actual PNG prepared invisibly, synchronous map/shade swap, unchanged MToon/sampler/alpha, reset and stale commit');

  const a=await fixture(),b=await fixture();await Promise.all([a.owner.set({eyeColor:'green'}),b.owner.set({eyeColor:'green'})]);
  assert.notEqual(a.material.map,b.material.map);assert.notEqual(a.material.map.source,b.material.map.source);
  assert.notEqual(a.material.map.image,b.material.map.image);
  let ownDisposed=0;const own=a.material.map,bitmap=own.image;own.addEventListener('dispose',()=>ownDisposed++);
  a.owner.dispose();a.owner.dispose();assert.equal(ownDisposed,1);assert.equal(bitmap.closed,1);originalMaps(a);
  assert.equal(b.owner.getState().eyeColor,'green');assert.equal(b.material.map.image.closed,0);
  assert.equal(sourceDisposals,0);
  checks.push('Two actors own different mutable textures/bitmaps; own resources dispose once and borrowed source is retained');

  for(const mutation of ['pixel','sampler','material']) {
    const bad=await fixture();
    if(mutation==='pixel')bad.map.image.pixels[0]^=255;
    if(mutation==='sampler')bad.map.channel=1;
    if(mutation==='material')bad.material.name='WrongIris';
    const result=await bad.owner.set({eyeColor:'green'});assert.equal(result.applied,false);originalMaps(bad);
  }
  const badHash=await fixture();corruptURL=manifest.iris.colors.green.url;
  const badResult=await badHash.owner.set({eyeColor:'green'});assert.equal(badResult.applied,false);originalMaps(badHash);corruptURL=null;
  assert((await badHash.owner.set({eyeColor:'green'})).applied);
  checks.push('Actual source pixels, UV sampler, material mapping and resource SHA reject before changes; failed fetch can retry');

  const delayed=await fixture(),gate=hold(manifest.iris.colors.green.url);
  const green=delayed.owner.set({eyeColor:'green'});await gate.started;
  assert((await delayed.owner.set({eyeColor:'original'})).applied);gate.release();
  assert.equal((await green).applied,false);originalMaps(delayed);
  const destroyed=await fixture(),gate2=hold(manifest.iris.colors.green.url);
  const late=destroyed.owner.set({eyeColor:'green'});await gate2.started;destroyed.owner.dispose();gate2.release();
  assert.equal((await late).applied,false);originalMaps(destroyed);
  checks.push('New original wins over delayed green; dispose during fetch cannot publish or resurrect textures');

  const actor=await fixture(body,true),catalog=JSON.parse(await fs.readFile(path.join(publicRoot,config.manifestUrl)));
  const geometry=createFacialGeometry({vrm:actor.vrm,avatarSha256:config.sha256});
  const controller={outfit:0,outfitRevision:0,actor:{config,profile:{bodyType:body,sha256:config.sha256},vrm:actor.vrm,
    appearance:actor.owner,facialGeometry:geometry,getEquipmentRecipe:()=>Object.fromEntries(['top','shorts','shoes'].map(role=>[role,catalog.items.find(e=>e.id===config.ids[role])]))},
    async prepareOutfit(){return{isCurrent:()=>true,commit(){},dispose(){}}}};
  const query=queryAppearanceCandidates(controller);
  assert.deepEqual(query.appearance.eyeColor.choices,[{value:'original',color:null},{value:'green',color:'#4f7a4a'}]);
  const record=structuredClone(query.defaultRecipe);record.appearance.eyeColor='green';
  assert(validateAppearanceRecipe(controller,record));assert(admitAppearanceCandidate(controller,record).accepted);
  assert((await applyAppearanceRecipe(controller,record)).applied);assert.deepEqual(captureAppearanceRecipe(controller),record);
  for(const version of [FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION]) {
    const previous=actor.owner.getState().eyeColor;
    const legacy=structuredClone(record);legacy.paletteVersion=version;
    assert.throws(()=>validateAppearanceRecipe(controller,legacy),error=>error.field==='paletteVersion');
    await assert.rejects(applyAppearanceRecipe(controller,legacy));assert.equal(actor.owner.getState().eyeColor,previous);
    legacy.appearance.eyeColor='original';assert(validateAppearanceRecipe(controller,legacy));
    assert((await applyAppearanceRecipe(controller,legacy)).applied);originalMaps(actor);
  }
  for(const selection of [{eyeColor:'blue'},{lipColor:'rose'},{skinTone:'warm'},{hairColor:'brown'}])assert.equal((await actor.owner.set(selection)).applied,false);
  const female=await fixture('native-female-843ac-v1',true);assert.equal((await female.owner.set({eyeColor:'green'})).applied,false);
  geometry.dispose();
  checks.push('Actual query/recipe/new version green applies and captures; both legacy original-only versions restore, old-version green rejects; other native colors stay closed');
  const runtimeSHA={};for(const file of ['native-facial-palette.js','native-palette-catalog.js','facial-palette.js','facial-palette-contract.js','appearance-color-policy.js','appearance-candidates.js','appearance-recipe.js'])runtimeSHA[file]=sha(await fs.readFile('prototype/src/'+file));
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,checks,runtimeSHA,manifestSHA:contract.sha256,fetches,
    limits:'Actual native GLB/material and PNG bytes decoded by Pillow. Canvas/bitmap CPU transport fixture, no real browser premultiply/color conversion/WebGL or visual proof. Native original image/dimensions/encoded target identity independently pinned.'},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,out}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack},null,2)+'\n');throw error;}
finally {
  for(const f of fixtures)f.owner.dispose();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;
  globalThis.document=originalDocument;GLTFLoader.prototype.parseAsync=originalParse;
}
