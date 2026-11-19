import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {Scene} from 'three';
import {HAIRSTYLES} from './hairstyle-catalog.js';
import {hairFitIdentity} from './hair-fit-contract.js';
import {captureAppearanceRecipe,applyAppearanceRecipe} from './appearance-recipe.js';
import {captureLiveAccessories} from './live-accessory-record.js';
import {assertGlassesHeadDependency} from './glasses-head-dependency.js';
import {createAccessoryTransactionContext} from './accessory-transaction-context.js';

const json=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);}});
const {loadFoundationAvatar}=await import('./foundation-avatar.js');
json.deregister();

const dependency={hairStyle:'original',faceGeometry:'neutral'};
const geometry={mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none'};
test('declared head geometry is exact and independent of colour; historical fits are unrestricted',()=>{
  const original={hairStyle:'original',hairColor:'blonde',eyeColor:'blue'};
  assertGlassesHeadDependency(dependency,original,geometry);
  for(const [key,value] of Object.entries({mouthWidth:.04,browSample:'raised',noseSample:'small',eyeSample:'up'})){
    assert.throws(()=>assertGlassesHeadDependency(dependency,original,{...geometry,[key]:value}),{code:'glasses-head-incompatible'});
  }
  assert.throws(()=>assertGlassesHeadDependency(dependency,{hairStyle:'bob'},geometry),{code:'glasses-head-incompatible'});
  assert.throws(()=>assertGlassesHeadDependency({...dependency,unknown:true},original,geometry),{code:'glasses-head-dependency-invalid'});
  assert.throws(()=>assertGlassesHeadDependency(null,original,geometry),{code:'glasses-head-dependency-invalid'});
  assertGlassesHeadDependency(undefined,{hairStyle:'bob'},{mouthWidth:.04});
});

test('uniform bob and glasses use real fit bytes, head guards and the whole-look transaction',async t=>{
  const origin='http://localhost/';
  const publicDir=new URL('../public/',import.meta.url);
  const nativeFetch=globalThis.fetch;
  let hold;
  globalThis.self=globalThis;
  globalThis.location=new URL('?glassesFit=candidate',origin);
  globalThis.window={location};
  // Decode dimensions only. The runtime still hashes and parses the source VRM,
  // hair, outfit and glasses bytes. This test neither renders nor signs a look.
  globalThis.createImageBitmap=async blob=>{
    const data=new DataView(await blob.arrayBuffer());
    return {width:data.getUint32(16),height:data.getUint32(20),close(){}};
  };
  globalThis.fetch=async(resource,options)=>{
    const url=new URL(resource,origin);
    if(url.protocol==='blob:')return nativeFetch(resource,options);
    assert.equal(url.origin,new URL(origin).origin);
    if(hold?.path===url.pathname){const gate=hold;hold=null;gate.enter.resolve();await gate.leave.promise;}
    return new Response(await readFile(new URL('.'+url.pathname,publicDir)));
  };
  t.after(()=>{globalThis.fetch=nativeFetch;delete globalThis.createImageBitmap;delete globalThis.self;delete globalThis.window;delete globalThis.location;});
  const actor=await loadFoundationAvatar({bodyType:'source-female-uniform-texture-v1',scene:new Scene(),renderer:{}});
  t.after(()=>actor.dispose());
  const controller={actor,outfit:0,prepareOutfit:n=>actor.prepareOutfit(n)};
  const live=actor.livePresentation,original=captureAppearanceRecipe(controller),off=captureLiveAccessories(actor);
  const bobEntry=HAIRSTYLES.find(entry=>entry.compatibleBodies.includes(actor.profile.sha256));
  assert.ok(bobEntry);
  const bob=structuredClone(original);
  bob.appearance.hairStyle=bobEntry.id;bob.hairFit=hairFitIdentity(bobEntry);bob.hairAssetSha256=bobEntry.assetSha256;
  const wearing=()=>live.getState().accessories.glasses.loaded;
  const style=()=>actor.appearance.getState().hairStyle;
  const selectBob=()=>actor.appearance.set({hairStyle:bobEntry.id});

  const gate={path:'/assets/m1c/studio-glasses-v1.glb',enter:Promise.withResolvers(),leave:Promise.withResolvers()};
  hold=gate;const mounting=live.setAccessory('glasses',true);
  await gate.enter.promise;
  const pendingConflict=await selectBob();
  assert.equal(pendingConflict.applied,false);assert.match(pendingConflict.reason,/原发/);
  gate.leave.resolve();assert.ok((await mounting).applied);
  assert.equal(style(),'original');assert.equal(wearing(),true);
  await assert.rejects(()=>applyAppearanceRecipe(controller,bob),/原发/);
  assert.equal(style(),'original');assert.equal(wearing(),true);
  assert.ok((await actor.appearance.set({hairStyle:'original'})).applied);
  // An actual mounted fit retains its declaration even if preview mode changes.
  location.search='';assert.match((await selectBob()).reason,/原发/);location.search='?glassesFit=candidate';
  const removal=await live.prepareAccessory('glasses',false);
  assert.match((await selectBob()).reason,/原发/);
  removal.release();
  // Preparing against a target that says "off" cannot itself remove the
  // mounted dependency. Visible commit still reads the actual live slot.
  const incomplete=createAccessoryTransactionContext(actor,bob.accessories,{enabled:false,appearance:bob.appearance,geometry:bob.geometry});
  const unpaired=await actor.appearance.prepareUpdate(bob.appearance,{accessoryTransaction:incomplete.token});
  try{
    assert.ok(unpaired.commit);incomplete.beginCommit();
    assert.throws(()=>unpaired.commit(),/原发/);
  }finally{unpaired.dispose();incomplete.close();}
  assert.ok((await applyAppearanceRecipe(controller,bob,{liveAccessories:off})).applied);
  assert.equal(style(),bobEntry.id);assert.equal(wearing(),false);
  await assert.rejects(()=>live.setAccessory('glasses',true),/原发/);
  assert.equal(wearing(),false);
  assert.ok((await applyAppearanceRecipe(controller,original)).applied);

  // A bob prepared before a newer equip also rechecks before visible commit.
  const staged=await actor.appearance.prepareUpdate({hairStyle:bobEntry.id});
  assert.ok(staged.commit);
  assert.ok((await live.setAccessory('glasses',true)).applied);
  try{assert.throws(()=>staged.commit(),/原发/);}finally{staged.dispose();}
  assert.equal(style(),'original');assert.equal(wearing(),true);

  // A failure after the ordered removal and hair switch restores both.
  const prepare=controller.prepareOutfit;
  controller.prepareOutfit=async n=>{
    const update=await prepare(n);
    return {...update,commit(){throw Error('injected outfit failure');}};
  };
  await assert.rejects(()=>applyAppearanceRecipe(controller,bob,{liveAccessories:off}),/injected outfit failure/);
  assert.equal(style(),'original');assert.equal(wearing(),true);
  controller.prepareOutfit=prepare;
  assert.ok((await applyAppearanceRecipe(controller,bob,{liveAccessories:off})).applied);
  assert.equal(style(),bobEntry.id);assert.equal(wearing(),false);
});
