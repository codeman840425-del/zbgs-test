import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {createCompany} from '../../prototype/src/company/document.js';

const project = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const [requestedOutput,...extra] = process.argv.slice(2);
const output = path.resolve(project,requestedOutput ?? 'output');
const relativeOutput = path.relative(path.join(project,'output'),output);
assert(!extra.length && relativeOutput !== '..' && !relativeOutput.startsWith('..'+path.sep) && !path.isAbsolute(relativeOutput),
  'Pass an optional report directory under the project output folder');
await fs.mkdir(output,{recursive:true});
const trial = await fs.mkdtemp(path.join(output,'appearance-publish-test-'));
const toolDir = 'scripts/company-platform', planPath = toolDir+'/library-inputs.json', catalog = 'prototype/src/company/library-catalog.json';
const author = 'assets-source/company-publication-trial';
const lamp = author+'/lamp.json', screen = author+'/screen.json';
const families = ['desk-lamp','screen-partition','baseboard'];
const base = f => 'assets-source/company-'+f+'-v1';
const baseboard = base('baseboard')+'/examples/reveal-sage-v2.json';
const resourceDir = (f,id,v=1) => 'prototype/public/company-assets/'+f+'-v1/'+id+'/v'+v;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFile(path.join(trial,name));
const data = async name => JSON.parse(await read(name));
const write = (name,value) => fs.writeFile(path.join(trial,name),JSON.stringify(value,null,2)+'\n');
const run = (tool,...args) => promisify(execFile)(process.execPath,[toolDir+'/'+tool+'.mjs',...args],{cwd:trial,maxBuffer:8*1024*1024});
const pub = (recipe,mode='--publish') => run('publish-room-appearance',mode,recipe).then(r=>JSON.parse(r.stdout));
const rejected = (task,code) => assert.rejects(task,error=>{assert.equal(JSON.parse(error.stderr).code,code,error.stderr);return true;});
const missing = name => assert.rejects(read(name),{code:'ENOENT'});
const checks = [];
try {
  const tools = ['build-library','validate-resource-provenance','preflight-library-assets','publish-room-appearance',
    'test-screen-partition-geometry','build-desk-lamp-collection','build-screen-partition-collection','build-baseboards','batch','check-training-clearance'];
  const archive = 'assets-source/company-side-table-v1/original/furniture-kit-2.0.zip';
  const files = ['prototype/src/company','prototype/package.json','assets-source/company-environment-specs-v1/branches.json',archive,
    ...families.flatMap(f=>[base(f),'prototype/public/company-assets/'+f+'-v1']),...tools.map(t=>toolDir+'/'+t+'.mjs')];
  for(const file of files){
    const target = path.join(trial,file);
    await fs.mkdir(path.dirname(target),{recursive:true}); await fs.cp(path.join(project,file),target,{recursive:true});
  }
  await fs.symlink(path.join(project,'prototype/node_modules'),path.join(trial,'prototype/node_modules'),process.platform==='win32'?'junction':'dir');
  await fs.mkdir(path.join(trial,author));
  const plan = {base:'prototype/src/company/facility-catalog.json',resources:[],collections:families.map(f=>base(f)+'/collection.json'),output:catalog};
  await write(planPath,plan); await run('build-library');
  const baseline = await data(catalog), initialPlan = await read(planPath);
  const initialPins = await Promise.all(families.map(async f=>digest(await read(base(f)+'/collection.json'))));
  const lampRecipe = await data(base(families[0])+'/parameters.json');
  const screenRecipe = await data(base(families[1])+'/parameters.json');
  lampRecipe.designs = [lampRecipe.designs[0]];
  const light = lampRecipe.designs[0]; light.id = 'desk-lamp-author-base'; light.displayName = '窄底座台灯';
  light.stand[0].dimensions[0] *= .9;
  screenRecipe.designs = [screenRecipe.designs.find(d=>d.construction==='acoustic-tiles')];
  const partition = screenRecipe.designs[0]; partition.id = 'screen-partition-author-tiles'; partition.displayName = '密排毡面屏风';
  partition.parts.rows = 5; partition.parts.columns = 3;
  await write(lamp,lampRecipe); await write(screen,screenRecipe);
  await rejected(pub(lamp,'--check'),'appearance-unregistered'); assert((await read(planPath)).equals(initialPlan));
  const lampResult = await pub(lamp); assert.equal(lampResult.status,'published');
  assert((await read(lampResult.sourceParameters)).equals(await read(lamp)));
  const competitors = await Promise.allSettled([pub(screen),pub(screen)]);
  assert.equal(competitors.filter(r=>r.status==='fulfilled' && r.value.status==='published').length,1);
  for(const r of competitors) if(r.status==='rejected') assert.equal(JSON.parse(r.reason.stderr).code,'catalog-write-busy');
  const screenResult = await pub(screen,'--check');
  assert.equal(screenResult.status,'unchanged');
  await rejected(pub(baseboard,'--check'),'appearance-unregistered');
  const baseboardResult = await pub(baseboard);
  assert.equal(baseboardResult.status,'published');
  assert.equal(baseboardResult.family,'baseboard');
  const [trim] = baseboardResult.items;
  assert.equal(trim.id,'baseboard-reveal-sage');
  assert.equal(trim.version,2);
  const trimRef = {id:trim.id,version:trim.version};
  assert.equal(digest(await read(trim.texturePath)),trim.textureSha256);
  await run('build-baseboards','--output','output/direct-baseboard','--parameters',baseboardResult.sourceParameters);
  for(const file of [trim.resourcePath,trim.texturePath,resourceDir('baseboard',trim.id,trim.version)+'/model.glb'])
    assert((await read(file)).equals(await read('output/direct-baseboard/'+file)));
  assert.equal((await pub(baseboard,'--check')).status,'unchanged');
  assert.equal((await pub(baseboardResult.sourceParameters,'--check')).status,'unchanged');
  const registered = await data(catalog);
  assert.deepEqual(registered.resources.filter(r=>![light.id,partition.id,trim.id].includes(r.id)),baseline.resources);
  const trimResource = registered.resources.find(r=>r.id===trim.id && r.version===trim.version);
  const trimReference = registered.resources.find(r=>r.id==='baseboard-reveal' && r.version===1);
  assert.deepEqual(trimResource.finish.allowedSurfaces,trimReference.finish.allowedSurfaces);
  assert.notDeepEqual(trimResource.finish.profile,trimReference.finish.profile);
  const stable = await read(catalog), stablePlan = await read(planPath);
  assert.equal((await pub(lamp)).status,'unchanged'); assert.equal((await pub(screen)).status,'unchanged');
  assert.equal((await pub(baseboard)).status,'unchanged');
  assert((await read(catalog)).equals(stable)); assert((await read(planPath)).equals(stablePlan));
  for(const [index,f] of families.entries()){
    assert.equal(digest(await read(base(f)+'/collection.json')),initialPins[index]);
    await run(f==='baseboard'?'build-baseboards':'build-'+f+'-collection','--check');
  }
  checks.push('Fifth lamp, partition and baseboard published with immutable inputs; repeat, concurrent writer and all original four-model checks passed');

  const document = createCompany({id:'fifth-appearances'},registered);
  const room = document.nodes[1].id;
  document.nodes[1].finishes = {baseboard:{resource:trimRef}};
  const item = (id,parentId,r,x,y) => ({id,kind:'facility',parentId,resource:{id:r,version:1},state:{},transform:{position:[x,y,0],yaw:0}});
  document.nodes.push(item('author-desk',room,'desk',-2,0),item('author-lamp','author-desk',light.id,0,.84),item('author-screen',room,partition.id,2,0));
  const batch = {schema:'company-batch',version:1,items:[{key:'trial',document}]};
  await write('batch.json',batch); await run('batch','batch.json','batch-output');
  const save = await data('batch-output/trial/save.json');
  for(const id of [light.id,partition.id]) assert(save.dependencies.resources.some(r=>r.id===id && r.version===1));
  assert(save.dependencies.resources.some(r=>r.id===trim.id && r.version===trim.version));
  checks.push('Normal batch saved a room using all three published IDs and pinned their catalog definitions');

  const publishedModel = resourceDir(families[0],light.id)+'/model.glb';
  const oldModel = await read(publishedModel);
  light.stand[0].dimensions[0] *= .95;
  await write(lamp,lampRecipe);
  await rejected(pub(lamp),'appearance-version-conflict');
  assert((await read(publishedModel)).equals(oldModel));
  assert((await read(catalog)).equals(stable)); assert((await read(planPath)).equals(stablePlan));
  await run('build-library','--check');
  assert.equal((await pub(lampResult.sourceParameters,'--check')).status,'unchanged');
  checks.push('Editing the original author draft and reusing a version is rejected; pinned recipe, model, plan and catalog reproduce');

  const invalid = author+'/invalid.json';
  for(const file of [trim.resourcePath,trim.texturePath,resourceDir('baseboard',trim.id,trim.version)+'/model.glb']) {
    const original = await read(file), changed = Buffer.concat([original,Buffer.from([1])]);
    try {
      await fs.writeFile(path.join(trial,file),changed);
      await rejected(pub(baseboard,'--check'),'appearance-version-conflict');
      assert((await read(file)).equals(changed));
    } finally {await fs.writeFile(path.join(trial,file),original);}
  }
  const textureFile = path.join(trial,trim.texturePath), texture = await read(trim.texturePath);
  await fs.unlink(textureFile);
  try {
    await rejected(pub(baseboard,'--check'),'appearance-version-conflict');
    await missing(trim.texturePath);
  } finally {await fs.writeFile(textureFile,texture,{flag:'wx'});}
  const baseboardRecipe = await data(baseboard);
  const oldTrim = structuredClone(baseboardRecipe.designs[0]);
  oldTrim.profile[3][0] -= .001; oldTrim.profile[4][0] -= .001;
  const pendingTrim = {...structuredClone(oldTrim),id:'baseboard-pending-texture'};
  await write(invalid,{...baseboardRecipe,designs:[pendingTrim,oldTrim]});
  await rejected(pub(invalid),'appearance-version-conflict');
  await missing(resourceDir('baseboard',pendingTrim.id,pendingTrim.version));
  await missing(author+'/recipe-'+digest(await read(invalid))+'.json');
  const crossed = structuredClone(baseboardRecipe);
  crossed.designs[0].profile.push(crossed.designs[0].profile[0]);
  await write(invalid,crossed);
  await rejected(pub(invalid),'appearance-generation-failed');
  await missing(author+'/recipe-'+digest(await read(invalid))+'.json');
  const otherFamily = structuredClone(baseboardRecipe);
  otherFamily.designs[0].id = 'chair';
  await write(invalid,otherFamily);
  await rejected(pub(invalid),'appearance-id-conflict');
  assert((await read(catalog)).equals(stable)); assert((await read(planPath)).equals(stablePlan));
  assert.equal((await pub(baseboard,'--check')).status,'unchanged');
  checks.push('Corrupt or missing artifacts, invalid profiles and cross-family identities are rejected; pending textures and source snapshots roll back');

  const broken = structuredClone(screenRecipe);
  broken.designs[0].parts.rows = 0;
  await write(invalid,broken);
  await rejected(pub(invalid),'appearance-generation-failed');
  await rejected(pub('../outside.json'),'invalid-appearance-source');
  const badStock = await data(base(families[0])+'/parameters.json');
  badStock.designs = [badStock.designs.find(d=>d.source)];
  badStock.archive.sha256 = '0'.repeat(64);
  await write(invalid,badStock);
  await rejected(pub(invalid),'appearance-generation-failed');
  const geometry = toolDir+'/test-screen-partition-geometry.mjs', checkedGeometry = await read(geometry);
  try {
    await fs.appendFile(path.join(trial,geometry),'\n// different inspection code\n');
    await rejected(pub(screen),'appearance-tool-pin-mismatch');
  } finally { await fs.writeFile(path.join(trial,geometry),checkedGeometry); }
  checks.push('Unsupported shape, escaping source, altered geometry verifier and mismatched original stock archive fail admission');

  // Make the second identity collide after the first has staged successfully.
  const pair = structuredClone(lampRecipe);
  const second = structuredClone(light); second.id = 'desk-lamp-staged'; second.stand[0].dimensions[0] *= .90;
  pair.designs = [second,light]; await write(invalid,pair);
  await rejected(pub(invalid),'appearance-version-conflict');
  await missing(resourceDir(families[0],second.id));
  assert((await read(catalog)).equals(stable)); assert((await read(planPath)).equals(stablePlan));
  light.version = 2; await write(lamp,lampRecipe);
  const tampered = await data(planPath); tampered.resources.push('missing-sidecar.json'); await write(planPath,tampered);
  const badPlan = await read(planPath);
  await rejected(pub(lamp),'ENOENT');
  assert((await read(planPath)).equals(badPlan)); assert((await read(catalog)).equals(stable));
  await missing(resourceDir(families[0],light.id,2));
  await fs.writeFile(path.join(trial,planPath),stablePlan);
  const upgraded = await pub(lamp); assert.equal(upgraded.status,'published');
  assert((await read(publishedModel)).equals(oldModel));
  await run('build-library','--check');
  checks.push('Partial multi-item and catalog rebuild errors rolled back; explicit v2 publishes alongside the unchanged v1');
  const saved = await data('batch-output/trial/save.json');
  const {decodeCompanySave} = await import('../../prototype/src/company/persistence.js');
  const reopened = await decodeCompanySave(JSON.stringify(saved),await data(catalog),await data('prototype/src/company/templates-extended.json'));
  assert.deepEqual(reopened,saved.document);
  checks.push('The v1 room reopens with its original pins after the v2 registration');
  const report = {status:'passed',checks,isolatedCatalog:{base:baseline.resources.length,afterPublications:registered.resources.length},
    publications:[lampResult,screenResult,baseboardResult,upgraded],batchSaveSha256:digest(await read('batch-output/trial/save.json'))};
  const receipt = path.join(output,'room-appearance-publication-v1.json');
  await fs.writeFile(receipt,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:'passed',checks:checks.length,receipt:path.relative(project,receipt).split(path.sep).join('/')}));
} finally {
  const actual = await fs.realpath(trial);
  assert.equal(path.dirname(actual),await fs.realpath(output)); assert(path.basename(actual).startsWith('appearance-publish-test-'));
  await fs.rm(actual,{recursive:true,force:true});
}
