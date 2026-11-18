import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {catalogMaps} from '../../prototype/src/company/document.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {validateResourceProvenance} from './validate-resource-provenance.mjs';
const root=fileURLToPath(new URL('../..',import.meta.url));
export const planPath = 'scripts/company-platform/library-inputs.json';
const readPlan = async () => JSON.parse(await fs.readFile(path.join(root,planPath),'utf8'));

// Build a fully checked candidate without changing the active registry.
export async function buildLibrary(plan, collections = new Map()) {
  const catalog=JSON.parse(await fs.readFile(path.join(root,plan.base),'utf8'));
  for(const resource of catalog.resources){
    const fit=plan.adaptations?.[`${resource.id}@${resource.version}`];
    if(fit){Object.assign(resource,structuredClone(fit));resource.provenance={...resource.provenance,authoringAdaptation:'scripts/company-platform/library-inputs.json'};}
    const materialSlots={};
    function scan(node){if(node.type==='mesh')materialSlots[node.id]=[node.id];for(const child of node.children||[])scan(child);}
    if(resource.node)scan(resource.node);
    resource.materialSlots=materialSlots;
    await validateResourceProvenance({root,resource,label:`${resource.id}@${resource.version}`});
  }
  const resourcePaths=[...plan.resources];
  for(const collectionPath of plan.collections||[]) {
    const collection=collections.get(collectionPath) ?? JSON.parse(await fs.readFile(path.join(root,collectionPath),'utf8'));
    for(const entry of collection.resources)resourcePaths.push(typeof entry==='string'?entry:entry.resourcePath);
  }
  for(const name of resourcePaths){
    const resource=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
    await validateResourceProvenance({root,resource,label:`${resource.id}@${resource.version}`});
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
    const adapterKeys = Object.keys(adapter).sort();
    if(!adapterKeys.every(key=>['after','id','mountRole','source','usePoints','version'].includes(key)) || !['id','mountRole','source','usePoints','version'].every(key=>adapterKeys.includes(key)))throw Error('Unsupported resource adapter fields');
    const source=catalog.resources.find(r=>r.id===adapter.source.id&&r.version===adapter.source.version);
    if(!source||createHash('sha256').update(JSON.stringify(source)).digest('hex')!==adapter.source.sha256)throw Error(`Resource adapter source differs: ${adapter.id}`);
    if(catalog.resources.some(r=>r.id===adapter.id&&r.version===adapter.version))throw Error(`Duplicate adapter identity: ${adapter.id}`);
    const adapted={...structuredClone(source),id:adapter.id,version:adapter.version,mountRole:adapter.mountRole,usePoints:structuredClone(adapter.usePoints),
      provenance:{...structuredClone(source.provenance),functionalAdapter:{source:adapter.source,input:'scripts/company-platform/library-inputs.json',scope:'Explicit approach/exit adaptation; same source geometry, not a new appearance.'}}};
    await validateResourceProvenance({root,resource:adapted,label:`${adapted.id}@${adapted.version}`});
    if(adapter.after){const afterIndex=catalog.resources.findIndex(resource=>`${resource.id}@${resource.version}`===adapter.after);if(afterIndex<0)throw Error(`Resource adapter insertion point missing: ${adapter.after}`);catalog.resources.splice(afterIndex+1,0,adapted);}else catalog.resources.push(adapted);
  }
  await preflightLibraryAssets({root,resources:catalog.resources});
  catalogMaps(catalog,{templates:[]});
  return catalog;
}

export async function withCatalogWriteLock(operation, busyCode = 'catalog-write-busy') {
  const file=path.join(root,'scripts/company-platform/.catalog-write.lock');
  let handle;
  try {handle=await fs.open(file,'wx');}
  catch(error) {
    if(error.code==='EEXIST')throw Object.assign(Error('Another or interrupted publication holds the catalog lock'),{code:busyCode,path:file});
    throw error;
  }
  let keepLock=false;
  try {return await operation();}
  catch(error) {keepLock=Boolean(error.keepCatalogLock);throw error;}
  finally {await handle.close();if(!keepLock)await fs.unlink(file);}
}

export async function replaceIndex(file, bytes) {
  const candidate=path.join(path.dirname(file),'.catalog-'+randomUUID()+'.tmp');
  const handle=await fs.open(candidate,'wx');
  try {
    try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
    await fs.rename(candidate,file);
  } finally {await fs.rm(candidate,{force:true});}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const check=process.argv.includes('--check');
  const run=async()=>{
    const plan=await readPlan(), catalog=await buildLibrary(plan);
    const output=path.join(root,plan.output),text=JSON.stringify(catalog,null,2)+'\n';
    if(check){if(await fs.readFile(output,'utf8')!==text)throw Error('Registered catalog is stale');}
    else await replaceIndex(output,text);
    console.log(JSON.stringify({output:plan.output,resources:catalog.resources.length,mode:check?'checked':'built'}));
  };
  if(check)await run();else await withCatalogWriteLock(run);
}
