import {createNativePalettePart} from '../../prototype/src/native-palette-part.js';
// Real source PNGs, native VRM and imported runtime modules. Pillow decodes the
// PNG bytes for CPU bitmap/Canvas transport fixtures. No browser or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createFacialPalette,EYE_COLORS} from '../../prototype/src/facial-palette.js';
import {createCharacterAppearance} from '../../prototype/src/character-appearance.js';
import {createFacialGeometry} from '../../prototype/src/facial-geometry.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {appearanceColorSupport,appearanceColorPresets} from '../../prototype/src/appearance-color-policy.js';
import {facialPaletteContract,FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION} from '../../prototype/src/facial-palette-contract.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../../prototype/src/appearance-candidates.js';
import {validateAppearanceRecipe,captureAppearanceRecipe,applyAppearanceRecipe} from '../../prototype/src/appearance-recipe.js';

const out=path.resolve(process.argv[2]??'evidence/native-eyebrow-independent-v1/core-v1');await fs.mkdir(out);
const publicRoot=path.resolve('prototype/public'),body='native-male-7586-v1',config=foundationProfile(body);
const contract=facialPaletteContract(config.sha256),sha=b=>createHash('sha256').update(b).digest('hex');
const files=new Map(),images=new Map();
for(const name of ['manifest.json','source-iris.png','iris-green.png']) {
  const url='/assets/native-iris-palette-v1/'+name,file=path.join(publicRoot,url),bytes=await fs.readFile(file);files.set(url,bytes);
  if(name.endsWith('.png'))images.set(sha(bytes),{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),
    pixels:new Uint8ClampedArray(execFileSync('python',['-c','from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())',file],{maxBuffer:8*1024*1024}))});
}
assert.equal(sha(files.get('/assets/native-iris-palette-v1/manifest.json')),'909f1c8699d2dd0338854090dc4f534273e33a78d1c00c3f470eb2ff826d8b7a');
const manifest=JSON.parse(files.get('/assets/native-iris-palette-v1/manifest.json'));
const browManifest=JSON.parse(await fs.readFile(path.join(publicRoot,'/assets/native-eyebrow-palette-v1/manifest.json')));
for(const name of ['manifest.json','source-brow.png','brow-brown.png']) {const url='/assets/native-eyebrow-palette-v1/'+name,file=path.join(publicRoot,url),bytes=await fs.readFile(file);files.set(url,bytes);if(name.endsWith('.png'))images.set(sha(bytes),{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),pixels:new Uint8ClampedArray(execFileSync('python',['-c','from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())',file],{maxBuffer:8*1024*1024}))});}
assert.equal(sha(files.get('/assets/native-eyebrow-palette-v1/manifest.json')),'acd3ec4703cac152890dda313f9b535d3efc5da3770fb4be28a4338e418e223a');
assert.equal(sha(files.get(manifest.iris.source.url)),manifest.iris.source.sha256);
const original=images.get(manifest.iris.source.sha256),colored=images.get(manifest.iris.colors.green.sha256);
const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap,originalDocument=globalThis.document;
const originalParse=GLTFLoader.prototype.parseAsync;
let corruptURL=null,held=null,bitmapGate=null,fetches=0;const bitmaps=[];
globalThis.fetch=async input=>{
  const url=new URL(input,'http://localhost/').pathname;fetches++;
  if(held?.url===url){const gate=held;held=null;gate.enter();await gate.promise;}
  let data=files.get(url);if(!data){try{data=await fs.readFile(path.join(publicRoot,url));}catch{}}return new Response(corruptURL===url?Buffer.from('wrong source bytes'):data,{status:data?200:404});
};
globalThis.createImageBitmap=async(blob,options)=>{
  assert.deepEqual(options,{premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
  const bytes=Buffer.from(await blob.arrayBuffer()),image=images.get(sha(bytes));assert(image);
  const bitmap={...image,pixels:new Uint8ClampedArray(image.pixels),closed:0,close(){this.closed++;assert.equal(this.closed,1);}};
  bitmaps.push(bitmap);if(bitmapGate&&bitmapGate.sha===sha(bytes)){const gate=bitmapGate;bitmapGate=null;gate.enter();await gate.promise;}return bitmap;
};
globalThis.document={createElement:()=>{
  let data;return{width:0,height:0,getContext:()=>({drawImage:image=>{data=new Uint8ClampedArray(image.pixels);},getImageData:()=>({data})})};
}};
GLTFLoader.prototype.parseAsync=function(...args){
  this.register(parser=>({name:'IrisCpuImageTransport',loadTexture:async index=>{
    const src=parser.json.textures[index].source===8?images.get(browManifest.parts.eyebrowColor.source.sha256):original;
    const texture=new THREE.Texture({...src,pixels:new Uint8ClampedArray(src.pixels)});
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
  let brow;vrm.scene.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.name===browManifest.parts.eyebrowColor.materialName)brow=m;});assert(brow);const f={vrm,profile,owner,material,brow,map:material.map,shade:material.shadeMultiplyTexture,browMap:brow.map,browShade:brow.shadeMultiplyTexture};fixtures.push(f);return f;
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
function originals(f){originalMaps(f);assert.equal(f.brow.map,f.browMap);assert.equal(f.brow.shadeMultiplyTexture,f.browShade);}
function mapState(f){return [f.material.map,f.material.shadeMultiplyTexture,f.brow.map,f.brow.shadeMultiplyTexture];}
function heldBitmap(sha){let enter,release;const started=new Promise(r=>enter=r);bitmapGate={sha,enter,promise:new Promise(r=>release=r)};return{started,release};}
const coreParts=[];
const irisContract={url:'/assets/native-iris-palette-v1/manifest.json',sha256:sha(files.get('/assets/native-iris-palette-v1/manifest.json')),bodySha256:config.sha256,sourceManifestSha256:manifest.sourceManifestSha256,version:'independent-actual-iris',colors:{eyeColor:{original:null,green:'#4f7a4a'}}};
const browContract={url:'/assets/native-eyebrow-palette-v1/manifest.json',sha256:sha(files.get('/assets/native-eyebrow-palette-v1/manifest.json')),bodySha256:config.sha256,sourceManifestSha256:browManifest.sourceManifestSha256,version:'independent-actual-brow',colors:{eyebrowColor:{original:null,brown:'#3a241e'}}};
function core(f,ct=irisContract,field='eyeColor'){const part=createNativePalettePart({vrm:f.vrm,avatarSha256:f.profile.sha256,contract:ct,field,expectedSide:field==='eyebrowColor'?THREE.DoubleSide:THREE.FrontSide});coreParts.push(part);return part;}
try {
 const f=await fixture();f.owner.dispose();const iris=core(f),brow=core(f,browContract,'eyebrowColor'),originalState=mapState(f);
 let sourceDisposals=0;for(const t of new Set(originalState))t.addEventListener('dispose',()=>sourceDisposals++);
 const i=await iris.prepareUpdate({eyeColor:'green'}),b=await brow.prepareUpdate({eyebrowColor:'brown'});assert(i.commit&&b.commit,JSON.stringify([i,b]));originals(f);
 const fn=f.brow.update;let fail=true;f.brow.update=function(dt){if(fail){fail=false;throw Error('core-injected-second-part-commit');}return fn.call(this,dt);};
 i.commit();assert.throws(()=>b.commit(),/core-injected/);assert(i.rollback().applied);i.dispose();b.dispose();f.brow.update=fn;assert.deepEqual(mapState(f),originalState);assert.equal(iris.getState().color,'original');assert.equal(brow.getState().color,'original');
 assert((await iris.set({eyeColor:'green'})).applied);assert((await brow.set({eyebrowColor:'brown'})).applied);
 const green=f.material.map,brown=f.brow.map;assert.deepEqual(green.image.pixels,colored.pixels);assert.deepEqual(brown.image.pixels,images.get(browManifest.parts.eyebrowColor.colors.brown.sha256).pixels);
 const reset=await iris.prepareUpdate({reset:true});const prior=iris.getState();assert.equal((await iris.set({eyeColor:'not-admitted'})).applied,false);assert(reset.isCurrent());assert.deepEqual(iris.getState(),prior);reset.commit();reset.dispose();
 const duplicate=core(f);assert.equal((await duplicate.set({eyeColor:'green'})).applied,false);duplicate.dispose();assert.equal(brow.getState().color,'brown');
 checks.push('actual two-part source and core commit/rollback; invalid request preserves prepared; same-material second owner denied');
 let disposed=0;for(const t of [green,brown])t.addEventListener('dispose',()=>disposed++);iris.dispose();brow.dispose();iris.dispose();brow.dispose();originals(f);assert.equal(disposed,2);assert.equal(green.image.closed,1);assert.equal(brown.image.closed,1);assert.equal(sourceDisposals,0);
 checks.push('part dispose restores originals, closes owned bitmaps/disposes textures once and retains borrowed source');
 // Synthetic second key reuses the same native PNG; this tests cache identity, not a new color admission.
 const multiManifest=structuredClone(manifest);multiManifest.iris.colors.greenTwin=structuredClone(manifest.iris.colors.green);const multiBytes=Buffer.from(JSON.stringify(multiManifest));files.set('/independent-two-variants.json',multiBytes);
 const ct={...irisContract,url:'/independent-two-variants.json',sha256:sha(multiBytes),colors:{eyeColor:{...irisContract.colors.eyeColor,greenTwin:'#4f7a4a'}}};
 const mf=await fixture();mf.owner.dispose();const multi=core(mf,ct);assert((await multi.set({eyeColor:'green'})).applied);const first=mf.material.map;assert((await multi.set({eyeColor:'greenTwin'})).applied);const second=mf.material.map;assert.notEqual(first,second);assert.notEqual(first.image,second.image);assert.deepEqual(first.image.pixels,second.image.pixels);assert.equal(multi.getState().textureCount,2*new Set([mf.map,mf.shade]).size);
 const beforeFetches=fetches;assert((await multi.set({eyeColor:'green'})).applied);assert.equal(mf.material.map,first);assert.equal(fetches,beforeFetches);const prepared=await multi.prepareUpdate({eyeColor:'greenTwin'});prepared.commit();assert.equal(mf.material.map,second);assert(prepared.rollback().applied);assert.equal(mf.material.map,first);assert.equal(multi.getState().color,'green');prepared.dispose();multi.dispose();assert.equal(first.image.closed,1);assert.equal(second.image.closed,1);
 checks.push('two synthetic named keys use distinct mutable caches/bitmaps, reuse cached color, rollback and dispose both once');
 const late=await fixture();late.owner.dispose();const latePart=core(late,browContract,'eyebrowColor'),gate=heldBitmap(browManifest.parts.eyebrowColor.colors.brown.sha256),start=bitmaps.length;const job=latePart.set({eyebrowColor:'brown'});await gate.started;latePart.dispose();gate.release();assert.equal((await job).applied,false);originals(late);for(const bitmap of bitmaps.slice(start))assert.equal(bitmap.closed,1);const reacquire=core(late,browContract,'eyebrowColor');assert((await reacquire.set({eyebrowColor:'brown'})).applied);reacquire.dispose();
 checks.push('dispose during actual bitmap decode closes late bitmap and releases owner for fresh palette');
 const mismatch=await fixture();mismatch.owner.dispose();const bad=core(mismatch);mismatch.map.image.pixels[100]^=1;assert.equal((await bad.set({eyeColor:'green'})).applied,false);originals(mismatch);mismatch.map.image.pixels[100]^=1;assert((await bad.set({eyeColor:'green'})).applied);bad.dispose();
 checks.push('actual borrowed source pixel mismatch rejects before publication and repaired source can retry');
 const pins={};for(const name of ['native-palette-part.js','native-facial-palette.js','native-eyebrow-palette.js'])pins[name]=sha(await fs.readFile('prototype/src/'+name));
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,checks,pins,limits:['CPU actual VRM/PNG bytes and official MToon; Canvas/Pillow fixture','Core rollback is explicitly invoked by this test coordinator; caller integration not inferred','greenTwin is a fixture alias of the same real PNG, not production multi-color admission']},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack},null,2)+'\n',{flag:'wx'});throw error;}
finally{for(const p of coreParts)p.dispose();for(const f of fixtures)f.owner.dispose();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;globalThis.document=originalDocument;GLTFLoader.prototype.parseAsync=originalParse;}
