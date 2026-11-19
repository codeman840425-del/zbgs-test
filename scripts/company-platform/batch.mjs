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
import {preflightDesktopAreas} from './preflight-library-assets.mjs';
import {bindTrainingDocument,bindingFromSource} from './package-template/training-room.mjs';
import {checkManagedOutput,findManagedProject} from './package-company.mjs';

const workspace=new URL('../../',import.meta.url);
const sourceFiles=[
  'scripts/company-platform/batch.mjs','scripts/company-platform/check-training-clearance.mjs',
  'scripts/company-platform/package-template/training-room.mjs',
  'prototype/src/company/room-mesh-geometry.js','prototype/src/company/public-door-access.js',
  'prototype/src/company/space.js',
  'prototype/src/company/scale-profile.js','prototype/src/company/scale-v2.js',
  'prototype/src/company/document.js','prototype/src/company/placement.js',
  'prototype/src/company/moving-parts.js','prototype/src/company/support-data.js',
  'prototype/src/company/floor-air.js','prototype/src/company/wall-hvac.js','prototype/src/company/base-contact.js',
  'prototype/src/company/garment-rack-data.js','prototype/src/company/garment-rack-geometry.js',
  'prototype/src/company/enclosed-wardrobe-data.js','prototype/src/company/wardrobe-footprints.js',
  'prototype/src/company/enclosed-wardrobe-geometry.js',
  'prototype/src/company/appearance-contract.js','prototype/src/company/workstation-looks.js',
  'prototype/src/company/workstation-looks.json',
  'prototype/src/company/persistence.js','prototype/src/company/library-catalog.json',
  'prototype/src/company/templates-extended.json','prototype/src/company/desktop-placement.js',
  'prototype/src/company/render.js','prototype/src/company/asset-library.js',
  'prototype/src/company/screen-state.js','scripts/company-platform/preflight-library-assets.mjs',
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
    if(!item||Object.keys(item).some(key=>!['key','input','document','styleRecipe','operations','stationLooks','studioLoungeSet','trainingClearance','productShowcases','interviewRooms','singingRooms','teaStations','publicWashrooms','meetingRooms','publicStorageRooms','wayfindingRooms'].includes(key))||
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
  let studioLoungeSet;
  if (Object.hasOwn(item,'studioLoungeSet')) {
    const {loadStudioLoungeRecipe,studioLoungeOperations} = await import('./install-studio-lounge-set.mjs');
    const {checkStudioLoungeDesk} = await import('./check-studio-lounge-set.mjs');
    const binding = item.studioLoungeSet;
    const {recipe,source} = await loadStudioLoungeRecipe(binding?.recipe);
    sourceHashes[source] = binding.recipe.sha256;
    Object.assign(sourceHashes,await sources(['scripts/company-platform/install-studio-lounge-set.mjs',
      'scripts/company-platform/check-studio-lounge-set.mjs','prototype/src/company/facility-edit-data.js']));
    const {operations,secondaryId} = studioLoungeOperations(document,binding,recipe,{catalog,templates});
    const candidate = prepareCompanyChange(document,operations,{catalog,templates}).document;
    inspectCompanyMotionSweep(document,candidate,catalog,templates);
    const geometry = await checkStudioLoungeDesk(candidate,{catalog,templates,stationId:binding.station,secondaryId});
    studioLoungeSet = {recipe:binding.recipe,live:binding.live,waiting:binding.waiting,sofa:binding.sofa,geometry};
    document = candidate;
  }
  if (Object.hasOwn(item,'singingRooms')) document.singingRooms = structuredClone(item.singingRooms);
  const connections=inspectCompanyConnections(document,catalog,templates);
  const placement=inspectCompanyPlacement(document,catalog,templates);
  const context={catalog,templates,createScaledCompany,createCompanyScaleV2,prepareCompanyChange};
  const binding=bindingFromSource(document,'batch-input',jsonBytes(item),context);
  const constraint=bindTrainingDocument(document,binding,item.key,context);
  let trainingClearance;
  if(constraint){
    if (Object.hasOwn(constraint,'shot'))
      Object.assign(sourceHashes,await sources(['scripts/company-platform/check-dance-shot.mjs','scripts/company-platform/public-door-access.mjs','prototype/src/company/camera-view.js']));
    const {checkTrainingClearance}=await import('./check-training-clearance.mjs');
    trainingClearance=await checkTrainingClearance(document,constraint,{catalog,templates});
  }
  if (Object.hasOwn(item,'productShowcases')) document.productShowcases = structuredClone(item.productShowcases);
  let productShowcases;
  if (Object.hasOwn(document,'productShowcases')) {
    const checker = 'scripts/company-platform/check-showcase-room.mjs';
    Object.assign(sourceHashes,await sources([checker]));
    const {checkProductShowcases} = await import('./check-showcase-room.mjs');
    productShowcases = await checkProductShowcases(document,{catalog,templates});
  }
  if (Object.hasOwn(item,'interviewRooms')) document.interviewRooms = structuredClone(item.interviewRooms);
  let interviewRooms;
  if (Object.hasOwn(document,'interviewRooms')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-interview-room.mjs','scripts/company-platform/public-door-access.mjs']));
    const {checkInterviewRooms} = await import('./check-interview-room.mjs');
    interviewRooms = await checkInterviewRooms(document,{catalog,templates});
  }
  let singingRooms;
  if (Object.hasOwn(document,'singingRooms')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-singing-room.mjs','scripts/company-platform/public-door-access.mjs']));
    if(document.singingRooms?.some?.(rule=>rule?.performer?.coordinateSpace==='facility'))
      Object.assign(sourceHashes,await sources(['prototype/src/company/vocal-use.js','prototype/src/company/vocal-use-geometry.js','prototype/src/company/use-point-data.js']));
    const {checkSingingRooms} = await import('./check-singing-room.mjs');
    singingRooms = await checkSingingRooms(document,{catalog,templates});
  }
  const assetDependencies=[];
  if (Object.hasOwn(item,'teaStations')) document.teaStations = structuredClone(item.teaStations);
  if (Object.hasOwn(item,'publicWashrooms')) document.publicWashrooms = structuredClone(item.publicWashrooms);
  if (Object.hasOwn(item,'meetingRooms')) document.meetingRooms=structuredClone(item.meetingRooms);
  if (Object.hasOwn(item,'publicStorageRooms')) document.publicStorageRooms=structuredClone(item.publicStorageRooms);
  if (Object.hasOwn(item,'wayfindingRooms')) document.wayfindingRooms=structuredClone(item.wayfindingRooms);
  const derived=deriveCompany(document,catalog,templates);
  let glassPartitionRooms;
  if (derived.facilities.some(f=>f.resource.mountRole==='glass-partition')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-glass-partition-room.mjs','prototype/src/company/glass-partition-room.js',
      'prototype/src/company/installed-mesh-geometry.js','prototype/src/company/glass-partition.js','prototype/src/company/glass-partition-geometry.js']));
    const {checkGlassPartitionRooms}=await import('./check-glass-partition-room.mjs');
    glassPartitionRooms=await checkGlassPartitionRooms(document,{catalog,templates,derived});
  }
  let wallAbsorberRooms;
  if (derived.facilities.some(f=>['wall-absorber-panel','corner-absorber'].includes(f.resource.mountRole))) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-wall-absorber-room.mjs','prototype/src/company/wall-absorber-room.js','prototype/src/company/wall-absorber.js']));
    const {checkWallAbsorberRooms}=await import('./check-wall-absorber-room.mjs');
    wallAbsorberRooms=await checkWallAbsorberRooms(document,{catalog,templates,derived});
  }
  let wayfindingRooms;
  if (Object.hasOwn(document,'wayfindingRooms')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-wayfinding.mjs','prototype/src/company/wayfinding.js']));
    const {checkWayfindingRooms}=await import('./check-wayfinding.mjs');
    wayfindingRooms=await checkWayfindingRooms(document,{catalog,templates,derived});
  }
  let publicStorageRooms;
  if (Object.hasOwn(document,'publicStorageRooms') || document.nodes.some(node=>node.publicRole==='storage-cleaning')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-public-storage.mjs','prototype/src/company/public-storage.js']));
    const {checkPublicStorageRooms}=await import('./check-public-storage.mjs');
    publicStorageRooms=await checkPublicStorageRooms(document,{catalog,templates,derived});
  }
  let meetingRooms;
  if (Object.hasOwn(document,'meetingRooms') || document.nodes.some(node=>node.publicRole==='meeting-training')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-meeting-room.mjs','prototype/src/company/meeting-room.js']));
    const {checkMeetingRooms}=await import('./check-meeting-room.mjs');
    meetingRooms=await checkMeetingRooms(document,{catalog,templates,derived});
  }
  let teaStations;
  if (Object.hasOwn(document,'teaStations') || derived.facilities.some(item=>item.resource.mountRole==='tea-counter')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-tea-station.mjs','prototype/src/company/tea-station-room.js','prototype/src/company/public-door-access.js','prototype/src/company/room-mesh-geometry.js']));
    const {checkTeaStations} = await import('./check-tea-station.mjs');
    teaStations = await checkTeaStations(document,{catalog,templates,derived});
  }
  let publicWashrooms;
  if (Object.hasOwn(document,'publicWashrooms') || derived.facilities.some(item=>item.resource.mountRole==='public-washbasin')) {
    Object.assign(sourceHashes,await sources(['scripts/company-platform/check-public-washroom.mjs','prototype/src/company/public-washroom.js']));
    const {checkPublicWashrooms}=await import('./check-public-washroom.mjs');
    publicWashrooms=await checkPublicWashrooms(document,{catalog,templates,derived});
  }
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
  await preflightDesktopAreas(fileURLToPath(workspace),derived);
  const saved=JSON.parse(await encodeCompanySave(document,catalog,templates));
  const files={'input.json':jsonBytes(item),'layout.json':jsonBytes(document),'save.json':jsonBytes(saved)};
  const report={schema:'company-batch-result',version:1,key:item.key,companyId:document.id,
    documentRevision:document.revision,dependencies:saved.dependencies,assetDependencies,sourceHashes,
    ...(styleRecipe ? {styleRecipe} : {}),
    files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}])),
    checks:{connections,placement,...(studioLoungeSet ? {studioLoungeSet} : {}),...(trainingClearance ? {trainingClearance} : {}),...(productShowcases ? {productShowcases} : {}),
      ...(interviewRooms ? {interviewRooms} : {}),...(singingRooms ? {singingRooms} : {}),...(teaStations?.length ? {teaStations} : {}),
      ...(publicWashrooms?.length ? {publicWashrooms} : {}),...(meetingRooms?.length ? {meetingRooms} : {}),
      ...(publicStorageRooms?.length ? {publicStorageRooms} : {}),...(wayfindingRooms?.length ? {wayfindingRooms} : {}),...(wallAbsorberRooms?.length ? {wallAbsorberRooms} : {}),
      ...(glassPartitionRooms?.length ? {glassPartitionRooms} : {})},
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

