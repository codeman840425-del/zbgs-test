import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MeshBasicMaterial } from '../../prototype/node_modules/three/build/three.module.js';
import { applyAppearanceRecipe, captureAppearanceRecipe } from '../../prototype/src/appearance-recipe.js';
import { captureRuntimeCharacterRecord, deriveCharacterResourceIdentities, restoreRuntimeCharacterRecord } from '../../prototype/src/character-runtime-record.js';
import { validateCharacterRecord } from '../../prototype/src/character-record.js';
import { captureGarmentMaterials, resolveGarmentMaterials, validateGarmentMaterials } from '../../prototype/src/garment-material-record.js';
import { createGarmentMaterialRecipes } from '../../prototype/src/material-recipes.js';

const readAsset = path => readFile(new URL('../../prototype/public/assets/' + path, import.meta.url));
const clothBytes = await readAsset('material-recipes/m1b-shorts-cloth-v4-review1.json');
const cloth = JSON.parse(clothBytes);
const items = JSON.parse(await readAsset('m1b/equipment.json')).items;
const ids = { top: 'm1b-uniform-top', shoes: 'm1b-uniform-shoes', shorts: cloth.fit.equipmentId, pants: 'm1b-uniform-pants' };
const identity = { id: 'test-male-material-review', gender: 'male', name: 'CPU fixture' };
const tx = () => ({ isCurrent: () => true, commit() {}, rollback() {}, dispose() {}, release() {}, validateCommit() {} });
function domain(state) {
  return { getState: () => state, async prepareUpdate() { state.revision++; return tx(); } };
}

function setup({ failFetch = false, lateFailure = false } = {}) {
  const owners = new Map();
  const meshes = new Map();
  const requests = new Map();
  for (const id of Object.values(ids)) {
    const entry = items.find(item => item.id === id);
    const names = id === ids.shorts ? cloth.materialNames : ['unused'];
    const parts = names.map(name => { const material = new MeshBasicMaterial(); material.name = name; return { material }; });
    meshes.set(id, parts);
    owners.set(id, createGarmentMaterialRecipes({
      entry, meshes: parts, avatarSha256: cloth.fit.avatarSha256, manifestBase: 'https://example.test/',
      threeRevision: '187', fetchImpl: async () => failFetch ? new Response(null, {status: 503}) : new Response(clothBytes),
    }));
  }
  const slots = Object.fromEntries(['mic','glasses'].map(kind => [kind, { requested:false, loaded:false, version:0 }]));
  const actor = {
    profile: { bodyType:'male', sha256:cloth.fit.avatarSha256 },
    config: { manifestUrl:'/assets/m1b/equipment.json', ids, outfits:[{index:0,role:'shorts'},{index:1,role:'pants'}] },
    facialGeometry: domain({ revision:0, mouthWidth:0 }),
    appearance: domain({ revision:0, availableStyles:['original'], hairStyle:'original', replacementSHA256:null, hairFit:null }),
    getEquipmentRecipe(index) {
      return Object.fromEntries(['top','shoes',this.config.outfits[index].role].map(role => [role, items.find(item => item.id === ids[role])]));
    },
    getMaterialRecipeState: id => owners.get(id)?.getState() ?? null,
    getMaterialRecipeRevision(id) {
      const state = owners.get(id).getState();
      return { request: requests.get(id) || 0, inner: state.revision, pending: state.pending?.revision ?? null };
    },
    prepareMaterialRecipe(id, recipeId) {
      requests.set(id, (requests.get(id) || 0) + 1);
      return owners.get(id).prepareMaterialRecipe(recipeId);
    },
    livePresentation: {
      getState: () => ({accessories: slots}),
      async prepareAccessory(kind) {
        slots[kind].version++;
        const update = tx();
        if (lateFailure && kind === 'glasses') update.commit = () => { throw Error('late-glasses-failure'); };
        return update;
      },
    },
  };
  const controller = { actor, outfit:0, isPeer:true, async prepareOutfit(index) {
    const before = this.outfit;
    return { ...tx(), commit: () => { this.outfit=index; }, rollback: () => { this.outfit=before; } };
  }};
  async function selectShorts(recipeId) {
    const prepared = await actor.prepareMaterialRecipe(ids.shorts, recipeId);
    prepared.commit();
    prepared.release();
  }
  return { controller, shorts: owners.get(ids.shorts), selectShorts, parts: meshes.get(ids.shorts) };
}

const authored = setup();
const originalRecord = await captureRuntimeCharacterRecord(authored.controller, {identity});
await authored.selectShorts(cloth.id);
const record = await captureRuntimeCharacterRecord(authored.controller, {identity});

test('503 rejects the entire look with its cause and keeps original mesh references', async () => {
  const {controller, parts} = setup({failFetch:true});
  const before = parts.map(part => part.material);
  await assert.rejects(restoreRuntimeCharacterRecord(controller,record), /503/);
  assert.deepEqual(parts.map(part => part.material), before);
});

