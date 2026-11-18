import productionCatalog from './native-production-catalog.json' with {type:'json'};
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {queryAppearanceCandidates} from './appearance-candidates.js';
import {queryCharacterProduction} from './character-production-query.js';
import {FOUNDATION_PROFILES, foundationProfile} from './foundation-profiles.js';
import {MICROPHONE_PRESENTATION_FITS} from './microphone-presentation-fits.js';
import {outfitSelection} from './outfit-selection.js';

const publicFile = url => new URL('../public' + url, import.meta.url);
const json = async url => JSON.parse(await readFile(publicFile(url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fittedChoice = slot => slot.choices.find(choice => choice.enabled);

async function fixture(bodyType) {
  const config = foundationProfile(bodyType);
  const {items} = await json(config.manifestUrl);
  for (const descriptor of config.additionalEquipmentManifests ?? []) {
    const bytes = await readFile(publicFile(descriptor.url));
    assert.equal(sha256(bytes), descriptor.sha256);
    items.push(...JSON.parse(bytes).items);
  }
  const catalog = new Map(items.map(entry => [entry.id, entry]));
  const outfit = 0;
  const state = {availableStyles:['original'], revision:2};
  const actor = {
    config, profile:{bodyType, sha256:config.sha256},
    appearance:{getState:() => state},
    getEquipmentRecipe(index) {
      return Object.fromEntries(outfitSelection(config, index).roles.map(role => {
        const entry = catalog.get(config.ids[role]);
        assert(entry, 'Missing real configured catalog entry ' + config.ids[role]);
        return [role, entry];
      }));
    },
  };
  return {controller:{actor, outfit, outfitRevision:4}, state, catalog};
}

async function pinnedBytes({url, bytes, sha256:expected}) {
  const actual = await readFile(publicFile(url));
  assert.equal(actual.length, bytes, url);
  assert.equal(sha256(actual), expected, url);
  return actual;
}

test('returns detached JSON and preserves the existing appearance contract', async () => {
  const {controller, state, catalog} = await fixture('male');
  const expectedAppearance = JSON.parse(JSON.stringify(queryAppearanceCandidates(controller)));
  const equipmentId = controller.actor.config.ids.shorts;
  const originalRecipe = catalog.get(equipmentId).materialRecipes[0].id;
  const fetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('A production query should not fetch runtime resources');
  try {
    const query = queryCharacterProduction(controller);
    assert.equal(query.schema, 'character-production-query-v1');
    assert.equal(query.scope, 'registered-capabilities');
    assert.deepEqual(query, JSON.parse(JSON.stringify(query)));
    assert.deepEqual(query.appearance, expectedAppearance);
    assert.equal(query.appearance.geometry.mouthWidth.unit, 'ratio');
    assert.equal(query.appearance.surface.supported, true);
    assert(query.appearance.accessories);
    const expectedStyleVariants = JSON.parse(JSON.stringify(query.styleVariants));
    query.appearance.defaultRecipe.appearance.hairStyle = 'edited by caller';
    query.outfits.find(set => set.index === 2).equipment.find(entry => entry.id === equipmentId).materials.recipes[0].id = 'edited by caller';
    query.liveAccessories.mic.choices[1].grip.id = 'edited by caller';
    query.styleVariants[0].variants[0].limits.push('edited by caller');
    assert.equal(catalog.get(equipmentId).materialRecipes[0].id, originalRecipe);
    assert.deepEqual(state, {availableStyles:['original'], revision:2});
    assert.equal(controller.outfitRevision, 4);
    assert.deepEqual(queryCharacterProduction(controller).appearance, expectedAppearance);
    assert.deepEqual(queryCharacterProduction(controller).styleVariants, expectedStyleVariants);
    assert.notEqual(queryCharacterProduction(controller).liveAccessories.mic.choices[1].grip.id, 'edited by caller');
  } finally {
    globalThis.fetch = fetch;
  }
});

test('lists exact body registrations and all outfits and material references from the configured catalogs', async () => {
  const registrations = Object.entries(FOUNDATION_PROFILES);
  const checkedRecipes = new Set();
  let outfitCount = 0;
  for (const [bodyType, profile] of registrations) {
    const {controller} = await fixture(bodyType);
    const query = queryCharacterProduction(controller);
    assert.deepEqual(query.body, {bodyType, id:profile.id, label:profile.label, url:profile.url, sha256:profile.sha256, status:'registered'});
    assert.deepEqual(query.bodies.map(row => [row.bodyType, row.sha256, row.status]),
      registrations.map(([id, source]) => [id, source.sha256, 'registered']));
    const config = controller.actor.config;
    assert.deepEqual(query.outfits.map(row => row.index), config.outfits.map(row => row.index));
    for (const outfit of query.outfits) {
      outfitCount++;
      const expected = controller.actor.getEquipmentRecipe(outfit.index);
      assert.deepEqual(outfit.equipment.map(row => row.role), Object.keys(expected));
      for (const item of outfit.equipment) {
        const entry = expected[item.role];
        assert.equal(item.id, entry.id);
        assert.equal(item.sha256, entry.sha256);
        assert.equal(item.materials.default, null);
        assert.deepEqual(item.materials.recipes, entry.materialRecipes ?? []);
        for (const ref of item.materials.recipes) {
          if (checkedRecipes.has(ref.sha256)) continue;
          checkedRecipes.add(ref.sha256);
          const recipe = JSON.parse(await pinnedBytes(ref));
          assert.equal(recipe.id, ref.id);
          assert.deepEqual(recipe.fit, {equipmentId:item.id, garmentSha256:item.sha256,
            avatarSha256:item.materials.binding.bodySha256, fitId:item.materials.binding.fitId,
            styleId:item.materials.binding.styleId});
        }
      }
    }
  }
  assert.equal(registrations.length, 25 + productionCatalog.entries.length);
  assert.equal(outfitCount, 41 + productionCatalog.entries.length);
  assert.equal(checkedRecipes.size, 1);
});

test('uses the actual shared accessory, exact grip and exact temple resources for each fitted registration', async () => {
  const expected = ['female', 'male', 'native-female-843ac-v1', 'native-female-face-v1',
    'native-female-waist-v1', 'native-male-7586-v1', ...productionCatalog.entries.map(row=>row.bodyType)];
  assert.deepEqual(expected.map(body => FOUNDATION_PROFILES[body].sha256).sort(), Object.keys(MICROPHONE_PRESENTATION_FITS).sort());
  for (const body of expected) {
    const {controller} = await fixture(body);
    const {body:{sha256:bodySha}, liveAccessories:{mic, glasses}} = queryCharacterProduction(controller);
    assert.equal(mic.status, 'registered');
    assert.equal(glasses.status, 'registered');
    assert.deepEqual(mic.constraints, {blockedActions:['dance'], blocksGreeting:true, enableBlockedDuring:['dance', 'greeting']});
    assert.equal(mic.default, false);
    assert.equal(glasses.default, false);
    const microphone = fittedChoice(mic);
    const eyewear = fittedChoice(glasses);
    await Promise.all([pinnedBytes(microphone.asset), pinnedBytes(eyewear.asset)]);
    const grip = JSON.parse(await pinnedBytes(microphone.grip));
    assert.equal(grip.id, microphone.grip.id);
    assert.equal(grip.compatibleAvatarSha256, bodySha);
    assert.equal(grip.compatibleAccessorySha256, microphone.asset.sha256);
    assert.equal(microphone.presentationFit.bodySha256, bodySha);
    assert.equal(microphone.presentationFit.microphoneSha256, microphone.asset.sha256);
    assert.equal(microphone.presentationFit.anchorSourceSha256, MICROPHONE_PRESENTATION_FITS[bodySha].anchorSourceSha256);
    const temples = JSON.parse(await pinnedBytes(eyewear.templeFit));
    assert.equal(temples.bodySHA256, bodySha);
    assert.equal(temples.accessorySHA256, eyewear.asset.sha256);
    assert(!Object.hasOwn(eyewear, 'identity'));
    assert(!Object.hasOwn(microphone, 'identity'));
  }
});

test('does not inherit accessory fits or material recipes across different body digests', async () => {
  const {controller} = await fixture('m2-male-lower-leg-v1');
  const production = queryCharacterProduction(controller);
  for (const slot of Object.values(production.liveAccessories)) {
    assert.equal(slot.status, 'unavailable');
    assert.equal(slot.reason, 'exact-body-fit-unregistered');
    assert.deepEqual(slot.choices, [{enabled:false}]);
  }
  for (const item of production.outfits.flatMap(outfit => outfit.equipment))
    assert.deepEqual(item.materials.recipes, []);
  const native = queryCharacterProduction((await fixture('native-male-7586-v1')).controller);
  const shorts = native.outfits[0].equipment.find(item => item.role === 'shorts');
  assert.equal(shorts.materials.default, null);
  assert.deepEqual(shorts.materials.recipes, []);
  const original = queryCharacterProduction((await fixture('male')).controller);
  assert.deepEqual(original.outfits.filter(outfit => outfit.equipment.some(item => item.materials.recipes.length)).map(outfit => outfit.index), [2, 4, 6]);
});

test('exposes the configured style matrix per exact body while keeping candidates out of runtime admission', async () => {
  const female = queryCharacterProduction((await fixture('female')).controller);
  const male = queryCharacterProduction((await fixture('male')).controller);
  assert.deepEqual(female.styleVariants.map(style => style.styleId), ['uniform-top-v1', 'lower-shorts-v1']);
  assert.deepEqual(male.styleVariants.map(style => style.styleId), ['uniform-top-v1', 'lower-shorts-v1']);
  for (const style of [...female.styleVariants, ...male.styleVariants]) {
    assert.equal(style.variants.length, 1);
    assert.equal(style.variants[0].status, 'candidate');
  }
  assert.deepEqual(female.runtimeVariants ?? [], []);
  assert.deepEqual(male.runtimeVariants ?? [], []);
});

test('exposes native parameter packages as exact candidate variants without inheriting admission', async () => {
  for (const entry of productionCatalog.entries) {
    const query = queryCharacterProduction((await fixture(entry.bodyType)).controller);
    assert.deepEqual(query.styleVariants.map(style => style.styleId), ['uniform-top-v1', 'lower-shorts-v1']);
    for (const style of query.styleVariants) {
      assert.equal(style.variants.length, 1);
      assert.equal(style.variants[0].bodyType, entry.bodyType);
      assert.equal(style.variants[0].bodySha256, entry.profile.sha256);
      assert.equal(style.variants[0].recipeSha256, entry.recipeSha256);
      assert.equal(style.variants[0].packageStatus, 'offline-prepared');
      assert.equal(style.variants[0].budgetStatus, 'reject-static-over-budget');
      assert.deepEqual(style.variants[0].admissionBlockers,
        ['dynamicMotion', 'headAttachments', 'runtimeRecordAndBudget', 'surfaceAndTexture']);
      assert.equal(style.variants[0].status, 'candidate');
    }
    assert.deepEqual(query.runtimeVariants, []);
  }
});

test('rejects missing and mismatched loaded body identities', async () => {
  assert.throws(() => queryCharacterProduction(null), {code:'unregistered-body'});
  const {controller} = await fixture('male');
  controller.actor.profile.sha256 = FOUNDATION_PROFILES.female.sha256;
  assert.throws(() => queryCharacterProduction(controller), {code:'unregistered-body'});
  controller.actor.profile.bodyType = 'unregistered-body';
  assert.throws(() => queryCharacterProduction(controller), {code:'unregistered-body'});
});
