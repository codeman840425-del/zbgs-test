import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {canonicalJson, sha256Hex, updateCharacterRecord} from './character-record.js';
import {createNativeHairCenterPin} from './native-hair-center-record.js';

// Vite accepts legacy JSON imports without an attribute. Keep that support
// local to this CPU test so both loaders run the same production modules.
const jsonHook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes: {type: 'json'}} : context);
}});
const {THREE} = await import('../../scripts/headless-avatar-node.mjs');
const {loadFoundationAvatar} = await import('./foundation-avatar.js');
const {createRecordAppearanceController, prepareRecordedCharacter} = await import('./character-record-consumer.js');
const {captureRuntimeCharacterRecord, deriveCharacterResourceIdentities} = await import('./character-runtime-record.js');
const {performCharacterProduction} = await import('./character-production.js');
test.after(() => jsonHook.deregister());

function upperChestJoints(avatar) {
  const upperChest = avatar.vrm.humanoid.getRawBoneNode('upperChest');
  return [...avatar.vrm.springBoneManager.joints].filter(joint => joint.center === upperChest);
}

test('complete records load their own native hair centers and a failed candidate preserves the attached actor', async t => {
  const bodyType = 'native-contour-roundness-a-v1';
  const scene = new THREE.Scene();
  const renderer = {compileAsync() { throw Error('Unexpected GPU compilation in CPU regression'); }};
  const ambientSearch = globalThis.location.search;
  t.after(() => { globalThis.location.search = ambientSearch; });
  const placeholderBitmap = globalThis.createImageBitmap;
  // The native Body coverage loader validates the dimensions of its PNGs.
  // Use their real IHDR information without decoding pixels on Node.
  t.mock.method(globalThis, 'createImageBitmap', async blob => {
    const header = new DataView(await blob.slice(0, 24).arrayBuffer());
    if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47) return placeholderBitmap(blob);
    return {width: header.getUint32(16), height: header.getUint32(20), close() {}};
  });

  const source = await loadFoundationAvatar({scene, renderer, bodyType, attachToScene: false, nativeHairCenter: null});
  let legacyRecord;
  try {
    legacyRecord = await captureRuntimeCharacterRecord(createRecordAppearanceController(source), {
      identity: {id: 'native-center-test', name: 'Native center test', gender: 'female'},
    });
  } finally {
    source.dispose();
  }
  const pin = createNativeHairCenterPin(bodyType, legacyRecord.appearanceRecipe.base.sha256);
  const {appearanceRecipe, liveAccessories, equipmentMaterials} = legacyRecord;
  const fittedRecord = await updateCharacterRecord(legacyRecord, {
    nativeHairCenter: pin,
    resourceIdentities: deriveCharacterResourceIdentities(appearanceRecipe, liveAccessories, equipmentMaterials, pin),
  }, {}, {validateResources: () => ({status: 'pending'})});

  globalThis.location.search = '?workbench=appearance&nativeHairCenter=' + pin.id;
  const previous = await prepareRecordedCharacter(legacyRecord, {scene, renderer});
  t.after(() => previous.dispose());
  previous.attach();
  assert.equal(previous.avatar.nativeHairCenterFit, null);
  assert.equal(previous.avatar.nativeHairCenter, undefined);
  const originalCenters = upperChestJoints(previous.avatar);
  globalThis.location.search = '';

  const wrongFit = structuredClone(fittedRecord);
  wrongFit.nativeHairCenter.fitSha256 = '0'.repeat(64);
  wrongFit.resourceIdentities = deriveCharacterResourceIdentities(appearanceRecipe, liveAccessories, equipmentMaterials, wrongFit.nativeHairCenter);
  delete wrongFit.integrity.recordSha256;
  wrongFit.integrity.recordSha256 = await sha256Hex(canonicalJson(wrongFit));
  await assert.rejects(prepareRecordedCharacter(wrongFit, {scene, renderer}), /native hair center/i);

  const readLocal = globalThis.fetch;
  const missingBody = t.mock.method(globalThis, 'fetch', (input, init) =>
    input === source.config.url ? Promise.resolve(new Response(null, {status: 404})) : readLocal(input, init));
  try {
    await assert.rejects(prepareRecordedCharacter(fittedRecord, {scene, renderer}), /Foundation HTTP 404/);
  } finally {
    missingBody.mock.restore();
  }
  assert.deepEqual(scene.children, [previous.avatar.root]);
  assert.deepEqual(upperChestJoints(previous.avatar), originalCenters);
  const previousSnapshot = await previous.capture();
  assert.ok(!Object.hasOwn(previousSnapshot, 'nativeHairCenter'));
  assert.deepEqual(previousSnapshot.resourceIdentities, legacyRecord.resourceIdentities);

  const fitted = await prepareRecordedCharacter(fittedRecord, {scene, renderer});
  t.after(() => fitted.dispose());
  assert.deepEqual(scene.children, [previous.avatar.root]);
  assert.equal(fitted.avatar.nativeHairCenterFit, pin.id);
  assert.deepEqual(fitted.avatar.nativeHairCenter, pin);
  assert.ok(Object.isFrozen(fitted.avatar.nativeHairCenter));
  assert.equal(upperChestJoints(fitted.avatar).length - originalCenters.length, 36);
  fitted.attach();
  fitted.update(1 / 60, {action: 'walk'});
  const saved = await fitted.capture();
  assert.deepEqual(saved.nativeHairCenter, pin);
  assert.deepEqual(saved.resourceIdentities, fittedRecord.resourceIdentities);
  fitted.dispose();

  const reloaded = await prepareRecordedCharacter(JSON.parse(JSON.stringify(saved)), {scene, renderer});
  t.after(() => reloaded.dispose());
  assert.equal(reloaded.recordSha256, saved.integrity.recordSha256);
  assert.deepEqual(reloaded.avatar.nativeHairCenter, pin);
  assert.equal(upperChestJoints(reloaded.avatar).length - originalCenters.length, 36);
  assert.deepEqual(scene.children, [previous.avatar.root]);
});

