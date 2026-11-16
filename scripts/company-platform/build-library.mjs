import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {catalogMaps} from '../../prototype/src/company/document.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const plan=JSON.parse(await fs.readFile(new URL('./library-inputs.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,plan.base),'utf8'));
for(const resource of catalog.resources){
  const fit=plan.adaptations?.[`${resource.id}@${resource.version}`];
  if(fit){Object.assign(resource,structuredClone(fit));resource.provenance={...resource.provenance,authoringAdaptation:'scripts/company-platform/library-inputs.json'};}
  const materialSlots={};
  function scan(node){if(node.type==='mesh')materialSlots[node.id]=[node.id];for(const child of node.children||[])scan(child);}
  if(resource.node)scan(resource.node);
  resource.materialSlots=materialSlots;
}
for(const name of plan.resources){
  const resource=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
  const asset=resource.asset,publicRoot=path.resolve(root,'prototype/public'),target=path.resolve(publicRoot,'.'+asset.url);
  if(!asset.url.startsWith('/company-assets/')||!target.startsWith(publicRoot+path.sep))throw Error(`Asset URL must stay inside company-assets: ${name}`);
  const bytes=await fs.readFile(target),hash=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==asset.bytes||hash!==asset.sha256)throw Error(`Resource bytes differ from registration: ${name}`);
  if(!resource.provenance?.license||!resource.provenance?.sourceParameters)throw Error(`Missing source or usage information: ${name}`);
  catalog.resources.push(resource);
}
catalogMaps(catalog,{templates:[]});
const output=path.join(root,plan.output),text=JSON.stringify(catalog,null,2)+'\n';
if(process.argv.includes('--check')){if(await fs.readFile(output,'utf8')!==text)throw Error('Registered catalog is stale');}
else await fs.writeFile(output,text);
console.log(JSON.stringify({output:plan.output,resources:catalog.resources.length,mode:process.argv.includes('--check')?'checked':'built'}));
