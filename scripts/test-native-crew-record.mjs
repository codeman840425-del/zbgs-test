import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import test from 'node:test';

test('signed native 7586 record restores its original outfit and mask before and after the diagnostic socks', async () => {
  const hook = registerHooks({load(url, context, next) {
    return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
  }});
  try {
    const {THREE} = await import('./headless-avatar-node.mjs');
    // Native coverage checks actual bitmap dimensions. This CPU fixture reads
    // the PNG header; the browser is responsible for visual acceptance.
    globalThis.createImageBitmap = async blob => {
      const bytes = Buffer.from(await blob.arrayBuffer());
      return {width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20), close(){}};
    };
    const {performCharacterProduction} = await import('../prototype/src/character-production.js');
    const {canonicalJson} = await import('../prototype/src/character-record.js');
    const {prepareRecordedCharacter} = await import('../prototype/src/character-record-consumer.js');
    const {queryAppearanceCandidates} = await import('../prototype/src/appearance-candidates.js');
    const old = JSON.parse(await readFile(new URL('../evidence/m2-character-runtime-fixed-v1/records/native-male-7586-v1-record-a.json', import.meta.url)));
    const env = {scene:new THREE.Scene(), renderer:{}};
    const mask = '15ab2ecee54e10bfdb84a38be10e41fa7c7658e9a9f77b8293c2fd27569d7136';
    const legacy = await prepareRecordedCharacter(old, env);
    let selection;
    try {
      assert.equal(legacy.recordSha256, '4b4929c39f49cb45be0ab4cc1d825433b53442b24d19e9f59552212d274b075d');
      assert.equal(legacy.avatar.config.bodyTextureCoverage.sha256, 'c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143');
      const captured = await legacy.capture();
      assert.equal(canonicalJson(captured.appearanceRecipe), canonicalJson(old.appearanceRecipe));
      assert.equal(canonicalJson(captured.liveAccessories), canonicalJson(old.liveAccessories));
      for (const ref of old.resourceIdentities) {
        assert.deepEqual(captured.resourceIdentities.find(item => item.id === ref.id),ref);
      }
      const state = legacy.avatar.getOutfitInfo().equipment;
      assert.equal(state.bodyTextureCoverage.maskedPngSha256, mask);
      assert.equal(state.items.socks.loaded, false);
      const query = queryAppearanceCandidates(legacy.controller);
      assert.deepEqual(query.equipment.sets.map(row=>row.role), ['shorts','shorts-socks']);
      const look = query.equipment.sets[1];
      selection = {bodySha256:query.base.sha256, role:look.role,
        equipment:Object.values(look.resources).map(({id,slot,sha256})=>({id,slot,sha256}))};
    } finally { legacy.dispose(); }
    const request = (record,edit) => ({schema:'character-production-request-v1',operation:'edit',record,edits:[edit]});
    const {record} = await performCharacterProduction(request(old,{domain:'outfit',selection}),env);
    assert.equal(record.revision,old.revision+1);
    assert.equal(record.appearanceRecipe.equipment.manifestUrl, old.appearanceRecipe.equipment.manifestUrl);
    const actor = await prepareRecordedCharacter(record,env);
    try {
      const state = actor.avatar.getOutfitInfo().equipment;
      assert.equal(state.items.socks.visible,true);
      assert.equal(state.items.socks.joints,6);
      assert.equal(state.bodyTextureCoverage.covered,true);
      assert.equal(state.bodyTextureCoverage.maskedPngSha256,mask);
      assert.equal(state.bodyTextureCoverage.activeIds.length,4);
      const captured = await actor.capture();
      assert.deepEqual(captured.appearanceRecipe,record.appearanceRecipe);
      assert.deepEqual(captured.resourceIdentities,record.resourceIdentities);
      actor.avatar.setDebugBody(true);
      assert.equal(actor.avatar.getOutfitInfo().equipment.bodyTextureCoverage.covered,false);
      actor.avatar.setDebugBody(false);
      assert.equal(actor.avatar.getOutfitInfo().equipment.items.socks.visible,true);
    } finally { actor.dispose(); }
    const restored = await performCharacterProduction(request(record,{domain:'outfit',index:0}),env);
    assert.equal(canonicalJson(restored.record.appearanceRecipe),canonicalJson(old.appearanceRecipe));
    assert.equal(canonicalJson(restored.record.liveAccessories),canonicalJson(old.liveAccessories));
    await assert.rejects(performCharacterProduction(request(old,{domain:'outfit',selection:{...selection,role:'pants-socks'}}),env),
      {code:'production-input',field:'outfit.selection',editIndex:0});
    assert.equal(env.scene.children.length,0);
  } finally { hook.deregister(); }
});
