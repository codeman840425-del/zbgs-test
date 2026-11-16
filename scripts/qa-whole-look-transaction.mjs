// CPU production face, appearance and M1 equipment with real pinned VRM/GLB
// arrays and binds. Texture decoding and the controller UI are CPU fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';
import {createFacialPalette} from '../prototype/src/facial-palette.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
import {captureAppearanceRecipe,applyAppearanceRecipe} from '../prototype/src/appearance-recipe.js';
import {HAIRSTYLES} from '../prototype/src/hairstyle-catalog.js';
import {hairFitIdentity} from '../prototype/src/hair-fit-contract.js';
import {FACIAL_PALETTE_MANIFEST_URL} from '../prototype/src/facial-palette-contract.js';

// Vite accepts this existing JSON import. Node needs its type attribute.
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);}});
const {createM1Equipment}=await import('../prototype/src/m1-equipment.js');
jsonHook.deregister();

const out=path.resolve(process.argv[2]);
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});
const expectBug=process.argv.includes('--expect-bug');
const cfg=foundationProfile('male'),entry=HAIRSTYLES.find(e=>e.compatibleBodies.includes(cfg.sha256));
const base=new URL('../prototype/public/',import.meta.url),checks=[];
const originalParse=GLTFLoader.prototype.parseAsync,originalFetch=globalThis.fetch;
const bufferOf=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
GLTFLoader.prototype.parseAsync=function(...args){
  this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>null}));
  return originalParse.apply(this,args);
};
globalThis.window={location:{href:'http://fixture.invalid/'}};
let held=null,failPath=null;
globalThis.fetch=async input=>{
  const url=new URL(input,window.location.href);
  if(url.pathname===held?.path){const h=held;held=null;h.enter();await h.promise;}
  if(url.pathname===failPath)throw Error('injected actual resource failure');
  return new Response(await fs.readFile(new URL('.'+url.pathname,base)));
};
function hold(resource){
  let release,enter;
  const h={path:resource,promise:new Promise(r=>release=r),started:new Promise(r=>enter=r),enter:()=>enter()};
  held=h;return{started:h.started,release};
}
const fixtures=[];
async function fixture(){
  const bytes=await fs.readFile(new URL('.'+cfg.url,base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),cfg.sha256);
  const parsed=await new GLTFLoader().parseAsync(bufferOf(bytes),'');
  parsed.scene.updateMatrixWorld(true);
  const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:n=>parsed.scene.getObjectByName(n==='head'?'J_Bip_C_Head':n)}};
  const equipment=await createM1Equipment({vrm,avatarSha256:cfg.sha256,bodyType:'male'});
  const appearance=createCharacterAppearance({vrm,avatarSha256:cfg.sha256});
  const facialGeometry=createFacialGeometry({vrm,avatarSha256:cfg.sha256});
  const adapter=equipment.getAssetProfile().equipment;
  const actor={profile:{bodyType:'male',sha256:cfg.sha256},config:cfg,appearance,facialGeometry,
    getEquipmentRecipe:index=>Object.fromEntries(outfitSelection(cfg,index).roles.map(role=>[role,structuredClone(adapter.get(cfg.ids[role]).entry)]))};
  const controller={actor,outfit:0,outfitRevision:0,
    command(cmd){equipment.setOutfit(cmd.value);this.outfit=cmd.value;this.outfitRevision++;},
    prepareOutfit(value){const update=equipment.prepareOutfit(value),revision=this.outfitRevision;return{
      isCurrent:()=>this.outfitRevision===revision&&update.isCurrent(),
      commit:()=>{update.commit();this.outfit=value;this.outfitRevision++;},dispose:()=>update.dispose()};}};
  const visibleState=()=>{
    const face=facialGeometry.getState(),color=appearance.getState(),positions=[];
    vrm.scene.traverse(mesh=>{if(mesh.isMesh&&/_Face_/.test(mesh.material?.name))positions.push(createHash('sha256').update(mesh.geometry.attributes.position.array).digest('hex'));});
    return{mouth:face.mouthWidth,brow:face.browSample,nose:face.noseSample,eye:face.eyeSample,
      hair:color.hairStyle,hairColor:color.hairColor,skin:color.skinTone,eyeColor:color.eyeColor,lip:color.lipColor,
      outfit:controller.outfit,visible:Object.values(cfg.ids).filter(id=>adapter.get(id)?.container.visible),positions};
  };
  const snapshot=()=>({recipe:captureAppearanceRecipe(controller),visible:visibleState()});
  const f={actor,controller,equipment,adapter,vrm,snapshot,visibleState};fixtures.push(f);return f;
}
function candidate(f){
  const r=captureAppearanceRecipe(f.controller);
  r.geometry.mouthWidth=.04;r.geometry.recipeSha256='f408850636e142aa2bc2cf40f94b23b02b4f074fc366de3273a022d2f606c1cc3';
  r.appearance.hairStyle=entry.id;r.appearance.hairColor='black';
  r.hairAssetSha256=entry.assetSha256;r.hairFit=hairFitIdentity(entry);
  r.equipment.index=2;r.equipment.role=cfg.outfits.find(o=>o.index===2).role;r.equipment.resources=f.actor.getEquipmentRecipe(2);
  return r;
}
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});};
// The canvas fixture checks texture ownership and reference changes only.
// Browser QA still checks authored mask pixels and actual PNG decoding.
function installCanvasFixture(){
  globalThis.document={createElement(){
    const canvas={width:0,height:0,data:null};
    const context={
      drawImage(image){canvas.data=image.data?new Uint8ClampedArray(image.data):new Uint8ClampedArray(canvas.width*canvas.height*4).fill(192);},
      getImageData(){return{data:new Uint8ClampedArray(canvas.data)};},
      putImageData(pixels){canvas.data=new Uint8ClampedArray(pixels.data);},
      clearRect(){canvas.data=new Uint8ClampedArray(canvas.width*canvas.height*4);},
    };
    canvas.getContext=()=>context;return canvas;
  }};
  globalThis.createImageBitmap=async blob=>{
    const bytes=new DataView(await blob.arrayBuffer());
    return{width:bytes.getUint32(16),height:bytes.getUint32(20),close(){}};
  };
}
try{
  // Derive the authored mouth recipe identity through the actual face loader.
  const identity=await fixture();await identity.actor.facialGeometry.set({mouthWidth:.04});
  const mouthSha=identity.actor.facialGeometry.getState().recipeSha256;
  const target=f=>{const record=candidate(f);record.geometry.recipeSha256=mouthSha;return record;};
  await check('actual delayed hair preparation retains complete prior look',async()=>{
    const f=await fixture(),before=f.snapshot(),r=candidate(f);r.geometry.recipeSha256=mouthSha;
    const gate=hold(entry.manifestUrl),job=applyAppearanceRecipe(f.controller,r);
    await gate.started;
    const during={face:f.actor.facialGeometry.getState().mouthWidth,hair:f.actor.appearance.getState().hairStyle,outfit:f.controller.outfit};
    gate.release();const result=await job;
    await fs.writeFile(path.join(out,'during.json'),JSON.stringify({during,result},null,2));
    assert.equal(during.face,expectBug?.04:before.recipe.geometry.mouthWidth);
    assert.equal(during.hair,before.recipe.appearance.hairStyle);assert.equal(during.outfit,before.recipe.equipment.index);
    assert(result.applied);assert.equal(f.actor.facialGeometry.getState().mouthWidth,.04);assert.equal(f.controller.outfit,2);
  });
  if(!expectBug){
    await check('standalone pending hair and newer color retain both intents',async()=>{
      const f=await fixture(),gate=hold(entry.manifestUrl),pending=f.actor.appearance.set({hairStyle:entry.id,hairColor:'brown'});
      await gate.started;await f.actor.appearance.set({hairColor:'black'});
      assert(f.actor.appearance.getState().loading);gate.release();await pending;
      assert.equal(f.actor.appearance.getState().hairStyle,entry.id);assert.equal(f.actor.appearance.getState().hairColor,'black');
      assert(!f.actor.appearance.getState().loading);
    });
    await check('prepared palette color cannot rewrite an already visible cached texture',async()=>{
      installCanvasFixture();
      const manifest=JSON.parse(await fs.readFile(new URL('.'+FACIAL_PALETTE_MANIFEST_URL,base)));
      const variant=manifest.variants.find(v=>v.avatarSha256===cfg.sha256),scene=new THREE.Group(),materials=[];
      for(const descriptor of Object.values(variant.parts)){
        const [width,height]=descriptor.mapSize,map=new THREE.Texture({width,height,data:new Uint8Array(width*height*4).fill(160)});map.flipY=false;
        const material=new THREE.MeshBasicMaterial({map});material.name=descriptor.materialName;materials.push(material);
        scene.add(new THREE.Mesh(new THREE.BufferGeometry(),material));
      }
      const palette=createFacialPalette({vrm:{scene},avatarSha256:cfg.sha256});
      assert((await palette.set({eyeColor:'blue'})).applied);
      const blue=materials[0].map,bytes=Buffer.from(blue.image.data);
      const prepared=await palette.prepareUpdate({eyeColor:'green'});
      assert.equal(materials[0].map,blue);assert.deepEqual(Buffer.from(blue.image.data),bytes);
      prepared.dispose();assert.equal(materials[0].map,blue);
      assert((await palette.set({eyeColor:'green'})).applied);assert.notEqual(materials[0].map,blue);assert.deepEqual(Buffer.from(blue.image.data),bytes);
      const textures=new Set([blue,materials[0].map]);let disposed=0;for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);
      palette.dispose();palette.dispose();assert.equal(disposed,textures.size);
    });
    await check('uncommitted whole palette intent cannot leak into newer hair-only selection',async()=>{
      const f=await fixture(),record=target(f);record.appearance.eyeColor='blue';
      const gate=hold(FACIAL_PALETTE_MANIFEST_URL),pending=applyAppearanceRecipe(f.controller,record);await gate.started;
      await f.actor.appearance.set({hairColor:'blonde'});gate.release();assert((await pending).cancelled);
      assert.equal(f.actor.appearance.getState().eyeColor,'original');assert.equal(f.actor.appearance.getState().hairColor,'blonde');
    });
    for(const resource of ['hair','palette'])await check(resource+' actual preparation failure preserves old look and releases staged face',async()=>{
      const f=await fixture(),before=f.visibleState(),record=target(f),clones=[];
      const clone=THREE.BufferGeometry.prototype.clone;
      THREE.BufferGeometry.prototype.clone=function(){const g=clone.call(this),row={g,disposed:0};g.addEventListener('dispose',()=>row.disposed++);clones.push(row);return g;};
      if(resource==='palette')record.appearance.eyeColor='blue';
      failPath=resource==='hair'?entry.manifestUrl:FACIAL_PALETTE_MANIFEST_URL;
      try{await assert.rejects(applyAppearanceRecipe(f.controller,record),/先前外观已保留/);}
      finally{failPath=null;THREE.BufferGeometry.prototype.clone=clone;}
      assert.deepEqual(f.visibleState(),before);assert(clones.length>0);assert(clones.every(row=>row.disposed===1));
      record.appearance.eyeColor='original';assert((await applyAppearanceRecipe(f.controller,record)).applied);
    });
    await check('equipment preparation failure cannot expose staged face or hair',async()=>{
      const f=await fixture(),before=f.visibleState(),prepare=f.controller.prepareOutfit;
      f.controller.prepareOutfit=()=>{throw Error('injected equipment allocation failure');};
      await assert.rejects(applyAppearanceRecipe(f.controller,target(f)),/equipment allocation/);
      assert.deepEqual(f.visibleState(),before);f.controller.prepareOutfit=prepare;
      assert((await applyAppearanceRecipe(f.controller,target(f))).applied);
    });
    for(const domain of ['color','geometry','outfit','recipe','actor','dispose'])await check('newer '+domain+' cancels old whole request without overwriting its choice',async()=>{
      const f=await fixture(),record=target(f),before=f.visibleState(),gate=hold(entry.manifestUrl);
      const pending=applyAppearanceRecipe(f.controller,record);await gate.started;
      assert.deepEqual(f.visibleState(),before);
      if(domain==='color')await f.actor.appearance.set({hairColor:'blonde'});
      if(domain==='geometry')await f.actor.facialGeometry.set({mouthWidth:-.04});
      if(domain==='outfit')f.controller.command({type:'outfit',value:4});
      if(domain==='recipe'){
        const newer=structuredClone(record);newer.geometry.mouthWidth=-.04;
        newer.appearance.hairStyle='original';newer.hairAssetSha256=null;newer.hairFit=null;
        assert((await applyAppearanceRecipe(f.controller,newer)).applied);
      }
      if(domain==='actor')f.controller.actor=(await fixture()).actor;
      if(domain==='dispose'){f.actor.facialGeometry.dispose();f.actor.appearance.dispose();f.equipment.dispose();}
      const latest=f.visibleState();gate.release();assert((await pending).cancelled);
      assert.deepEqual(f.visibleState(),latest);
    });
    await check('prepared face owns clones until commit or explicit cancellation',async()=>{
      const f=await fixture(),before=f.visibleState(),update=await f.actor.facialGeometry.prepareUpdate({mouthWidth:.04});
      assert(update.isCurrent());assert.deepEqual(f.visibleState(),before);
      update.dispose();update.dispose();assert(!update.isCurrent());assert.deepEqual(f.visibleState(),before);
      const stale=await f.actor.facialGeometry.prepareUpdate({mouthWidth:.04});
      await f.actor.facialGeometry.set({mouthWidth:-.04});assert(!stale.isCurrent());
      assert.throws(()=>stale.commit(),/过期/);stale.dispose();assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);
    });
    await check('caller mutation cannot change in-flight recipe',async()=>{
      const f=await fixture(),record=target(f),gate=hold(entry.manifestUrl),pending=applyAppearanceRecipe(f.controller,record);
      await gate.started;record.appearance.hairColor='blonde';record.equipment.index=0;
      gate.release();assert((await pending).applied);assert.equal(f.controller.outfit,2);assert.equal(f.actor.appearance.getState().hairColor,'black');
    });
    await check('button refresh failure reports committed result',async()=>{
      const f=await fixture();f.controller.refreshOutfitSelection=()=>{throw Error('injected UI failure');};
      const result=await applyAppearanceRecipe(f.controller,target(f));
      assert(result.applied);assert.match(result.notice,/按钮更新失败/);assert.equal(f.controller.outfit,2);
    });
    await check('new color between prepare continuations cannot be adopted as old request revision',async()=>{
      const f=await fixture(),prepare=f.actor.facialGeometry.prepareUpdate;let newer;
      f.actor.facialGeometry.prepareUpdate=async input=>{
        const update=await prepare(input);
        return new Promise(resolve=>setImmediate(()=>{resolve(update);queueMicrotask(()=>{newer=f.actor.appearance.set({hairColor:'blonde'});});}));
      };
      const result=await applyAppearanceRecipe(f.controller,target(f));await newer;
      assert(result.cancelled);assert.equal(f.actor.appearance.getState().hairColor,'blonde');
      assert.equal(f.actor.facialGeometry.getState().mouthWidth,0);assert.equal(f.controller.outfit,0);
    });
    await check('old geometry dispose event runs after complete commit and cleanup failure is reported',async()=>{
      const f=await fixture();await f.actor.facialGeometry.set({mouthWidth:.04});
      const current=new Set();f.vrm.scene.traverse(mesh=>{if(mesh.isMesh&&/_Face_/.test(mesh.material?.name))current.add(mesh.geometry);});
      const states=[];
      for(const geometry of current)geometry.addEventListener('dispose',()=>{
        states.push(f.visibleState());throw Error('injected old geometry cleanup listener failure');
      });
      const record=target(f);record.geometry.mouthWidth=-.04;
      const result=await applyAppearanceRecipe(f.controller,record);
      assert(result.applied);assert.match(result.notice,/旧资源清理失败/);assert(states.length>0);
      for(const state of states){assert.equal(state.mouth,-.04);assert.equal(state.hair,entry.id);assert.equal(state.outfit,2);}
      assert.equal(f.actor.facialGeometry.getState().mouthWidth,-.04);
    });
  }
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({expectBug,checks,scope:'CPU actual geometry/hair/equipment resources; image decoder returns null textures; no rendering or GPU evidence'},null,2));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack},null,2));throw error;}
finally{for(const f of fixtures){f.actor.facialGeometry.dispose();f.actor.appearance.dispose();f.equipment.dispose();}globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
console.log(JSON.stringify({checks:checks.length,out,expectBug}));
