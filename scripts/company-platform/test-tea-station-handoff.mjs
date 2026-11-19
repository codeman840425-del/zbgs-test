import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual,promisify} from 'node:util';

const [sealedArg,workArg,outArg,...extra] = process.argv.slice(2);
if (!sealedArg || !workArg || !outArg || extra.length)
  throw Error('Usage: node test-tea-station-handoff.mjs SEALED_PACKAGE FRESH_LOCKED_WORK NEW_OUTPUT_DIRECTORY');
const [sealed,work]=await Promise.all([fs.realpath(sealedArg),fs.realpath(workArg)]);
const requested=path.resolve(outArg), out=path.join(await fs.realpath(path.dirname(requested)),path.basename(requested));
const inside=(parent,child)=>{
  const rel=path.relative(parent,child);
  return !rel || (!path.isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+path.sep));
};
assert(!inside(sealed,work) && !inside(work,sealed),'Use a fresh independent working copy.');
assert(!inside(sealed,out) && !inside(work,out),'Keep all results outside both packages.');

const source=path.join(work,'source'), tools=path.join(source,'scripts','company-platform');
const prototype=path.join(source,'prototype');
const recipe='assets-source/company-tea-station-v1/examples/open-wide-shelf-v2.json';
const newRef={id:'tea-counter-open-wide-shelf',version:2};
const originalCupAt=[0,.051246,.09], counterCupAt=[-.31,.9,.13];
const manifestFile='transfer-manifest.json';
const content=file=>fs.readFile(file);
const read=async file=>JSON.parse(await content(file));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaFile=async file=>sha(await content(file));
const write=(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const run=promisify(execFile), load=file=>import(pathToFileURL(file).href);
const saveAt=(root,key)=>path.join(root,'data','rooms',key,'save.json');
const report={status:'running',sealed,work,commands:[]};
const logs=path.join(out,'logs');
const callback=(tag,cwd,entry,args,format='json',code=0)=>invoke({tag,cwd,entry,args,format,code});

async function invoke({tag,cwd,entry,args,format,code}) {
  const cmd={tag,cwd,entry,args};
  report.commands.push(cmd);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(process.execPath,[entry,...args],{cwd,timeout:240_000,windowsHide:true,maxBuffer:8*1024*1024}));
    cmd.exit=0;
  } catch (error) {
    ({stdout,stderr}=error);
    cmd.exit=error.code;
    if (error.signal) cmd.signal=error.signal;
  }
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([stream,value])=>
    fs.writeFile(path.join(logs,tag+'.'+stream+'.log'),value??'',{flag:'wx'})));
  assert.equal(cmd.exit,code,tag+'\n'+(stderr||stdout||''));
  cmd.response=format==='json'?JSON.parse(code?stderr:stdout):stdout.trim();
  return cmd.response;
}

async function verify(root,pin,tag) {
  const result=await callback(tag,root,'verify.mjs',[root,pin]);
  assert.equal(result.ok,true);
  assert.equal(result.manifestSha256,pin);
  assert.equal(result.checkedFiles,result.declaredFiles);
  return result;
}

async function workingPins(manifest,excluded=new Set()) {
  const pins=manifest.files.filter(file=>!excluded.has(file.path));
  for (let i=0;i<pins.length;i+=16) await Promise.all(pins.slice(i,i+16).map(async pin=>{
    const file=path.join(work,pin.path);
    assert((await fs.lstat(file)).isFile(),'Expected a regular working file: '+pin.path);
    assert.equal(await shaFile(file),pin.sha256,'Working file changed: '+pin.path);
  }));
  return pins.length;
}

function installed(document,id) {
  const result=document.nodes.find(node=>node.id===id);
  assert(result,'Missing installed instance '+id);
  return result;
}

const edit=(tag,args,code=0)=>callback(tag,work,'edit.mjs',args,'json',code);
async function validate(tag,filename,expected) {
  const response=await edit(tag,['validate',filename]);
  assert.equal(response.ok,true);
  assert.equal(response.id,expected.id);
  assert.equal(response.revision,expected.revision);
  assert.deepEqual((await read(filename)).document,expected);
}

