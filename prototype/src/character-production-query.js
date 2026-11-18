import {queryAppearanceCandidates} from './appearance-candidates.js';
import {FOUNDATION_PROFILES} from './foundation-profiles.js';
import accessoryManifest from '../public/assets/m1c/accessories.json' with {type:'json'};
import gripManifest from '../public/assets/m1c/grips/manifest.json' with {type:'json'};
import templeManifest from './glasses-temple-fit-manifest.json' with {type:'json'};
import {MICROPHONE_PRESENTATION_FITS} from './microphone-presentation-fits.js';
import variantMatrix from '../../assets-source/variant-matrix-v1/representative-matrix.json' with {type:'json'};

const SHA256 = /^[a-f0-9]{64}$/;

function bodyRegistration(bodyType, {id, label, url, sha256}) {
  return {bodyType, id, label, url, sha256, status:'registered'};
}

function resourcePin(entry) {
  if (!entry || typeof entry.url !== 'string' || !entry.url ||
      !SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) return null;
  return {url:entry.url, sha256:entry.sha256, bytes:entry.bytes};
}

function accessoryAsset(id) {
  const pin = resourcePin(accessoryManifest.items.find(entry => entry.id === id));
  return pin && {id, ...pin, manifestUrl:'/assets/m1c/accessories.json', license:accessoryManifest.license};
}

function liveAccessoryChoices(bodySha256) {
  const microphone = accessoryAsset('studio-microphone-v1');
  const grip = gripManifest.items.find(entry => entry.compatibleAvatarSha256 === bodySha256);
  const gripPin = resourcePin(grip);
  const presentation = MICROPHONE_PRESENTATION_FITS[bodySha256];
  const registeredGrip = microphone && gripPin && grip.accessoryId === microphone.id &&
    grip.accessorySha256 === microphone.sha256;
  const registeredPresentation = microphone && presentation?.bodySha256 === bodySha256 &&
    presentation.microphoneSha256 === microphone.sha256 && SHA256.test(presentation.anchorSourceSha256);

  const glasses = accessoryAsset('studio-glasses-v1');
  const templePin = resourcePin(templeManifest.profiles.find(entry => entry.bodySHA256 === bodySha256));
  const microphoneEnabled = registeredGrip && registeredPresentation ? {
    enabled:true,
    asset:microphone,
    grip:{id:grip.id, ...gripPin, bodySha256, accessorySha256:microphone.sha256,
      manifestUrl:'/assets/m1c/grips/manifest.json'},
    presentationFit:{id:presentation.id, bodySha256, microphoneSha256:presentation.microphoneSha256,
      anchorSourceSha256:presentation.anchorSourceSha256, sourcePath:'prototype/src/microphone-presentation-fits.js'},
  } : null;
  const glassesEnabled = glasses && templePin ? {
    enabled:true,
    asset:glasses,
    templeFit:{...templePin, bodySha256, sourcePath:'prototype/src/glasses-temple-fit-manifest.json'},
  } : null;

  function choices(enabled, requiresPreparation, constraints) {
    return {
      status:enabled ? 'registered' : 'unavailable',
      default:false,
      choices:enabled ? [{enabled:false}, enabled] : [{enabled:false}],
      ...(enabled ? {} : {reason:'exact-body-fit-unregistered'}),
      requiresPreparation,
      constraints,
    };
  }
  return {
    mic:choices(microphoneEnabled, ['asset and grip profile bytes', 'body, accessory and grip binding', 'presentation fit'],
      // canPerform, canStartGreeting and accessoryRestriction in live-presentation.js.
      {blockedActions:['dance'], blocksGreeting:true, enableBlockedDuring:['dance', 'greeting']}),
    glasses:choices(glassesEnabled, ['asset and temple profile bytes', 'body and accessory binding', 'source temple mesh geometry'],
      {fitMode:'exact-temple-profile'}),
  };
}

function configuredOutfits(config, appearance) {
  return appearance.equipment.sets.map(({index, role, bottomRole, manifestUrl, resources}) => {
    const look = config.outfits.find(outfit => outfit.index === index);
    return {
      index, role, bottomRole, label:look.label ?? role, manifestUrl,
      equipment:Object.entries(resources).map(([equipmentRole, entry]) => ({
        role:equipmentRole, id:entry.id, sha256:entry.sha256,
        materials:{
          default:null,
          recipes:entry.materialRecipes ?? [],
          binding:{bodySha256:entry.compatibleAvatarSha256, garmentSha256:entry.sha256,
            styleId:entry.styleId ?? null, fitId:entry.fitId ?? null},
          requiresPreparation:['recipe bytes', 'garment fit and source material names', 'allowlisted implementation'],
        },
      })),
    };
  });
}

function configuredStyleVariants(bodyType) {
  return variantMatrix.styles.map(style => ({
    styleId: style.styleId,
    label: style.label,
    variants: style.variants.filter(variant => variant.bodyType === bodyType).map(variant => ({...variant})),
  })).filter(style => style.variants.length);
}

function configuredRuntimeVariants(bodyType) {
  return configuredStyleVariants(bodyType).flatMap(style => style.variants
    .filter(variant => variant.status === 'runtime-admitted')
    .map(variant => ({styleId: style.styleId, label: style.label, ...variant})));
}

/** Return a detached JSON snapshot of registered options for an already loaded body. */
export function queryCharacterProduction(controller) {
  const actor = controller?.actor;
  const bodyType = actor?.profile?.bodyType;
  const profile = Object.hasOwn(FOUNDATION_PROFILES, bodyType) ? FOUNDATION_PROFILES[bodyType] : null;
  if (!profile || profile.sha256 !== actor.profile.sha256) {
    throw Object.assign(new Error('Expected a loaded body with a registered foundation identity'), {code:'unregistered-body'});
  }
  const appearance = queryAppearanceCandidates(controller);
  return JSON.parse(JSON.stringify({
    schema:'character-production-query-v1',
    scope:'registered-capabilities',
    body:bodyRegistration(bodyType, profile),
    bodies:Object.entries(FOUNDATION_PROFILES).map(([type, entry]) => bodyRegistration(type, entry)),
    appearance,
    liveAccessories:liveAccessoryChoices(profile.sha256),
    outfits:configuredOutfits(actor.config, appearance),
    styleVariants:configuredStyleVariants(bodyType),
    runtimeVariants:configuredRuntimeVariants(bodyType),
    limitations:[
      'Body entries identify registrations. Load the exact body to query its configured options.',
      'Apply candidates through runtime preparation to verify resource bytes, fit and commit eligibility.',
      'Apply material recipes to their selected garment. A null selection restores original materials.',
      'Capture the final record from the settled actor to save actual resource identities.',
    ],
  }));
}
