import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual,promisify} from 'node:util';

const [sealedArg,workArg,outArg,...extra] = process.argv.slice(2);
if (!sealedArg || !workArg || !outArg || extra.length)
  throw Error('Usage: node test-live-kit-handoff.mjs SEALED_PACKAGE WORKING_COPY NEW_OUTPUT_DIRECTORY');
const [sealed,work] = await Promise.all([fs.realpath(sealedArg),fs.realpath(workArg)]);
const requestedOutput = path.resolve(outArg);
const out = path.join(await fs.realpath(path.dirname(requestedOutput)),path.basename(requestedOutput));
const includes = (parent,child) => {
  const relative = path.relative(parent,child);
  return !relative || (!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep));
};
assert(!includes(sealed,work) && !includes(work,sealed),'Use an independent working copy of the sealed package.');
assert(!includes(sealed,out) && !includes(work,out),'Output must be separate from both input packages.');

const specimens = [
  {key:'rental-dance-broadcast',select:doc=>doc.trainingBinding.roomId+'/background',replacement:'background-brand-panel',training:true},
  {key:'upper-floor-dance-broadcast',select:doc=>doc.trainingBinding.roomId+'/background',replacement:'background-grid-panel',training:true},
  {key:'singing-studio',select:doc=>doc.singingRooms[0].roles.camera,replacement:'camera-cube-slate'},
  {key:'interview-hotel',select:doc=>doc.interviewRooms[0].roles.guestChair,replacement:'chair-ladder'},
  {key:'showcase-rental',select:doc=>doc.productShowcases[0].members.featured,replacement:'showcase-product-can'},
];
const manifestFile = 'transfer-manifest.json';
const roomSave = (root,key) => path.join(root,'data','rooms',key,'save.json');
const bytes = file => fs.readFile(file);
const read = async file => JSON.parse(await bytes(file));
const write = (file,value) => fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const sha = content => createHash('sha256').update(content).digest('hex');
const shaFile = async file => sha(await bytes(file));
const run = promisify(execFile);
const report = {status:'running',sealed,work,commands:[],rooms:[]};

function node(document,id) {
  const entry = document.nodes.find(candidate=>candidate.id===id);
  assert(entry,'Missing installed instance '+id);
  return entry;
}

async function invoke(label,cwd,entry,args,expectedError) {
  const call = {label,cwd,entry,args};
  report.commands.push(call);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(process.execPath,[entry,...args],{cwd,timeout:180_000,windowsHide:true,maxBuffer:2*1024*1024}));
    call.exit=0;
  } catch (error) {
    ({stdout,stderr}=error);
    call.exit=error.code;
    if (error.signal) call.signal=error.signal;
  }
  assert.equal(call.exit,expectedError?1:0,label+'\n'+(stderr||stdout||''));
  const response=JSON.parse(expectedError ? stderr : stdout);
  call.response=response;
  if (expectedError) {
    assert.equal(response.ok,false);
    assert.equal(response.code,expectedError.code,label+'\n'+response.message);
    assert.equal(response.path,expectedError.path);
  } else {
    assert.equal(stderr.trim(),'');
    assert.equal(response.ok,true,label);
  }
  return response;
}

async function verify(root,pin,label) {
  const result = await invoke(label,root,'verify.mjs',[root,pin]);
  assert.equal(result.manifestSha256,pin);
  assert.equal(result.checkedFiles,result.declaredFiles);
  assert.deepEqual([result.extraFiles,result.changedFiles,result.missingFiles],[0,0,0]);
  return result;
}

async function verifyManifestEntries(root,manifest) {
  for (let at=0;at<manifest.files.length;at+=16) {
    await Promise.all(manifest.files.slice(at,at+16).map(async pin=>{
      const file=path.join(root,pin.path);
      assert((await fs.lstat(file)).isFile(),'Working file is not regular: '+pin.path);
      const content=await bytes(file);
      assert.equal(content.length,pin.bytes,'Working file length differs: '+pin.path);
      assert.equal(sha(content),pin.sha256,'Working file digest differs: '+pin.path);
    }));
  }
  return manifest.files.length;
}

const edit = (label,args,failure) => invoke(label,work,'edit.mjs',args,failure);
async function coldEdit(label,file,expectedDocument) {
  const response = await edit(label,['validate',file]);
  assert.equal(response.id,expectedDocument.id);
  assert.equal(response.revision,expectedDocument.revision);
  return response;
}

async function rejectedWithoutOutput(target,action) {
  const parent=path.dirname(target), before=(await fs.readdir(parent)).sort();
  await action();
  await assert.rejects(fs.lstat(target),{code:'ENOENT'});
  assert.deepEqual((await fs.readdir(parent)).sort(),before,'A failed operation left output or staging files.');
}

