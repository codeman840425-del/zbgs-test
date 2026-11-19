import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {lipAnchorSourceIdentity,validateLipAnchorDescriptor} from './lip-anchor.js';

const root=new URL('../../',import.meta.url);
for(const name of ['uniform-lite-female','uniform-lite-male','native-contour-roundness-a-v1','native-contour-cheek-b-v1']){
  test('native source and expression bind match the published '+name+' rim',async()=>{
    const anchor=JSON.parse(await readFile(new URL('evidence/m2-lip-anchor-intake-v1/'+name+'.json',root)));
    const bytes=await readFile(new URL(anchor.source.path,root)),end=20+bytes.readUInt32LE(12);
    const identity=lipAnchorSourceIdentity(JSON.parse(bytes.subarray(20,end)));
    const verify=data=>validateLipAnchorDescriptor(data,anchor.bodySha256,identity);
    assert.deepEqual(await verify({...anchor,source:{...anchor.source,path:'renamed.vrm'}}),anchor.rimVertexIds);
    await assert.rejects(verify({...anchor,bodySha256:'0'.repeat(64)}),/body-mismatch/);
    await assert.rejects(verify({...anchor,rimVertexIdsSha256:'0'.repeat(64)}),/indices-invalid/);
    await assert.rejects(verify({...anchor,rimVertexIds:[...anchor.rimVertexIds.slice(1),identity.count]}),/indices-invalid/);
    await assert.rejects(verify({...anchor,faceMouth:{...anchor.faceMouth,primitive:1000}}),/binding-mismatch/);
    await assert.rejects(verify({...anchor,source:{...anchor.source,bind:{...anchor.source.bind,index:0}}}),/binding-mismatch/);
  });
}

test('registered vertices follow the evaluated game mesh on all four bodies',async t=>{
  const hook=registerHooks({load(url,ctx,next){return next(url,url.endsWith('.json')?{...ctx,importAttributes:{type:'json'}}:ctx);}});
  t.after(()=>hook.deregister());
  const {loadGeometryAvatar}=await import('../../scripts/headless-avatar-node.mjs');
  globalThis.createImageBitmap=async blob=>{
    const bytes=Buffer.from(await blob.slice(0,24).arrayBuffer());
    const png=bytes.length===24 && bytes.readUInt32BE(0)===0x89504e47;
    return {width:png?bytes.readUInt32BE(16):1,height:png?bytes.readUInt32BE(20):1,close(){}};
  };
  const {registeredVocalPerformer,vocalPerformer}=await import('./facility-vocal.js');
  for(const body of ['source-female-uniform-texture-v1','source-male-cc0-texture-release-v1','native-contour-roundness-a-v1','native-contour-cheek-b-v1']){
    const {avatar}=await loadGeometryAvatar(body);
    try{
      const stored=await registeredVocalPerformer(avatar,new AbortController().signal),geometry=vocalPerformer(avatar);
      assert.deepEqual(stored.lipAnchor,{source:'descriptor',method:'posed-rim-vertices',descriptorSha256:avatar.config.lipAnchor.sha256});
      assert.equal(geometry.lipAnchor.source,'geometry');
      const neutral=stored.mouth();
      avatar.vrm.expressionManager.setValue('aa',1);
      avatar.vrm.humanoid.getNormalizedBoneNode('head').rotateY(.4);avatar.vrm.update(0);avatar.root.updateMatrixWorld(true);
      assert.ok(stored.mouth().distanceTo(neutral)>.001);
      assert.ok(stored.mouth().distanceTo(geometry.mouth())<1e-6);
    }finally{avatar.dispose();}
  }
});
