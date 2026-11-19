import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const [originalArg,movedArg,outArg,toolsArg,...options]=process.argv.slice(2);
assert(originalArg && movedArg && outArg && (!options.length ||
  (options.length===2 && options[0]==='--tool-entry' && toolsArg)),
  'Usage: node test-vocal-lineage.mjs ORIGINAL_VOCAL_PACKAGE MOVED_VOCAL_PACKAGE FRESH_OUT [LOCKED_TOOL_PACKAGE [--tool-entry PACKAGE_COMPANY_MJS]]');

const run=promisify(execFile);
const bytes=file=>fs.readFile(file);
const json=async file=>JSON.parse(await bytes(file));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const pin=async file=>sha(await bytes(file));
const inside=(root,file)=>{
  const relative=path.relative(root,file);
  return !path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep);
};
const exists=async file=>fs.lstat(file).then(()=>true,error=>{
  if(error.code==='ENOENT') return false;
  throw error;
});
const [original,moved,toolsPackage]=await Promise.all([fs.realpath(originalArg),fs.realpath(movedArg),
  toolsArg?fs.realpath(toolsArg):null]);
const toolOverride=options[1]?await fs.realpath(options[1]):null;
const out=path.resolve(outArg), parent=path.dirname(out);
assert.notEqual(out,parent);
assert.equal(path.relative(parent,await fs.realpath(parent)),'','Use an existing real output parent.');
assert(!(await exists(out)),'FRESH_OUT already exists.');
for(const input of [original,moved,toolsPackage].filter(Boolean))
  assert(!inside(input,out) && !inside(out,input),'Put test results outside the input packages.');
for(let dir=path.dirname(fileURLToPath(import.meta.url));dir!==path.dirname(dir);dir=path.dirname(dir)) {
  if(!(await exists(path.join(dir,'scripts/company-platform/local-workspace.ps1')))) continue;
  const allowed=['output','company-workspace/production-trials'].map(name=>path.join(dir,name));
  assert(allowed.some(root=>root!==out && inside(root,out)),'Use this project’s output or production-trials directory.');
  break;
}

const manifestFile='transfer-manifest.json';
const originalSha='2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57';
const movedSha='21b4a370b62ee6580a4d8b017f0acbe98293cdb331c60c3cc098120cfe7fca93';
const studio='singing-studio', rental='singing-rental', defaultRoom='@default';
const prefix=key=>key===defaultRoom?'data':`data/rooms/${key}`;
const roomFile=(root,key,basename='save.json')=>path.join(root,prefix(key),basename);
const report={status:'running',fixtures:{original,moved},commands:[],rejections:[]};

async function invoke(label,entry,args,cwd,{fails=false}={}) {
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
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([stream,value])=>
    fs.writeFile(path.join(out,`${label}.${stream}.log`),value??'',{flag:'wx'})));
  assert.equal(command.exit,fails?1:0,label+'\n'+(stderr||stdout||''));
  command.response=JSON.parse(fails?stderr:stdout);
  return command.response;
}

async function verify(root,digest,label) {
  const measured=await invoke(label,path.join(root,'verify.mjs'),[root,digest],root);
  assert.deepEqual([measured.ok,measured.manifestSha256,measured.checkedFiles],[true,digest,measured.declaredFiles]);
  return measured;
}

async function readRoom(root,manifest,key) {
  const saveFile=roomFile(root,key), save=await json(saveFile);
  const saveSha256=await pin(saveFile);
  const files=manifest.files.filter(item=>item.path===prefix(key)+'/save.json');
  assert.equal(files.length,1);
  assert.equal(files[0].sha256,saveSha256);
  const pointPath=prefix(key)+'/use-points.json';
  const matching=(manifest.usePointReports??[]).filter(item=>item.path===pointPath);
  if(!matching.length) {
    assert(!(await exists(roomFile(root,key,'use-points.json'))));
    return {save,saveSha256,points:[]};
  }
  assert.equal(matching.length,1);
  const measured=await json(roomFile(root,key,'use-points.json'));
  const pointFiles=manifest.files.filter(item=>item.path===pointPath);
  assert.equal(pointFiles.length,1);
  assert.equal(pointFiles[0].sha256,await pin(roomFile(root,key,'use-points.json')));
  assert.deepEqual(matching[0],{path:pointPath,companyId:save.document.id,count:measured.points.length});
  assert.deepEqual([measured.schema,measured.version,measured.companyId,measured.revision,measured.saveSha256],
    ['company-installed-use-points',1,save.document.id,save.document.revision,saveSha256]);
  return {save,saveSha256,points:measured.points};
}

