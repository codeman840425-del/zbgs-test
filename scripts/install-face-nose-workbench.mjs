// Install only the exact source-authored +0.5 mm endpoint. No range admission.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/face-nose-parameters-v1'),target=path.join(root,'prototype/public/assets/face-nose-parameters-v1');
const sha=b=>createHash('sha256').update(b).digest('hex'),verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const pins={female:'351c825c39d5a9a056fdd9c783d9ace35b304963c8d06a74e2ccfb3bd3b36da6',male:'323d584194c25af47169c1ffd1a20246033bca07e6be7d68ddb8794b25c7a3bc'};
const copies=[],entries=[];
for(const [sex,pin]of Object.entries(pins)){
 const file=`${sex}-nose.recipe.json`,bytes=fs.readFileSync(path.join(source,file));assert.equal(sha(bytes),pin);
 const recipe=JSON.parse(bytes),mouthBytes=fs.readFileSync(path.join(root,`assets-source/face-parameters-v1/${sex}-mouth-width.recipe.json`)),mouth=JSON.parse(mouthBytes);
 assert.equal(recipe.schema,'character-face-geometry-displacement-recipe-v1');assert.equal(recipe.sampleId,'tip-forward05-v1');assert.equal(recipe.fixedEndpoint,.0005);
 assert.equal(recipe.baseAvatarSha256,sha(fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`))));
 assert.equal(recipe.mouthRecipeSha256,sha(mouthBytes));assert.equal(recipe.basePositionSha256,mouth.basePositionSha256);
 assert.equal(recipe.finalEndpointSha256,sha(fs.readFileSync(path.join(source,`generated/${sex}-nose-tip-forward05-v1/avatar.vrm`))));
 copies.push([file,bytes]);entries.push({id:recipe.id,file,sha256:pin,baseAvatarSha256:recipe.baseAvatarSha256,sampleId:recipe.sampleId});
}
const manifest=Buffer.from(JSON.stringify({schema:'character-face-nose-recipes-v1',recipes:entries},null,2)+'\n');copies.push(['recipe-manifest.json',manifest]);
for(const [name,bytes]of copies){const dest=path.join(target,name);if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(bytes),'Existing recipe differs: '+name);}
for(const [name,bytes]of copies){const dest=path.join(target,name);if(!verify){fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,bytes);}assert(fs.readFileSync(dest).equals(bytes));}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(manifest),entries},null,2));
