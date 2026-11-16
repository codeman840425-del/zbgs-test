import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
async function files(dir){let entries;try{entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const result=[];for(const e of entries){const p=path.posix.join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const inputs=[...await files('src/company'),...await files('public/company-assets'),'company.html','vite.company.config.js','scripts/build-company-id.mjs','package.json','package-lock.json'].sort();
const hash=createHash('sha256');for(const file of inputs){hash.update(file);hash.update('\0');hash.update(await fs.readFile(path.join(root,file)));hash.update('\0');}
const sourceDigest=hash.digest('hex');await fs.writeFile(path.join(root,'public/company-build-info.json'),JSON.stringify({shortId:sourceDigest.slice(0,12),sourceDigest,inputs},null,2)+'\n');console.log(sourceDigest.slice(0,12));
