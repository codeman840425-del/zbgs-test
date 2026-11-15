// Install the limited, source-verified geometric recipe. Does not admit derived bodies.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {FOUNDATION_PROFILES} from '../prototype/src/foundation-profiles.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/face-parameters-v1');
const target=path.join(root,'prototype/public/assets/face-parameters-v1');
const sha=b=>createHash('sha256').update(b).digest('hex');
const verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'));
const bytes=fs.readFileSync(path.join(source,'recipe-manifest.json')),manifest=JSON.parse(bytes);
assert.equal(manifest.schema,'character-face-geometry-recipes-v1');
const copies=[['recipe-manifest.json',bytes]];
for(const entry of manifest.recipes){
 assert.equal(path.basename(entry.file),entry.file);
 const profile=Object.values(FOUNDATION_PROFILES).find(p=>p.sha256===entry.baseAvatarSha256);assert(profile);
 assert.equal(sha(fs.readFileSync(path.join(root,'prototype/public',profile.url.slice(1)))),entry.baseAvatarSha256);
 const data=fs.readFileSync(path.join(source,entry.file));assert.equal(sha(data),entry.sha256);
 const recipe=JSON.parse(data);assert.equal(recipe.baseAvatarSha256,entry.baseAvatarSha256);assert.equal(recipe.parameter,'mouthWidth');
 copies.push([entry.file,data]);
}
for(const [file,data] of copies){const dest=path.join(target,file);if(fs.existsSync(dest))assert(fs.readFileSync(dest).equals(data),'Existing recipe differs: '+file);}
for(const [file,data] of copies){const dest=path.join(target,file);if(!verify){fs.mkdirSync(target,{recursive:true});fs.writeFileSync(dest,data);}assert(fs.readFileSync(dest).equals(data));}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(bytes),files:copies.map(([file])=>file)}));
