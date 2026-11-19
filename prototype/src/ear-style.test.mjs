import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import test from 'node:test';
import catalog from './ear-style-catalog.json' with {type:'json'};
import {accessorySelection,queryAccessoryCandidates,validateAccessories} from './accessory-recipe.js';
const hook=registerHooks({load(url,context,next){
  return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
}});
const {THREE}=await import('../../scripts/headless-avatar-node.mjs');
const {createRigidAccessoryLayer}=await import('./rigid-accessory-layer.js');
const {performCharacterProduction}=await import('./character-production.js');
const {prepareRecordedCharacter}=await import('./character-record-consumer.js');
const {restoreRuntimeCharacterRecord}=await import('./character-runtime-record.js');
test.after(()=>hook.deregister());
const old=catalog.styles.find(s=>s.styleId==='compact-gold-stud-v1');
const next=catalog.styles.find(s=>s.styleId==='round-gold-stud-3mm-v1');
const style={styleId:next.styleId,version:next.version};
const file=relative=>new URL(relative,import.meta.url);
const read=async relative=>JSON.parse(await readFile(file(relative)));
const mounted=root=>{
  const items=[];root.traverseVisible(n=>{if(n.isMesh && n.userData.rigidAccessoryId)items.push(n);});
  return items;
};

test('old v8 ear pins round trip, exact body and registered style identify each new fit',async()=>{
  for(const body of ['female','male']){
    const historic=await read('../../evidence/m2-accessory-record-room-785-v1/'+body+'-v8.json');
    const sha=historic.base.sha256;
    assert.deepEqual(accessorySelection(sha,'ears',historic.accessories.ears.selection),historic.accessories.ears);
    assert(validateAccessories(sha,historic.accessories));
    const choices=queryAccessoryCandidates(sha).ears.choices;
    assert.equal(choices.filter(c=>c.selection==='none').length,1);
    const byStyle=choices.filter(c=>c.resource?.styleId===style.styleId);
    assert.deepEqual(byStyle.map(c=>c.selection),['left','right','pair']);
    const [target]=byStyle;
    assert.equal(target.resource.fitId,next.fits.find(f=>f.bodySha256===sha).fitId);
    const wrong={...target,resource:{...target.resource,fitSha256:next.fits.find(f=>f.bodySha256!==sha).fitSha256}};
    assert.throws(()=>validateAccessories(sha,{...historic.accessories,ears:wrong}),/版本不匹配/);
    assert.throws(()=>accessorySelection(sha,'ears','pair',{...style,version:99}),/未登记/);
  }
  assert.deepEqual(queryAccessoryCandidates('a'.repeat(64)).ears.choices,[{selection:'none',resource:null}]);
});

test('multi-style ear transactions retain and roll back the actual group, cancel superseded swaps and retry changed bytes',async t=>{
  const scene=new THREE.Group(),head=new THREE.Bone();head.name='J_Bip_C_Head';scene.add(head);
  const layer=createRigidAccessoryLayer({vrm:{scene,humanoid:{getRawBoneNode:()=>head}},
    avatarSha256:next.fits[0].bodySha256,manifestSha256:old.manifestSha256});
  t.after(()=>layer.dispose());
  await layer.setSelection('pair');
  const original=mounted(head);assert.equal(original.length,2);
  const rawFetch=globalThis.fetch;let mode='broken',unblock,began;
  let started=new Promise(resolve=>{began=resolve;});
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    if(String(url).endsWith('/m2-ear-stud-3mm-v1/stud.glb')){
      if(mode==='broken')return new Response(new Uint8Array([0]));
      if(mode==='delay'){began();await new Promise(resolve=>{unblock=resolve;});}
    }
    return rawFetch(url,opts);
  });
  await assert.rejects(layer.setSelection('pair',style),/asset integrity/);
  assert.deepEqual(mounted(head),original);assert.equal(layer.getState().styleId,old.styleId);
  mode='delay';
  const stale=layer.setSelection('pair',style);await started;
  const switched=await layer.setSelection('left');assert(switched.applied);unblock();
  assert.equal((await stale).applied,false);assert.equal(layer.getState().styleId,old.styleId);
  const left=mounted(head);assert.equal(left.length,1);
  mode='ok';
  const change=await layer.prepareUpdate('left',style);assert.deepEqual(mounted(head),left);
  assert(change.commit().applied);assert.equal(layer.getState().styleId,style.styleId);
  assert.notEqual(mounted(head)[0].geometry,left[0].geometry);
  change.rollback();change.dispose();assert.deepEqual(mounted(head),left);assert.equal(layer.getState().styleId,old.styleId);
  await layer.setSelection('pair',style);const [l,r]=mounted(head);
  assert.equal(l.geometry,r.geometry);assert.notEqual(l.material,r.material);
  let oldDisposed=0,newDisposed=0;
  original[0].geometry.addEventListener('dispose',()=>oldDisposed++);
  l.geometry.addEventListener('dispose',()=>newDisposed++);
  await layer.setSelection('right',style);assert.deepEqual(mounted(head).map(n=>n.userData.side),['right']);
  await layer.setSelection('none');assert.deepEqual(mounted(head),[]);
  layer.dispose();layer.dispose();assert.equal(layer.getState().disposed,true);
  assert.equal(oldDisposed,1);assert.equal(newDisposed,1);
});

