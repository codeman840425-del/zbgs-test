import productionCatalog from './native-production-catalog.json' with {type:'json'};
import sourceOutfits from './source-outfit-profiles.json' with {type:'json'};
import shoeOutfits from './source-shoe-outfits.json' with {type:'json'};
import styleMatrix from '../../assets-source/variant-matrix-v1/representative-matrix.json' with {type:'json'};
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {queryAppearanceCandidates} from './appearance-candidates.js';
import {queryCharacterProduction} from './character-production-query.js';
import {resolveProductionOutfitIndex} from './character-production.js';
import {FOUNDATION_PROFILES, foundationProfile} from './foundation-profiles.js';
import {MICROPHONE_PRESENTATION_FITS} from './microphone-presentation-fits.js';
import {outfitSelection} from './outfit-selection.js';
import {validateNativeHairCenterPin} from './native-hair-center-record.js';
import glassesRegistry from './glasses-temple-fit-manifest.json' with {type:'json'};

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
  const state = {hairStyle:'original', availableStyles:['original'], revision:2};
  const actor = {
    config, profile:{bodyType, sha256:config.sha256},
    appearance:{getState:() => state},
    facialGeometry:{getState:() => ({mouthWidth:0, browSample:'none', noseSample:'none', eyeSample:'none'})},
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

test('stable D02 outfits resolve the entire registered set at its current index', async () => {
  const {controller} = await fixture('female');
  const query = queryAppearanceCandidates(controller);
  const look = query.equipment.sets.find(set => set.role === 'skirt');
  const equipment = Object.values(look.resources).map(({id,slot,sha256}) => ({id,slot,sha256})).reverse();
  const selection = {bodySha256:query.base.sha256,role:look.role,equipment};
  const operation = {domain:'outfit',selection};
  assert.equal(resolveProductionOutfitIndex(query,{domain:'outfit',index:look.index}), look.index);
  assert.equal(resolveProductionOutfitIndex(query,operation), look.index);

  const other = query.equipment.sets.find(set => set.index !== look.index);
  const priorIndex = look.index;
  [look.index, other.index] = [other.index, look.index];
  query.equipment.sets.reverse();
  assert.equal(resolveProductionOutfitIndex(query,operation), look.index);
  assert.notEqual(look.index, priorIndex);
  assert.equal(resolveProductionOutfitIndex(query,{domain:'outfit',index:priorIndex}), other.index);

  const rejected = (edit, field) => assert.throws(() => resolveProductionOutfitIndex(query, edit),
    error => error.code === 'production-input' && error.field === field);
  const rejectSelection = (changes, field = 'outfit.selection') => rejected({...operation,selection:{...selection,...changes}},field);
  rejected({...operation,index:priorIndex},'edit.index');
  rejected({domain:'outfit',index:'0'},'outfit.index');
  rejectSelection({bodySha256:foundationProfile('male').sha256},'outfit.selection.bodySha256');
  rejectSelection({role:other.role});
  rejectSelection({equipment:equipment.slice(1)});
  rejectSelection({equipment:[{...equipment[0],sha256:'0'.repeat(64)},...equipment.slice(1)]});
  rejectSelection({equipment:[{...equipment[0],slot:'unregistered-slot'},...equipment.slice(1)]});
  rejectSelection({equipment:[...equipment,{...equipment[0],id:'extra-garment'}]});
  rejectSelection({equipment:[...equipment.slice(0,-1),equipment[0]]},'outfit.selection.equipment.'+(equipment.length-1)+'.id');
  rejectSelection({equipment:[{}]},'outfit.selection.equipment.0.id');
  query.equipment.sets.push({...look,index:99});
  assert.throws(() => resolveProductionOutfitIndex(query,operation), /ambiguous/);
});

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
    assert.deepEqual(state, {hairStyle:'original', availableStyles:['original'], revision:2});
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
  const sourceProfiles = Object.values(sourceOutfits);
  assert.equal(registrations.length, 25 + sourceProfiles.length + productionCatalog.entries.length);
  const sourceCount = sourceProfiles.reduce((sum, row) => sum + 1 + (row.extraOutfits?.length ?? 0), 0);
  const imported = styleMatrix.styles.flatMap(style => style.variants)
    .filter(row => row.outfitRegistration && row.status !== 'rejected' && row.budgetStatus !== 'reject-static-over-budget');
  assert.equal(outfitCount, 44 + sourceCount + shoeOutfits.length + productionCatalog.entries.length + imported.length);
  assert.equal(checkedRecipes.size, 5);
});

