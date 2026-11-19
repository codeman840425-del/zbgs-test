import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs,promisify} from 'node:util';

const {positionals:[toolArg,goodArg,badArg,outArg,...extra],values:options}=parseArgs({allowPositionals:true,
  options:{legacy:{type:'boolean'},'tool-entry':{type:'string'}}});
assert(toolArg && goodArg && badArg && outArg && !extra.length,
  'Usage: node test-package-placement.mjs LOCKED_TOOL_PACKAGE GOOD_FLOOR_AIR BAD_INPUTS_DIR FRESH_OUT [--tool-entry PACKAGE_COMPANY_MJS] [--legacy]');

const [toolPackage,good,bad]=await Promise.all([toolArg,goodArg,badArg].map(folder=>fs.realpath(folder)));
const out=path.resolve(outArg), parent=path.dirname(out);
const inside=(root,file)=>{
  const relative=path.relative(root,file);
  return !path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep);
};
const exists=async file=>fs.lstat(file).then(()=>true,error=>{
  if(error.code==='ENOENT') return false;
  throw error;
});
assert(parent!==out && path.relative(parent,await fs.realpath(parent))==='','Use an existing real output parent.');
assert(!(await exists(out)),'FRESH_OUT already exists.');
for(const input of [toolPackage,good,bad])
  assert(!inside(input,out) && !inside(out,input),'Keep test output outside all inputs.');
for(let dir=path.dirname(fileURLToPath(import.meta.url));dir!==path.dirname(dir);dir=path.dirname(dir)) {
  if(!(await exists(path.join(dir,'scripts/company-platform/local-workspace.ps1')))) continue;
  const allowed=['output','company-workspace/production-trials'].map(folder=>path.join(dir,folder));
  assert(allowed.some(root=>out!==root && inside(root,out)),'Use this project’s output or production-trials directory.');
  break;
}

const source=path.join(toolPackage,'source'), prototype=path.join(source,'prototype');
const tools=path.join(source,'scripts','company-platform');
const packEntry=options['tool-entry']?await fs.realpath(options['tool-entry']):path.join(tools,'package-company.mjs');
const home='air-home', rental='air-rental', room=rental+'/ground/live', device=room+'/air';
const portal=rental+'/ground/portal-stream-living';
const originalSha='a855f730e8d9ccc6a51b687d43e7333240b2406d681d7df1f5f7761383849375';
const manifestFile='transfer-manifest.json', named=(root,key,...files)=>path.join(root,'data','rooms',key,...files);
const cases=[
  {name:'inside-door',code:'blocked-portal',path:portal,at:[1.89,0,.08],
    sha256:'2e5c46f61eeb0e0837acd38f38b6cb2c9f0539877017f2a110f05c004abe565d'},
  {name:'hover',code:'unsupported-height',path:device,at:[1.5,.035,-1.45],
    sha256:'b57419180478d590f6fcce129fd9382ea0b5f06975b9a0b00dafc42e7f433cdf'},
  {name:'chair-overlap',code:'overlapping-facilities',path:room+'/station-1/chair',at:[-.75,0,.05],
    sha256:'e1f3c03f222d95f33174f83b1306fdad9f18ad7f16b35567cabfa530e642611b'},
];
const bytes=file=>fs.readFile(file);
const json=async file=>JSON.parse(await bytes(file));
const pin=async file=>createHash('sha256').update(await bytes(file)).digest('hex');
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const load=file=>import(pathToFileURL(file).href);
const run=promisify(execFile);
const report={status:'running',mode:options.legacy?'legacy':'fixed',toolPackage,good,bad,commands:[],cases:{}};

async function invoke(label,entry,args,{exit=0,stream='stdout',cwd=toolPackage}={}) {
  const record={label,entry,args,cwd};
  report.commands.push(record);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(process.execPath,[entry,...args],{cwd,windowsHide:true,timeout:240_000,maxBuffer:4*1024*1024}));
    record.exit=0;
  } catch(error) {
    ({stdout,stderr}=error);
    record.exit=error.code;
  }
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([name,value])=>
    fs.writeFile(path.join(out,label+'.'+name+'.log'),value??'',{flag:'wx'})));
  assert.equal(record.exit,exit,label+'\n'+(stderr||stdout||''));
  record.response=JSON.parse(stream==='stderr'?stderr:stdout);
  return record.response;
}

