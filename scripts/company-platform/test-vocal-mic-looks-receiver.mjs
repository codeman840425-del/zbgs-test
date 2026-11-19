import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkManagedOutput} from './package-company.mjs';
import {promisify} from 'node:util';

const [sealedArg,workArg,outArg,reviewedArg,...extra]=process.argv.slice(2);
assert(sealedArg && workArg && outArg && reviewedArg && !extra.length,
  'Usage: node test-vocal-mic-looks-receiver.mjs SEALED LOCKED_WORK FRESH_OUT REVIEWED_VOCAL_PACKAGE');
const [sealed,work,reviewed]=await Promise.all([sealedArg,workArg,reviewedArg].map(file=>fs.realpath(file)));
const out=path.resolve(outArg), parent=path.dirname(out);
const inside=(root,file)=>{
  const relative=path.relative(root,file);
  return !path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep);
};
assert(out!==parent && path.relative(parent,await fs.realpath(parent))==='','Use an existing real output parent.');
for(const root of [sealed,work,reviewed]) assert(!inside(root,out) && !inside(out,root),'Keep results outside the three inputs.');
assert(!inside(sealed,work) && !inside(work,sealed) && !inside(reviewed,work) && !inside(work,reviewed),'Use an isolated working copy.');
const exists=async file=>fs.lstat(file).then(()=>true,error=>{
  if(error.code==='ENOENT') return false;
  throw error;
});
for(const target of [out,work]) await checkManagedOutput(target, undefined, {allowDelivery:false});

const bytes=file=>fs.readFile(file);
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const pin=async file=>sha(await bytes(file));
const json=async file=>JSON.parse(await bytes(file));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const load=filename=>import(pathToFileURL(filename).href);
const run=promisify(execFile), manifestFile='transfer-manifest.json';
const source=path.join(work,'source'), prototype=path.join(source,'prototype'), tools=path.join(source,'scripts','company-platform');
const newId='floor-vocal-mic-disc-wide', newRef={id:newId,version:1};
const studio='singing-studio', rental='singing-rental', branch='floor-vocal-microphone';
const family='assets-source/company-vocal-mic-looks-v1';
const named=(root,key,...files)=>path.join(root,'data','rooms',key,...files);
const micOf=document=>document.nodes.find(node=>node.id===document.singingRooms[0].roles.mic);
const report={status:'running',sealed,work,reviewed,commands:[]};

async function invoke(label,entry,args,cwd,{format='json'}={}) {
  const command={label,entry,args,cwd};
  report.commands.push(command);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(process.execPath,[entry,...args],{cwd,windowsHide:true,timeout:240_000,maxBuffer:4*1024*1024}));
    command.exit=0;
  } catch(error) {
    ({stdout,stderr}=error);
    command.exit=error.code;
  }
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([name,value])=>
    fs.writeFile(path.join(out,label+'.'+name+'.log'),value??'',{flag:'wx'})));
  assert.equal(command.exit,0,label+'\n'+(stderr||stdout||''));
  command.response=format==='json'?JSON.parse(stdout):stdout.trim();
  return command.response;
}

async function verify(root,digest,label) {
  const result=await invoke(label,path.join(root,'verify.mjs'),[root,digest],root);
  assert.deepEqual([result.ok,result.manifestSha256,result.checkedFiles],[true,digest,result.declaredFiles]);
  return result;
}

async function workingPins(manifest,except=new Set()) {
  const files=manifest.files.filter(file=>!except.has(file.path));
  for(let i=0;i<files.length;i+=16) await Promise.all(files.slice(i,i+16).map(async file=>{
    const target=path.join(work,file.path);
    assert((await fs.lstat(target)).isFile(),file.path);
    assert.equal(await pin(target),file.sha256,file.path);
  }));
  return files.length;
}