test('texture-derived body resolves both separately fitted tops with unchanged garment payloads', async () => {
  const base = await fixture('source-male-ab9a-release-v1');
  const derived = await fixture('source-male-cc0-texture-release-v1');
  const old = queryCharacterProduction(base.controller), next = queryCharacterProduction(derived.controller);
  assert.notEqual(next.body.sha256, old.body.sha256);
  assert.equal(sha256(await readFile(publicFile(next.body.url))), next.body.sha256);
  assert.deepEqual(old.outfits.map(row => row.role), ['pants','pants-top-far']);
  assert.deepEqual(next.outfits.map(row => row.role), ['pants','pants-top-far','pants-top-far-platform']);
  const [flat, platform] = next.outfits.slice(1);
  assert.deepEqual(platform.equipment.filter(row => ['topFar','pants'].includes(row.role)), flat.equipment.filter(row => ['topFar','pants'].includes(row.role)));
  const platformShoe = platform.equipment.find(row => row.role === 'platformShoes');
  assert.equal(platformShoe.role, 'platformShoes');
  assert.equal(platformShoe.materials.binding.bodySha256, next.body.sha256);
  assert.notEqual(platformShoe.sha256, flat.equipment.find(row => row.role === 'shoes').sha256);
  for (const [i, look] of next.outfits.slice(0,2).entries()) {
    assert.deepEqual(look.equipment.map(row => [row.role,row.sha256]), old.outfits[i].equipment.map(row => [row.role,row.sha256]));
    for (const row of look.equipment) {
      assert.equal(row.materials.binding.bodySha256, next.body.sha256);
      assert.notEqual(row.id, old.outfits[i].equipment.find(previous => previous.role === row.role).id);
    }
  }
  assert.equal(next.liveAccessories.mic.status, 'unavailable');
  assert.equal(fittedChoice(next.liveAccessories.glasses).templeFit.bodySha256, next.body.sha256);
  assert.deepEqual(next.liveAccessories.glasses.constraints.headDependency, {hairStyle:'original', faceGeometry:'neutral'});
});

test('a restricted glasses registration identifies incompatible current heads separately from absent fits', async t => {
  const records = async file => JSON.parse(await readFile(new URL('../../evidence/' + file, import.meta.url)));
  const [original] = await records('m2-uniform-lite-operator-v1/records.json');
  const [bob] = await records('m2-uniform-skin-v1/signed-pair.json');
  const recipe = original.appearanceRecipe;
  assert.deepEqual(recipe.base, bob.appearanceRecipe.base);
  const {controller, state} = await fixture(recipe.base.bodyType);
  Object.assign(state, recipe.appearance);
  const geometry = {...recipe.geometry};
  controller.actor.facialGeometry = {getState:() => geometry};
  const glasses = () => queryCharacterProduction(controller).liveAccessories.glasses;
  const rows = glassesRegistry.profiles;
  t.after(() => { glassesRegistry.profiles = rows; });
  glassesRegistry.profiles = rows.filter(row => row.bodySHA256 !== recipe.base.sha256);
  assert.equal(glasses().reason, 'exact-body-fit-unregistered');
  const candidates = await json('/assets/native-glasses-candidate-v2/manifest.json');
  const fit = candidates.profiles.find(row => row.bodySHA256 === recipe.base.sha256);
  const headDependency = {hairStyle:'original', faceGeometry:'neutral'};
  glassesRegistry.profiles.push({...fit, headDependency});
  assert.deepEqual(glasses().constraints, {fitMode:'exact-temple-profile', headDependency});
  assert.equal(fittedChoice(glasses()).templeFit.sha256, fit.sha256);
  Object.assign(state, bob.appearanceRecipe.appearance);
  assert.equal(glasses().reason, 'glasses-head-incompatible');
  assert.deepEqual(glasses().choices, [{enabled:false}]);
  state.hairStyle = 'original'; // preserve warm skin, dye, eye and lip colours
  assert.equal(glasses().status, 'registered');
  geometry.eyeSample = 'changed';
  assert.equal(glasses().reason, 'glasses-head-incompatible');
  headDependency.faceGeometry = 'unknown';
  assert.equal(glasses().reason, 'glasses-head-dependency-invalid');
});

test('publisher VRM0 wears only its own three bindings in the source outfit', async () => {
  const {controller} = await fixture('source-male-ab9a-v1');
  const {body, outfits, liveAccessories} = queryCharacterProduction(controller);
  assert.equal(sha256(await readFile(publicFile(body.url))), body.sha256);
  assert.notEqual(body.sha256, FOUNDATION_PROFILES.male.sha256);
  assert.deepEqual(outfits.map(look => look.role), ['pants']);
  assert.deepEqual(outfits[0].equipment.map(item => item.role), ['top', 'shoes', 'pants']);
  for (const item of outfits[0].equipment) assert.equal(item.materials.binding.bodySha256, body.sha256);
  assert.equal(liveAccessories.mic.status, 'unavailable');
  assert.equal(liveAccessories.glasses.status, 'unavailable');
});

