import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {CompanyError,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createScaledCompany,inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {inspectCompanyPlacement,inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';
import {resolveWorkstationLook,workstationLookOperations} from '../../prototype/src/company/workstation-looks.js';
import {encodeCompanySave} from '../../prototype/src/company/persistence.js';

const workspace=new URL('../../',import.meta.url);
const sourceFiles=[
  'scripts/company-platform/batch.mjs','scripts/company-platform/check-training-clearance.mjs',
  'prototype/src/company/space.js',
  'prototype/src/company/scale-profile.js','prototype/src/company/scale-v2.js',
  'prototype/src/company/document.js','prototype/src/company/placement.js',
  'prototype/src/company/moving-parts.js','prototype/src/company/support-data.js',
  'prototype/src/company/appearance-contract.js','prototype/src/company/workstation-looks.js',
  'prototype/src/company/workstation-looks.json',
  'prototype/src/company/persistence.js','prototype/src/company/library-catalog.json',
  'prototype/src/company/templates-extended.json',
];
const styleSourceFiles=[
  'scripts/company-platform/apply-style-recipe.mjs',
  'prototype/src/company/appearance-samples.js',
];
const hasStyleRecipe=item=>Object.hasOwn(item,'styleRecipe');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const jsonBytes=value=>Buffer.from(JSON.stringify(canonical(value),null,2)+'\n','utf8');
const fail=(code,location,message)=>{throw new CompanyError(code,location,message);};
async function sources(files){
  return Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await fs.readFile(new URL(file,workspace)))])));
}
function validateBatch(batch,only){
  if(!batch||batch.schema!=='company-batch'||batch.version!==1||!Array.isArray(batch.items)||!batch.items.length||
      Object.keys(batch).some(key=>!['schema','version','items'].includes(key)))
    fail('invalid-batch','batch','Expected company-batch version 1 with a nonempty items array');
  const keys=new Set(),ids=new Set();
  for(const [index,item]of batch.items.entries()){
    const location=`items[${index}]`;
    if(!item||Object.keys(item).some(key=>!['key','input','document','styleRecipe','operations','stationLooks','trainingClearance'].includes(key))||
        typeof item.key!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item.key)||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(item.key))
      fail('invalid-batch-key',location,'Use a portable nonempty directory key with letters, digits, underscore or hyphen');
    if(keys.has(item.key.toLowerCase()))fail('duplicate-batch-key',`${location}.key`,'Keys must be distinct including filesystem case');
    keys.add(item.key.toLowerCase());
    if(Boolean(item.input)===Boolean(item.document))fail('invalid-batch-item',location,'Provide exactly one scaled input or explicit layout document');
    const companyId=(item.input||item.document)?.id;
    if(typeof companyId==='string'&&companyId){
      if(ids.has(companyId))fail('duplicate-company-id',`${location}.id`,'A batch cannot publish multiple results for one company identity');
      ids.add(companyId);
    }
  }
  if(only!==undefined&&!batch.items.some(item=>item.key===only))fail('unknown-batch-key','only',String(only));
}
function childPath(root,name){
  const candidate=path.resolve(root,name);
  if(path.dirname(candidate)!==root)fail('unsafe-output-path',name,'Result paths must remain directly inside the output directory');
  return candidate;
}
async function exists(file){
  try{return await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function verifyExisting(directory,expected){
  const info=await fs.lstat(directory);
  if(info.isSymbolicLink()||!info.isDirectory())fail('output-conflict',directory,'Existing result is not a normal directory');
  const names=(await fs.readdir(directory)).sort();
  const expectedNames=Object.keys(expected).sort();
  if(JSON.stringify(names)!==JSON.stringify(expectedNames)){
    const missing=expectedNames.filter(name=>!names.includes(name)),additional=names.filter(name=>!expectedNames.includes(name));
    fail('output-conflict',directory,`Result file set differs; missing ${JSON.stringify(missing)}, additional ${JSON.stringify(additional)}`);
  }
  for(const [name,bytes]of Object.entries(expected)){
    const file=path.join(directory,name),stat=await fs.lstat(file);
    if(stat.isSymbolicLink()||!stat.isFile())fail('output-conflict',file,'Existing result entry is not a normal file');
    const existing=await fs.readFile(file);
    if(!existing.equals(bytes))fail('output-conflict',file,`Existing SHA256 ${hash(existing)} differs from expected ${hash(bytes)}`);
  }
}
async function prepare(item,sourceHashes){
  const input=item.input||item.document;
  if(!input||typeof input!=='object'||typeof input.id!=='string'||!input.id)
    fail('invalid-batch-item',`${item.key}.input.id`,'Each result requires an explicit company identity');
  if(item.operations!==undefined&&!Array.isArray(item.operations))
    fail('invalid-batch-operations',`${item.key}.operations`,'Optional operations must be an array');
  let document=item.document?structuredClone(item.document):(item.input.spaceProfile!==undefined?createCompanyScaleV2:createScaledCompany)(item.input,catalog,templates);
  let styleRecipe;
  if(hasStyleRecipe(item)){
    const {applyStyleRecipe}=await import('./apply-style-recipe.mjs');
    const styled=applyStyleRecipe(document,item.styleRecipe,{catalog,templates});
    document=styled.document;
    styleRecipe={...styled.recipe,sha256:hash(jsonBytes(item.styleRecipe)),operations:styled.operations.length};
  }
  if(item.operations?.length){const previous=document;document=prepareCompanyChange(document,item.operations,{catalog,templates}).document;inspectCompanyMotionSweep(previous,document,catalog,templates);}
  if(item.stationLooks!==undefined){
    if(!Array.isArray(item.stationLooks))fail('invalid-station-looks',item.key,'stationLooks must be an array');
    const assigned=new Set(), operations=[];
    for(const [index,assignment] of item.stationLooks.entries()){
      const field=`${item.key}.stationLooks[${index}]`;
      if(!assignment || typeof assignment.stationId!=='string' || !assignment.stationId ||
          Object.keys(assignment).some(key=>!['stationId','look'].includes(key)))
        fail('invalid-station-look',field,'Provide stationId and a pinned look reference');
      if(assigned.has(assignment.stationId))fail('duplicate-station-look',field,'Specify one look per workstation');
      assigned.add(assignment.stationId);
      const recipe=resolveWorkstationLook(assignment.look);
      operations.push(...workstationLookOperations(document,assignment.stationId,recipe,catalog,templates));
    }
    if(operations.length)document=prepareCompanyChange(document,operations,{catalog,templates}).document;
  }
  const connections=inspectCompanyConnections(document,catalog,templates);
  const placement=inspectCompanyPlacement(document,catalog,templates);
  let trainingClearance;
  if(Object.hasOwn(item,'trainingClearance')){
    const {checkTrainingClearance}=await import('./check-training-clearance.mjs');
    trainingClearance=await checkTrainingClearance(document,item.trainingClearance,{catalog,templates});
  }
  const assetDependencies=[];
  const derived=deriveCompany(document,catalog,templates);
  const selected=new Map();
  for(const {resource} of [...derived.facilities,...derived.surfaceFinishes]){
    if(resource.asset)selected.set(`${resource.id}@${resource.version}`,resource);
  }
  const publicRoot=fileURLToPath(new URL('../../prototype/public/',import.meta.url));
  for(const resource of [...selected.values()].sort((a,b)=>`${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`))){
    const asset=resource.asset,relative=`prototype/public${asset.url}`;
    if(asset.format!=='glb'||typeof asset.url!=='string'||!asset.url.startsWith('/company-assets/'))
      fail('unsupported-batch-asset',resource.id,'Batch publication supports the existing local company GLB library');
    const source=path.resolve(publicRoot,`.${asset.url}`);
    if(!source.startsWith(publicRoot))fail('unsafe-asset-source',resource.id,'Asset source escapes the public resource directory');
    let bytes;try{bytes=await fs.readFile(source);}catch(error){fail('missing-batch-asset',resource.id,error.message);}
    if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)
      fail('asset-source-mismatch',resource.id,'Actual GLB bytes differ from the pinned resource metadata');
    assetDependencies.push({id:resource.id,version:resource.version,path:relative,bytes:bytes.length,sha256:hash(bytes)});
  }
  const saved=JSON.parse(await encodeCompanySave(document,catalog,templates));
  const files={'input.json':jsonBytes(item),'layout.json':jsonBytes(document),'save.json':jsonBytes(saved)};
  const report={schema:'company-batch-result',version:1,key:item.key,companyId:document.id,
    documentRevision:document.revision,dependencies:saved.dependencies,assetDependencies,sourceHashes,
    ...(styleRecipe ? {styleRecipe} : {}),
    files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}])),
    checks:{connections,placement,...(trainingClearance ? {trainingClearance} : {})},
    scope:'Complete deterministic authoring result. Static geometry and placement admission only; rendering and character usage require their own evidence.'};
  files['report.json']=jsonBytes(report);
  return {files,report};
}
async function publish(root,key,files){
  const destination=childPath(root,key),lockFile=childPath(root,`.${key.toLowerCase()}.lock`);
  let lock;
  try{lock=await fs.open(lockFile,'wx');}
  catch(error){if(error.code==='EEXIST')fail('batch-item-busy',key,'Another publisher or an interrupted publisher holds this key lock');throw error;}
  let stage;
  try{
    if(await exists(destination)){await verifyExisting(destination,files);return 'idempotent';}
    stage=await fs.mkdtemp(path.join(root,`.${key}.stage-`));
    if(path.dirname(path.resolve(stage))!==root)fail('unsafe-output-path',stage,'Staging directory escaped the output directory');
    for(const [name,bytes]of Object.entries(files)){
      const handle=await fs.open(path.join(stage,name),'wx');
      try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    }
    if(await exists(destination)){await verifyExisting(destination,files);return 'idempotent';}
    await fs.rename(stage,destination);stage=null;return 'created';
  }finally{
    try{
      if(stage){
        const resolved=path.resolve(stage);
        if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith(`.${key}.stage-`))
          fail('unsafe-output-path',stage,'Refuse cleanup outside the owned staging directory');
        await fs.rm(resolved,{recursive:true,force:true});
      }
    }finally{try{await lock.close();}finally{await fs.unlink(lockFile);}}
  }
}

