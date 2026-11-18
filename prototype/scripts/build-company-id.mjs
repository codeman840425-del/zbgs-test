import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
async function files(dir){let entries;try{entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const result=[];for(const e of entries){const p=path.posix.join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const catalog=JSON.parse(await fs.readFile(path.join(root,'src/company/library-catalog.json'),'utf8'));
const registeredAssetDirs=new Set(catalog.resources.flatMap(resource => resource.asset?.url
  ? [path.posix.dirname(path.posix.join('public', resource.asset.url.replace(/^\//,'')))] : []));
const publicAssetFiles=await files('public/company-assets');
const registeredRoots=new Set([...registeredAssetDirs].map(dir => dir.split('/').slice(0,3).join('/')));
const unregistered=publicAssetFiles.filter(file => {
  if ([...registeredAssetDirs].some(dir => file.startsWith(`${dir}/`))) return false;
  const parts=file.split('/');
  return !registeredRoots.has(parts.slice(0,3).join('/'));
});
if(unregistered.length)throw Error(`unregistered-company-assets: ${unregistered.join(',')}`);
const inputs=[...await files('src/company'),...publicAssetFiles,'company.html','vite.company.config.js','scripts/build-company-id.mjs','package.json','package-lock.json'].sort();
const hash=createHash('sha256');for(const file of inputs){hash.update(file);hash.update('\0');hash.update(await fs.readFile(path.join(root,file)));hash.update('\0');}
const sourceDigest=hash.digest('hex');await fs.writeFile(path.join(root,'public/company-build-info.json'),JSON.stringify({shortId:sourceDigest.slice(0,12),sourceDigest,inputs},null,2)+'\n');console.log(sourceDigest.slice(0,12));
