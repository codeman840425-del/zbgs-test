// Explicit QA style registry; not a production garment catalog. Run deliberately
// when approving new resource versions, then review the versioned fixture diff.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {FOUNDATION_PROFILES} from '../prototype/src/foundation-profiles.js';
import {canonical} from './avatar-record-contract.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),pub=path.join(root,'prototype/public');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=url=>{const bytes=fs.readFileSync(path.join(pub,url));return {data:JSON.parse(bytes),sha256:hash(bytes),url};};
const accessories=read('/assets/m1c/accessories.json');
const styleMap={
 'm1-uniform-top':'qa-style:female-uniform-top-v1',
 'm1-uniform-shoes':'qa-style:female-flat-shoes-v1',
 'm1-training-pants':'qa-style:female-training-pants-v1',
 'm1-uniform-skirt':'qa-style:female-uniform-skirt-v1',
 'm1b-uniform-top':'qa-style:male-uniform-top-v1',
 'm1b-uniform-shoes':'qa-style:male-flat-shoes-v1',
 'm1b-uniform-pants':'qa-style:male-uniform-pants-v1',
 'studio-microphone-v1':'qa-style:studio-microphone-v1',
 'studio-glasses-v1':'qa-style:studio-glasses-v1'
};
const accessorySlots={'studio-microphone-v1':'mic','studio-glasses-v1':'glasses'};
for(const x of accessories.data.items)if(!accessorySlots[x.id]||hash(fs.readFileSync(path.join(pub,x.url)))!==x.sha256)throw Error('Accessory pin or slot mismatch');
const catalog={catalogVersion:'zbgs-qa-avatar-catalog-v1',scope:'QA-only mapping. No cross-body same-style compatibility claim; immutable IDs preserve actual source fit identities.',styleMap,bodies:[],accessories:accessories.data.items.map(x=>({url:x.url,record:{slot:accessorySlots[x.id],styleId:styleMap[x.id],fitResourceId:x.id,resourceVersion:'sha256:'+x.sha256,sha256:x.sha256}}))};
for(const bodyType of ['female','male']){
 const p=FOUNDATION_PROFILES[bodyType],m=read(p.manifestUrl);
 if(hash(fs.readFileSync(path.join(pub,p.url)))!==p.sha256)throw Error('Body pin mismatch');
 const fits=m.data.items.map(x=>{const url=path.posix.join(path.posix.dirname(p.manifestUrl),x.url);if(hash(fs.readFileSync(path.join(pub,url)))!==x.sha256)throw Error('Fit pin mismatch');return {url,record:{slot:x.slot,styleId:styleMap[x.id],fitResourceId:x.id,resourceVersion:'sha256:'+x.sha256,sha256:x.sha256,compatibleBodySha256:x.compatibleAvatarSha256}};});
 const outfits=(bodyType==='female'?[0,1]:[0]).map(index=>({index,items:[p.ids.top,p.ids.shoes,index?p.ids.skirt:p.ids.pants].map(id=>fits.find(x=>x.record.fitResourceId===id).record)}));
 catalog.bodies.push({bodyType,baseId:p.id,url:p.url,recordBody:{baseId:p.id,resourceVersion:'sha256:'+p.sha256,sha256:p.sha256,fitProfileVersion:'sha256:'+hash(canonical(p)),parameters:{}},manifestVersions:[{url:m.url,schema:m.data.schema,sha256:m.sha256},{url:accessories.url,schema:accessories.data.schema,sha256:accessories.sha256}],fits,outfits});
}
const dest=path.join(root,'schemas/fixtures/avatar-record-catalog-v1.json');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(catalog,null,2)+'\n');console.log(dest);