export async function runCompanyBatch(batch,{outputDirectory,only}={}){
  validateBatch(batch,only);
  if(typeof outputDirectory!=='string'||!outputDirectory)fail('invalid-output-directory','outputDirectory','Provide an explicit output directory');
  const items=structuredClone(batch).items.filter(item=>only===undefined||item.key===only);
  const baseHashes=await sources(sourceFiles);
  const styleHashes=items.some(hasStyleRecipe)?await sources(styleSourceFiles):null;
  await fs.mkdir(path.resolve(outputDirectory),{recursive:true});
  const root=await fs.realpath(path.resolve(outputDirectory)),results=[];
  for(const item of items){
    try{
      const sourceHashes=hasStyleRecipe(item)?{...baseHashes,...styleHashes}:baseHashes;
      const {files,report}=await prepare(item,sourceHashes);
      if(JSON.stringify(canonical(await sources(Object.keys(sourceHashes))))!==JSON.stringify(canonical(sourceHashes)))
        fail('source-changed',item.key,'Production sources changed during this batch; retry against one fixed source candidate');
      const status=await publish(root,item.key,files);
      results.push({key:item.key,companyId:report.companyId,status,directory:childPath(root,item.key),files:report.files});
    }catch(error){results.push({key:item.key,status:'failed',code:error.code||'io-error',path:error.path||item.key,message:error.message});}
  }
  return {schema:'company-batch-run',version:1,ok:results.every(result=>result.status!=='failed'),results};
}

async function main(){
  const [inputFile,outputDirectory,...options]=process.argv.slice(2);
  if(inputFile==='--help'){
    console.log('node scripts/company-platform/batch.mjs BATCH_JSON OUT_DIR [--only KEY]');return;
  }
  if(!inputFile||!outputDirectory||(options.length&&!(options.length===2&&options[0]==='--only')))
    fail('invalid-arguments','arguments','Use BATCH_JSON OUT_DIR and optional --only KEY');
  let batch;
  try{batch=JSON.parse(await fs.readFile(inputFile,'utf8'));}catch(error){fail('invalid-batch-json',inputFile,error.message);}
  const result=await runCompanyBatch(batch,{outputDirectory,only:options[1]});
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  console.error(JSON.stringify({ok:false,code:error.code||'io-error',path:error.path,message:error.message},null,2));process.exitCode=1;
});
