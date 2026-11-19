import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const [sealedArg,workArg,outArg,mode,...extra] = process.argv.slice(2);
if (!sealedArg || !workArg || !outArg || extra.length || (mode!==undefined && mode!=='--legacy'))
  throw Error('Usage: node test-singing-score-ingress.mjs SEALED_PACKAGE WORKING_COPY NEW_OUTPUT_DIRECTORY [--legacy]');
const legacy = mode==='--legacy';
const [sealed,work] = await Promise.all([fs.realpath(sealedArg),fs.realpath(workArg)]);
const requested = path.resolve(outArg);
const out = path.join(await fs.realpath(path.dirname(requested)),path.basename(requested));
const contains = (parent,child) => {
  const relative = path.relative(parent,child);
  return !relative || (!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep));
};
assert(!contains(sealed,work) && !contains(work,sealed),'Use an independent working copy with installed dependencies.');
assert(!contains(sealed,out) && !contains(work,out),'Output must be separate from the original and working packages.');

const studio = 'singing-studio', workshop = studio+'/ground/live';
const edge = {type:'add-facility',id:workshop+'/edge-sight-panel',parentId:workshop,
  resource:{id:'background-brand-panel',version:1},transform:{position:[1.62,0,.15],yaw:0}};
const edgeOpSha = '3b005d95fcbfec8b39cbb5847c8f5fd52b4567877ad2373bf1f0c3c36ac2fb1f';
const originalEdgeSaveSha = '2fcbf862059c5df0928381e21a5733efac1d0942d4ec56a452400e55e0438783';
const removed = {type:'remove',id:edge.id};
const moved = {type:'move',id:edge.id,transform:{position:[2.76,0,-.4],yaw:Math.PI/2}};
const failure = {code:'singing-score-occluded',path:edge.id};
const manifestFile = 'transfer-manifest.json';
const stdoutRun = promisify(execFile);
const read = async file => JSON.parse(await fs.readFile(file,'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = async file => sha(await fs.readFile(file));
const write = (file,value) => fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const named = (root,key,...extraPath) => path.join(root,'data','rooms',key,...extraPath);
const report = {status:'running',mode:legacy?'legacy':'fixed',sealed,work,commands:[]};

async function invoke(label,cwd,entry,args,expectedExit=0) {
  const record = {label,entry,args};
  report.commands.push(record);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await stdoutRun(process.execPath,[entry,...args],{cwd,windowsHide:true,timeout:180_000,maxBuffer:2*1024*1024}));
    record.exit=0;
  } catch (error) {
    ({stdout,stderr}=error);
    record.exit=error.code;
    if (error.signal) record.signal=error.signal;
  }
  if (stdout?.trim()) record.stdout=JSON.parse(stdout);
  if (stderr?.trim()) record.stderr=JSON.parse(stderr);
  assert.equal(record.exit,expectedExit,label+'\n'+(stderr||stdout||''));
  return record.stdout??record.stderr;
}

async function verify(root,pin) {
  const checked = await invoke('verify package '+path.basename(root),root,'verify.mjs',[root,pin]);
  assert.equal(checked.ok,true);
  assert.equal(checked.checkedFiles,checked.declaredFiles);
  return checked;
}

async function pinnedCopy(manifest) {
  // The viewer is read directly from the sealed package. The editable copy can omit it.
  const pins=manifest.files.filter(file=>file.path==='edit.mjs'||file.path.startsWith('source/')||file.path.startsWith('data/'));
  for (let i=0;i<pins.length;i+=16) await Promise.all(pins.slice(i,i+16).map(async pin=>{
    const file=path.join(work,pin.path);
    assert((await fs.lstat(file)).isFile(),'Expected regular working file '+pin.path);
    assert.equal(await shaFile(file),pin.sha256,'Working file differs from the supplied package '+pin.path);
  }));
  return pins.length;
}

async function unchangedTree(root,action) {
  const before=(await fs.readdir(root)).sort();
  const result=await action();
  assert.deepEqual((await fs.readdir(root)).sort(),before,'Failed publication left a staging file or result directory.');
  return result;
}

function assertFailure(response,location=failure.path) {
  assert.equal(response.ok,false);
  assert.equal(response.code,failure.code,response.message);
  assert.equal(response.path,location,response.message);
  assert.equal(response.details?.side,'right','The production diagnostic must identify the affected page side.');
  assert.equal(response.details?.page,2);
  assert.equal(response.details?.firstHit?.id,location);
}