async function verify(root,digest,label) {
  const result=await invoke(label,path.join(root,'verify.mjs'),[root,digest],{cwd:root});
  assert.deepEqual([result.ok,result.manifestSha256,result.checkedFiles],[true,digest,result.declaredFiles]);
  return result;
}

async function verifyToolFiles(manifest) {
  for(let i=0;i<manifest.files.length;i+=16) await Promise.all(manifest.files.slice(i,i+16).map(async file=>{
    const resolved=path.join(toolPackage,file.path);
    assert((await fs.lstat(resolved)).isFile(),file.path);
    assert.equal(await pin(resolved),file.sha256,file.path);
  }));
  return manifest.files.length;
}

async function snapshot(root) {
  const children=await fs.readdir(root,{withFileTypes:true});
  const entries=[];
  for(const child of children.sort((a,b)=>a.name.localeCompare(b.name))) {
    const filename=path.join(root,child.name);
    if(child.isDirectory()) entries.push([child.name,await snapshot(filename)]);
    else entries.push([child.name,await pin(filename)]);
  }
  return entries;
}

function facility(document) {
  const found=document.nodes.find(node=>node.id===device);
  assert(found,device);
  return found;
}

function failure(actual,repro,roomKey) {
  assert.equal(actual.code,repro.code,actual.message);
  assert.equal(actual.path,repro.path,actual.message);
  const {roomKey:publishedKey,companyId,...details}=actual.details??{};
  if(roomKey!==undefined && (repro.code==='blocked-portal' || publishedKey!==undefined))
    assert.deepEqual([publishedKey,companyId],[roomKey,rental]);
  if(repro.code==='blocked-portal') assert.deepEqual(details,{regionId:room,side:'from',obstacleId:device});
  if(repro.code==='overlapping-facilities') assert.equal(details.otherId,device);
  return {code:actual.code,path:actual.path,details};
}

async function missingOutput(target) {
  const filename=path.basename(target);
  assert(!(await fs.readdir(path.dirname(target))).some(child=>child===filename || child.startsWith('.'+filename+'.')),
    `Rejected command left a result, stage or lock for ${filename}`);
}

async function placementReceipt(output,prefix,release,expected,catalog,templates,native) {
  const saveFile=path.join(output,prefix,'save.json'), receiptFile=path.join(output,prefix,'placement.json');
  const [{document},record,saveSha256,placementSha256]=await Promise.all([json(saveFile),json(receiptFile),pin(saveFile),pin(receiptFile)]);
  assert.deepEqual(document,expected,prefix);
  const roomKey=prefix==='data'?'@default':prefix.split('/').at(-1);
  assert.deepEqual([record.schema,record.version,record.roomKey,record.companyId,record.revision,record.saveSha256],
    ['company-room-placement',1,roomKey,document.id,document.revision,saveSha256],prefix);
  assert.deepEqual(release.placementReports.filter(item=>item.key===roomKey),
    [{key:roomKey,path:prefix+'/placement.json',companyId:document.id,saveSha256}],prefix);
  for(const [filename,hash] of [['save.json',saveSha256],['placement.json',placementSha256]]) {
    const hits=release.files.filter(item=>item.path===prefix+'/'+filename);
    assert.equal(hits.length,1);
    assert.equal(hits[0].sha256,hash);
  }
  const diskShape=value=>JSON.parse(JSON.stringify(value));
  assert.deepEqual(record.connections,diskShape(native.inspectCompanyConnections(document,catalog,templates)),prefix);
  assert.deepEqual(record.placement,diskShape(native.inspectCompanyPlacement(document,catalog,templates)),prefix);
  if(document.id===rental) {
    const crossing=record.placement.checkedPortals.filter(item=>item.connectionId===portal);
    assert.deepEqual(crossing.map(item=>item.side).sort(),['from','to']);
    assert(crossing.every(item=>item.connected && item.width===1.4));
  }
  return {companyId:record.companyId,saveSha256,placementSha256,portals:record.placement.checkedPortals.length,
    usePoints:record.placement.checkedPoints.length};
}

