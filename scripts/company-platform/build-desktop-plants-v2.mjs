import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs,promisify} from 'node:util';
import {digest,editableSources,plantCompiler,plantToolchain,readProductionFile} from './plant-editable-source.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const collection='assets-source/company-desktop-plants-v1/collection.json';
const json=value=>JSON.stringify(value,null,2)+'\n';
const run=promisify(execFile);

async function produce(){
  const {values}=parseArgs({options:{parameters:{type:'string'},output:{type:'string'},check:{type:'boolean'},help:{type:'boolean'}}});
  if(values.help){console.log('node build-desktop-plants-v2.mjs --check | --output NEW_DIRECTORY [--parameters PROJECT_RECIPE]');return;}
  assert(values.check?!values.output&&!values.parameters:values.output,'Use --check for the fixed collection or --output NEW_DIRECTORY');
  const input=values.parameters??'assets-source/company-desktop-plants-v1/parameters.json';
  const bytes=await readProductionFile(root,input),recipe=JSON.parse(bytes);
  const pins=await editableSources(root,recipe),tools=await plantToolchain(root);
  async function compile(args){
    const {stdout}=await run(process.execPath,[path.join(root,plantCompiler),...args],{cwd:root,maxBuffer:8*1024*1024});
    return stdout;
  }
  if(values.check){
    assert(!pins.size,'Use --output and the publisher for new editable-source designs');
    process.stdout.write(await compile(['--check']));
    return;
  }
  const out=path.resolve(values.output);
  async function requireNew(){
    try{await fs.lstat(out);}catch(error){if(error.code==='ENOENT')return;throw error;}
    throw Object.assign(Error('Choose a new output directory: '+out),{code:'appearance-output-conflict'});
  }
  await requireNew();
  const stage=await fs.mkdtemp(path.join(path.dirname(out),'.plant-production-'));
  const candidate=path.join(stage,'candidate');
  try{
    const result=await compile(['--parameters',input,'--output',candidate]);
    const file=path.join(candidate,collection),records=JSON.parse(await fs.readFile(file));
    assert.equal(records.sourceParametersSha256,digest(bytes),'Recipe changed while compiling');
    let usesEditable=false;
    for(const [i,entry] of records.resources.entries()){
      const design=recipe.designs[i],pin=pins.get(design.source);
      assert.equal(entry.id,design.id);assert.equal(entry.version,design.version);
      if(!pin)continue;
      usesEditable=true;
      const sidecar=path.join(candidate,entry.resourcePath);
      const r=JSON.parse(await fs.readFile(sidecar)),p=r.provenance;
      assert.equal(p.generatorSha256,tools.compiler.sha256);
      p.generator=tools.producer.path;p.generatorSha256=tools.producer.sha256;
      Object.assign(p.dependencies,{editableSource:pin,geometryCompiler:tools.compiler,editableSourceValidator:tools.validator,producerLock:tools.lock});
      await fs.writeFile(sidecar,json(r));
    }
    if(usesEditable){
      records.generator=tools.producer.path;records.generatorSha256=tools.producer.sha256;
      await fs.writeFile(file,json(records));
    }
    await editableSources(root,recipe);
    assert((await readProductionFile(root,input)).equals(bytes),'Recipe changed while compiling');
    await requireNew();
    await fs.rename(candidate,out);
    process.stdout.write(result);
  }finally{await fs.rm(stage,{recursive:true,force:true});}
}
try{await produce();}catch(error){console.error(JSON.stringify({code:error.code??'plant-generation-failed',message:error.message}));process.exitCode=1;}
