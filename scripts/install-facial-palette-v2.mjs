// Install frozen topology-specific masks. A changed source needs a new reviewed asset version.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {FOUNDATION_PROFILES} from '../prototype/src/foundation-profiles.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/appearance-color-v2');
const publicRoot=path.join(root,'prototype/public');
const verify=process.argv.includes('--verify');
assert(process.argv.slice(2).every(a=>a==='--verify'),'Usage: node scripts/install-facial-palette-workbench.mjs [--verify]');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(source,'runtime-manifest.json'));
const manifest=JSON.parse(bytes);
assert.equal(manifest.schema,'character-facial-palette-v1');
const copies=new Map([['/assets/appearance-color-v2/runtime-manifest.json',bytes]]);
for(const variant of manifest.variants){
 const profile=FOUNDATION_PROFILES[variant.bodyType];
 assert.equal(profile?.sha256,variant.avatarSha256,'Missing or changed body profile');
 assert.equal(sha(fs.readFileSync(path.join(publicRoot,profile.url.slice(1)))),variant.avatarSha256);
 for(const name of ['iris','lips']){
  const part=variant.parts[name];
  assert.equal(path.posix.dirname(part.maskUrl),'/assets/appearance-color-v2');
  assert.equal(part.preserveAlpha,true);
  const mask=fs.readFileSync(path.join(source,path.posix.basename(part.maskUrl)));
  assert.equal(sha(mask),part.maskSha256,'Mask hash mismatch: '+part.maskUrl);
  copies.set(part.maskUrl,mask);
 }
}
for(const [url,data] of copies){
 const target=path.join(publicRoot,url.slice(1));
 if(fs.existsSync(target))assert(fs.readFileSync(target).equals(data),'Existing asset differs: '+target);
}
for(const [url,data] of copies){
 const target=path.join(publicRoot,url.slice(1));
 if(!verify){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
 assert(fs.readFileSync(target).equals(data));
}
console.log(JSON.stringify({verified:true,copied:!verify,manifestSha256:sha(bytes),files:copies.size,bodies:manifest.variants.map(v=>v.bodyType)}));