const checkPointId=(record,company)=>{
  assert.deepEqual(record.points.map(({id,companyId,kind})=>[id,companyId,kind]),
    [[`${company}/ground/live/vocal#vocal`,company,'standing-vocal']]);
};
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const samePosition=(actual,expected)=>actual.forEach((value,index)=>close(value,expected[index]));

async function baseline() {
  report.original=await verify(original,originalSha,'verify-original');
  report.moved=await verify(moved,movedSha,'verify-moved');
  const [oldManifest,movedManifest]=await Promise.all([original,moved].map(root=>json(path.join(root,manifestFile))));
  const [oldDefault,oldStudio,oldRental,movedStudio,movedRental]=await Promise.all([
    readRoom(original,oldManifest,defaultRoom),readRoom(original,oldManifest,studio),readRoom(original,oldManifest,rental),
    readRoom(moved,movedManifest,studio),readRoom(moved,movedManifest,rental),
  ]);
  assert.deepEqual(oldDefault,oldStudio);
  assert.deepEqual(oldRental,movedRental);
  assert.notEqual(oldStudio.saveSha256,movedStudio.saveSha256);
  for(const room of [oldDefault,oldStudio,movedStudio]) checkPointId(room,studio);
  checkPointId(oldRental,rental);
  const [before]=oldStudio.points,[after]=movedStudio.points;
  assert.deepEqual(after.local,before.local);
  assert.deepEqual(after.performerReferences,before.performerReferences);
  assert.equal(after.revision,before.revision+1);
  samePosition(before.transform.position,[0,0,.77]);
  samePosition(after.transform.position,[.82,0,.05]);
  samePosition(after.approachPosition,[1.17,0,.05]);
  samePosition(after.exitPosition,[1.17,0,.05]);
  close(after.transform.yaw,before.transform.yaw+Math.PI/2);

  // Detach the input saves so only the explicit source options can claim inheritance.
  const fixtures=path.join(out,'fixtures');
  await fs.mkdir(fixtures);
  const detached=async (name,value)=>{
    const file=path.join(fixtures,name);
    await write(file,value);
    return file;
  };
  const originalSave=await detached('original-studio.save.json',oldStudio.save);
  const movedSave=await detached('moved-studio.save.json',movedStudio.save);
  const rentalSave=await detached('rental.save.json',oldRental.save);
  const removed=structuredClone(oldStudio.save), eyeEdited=structuredClone(oldStudio.save);
  delete removed.document.singingRooms;
  eyeEdited.document.singingRooms[0].performer.eye[1]+=.005;
  const removedSave=await detached('without-vocal.save.json',removed);
  const eyeEditedSave=await detached('with-eye-edited.save.json',eyeEdited);
  const unsupported=path.join(fixtures,'unsupported-source-version');
  await fs.mkdir(unsupported);
  const versionManifest=path.join(unsupported,manifestFile);
  await write(versionManifest,{...oldManifest,version:999});
  const unsupportedSha=await pin(versionManifest);
  report.baseline={oldStudio:before.transform,movedStudio:after.transform,movedApproach:after.approachPosition,
    originalSaveSha256:oldStudio.saveSha256,movedSaveSha256:movedStudio.saveSha256,
    eyeBefore:oldStudio.save.document.singingRooms[0].performer.eye,eyeAfter:eyeEdited.document.singingRooms[0].performer.eye};
  return {oldDefault,oldStudio,oldRental,movedStudio,movedRental,originalSave,movedSave,rentalSave,
    removedSave,eyeEditedSave,removed,eyeEdited,unsupported,unsupportedSha};
}

async function expectError(label,expected,operation) {
  let diagnostic;
  await assert.rejects(async()=>operation(),error=>{
    assert.equal(error.code,expected,error.message);
    diagnostic={label,code:error.code,path:error.path,message:error.message};
    return true;
  });
  report.rejections.push(diagnostic);
}

const sourceSpec=(packageRoot,manifestSha256,sourceRoomKey)=>({packageRoot,manifestSha256,sourceRoomKey});

