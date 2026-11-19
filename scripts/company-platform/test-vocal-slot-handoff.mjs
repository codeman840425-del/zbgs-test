import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual,promisify} from 'node:util';

const [sealedArg,workArg,outArg,...extra]=process.argv.slice(2);
if (!sealedArg || !workArg || !outArg || extra.length)
  throw Error('Usage: node test-vocal-slot-handoff.mjs SEALED_PACKAGE FRESH_LOCKED_WORK NEW_OUTPUT_DIRECTORY');
const [sealed,work]=await Promise.all([fs.realpath(sealedArg),fs.realpath(workArg)]);
const requested=path.resolve(outArg), out=path.join(await fs.realpath(path.dirname(requested)),path.basename(requested));
const inside=(parent,child)=>{
  const relative=path.relative(parent,child);
  return !relative || (!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep));
};
assert(!inside(sealed,work) && !inside(work,sealed),'The locked working copy must be independent.');
assert(!inside(sealed,out) && !inside(work,out),'Keep results separate from both packages.');
const source=path.join(work,'source'), tools=path.join(source,'scripts','company-platform');
const prototype=path.join(source,'prototype'), company=path.join(prototype,'src','company');
const studio='singing-studio', rental='singing-rental';
const manifestFile='transfer-manifest.json';
const relativeRoom=key=>'data/rooms/'+key;
const named=(root,key,...rest)=>path.join(root,relativeRoom(key),...rest);
const bytes=file=>fs.readFile(file);
const json=async file=>JSON.parse(await bytes(file));
const sha=content=>createHash('sha256').update(content).digest('hex');
const shaFile=async file=>sha(await bytes(file));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const run=promisify(execFile), load=file=>import(pathToFileURL(file).href);
const report={status:'running',sealed,work,commands:[]};
const node=(document,id)=>{
  const found=document.nodes.find(item=>item.id===id);
  assert(found,'Missing node '+id);
  return found;
};
const close=(a,b,tolerance=1e-6)=>assert(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const samePosition=(actual,expected)=>actual.forEach((value,i)=>close(value,expected[i]));
const turn=(point,transform)=>{
  const [x,y,z]=point,[px,py,pz]=transform.position,a=transform.yaw;
  return [px+Math.cos(a)*x+Math.sin(a)*z,py+y,pz-Math.sin(a)*x+Math.cos(a)*z];
};

async function invoke(label,cwd,entry,args,expectedExit=0) {
  const record={label,entry,args};
  report.commands.push(record);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(process.execPath,[entry,...args],{cwd,timeout:180_000,windowsHide:true,maxBuffer:4*1024*1024}));
    record.exit=0;
  } catch (error) {
    ({stdout,stderr}=error);
    record.exit=error.code;
    if (error.signal) record.signal=error.signal;
  }
  assert.equal(record.exit,expectedExit,label+'\n'+(stderr||stdout||''));
  record.response=JSON.parse(expectedExit?stderr:stdout);
  assert.equal(record.response.ok,!expectedExit,label);
  return record.response;
}

async function verify(root,pin,label) {
  const result=await invoke(label,root,'verify.mjs',[root,pin]);
  assert.equal(result.manifestSha256,pin);
  assert.equal(result.checkedFiles,result.declaredFiles);
  return result;
}

async function workingPins(manifest) {
  for (let offset=0;offset<manifest.files.length;offset+=16)
    await Promise.all(manifest.files.slice(offset,offset+16).map(async pin=>{
      const file=path.join(work,pin.path);
      assert((await fs.lstat(file)).isFile(),'Expected a regular file: '+pin.path);
      assert.equal(await shaFile(file),pin.sha256,'Working source changed: '+pin.path);
    }));
  return manifest.files.length;
}

const edit=(label,args,code=0)=>invoke(label,work,'edit.mjs',args,code);
async function validate(label,file,document) {
  const result=await edit(label,['validate',file]);
  assert.equal(result.id,document.id);
  assert.equal(result.revision,document.revision);
  assert.deepEqual((await json(file)).document,document);
}

