import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateForearmProfile} from '../../prototype/src/forearm-envelope-projection.js';
const root=new URL('../../assets-source/m2-male-face-v1/',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
const profile=read('generated/profile-entry.json'),forearm=read('generated/forearm-profile.json'),equipment=read('generated/equipment.json'),spec=read('spec.json');
assert(validateForearmProfile(forearm,profile.sha256));assert(!validateForearmProfile(forearm,spec.sourceVRMSha256));assert.equal(hash('generated/avatar.vrm'),profile.sha256);assert.equal(hash('generated/forearm-profile.json'),profile.forearmCollision.sha256);assert.equal(profile.referenceBody,'male');assert(!profile.handSurfaceContact);assert(!profile.bodyCoverage);
for(const e of equipment.items){assert.equal(e.compatibleAvatarSha256,profile.sha256);assert.notEqual(e.compatibleAvatarSha256,spec.sourceVRMSha256);assert(!e.materialRecipes?.length);assert.equal(new URL(e.url,'http://localhost'+profile.manifestUrl).pathname,'/assets/m1b/'+e.url)}
assert.equal(equipment.items.length,4);const result={schema:'m2-male-jaw-fit-data-check-v1',forearmActualValidatorAcceptsNewSha:true,forearmRejectsParentSha:true,resourceUrlBasePreserved:true,equipmentEntries:4,assetPin:true,unadaptedOptionalProfilesAbsent:true,limits:'No browser or posed visual acceptance'};fs.writeFileSync(new URL('fit-data-check.json',root),JSON.stringify(result,null,2));console.log(result);
