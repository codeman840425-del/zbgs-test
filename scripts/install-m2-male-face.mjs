// Install the one audited male jaw specimen as data, retaining the M1 profiles.
// This does not build, promote a release, or grant accessory/dance compatibility.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'assets-source/m2-male-face-v1');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(await fs.readFile(path.join(source,'fit-receipt.json'),'utf8'));
const audit=await fs.readFile(path.join(source,'audit-report.json'));
assert.equal(sha(audit),receipt.evidence.auditSha256);
assert.equal(receipt.evidence.fullBodyAttributesAndIndexByteEqual,true);
assert.equal(receipt.evidence.skeletonRestAndInverseBindExact,true);
const parent=await fs.readFile(path.join(root,'prototype/public/assets/m1b/equipment.json'));
assert.equal(sha(parent),receipt.parentManifestSha256);
// Check all inputs before mutation; existing different resources are never overwritten.
const copies=[];
for(const [relative,url] of Object.entries(receipt.installMapping)){
  assert(url.startsWith('/assets/')&&!url.includes('..'));
  const bytes=await fs.readFile(path.join(source,relative));
  assert.equal(sha(bytes),receipt.generatedFiles[path.basename(relative)]);
  const target=path.join(root,'prototype/public',url.slice(1));
  const old=await fs.readFile(target).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(old)assert(old.equals(bytes),'Existing resource differs: '+target);
  copies.push({target,bytes});
}
const entryBytes=await fs.readFile(path.join(source,'generated/profile-entry.json'));
assert.equal(sha(entryBytes),receipt.generatedFiles['profile-entry.json']);
const entry=JSON.parse(entryBytes);
assert.equal(entry.id,'m2-male-jaw-v1');
assert.equal(entry.sha256,receipt.evidence.newAvatarSha256);
const config=path.join(root,'prototype/src/foundation-profiles.js');
let text=await fs.readFile(config,'utf8');
const newline=text.includes('\r\n')?'\r\n':'\n';
const begin='// BEGIN audited M2 male jaw specimen';
const end='// END audited M2 male jaw specimen';
const block=[begin,`FOUNDATION_PROFILES["${entry.id}"] = ${JSON.stringify(entry,null,2)};`,end,''].join('\n').replaceAll('\n',newline);
if(text.includes(begin)){
  const existing=text.slice(text.indexOf(begin),text.indexOf(end)+end.length+newline.length);
  assert.equal(existing,block,'Existing profile differs; review before replacing');
}else{
  assert(!text.includes(`FOUNDATION_PROFILES["${entry.id}"]`));
  const anchor='export function foundationProfile(';
  assert(text.includes(anchor));text=text.replace(anchor,block+newline+anchor);
}
for(const {target,bytes} of copies){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
await fs.writeFile(config,text);
console.log(JSON.stringify({id:entry.id,sha256:entry.sha256,resources:copies.map(x=>path.relative(root,x.target)),profile:'prototype/src/foundation-profiles.js',releasePointerChanged:false}));