async function signedPoint(root,prefix,file,manifest) {
  const name=prefix+'/use-points.json', sidecar=path.join(root,name);
  const row=manifest.usePointReports.find(row=>row.path===name);
  assert(row,'Missing use-point report declaration: '+name);
  const pin=manifest.files.find(row=>row.path===name);
  assert(pin && pin.sha256===await shaFile(sidecar),'Unpinned use-point report '+name);
  const {document}=await json(file), envelope=await json(sidecar);
  assert.equal(envelope.schema,'company-installed-use-points');
  assert.equal(envelope.version,1);
  assert.equal(envelope.companyId,document.id);
  assert.equal(row.companyId,document.id);
  assert.equal(envelope.revision,document.revision);
  assert.equal(envelope.saveSha256,await shaFile(file));
  assert.equal(row.count,envelope.points.length);
  assert.equal(envelope.points.length,1);
  return envelope.points[0];
}

async function observe(file,point,manifest) {
  const [T,{deriveCompany},{decodeCompanySave},{createCompanyScene},{checkSingingRooms},{preflightLibraryAssets},catalog,templates]=
    await Promise.all([
      load(path.join(prototype,'node_modules','three','build','three.module.js')),
      load(path.join(company,'document.js')),load(path.join(company,'persistence.js')),load(path.join(company,'render.js')),
      load(path.join(tools,'check-singing-room.mjs')),load(path.join(tools,'preflight-library-assets.mjs')),
      json(path.join(prototype,manifest.runtimeInputs.catalog)),json(path.join(prototype,manifest.runtimeInputs.templates)),
    ]);
  const document=await decodeCompanySave((await bytes(file)).toString('utf8'),catalog,templates);
  const [rule]=document.singingRooms, mic=node(document,rule.roles.mic), room=node(document,rule.regionId), floor=node(document,room.parentId);
  const spec=rule.performer, yaw=floor.transform.yaw+room.transform.yaw+mic.transform.yaw;
  const world=vector=>turn(turn(turn(vector,mic.transform),room.transform),floor.transform);
  assert.equal(point.id,mic.id+'#vocal');
  assert.equal(point.slotId,'vocal');
  assert.equal(point.kind,'standing-vocal');
  assert.equal(point.roomId,room.id);
  assert.equal(point.floorId,floor.id);
  assert.equal(point.facilityId,mic.id);
  assert.deepEqual(point.resource,mic.resource);
  assert(!Object.hasOwn(point,'seatHeight'));
  assert.deepEqual(point.contact,{pickupNodeId:'singing-mic-pickup'});
  assert.deepEqual(point.local,{coordinateSpace:'facility',position:spec.position,yaw:spec.yaw,approach:spec.approach,exit:spec.exit});
  assert.deepEqual(point.performerReferences,{coordinateSpace:'use-point',mouth:spec.mouth,eye:spec.eye});
  samePosition(point.transform.position,world(spec.position));
  samePosition(point.approachPosition,world(spec.approach));
  samePosition(point.exitPosition,world(spec.exit));
  samePosition(point.facilityTransform.position,world([0,0,0]));
  close(point.transform.yaw,yaw+spec.yaw);
  close(point.facilityTransform.yaw,yaw);
  const options={catalog,templates,root:source};
  const [measured]=await checkSingingRooms(document,options);
  assert.deepEqual(JSON.parse(JSON.stringify(measured.usePoint)),point);
  const derived=deriveCompany(document,catalog,templates);
  const resources=[...derived.facilities,...derived.surfaceFinishes].filter(item=>item.floorId===floor.id).map(item=>item.resource);
  let actual;
  await preflightLibraryAssets({root:source,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:floor.id,assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      const {anchor,pickupMesh}=scene.resolveUsePoint(point.id);
      assert(anchor?.isObject3D && pickupMesh?.isMesh);
      assert.equal(pickupMesh.name,point.contact.pickupNodeId);
      assert.deepEqual(JSON.parse(JSON.stringify(scene.describeUsePoint(point.id))),point);
      samePosition(anchor.getWorldPosition(new T.Vector3()).toArray(),point.transform.position);
      samePosition(anchor.getWorldDirection(new T.Vector3()).toArray(),[Math.sin(point.transform.yaw),0,Math.cos(point.transform.yaw)]);
      const mouth = new T.Vector3(...world(turn(spec.mouth,{position:spec.position,yaw:spec.yaw})));
      const target=new T.Vector3(...turn(turn(measured.microphone.surface,room.transform),floor.transform));
      const direction=target.clone().sub(mouth).normalize();
      const hit=new T.Raycaster(mouth,direction,0,.31).intersectObject(pickupMesh,false)[0];
      assert.equal(hit?.object,pickupMesh,'The persisted slot must point to the actual pickup.');
      samePosition(hit.point.toArray(),target.toArray());
      close(hit.distance,measured.microphone.distanceMetres);
      actual={mesh:pickupMesh.name,worldHit:hit.point.toArray(),mouthDistance:hit.distance,approach:measured.approach,exit:measured.exit};
    } finally {scene.dispose();}
  }});
  return {saveSha256:await shaFile(file),point,actual};
}

