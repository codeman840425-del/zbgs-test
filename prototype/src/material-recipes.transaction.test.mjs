import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarmentMaterialRecipes } from './material-recipes.js';

const recipeId = 'test-cloth-recipe';
const bodySha = 'body-sha';
const garmentSha = 'garment-sha';
const recipe = {
  schema: 'zbgs-garment-material-recipe-v1',
  id: recipeId,
  version: 1,
  fit: {
    equipmentId: 'test-garment',
    garmentSha256: garmentSha,
    avatarSha256: bodySha,
    fitId: 'test-fit',
    styleId: 'test-style',
  },
  implementation: {
    id: 'cloth-normal-v4-review1',
    sha256: '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565',
    threeRevision: '187',
  },
  materialNames: ['TestCloth'],
  settings: { linearColor: [0.025, 0.032, 0.055], fabricStart: [0.17, 0.21] },
};
const recipeBytes = new TextEncoder().encode(JSON.stringify(recipe));
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const recipeSha = await digest(recipeBytes);

function makeOwner(fetchImpl = async () => new Response(recipeBytes, { status: 200 }), descriptor = {}) {
  const original = new THREE.MeshBasicMaterial();
  original.name = 'TestCloth';
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), original);
  const owner = createGarmentMaterialRecipes({
    entry: {
      id: 'test-garment', sha256: garmentSha, fitId: 'test-fit', styleId: 'test-style',
      materialRecipes: [{ id: recipeId, url: '/recipe.json', sha256: descriptor.sha256 ?? recipeSha, bytes: descriptor.bytes ?? recipeBytes.byteLength }],
    },
    meshes: [mesh], avatarSha256: bodySha, manifestBase: 'https://example.test/assets/',
    threeRevision: '187', fetchImpl,
  });
  return { owner, mesh, original };
}

test('material preparation leaves current meshes untouched and rolls back a committed swap', async () => {
  const { owner, mesh, original } = makeOwner();
  const prepared = await owner.prepareMaterialRecipe(recipeId);
  assert.equal(mesh.material, original);
  assert.equal(prepared.identity.recipeId, recipeId);
  assert.deepEqual(owner.getState().pending, { revision: 1, recipeId });
  prepared.validateCommit();
  prepared.commit();
  const selected = mesh.material;
  assert.notEqual(selected, original);
  assert.deepEqual(owner.getState().active, prepared.identity);
  assert.equal(owner.getState().selected, recipeId);
  prepared.rollback();
  assert.equal(mesh.material, original);
  assert.equal(owner.getState().selected, 'original');
  owner.dispose();
  mesh.geometry.dispose();
  original.dispose();
});

test('releasing an uncommitted preparation cancels its pending intent', async () => {
  const { owner, mesh, original } = makeOwner();
  const prepared = await owner.prepareMaterialRecipe(recipeId);
  assert.equal(owner.getState().pending.recipeId, recipeId);
  prepared.release();
  assert.equal(owner.getState().pending, null);
  assert.equal(owner.getState().status, 'original');
  assert.equal(mesh.material, original);
  owner.dispose();
  mesh.geometry.dispose();
  original.dispose();
});

test('disposing an active recipe restores source material references before garment cleanup', async () => {
  const { owner, mesh, original } = makeOwner();
  await owner.select(recipeId);
  assert.notEqual(mesh.material, original);
  owner.dispose();
  assert.equal(mesh.material, original);
  assert.equal(owner.getState().selected, 'original');
  mesh.geometry.dispose();
  original.dispose();
});

test('rollback keeps the previous active clone alive until final owner disposal', async () => {
  const { owner, mesh, original } = makeOwner();
  const sourceTexture = new THREE.Texture();
  let sourceTextureDisposals = 0;
  sourceTexture.addEventListener('dispose', () => { sourceTextureDisposals++; });
  original.map = sourceTexture;
  original.needsUpdate = true;
  await owner.select(recipeId);
  const activeClone = mesh.material;
  let activeCloneDisposals = 0;
  activeClone.addEventListener('dispose', () => { activeCloneDisposals++; });
  const update = await owner.prepareMaterialRecipe('original');
  update.commit();
  assert.equal(activeCloneDisposals, 0);
  update.rollback();
  update.dispose();
  assert.equal(mesh.material, activeClone);
  assert.equal(activeCloneDisposals, 0);
  owner.dispose();
  assert.equal(activeCloneDisposals, 1);
  assert.equal(mesh.material, original);
  assert.equal(sourceTextureDisposals, 0);
  mesh.geometry.dispose();
  sourceTexture.dispose();
  original.dispose();
});

test('a newer request supersedes a delayed recipe without changing the active material', async () => {
  let resolveFetch;
  const fetchImpl = () => new Promise(resolve => { resolveFetch = resolve; });
  const { owner, mesh, original } = makeOwner(fetchImpl);
  const oldRequest = owner.prepareMaterialRecipe(recipeId);
  const newRequest = owner.prepareMaterialRecipe('original');
  const current = await newRequest;
  assert.equal(current.isCurrent(), true);
  current.commit();
  current.release();
  assert.equal(owner.getState().pending, null);
  resolveFetch(new Response(recipeBytes, { status: 200 }));
  const old = await oldRequest;
  assert.equal(old.isCurrent(), false);
  assert.equal(old.reason, 'superseded');
  assert.equal(mesh.material, original);
  owner.dispose();
  mesh.geometry.dispose();
  original.dispose();
});

test('failed recipe validation preserves the source material and reports an error state', async () => {
  const badBytes = new TextEncoder().encode(JSON.stringify({ ...recipe, materialNames: ['Wrong'] }));
  const { owner, mesh, original } = makeOwner(async () => new Response(badBytes, { status: 200 }), { sha256: await digest(badBytes), bytes: badBytes.byteLength });
  await assert.rejects(owner.prepareMaterialRecipe(recipeId), /primitive selection differs/);
  assert.equal(mesh.material, original);
  assert.equal(owner.getState().status, 'error');
  owner.dispose();
  mesh.geometry.dispose();
  original.dispose();
});
