// Read-only asset/config audit. No avatar instantiation or acceptance claims.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { foundationProfile } from '../prototype/src/foundation-profiles.js';
import { validateForearmProfile } from '../prototype/src/forearm-envelope-projection.js';
const sha = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const local = url => path.join('prototype/public', url);
const grip = JSON.parse(fs.readFileSync('prototype/public/assets/m1c/grips/manifest.json'));
const female = foundationProfile('female');
const baseEnvelope = JSON.parse(fs.readFileSync(local(female.forearmCollision.url)));
const rows = ['m1a-jaw-v1','m1a-waisthip-v1'].map(id => {
  const p = foundationProfile(id), manifestFile = local(p.manifestUrl);
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  return {
    id, bodySha256: sha(local(p.url)), declaredBodySha256:p.sha256,
    identityMatches:sha(local(p.url))===p.sha256,
    manifestSha256:sha(manifestFile), referenceBody:p.referenceBody,
    forearmConfigPresent:Boolean(p.forearmCollision), runtimeForearmValue:p.forearmCollision??null,
    baseFemaleEnvelopeAcceptedForVariant:validateForearmProfile(baseEnvelope,p.sha256),
    exactGripEntry:grip.items.find(x=>x.compatibleAvatarSha256===p.sha256)?.id??null,
    seatLayerThickness:p.seatLayerThickness,
    equipment:manifest.items.map(item=>({id:item.id,sha256:sha(path.join(path.dirname(manifestFile),item.url)),declaredSha256:item.sha256,identityMatches:sha(path.join(path.dirname(manifestFile),item.url))===item.sha256,compatibleAvatarSha256:item.compatibleAvatarSha256,bodyMatches:item.compatibleAvatarSha256===p.sha256,requiresRawSkeleton:item.requiresRawSkeleton,bindings:item.bindings?.length??0})),
  };
});
const sources=['prototype/src/foundation-profiles.js','prototype/src/foundation-avatar.js','prototype/src/motion.js','prototype/src/forearm-envelope-projection.js','prototype/src/live-presentation.js','prototype/public/assets/m1c/grips/manifest.json','scripts/m1-variants/build-variants.py','assets-source/m1-variants/spec.json'];
const result={scope:'Current working-tree configuration and exact file identities only. No browser, Blender, dynamic surface or naturalness test.',sourceHashes:Object.fromEntries(sources.map(f=>[f,sha(f)])),rows,conclusions:{variantsHaveNoCalibratedForearmProfile:rows.every(r=>!r.forearmConfigPresent),femaleEnvelopeRejectedByExactBodySHA:rows.every(r=>!r.baseFemaleEnvelopeAcceptedForVariant),variantMicrophoneGripMissing:rows.every(r=>!r.exactGripEntry),assetIdentityChecksPass:rows.every(r=>r.identityMatches&&r.equipment.every(e=>e.identityMatches&&e.bodyMatches))}};
fs.writeFileSync('evidence/variant-forearm-config-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.conclusions));