async function main() {
  report.original=await verify(good,originalSha,'verify-sealed-floor-air');
  const toolManifest=await json(path.join(toolPackage,manifestFile)), toolPin=await pin(path.join(toolPackage,manifestFile));
  if(options.legacy) assert.equal(toolPin,originalSha,'Legacy replay requires the exact released tool package.');
  const toolEntrySha256=await pin(packEntry);
  report.tools={build:toolManifest.buildId,manifestSha256:toolPin,packEntrySha256:toolEntrySha256,
    pinnedFiles:await verifyToolFiles(toolManifest)};
  const lock=await json(path.join(prototype,'package-lock.json'));
  for(const name of ['three','pngjs','jpeg-js']) assert.equal((await json(path.join(prototype,'node_modules',name,'package.json'))).version,
    lock.packages['node_modules/'+name].version,`Install locked ${name} in the tool copy.`);

  const homeFile=named(good,home,'save.json'), rentalFile=named(good,rental,'save.json');
  const {document:goodHome}=await json(homeFile), goodRentalEnvelope=await json(rentalFile);
  const goodRental=goodRentalEnvelope.document;
  const fixtureRoot=path.join(out,'inputs');
  await fs.mkdir(fixtureRoot);
  const sourcePins=new Map();
  for(const repro of cases) {
    const originals=Object.fromEntries(['save','batch','operations'].map(name=>[name,path.join(bad,repro.name,name+'.json')]));
    for(const filename of Object.values(originals)) sourcePins.set(filename,await pin(filename));
    assert.equal(sourcePins.get(originals.save),repro.sha256,'Use the original independent fusion bad save.');
    const [save,batch,ops]=await Promise.all(Object.values(originals).map(json));
    const move={type:'move',id:device,transform:{position:repro.at,yaw:facility(goodRental).transform.yaw}};
    assert.deepEqual(ops,[move]);
    const manual=structuredClone(goodRentalEnvelope);
    manual.document.revision++;
    facility(manual.document).transform=move.transform;
    assert.deepEqual(save,manual,'Only the device transform and revision may differ.');
    assert.deepEqual(batch.items.find(item=>item.key===rental),{key:rental,document:goodRental,operations:ops});
    repro.inputs=originals;
  }
  const batch=(label,input,dest,exit=0,only=undefined)=>invoke(label,path.join(tools,'batch.mjs'),
    [input,dest,...(only?['--only',only]:[])],{exit});
  const edit=(label,args,exit=0)=>invoke(label,path.join(toolPackage,'edit.mjs'),args,{exit,stream:exit?'stderr':'stdout'});
  const pack=(label,input,dest,rooms=[],exit=0)=>invoke(label,packEntry,
    [path.join(toolPackage,'viewer'),toolManifest.buildId,input,dest,'--source',source,...rooms.flatMap(([key,file])=>['--room',key,file])],
    {exit,stream:exit?'stderr':'stdout'});

  const batchRoot=path.join(out,'retained-batch'), baseInput=path.join(fixtureRoot,'two-good-rooms.json');
  await write(baseInput,{schema:'company-batch',version:1,items:[{key:home,document:goodHome},{key:rental,document:goodRental}]});
  assert.deepEqual((await batch('prepare-retained-batch',baseInput,batchRoot)).results.map(item=>item.status),['created','created']);
  const retainedBatch=await snapshot(batchRoot);
  const successTarget=path.join(out,'retry-package');

  for(const repro of cases) {
    const {name,inputs}=repro;
    const badBatch=await batch('batch-'+name,inputs.batch,batchRoot,1,rental);
    assert.equal(badBatch.ok,false);
    assert.equal(badBatch.results.length,1);
    assert.equal(badBatch.results[0].status,'failed');
    const editTarget=path.join(out,'rejected-edit-'+name);
    const badEdit=await edit('edit-'+name,['apply',rentalFile,inputs.operations,editTarget,'--room',rental],1);
    assert.equal(badEdit.ok,false);
    await missingOutput(editTarget);
    const byBatch=failure(badBatch.results[0],repro), byEdit=failure(badEdit,repro);
    assert.deepEqual(byEdit,byBatch);
    assert.deepEqual(await snapshot(batchRoot),retainedBatch,'A bad batch changed previously published output.');
    report.cases[name]={byBatch,byEdit};

    const isLegacyDoor=options.legacy && name==='inside-door';
    const defaultTarget=!options.legacy && name==='inside-door'?successTarget:path.join(out,'package-'+name);
    const badPackage=await pack('package-default-'+name,inputs.save,defaultTarget,[],isLegacyDoor?0:1);
    if(isLegacyDoor) {
      assert.equal(badPackage.ok,true);
      assert.deepEqual(await json(path.join(defaultTarget,'data','save.json')),await json(inputs.save));
      report.cases[name].byPackage=await verify(defaultTarget,await pin(path.join(defaultTarget,manifestFile)),'verify-legacy-open-default');
    } else {
      assert.equal(badPackage.ok,false);
      const byPackage=failure(badPackage,repro,options.legacy?undefined:'@default');
      assert.deepEqual(byPackage,byBatch);
      await missingOutput(defaultTarget);
      report.cases[name].byPackage=byPackage;
      report.cases[name].packageDiagnostic=badPackage;
    }
  }

  const door=cases[0];
  const namedTarget=path.join(out,'named-door-package');
  const badNamed=await pack('package-good-default-bad-named',homeFile,namedTarget,[[home,homeFile],[rental,door.inputs.save]],options.legacy?0:1);
  if(options.legacy) {
    assert.equal(badNamed.ok,true);
    assert.deepEqual(await json(named(namedTarget,rental,'save.json')),await json(door.inputs.save));
    report.cases[door.name].byNamedPackage=await verify(namedTarget,await pin(path.join(namedTarget,manifestFile)),'verify-legacy-open-named');
  } else {
    assert.equal(badNamed.ok,false);
    report.cases[door.name].byNamedPackage=failure(badNamed,door,rental);
    report.cases[door.name].namedPackageDiagnostic=badNamed;
    assert.deepEqual(report.cases[door.name].byNamedPackage,report.cases[door.name].byBatch);
    await missingOutput(namedTarget);

    const move={type:'move',id:device,transform:{position:[1.41,0,-1.345],yaw:0}};
    const moveFile=path.join(fixtureRoot,'legal-move-and-turn.json'), editTarget=path.join(out,'rental-edited');
    await write(moveFile,[move]);
    assert.equal((await edit('edit-legal-move-and-turn',['apply',rentalFile,moveFile,editTarget,'--room',rental])).ok,true);
    const movedSave=path.join(editTarget,'save.json'), expected=structuredClone(goodRental);
    expected.revision++;
    facility(expected).transform=move.transform;
    const movedEnvelope=await json(movedSave);
    assert.deepEqual(movedEnvelope.document,expected);
    const packed=await pack('retry-with-good-default-and-two-named-rooms',homeFile,successTarget,
      [[home,named(good,home,'batch-result')],[rental,movedSave]]);
    assert.deepEqual([packed.ok,packed.rooms],[true,[home,rental]]);
    const releasePath=path.join(successTarget,manifestFile), release=await json(releasePath), releasePin=await pin(releasePath);
    report.goodPackage=await verify(successTarget,releasePin,'verify-good-package');
    const [space,placement,catalog,templates]=await Promise.all([
      load(path.join(prototype,'src','company','space.js')),load(path.join(prototype,'src','company','placement.js')),
      json(path.join(prototype,toolManifest.runtimeInputs.catalog)),json(path.join(prototype,toolManifest.runtimeInputs.templates)),
    ]);
    const placements=[['data',goodHome],['data/rooms/'+home,goodHome],['data/rooms/'+rental,expected]];
    assert.equal(release.placementReports.length,placements.length);
    report.placements={};
    for(const [prefix,document] of placements) report.placements[prefix]=await placementReceipt(successTarget,prefix,release,document,
      catalog,templates,{...space,...placement});
    assert.deepEqual(await json(named(successTarget,rental,'save.json')),movedEnvelope,'Packing must preserve the moved save and dependencies.');
    for(const [prefix,original] of [['data',homeFile],[`data/rooms/${home}`,homeFile]])
      assert.equal(await pin(path.join(successTarget,prefix,'save.json')),await pin(original));

    const guard=await pack('reject-overwrite-of-good-package',door.inputs.save,successTarget,[],1);
    assert.equal(guard.code,'package-output-exists',guard.message);
    report.existingOutputGuard=await verify(successTarget,releasePin,'verify-good-package-after-overwrite-attempt');
  }

  const retried=await batch('retry-unchanged-stock-batch',baseInput,batchRoot);
  assert.deepEqual(retried.results.map(item=>item.status),['idempotent','idempotent']);
  assert.deepEqual(await snapshot(batchRoot),retainedBatch);
  for(const [filename,hash] of sourcePins) assert.equal(await pin(filename),hash,filename);
  assert.equal(await pin(packEntry),toolEntrySha256);
  assert.equal(await pin(path.join(toolPackage,manifestFile)),toolPin);
  report.tools.retained=await verifyToolFiles(toolManifest);
  report.originalRetained=await verify(good,originalSha,'verify-sealed-floor-air-after-test');
  report.status='passed';
}

await fs.mkdir(out);
try {
  await main();
  console.log(JSON.stringify({status:report.status,mode:report.mode,report:path.join(out,'report.json')},null,2));
} catch(error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
