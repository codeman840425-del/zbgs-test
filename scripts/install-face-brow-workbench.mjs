// One source-tested combined endpoint; no continuous brow range is admitted.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/face-brow-parameters-v1');
const target=path.join(root,'prototype/public/assets/face-brow-parameters-v1');
const sha=b=>createHash('sha256').update(b).digest('hex');
const verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const sourceManifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
const copies=[],entries=[];
for(const sex of ['female','male']){
 const file=`${sex}-brow.recipe.json`,bytes=fs.readFileSync(path.join(source,file));
 const pin=sourceManifest.files.find(e=>e.path===`assets-source/face-brow-parameters-v1/${file}`);
 assert(pin);assert.equal(sha(bytes),pin.sha256);
 const recipe=JSON.parse(bytes),mouthBytes=fs.readFileSync(path.join(root,recipe.mouthRecipe.path)),mouth=JSON.parse(mouthBytes);
 assert.equal(sha(mouthBytes),recipe.mouthRecipe.sha256);
 assert.equal(recipe.schema,'character-face-brow-translation-recipe-v1');
 assert.equal(recipe.baseAvatarSha256,mouth.baseAvatarSha256);assert.equal(recipe.basePositionSha256,mouth.basePositionSha256);
 assert.equal(recipe.positionCount,mouth.positionCount);assert.deepEqual(recipe.testedCombinedEndpoint,[.001,.001]);
 const body=fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 assert.equal(sha(body),recipe.baseAvatarSha256);
 const identities=recipe.primitiveIdentities.map(identity=>{
  const original=mouth.primitiveIdentities.find(p=>p.materialName===identity.materialName);assert(original);
  for(const field of ['indexSha256','positionSha256','targetCount'])assert.equal(identity[field],original[field]);
  return {...identity,primitiveIndex:original.primitiveIndex,uvSha256:original.uvSha256};
 });
 const runtime={...recipe,sourceRecipeSha256:sha(bytes),coordinateSpace:'glTF-mesh-local-metres',sampleId:'height1-spacing1-v1',primitiveIdentities:identities};
 const output=Buffer.from(JSON.stringify(runtime,null,2)+'\n'),name=`${sex}-brow.runtime.json`;
 copies.push([name,output]);entries.push({id:recipe.id,file:name,sha256:sha(output),sourceRecipeSha256:sha(bytes),baseAvatarSha256:recipe.baseAvatarSha256,sampleId:runtime.sampleId});
}
const manifest=Buffer.from(JSON.stringify({schema:'character-face-brow-recipes-v1',recipes:entries},null,2)+'\n');
copies.push(['recipe-manifest.json',manifest]);
for(const [name,data]of copies){const dest=path.join(target,name);if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(data),'Existing recipe differs: '+name);}
for(const [name,data]of copies){const dest=path.join(target,name);if(!verify){fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,data);}assert(fs.readFileSync(dest).equals(data));}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(manifest),entries},null,2));
