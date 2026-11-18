import fit from './native-hair-center-fit.json' with {type:'json'};
import {canonicalJson, sha256Hex} from './character-record.js';

// Identity of the whole canonical recipe, including the ordered spring prefixes.
const fitSha256 = 'd96048823af9c9f2cf73b1f263e02cb8d768be220227818e2d332b3a4a5c0fbb';

export function createNativeHairCenterPin(bodyType, bodySha256) {
  if (!fit.bodies.some(body => body.bodyType === bodyType && body.bodySha256 === bodySha256)) {
    throw new Error('Native hair center fit unavailable for recorded body');
  }
  return {id:fit.id, fitSha256, bodyType, bodySha256, sourceSpringBoneSha256:fit.sourceSpringBoneSha256};
}

export async function validateNativeHairCenterPin(pin, base) {
  const expected = createNativeHairCenterPin(base?.bodyType, base?.sha256);
  if (!pin || Object.keys(pin).length !== Object.keys(expected).length ||
      !Object.entries(expected).every(([key, value]) => Object.hasOwn(pin, key) && pin[key] === value)) {
    throw new Error('Native hair center fit pin differs from the registered body, version or source');
  }
  if (await sha256Hex(canonicalJson(fit)) !== fitSha256) throw new Error('Native hair center fit recipe digest mismatch');
  return expected;
}

export function nativeHairCenterResourceIdentities(pin) {
  if (pin === undefined) return [];
  return ['bodySha256','fitSha256','sourceSpringBoneSha256'].map(key => ({id:'nativeHairCenter/' + key, sha256:pin[key]}));
}
