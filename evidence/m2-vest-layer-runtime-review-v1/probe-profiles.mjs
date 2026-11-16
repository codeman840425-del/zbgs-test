import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {foundationProfile,FOUNDATION_PROFILES} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {resolveEquipmentSet} from '../../prototype/src/equipment-set.js';
import {validateLayerFit} from '../../prototype/src/garment-layer-fit.js';
const root=new URL('../../',import.meta.url),read=relative=>fs.readFile(new URL(relative,root));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalSource=execFileSync('git',['show','6238df63:prototype/src/foundation-profiles.js']);
const baselineSource=originalSource.toString().replace("'./representative-batch.js'",JSON.stringify(new URL('prototype/src/representative-batch.js',root).href));
const baseline=await import('data:text/javascript;base64,'+Buffer.from(baselineSource).toString('base64'));
const targets=['female','female-round-full-v2','female-soft-wide-v2'];
const checks=[];
for(const id of Object.keys(baseline.FOUNDATION_PROFILES)){
 const before=baseline.foundationProfile(id),after=foundationProfile(id);
 assert.equal(before.sha256,after.sha256);assert.equal(before.manifestUrl,after.manifestUrl);
 for(const [role,entryId] of Object.entries(before.ids))assert.equal(after.ids[role],entryId);
 for(const look of before.outfits){assert.deepEqual(after.outfits.find(x=>x.index===look.index),look);assert.deepEqual(outfitSelection(after,look.index).ids,outfitSelection(before,look.index).ids);}
 if(!targets.includes(id))assert.deepEqual(after,before);
 checks.push({id,originalOutfitCount:before.outfits.length,legacyOutfitsUnchanged:true});
}
const publication=JSON.parse(await read('assets-source/m2-vest-layer-fit-v1/publication.json'));
for(const file of publication.outputs){const bytes=await read(file.path);assert.equal(hash(bytes),file.sha256);assert.equal(bytes.length,file.bytes);}
const profileChecks=[];
for(const id of targets){
 const profile=foundationProfile(id),manifestFile='prototype/public'+profile.manifestUrl;
 const primaryBytes=await read(manifestFile),oldBytes=execFileSync('git',['show','6238df63:'+manifestFile]);assert(primaryBytes.equals(oldBytes));
 const primary=JSON.parse(primaryBytes),descriptor=profile.additionalEquipmentManifests.at(-1);
 const extensionBytes=await read('prototype/public'+descriptor.url);assert.equal(hash(extensionBytes),descriptor.sha256);
 const extension=JSON.parse(extensionBytes);assert.equal(extension.items.length,1);
 const entry=extension.items[0];assert.equal(entry.id,profile.ids.fitTop);
 const catalog=[...primary.items,entry],selected=outfitSelection(profile,4);
 resolveEquipmentSet(catalog,selected.ids,profile.sha256);
 const fitBytes=await read('prototype/public'+entry.layerFitResource.url);assert.equal(hash(fitBytes),entry.layerFitResource.sha256);
 const fit=JSON.parse(fitBytes);validateLayerFit(entry,fit,profile.sha256,catalog);
 const coverage=profile.additionalBodyCoverage.find(c=>c.role==='fitTop').descriptor;
 const coverageBytes=await read('prototype/public'+coverage.url);assert.equal(hash(coverageBytes),coverage.sha256);
 const mask=JSON.parse(coverageBytes);assert.equal(mask.topFitIdentity.sha256,hash(fitBytes));assert.equal(mask.topFitIdentity.id,entry.fitId);assert.equal(mask.avatarSha256,profile.sha256);assert.equal(mask.topSha256,entry.sha256);
 const second=foundationProfile(id);profile.ids.fitTop='local mutation';assert.equal(second.ids.fitTop,entry.id);
 profileChecks.push({id,bodySHA256:profile.sha256,primaryManifestByteExactToBaseline:true,extensionSHA256:descriptor.sha256,fitSHA256:hash(fitBytes),coverageSHA256:coverage.sha256,coverageTopFitLinkExact:true,independentConfigClone:true});
}
const result={passed:true,baseline:'6238df63',legacyProfileCount:checks.length,legacyProfiles:checks,publicationOutputsVerified:publication.outputs.length,profiles:profileChecks,scope:'Actual JSON imports/profile resolver, published descriptors and source hashes. No publisher writes, resource loading or visual acceptance.'};
await fs.writeFile(new URL('profile-publication-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,legacyProfiles:checks.length,publishedOutputs:publication.outputs.length,layerProfiles:profileChecks.length}));
