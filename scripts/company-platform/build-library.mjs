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
const resourcePaths=[...plan.resources];
for(const collectionPath of plan.collections||[]) {
  const collection=JSON.parse(await fs.readFile(path.join(root,collectionPath),'utf8'));
  for(const entry of collection.resources)resourcePaths.push(typeof entry==='string'?entry:entry.resourcePath);
}
for(const name of resourcePaths){
  const resource=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
  const asset=resource.asset,publicRoot=path.resolve(root,'prototype/public'),target=path.resolve(publicRoot,'.'+asset.url);
  if(!asset.url.startsWith('/company-assets/')||!target.startsWith(publicRoot+path.sep))throw Error(`Asset URL must stay inside company-assets: ${name}`);
  const bytes=await fs.readFile(target),hash=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==asset.bytes||hash!==asset.sha256)throw Error(`Resource bytes differ from registration: ${name}`);
  if(!resource.provenance?.license||!resource.provenance?.sourceParameters)throw Error(`Missing source or usage information: ${name}`);
  catalog.resources.push(resource);
}
// Explicit functional adapter identity, pinned to the complete existing source.
// This reuses display geometry and is not a newly produced appearance.
for(const adapter of plan.adapters||[]) {
  if(Object.keys(adapter).sort().join(',')!=='id,mountRole,source,usePoints,version')throw Error('Unsupported resource adapter fields');
  const source=catalog.resources.find(r=>r.id===adapter.source.id&&r.version===adapter.source.version);
  if(!source||createHash('sha256').update(JSON.stringify(source)).digest('hex')!==adapter.source.sha256)throw Error(`Resource adapter source differs: ${adapter.id}`);
  if(catalog.resources.some(r=>r.id===adapter.id&&r.version===adapter.version))throw Error(`Duplicate adapter identity: ${adapter.id}`);
  catalog.resources.push({...structuredClone(source),id:adapter.id,version:adapter.version,mountRole:adapter.mountRole,usePoints:structuredClone(adapter.usePoints),
    provenance:{...structuredClone(source.provenance),functionalAdapter:{source:adapter.source,input:'scripts/company-platform/library-inputs.json',scope:'Explicit approach/exit adaptation; same source geometry, not a new appearance.'}}});
}
catalogMaps(catalog,{templates:[]});
const output=path.join(root,plan.output),text=JSON.stringify(catalog,null,2)+'\n';
if(process.argv.includes('--check')){if(await fs.readFile(output,'utf8')!==text)throw Error('Registered catalog is stale');}
else await fs.writeFile(output,text);
console.log(JSON.stringify({output:plan.output,resources:catalog.resources.length,mode:process.argv.includes('--check')?'checked':'built'}));
