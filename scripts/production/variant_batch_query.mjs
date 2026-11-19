// Read the configured outfit sets from the same production API as the browser.
import {registerHooks} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {checkedBytes, runtimePath} from '../runtime-package/files.mjs';

const hook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
}});

async function checkedLiveAccessories(query, runtime, load, kinds) {
  if (!query.liveAccessories) return undefined;
  const publicRoot = path.resolve(runtime, 'prototype/public');
  const checked = entry => checkedBytes(publicRoot, {...entry, path:runtimePath(entry.url)});
  const slots = {};
  for (const kind of kinds) {
    const slot = query.liveAccessories[kind];
    if (!slot) continue;
    slots[kind] = slot;
    if (slot.status !== 'registered') continue;
    try {
      const enabled = slot.choices.filter(row => row.enabled === true);
      if (enabled.length !== 1) throw Error('Expected one registered enabled choice');
      const [choice] = enabled;
      const bodySha = query.body.sha256;
      const asset = choice.asset;
      await checked(asset);
      if (kind === 'glasses') {
        const {validateTempleProfile} = await load('prototype/src/glasses-temple-fit.js');
        const profile = JSON.parse(await checked(choice.templeFit));
        if (choice.templeFit.bodySha256 !== bodySha || !validateTempleProfile(profile, bodySha, asset.sha256))
          throw Error('Glasses fit body or resource binding differs');
        if (slot.constraints?.headDependency !== undefined) {
          const {assertGlassesHeadDependency} = await load('prototype/src/glasses-head-dependency.js');
          const base = query.appearance.defaultRecipe;
          const styles = query.appearance.appearance.hairStyle.choices.map(row => row.value);
          const allowedHairStyles = styles.filter(hairStyle => {
            try {
              assertGlassesHeadDependency(slot.constraints.headDependency, {...base.appearance,hairStyle}, base.geometry);
              return true;
            } catch (error) {
              if (error.code !== 'glasses-head-incompatible') throw error;
              return false;
            }
          });
          slots[kind] = {...slot, allowedHairStyles};
        }
      } else {
        const grip = JSON.parse(await checked(choice.grip));
        const presentation = choice.presentationFit;
        if (grip.schema !== 'zbgs-grip-profile-v1' || grip.id !== choice.grip.id ||
            grip.accessoryId !== asset.id || grip.compatibleAvatarSha256 !== bodySha ||
            grip.compatibleAccessorySha256 !== asset.sha256 || presentation.bodySha256 !== bodySha ||
            presentation.microphoneSha256 !== asset.sha256)
          throw Error('Microphone grip or presentation fit binding differs');
      }
    } catch (error) {
      slots[kind] = {...slot, status:'unavailable', choices:[{enabled:false}], reason:error.message};
    }
  }
  return slots;
}

try {
  const [bodyType, root, ...kinds] = process.argv.slice(2);
  if (!bodyType || new Set(kinds).size !== kinds.length || kinds.some(kind => !['glasses', 'mic'].includes(kind)))
    throw Error('Expected a body type, optional runtime checkout and selected live accessory kinds');
  const runtime = root ?? fileURLToPath(new URL('../../', import.meta.url));
  const load = relative => import(pathToFileURL(path.resolve(runtime, relative)).href);
  const {THREE} = await load('scripts/headless-avatar-node.mjs');
  const {performCharacterProduction} = await load('prototype/src/character-production.js');
  globalThis.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const png = bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47;
    return {width:png ? bytes.readUInt32BE(16) : 1, height:png ? bytes.readUInt32BE(20) : 1, close(){}};
  };
  const renderer = {compileAsync() { throw Error('GPU compilation is unavailable in the CPU variant query'); }};
  const {query}=await performCharacterProduction({schema:'character-production-request-v1', operation:'query', bodyType},
    {scene:new THREE.Scene(), renderer});
  const outfits = query.appearance.equipment.sets.map(({index, role, resources}) => ({
    index, role, equipment:Object.values(resources).map(({id, slot, sha256}) => ({id, slot, sha256})),
  }));
  const {defaultRecipe, appearance} = query.appearance;
  // Only expose fields this exact body can persist in a character record.
  const appearanceChoices = Object.fromEntries(Object.keys(defaultRecipe.appearance).map(field => [
    field, appearance[field].choices.map(({value, supportedSkinTones}) =>
      supportedSkinTones ? {value, supportedSkinTones} : {value}),
  ]));
  const liveAccessories = kinds.length ? await checkedLiveAccessories(query, runtime, load, kinds) : undefined;
  console.log(JSON.stringify({ok:true, body:query.body, outfits,
    appearanceDefaults:defaultRecipe.appearance, appearanceChoices, liveAccessories}));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  hook.deregister();
}
