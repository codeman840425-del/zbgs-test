import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const source=fileURLToPath(new URL('../../',import.meta.url));
const temp=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'ornament-publication-'));
const tools='scripts/company-platform', family='assets-source/company-sourced-ornaments-v1';
const pack='assets-source/company-side-table-v1/original/furniture-kit-2.0.zip';
const reference='prototype/public/company-assets/support-collection-v1/ornaments/vase/v1';
const runtime='prototype/public/company-assets/sourced-ornaments-v1';
const books=family+'/tabletop-books-kenney-v1.json', plant=family+'/tabletop-plant-kenney-v1.json';
const collection=family+'/collection.json', catalog='prototype/src/company/library-catalog.json', planPath=tools+'/library-inputs.json';
const read=name=>fs.readFile(path.join(temp,name));
const write=(name,value)=>fs.writeFile(path.join(temp,name),JSON.stringify(value,null,2)+'\n');
const run=(script,...args)=>promisify(execFile)(process.execPath,[tools+'/'+script+'.mjs',...args],{cwd:temp});
const publish=(...recipes)=>run('publish-tabletop-ornaments','--publish',...recipes);
const checks=[];
try {
  for(const file of ['prototype/src/company','prototype/package.json',reference,family,pack,
    'docs/COMPANY-SUPPORT-SURFACE-CONTRACT-v1.txt','assets-source/company-support-collection-v1/parameters.json',
    ...['adapt-tabletop-ornament','build-support-collection','build-library','preflight-library-assets',
      'publish-tabletop-ornaments','validate-resource-provenance','wall-print-model'].map(name=>tools+'/'+name+'.mjs')]){
    const target=path.join(temp,file);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.cp(path.join(source,file),target,{recursive:true});
  }
  await fs.symlink(path.join(source,'prototype/node_modules'),path.join(temp,'prototype/node_modules'),process.platform==='win32'?'junction':'dir');
  const plan={base:'prototype/src/company/facility-catalog.json',resources:[reference+'/resource.json'],collections:[collection],output:catalog};
  await write(plan.base,{id:'company-facilities',version:1,resources:[]});
  await write(planPath,plan);
  await write(collection,{schema:'company-sourced-ornaments-v1',resources:[]});
  await run('build-library');
  const before=await read(catalog);
  const checkFailure=async(task,code)=>assert.rejects(task,error=>JSON.parse(error.stderr).code===code);
  await checkFailure(publish(books,family+'/tests/wall-bear-rejected.json'),'ornament-no-floor-contact');
  assert((await read(catalog)).equals(before));
  await assert.rejects(fs.stat(path.join(temp,runtime)),{code:'ENOENT'});
  checks.push('Invalid second source preserves the catalog and creates no partial pair');
  const result=JSON.parse((await publish(books,plant)).stdout);
  assert.equal(result.status,'published');assert.equal(result.items.length,2);
  assert.notEqual(result.items[0].sha256,result.items[1].sha256);
  const stable=await read(catalog), index=await read(collection);
  const repeated=JSON.parse((await publish(plant,books)).stdout);
  assert.equal(repeated.status,'unchanged');assert((await read(catalog)).equals(stable));
  await run('publish-tabletop-ornaments','--check',books,plant);
  checks.push('Two different source meshes, one publishing command and byte-identical repeat');
  const active=tools+'/adapt-tabletop-ornament.mjs', original=await read(active);
  await fs.writeFile(path.join(temp,active),'export async function buildTabletopOrnament(){throw Error("unexpected call to the newer producer");}\n');
  try {
    await run('publish-tabletop-ornaments','--check',books,plant);
    checks.push('Already published versions rebuild from their archived producer after the active tool changes');
  } finally {await fs.writeFile(path.join(temp,active),original);}
  const trial=JSON.parse(await read(books)), candidate=family+'/different.json';
  trial.fit.fill=.8; await write(candidate,trial);
  await checkFailure(publish(candidate),'ornament-version-conflict');
  trial.resource.version=2;await write(candidate,trial);
  await write(planPath,{...plan,resources:[...plan.resources,'unavailable.json']});
  await checkFailure(publish(candidate),'ENOENT');
  assert((await read(catalog)).equals(stable));assert((await read(collection)).equals(index));
  await assert.rejects(fs.stat(path.join(temp,runtime,trial.resource.id,'v2')),{code:'ENOENT'});
  await write(planPath,plan);
  checks.push('Conflicting immutable version and failed catalog build leave previous models and index intact');
  const concurrent=await Promise.allSettled([publish(candidate),publish(candidate)]);
  const statuses=concurrent.filter(x=>x.status==='fulfilled').map(x=>JSON.parse(x.value.stdout).status);
  assert.equal(statuses.filter(x=>x==='published').length,1);
  for(const x of concurrent)if(x.status==='rejected')assert.equal(JSON.parse(x.reason.stderr).code,'catalog-write-busy');
  await run('build-library','--check');
  const registered=JSON.parse(await read(catalog)).resources;
  assert.deepEqual(registered.slice(0,-1),JSON.parse(stable).resources);
  assert.equal(registered.at(-1).version,2);
  checks.push('Competing publishers preserve earlier entries and commit the new identity once');
  console.log(JSON.stringify({status:'passed',checks},null,2));
}finally{
  const actual=await fs.realpath(temp);
  assert.equal(path.dirname(actual),await fs.realpath(os.tmpdir()));assert(path.basename(actual).startsWith('ornament-publication-'));
  await fs.rm(actual,{recursive:true,force:true});
}