test('public D02 signs both exact bodies and ordinary record loading reconstructs their independent stud meshes',async t=>{
  const env={scene:new THREE.Scene(),renderer:{compileAsync(){throw Error('GPU unavailable');}}};
  const op={domain:'accessory',kind:'ears',selection:'pair',...style},actors=[];
  for(const bodyType of ['female','male']){
    const input={schema:'character-production-request-v1',operation:'create',bodyType,
      identity:{id:'ear-test-'+bodyType,name:bodyType,gender:bodyType},edits:[op]};
    const {record}=await performCharacterProduction(input,env);
    const slot=record.appearanceRecipe.accessories.ears;
    assert.deepEqual(slot,accessorySelection(record.appearanceRecipe.base.sha256,'ears','pair',style));
    const instance=await prepareRecordedCharacter(record,env);t.after(()=>instance.dispose());instance.attach();
    assert.deepEqual((await instance.capture()).appearanceRecipe.accessories.ears,slot);
    assert.deepEqual(mounted(instance.avatar.root).map(n=>n.userData.styleId),[style.styleId,style.styleId]);
    actors.push(instance);
  }
  const peer=mounted(actors[1].avatar.root);
  assert.notEqual(mounted(actors[0].avatar.root)[0].geometry,peer[0].geometry);
  const a=actors[0], initial=mounted(a.avatar.root);
  const {record:legacy}=await performCharacterProduction({schema:'character-production-request-v1',operation:'edit',
    record:await a.capture(),edits:[{domain:'accessory',kind:'ears',selection:'pair'}]},env);
  assert.equal(legacy.appearanceRecipe.accessories.ears.resource.manifestSha256,old.manifestSha256);
  const prepareHat=a.avatar.headwear.prepareUpdate.bind(a.avatar.headwear);
  const failure=t.mock.method(a.avatar.headwear,'prepareUpdate',async(...args)=>{
    const tx=await prepareHat(...args);
    return {...tx,commit(){throw Error('test: subsequent hat commit failed');}};
  });
  await assert.rejects(restoreRuntimeCharacterRecord(a.controller,legacy),/subsequent hat commit failed/);
  failure.mock.restore();
  assert.deepEqual(mounted(a.avatar.root),initial);
  assert.equal((await a.capture()).appearanceRecipe.accessories.ears.resource.manifestSha256,next.manifestSha256);
  assert((await restoreRuntimeCharacterRecord(a.controller,legacy)).applied);
  assert.deepEqual(mounted(a.avatar.root).map(n=>n.userData.styleId),[old.styleId,old.styleId]);
  actors[0].dispose();assert.deepEqual(mounted(actors[1].avatar.root),peer);
  await assert.rejects(performCharacterProduction({schema:'character-production-request-v1',operation:'edit',
    record:await actors[1].capture(),edits:[{...op,version:2}]},env),error=>error.code==='production-input' && error.field==='accessory');
});
