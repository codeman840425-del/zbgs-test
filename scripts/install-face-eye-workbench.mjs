// Install only the exact source-authored +1% eye aperture endpoint. No range admission.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/face-eye-sample-v1'),target=path.join(root,'prototype/public/assets/face-eye-sample-v1');
const sha=b=>createHash('sha256').update(b).digest('hex'),verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const pins={female:'19913f4c8ab2f6dd52cf112117e513d4292b17a0b1944873daca2a5f9f85df21',male:'3080a3d7bdf7891d287ccf1a7086aaacb1459793b6829b2906c95d504f4d761e'};
const copies=[],entries=[];
for(const [sex,pin]of Object.entries(pins)){
 const file=`${sex}-eye.recipe.json`,bytes=fs.readFileSync(path.join(source,file));assert.equal(sha(bytes),pin);
 const recipe=JSON.parse(bytes),mouthBytes=fs.readFileSync(path.join(root,`assets-source/face-parameters-v1/${sex}-mouth-width.recipe.json`)),mouth=JSON.parse(mouthBytes);
 assert.equal(recipe.schema,'character-face-geometry-affine-recipe-v1');assert.equal(recipe.sampleId,'aperture-width101-v1');assert.equal(recipe.fixedEndpoint,1.01);
 assert.equal(recipe.baseAvatarSha256,sha(fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`))));
 assert.equal(recipe.existingRecipeIdentities.mouth.sha256,sha(mouthBytes));assert.equal(recipe.basePositionSha256,mouth.basePositionSha256);
 assert.equal(recipe.finalEndpointSha256,sha(fs.readFileSync(path.join(source,`generated/${sex}-eye-aperture-width101-v1/avatar.vrm`))));
 copies.push([file,bytes]);entries.push({id:recipe.id,file,sha256:pin,baseAvatarSha256:recipe.baseAvatarSha256,sampleId:recipe.sampleId});
}
const manifest=Buffer.from(JSON.stringify({schema:'character-face-eye-recipes-v1',recipes:entries},null,2)+'\n');copies.push(['recipe-manifest.json',manifest]);
for(const [name,bytes]of copies){const dest=path.join(target,name);if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(bytes),'Existing recipe differs: '+name);}
for(const [name,bytes]of copies){const dest=path.join(target,name);if(!verify){fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,bytes);}assert(fs.readFileSync(dest).equals(bytes));}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(manifest),entries},null,2));
