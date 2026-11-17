import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest,fail,jsonBytes,localFile,runtimePath,copyDeclaredFiles} from './files.mjs';
import {collectRecordResources} from './record-resources.mjs';

const ADAPTER='character-record-complete-v1';
const hashPattern=/^[a-f0-9]{64}$/;
const reviewedFile=new URL('./record-runtime-reviewed.json',import.meta.url);
export async function createRecordInventory({record,dist,sourceRoot}){
 const reviewed=JSON.parse(await readFile(reviewedFile,'utf8'));
 const buildBytes=await readFile(await localFile(dist,'build-info.json'));
 const buildPin=reviewed.files['build-info.json'];
 if(!buildPin||digest(buildBytes)!==buildPin.sha256||buildBytes.length!==buildPin.bytes)fail('modified-dependency','Fixed build metadata differs before any source import');
 const build=JSON.parse(buildBytes.toString('utf8'));
 if(build.sourceDigest!==reviewed.sourceDigest||build.shortId!==reviewed.sourceDigest.slice(0,12)||!Array.isArray(build.inputs))
  fail('unsupported-build','This record adapter requires its reviewed fixed source and bundles');
 const sourceHash=createHash('sha256');
 for(const file of build.inputs)sourceHash.update(file).update('\0').update(await readFile(await localFile(path.join(sourceRoot,'prototype'),file))).update('\0');
 if(sourceHash.digest('hex')!==reviewed.sourceDigest)fail('source-identity-mismatch','Source inputs differ from the reviewed runtime');
 const module=file=>import(pathToFileURL(path.join(sourceRoot,'prototype/src',file)).href);
 const [envelope,runtime]=await Promise.all([module('character-record.js'),module('character-runtime-record.js')]);
 await envelope.validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
 const derived=runtime.deriveCharacterResourceIdentities(record.appearanceRecipe,record.liveAccessories,record.equipmentMaterials);
 if(envelope.canonicalJson(derived)!==envelope.canonicalJson(record.resourceIdentities))fail('record-identity-mismatch','Record resource identities differ from its look');
 const files=new Map();
 const sourceRef=sourcePath=>({sourceCommit:reviewed.sourceCommit,sourcePath});
 const add=async(url,reason,{sha256,bytes,parent,provenance=[]}={})=>{
  const relative=runtimePath(url,parent),content=await readFile(await localFile(dist,relative)),hash=digest(content);
  if(sha256!==undefined&&(!hashPattern.test(sha256)||hash!==sha256))fail('modified-dependency','Pinned SHA differs: '+relative);
  if(bytes!==undefined&&content.length!==bytes)fail('modified-dependency','Pinned size differs: '+relative);
  const isPublic=build.inputs.includes('public/'+relative),pin=reviewed.files[relative];
  if(pin){if(hash!==pin.sha256||content.length!==pin.bytes)fail('modified-dependency','Fixed bundle differs: '+relative);}
  else if(isPublic){if(digest(await readFile(await localFile(path.join(sourceRoot,'prototype/public'),relative)))!==hash)fail('modified-dependency','Public asset differs from reviewed source: '+relative);}
  else fail('unsupported-dependency','File not in reviewed source/build: '+relative);
  let row=files.get(relative);if(!row){row={path:relative,sha256:hash,bytes:content.length,reasons:[],provenance:[isPublic?sourceRef('prototype/public/'+relative):{sourceCommit:reviewed.sourceCommit,buildId:build.shortId,bundlePath:relative,...(relative==='build-info.json'?{buildScript:'prototype/scripts/build-id.mjs'}:{buildManifest:'build-info.json'})}]};files.set(relative,row);}
  if(!row.reasons.includes(reason))row.reasons.push(reason);
  for(const ref of provenance)if(!row.provenance.some(old=>envelope.canonicalJson(old)===envelope.canonicalJson(ref)))row.provenance.push(ref);
  return{path:relative,bytes:content,value:relative.endsWith('.json')?JSON.parse(content.toString('utf8')):null};
 };
 await add('/build-info.json','fixed source identity');
 const html=await add('/index.html','unchanged shared room and workbench entry');
 const scanned=new Set();
 async function bundle(url,parent='index.html'){
  const relative=runtimePath(url.startsWith('./')?url.slice(2):url,parent);if(scanned.has(relative))return;scanned.add(relative);
  const item=await add('/'+relative,'reviewed runtime bundle');
  if(relative.endsWith('.js'))for(const match of item.bytes.toString('utf8').matchAll(/["']((?:\.\/|\/?assets\/)[A-Za-z0-9_./-]+\.(?:js|css))["']/g))await bundle(match[1],relative);
 }
 for(const match of html.bytes.toString('utf8').matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/g))await bundle(match[1]);
 const resources=await collectRecordResources({record,sourceRoot,add});
 const serialized=JSON.stringify(record);runtime.parseRuntimeCharacterRecord(serialized);
 const data=Buffer.from(serialized,'utf8');files.set('character-record.json',{path:'character-record.json',sha256:digest(data),bytes:data.length,generated:data.toString('utf8'),reasons:['complete identity and saved look; no animation/economy state'],provenance:[{recordSha256:record.integrity.recordSha256}]});
 return{schema:'character-record-package-inventory-v1',adapter:ADAPTER,record:structuredClone(record),recordSha256:record.integrity.recordSha256,
  runtime:{sourceCommit:reviewed.sourceCommit,sourceDigest:reviewed.sourceDigest,buildId:build.shortId,entry:'index.html',entryUrl:'/?workbench=appearance&body='+encodeURIComponent(resources.bodyType)},
  selected:{recordFile:'character-record.json',...resources},
  limitations:['This package retains the existing room HTML/DOM; it is not a DOM-independent consumer.',
   'Only declared selected/default resources are exported. Other catalog choices and historical evidence links are not portable package capabilities.',
   'Runtime byte and source checks do not prove visual quality or ordinary-PC performance.',
   'Source provenance and license limits are retained. This export grants no additional redistribution rights.'],
  files:[...files.values()].map(row=>({...row,reasons:row.reasons.sort()})).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
}
export async function exportRecordInventory({inventory,dist,sourceRoot,out}){
 const expected=await createRecordInventory({record:inventory.record,dist,sourceRoot});
 if(digest(jsonBytes(expected))!==digest(jsonBytes(inventory)))fail('inventory-mismatch','Inventory differs from the record dependency closure');
 return copyDeclaredFiles({inventory,dist,out});
}
