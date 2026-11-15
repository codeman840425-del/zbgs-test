import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/m2-male-jaw-mouth-v1'),target=path.join(root,'prototype/public/assets/m2-male-jaw-mouth-v1');
const sha=b=>createHash('sha256').update(b).digest('hex'),verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const packageBytes=fs.readFileSync(path.join(source,'manifest.json'));
assert.equal(sha(packageBytes),'2f21ca0ef33db35892b7fee150ff030eb1f15cd6ba8c34da7527ce93cbc0cccd');
const pkg=JSON.parse(packageBytes),copies=[];
for(const name of ['recipe-manifest.json','male-jaw-mouth-width.recipe.json']){
 const bytes=fs.readFileSync(path.join(source,name)),entry=pkg.files.find(e=>e.path==='assets-source/m2-male-jaw-mouth-v1/'+name);
 assert(entry);assert.equal(sha(bytes),entry.sha256);assert.equal(bytes.length,entry.bytes);copies.push([name,bytes]);
}
const recipe=JSON.parse(copies[1][1]);
assert.equal(sha(copies[1][1]),'e953cb663484bbf999064110e21b86c43e73db20cb7de2a49a1138a03a2c51d1');
assert.deepEqual(recipe.supportedValues,[0,.04]);assert.deepEqual(recipe.range,[0,.04]);
assert.equal(recipe.baseAvatarSha256,sha(fs.readFileSync(path.join(root,'assets-source/m2-male-face-v1/generated/avatar.vrm'))));
assert.equal(recipe.finalEndpointSha256,sha(fs.readFileSync(path.join(source,'generated/male-jaw-mouth-width-104-v1/avatar.vrm'))));
for(const [name,bytes] of copies){const dest=path.join(target,name);if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(bytes),'Refuse changed existing bytes: '+name);}
for(const [name,bytes] of copies){const dest=path.join(target,name);if(!verify){fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,bytes);}assert(fs.readFileSync(dest).equals(bytes));}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(copies[0][1]),recipeSha256:sha(copies[1][1])},null,2));