async function integration(input) {
  const source=path.join(toolsPackage,'source'), prototype=path.join(source,'prototype');
  const entry=toolOverride??path.join(source,'scripts','company-platform','package-company.mjs');
  const scripts=path.dirname(entry);
  const toolManifest=await json(path.join(toolsPackage,manifestFile));
  const lock=await json(path.join(prototype,'package-lock.json'));
  for(const name of ['three','pngjs','jpeg-js'])
    assert.equal((await json(path.join(prototype,'node_modules',name,'package.json'))).version,
      lock.packages['node_modules/'+name].version,'Install the fixed tool package with npm ci.');
  const {readVocalAuthority,inheritVocalOrigin}=await import(pathToFileURL(path.join(scripts,'package-template','vocal-origin.mjs')).href);
  const sourceDefault=sourceSpec(original,originalSha,defaultRoom);
  const sourceStudio=sourceSpec(original,originalSha,studio);
  const sourceRental=sourceSpec(moved,movedSha,rental);
  const [defaultAuthority,studioAuthority,rentalAuthority]=await Promise.all([
    readVocalAuthority(sourceDefault),readVocalAuthority(sourceStudio),readVocalAuthority(sourceRental),
  ]);
  const defaultOrigin=await inheritVocalOrigin(defaultAuthority,input.oldDefault.save.document,input.oldDefault.points);
  const movedOrigin=await inheritVocalOrigin(studioAuthority,input.movedStudio.save.document,input.movedStudio.points);
  const rentalOrigin=await inheritVocalOrigin(rentalAuthority,input.movedRental.save.document,input.movedRental.points);
  assert.match(defaultOrigin.declarationSha256,/^[a-f0-9]{64}$/);
  assert.equal(movedOrigin.declarationSha256,defaultOrigin.declarationSha256);
  assert.notEqual(rentalOrigin.declarationSha256,movedOrigin.declarationSha256);

  await expectError('delete the authoritative studio declaration','vocal-slot-binding-mismatch',
    ()=>inheritVocalOrigin(studioAuthority,input.removed.document,[]));
  await expectError('shift the authoritative studio eye by five millimetres','vocal-slot-binding-mismatch',
    ()=>inheritVocalOrigin(studioAuthority,input.eyeEdited.document,input.oldStudio.points));
  await expectError('wrong source manifest pin','vocal-origin-manifest-mismatch',
    ()=>readVocalAuthority(sourceSpec(original,movedSha,studio)));
  await expectError('unknown source manifest version','unsupported-vocal-origin-version',
    ()=>readVocalAuthority(sourceSpec(input.unsupported,input.unsupportedSha,studio)));
  await expectError('unknown named room must not fall back to default','missing-vocal-origin-room',
    ()=>readVocalAuthority(sourceSpec(original,originalSha,'not-a-room')));
  await expectError('a signed rental declaration cannot govern the studio','vocal-origin-room-mismatch',
    ()=>inheritVocalOrigin(rentalAuthority,input.oldStudio.save.document,input.oldStudio.points));

  const pack=async (label,dest,rooms,inheritance,{fails=false}={})=>{
    const output=path.join(out,dest);
    const args=[path.join(toolsPackage,'viewer'),toolManifest.buildId,input.originalSave,output,'--source',source,
      ...rooms.flatMap(([key,file])=>['--room',key,file]),
      ...inheritance.flatMap(([key,spec])=>['--inherit-vocal',key,spec.packageRoot,spec.manifestSha256,spec.sourceRoomKey])];
    return invoke(label,entry,args,toolsPackage,{fails});
  };
  const rejectedName='failed-strict-package';
  const rejected=await pack('reject-strict-deletion-through-cli',rejectedName,[[studio,input.removedSave]],[[studio,sourceStudio]],{fails:true});
  assert.deepEqual([rejected.ok,rejected.code],[false,'vocal-slot-binding-mismatch']);
  assert(!(await fs.readdir(out)).some(name=>name===rejectedName || name.startsWith('.'+rejectedName+'.')),
    'A rejected pack must leave no package, stage or lock.');
  report.rejections.push({label:'reject-strict-deletion-through-cli',code:rejected.code,path:rejected.path});

  const batchKey='rental-from-batch', removedKey='studio-without-vocal', eyeEditedKey='studio-with-eye-edited';
  const names=[[studio,input.movedSave],[rental,input.rentalSave],
    [batchKey,roomFile(original,rental,'batch-result')],[removedKey,input.removedSave],[eyeEditedKey,input.eyeEditedSave]];
  const strict=[[defaultRoom,sourceDefault],[studio,sourceStudio],[rental,sourceRental]];
  const packedName='vocal-lineage-package';
  const packed=await pack('package-mixed-origin-rooms',packedName,names,strict);
  assert.deepEqual([packed.ok,packed.rooms],[true,names.map(([key])=>key)]);
  const target=path.join(out,packedName), outputPin=await pin(path.join(target,manifestFile));
  const manifest=await json(path.join(target,manifestFile));
  report.derived=await verify(target,outputPin,'verify-mixed-package');
  const originMap=new Map(manifest.roomOrigins.map(item=>[item.key,item]));
  assert.equal(originMap.size,manifest.roomOrigins.length,'Each room key has exactly one origin.');
  assert.deepEqual([...originMap.keys()].sort(),[defaultRoom,...names.map(([key])=>key)].sort());
  report.rooms={};
  for(const [key,picked,mode,strictEntry,proof] of [
    [defaultRoom,input.oldDefault,'inherited-vocal',sourceDefault,defaultOrigin],
    [studio,input.movedStudio,'inherited-vocal',sourceStudio,movedOrigin],
    [rental,input.movedRental,'inherited-vocal',sourceRental,rentalOrigin],
    [batchKey,input.oldRental,'batch-declared'],
    [removedKey,{save:input.removed},'independent'],
    [eyeEditedKey,{save:input.eyeEdited},'independent'],
  ]) {
    const measured=await readRoom(target,manifest,key), origin=originMap.get(key);
    assert.deepEqual(measured.save,picked.save,`Cold read differs for ${key}`);
    assert.deepEqual([origin.companyId,origin.saveSha256,origin.mode],
      [measured.save.document.id,measured.saveSha256,mode]);
    if(strictEntry) {
      assert.deepEqual(origin,{key,companyId:measured.save.document.id,saveSha256:measured.saveSha256,...proof});
      assert.deepEqual([origin.sourceManifestSha256,origin.sourceRoomKey,origin.pointIds],
        [strictEntry.manifestSha256,strictEntry.sourceRoomKey,picked.points.map(({id})=>id)]);
    } else if(mode==='independent') {
      for(const field of ['sourceManifestSha256','sourceRoomKey','declarationSha256']) assert(!(field in origin),key+': '+field);
    }
    if(picked.points) assert.deepEqual(measured.points,picked.points,key);
    if(key===removedKey) assert.equal(measured.points.length,0);
    if(key===eyeEditedKey) {
      checkPointId(measured,studio);
      assert.deepEqual(measured.points[0].performerReferences.eye,input.eyeEdited.document.singingRooms[0].performer.eye);
    }
    report.rooms[key]={origin,points:measured.points.map(({id,transform,performerReferences})=>({id,transform,performerReferences}))};
  }
  assert.notEqual(report.rooms[defaultRoom].origin.saveSha256,report.rooms[studio].origin.saveSha256);
  assert.deepEqual(report.rooms[defaultRoom].points[0].transform,input.oldDefault.points[0].transform);
  assert.deepEqual(report.rooms[studio].points[0].transform,input.movedStudio.points[0].transform);

  const reader=(label,key,spec,fails=false)=>invoke(label,path.join(target,'check-vocal-origin.mjs'),
    [key,outputPin,spec.packageRoot,spec.manifestSha256,spec.sourceRoomKey],target,{fails});
  const checked=await reader('read-inherited-moved-studio',studio,sourceStudio);
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.points,input.movedStudio.points);
  samePosition(checked.points[0].transform.position,[.82,0,.05]);
  samePosition(checked.points[0].approachPosition,[1.17,0,.05]);
  report.publicReader={key:studio,sourceRoomKey:sourceStudio.sourceRoomKey,world:checked.points[0].transform};
  for(const [label,key,spec,code] of [
    ['reader-rejects-independently-edited-eye',eyeEditedKey,sourceStudio,'vocal-origin-not-inherited'],
    ['reader-rejects-missing-stand-slot',removedKey,sourceStudio,'missing-vocal-origin-points'],
    ['reader-rejects-default-source-for-named-room',studio,sourceDefault,'vocal-origin-not-inherited'],
  ]) {
    const result=await reader(label,key,spec,true);
    assert.equal(result.code,code,result.message);
    report.rejections.push({label,code:result.code,path:result.path});
  }
  await verify(original,originalSha,'verify-original-after-inheritance');
  await verify(moved,movedSha,'verify-moved-after-inheritance');
  assert.equal(await pin(path.join(target,manifestFile)),outputPin);
  report.status='passed';
}

await fs.mkdir(out);
try {
  const baselineInputs=await baseline();
  if(toolsPackage) await integration(baselineInputs);
  else report.status='baseline-passed';
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch(error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
