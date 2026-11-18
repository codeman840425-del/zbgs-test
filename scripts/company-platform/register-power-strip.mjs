import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const catalogPath=path.join(root,'prototype/src/company/library-catalog.json');
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
const resources=[];
for(const id of ['power-strip-desk','power-strip-underdesk','power-strip-tower','power-strip-usb'])
  resources.push(JSON.parse(await fs.readFile(path.join(root,'prototype/public/company-assets/power-strip-v1',id,'v1/resource.json'),'utf8')));
const ids=new Set(catalog.resources.map(resource=>`${resource.id}@${resource.version}`));
for(const resource of resources){
  const key=`${resource.id}@${resource.version}`,index=catalog.resources.findIndex(candidate=>`${candidate.id}@${candidate.version}`===key);
  if(index<0){catalog.resources.push(resource);ids.add(key);}else catalog.resources[index]=resource;
}
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({status:'registered',resources:resources.map(resource=>resource.id),catalogResources:catalog.resources.length}));
