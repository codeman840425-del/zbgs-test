import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';

const workspace=fileURLToPath(new URL('../../',import.meta.url));
const evidence=fileURLToPath(new URL('../../evidence/company-batch-v1/',import.meta.url));
await fs.mkdir(evidence,{recursive:true});
const run=await fs.mkdtemp(path.join(evidence,'run-')),checks=[];
const representativesOnly=process.argv.includes('--representatives-only');
const affectedNames=new Set([
  'Real CLI produces two complete results with same-spec real models and explicit style/pose',
  'Replacement models preserve the complete declared functional contract',
  'Identical retry verifies existing bytes and is idempotent',
  'One failed key leaves another success usable and can retry alone',
]);
const original=JSON.parse(await fs.readFile(new URL('./batch-inputs/sofa-rooms.json',import.meta.url),'utf8'));
const inputFile=path.join(run,'batch.json');await fs.writeFile(inputFile,JSON.stringify(original,null,2)+'\n');
const out=path.join(run,'results');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function check(name,fn){if(representativesOnly&&!affectedNames.has(name))return;try{checks.push({name,passed:true,observed:await fn()});}catch(error){checks.push({name,passed:false,error:error.stack});}}
function cli(input,directory,extra=[]){
  const result=spawnSync(process.execPath,['scripts/company-platform/batch.mjs',input,directory,...extra],{cwd:workspace,encoding:'utf8'});
  return{exitCode:result.status,report:JSON.parse(result.stdout||result.stderr),stderr:result.stderr.trim()};
}
function cliAsync(input,directory){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/company-platform/batch.mjs',input,directory],{cwd:workspace,windowsHide:true});let stdout='',stderr='';
  child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);child.on('error',reject);
  child.on('close',exitCode=>{try{resolve({exitCode,report:JSON.parse(stdout||stderr)});}catch(error){reject(error);}});
});}
async function fingerprints(directory){const result={};for(const key of original.items.map(item=>item.key))for(const name of ['input.json','layout.json','save.json','report.json'])result[`${key}/${name}`]=hash(await fs.readFile(path.join(directory,key,name)));return result;}
await check('Real CLI produces two complete results with same-spec real models and explicit style/pose',async()=>{
  const result=cli(inputFile,out);assert.equal(result.exitCode,0);assert.equal(result.report.ok,true);assert(result.report.results.every(item=>item.status==='created'));
  for(const [index,item]of original.items.entries()){
    const directory=path.join(out,item.key),layout=JSON.parse(await fs.readFile(path.join(directory,'layout.json'),'utf8'));
    const save=await decodeCompanySave(await fs.readFile(path.join(directory,'save.json'),'utf8'),catalog,templates);assert.deepEqual(save,layout);
    const report=JSON.parse(await fs.readFile(path.join(directory,'report.json'),'utf8'));
    const expectedId=index===0?'lounge-sofa':'timber-sofa';
    assert.equal(report.assetDependencies[0].version,1);assert.equal(report.assetDependencies[0].id,expectedId);
    assert.equal(report.dependencies.resources[0].version,1);assert.equal(report.dependencies.resources[0].id,expectedId);assert(report.sourceHashes['prototype/src/company/space.js']);
    for(const [name,entry]of Object.entries(report.files)){const bytes=await fs.readFile(path.join(directory,name));assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);assert.equal(bytes.includes(Buffer.from('\r\n')),false);assert.equal(bytes.at(-1),10);}
    if(index===1){const sofa=layout.nodes.find(node=>node.resource?.id==='timber-sofa');assert.deepEqual(sofa.transform,{position:[-1,0,-.5],yaw:Math.PI/2});assert.equal(sofa.appearance.materials.fabric.color,'#345c83');}
  }
  return{results:result.report.results.map(({key,status})=>({key,status}))};
});
await check('Replacement models preserve the complete declared functional contract',async()=>{
  const originalResource=catalog.resources.find(resource=>resource.id==='lounge-sofa'&&resource.version===1),replacement=catalog.resources.find(resource=>resource.id==='timber-sofa'&&resource.version===1);
  for(const field of ['category','mountRole','footprint','usePoints','stateDefaults'])assert.deepEqual(replacement[field],originalResource[field]);
  for(const field of ['units','up','forward','scale'])assert.equal(replacement.coordinates[field],originalResource.coordinates[field]);
  assert.notEqual(replacement.asset.sha256,originalResource.asset.sha256);
  return{functionalFieldsUnchanged:['category','mountRole','footprint','usePoints','stateDefaults','coordinate basis/scale'],actualAssetHashes:[originalResource.asset.sha256,replacement.asset.sha256],distinctModelIds:[originalResource.id,replacement.id]};
});
await check('Identical retry verifies existing bytes and is idempotent',async()=>{
  const before=await fingerprints(out),result=cli(inputFile,out);assert.equal(result.exitCode,0);assert(result.report.results.every(item=>item.status==='idempotent'));assert.deepEqual(await fingerprints(out),before);return{byteHashesUnchanged:true};
});
await check('Independent output root receives byte-identical portable results',async()=>{
  const second=path.join(run,'second-root'),result=cli(inputFile,second);assert.equal(result.exitCode,0);assert.deepEqual(await fingerprints(second),await fingerprints(out));return{allEightFilesIdentical:true};
});
await check('JSON property ordering does not change deterministic result bytes',async()=>{
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const file=path.join(run,'reordered.json');await fs.writeFile(file,JSON.stringify(reorder(original)));
  const result=cli(file,out);assert.equal(result.exitCode,0);assert(result.report.results.every(item=>item.status==='idempotent'));
});
await check('Changed input reports output-conflict and preserves every existing valid byte',async()=>{
  const changed=structuredClone(original);changed.items[0].input.name='Changed';const file=path.join(run,'changed.json');await fs.writeFile(file,JSON.stringify(changed));
  const before=await fingerprints(out),result=cli(file,out);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].code,'output-conflict');assert.equal(result.report.results[1].status,'idempotent');assert.deepEqual(await fingerprints(out),before);
});
await check('One failed key leaves another success usable and can retry alone',async()=>{
  const mixed=structuredClone(original);mixed.items[1].operations=[{type:'remove',id:'missing-instance'}];const file=path.join(run,'mixed.json'),directory=path.join(run,'partial');await fs.writeFile(file,JSON.stringify(mixed));
  const result=cli(file,directory);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].status,'created');assert.equal(result.report.results[1].key,original.items[1].key);assert.equal(result.report.results[1].code,'missing-instance');assert.equal(result.report.results[1].path,'missing-instance');
  await assert.rejects(fs.stat(path.join(directory,original.items[1].key)),error=>error.code==='ENOENT');
  const goodBefore=hash(await fs.readFile(path.join(directory,original.items[0].key,'report.json')));
  const retry=cli(inputFile,directory,['--only',original.items[1].key]);assert.equal(retry.exitCode,0);assert.equal(retry.report.results.length,1);assert.equal(retry.report.results[0].status,'created');assert.equal(hash(await fs.readFile(path.join(directory,original.items[0].key,'report.json'))),goodBefore);assert.deepEqual(await fingerprints(directory),await fingerprints(out));
  return{failureKey:original.items[1].key,code:'missing-instance',singleKeyRetry:'created',successfulSiblingUnchanged:true};
});
await check('Malformed per-item operations stay isolated and an explicit empty operation array is valid',async()=>{
  const mixed=structuredClone(original);mixed.items[0].operations=[];mixed.items[1].operations='invalid';const file=path.join(run,'bad-operation-shape.json'),directory=path.join(run,'bad-operation-shape');await fs.writeFile(file,JSON.stringify(mixed));
  const result=cli(file,directory);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].status,'created');assert.equal(result.report.results[1].code,'invalid-batch-operations');assert.equal(result.report.results[1].path,`${original.items[1].key}.operations`);await assert.rejects(fs.stat(path.join(directory,original.items[1].key)),error=>error.code==='ENOENT');
});
for(const [name,edit,code]of [
  ['Duplicate key',batch=>batch.items[1].key=batch.items[0].key,'duplicate-batch-key'],
  ['Windows-case duplicate key',batch=>batch.items[1].key=batch.items[0].key.toUpperCase(),'duplicate-batch-key'],
  ['Duplicate company identity',batch=>batch.items[1].input.id=batch.items[0].input.id,'duplicate-company-id'],
  ['Directory traversal key',batch=>batch.items[0].key='../escaped','invalid-batch-key'],
  ['Windows device-name key',batch=>batch.items[0].key='CON','invalid-batch-key'],
])await check(`${name} rejects before any output directory is created`,async()=>{
  const modified=structuredClone(original);edit(modified);const file=path.join(run,`${code}-${checks.length}.json`),directory=path.join(run,`rejected-${checks.length}`);await fs.writeFile(file,JSON.stringify(modified));const result=cli(file,directory);assert.equal(result.exitCode,1);assert.equal(result.report.code,code);await assert.rejects(fs.stat(directory),error=>error.code==='ENOENT');return{code};
});
await check('Tampered existing result is rejected without replacing the tampered bytes',async()=>{
  const directory=path.join(run,'tampered');assert.equal(cli(inputFile,directory).exitCode,0);const file=path.join(directory,original.items[0].key,'layout.json');await fs.writeFile(file,'tampered-sentinel\n');const result=cli(inputFile,directory);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].code,'output-conflict');assert.equal(await fs.readFile(file,'utf8'),'tampered-sentinel\n');
});
await check('Additional or missing bundle files are reported and never repaired over existing data',async()=>{
  for(const kind of ['additional','missing']){
    const directory=path.join(run,kind);assert.equal(cli(inputFile,directory).exitCode,0);const resultRoot=path.join(directory,original.items[0].key);
    const preserved=await fs.readFile(path.join(resultRoot,'layout.json'));
    if(kind==='additional')await fs.writeFile(path.join(resultRoot,'user-note.txt'),'preserve\n');else await fs.unlink(path.join(resultRoot,'report.json'));
    const result=cli(inputFile,directory,['--only',original.items[0].key]);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].code,'output-conflict');assert(result.report.results[0].message.includes(kind));assert((await fs.readFile(path.join(resultRoot,'layout.json'))).equals(preserved));
    if(kind==='additional')assert.equal(await fs.readFile(path.join(resultRoot,'user-note.txt'),'utf8'),'preserve\n');else await assert.rejects(fs.stat(path.join(resultRoot,'report.json')),error=>error.code==='ENOENT');
  }
});
await check('Existing file or junction cannot redirect result writes outside its result directory',async()=>{
  const directory=path.join(run,'path-guards'),external=path.join(run,'outside-guard');await fs.mkdir(directory);await fs.mkdir(external);const sentinel=path.join(external,'sentinel.txt');await fs.writeFile(sentinel,'keep\n');
  const link=path.join(directory,original.items[0].key);await fs.symlink(external,link,process.platform==='win32'?'junction':'dir');
  try{const result=cli(inputFile,directory,['--only',original.items[0].key]);assert.equal(result.exitCode,1);assert.equal(result.report.results[0].code,'output-conflict');assert.deepEqual(await fs.readdir(external),['sentinel.txt']);assert.equal(await fs.readFile(sentinel,'utf8'),'keep\n');}finally{await fs.unlink(link);}
});
await check('An existing key lock reports busy without touching a result and retries after release',async()=>{
  const directory=path.join(run,'busy');await fs.mkdir(directory);const lock=path.join(directory,`.${original.items[0].key}.lock`);await fs.writeFile(lock,'test-owned\n');
  const blocked=cli(inputFile,directory,['--only',original.items[0].key]);assert.equal(blocked.exitCode,1);assert.equal(blocked.report.results[0].code,'batch-item-busy');await assert.rejects(fs.stat(path.join(directory,original.items[0].key)),error=>error.code==='ENOENT');
  await fs.unlink(lock);assert.equal(cli(inputFile,directory,['--only',original.items[0].key]).exitCode,0);
});
await check('Concurrent real CLI publishers cannot mix or overwrite result bundles',async()=>{
  const directory=path.join(run,'concurrent'),results=await Promise.all([cliAsync(inputFile,directory),cliAsync(inputFile,directory)]);
  for(const result of results)for(const item of result.report.results)assert(['created','idempotent'].includes(item.status)||item.code==='batch-item-busy');
  const retry=cli(inputFile,directory);assert.equal(retry.exitCode,0);assert(retry.report.results.every(item=>item.status==='idempotent'));assert.deepEqual(await fingerprints(directory),await fingerprints(out));assert.deepEqual((await fs.readdir(directory)).sort(),original.items.map(item=>item.key).sort());return{publisherStates:results.map(result=>result.report.results.map(item=>item.status)),noStagingOrLocksRemain:true};
});
const report={status:checks.every(check=>check.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'standard',reason:'Atomic independent result bundles and isolated deterministic retries',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},runDirectory:run,batchSourceSha256:hash(await fs.readFile(new URL('./batch.mjs',import.meta.url))),checks,
  limits:['Actual local CLI, filesystem, source/GLB hashing, static placement and save pin round-trip only. No render/GPU or character navigation.','Same-key concurrent publishers honor exclusive lock files. An interrupted process may leave a lock which must be inspected before removal.']};
report.scope=representativesOnly?'Only same-spec model representatives, complete save outputs, idempotency and isolated retry. Earlier full batch checks retained.':'Full batch CLI and filesystem checks';
await fs.writeFile(path.join(evidence,representativesOnly?'timber-recheck.json':'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,failures:checks.filter(check=>!check.passed)},null,2));if(report.status!=='passed')process.exitCode=1;