async function teaRuntime(document,roles,catalog,templates,expectedOn) {
  const src=path.join(prototype,'src','company');
  const [T,{deriveCompany},{createCompanyScene},{preflightLibraryAssets},{checkTeaStations}]=await Promise.all([
    load(path.join(prototype,'node_modules','three','build','three.module.js')),
    load(path.join(src,'document.js')),load(path.join(src,'render.js')),
    load(path.join(tools,'preflight-library-assets.mjs')),load(path.join(tools,'check-tea-station.mjs')),
  ]);
  const options={catalog,templates,root:source}, derived=deriveCompany(document,catalog,templates);
  const [inspection]=await checkTeaStations(document,{...options,derived});
  const floorId=derived.floorIds.get(roles.counter);
  const items=[...derived.facilities,...derived.surfaceFinishes].filter(item=>item.floorId===floorId);
  const resource=derived.facilities.find(item=>item.id===roles.machine).resource;
  const status=resource.display.status;
  let indicator;
  await preflightLibraryAssets({root:source,resources:items.map(item=>item.resource),validate:library=>{
    const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      const group=scene.root.getObjectByName(roles.machine);
      const lamp=group.getObjectByName(status.nodes[0]);
      assert(lamp?.isMesh && lamp.visible,'The status display needs a visible real mesh.');
      indicator={node:lamp.name,color:'#'+lamp.material.color.getHexString(),emissiveIntensity:lamp.material.emissiveIntensity};
      assert.equal(indicator.color,expectedOn?status.onColor:status.offColor);
      assert.equal(indicator.emissiveIntensity,expectedOn?status.onIntensity:0);
    } finally {scene.dispose();}
  }});
  return {contacts:inspection.contacts,serviceDoors:inspection.serviceDoors,indicator};
}

