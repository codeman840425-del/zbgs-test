import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

const source = fileURLToPath(new URL('../../',import.meta.url));
const {PNG} = createRequire(path.join(source,'prototype/package.json'))('pngjs');
const fixture = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'wall-print-ingress-test-'));
const tools = 'scripts/company-platform';
const catalogPath = 'prototype/src/company/library-catalog.json';
const collectionPath = 'assets-source/company-wall-prints-v1/collection.json';
const planPath = `${tools}/library-inputs.json`;
const fixtureAsset = 'prototype/public/company-assets/static-collection/wall-art-triptych/v1';
const fullPath = name => path.join(fixture,name);
const hash = data => createHash('sha256').update(data).digest('hex');
const read = name => fs.readFile(fullPath(name));
const json = async name => JSON.parse(await read(name));
const write = async (name,bytes) => {
  await fs.mkdir(path.dirname(fullPath(name)),{recursive:true});
  await fs.writeFile(fullPath(name),bytes);
};
const jsonFile = (name,value) => write(name,JSON.stringify(value,null,2) + '\n');
const copy = async name => {
  await fs.mkdir(path.dirname(fullPath(name)),{recursive:true});
  await fs.cp(path.join(source,name),fullPath(name),{recursive:true});
};
const run = (command,...args) => promisify(execFile)(process.execPath,[fullPath(`${tools}/${command}.mjs`),...args],{cwd:fixture});
const importPrint = async file => JSON.parse((await run('import-wall-print',fullPath(file))).stdout);

function image(red) {
  const picture = new PNG({width:3,height:2});
  for (let index = 0; index < picture.data.length; index += 4) picture.data.set([red,110,200,255],index);
  return PNG.sync.write(picture);
}

async function expectCode(file,code) {
  await assert.rejects(() => importPrint(file),error => {
    assert.equal(error.code,1);
    assert.equal(JSON.parse(error.stderr).code,code,error.stderr);
    return true;
  });
}

try {
  for (const name of ['prototype/package.json','prototype/src/company',fixtureAsset,
    'assets-source/company-static-collection/designs.mjs',
    ...['build-static-collection','build-library','preflight-library-assets','validate-resource-provenance','wall-print-model','import-wall-print']
      .map(name => `${tools}/${name}.mjs`)]) await copy(name);
  await fs.symlink(path.join(source,'prototype/node_modules'),fullPath('prototype/node_modules'),process.platform === 'win32' ? 'junction' : 'dir');
  const reference = await json(`${fixtureAsset}/resource.json`);
  const plan = {base:'prototype/src/company/facility-catalog.json',resources:[`${fixtureAsset}/resource.json`],collections:[collectionPath],output:catalogPath};
  await jsonFile(plan.base,{id:'company-facilities',version:1,resources:[]});
  await jsonFile(planPath,plan);
  await jsonFile(collectionPath,{schema:'company-wall-prints-v1',resources:[]});
  await run('build-library');

  const recipePath = 'inbox/print.json';
  const recipe = {id:'test-wall-print',version:1,displayName:'训练房试验挂画',image:'练习图.png',license:'Project-authored test image'};
  const imagePath = `inbox/${recipe.image}`;
  const original = image(20);
  const newImage = image(90);
  await jsonFile(recipePath,recipe);
  await write(imagePath,original);
  const first = await importPrint(recipePath);
  assert.equal(first.status,'registered');
  const resource = await json(first.resourcePath);
  const {provenance} = resource;
  const [{modelPath,sourcePath,sourceImage}] = (await json(collectionPath)).resources;
  assert.deepEqual(await read(sourceImage),original);
  assert.deepEqual(await read(sourcePath),await read(recipePath));
  assert.equal(provenance.sourceImageSha256,hash(original));
  assert.equal(provenance.sourceParametersSha256,hash(await read(recipePath)));
  assert.equal(provenance.generatorSha256,hash(await read(provenance.generator)));
  assert.equal(first.sha256,hash(await read(modelPath)));
  assert.deepEqual(resource.materialSlots,{finish:['wall-print-frame','wall-print-mat']});
  assert.equal(compareFacilityFunction(reference,resource).compatible,true);
  assert.deepEqual((await json(catalogPath)).resources,[reference,resource]);

  const stableFiles = [catalogPath,collectionPath,first.resourcePath,modelPath,sourcePath,sourceImage,provenance.generator];
  const unchanged = await Promise.all(stableFiles.map(read));
  assert.equal((await importPrint(recipePath)).status,'unchanged');
  assert.equal((await importPrint(sourcePath)).status,'unchanged');
  await write(imagePath,newImage);
  await expectCode(recipePath,'wall-print-version-conflict');
  await write(sourceImage,newImage);
  await write(imagePath,original);
  await expectCode(recipePath,'wall-print-pin-mismatch');
  await write(sourceImage,original);
  await jsonFile(recipePath,{...recipe,image:'../outside.png'});
  await expectCode(recipePath,'invalid-wall-print-image-path');
  await jsonFile(recipePath,{...recipe,id:'wall-art-triptych',version:2});
  await expectCode(recipePath,'wall-print-id-conflict');

  const lockPath = 'scripts/company-platform/.catalog-write.lock';
  await jsonFile(recipePath,{...recipe,id:'failed-wall-print'});
  await write(lockPath,'other import');
  await expectCode(recipePath,'wall-print-import-busy');
  assert.equal((await read(lockPath)).toString(),'other import');
  await fs.unlink(fullPath(lockPath));
  await write(imagePath,original.subarray(0,40));
  await expectCode(recipePath,'invalid-wall-print-png');
  await write(imagePath,original);
  await jsonFile(planPath,{...plan,resources:[...plan.resources,'missing-registration.json']});
  await expectCode(recipePath,'wall-print-catalog-build-failed');
  await jsonFile(planPath,plan);
  const failedPaths = ['assets-source/company-wall-prints-v1/failed-wall-print',
    'prototype/public/company-assets/wall-prints-v1/failed-wall-print',lockPath];
  for (const name of failedPaths) await assert.rejects(() => fs.lstat(fullPath(name)),{code:'ENOENT'});
  assert.deepEqual(await Promise.all(stableFiles.map(read)),unchanged);
  assert(!(await fs.readdir(fixture)).some(name => name.startsWith('.wall-print-build-')));

  await jsonFile(recipePath,{...recipe,version:2});
  await write(imagePath,newImage);
  const concurrent = await Promise.allSettled([importPrint(recipePath),importPrint(recipePath)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled' && result.value.status === 'registered').length,1);
  for (const result of concurrent) if (result.status === 'rejected') {
    assert.equal(result.reason.code,1);
    assert.equal(JSON.parse(result.reason.stderr).code,'wall-print-import-busy');
  }
  const registered = (await json(catalogPath)).resources;
  assert.equal(registered[2].version,2);
  assert.notEqual(registered[2].asset.sha256,resource.asset.sha256);
  assert.deepEqual(await Promise.all(stableFiles.slice(2).map(read)),unchanged.slice(2));
  await run('build-library','--check');
  console.log(JSON.stringify({ok:true,scope:'Isolated import, exact source rebuild, previous identity preservation, and rollback',
    checks:['register','repeat','stored-recipe-rebuild','version-conflict','source-pin','illegal-path','non-wall-print-id','lock','invalid-png','catalog-failure-rollback','concurrent-new-version','catalog-check']}));
} finally {
  const resolved = await fs.realpath(fixture);
  assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));
  assert(path.basename(resolved).startsWith('wall-print-ingress-test-'));
  await fs.rm(resolved,{recursive:true,force:true});
}