test('female texture release retains the two independently fitted torso selections', async () => {
  const base = foundationProfile('female'), derived = foundationProfile('source-female-uniform-texture-v1');
  const {controller} = await fixture(derived.id);
  const choices = queryCharacterProduction(controller);
  assert.equal(fittedChoice(choices.liveAccessories.glasses).templeFit.bodySha256, derived.sha256);
  assert.deepEqual(choices.outfits.map(row => row.index), [0, 5, 6]);
  const at = index => choices.outfits.find(row => row.index === index).equipment;
  const baseClothes = items => items.filter(row => ['pants','topFar'].includes(row.role));
  assert.deepEqual(baseClothes(at(6)), baseClothes(at(5)));
  const thick = at(6).find(row => row.role === 'platformShoes');
  assert.equal(thick.materials.binding.bodySha256, derived.sha256);
  assert.notEqual(thick.sha256, at(5).find(row => row.role === 'shoes').sha256);
  assert.equal(sha256(await readFile(publicFile(derived.url))), derived.sha256);
  const coverage = profile => [profile.bodyCoverage, profile.additionalBodyCoverage.find(r => r.role === 'topFar').descriptor];
  for (const [i, descriptor] of coverage(derived).entries()) {
    const actual = await readFile(publicFile(descriptor.url));
    assert.equal(sha256(actual), descriptor.sha256);
    const before = await json(coverage(base)[i].url), after = JSON.parse(actual);
    const top = choices.outfits[i].equipment.find(row => row.role === (i === 0 ? 'top' : 'topFar'));
    assert.equal(after.avatarSha256, derived.sha256);
    assert.equal(after.topId, top.id);
    assert.equal(after.topSha256, top.sha256);
    assert.notEqual(after.topId, before.topId);
    assert.equal(after.selectedTriangles.length, 252);
    assert.deepEqual(after.selectedTriangles, before.selectedTriangles);
  }
});

test('1K tops are exact additions to the existing female and stripped male pants looks', async () => {
  for (const [body,index,folder] of [['female',5,'female'],['source-male-ab9a-release-v1',1,'male']]) {
    const config = foundationProfile(body);
    assert.deepEqual(outfitSelection(config,0).roles, ['top','shoes','pants']);
    const look = config.outfits.find(row => row.role === 'pants-top-far');
    assert.equal(look.index,index);
    assert.deepEqual(look.equipmentRoles,['topFar','shoes','pants']);
    assert.equal(look.bottomRole,'pants');
    const url = '/assets/garment-basecolor-release-v1/'+folder+'/equipment.json';
    const pin = config.additionalEquipmentManifests.find(row => row.url === url);
    const catalog = await readFile(publicFile(pin.url));
    assert.equal(sha256(catalog),pin.sha256);
    const {items} = JSON.parse(catalog);
    assert.equal(items.length,1);
    const [entry] = items;
    assert.equal(entry.id,config.ids.topFar);
    assert.notEqual(entry.id,config.ids.top);
    assert.equal(entry.compatibleAvatarSha256,config.sha256);
    await pinnedBytes(entry);
    const coverage = config.additionalBodyCoverage?.find(row => row.role === 'topFar');
    if(body === 'female') {
      const bytes = await readFile(publicFile(coverage.descriptor.url));
      assert.equal(sha256(bytes),coverage.descriptor.sha256);
      const fit = JSON.parse(bytes);
      assert.deepEqual([fit.avatarSha256,fit.topId,fit.topSha256],[config.sha256,entry.id,entry.sha256]);
    } else assert.equal(coverage,undefined);
  }
});