async function main() {
  const bytes=await content(path.join(sealed,manifestFile)), pin=sha(bytes), original=JSON.parse(bytes);
  assert.deepEqual(await content(path.join(work,manifestFile)),bytes);
  report.original=await verify(sealed,pin,'verify-sealed-original');
  report.initialWorkingFiles=await workingPins(original);
  const lock=await read(path.join(prototype,'package-lock.json'));
  for (const dep of ['three','pngjs','jpeg-js','vite'])
    assert.equal((await read(path.join(prototype,'node_modules',dep,'package.json'))).version,
      lock.packages['node_modules/'+dep].version,'Install the locked dependencies in the working copy.');
  const name='tea-rental', retained='tea-floor', reference=saveAt(work,name);
  const {document:originalRoom}=await read(reference), {document:retainedRoom}=await read(saveAt(work,retained));
  const [rule]=originalRoom.teaStations, {roles}=rule;
  const originalMachine=installed(originalRoom,roles.machine), originalCup=installed(originalRoom,roles.cup);
  assert.equal(originalMachine.state.on,false);
  assert.equal(originalCup.parentId,roles.machine);
  assert.equal(originalCup.attachment.surfaceId,'tray');
  assert.deepEqual(originalCup.transform.position,originalCupAt);
  await validate('validate-original-rental',reference,originalRoom);
  await validate('validate-original-floor',saveAt(work,retained),retainedRoom);

  const publish=flag=>callback('appearance-'+flag,source,path.join(tools,'publish-room-appearance.mjs'),['--'+flag,recipe]);
  const published=await publish('publish');
  const replayed=await publish('check');
  assert.equal(published.status,'published');
  assert.equal(replayed.status,'unchanged');
  assert.equal(published.family,'tea-station');
  assert.deepEqual(replayed.items,published.items);
  const [variant]=published.items;
  assert.deepEqual({id:variant.id,version:variant.version},newRef);
  const resource=await read(path.join(source,variant.resourcePath));
  const model=path.join(prototype,'public',resource.asset.url.replace(/^\//,''));
  assert.equal(await shaFile(model),variant.sha256);
  const library=await callback('check-library-after-registration',source,path.join(tools,'build-library.mjs'),['--check'],'text');
  assert(library);
  const catalogPath=path.join(prototype,original.runtimeInputs.catalog), templatesPath=path.join(prototype,original.runtimeInputs.templates);
  const [catalog,templates]=await Promise.all([read(catalogPath),read(templatesPath)]);
  const beforeCatalog=await read(path.join(sealed,'source','prototype',original.runtimeInputs.catalog));
  assert.deepEqual({...catalog,resources:catalog.resources.filter(item=>item.id!==newRef.id || item.version!==newRef.version)},beforeCatalog);
  report.variant={...variant,recipe,pin:published.sourceParameters,sourceSha256:published.sourceParametersSha256,asset:resource.asset};

  const patch=[{type:'replace-resource',id:roles.counter,resource:newRef},
    {type:'set-state',id:roles.machine,state:{on:true}},
    {type:'attach-surface',id:roles.cup,parentId:roles.counter,surfaceId:'counter',transform:{position:counterCupAt,yaw:0}}];
  const ops=path.join(out,'update-rental.ops.json'), editTarget=path.join(out,'rental-edited');
  await write(ops,patch);
  assert((await edit('apply-counter-swap-power-and-cup-reattachment',['apply',reference,ops,editTarget])).ok);
  const editedSave=path.join(editTarget,'save.json'), expected=structuredClone(originalRoom);
  expected.revision++;
  installed(expected,roles.counter).resource=newRef;
  installed(expected,roles.machine).state.on=true;
  Object.assign(installed(expected,roles.cup),{parentId:roles.counter,attachment:{surfaceId:'counter'},transform:{position:counterCupAt,yaw:0}});
  assert.deepEqual(await read(path.join(editTarget,'layout.json')),expected);
  await validate('cold-validate-edited-rental',editedSave,expected);
  const editedHash=await shaFile(editedSave);
  report.live={before:await teaRuntime(originalRoom,roles,catalog,templates,false),
    countertop:await teaRuntime(expected,roles,catalog,templates,true)};

  const invalid=path.join(out,'overlap-cup.ops.json'), rejected=path.join(out,'rejected-cup-move');
  await write(invalid,[{type:'move',id:roles.cup,transform:{position:[0,.9,0],yaw:0}}]);
  const bad=await edit('reject-cup-over-machine-on-counter',['apply',editedSave,invalid,rejected],1);
  assert.equal(bad.code,'overlapping-supported-props');
  assert.equal(bad.path,roles.cup);
  await assert.rejects(fs.lstat(rejected),{code:'ENOENT'});
  assert.equal(await shaFile(editedSave),editedHash);

  const build=await callback('build-viewer-id',prototype,path.join(prototype,'scripts','build-company-id.mjs'),[],'text');
  assert.match(build,/^[a-f0-9]{12}$/);
  assert.notEqual(build,original.buildId);
  const dist=path.join(prototype,'dist-company');
  await callback('build-viewer',prototype,path.join(prototype,'node_modules','vite','bin','vite.js'),['build','--config','vite.company.config.js'],'text');
  const distInfo=await read(path.join(dist,'company-build-info.json'));
  assert.equal(distInfo.shortId,build);
  const derived=path.join(out,'derived-package'), sourceDefault=path.join(work,'data','save.json');
  const defaultChanged=isDeepStrictEqual((await read(sourceDefault)).document,originalRoom);
  const result=await callback('package-edited-and-retained-rooms',work,path.join(tools,'package-company.mjs'),[
    dist,build,defaultChanged?editedSave:sourceDefault,derived,'--source',source,
    '--room',name,editedSave,'--room',retained,path.join(work,'data','rooms',retained,'batch-result'),
  ]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.rooms,[name,retained]);
  const derivedPin=await shaFile(path.join(derived,manifestFile));
  report.derivative=await verify(derived,derivedPin,'verify-new-clean-package');
  const glbInViewer=path.join(derived,'viewer',resource.asset.url.replace(/^\//,''));
  assert.equal(await shaFile(glbInViewer),variant.sha256);
  const packaged=saveAt(derived,name), keep=saveAt(derived,retained);
  await validate('cold-validate-packaged-rental',packaged,expected);
  await validate('cold-validate-packaged-floor',keep,retainedRoom);
  const floorPrefix='data/rooms/'+retained+'/';
  const floorPins=original.files.filter(file=>file.path.startsWith(floorPrefix));
  assert.equal(floorPins.length,6,'Preserve the floor layout and its four original batch files.');
  for (const file of floorPins) assert.equal(await shaFile(path.join(derived,file.path)),file.sha256);
  if (!defaultChanged) assert.equal(await shaFile(path.join(derived,'data','save.json')),await shaFile(sourceDefault));

  const returnOps=path.join(out,'return-cup-to-tray.ops.json'), trayEdit=path.join(out,'tray-reopened-edit');
  await write(returnOps,[{type:'attach-surface',id:roles.cup,parentId:roles.machine,surfaceId:'tray'}]);
  assert((await edit('return-the-same-cup-from-packaged-save',['apply',packaged,returnOps,trayEdit])).ok);
  const returned=structuredClone(expected);
  returned.revision++;
  Object.assign(installed(returned,roles.cup),structuredClone(originalCup));
  const traySave=path.join(trayEdit,'save.json');
  await validate('cold-validate-returned-cup',traySave,returned);
  report.live.returned=await teaRuntime(returned,roles,catalog,templates,true);
  assert.equal(await shaFile(editedSave),editedHash);
  report.rooms={changed:name,unchanged:retained,untouchedNamedFiles:floorPins.length,roles,originalCupAt,counterCupAt,
    modified:await shaFile(packaged),unchangedSave:await shaFile(keep),returned:await shaFile(traySave)};
  report.negative={code:bad.code,path:bad.path};

  const allowedWorkingChanges=new Set(['source/scripts/company-platform/library-inputs.json','source/prototype/'+original.runtimeInputs.catalog]);
  report.unmodifiedWorkingFiles=await workingPins(original,allowedWorkingChanges);
  assert.equal(await shaFile(path.join(work,manifestFile)),pin);
  report.originalPreserved=await verify(sealed,pin,'verify-sealed-original-after-work');
  await verify(derived,derivedPin,'verify-derived-after-cold-reads');
  assert.equal(await shaFile(model),variant.sha256);
  await assert.rejects(fs.lstat(path.join(derived,'source','prototype','node_modules')),{code:'ENOENT'});
  report.status='passed';
}

await fs.mkdir(out);
await fs.mkdir(logs);
try {
  await main();
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch (error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