test('a newer explicit original selection during record validation supersedes the older restore', async () => {
  const {controller, shorts, selectShorts} = setup();
  const restore = restoreRuntimeCharacterRecord(controller,record);
  await selectShorts(null);
  assert.equal((await restore).cancelled,true);
  assert.equal(shorts.getState().active,null);
});

for (const drainOlder of ['during envelope validation','after newer appearance commits']) {
test('a newer restore takes priority when older preparation drains '+drainOlder, async () => {
  const {controller, shorts} = setup();
  let entered;
  const pending = new Promise(resolve => { entered=resolve; });
  let resume;
  const pause = new Promise(resolve => { resume=resolve; });
  const prepare = controller.actor.prepareMaterialRecipe;
  let first = true;
  controller.actor.prepareMaterialRecipe = async (id, recipeId) => {
    const update = await prepare(id,recipeId);
    if (id===ids.shorts && first) { first=false; entered(); await pause; }
    return update;
  };
  const older = restoreRuntimeCharacterRecord(controller,record);
  await pending;
  const newer = restoreRuntimeCharacterRecord(controller,originalRecord).then(value => ({value}),error => ({error}));
  if (drainOlder === 'during envelope validation') resume();
  else {
    // The old asset may take seconds to return even after cancellation.
    // The next request can commit while that old resource is still pending.
    try { await newer; } finally { resume(); }
  }
  const [a,b] = await Promise.allSettled([older,newer]);
  assert.equal(b.value?.error, undefined);
  assert.equal(b.value?.value?.applied,true);
  assert.equal(a.value?.cancelled,true);
  assert.equal(shorts.getState().active,null);
});
}

test('new intent for shorts hidden under the current pants still supersedes restoring those shorts', async () => {
  const {controller, selectShorts, shorts} = setup();
  controller.outfit = 1;
  const restore = restoreRuntimeCharacterRecord(controller,record);
  await selectShorts(null);
  assert.equal((await restore).cancelled,true);
  assert.equal(controller.outfit,1);
  assert.equal(shorts.getState().active,null);
});

test('forged material implementation in the requested row is rejected before visible writes', async () => {
  const {controller, parts} = setup();
  const before = parts.map(part=>part.material);
  const forged = structuredClone(record.equipmentMaterials);
  forged.selections.find(row=>row.equipmentId===ids.shorts).selection.implementationId='wrong-implementation';
  await assert.rejects(applyAppearanceRecipe(controller,record.appearanceRecipe,{equipmentMaterials:forged}),/材质/);
  assert.ok(parts.every((part,i)=>part.material===before[i]));
});

test('late commit failure restores the exact previous selected mesh material objects', async () => {
  const {controller, shorts, parts, selectShorts} = setup({lateFailure:true});
  const originals = captureGarmentMaterials(controller.actor,captureAppearanceRecipe(controller));
  await selectShorts(cloth.id);
  const previous = parts.map(part => part.material);
  const disposed = new Set();
  previous.forEach(material => material.addEventListener('dispose', () => disposed.add(material)));
  await assert.rejects(applyAppearanceRecipe(controller,record.appearanceRecipe,{equipmentMaterials:originals,liveAccessories:record.liveAccessories}), /late-glasses-failure/);
  assert.ok(parts.every((part,i) => part.material===previous[i]));
  assert.equal(shorts.getState().active.recipeId,cloth.id);
  assert.equal(disposed.size,0);
});

test('all saved garment rows are required and legacy migration requires unambiguous originals', () => {
  const {controller} = setup();
  const actor = controller.actor, recipe = captureAppearanceRecipe(controller);
  const all = captureGarmentMaterials(actor,recipe);
  assert.deepEqual(all.selections.map(row => row.equipmentId),[ids.shoes,ids.shorts,ids.top].sort((a,b)=>a.localeCompare(b)));
  assert.throws(() => validateGarmentMaterials(actor,recipe,{...all,selections:all.selections.slice(1)}));
  assert.throws(() => resolveGarmentMaterials(actor,recipe,undefined),/旧角色/);
  controller.outfit=1;
  const migrated = resolveGarmentMaterials(actor,captureAppearanceRecipe(controller),undefined);
  assert.equal(migrated.legacy,true);
  assert.ok(migrated.record.selections.every(row=>row.selection===null));
});

test('archived native record preserves its envelope digest and resource list during migration', async () => {
  const path = '../m2-character-runtime-fixed-v1/records/native-male-7586-v1-record-a.json';
  const disk = JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
  assert.ok(!Object.hasOwn(disk,'equipmentMaterials'));
  const historical = structuredClone(disk);
  const envelope = await validateCharacterRecord(disk,{validationCallback:() => ({status:'pending'})});
  assert.equal(envelope.recordSha256,disk.integrity.recordSha256);
  const actor = {profile:disk.appearanceRecipe.base};
  const migrated = resolveGarmentMaterials(actor,disk.appearanceRecipe,undefined);
  assert.ok(migrated.legacy && migrated.record.selections.length===3);
  assert.ok(migrated.record.selections.every(row=>row.selection===null));
  assert.deepEqual(deriveCharacterResourceIdentities(disk.appearanceRecipe,disk.liveAccessories),disk.resourceIdentities);
  assert.deepEqual(disk,historical);
});
