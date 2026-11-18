import { canonicalJson, sha256Hex } from './character-record.js';
import fit from './native-hair-center-fit.json' with { type: 'json' };

const EXTENSION = 'VRMC_springBone';
const prefixes = new Map(fit.springPrefixes);
export const NATIVE_HAIR_CENTER_FIT_ID = fit.id;

export function supportsNativeHairCenterFit(bodyType, bodySha256) {
  return fit.bodies.some(body => body.bodyType === bodyType && body.bodySha256 === bodySha256);
}

/** Opt-in for a parser whose caller has verified the body SHA against the loaded bytes. */
export function createNativeHairCenterFitPlugin(parser, { bodyType, bodySha256 }) {
  return {
    name: 'NativeHairCenterFit',
    async beforeRoot() {
      if (!supportsNativeHairCenterFit(bodyType, bodySha256)) {
        throw new Error('Native hair center fit body identity mismatch');
      }
      const json = parser.json;
      const extensions = json.extensions;
      const source = extensions?.[EXTENSION];
      if (!source || !json.extensionsUsed?.includes(EXTENSION)) {
        throw new Error('Native hair center fit requires VRMC_springBone');
      }
      const sourceConfig = canonicalJson(source);
      if (await sha256Hex(sourceConfig) !== fit.sourceSpringBoneSha256 ||
          extensions !== json.extensions || source !== extensions[EXTENSION] ||
          sourceConfig !== canonicalJson(source)) {
        throw new Error('Native hair center fit source spring configuration mismatch');
      }
      const center = extensions.VRMC_vrm?.humanoid?.humanBones?.[fit.centerBone]?.node;
      if (center !== fit.centerNode || !json.nodes?.[center]) {
        throw new Error('Native hair center fit humanoid center mismatch');
      }
      const springs = source.springs.flatMap((spring, index) => {
        const nodes = prefixes.get(index);
        if (!nodes) return [spring];
        const boundary = nodes.length;
        if (!boundary || spring.center !== fit.sourceCenterNode ||
            boundary >= spring.joints.length ||
            !nodes.every((node, offset) => spring.joints[offset].node === node)) {
          throw new Error(`Native hair center fit spring prefix mismatch at #${index}`);
        }
        // three-vrm 3.5.5 builds one simulated joint per adjacent pair.
        // The shared boundary is the prefix's tail and the suffix's first simulated joint.
        const fitted = { ...spring, center, joints: spring.joints.slice(0, boundary + 1) };
        if (boundary === spring.joints.length - 1) return [fitted];
        return [fitted, { ...spring, joints: spring.joints.slice(boundary) }];
      });
      json.extensions = { ...extensions, [EXTENSION]: { ...source, springs } };
    },
  };
}