async function main() {
  const manifestBytes = await bytes(path.join(sealed,manifestFile)), pin = sha(manifestBytes);
  assert.deepEqual(await bytes(path.join(work,manifestFile)),manifestBytes);
  const original=JSON.parse(manifestBytes);
  report.original=await verify(sealed,pin,'verify the original sealed package');
  report.workingFilesVerified=await verifyManifestEntries(work,original);
  const source=path.join(work,'source'), prototype=path.join(source,'prototype');
  const lock = await read(path.join(prototype,'package-lock.json'));
  const catalog = await read(path.join(prototype,original.runtimeInputs.catalog));
  const catalogEntry = ref => {
    const resource = catalog.resources.find(entry=>entry.id===ref.id && entry.version===ref.version);
    assert(resource,'Missing catalog reference '+ref.id+'@'+ref.version);
    return resource;
  };
  for (const name of ['three','pngjs','jpeg-js']) {
    const installed=await read(path.join(prototype,'node_modules',name,'package.json'));
    assert.equal(installed.version,lock.packages['node_modules/'+name].version,'Install the working copy with npm ci --prefix source/prototype.');
  }

  const changes=[], editRoot=path.join(out,'edits');
  await fs.mkdir(editRoot);
  for (const sample of specimens) {
    const {key,replacement,training} = sample, input=roomSave(work,key);
    const prior=await read(input), file=path.join(editRoot,key+'.ops.json'), target=path.join(editRoot,key);
    await coldEdit(key+' / validate source',input,prior.document);
    const id=sample.select(prior.document), before=node(prior.document,id), resource={id:replacement,version:1};
    assert.notDeepEqual(before.resource,resource);
    const effectiveState = {...catalogEntry(before.resource).stateDefaults,...before.state};
    const operations=[{type:'replace-resource',id,resource}];
    await write(file,operations);
    const result=await edit(key+' / apply one compatible replacement',['apply',input,file,target]);
    const expected = structuredClone(prior.document);
    expected.revision++;
    node(expected,id).resource=resource;
    // Replacing an appearance can materialize previously implicit state defaults.
    node(expected,id).state=effectiveState;
    assert.equal(result.id,expected.id);
    assert.equal(result.revision,expected.revision);
    const save=path.join(target,'save.json'), envelope=await read(save), proposedSha256=await shaFile(save);
    assert.deepEqual(envelope.document,expected,'An instance, its parent, transform, state, or another room changed unexpectedly.');
    assert.deepEqual({...catalogEntry(resource).stateDefaults,...node(envelope.document,id).state},effectiveState);
    assert.deepEqual(await read(path.join(target,'layout.json')),expected);
    assert(envelope.dependencies.resources.some(pin=>pin.id===resource.id&&pin.version===resource.version&&/^[a-f0-9]{64}$/.test(pin.sha256)));
    if (training) {
      const receipt=await read(path.join(target,'training-edit.json'));
      assert.equal(receipt.saveSha256,proposedSha256);
      assert.deepEqual(receipt.trainingClearance,expected.trainingBinding.trainingClearance);
    }
    await coldEdit(key+' / validate edited save',save,expected);
    changes.push({key,input,prior:prior.document,edited:envelope.document,save});
    report.rooms.push({key,company:expected.id,id,parentId:before.parentId,transform:before.transform,
      state:{before:before.state,after:node(envelope.document,id).state,effective:effectiveState},
      attachment:before.attachment,from:before.resource,to:resource,oldRevision:prior.document.revision,
      revision:expected.revision,originalSha256:await shaFile(input),editedSha256:proposedSha256});
  }

  const defaultPath = path.join(work,'data','save.json'), originalDefault=(await read(defaultPath)).document;
  const newDefault = changes.find(change=>isDeepStrictEqual(change.prior,originalDefault));
  const defaultSave=newDefault?.save??defaultPath, defaultDocument=newDefault?.edited??originalDefault;
  const tool=path.join(source,'scripts','company-platform','package-company.mjs');
  const packageTo = (label,target,changedRooms,expect) => invoke(label,work,tool,
    [path.join(work,'viewer'),original.buildId,defaultSave,target,'--source',source,
      ...changedRooms.flatMap(({key,save})=>['--room',key,save])],expect);
  const derivative = path.join(out,'derived-package'), success=await packageTo('publish all five edited rooms',derivative,changes);
  assert.deepEqual(success.rooms,specimens.map(sample=>sample.key));
  const derivedBytes=await bytes(path.join(derivative,manifestFile)), derivedManifest=JSON.parse(derivedBytes);
  const derivativePin=sha(derivedBytes);
  report.derivative=await verify(derivative,derivativePin,'verify the independently sealed derivative');
  assert.equal(derivedManifest.sourceDigest,original.sourceDigest);
  assert.equal(derivedManifest.buildId,original.buildId);
  const viewerFiles = manifest => manifest.files.filter(file=>file.path.startsWith('viewer/'));
  assert.deepEqual(viewerFiles(derivedManifest),viewerFiles(original),'Resealing altered the viewer.');
  const editorFiles=['edit.mjs','source/scripts/company-platform/package-company.mjs',
    ...['package-template/training-room','check-training-clearance','check-dance-shot','check-interview-room','check-singing-room','check-showcase-room'].map(name=>'source/scripts/company-platform/'+name+'.mjs')];
  for (const file of editorFiles) {
    const originalEntry=original.files.find(pin=>pin.path===file);
    assert(originalEntry,'Missing shipped tool '+file);
    assert.deepEqual(derivedManifest.files.find(pin=>pin.path===file),originalEntry);
  }

  const dance=changes[0], cameraId=dance.edited.trainingBinding.trainingClearance.shot.cameraId;
  const camera=node(dance.edited,cameraId), reverse=structuredClone(camera.transform);
  reverse.yaw+=Math.PI;
  const negativeOps=path.join(out,'reverse-dance-camera.ops.json');
  await write(negativeOps,[{type:'move',id:cameraId,transform:reverse}]);
  const badEdit=path.join(out,'rejected-edit'), rejection={code:'dance-shot-out-of-frame',path:cameraId};
  const acceptedHashes = await Promise.all(changes.map(change=>shaFile(change.save)));
  const sealedSaves = await Promise.all(changes.map(change=>shaFile(roomSave(derivative,change.key))));
  await rejectedWithoutOutput(badEdit,()=>edit('public edit refuses the backward dance camera',
    ['apply',dance.save,negativeOps,badEdit],rejection));
  const badSave=path.join(out,'reverse-dance-camera.save.json'), badEnvelope=await read(dance.save);
  node(badEnvelope.document,cameraId).transform=reverse;
  badEnvelope.document.revision++;
  await write(badSave,badEnvelope);
  const badSaveHash=await shaFile(badSave);
  await edit('public validator refuses the detached backward-camera save',['validate',badSave],rejection);
  const badPackage=path.join(out,'rejected-package');
  const badList=changes.map(change=>change===dance ? {...change,save:badSave} : change);
  await rejectedWithoutOutput(badPackage,()=>packageTo('public packager refuses the backward camera among the five rooms',badPackage,badList,rejection));
  assert.equal(await shaFile(badSave),badSaveHash);
  assert.deepEqual(await Promise.all(changes.map(change=>shaFile(change.save))),acceptedHashes);
  assert.deepEqual(await Promise.all(changes.map(change=>shaFile(roomSave(derivative,change.key)))),sealedSaves);
  report.negative={cameraId,code:rejection.code,applied:false,packed:false,derivedSavedHashesPreserved:sealedSaves,
    acceptedEditHashesPreserved:acceptedHashes};

  // Every validation spawns a fresh process. Use the byte-identical packaged CLI in
  // the installed copy so the derived transfer directory stays free of dependencies.
  const derivedDefault = path.join(derivative,'data','save.json');
  assert.deepEqual((await read(derivedDefault)).document,defaultDocument);
  await coldEdit('cold re-read of the derived default save',derivedDefault,defaultDocument);
  for (const [index,{key,edited}] of changes.entries()) {
    const save=roomSave(derivative,key);
    assert.deepEqual((await read(save)).document,edited);
    assert.deepEqual(await read(path.join(path.dirname(save),'layout.json')),edited);
    await coldEdit(key+' / cold re-read directly from sealed derivative',save,edited);
    Object.assign(report.rooms[index],{derivedSha256:sealedSaves[index],coldRead:true});
  }
  await assert.rejects(fs.lstat(path.join(derivative,'source','prototype','node_modules')),{code:'ENOENT'});
  assert.equal(await shaFile(path.join(work,manifestFile)),pin);
  report.workingFilesPreserved=await verifyManifestEntries(work,original);
  report.originalPreserved=await verify(sealed,pin,'reverify original after accepted and rejected edits');
  await verify(derivative,derivativePin,'reverify derivative after the failed edit and package');
  report.viewerFilesPreserved=viewerFiles(original).length;
  report.status='passed';
}

await fs.mkdir(out);
try {
  await main();
  console.log(JSON.stringify({status:report.status,rooms:report.rooms.map(room=>room.key),report:path.join(out,'report.json')},null,2));
} catch (error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