test('a selected-only cold record uses actual alternate geometry and coverage and preserves the attached original on failure', async t => {
  const scene = new THREE.Scene();
  const renderer = {compileAsync() { throw Error('Unexpected GPU compilation in CPU regression'); }};
  const environment = {scene, renderer};
  const source = await loadFoundationAvatar({...environment, bodyType: 'female'});
  t.after(() => source.dispose());
  const sourceController = createRecordAppearanceController(source);
  const oldLook = source.getEquipmentRecipe(0);
  const nextLook = source.getEquipmentRecipe(4);
  const oldTop = oldLook.top;
  const nextTop = nextLook.fitTop;
  assert.equal(sourceController.outfit, 0);
  assert.equal(source.getOutfitInfo().equipment.items.fitTop.loaded, false);
  assert.notEqual(oldTop.sha256, nextTop.sha256);
  const oldRecord = await captureRuntimeCharacterRecord(sourceController, {
    identity: {id:'cold-outfit-test', name:'Cold outfit test', gender:'female'},
  });
  const request = {
    schema:'character-production-request-v1', operation:'edit', record:oldRecord,
    edits:[{domain:'outfit', selection:{
      bodySha256:source.profile.sha256, role:'pants-layer-fit',
      equipment:Object.values(nextLook).map(({id, slot, sha256}) => ({id, slot, sha256})),
    }}],
  };
  const wrongSelection = structuredClone(request);
  wrongSelection.edits[0].selection.equipment[0].sha256 = oldTop.sha256;
  await assert.rejects(performCharacterProduction(wrongSelection, environment), /exact equipment set/);
  const edited = await performCharacterProduction(request, environment);
  const newRecord = edited.record;
  assert.equal(newRecord.appearanceRecipe.equipment.index, 4);
  assert.equal(newRecord.appearanceRecipe.equipment.resources.fitTop.sha256, nextTop.sha256);
  assert.deepEqual(scene.children, [source.root]);

  const fileUrl = entry => new URL(entry.url, new URL(source.config.manifestUrl, globalThis.location.href)).pathname;
  const readLocal = globalThis.fetch;
  const requests = [];
  let omit = fileUrl(oldTop);
  t.mock.method(globalThis, 'fetch', (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, globalThis.location.href);
    requests.push(url.pathname);
    if (url.pathname === omit) return Promise.resolve(new Response(null, {status:404}));
    return readLocal(input, options);
  });
  const restored = await prepareRecordedCharacter(newRecord, environment);
  t.after(() => restored.dispose());
  const info = restored.avatar.getOutfitInfo();
  assert.equal(restored.controller.outfit, 4);
  assert.equal(info.index, 4);
  assert.equal(info.equipment.outfit, 4);
  assert.equal(info.equipment.items.top.loaded, false);
  assert.equal(info.equipment.items.fitTop.visible, true);
  assert.deepEqual(info.equipment.bodyCoverage.activeItems, [nextTop.id]);
  assert.deepEqual(requests.filter(url => url === fileUrl(nextTop)), [fileUrl(nextTop)]);
  assert(!requests.includes(fileUrl(oldTop)));
  assert(requests.includes(source.config.bodyCoverage.url));
  const savedAgain = await restored.capture();
  assert.deepEqual(savedAgain.appearanceRecipe.equipment, newRecord.appearanceRecipe.equipment);
  assert.deepEqual(savedAgain.equipmentMaterials, newRecord.equipmentMaterials);
  assert.deepEqual(scene.children, [source.root]);
  restored.attach();
  assert.deepEqual(scene.children, [source.root, restored.avatar.root]);
  restored.dispose();

  omit = fileUrl(nextTop);
  requests.length = 0;
  await assert.rejects(prepareRecordedCharacter(newRecord, environment), /Garment HTTP 404/);
  assert(requests.includes(fileUrl(nextTop)));
  assert(!requests.includes(fileUrl(oldTop)));
  const forged = structuredClone(newRecord);
  forged.appearanceRecipe.equipment.index = 900;
  delete forged.integrity.recordSha256;
  forged.integrity.recipeSha256 = await sha256Hex(canonicalJson(forged.appearanceRecipe));
  forged.integrity.recordSha256 = await sha256Hex(canonicalJson(forged));
  requests.length = 0;
  await assert.rejects(prepareRecordedCharacter(forged, environment), /Recorded outfit does not match/);
  assert.deepEqual(requests, []);
  assert.deepEqual(scene.children, [source.root]);
  assert.deepEqual(source.getOutfitInfo().equipment.bodyCoverage.activeItems, [oldTop.id]);
  assert.equal((await captureRuntimeCharacterRecord(sourceController, {previous:oldRecord})).appearanceRecipe.equipment.index, 0);
});