// Separate runs can execute concurrently without modifying archived results.
export async function createAuthoringRunDirectory(task) {
  if (!/^[a-z][a-z0-9-]*$/.test(task)) throw Error('Expected a simple authoring task name');
  const checkout = fileURLToPath(workspace);
  const project = await findManagedProject(checkout) ?? checkout;
  const parent = path.join(project,'output','authoring-runs',task);
  await checkManagedOutput(parent,checkout,{allowDelivery:false});
  await fs.mkdir(parent,{recursive:true});
  return fs.mkdtemp(path.join(parent,'run-'));
}

export async function runCompanyBatch(batch,{outputDirectory,only}={}){
  validateBatch(batch,only);
  if(typeof outputDirectory!=='string'||!outputDirectory)fail('invalid-output-directory','outputDirectory','Provide an explicit output directory');
  const destination=path.resolve(outputDirectory);
  await checkManagedOutput(destination,undefined,{allowDelivery:false});
  const items=structuredClone(batch).items.filter(item=>only===undefined||item.key===only);
  const baseHashes=await sources(sourceFiles);
  const styleHashes=items.some(hasStyleRecipe)?await sources(styleSourceFiles):null;
  await fs.mkdir(destination,{recursive:true});
  const root=await fs.realpath(destination),results=[];
  for(const item of items){
    try{
      const sourceHashes={...baseHashes,...(hasStyleRecipe(item)?styleHashes:{})};
      const {files,report}=await prepare(item,sourceHashes);
      if(JSON.stringify(canonical(await sources(Object.keys(sourceHashes))))!==JSON.stringify(canonical(sourceHashes)))
        fail('source-changed',item.key,'Production sources changed during this batch; retry against one fixed source candidate');
      const status=await publish(root,item.key,files);
      results.push({key:item.key,companyId:report.companyId,status,directory:childPath(root,item.key),files:report.files});
    }catch(error){results.push({key:item.key,status:'failed',code:error.code||'io-error',path:error.path||item.key,message:error.message,details:error.details});}
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