async function rejectedWithoutOutput(parent,invokeFailure,expectedCode,expectedPath) {
  const before=(await fs.readdir(parent)).sort();
  const result=await invokeFailure();
  assert.equal(result.code,expectedCode,result.message);
  if (expectedPath) assert.equal(result.path,expectedPath);
  assert.deepEqual((await fs.readdir(parent)).sort(),before,'The rejected operation left a result or staging directory.');
  return result;
}

async function authoredTamper(batchSource,document,save,fixture) {
  await fs.mkdir(fixture);
  const layoutPath=path.join(fixture,'layout.json'), savePath=path.join(fixture,'save.json');
  await fs.copyFile(path.join(batchSource,'input.json'),path.join(fixture,'input.json'),fs.constants.COPYFILE_EXCL);
  await write(layoutPath,document);
  await fs.copyFile(save,savePath,fs.constants.COPYFILE_EXCL);
  const receipt=await json(path.join(batchSource,'report.json'));
  for(const name of ['input.json','layout.json','save.json']){
    const data=await bytes(path.join(fixture,name));
    receipt.files[name]={sha256:sha(data),bytes:data.length};
  }
  await write(path.join(fixture,'report.json'),receipt);
  return fixture;
}

async function main() {
  const manifestBytes=await bytes(path.join(sealed,manifestFile)), pin=sha(manifestBytes);
  assert.deepEqual(await bytes(path.join(work,manifestFile)),manifestBytes);
  const manifest=JSON.parse(manifestBytes);
  report.original=await verify(sealed,pin,'verify original package');
  report.workingFilesVerified=await workingPins(manifest);
  const lock=await json(path.join(prototype,'package-lock.json'));
  for(const dep of ['three','pngjs','jpeg-js'])
    assert.equal((await json(path.join(prototype,'node_modules',dep,'package.json'))).version,lock.packages['node_modules/'+dep].version);
  const studioSave=named(work,studio,'save.json'), rentalSave=named(work,rental,'save.json');
  const {document:oldStudio}=await json(studioSave), {document:oldRental}=await json(rentalSave);
  const defaultSave=path.join(work,'data','save.json'), {document:oldDefault}=await json(defaultSave);
  const [rule]=oldStudio.singingRooms, studioId=rule.roles.mic+'#vocal';
  const origStudio=await signedPoint(work,relativeRoom(studio),studioSave,manifest);
  const origRental=await signedPoint(work,relativeRoom(rental),rentalSave,manifest);
  await validate('cold validate original studio',studioSave,oldStudio);
  await validate('cold validate original rental',rentalSave,oldRental);
  report.before={studio:await observe(studioSave,origStudio,manifest),rental:await observe(rentalSave,origRental,manifest)};

  const displacement={position:[.05,0,.05],yaw:Math.PI/2};
  const operations=oldStudio.nodes.filter(item=>item.kind==='facility'&&item.parentId===rule.regionId).map(item=>({
    type:'move',id:item.id,transform:{position:turn(item.transform.position,displacement),yaw:item.transform.yaw+displacement.yaw},
  }));
  assert(operations.some(item=>item.id===rule.roles.mic),'The edit must move the installed microphone.');
  const ops=path.join(out,'turn-and-move.ops.json'), editOutput=path.join(out,'studio-edited');
  await write(ops,operations);
  await edit('public studio move and quarter turn',['apply',studioSave,ops,editOutput]);
  const movedSave=path.join(editOutput,'save.json'), expected=structuredClone(oldStudio);
  expected.revision++;
  for (const operation of operations) node(expected,operation.id).transform=operation.transform;
  assert.deepEqual(await json(path.join(editOutput,'layout.json')),expected);
  await validate('cold validate the edited studio',movedSave,expected);
  const publishedHash=await shaFile(movedSave);

  const pack=(label,main,rooms,target,code=0)=>invoke(label,work,path.join(tools,'package-company.mjs'),[
    path.join(work,'viewer'),manifest.buildId,main,target,'--source',source,
    ...rooms.flatMap(([key,file])=>['--room',key,file]),
  ],code);
  const rentalBatch=named(work,rental,'batch-result'), studioBatch=named(work,studio,'batch-result');
  const derived=path.join(out,'derived-package');
  const newDefault=isDeepStrictEqual(oldStudio,oldDefault)?movedSave:defaultSave;
  const packed=await pack('package moved studio and original rental',newDefault,[[studio,movedSave],[rental,rentalBatch]],derived);
  assert.deepEqual(packed.rooms,[studio,rental]);
  const derivedManifest=await json(path.join(derived,manifestFile)), derivedPin=await shaFile(path.join(derived,manifestFile));
  report.derived=await verify(derived,derivedPin,'verify derived clean package');
  assert.equal(derivedManifest.buildId,manifest.buildId);
  assert.equal(derivedManifest.sourceDigest,manifest.sourceDigest);
  const viewer=manifest=>manifest.files.filter(entry=>entry.path.startsWith('viewer/'));
  assert.deepEqual(viewer(derivedManifest),viewer(manifest));
  report.viewerFilesPreserved=viewer(manifest).length;
  const derivedStudio=named(derived,studio,'save.json'), derivedRental=named(derived,rental,'save.json');
  const newStudio=await signedPoint(derived,relativeRoom(studio),derivedStudio,derivedManifest);
  const newRental=await signedPoint(derived,relativeRoom(rental),derivedRental,derivedManifest);
  assert.deepEqual(newRental,origRental);
  const {id,roomId,floorId,facilityId,slotId,kind,contact,local}=origStudio;
  for(const [key,value] of Object.entries({id,roomId,floorId,facilityId,slotId,kind,contact,local}))
    assert.deepEqual(newStudio[key],value,'Moving the stage must retain '+key);
  samePosition(newStudio.transform.position,turn(origStudio.transform.position,displacement));
  samePosition(newStudio.approachPosition,turn(origStudio.approachPosition,displacement));
  samePosition(newStudio.exitPosition,turn(origStudio.exitPosition,displacement));
  close(newStudio.transform.yaw,origStudio.transform.yaw+displacement.yaw);
  const retained=manifest.files.filter(entry=>entry.path.startsWith(relativeRoom(rental)+'/'));
  assert.equal(retained.length,7,'Leave the rental save, layout, pose sidecar and four source batch files intact.');
  for(const entry of retained) assert.equal(await shaFile(path.join(derived,entry.path)),entry.sha256);
  await validate('cold validate packed studio',derivedStudio,expected);
  await validate('cold validate packed unchanged rental',derivedRental,oldRental);
  if(derivedManifest.usePointReports.some(row=>row.path==='data/use-points.json')) {
    const defaultFile=path.join(derived,'data','save.json'), {document}=await json(defaultFile);
    await signedPoint(derived,'data',defaultFile,derivedManifest);
    await validate('cold validate packed default room',defaultFile,document);
  }
  report.after={studio:await observe(derivedStudio,newStudio,derivedManifest),rental:await observe(derivedRental,newRental,derivedManifest)};
  close(report.after.studio.actual.mouthDistance,report.before.studio.actual.mouthDistance);
  samePosition(report.after.studio.actual.worldHit,turn(report.before.studio.actual.worldHit,displacement));

  const negative=[];
  for(const [label,damage] of [
    ['remove-vocal-declaration',document=>{delete document.singingRooms;}],
    ['change-authoritative-eye-reference',document=>{document.singingRooms[0].performer.eye[1]+=.005;}],
  ]) {
    const altered=await json(studioSave), file=path.join(out,label+'.save.json');
    damage(altered.document);
    await write(file,altered);
    const before=await shaFile(file);
    const result=await rejectedWithoutOutput(out,()=>edit(label+' through public edit',
      ['apply',file,ops,path.join(out,label+'-reject'),'--room',studio],1),'vocal-slot-binding-mismatch',file);
    const checked=await edit(label+' through public validate',['validate',file,'--room',studio],1);
    assert.equal(checked.code,result.code);
    const forged=await authoredTamper(studioBatch,altered.document,file,path.join(out,label+'-with-original-batch-declaration'));
    const packing=await rejectedWithoutOutput(out,()=>pack(label+' through public package',defaultSave,
      [[studio,forged],[rental,rentalBatch]],path.join(out,label+'-failed-package'),1),'singing-batch-binding-mismatch');
    assert.equal(await shaFile(file),before);
    negative.push({label,edit:result,validate:checked,package:packing});
  }

  const blockingOp={type:'add-facility',id:rule.regionId+'/handoff-path-blocker',parentId:rule.regionId,
    resource:{id:'background-brand-panel',version:1},transform:{position:[0,0,1.25],yaw:0}};
  const blockingOps=path.join(out,'block-approach-exit.ops.json');
  await write(blockingOps,[blockingOp]);
  const unreadable=await rejectedWithoutOutput(out,()=>edit('reject real obstacle at both approach and exit',
    ['apply',studioSave,blockingOps,path.join(out,'blocked-edit')],1),'vocal-use-path-blocked',studioId);
  assert.equal(unreadable.details?.blockedBy,blockingOp.id);
  assert.equal(unreadable.details?.segment,'approach');
  // This same installed panel is already used elsewhere in the room, so the
  // detached blocked save keeps valid resource dependency pins.
  const obstructed=await json(studioSave), {type,...nodeFields}=blockingOp;
  assert.equal(type,'add-facility');
  assert(obstructed.dependencies.resources.some(ref=>ref.id===blockingOp.resource.id&&ref.version===blockingOp.resource.version));
  obstructed.document.nodes.push({...nodeFields,kind:'facility',state:{}});
  obstructed.document.revision++;
  const badSave=path.join(out,'blocked.save.json');
  await write(badSave,obstructed);
  const badHash=await shaFile(badSave);
  const blockedPack=await rejectedWithoutOutput(out,()=>pack('refuse physical obstruction in a named packaged room',defaultSave,
    [[studio,badSave],[rental,rentalBatch]],path.join(out,'blocked-package'),1),'vocal-use-path-blocked',studioId);
  assert.deepEqual(blockedPack.details,unreadable.details);
  assert.equal(await shaFile(badSave),badHash);
  negative.push({label:'physical approach and exit blocked',id:studioId,edit:unreadable,package:blockedPack});
  report.negative=negative;

  assert.equal(await shaFile(movedSave),publishedHash);
  await assert.rejects(fs.lstat(path.join(derived,'source','prototype','node_modules')),{code:'ENOENT'});
  report.unchangedRentalFiles=retained.length;
  assert.equal(await shaFile(path.join(work,manifestFile)),pin);
  report.workingFilesPreserved=await workingPins(manifest);
  await verify(sealed,pin,'reverify unchanged original');
  await verify(derived,derivedPin,'reverify derived package after rejected publication');
  report.status='passed';
}

await fs.mkdir(out);
try {
  await main();
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch (error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {await write(path.join(out,'report.json'),report);}