test('release and source outfits share the clothes but have separate exact fits', async () => {
  const original = foundationProfile('source-male-ab9a-v1');
  const release = foundationProfile('source-male-ab9a-release-v1');
  const loadCatalog = async profile => {
    assert.equal(sha256(await readFile(publicFile(profile.url))), profile.sha256);
    const bytes = await readFile(publicFile(profile.manifestUrl));
    assert.equal(sha256(bytes), profile.manifestSha256);
    return JSON.parse(bytes).items;
  };
  const [sourceItems,releaseItems] = await Promise.all([loadCatalog(original),loadCatalog(release)]);
  for (const p of [original,release]) assert.equal(p.baseBodyDisplay, 'source-with-hair');
  assert.equal(release.embeddedClothing,false);
  assert.notEqual(release.sha256,original.sha256);
  for (const role of ['top','pants','shoes']) {
    const oldItem = sourceItems.find(item => item.id === original.ids[role]);
    const newItem = releaseItems.find(item => item.id === release.ids[role]);
    assert.equal(newItem.compatibleAvatarSha256,release.sha256);
    assert.notEqual(newItem.fitId,oldItem.fitId);
    assert.equal(newItem.sha256,oldItem.sha256);
    assert.equal(new URL(newItem.url,publicFile(release.manifestUrl)).pathname.split('/assets/').pop(),
      new URL(oldItem.url,publicFile(original.manifestUrl)).pathname.split('/assets/').pop());
  }
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
  const expected = ['uniform-top-v1', 'lower-shorts-v1', 'plain-crew-socks-v1'];
  assert.deepEqual(female.styleVariants.map(style => style.styleId), expected);
  const shirtId = 'shared-male-studio-top-v1';
  assert.deepEqual(male.styleVariants.map(style => style.styleId), [...expected, shirtId]);
  const withShirt = male.outfits.filter(look => look.equipment.some(item => item.id === shirtId));
  assert.equal(withShirt.length, 1);
  assert.deepEqual(withShirt[0].equipment.map(item => item.id), [shirtId, 'm1b-uniform-shoes', 'm1b-uniform-pants']);
  assert.equal(female.outfits.some(look => look.equipment.some(item => item.id === shirtId)), false);
  for (const [body, query] of [['female',female],['male',male]]) {
    const [row] = query.styleVariants.find(style => style.styleId === 'plain-crew-socks-v1').variants;
    assert.equal(row.bodySha256, foundationProfile(body).sha256);
    assert.equal(row.resourceManifest, foundationProfile(body).manifestUrl + '#' + body + '-plain-crew-socks-v1');
    assert.equal(row.coverageManifest, row.fitManifest + '#bodyCoverageMasks');
  }
  for (const style of [...female.styleVariants, ...male.styleVariants]) {
    assert.equal(style.variants.length, 1);
    assert.equal(style.variants[0].status, 'candidate');
  }
  assert.deepEqual(female.runtimeVariants ?? [], []);
  assert.deepEqual(male.runtimeVariants ?? [], []);
});

test('shared 1K uniform style resolves the exact wearer and version through the default catalog', async () => {
  const fragment = JSON.parse(await readFile(new URL('../../assets-source/variant-matrix-v1/uniform-lite-top-matrix.json', import.meta.url)));
  for (const expected of fragment.styles[0].variants) {
    const query = queryCharacterProduction((await fixture(expected.bodyType)).controller);
    const style = query.styleVariants.find(row => row.styleId === 'uniform-top-v1');
    const matching = style.variants.filter(row => row.variantVersion === expected.variantVersion);
    assert.deepEqual(matching, [expected]);
    assert.equal(matching[0].bodySha256, query.body.sha256);
    assert.equal(matching[0].status, 'candidate');
    assert.equal(query.runtimeVariants.some(row => row.styleId === style.styleId &&
      row.variantVersion === expected.variantVersion), false);
  }
});

test('one platform shoe style resolves each measured body separately and keeps the unsupported source empty', async () => {
  const styleId = 'uniform-platform-shoes-v1';
  for (const folder of ['sole-variant-v1','sole-variant-female-v1']) {
    const file = new URL('../../assets-source/' + folder + '/style-fragment.json', import.meta.url);
    const [style] = JSON.parse(await readFile(file,'utf8')).styles;
    assert.equal(style.styleId, styleId);
    const [expected] = style.variants;
    const {controller} = await fixture(expected.bodyType);
    const query = queryCharacterProduction(controller);
    assert.deepEqual(query.styleVariants.find(entry => entry.styleId === styleId)?.variants, [expected]);
    assert.equal(query.runtimeVariants.some(row => row.styleId === styleId), false);
  }
  const oldBody = queryCharacterProduction((await fixture('source-male-ab9a-release-v1')).controller);
  assert.equal(oldBody.styleVariants.some(entry => entry.styleId === styleId), false);
});

test('exposes native parameter packages as exact candidate variants without inheriting admission', async () => {
  for (const entry of productionCatalog.entries) {
    const config = foundationProfile(entry.bodyType);
    assert.equal(typeof config.outfits[0].label, 'string');
    assert.notEqual(config.outfits[0].label, 'undefined');
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

test('offers the exact optional hair fit only for its two registered bodies', async () => {
  const supported = new Set(['native-contour-roundness-a-v1','native-contour-cheek-b-v1']);
  for (const bodyType of Object.keys(FOUNDATION_PROFILES)) {
    const {body,nativeHairCenter} = queryCharacterProduction((await fixture(bodyType)).controller);
    assert.equal(nativeHairCenter.default,null);
    if (!supported.has(bodyType)) { assert.deepEqual(nativeHairCenter.choices,[]); continue; }
    assert.equal(nativeHairCenter.choices.length,1);
    assert.deepEqual(await validateNativeHairCenterPin(nativeHairCenter.choices[0],body),nativeHairCenter.choices[0]);
  }
});
