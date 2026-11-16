// One source-contract installer; old recipe directories remain byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {VISIBLE_FACE_SOURCES} from '../prototype/src/facial-geometry-contract.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const verify=process.argv.includes('--verify'),sha=b=>createHash('sha256').update(b).digest('hex');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const schemas={mouth:'character-face-geometry-recipes-v1',brow:'character-face-brow-recipes-v1',nose:'character-face-nose-recipes-v1',eye:'character-face-eye-recipes-v1'};
const result=[],copies=[];
for(const [domain,config]of Object.entries(VISIBLE_FACE_SOURCES)){
 const source=path.join(root,'assets-source',config.directory),dest=path.join(root,'prototype/public/assets',config.directory);
 const manifestBytes=fs.readFileSync(path.join(source,'recipe-manifest.json'));
 assert.equal(sha(manifestBytes),config.manifestSha256,'Frozen source catalog: '+domain);
 const sourceCatalog=JSON.parse(manifestBytes),entries=[];
 for(const [sex,pin]of Object.entries(config.recipes)){
  const sourceEntry=sourceCatalog.recipes.find(e=>e.sha256===pin);assert(sourceEntry);
  const bytes=fs.readFileSync(path.join(source,sourceEntry.file));assert.equal(sha(bytes),pin);
  const recipe=JSON.parse(bytes),body=fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
  assert.equal(recipe.baseAvatarSha256,sha(body));assert.equal(sourceEntry.baseAvatarSha256,recipe.baseAvatarSha256);
  const original=JSON.parse(fs.readFileSync(path.join(root,`assets-source/face-parameters-v1/${sex}-mouth-width.recipe.json`)));
  assert.equal(recipe.basePositionSha256,original.basePositionSha256);assert.equal(recipe.positionCount,original.positionCount);
  for(const identity of original.primitiveIdentities){
   const candidate=recipe.primitiveIdentities.find(p=>p.primitiveIndex===identity.primitiveIndex);assert(candidate);
   for(const field of ['materialName','positionSha256','uvSha256','indexSha256','targetCount'])assert.equal(candidate[field],identity[field],domain+':'+field);
  }
  if(domain==='mouth'){
   assert.deepEqual(recipe.supportedValues,config.values);assert.deepEqual(recipe.range,[-.12,.12]);
   for(const endpoint of recipe.endpoints)assert.equal(sha(fs.readFileSync(path.join(source,endpoint.finalPath))),endpoint.finalEndpointSha256);
  }else{
   const mouthRef=domain==='brow'?recipe.mouthRecipe.sha256:domain==='nose'?recipe.mouthRecipeSha256:recipe.existingRecipeIdentities.mouth.sha256;
   assert.equal(mouthRef,VISIBLE_FACE_SOURCES.mouth.recipes[sex]);
   if(domain==='brow')assert.deepEqual(recipe.testedCombinedEndpoint,[config.endpoint,config.endpoint]);
   else{
    assert.equal(recipe.sampleId,config.sampleId);assert.equal(recipe.fixedEndpoint,config.endpoint);
    const tag=domain==='nose'?'nose-tip-forward2-v2':'eye-aperture-width105-v2';
    assert.equal(sha(fs.readFileSync(path.join(source,`generated/${sex}-${tag}/avatar.vrm`))),recipe.finalEndpointSha256);
   }
  }
  copies.push([path.join(dest,sourceEntry.file),bytes]);
  entries.push({id:recipe.id,file:sourceEntry.file,sha256:pin,baseAvatarSha256:recipe.baseAvatarSha256,
   ...(domain==='mouth'?{supportedValues:config.values}:{sampleId:config.sampleId})});
 }
 const runtime=Buffer.from(JSON.stringify({schema:schemas[domain],sourceManifestSha256:config.manifestSha256,recipes:entries},null,2)+'\n');
 copies.push([path.join(dest,'recipe-manifest.json'),runtime]);result.push({domain,directory:config.directory,manifestSha256:sha(runtime),entries});
}
// Check every existing output before any write: a failed install cannot mix generations.
for(const [dest,bytes]of copies)if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(bytes),'Existing resource differs: '+dest);
for(const [dest,bytes]of copies){if(!verify){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}assert(fs.readFileSync(dest).equals(bytes));}
console.log(JSON.stringify({verified:true,copied:!verify,result},null,2));
