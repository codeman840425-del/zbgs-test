import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const [packageArg, workArg, depsArg, mode, blockedArg, ...extra] = process.argv.slice(2);
if (!packageArg || !workArg || !depsArg || !['legacy','fixed'].includes(mode) || (mode === 'fixed') !== Boolean(blockedArg) || extra.length)
  throw new Error('Usage: node qa-interview-corridor-cli.mjs PACKAGE NEW_WORK_DIR PROTOTYPE_WITH_DEPENDENCIES legacy|fixed [LEGACY_BLOCKED_SAVE]');

const delivery = await fs.realpath(packageArg), work = path.resolve(workArg), dependencyRoot = await fs.realpath(depsArg);
const inside = (parent, child) => { const relative = path.relative(parent,child); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
assert(!inside(delivery,work) && !inside(dependencyRoot,work),'Use a new directory outside the sealed package and dependency source');
const runFile = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(file);
const json = async file => JSON.parse(await read(file));
const digest = async file => hash(await read(file));
const resultFiles = ['input.json','layout.json','save.json','report.json'];
const tools = 'scripts/company-platform';
const studio = 'interview-studio', hotel = 'interview-hotel';
const rulePortal = `${hotel}/guest-floor/portal-interview-suite`;
const blockedCode = 'room-door-unreachable';
const fixturePin = 'f9d5c370d2b487b36a138a9cbfaf372dd406523bdd6ab574b4211a667dff50ff';
const privatePackage = path.join(work,'working-copy');
const source = path.join(privatePackage,'source');
const editor = path.join(privatePackage,'edit.mjs');
const batchTool = path.join(source,tools,'batch.mjs');
const packTool = path.join(source,tools,'package-company.mjs');
const report = {status:'running',mode,commands:[],checks:{}};

await fs.mkdir(work);
const logs = path.join(work,'logs');
const inputs = path.join(work,'inputs');
await Promise.all([logs,inputs,privatePackage].map(name => fs.mkdir(name)));

async function logCommand(name, ...args) {
  const start = Date.now();
  let result;
  try {
    const {stdout,stderr} = await runFile(process.execPath,args,{cwd:work,windowsHide:true,maxBuffer:12*1024*1024});
    result = {exit:0,stdout,stderr};
  } catch (error) { result = {exit:error.code,stdout:error.stdout || '',stderr:error.stderr || error.message}; }
  const files = {stdout:`logs/${name}.stdout.json`,stderr:`logs/${name}.stderr.json`};
  const record = {name,args,exit:result.exit,milliseconds:Date.now()-start,...files};
  report.commands.push(record);
  await Promise.all(Object.entries(files).map(([stream, file]) => fs.writeFile(path.join(work,file),result[stream],{flag:'wx'})));
  const raw = (result.stdout.trim() || result.stderr.trim());
  assert(raw,`${name}: Expected a public JSON receipt`);
  record.receipt = JSON.parse(raw);
  return record;
}

function success(record) {
  assert.equal(record.exit,0,record.name + ': ' + JSON.stringify(record.receipt));
  assert.equal(record.receipt.ok,true,record.name);
  return record.receipt;
}

function rejection(record, panel) {
  assert.equal(record.exit,1,record.name + ': ' + JSON.stringify(record.receipt));
  assert.equal(record.receipt.ok,false,record.name);
  const denied = record.receipt.results ? record.receipt.results[0] : record.receipt;
  if (record.receipt.results) {
    assert.equal(record.receipt.results.length,1);
    assert.equal(denied.key,hotel);
    assert.equal(denied.status,'failed');
  }
  assert.equal(denied.code,blockedCode,record.name + ': ' + JSON.stringify(denied));
  assert.equal(denied.path,rulePortal,record.name);
  if (denied.details?.thresholdBlockers) assert(denied.details.thresholdBlockers.includes(panel),record.name);
  return denied;
}

async function absent(file) {
  await assert.rejects(fs.lstat(file),{code:'ENOENT'},file);
}

async function hashes(directory, names) {
  return Object.fromEntries(await Promise.all(names.map(async name => [name,await digest(path.join(directory,name))])));
}

async function sealed(name, packageRoot, pin) {
  const verified = success(await logCommand(name,path.join(packageRoot,'verify.mjs'),packageRoot,pin));
  assert.equal(verified.manifestSha256,pin);
  assert.equal(verified.checkedFiles,verified.declaredFiles);
  for (const field of ['extraFiles','changedFiles','missingFiles']) assert.equal(verified[field],0);
  return verified;
}

async function exercise() {
  const manifestFilename = path.join(delivery,'transfer-manifest.json');
  const manifest = await json(manifestFilename), manifestSha256 = await digest(manifestFilename);
  report.package = {path:delivery,build:manifest.buildId,manifestSha256};
  report.checks.originalBefore = await sealed('original-before',delivery,manifestSha256);
  try {
    const shippedLock = path.join(delivery,'source/prototype/package-lock.json');
    assert.equal(await digest(path.join(dependencyRoot,'package-lock.json')),await digest(shippedLock),'Use the exact package lock to stage dependencies');
    const lock = await json(shippedLock);
    const installed = path.join(dependencyRoot,'node_modules');
    const threePackage = await json(path.join(installed,'three/package.json'));
    assert.equal(threePackage.version,lock.packages['node_modules/three'].version);
    report.dependencies = {prototype:dependencyRoot,lockSha256:await digest(shippedLock),three:threePackage.version};
    await Promise.all(['source','data','edit.mjs','transfer-manifest.json'].map(name =>
      fs.cp(path.join(delivery,name),path.join(privatePackage,name),{recursive:true,errorOnExist:true,force:false})));
    await fs.symlink(installed,path.join(source,'prototype/node_modules'),process.platform === 'win32' ? 'junction' : 'dir');

    const fixture = await read(new URL('./corridor-blocker.json',import.meta.url));
    assert.equal(hash(fixture),fixturePin,'Use the complete original fusion-group fixture bytes');
    const [operation] = JSON.parse(fixture);
    assert.equal(operation.resource.id,'background-grid-panel');
    assert.equal(operation.parentId,`${hotel}/guest-floor/corridor-2`);
    assert.deepEqual(operation.transform,{position:[-3,0,-1.3],yaw:0});
    const add = path.join(inputs,'corridor-blocker.json'), remove = path.join(inputs,'remove-one-panel.json');
    await fs.writeFile(add,fixture,{flag:'wx'});
    await fs.writeFile(remove,JSON.stringify([{type:'remove',id:operation.id}],null,2)+'\n',{flag:'wx'});
    report.fixture = {sha256:fixturePin,operation};

    const batchSeed = path.join(source,tools,'batch-inputs/interview-rooms.json');
    const combined = await json(batchSeed);
    combined.items.find(entry => entry.key === hotel).operations.push(operation);
    const badBatch = path.join(inputs,'obstructed-batch.json');
    await fs.writeFile(badBatch,JSON.stringify(combined,null,2)+'\n',{flag:'wx'});
    const baseBatch = path.join(work,'batch-good');
    const baseline = success(await logCommand('batch-positive',batchTool,batchSeed,baseBatch));
    assert.deepEqual(new Set(baseline.results.map(r => r.key)),new Set([studio,hotel]));
    assert(baseline.results.every(r => r.status === 'created'));
    const studioPins = await hashes(path.join(baseBatch,studio),resultFiles);
    const hotelPins = await hashes(path.join(baseBatch,hotel),resultFiles);
    const hotelSave = path.join(privatePackage,'data/rooms',hotel,'save.json');
    const studioSave = path.join(privatePackage,'data/rooms',studio,'save.json');
    const hotelSavePin = await digest(hotelSave), studioSavePin = await digest(studioSave);
    for (const [key,save] of [[studio,studioSave],[hotel,hotelSave]]) {
      assert((await read(path.join(baseBatch,key,'save.json'))).equals(await read(save)));
      success(await logCommand('validate-original-' + key,editor,'validate',save));
    }
    report.checks.validSeeds = {studio:studioPins,hotel:hotelPins};

    const pack = (name, primary, target, extraKey, extraFile) => logCommand(name,packTool,path.join(delivery,'viewer'),manifest.buildId,
      primary,target,'--source',source,...(extraKey ? ['--room',extraKey,extraFile] : []));
    const fresh = path.join(work,'batch-obstructed');
    const attemptedEdit = path.join(work,'obstructed-edit');
    const attemptedAdditional = path.join(work,'obstructed-additional-package');
    if (mode === 'legacy') {
      success(await logCommand('legacy-batch-accepts-blocker',batchTool,badBatch,fresh,'--only',hotel));
      success(await logCommand('legacy-apply-accepts-blocker',editor,'apply',hotelSave,add,attemptedEdit));
      const produced = path.join(attemptedEdit,'save.json');
      const {document} = await json(produced), blocked = document.nodes.find(node => node.id === operation.id);
      assert.equal(blocked.parentId,operation.parentId);
      assert.deepEqual(blocked.transform,operation.transform);
      const {document:batchDocument} = await json(path.join(fresh,hotel,'save.json'));
      const {document:seed} = await json(hotelSave);
      assert.equal(document.revision,seed.revision+1);
      assert.equal(batchDocument.revision,seed.revision);
      assert.deepEqual(document.trainingBinding,seed.trainingBinding);
      assert(JSON.parse(batchDocument.trainingBinding.source.text).operations.some(node => node.id === operation.id));
      assert.deepEqual(batchDocument,{...document,revision:batchDocument.revision,trainingBinding:batchDocument.trainingBinding});
      success(await logCommand('legacy-validate-accepts-blocker',editor,'validate',produced));
      success(await pack('legacy-package-accepts-blocker-as-room',studioSave,attemptedAdditional,hotel,produced));
      const accepted = await digest(path.join(attemptedAdditional,'transfer-manifest.json'));
      report.checks.publishedBlocked = await sealed('legacy-verify-blocked-package',attemptedAdditional,accepted);
      const publishedSave = path.join(attemptedAdditional,'data/rooms',hotel,'save.json');
      assert.deepEqual(await json(publishedSave),await json(produced));
      success(await logCommand('legacy-validate-packaged-blocker',editor,'validate',publishedSave));
      report.checks.legacyBlockedSave = {path:produced,sha256:await digest(produced),publishedSha256:await digest(publishedSave),revision:document.revision};
    } else {
      const obstructedSave = await fs.realpath(blockedArg);
      const obstructedPin = await digest(obstructedSave), obstructed = (await json(obstructedSave)).document;
      const seed = (await json(hotelSave)).document;
      const realBlocker = obstructed.nodes.find(node => node.id === operation.id);
      assert.deepEqual(realBlocker.resource,operation.resource);
      assert.equal(realBlocker.parentId,operation.parentId);
      assert.deepEqual(realBlocker.transform,operation.transform);
      assert.deepEqual(obstructed.nodes.filter(node => node.id !== operation.id),seed.nodes);
      assert.deepEqual(obstructed.interviewRooms,seed.interviewRooms);
      report.checks.obstructedSource = {path:obstructedSave,sha256:obstructedPin,revision:obstructed.revision};
      rejection(await logCommand('batch-only-rejects-fresh',batchTool,badBatch,fresh,'--only',hotel),operation.id);
      await absent(path.join(fresh,hotel));
      rejection(await logCommand('batch-only-rejects-over-existing',batchTool,badBatch,baseBatch,'--only',hotel),operation.id);
      assert.deepEqual(await hashes(path.join(baseBatch,studio),resultFiles),studioPins);
      assert.deepEqual(await hashes(path.join(baseBatch,hotel),resultFiles),hotelPins);
      rejection(await logCommand('edit-apply-rejects-blocker',editor,'apply',hotelSave,add,attemptedEdit),operation.id);
      await absent(attemptedEdit);
      rejection(await logCommand('edit-validate-rejects-obstructed-save',editor,'validate',obstructedSave),operation.id);
      const attemptedPrimary = path.join(work,'obstructed-default-package');
      rejection(await pack('package-rejects-obstructed-default',obstructedSave,attemptedPrimary),operation.id);
      rejection(await pack('package-rejects-obstructed-additional',studioSave,attemptedAdditional,hotel,obstructedSave),operation.id);
      await absent(attemptedPrimary);
      await absent(attemptedAdditional);
      assert.equal(await digest(obstructedSave),obstructedPin);
      report.checks.failurePreservedOld = true;

      const repaired = path.join(work,'recovered-hotel');
      const recovery = success(await logCommand('edit-remove-blocker',editor,'apply',obstructedSave,remove,repaired));
      assert.equal(recovery.revision,obstructed.revision+1);
      const recoveredSave = path.join(repaired,'save.json');
      const reopened = success(await logCommand('edit-validate-recovered',editor,'validate',recoveredSave));
      assert.equal(reopened.revision,recovery.revision);
      const final = (await json(recoveredSave)).document;
      assert.deepEqual(final,{...seed,revision:recovery.revision});
      const destination = path.join(work,'recovered-package');
      success(await pack('package-recovered-hotel-and-original-studio',recoveredSave,destination,studio,studioSave));
      const pin = await digest(path.join(destination,'transfer-manifest.json'));
      const verified = await sealed('verify-recovered-package',destination,pin);
      const publishedSave = path.join(destination,'data/save.json');
      assert.deepEqual(await json(publishedSave),await json(recoveredSave));
      assert.deepEqual(await json(path.join(destination,'data/rooms',studio,'save.json')),await json(studioSave));
      report.checks.repaired = {directory:destination,saveSha256:await digest(recoveredSave),publishedSha256:await digest(publishedSave),
        revision:recovery.revision,manifest:verified};
    }
    assert.equal(await digest(hotelSave),hotelSavePin);
    assert.equal(await digest(studioSave),studioSavePin);
  } finally {
    report.checks.originalAfter = await sealed('original-after',delivery,manifestSha256);
  }
}

try { await exercise(); report.status = 'passed'; }
catch (error) {
  report.status = 'failed';
  report.failure = {message:error.message,stack:error.stack};
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(work,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,mode,work,legacyBlocked:report.checks.legacyBlockedSave,
    repaired:report.checks.repaired,failure:report.failure},null,2));
}