async function main() {
  const manifestBytes=await fs.readFile(path.join(sealed,manifestFile)), pin=sha(manifestBytes);
  assert.deepEqual(await fs.readFile(path.join(work,manifestFile)),manifestBytes,'The working copy must be the same transfer package.');
  const manifest=JSON.parse(manifestBytes);
  report.original=await verify(sealed,pin);
  report.pinnedWorkingFiles=await pinnedCopy(manifest);
  const source=path.join(work,'source'), tools=path.join(source,'scripts','company-platform');
  const prototype=path.join(source,'prototype'), lock=await read(path.join(prototype,'package-lock.json'));
  for (const name of ['three','pngjs','jpeg-js']) {
    const installed=await read(path.join(prototype,'node_modules',name,'package.json'));
    assert.equal(installed.version,lock.packages['node_modules/'+name].version,'The working copy needs the package-locked dependencies.');
  }

  const keys=manifest.files.map(file=>/^data\/rooms\/([^/]+)\/save\.json$/.exec(file.path)?.[1]).filter(Boolean);
  assert(keys.includes(studio) && [2,5].includes(keys.length),'Use the named two-room singing package or the named five-room theme package.');
  report.rooms=keys;
  const originalDefault=path.join(work,'data','save.json'), originalStudio=named(work,studio,'save.json');
  const items=await Promise.all(keys.map(key=>read(named(work,key,'batch-result','input.json'))));
  const studioItem=items.find(item=>item.key===studio);
  assert(studioItem,'The fixed package must ship its actual studio batch input.');
  const original=await read(originalStudio);
  const originalDocument=original.document;
  const validate = async (label,input,expectedDocument) => {
    const response=await invoke(label,work,'edit.mjs',['validate',input]);
    assert.equal(response.ok,true);
    assert.equal(response.id,expectedDocument.id);
    assert.equal(response.revision,expectedDocument.revision);
  };
  const batch = (label,filename,target,only=undefined,code=0)=>invoke(label,work,path.join(tools,'batch.mjs'),
    [filename,target,...(only ? ['--only',only] : [])],code);
  const publish = (label,defaultInput,roomInputs,target,code=0)=>invoke(label,work,path.join(tools,'package-company.mjs'),
    [path.join(sealed,'viewer'),manifest.buildId,defaultInput,target,'--source',source,
      ...roomInputs.flatMap(({key,save})=>['--room',key,save])],code);
  const normalRooms=keys.map(key=>({key,save:named(work,key,'save.json')}));
  const studioChanged = save=>normalRooms.map(room=>room.key===studio ? {...room,save} : room);

  const operationText=JSON.stringify([edge],null,2), operations=path.join(out,'original-edge.ops.json');
  assert.equal(sha(operationText),edgeOpSha);
  await fs.writeFile(operations,operationText,{flag:'wx'});
  report.originalOperationSha256=edgeOpSha;
  const {type,...nodeFields}=edge;
  assert.equal(type,'add-facility');
  const detached=structuredClone(original);
  assert(detached.dependencies.resources.some(ref=>ref.id===edge.resource.id && ref.version===edge.resource.version),
    'The original studio already pins the installed background asset.');
  detached.document.nodes.push({...nodeFields,kind:'facility',state:{}});
  detached.document.revision++;
  const badSave=path.join(out,'detached-edge.save.json');
  await write(badSave,canonical(detached));
  report.detachedEdgeSaveSha256=await shaFile(badSave);
  assert.equal(report.detachedEdgeSaveSha256,originalEdgeSaveSha,'This is the same admitted save used by the independent report.');

  const withStudio = addition => ({schema:'company-batch',version:1,items:items.map(item=>item===studioItem ?
    {...studioItem,operations:[...(studioItem.operations??[]),...addition]} : item)});
  const baseline=path.join(out,'baseline-batch.json'), edgeBatch=path.join(out,'original-edge.batch.json');
  await write(baseline,withStudio([]));
  await write(edgeBatch,withStudio([edge]));
  const baselineOutput=path.join(out,'baseline-batch');
  assert((await batch('generate all conforming rooms through batch.mjs',baseline,baselineOutput)).ok);
  for (const {key,save} of normalRooms) {
    const {document}=await read(save), regenerated=await read(path.join(baselineOutput,key,'save.json'));
    assert.deepEqual(regenerated.document,document,key+' batch did not reproduce the saved room.');
    await validate(key+' / validate original room',save,document);
  }
  const batchFiles=keys.flatMap(key=>['input.json','layout.json','save.json','report.json'].map(name=>path.join(baselineOutput,key,name)));
  const originalBatchHashes=await Promise.all(batchFiles.map(shaFile));
  const snapshot = async target=>({receipt:await verify(target,await shaFile(path.join(target,manifestFile))),
    file:path.join(target,manifestFile)});

  if (legacy) {
    const legacyBatch=path.join(out,'legacy-admitted-batch'), legacyEdit=path.join(out,'legacy-admitted-edit');
    const legacyPackage=path.join(out,'legacy-admitted-package');
    assert((await batch('legacy batch admits the edge obstruction',edgeBatch,legacyBatch,studio)).ok);
    assert((await invoke('legacy edit admits the edge obstruction',work,'edit.mjs',['apply',originalStudio,operations,legacyEdit])).ok);
    const adopted=await publish('legacy packager admits the edge obstruction with the actual room set',originalDefault,studioChanged(badSave),legacyPackage);
    assert.deepEqual(adopted.rooms,keys);
    report.output=await snapshot(legacyPackage);
    const regenerated=await read(path.join(legacyBatch,studio,'save.json'));
    assert.deepEqual(regenerated,{...detached,document:{...detached.document,revision:originalDocument.revision}},
      'Legacy batch creates the same obstructed room in its initial revision.');
    for (const file of [path.join(legacyEdit,'save.json'),named(legacyPackage,studio,'save.json')])
      assert.deepEqual(await read(file),detached,'Legacy command did not create the original obstructed document.');
  } else {
    const rejectedBatch = await unchangedTree(baselineOutput,()=>batch('reject edge obstruction in an existing batch output',edgeBatch,baselineOutput,studio,1));
    assert.equal(rejectedBatch.ok,false);
    const [blocked]=rejectedBatch.results;
    assert.equal(blocked.key,studio);
    assertFailure({...blocked,ok:false});
    assert.equal(blocked.status,'failed');
    const editTarget=path.join(out,'after-bad-edit');
    const rejectedEdit=await unchangedTree(out,()=>invoke('reject edge obstruction in ordinary edit',work,'edit.mjs',
      ['apply',originalStudio,operations,editTarget],1));
    assertFailure(rejectedEdit);
    assertFailure(await invoke('reject the detached admitted historical save',work,'edit.mjs',['validate',badSave],1));

    const repairs = [];
    for (const [tag,operation] of [['removed',removed],['moved',moved]]) {
      const action=path.join(out,tag+'.ops.json'), input=path.join(out,tag+'.batch.json');
      const editOutput=path.join(out,tag+'-edit'), batchOutput=path.join(out,tag+'-batch');
      await write(action,[operation]);
      await write(input,withStudio([edge,operation]));
      const output=path.join(editOutput,'save.json');
      const edited=await invoke('recover by '+tag+' through edit.mjs',work,'edit.mjs',['apply',badSave,action,editOutput]);
      assert.equal(edited.ok,true);
      const expected=structuredClone(detached.document);
      expected.revision++;
      if (tag==='removed') expected.nodes=expected.nodes.filter(node=>node.id!==edge.id);
      else expected.nodes.find(node=>node.id===edge.id).transform=operation.transform;
      assert.deepEqual((await read(output)).document,expected);
      await validate('cold validate the '+tag+' save',output,expected);
      assert((await batch('recover by '+tag+' through batch.mjs',input,batchOutput,studio)).ok);
      const generated=(await read(path.join(batchOutput,studio,'save.json'))).document;
      assert.deepEqual(generated,{...expected,revision:originalDocument.revision});
      repairs.push({tag,save:output,document:expected,sha256:await shaFile(output)});
    }

    const [deletedRoom,shiftedRoom]=repairs;
    const derivative=path.join(out,'repaired-package'), movedKey=studio+'-score-repositioned';
    const roomInputs=[...studioChanged(deletedRoom.save),{key:movedKey,save:shiftedRoom.save}];
    const accepted=await publish('publish both verified repairs as named rooms',originalDefault,roomInputs,derivative);
    assert.deepEqual(accepted.rooms,roomInputs.map(room=>room.key));
    report.output=await snapshot(derivative);
    for (const [key,repair] of [[studio,deletedRoom],[movedKey,shiftedRoom]]) {
      const save=named(derivative,key,'save.json');
      assert.deepEqual((await read(save)).document,repair.document);
      await validate('cold validate the packaged '+repair.tag+' repair',save,repair.document);
    }
    for (const {key,save} of normalRooms.filter(room=>room.key!==studio))
      assert.equal(await shaFile(named(derivative,key,'save.json')),await shaFile(save),'Repack modified unaffected '+key);
    assert.equal(await shaFile(path.join(derivative,'data','save.json')),await shaFile(originalDefault),'Repack modified the original default.');
    for (const [label,base,files] of [
      ['default scene',badSave,normalRooms],
      ['named studio scene',originalDefault,studioChanged(badSave)],
    ]) {
      const rejected=await unchangedTree(out,()=>publish('reject edge obstruction in package '+label,base,files,path.join(out,'rejected-'+label.replaceAll(' ','-')),1));
      assertFailure(rejected);
    }
    await verify(derivative,report.output.receipt.manifestSha256);
    assert.deepEqual(await Promise.all(repairs.map(repair=>shaFile(repair.save))),repairs.map(repair=>repair.sha256));
    report.repairs=repairs.map(({tag,save,sha256})=>({tag,save,sha256}));
  }

  const rerun=await batch('retry the unmodified original batch',baseline,baselineOutput);
  assert(rerun.ok && rerun.results.every(item=>item.status==='idempotent'));
  assert.deepEqual(await Promise.all(batchFiles.map(shaFile)),originalBatchHashes);
  assert.equal(await shaFile(badSave),report.detachedEdgeSaveSha256);
  assert.equal(await shaFile(path.join(work,manifestFile)),pin);
  report.workingFilesPreserved=await pinnedCopy(manifest);
  report.originalPreserved=await verify(sealed,pin);
  report.status='passed';
}

await fs.mkdir(out);
try {
  await main();
  console.log(JSON.stringify({status:report.status,mode:report.mode,rooms:report.rooms,report:path.join(out,'report.json')},null,2));
} catch (error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
