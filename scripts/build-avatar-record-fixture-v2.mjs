import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {canonical} from './avatar-record-contract.mjs';
import {verifyEquipmentBindings} from './verify-catalog-bindings.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=process.argv[2];if(!dist)throw Error('Usage: node scripts/build-avatar-record-fixture-v2.mjs <immutable-dist>');
const base=path.resolve(root,dist),hash=b=>createHash('sha256').update(b).digest('hex'),read=url=>fs.readFileSync(path.join(base,url));
const legacyBytes=fs.readFileSync(path.join(root,'schemas/fixtures/avatar-record-catalog-v1.json')),catalog=JSON.parse(legacyBytes),oldVersion=catalog.catalogVersion;
const build=JSON.parse(read('/build-info.json'));if(build.development||!/^[a-f0-9]{64}$/.test(build.sourceDigest))throw Error('Fixed build required');
// Never import a newer live config into an older fixed candidate. Matching full
// source digest also covers derived foundationProfile().outfits in config hash.
const sourceRoot=path.resolve(root,process.argv.find(x=>x.startsWith('--source-root='))?.slice(14)||'prototype'),sourceHash=createHash('sha256');
for(const file of build.inputs){sourceHash.update(file);sourceHash.update('\0');sourceHash.update(fs.readFileSync(path.join(sourceRoot,file)));sourceHash.update('\0');}
if(sourceHash.digest('hex')!==build.sourceDigest)throw Error('Source tree differs from fixed build; provide matching --source-root');
const {foundationProfile}=await import(pathToFileURL(path.join(sourceRoot,'src/foundation-profiles.js')));
catalog.styleMap['m1b-uniform-shorts-v1']='qa-style:male-tailored-shorts-v1';
const url='/assets/m1c/grips/manifest.json',bytes=read(url),manifest=JSON.parse(bytes);if(manifest.schema!=='zbgs-grip-profile-manifest-v1')throw Error('Wrong grip manifest');
catalog.catalogVersion='zbgs-qa-avatar-catalog-v2';catalog.scope='QA-only v2 attachment identity; production saves/migration are not implemented';catalog.legacy={catalogVersion:oldVersion,sha256:hash(legacyBytes)};catalog.presentationBuild={shortId:build.shortId,sourceDigest:build.sourceDigest};catalog.gripManifest={url,schema:manifest.schema,sha256:hash(bytes)};
for(const body of catalog.bodies){
 const p=foundationProfile(body.bodyType),bodyBytes=read(p.url);
 if(p.id!==body.baseId||p.sha256!==body.recordBody.sha256||hash(bodyBytes)!==p.sha256)throw Error('Body identity changed; new explicit body mapping required');
 // Existing accessories remain explicit fixed resources. Equipment manifests
 // can evolve only through full resource/slot/body/raw-bind verification below.
 for(const resource of catalog.accessories.map(x=>({url:x.url,sha256:x.record.sha256})))if(hash(read(resource.url))!==resource.sha256)throw Error('Accessory resource changed: '+resource.url);
 const emBytes=read(p.manifestUrl),em=JSON.parse(emBytes);
 if(em.schema!=='zbgs-equipment-v1'||!Array.isArray(em.items)||new Set(em.items.map(x=>x.id)).size!==em.items.length)throw Error('Equipment schema/IDs');
 body.fits=em.items.map(x=>{const url=path.posix.join(path.posix.dirname(p.manifestUrl),x.url),raw=read(url);if(!catalog.styleMap[x.id]||!['top','bottom','shoes'].includes(x.slot)||hash(raw)!==x.sha256||raw.length!==x.bytes||x.compatibleAvatarSha256!==p.sha256)throw Error('Equipment identity/slot/body mismatch '+x.id);return {url,bindCheck:verifyEquipmentBindings(raw,bodyBytes,x),record:{slot:x.slot,styleId:catalog.styleMap[x.id],fitResourceId:x.id,resourceVersion:'sha256:'+x.sha256,sha256:x.sha256,compatibleBodySha256:x.compatibleAvatarSha256,...(x.styleId?{sourceStyleId:x.styleId}:{}),...(x.fitId?{fitId:x.fitId}:{})}};});
 body.outfits=p.outfits.map(o=>({index:o.index,items:[p.ids.top,p.ids.shoes,p.ids[o.role]].map((id,i)=>{const fit=body.fits.find(x=>x.record.fitResourceId===id);if(!fit||fit.record.slot!==['top','shoes','bottom'][i])throw Error('Profile outfit missing/wrong slot '+id);return fit.record;})}));
 body.recordBody.fitProfileVersion='sha256:'+hash(canonical(p));
 const amURL='/assets/m1c/accessories.json',amBytes=read(amURL),am=JSON.parse(amBytes);
 for(const a of catalog.accessories){const actual=am.items.find(x=>x.id===a.record.fitResourceId);if(!actual||actual.url!==a.url||actual.sha256!==a.record.sha256)throw Error('Accessory manifest identity mismatch');}
 body.manifestVersions=[{url:p.manifestUrl,schema:em.schema,sha256:hash(emBytes)},{url:amURL,schema:am.schema,sha256:hash(amBytes)}];
 const e=manifest.items.find(x=>x.compatibleAvatarSha256===body.recordBody.sha256);if(!e)throw Error('No compatible grip');const raw=read(e.url),g=JSON.parse(raw),mic=catalog.accessories.find(x=>x.record.slot==='mic').record;if(raw.length!==e.bytes||hash(raw)!==e.sha256||g.id!==e.id||g.schema!=='zbgs-grip-profile-v1'||g.compatibleAvatarSha256!==body.recordBody.sha256||g.accessoryId!==e.accessoryId||g.accessoryId!==mic.fitResourceId||g.compatibleAccessorySha256!==e.accessorySha256||g.compatibleAccessorySha256!==mic.sha256||!g.fitVersion)throw Error('Grip binding mismatch');
 body.grip={url:e.url,bytes:e.bytes,record:{id:g.id,sha256:e.sha256,fitVersion:g.fitVersion,compatibleAvatarSha256:g.compatibleAvatarSha256,compatibleAccessorySha256:g.compatibleAccessorySha256,method:g.method}};
 body.manifestVersions.push(catalog.gripManifest);
}
const dest=path.resolve(root,process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'schemas/fixtures/avatar-record-catalog-v2.json');fs.writeFileSync(dest,JSON.stringify(catalog,null,2)+'\n');console.log(dest);