async function main() {
  const originalBytes=await bytes(path.join(sealed,manifestFile)), originalPin=sha(originalBytes), original=JSON.parse(originalBytes);
  const reviewedPin=await pin(path.join(reviewed,manifestFile));
  assert.deepEqual(await bytes(path.join(work,manifestFile)),originalBytes);
  report.original=await verify(sealed,originalPin,'verify-original');
  report.reviewed=await verify(reviewed,reviewedPin,'verify-reviewed');
  report.pristineWorkingFiles=await workingPins(original);
  const lockFile=path.join(prototype,'package-lock.json'), lock=await json(lockFile);
  for(const name of ['three','pngjs','jpeg-js','vite']) assert.equal((await json(path.join(prototype,'node_modules',name,'package.json'))).version,
    lock.packages['node_modules/'+name].version,'Install locked dependencies in WORK before running.');

  const originalParameters=family+'/parameters.json';
  const authored=await json(path.join(source,originalParameters));
  const disc=authored.designs.find(design=>design.id==='floor-vocal-mic-disc' && design.version===1);
  assert.equal(disc?.baseRadius,.20);
  const geometryEdit={...disc,...newRef,displayName:'外部接收款 · 宽底盘唱麦',baseRadius:.24};
  const candidate={...authored,designs:[geometryEdit]};
  const relRecipe=family+'/receiver-disc-wide.json', draft=path.join(source,relRecipe);
  await write(path.join(out,'receiver-disc-wide.json'),candidate);
  await write(draft,candidate);
  const publish=(label,mode)=>invoke(label,path.join(tools,'publish-room-appearance.mjs'),[mode,relRecipe],source);
  const publication=await publish('publish-fifth-look','--publish');
  assert.equal(publication.status,'published');
  assert.equal(publication.items.length,1);
  const [item]=publication.items;
  assert.deepEqual({id:item.id,version:item.version},newRef);
  assert.deepEqual(await publish('reproduce-fifth-look','--check'),{...publication,status:'unchanged'});
  const variant=await json(path.join(source,item.resourcePath)), asset=variant.asset.url.slice(1);
  assert.equal(variant.productionBranch,branch);
  assert.equal(await pin(path.join(prototype,'public',asset)),item.sha256);
  await invoke('check-source-library',path.join(tools,'build-library.mjs'),['--check'],source,{format:'text'});
  report.fifth={...item,parameter:'baseRadius',beforeMetres:disc.baseRadius,afterMetres:geometryEdit.baseRadius,
    recipeSha256:publication.sourceParametersSha256};

  const edit=(label,args)=>invoke(label,path.join(work,'edit.mjs'),args,work);
  const rentalSave=named(work,rental,'save.json'), studioSave=named(work,studio,'save.json');
  const [{document:originalRental},{document:originalStudio}]=await Promise.all([json(rentalSave),json(studioSave)]);
  const replaced=path.join(out,'rental-edited'), ops=path.join(out,'replace-mic.ops.json');
  await write(ops,[{type:'replace-resource',id:micOf(originalRental).id,resource:newRef}]);
  assert.equal((await edit('edit-replace-one-mic',['apply',rentalSave,ops,replaced,'--room',rental])).ok,true);
  const newSave=path.join(replaced,'save.json'), expected=structuredClone(originalRental);
  expected.revision++;
  micOf(expected).resource=newRef;
  assert.deepEqual((await json(newSave)).document,expected);

  const {observeVocalMic}=await load(path.join(tools,'test-vocal-mic-looks.mjs'));
  const [catalog,templates]=await Promise.all([original.runtimeInputs.catalog,original.runtimeInputs.templates].map(file=>json(path.join(prototype,file))));
  const options={catalog,templates,assetRoot:source};
  const previous=structuredClone(expected);
  micOf(previous).resource={id:disc.id,version:disc.version};
  const baseline=await observeVocalMic(previous,options);
  const fifth=await observeVocalMic(expected,options);
  assert.notEqual(fifth.geometry.positionsSha256,baseline.geometry.positionsSha256);
  assert.notEqual(fifth.assetSha256,baseline.assetSha256);
  assert.deepEqual(fifth.measurement.score,baseline.measurement.score);
  assert.deepEqual(fifth.measurement.usePoint,{...baseline.measurement.usePoint,resource:newRef});

  const build=await invoke('build-identity',path.join(prototype,'scripts','build-company-id.mjs'),[],prototype,{format:'text'});
  assert.match(build,/^[a-f0-9]{12}$/);
  assert.notEqual(build,original.buildId);
  await invoke('build-viewer',path.join(prototype,'node_modules','vite','bin','vite.js'),
    ['build','--config','vite.company.config.js'],prototype,{format:'text'});
  const defaultFile=path.join(work,'data','save.json'), {document:originalDefault}=await json(defaultFile);
  const defaultChanges=originalDefault.id===rental;
  const retainedBatch=named(work,studio,'batch-result');
  const target=path.join(out,'receiver-package');
  const published=await invoke('package-both-rooms',path.join(tools,'package-company.mjs'),[
    path.join(prototype,'dist-company'),build,defaultChanges?newSave:defaultFile,target,'--source',source,
    '--room',studio,await exists(retainedBatch)?retainedBatch:studioSave,'--room',rental,newSave,
    ...[['@default',originalDefault.id],[studio,studio],[rental,rental]].flatMap(([key,sourceKey])=>
      ['--inherit-vocal',key,reviewed,reviewedPin,sourceKey]),
  ],work);
  assert.deepEqual([published.ok,published.rooms],[true,[studio,rental]]);
  const targetManifest=path.join(target,manifestFile), derivedPin=await pin(targetManifest), derived=await json(targetManifest);
  report.derived=await verify(target,derivedPin,'verify-derived');
  assert.equal(await pin(path.join(target,'viewer',asset)),item.sha256);
  const retained=original.files.filter(file=>file.path.startsWith('data/rooms/'+studio+'/'));
  assert(retained.length>=3);
  for(const file of retained) assert.equal(await pin(path.join(target,file.path)),file.sha256,file.path);
  report.studioFilesPreserved=retained.length;
  const packedRental=named(target,rental,'save.json'), packedStudio=named(target,studio,'save.json');
  assert.deepEqual(await json(packedRental),await json(newSave));
  assert.deepEqual((await json(packedStudio)).document,originalStudio);
  assert.equal((await edit('validate-rental-cold',['validate',packedRental])).ok,true);
  assert.equal((await edit('validate-studio-cold',['validate',packedStudio])).ok,true);
  for(const [key,document] of [[rental,expected],[studio,originalStudio]]) {
    const receipt=await invoke('cold-read-inherited-'+key,path.join(target,'check-vocal-origin.mjs'),
      [key,derivedPin,reviewed,reviewedPin,key],target);
    assert.deepEqual([receipt.ok,receipt.companyId,receipt.points[0].id],[true,document.id,micOf(document).id+'#vocal']);
    assert.deepEqual(receipt.points[0].resource,micOf(document).resource);
    if(key===rental) assert.deepEqual(receipt.points,[fifth.measurement.usePoint]);
  }
  const packedSource=path.join(target,'source'), packedPrototype=path.join(packedSource,'prototype');
  const [packedCatalog,packedTemplates]=await Promise.all([derived.runtimeInputs.catalog,derived.runtimeInputs.templates]
    .map(file=>json(path.join(packedPrototype,file))));
  const rentalCold=await observeVocalMic((await json(packedRental)).document,
    {catalog:packedCatalog,templates:packedTemplates,assetRoot:packedSource});
  assert.deepEqual(rentalCold,fifth);
  report.cold={rental:rentalCold,baselineGeometry:baseline.geometry};
  report.workingFilesPreserved=await workingPins(original,new Set([
    'source/scripts/company-platform/library-inputs.json','source/prototype/'+original.runtimeInputs.catalog,
  ]));
  await verify(sealed,originalPin,'verify-unchanged-original');
  await verify(reviewed,reviewedPin,'verify-unchanged-reviewed');
  await verify(target,derivedPin,'verify-derived-after-cold-read');
  report.status='passed';
}

await fs.mkdir(out);
try {
  await main();
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch(error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
