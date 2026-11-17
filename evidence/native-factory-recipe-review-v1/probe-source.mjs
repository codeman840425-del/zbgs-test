// Actual recipe, VRM, appearance and equipment modules. No renderer or GPU.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { foundationProfile } from '../../prototype/src/foundation-profiles.js';
import { outfitSelection } from '../../prototype/src/outfit-selection.js';
import { createEquipment } from '../../prototype/src/equipment.js';
import { createCharacterAppearance } from '../../prototype/src/character-appearance.js';
import { createFacialGeometry } from '../../prototype/src/facial-geometry.js';
import { createRigidAccessoryLayer } from '../../prototype/src/rigid-accessory-layer.js';
import { EAR_MANIFEST_SHA, HAT_MANIFEST_SHA } from '../../prototype/src/accessory-recipe.js';
import { captureAppearanceRecipe, exportAppearanceRecipe, parseAppearanceRecipeText,
  validateAppearanceRecipe, importAppearanceRecipe } from '../../prototype/src/appearance-recipe.js';

const root = process.cwd(), folder = root + '/evidence/native-factory-recipe-review-v1/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const config = foundationProfile('native-female-843ac-v1');
const source = await fs.readFile(root + '/prototype/public' + config.url);
assert.equal(hash(source), config.sha256);
const fetches = [];
globalThis.location = new URL('https://native-recipe.fixture/');
globalThis.window = { location };
globalThis.fetch = async input => {
  const url = new URL(String(input), location);
  assert.ok(url.pathname.startsWith('/assets/'));
  fetches.push(url.pathname);
  return new Response(await fs.readFile(root + '/prototype/public' + url.pathname));
};
const originalParse = GLTFLoader.prototype.parse;
GLTFLoader.prototype.parse = function (...args) {
  this.register(() => ({ name: 'CPUTextureDecodeOnly', loadTexture: async () =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }));
  return originalParse.apply(this, args);
};
const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
const gltf = await loader.parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
const vrm = gltf.userData.vrm;
let appearance, geometry, ears, hat, equipment;
const checks = [];
try {
  equipment = await createEquipment({ vrm, avatarSha256: config.sha256, manifestUrl: config.manifestUrl });
  appearance = createCharacterAppearance({ vrm, avatarSha256: config.sha256, preserveHairInBaseMode: true });
  geometry = createFacialGeometry({ vrm, avatarSha256: config.sha256 });
  ears = createRigidAccessoryLayer({ vrm, avatarSha256: config.sha256, manifestSha256: EAR_MANIFEST_SHA });
  hat = createRigidAccessoryLayer({ vrm, avatarSha256: config.sha256, kind: 'hat', manifestSha256: HAT_MANIFEST_SHA,
    getHairState: () => appearance.getState() });
  const actor = { vrm, appearance, facialGeometry: geometry, rigidAccessories: ears, headwear: hat, config,
    profile: { bodyType: 'native-female-843ac-v1', sha256: config.sha256, id: config.id },
    getEquipmentRecipe(index) {
      const { roles } = outfitSelection(config, index);
      return Object.fromEntries(roles.map(role => [role, equipment.describe(config.ids[role])]));
    } };
  const controller = { actor, outfit: 0, outfitRevision: 0, isPeer: true,
    async prepareOutfit(index) {
      const { ids } = outfitSelection(config, index);
      await Promise.all(ids.map(id => equipment.load(id)));
      const update = equipment.prepareLoadedSet(ids), revision = this.outfitRevision;
      return { isCurrent: () => update.isCurrent() && this.outfitRevision === revision,
        commit: () => { update.commit(); this.outfit = index; this.outfitRevision++; },
        dispose: () => update.dispose() };
    } };
  const original = captureAppearanceRecipe(controller);
  assert.equal(validateAppearanceRecipe(controller, original), true);
  assert.equal(original.equipment.role, 'shorts');
  assert.deepEqual(Object.keys(original.equipment.resources), ['top', 'shorts', 'shoes']);
  const pretty = JSON.stringify(original, null, 2) + '\n';
  let prettyError;
  try { parseAppearanceRecipeText(pretty); } catch (error) { prettyError = error.message; }
  assert.ok(prettyError?.includes('256'));
  await fs.writeFile(folder + 'pretty-native-recipe-size-witness.json', JSON.stringify({
    originalAlgorithm: 'JSON.stringify(actual captured record,null,2)+newline',
    bytes: Buffer.byteLength(pretty), characters: pretty.length, error: prettyError,
    fieldsRemoved: false }, null, 2) + '\n', { flag: 'wx' });
  checks.push('Actual native original/neutral/none record validates with native bodyType, shorts role and resource identities');
  const text = exportAppearanceRecipe(controller);
  const parsed = parseAppearanceRecipeText(text);
  let negativeZeros = 0, unsupportedValues = 0;
  function inspect(value) {
    if (typeof value === 'number') { negativeZeros += Object.is(value, -0); unsupportedValues += !Number.isFinite(value); }
    else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
    else if (value === undefined || typeof value === 'function') unsupportedValues++;
  }
  inspect(original); assert.equal(unsupportedValues, 0);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(original)));
  await fs.writeFile(folder + 'native-original-recipe.json', text, { flag: 'wx' });
  checks.push('Actual compact export/parser deep equality, all130 bindings per resource retained');
  const job = await controller.prepareOutfit(0); job.commit(); job.dispose();
  const applied = await importAppearanceRecipe(controller, text);
  assert.equal(applied.applied, true);
  assert.deepEqual(captureAppearanceRecipe(controller), original);
  checks.push('Actual transaction imports original colors/neutral geometry/empty ear+hat with actual loaded equipment');
  const fetchCountBeforeFresh = fetches.length;
  // This second import is intentionally same-instance. Cold page restoration
  // and Body texture coverage remain the root browser acceptance scope.
  const twice = await importAppearanceRecipe(controller, text);
  assert.equal(twice.applied, true);
  assert.deepEqual(captureAppearanceRecipe(controller), original);
  assert.equal(fetches.length, fetchCountBeforeFresh);
  checks.push('Idempotent same-instance import has no palette, surface, accessory or geometry resource fetch');
  const baselineText = exportAppearanceRecipe(controller);
  const negatives = [];
  for (const [name, change] of [
    ['wrong-resource-sha', r => { r.equipment.resources.top.sha256 = '0'.repeat(64); }],
    ['wrong-binding', r => { r.equipment.resources.top.bindings[0].inverseBindMatrix[0] += .01; }],
    ['asset-id-used-as-body-type', r => { r.base.bodyType = config.id; }],
    ['wrong-palette-version', r => { r.paletteVersion = 'unregistered-native-palette'; }],
    ['wrong-outfit-role', r => { r.equipment.role = 'pants'; }],
  ]) {
    const wrong = structuredClone(original); change(wrong);
    let rejection;
    try { await importAppearanceRecipe(controller, JSON.stringify(wrong)); }
    catch (error) { rejection = error.message; }
    assert.ok(rejection, name);
    assert.equal(exportAppearanceRecipe(controller), baselineText);
    negatives.push({ name, rejection, oldFullRecipeUnchanged: true });
  }
  checks.push('Five exact identity negatives reject and preserve complete current export');
  const noPaletteRequests = !fetches.some(path => /appearance-color|surface|hat-hair|paired-ear/.test(path));
  assert.ok(noPaletteRequests);
  const report = { schema: 'native-factory-original-recipe-cpu-review-v1', status: 'bounded-compact-recipe-checks-passed',
    avatarSha256: config.sha256, bodyType: actor.profile.bodyType, assetId: actor.profile.id,
    recipeSchema: original.schema, paletteVersion: original.paletteVersion, outfitRole: original.equipment.role,
    resourceRoles: Object.keys(original.equipment.resources),
    bindingCounts: Object.fromEntries(Object.entries(original.equipment.resources).map(([key, value]) => [key, value.bindings.length])),
    prettyBytes: Buffer.byteLength(pretty), compactBytes: Buffer.byteLength(text), parsedJsonValueDeepEqual: true,
    originalSignedNegativeZeroCount: negativeZeros, unsupportedValuesRemovedByJson: unsupportedValues,
    paletteResourcesFetched: false, neutralGeometryResourcesFetched: false,
    emptyAccessoryResourcesFetched: false, checks, negatives, fetches,
    limits: ['Actual recipe/domain/GLTFLoader/equipment adapter. Controller prepare bridge omits M1 Body texture coverage, Phaser/UI and movement',
      'CPU texture decode only, no GPU/visuals. Same-instance repeat is not cold-page restoration',
      'Only selected index0 three-resource set tested; root later actual custom outfit/cold-page restore remains pending',
      'JS negative zero serializes as zero in both pretty and compact JSON; all resource fields and numerical identity comparison preserved'] };
  await fs.writeFile(folder + 'cpu-report.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, prettyBytes: report.prettyBytes, compactBytes: report.compactBytes,
    paletteVersion: report.paletteVersion, resourceRoles: report.resourceRoles, bindings: report.bindingCounts }));
} finally {
  ears?.dispose(); hat?.dispose(); geometry?.dispose(); appearance?.dispose(); equipment?.dispose();
  VRMUtils.deepDispose(vrm.scene); GLTFLoader.prototype.parse = originalParse;
}
