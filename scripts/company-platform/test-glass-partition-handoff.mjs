import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {checkManagedOutput} from './package-company.mjs';

const [packageArg,pin,outputArg,...extra]=process.argv.slice(2);
assert(packageArg && /^[a-f0-9]{64}$/.test(pin) && outputArg && !extra.length,
  'node test-glass-partition-handoff.mjs FIXED_PACKAGE MANIFEST_SHA256 NEW_OUTPUT_DIRECTORY');
const project=path.resolve(import.meta.dirname,'../..');
const sealed=await fs.realpath(packageArg),out=path.resolve(outputArg);
await checkManagedOutput(out,project,{allowDelivery:false});
function contains(parent,child){
  const rel=path.relative(parent,child);
  return !path.isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+path.sep);
}
assert(!contains(sealed,out) && !contains(out,sealed),'Keep the working copy separate from the source package');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=async file=>sha(await fs.readFile(file));
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),json=v=>JSON.stringify(v,null,2)+'\n';
const write=(file,data)=>fs.writeFile(file,json(data),{flag:'wx'});
const manifestFile='transfer-manifest.json',manifestPath=path.join(sealed,manifestFile);
assert.equal(await hash(manifestPath),pin,'Fixed manifest SHA mismatch');
const manifest=await read(manifestPath),pinFor=name=>manifest.files.find(f=>f.path===name)?.sha256;
assert.equal(await hash(path.join(sealed,'verify.mjs')),pinFor('verify.mjs'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const copy=path.join(out,'received'),source=path.join(copy,'source'),proto=path.join(source,'prototype');
const logs=path.join(out,'logs'),cache=path.join(out,'npm-cache'),tmp=path.join(out,'tmp');
for(const folder of [logs,cache,tmp])await fs.mkdir(folder);
const env={...process.env,TEMP:tmp,TMP:tmp,TMPDIR:tmp,npm_config_cache:cache,npm_config_offline:'false',
  npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'};
const local=(...parts)=>path.join(proto,...parts);
const assets='assets-source/company-glass-partition-v1',example=assets+'/examples/framed-three-bays-v2.json';
const batchName='scripts/company-platform/batch-inputs/glass-partition-rooms.json',recipeName=assets+'/examples/receiver-asymmetric-nine-v2.json';
const keys=['glass-studio','glass-rental'],binding={id:'glass-partition-framed',version:1};
const expectedRows=[.23,.64],recipeAbs=path.join(source,recipeName);
const report={status:'running',original:sealed,pin,build:manifest.buildId,sourceDigest:manifest.sourceDigest,node:process.version,
  receivedSource:source,commands:[],originalRooms:{},upgradedRooms:{}};
const receipt=path.join(out,'receipt.json'),store=()=>fs.writeFile(receipt,json(report));
const exec=promisify(execFile);
async function run(label,file,args,cwd,{text=false,refusal}={}){
  const row={label,command:[process.execPath,file,...args],cwd,log:path.join(logs,label+'.log')};
  report.commands.push(row);await store();
  let stdout='',stderr='',exit;
  try{({stdout,stderr}=await exec(process.execPath,[file,...args],{cwd,env,windowsHide:true,maxBuffer:24*1024*1024}));exit=0;}
  catch(error){({stdout='',stderr='',code:exit}=error);}
  row.exit=exit;await fs.writeFile(row.log,stdout+(stderr?'\n'+stderr:''));await store();
  if(refusal){
    assert.equal(exit,1,label+' must be rejected');
    const e=JSON.parse((stderr||stdout).trim());assert.equal(e.code,refusal,e.message);return e;
  }
  assert.equal(exit,0,label+' '+(stderr||stdout).slice(-2200));return text?stdout.trim():JSON.parse(stdout);
}
const cli=(file,...args)=>[path.join(source,'scripts/company-platform',file+'.mjs'),args,source];
const readme=path.join(copy,'README.md'),verify=path.join(sealed,'verify.mjs');
function screen(doc,key){
  const id=key+(key==='glass-studio'?'/ground/live/screen':'/ground/work/screen');
  const node=doc.nodes.find(n=>n.id===id);assert(node?.kind==='facility');return node;
}
async function inspectModel(card,design){
  const data=await fs.readFile(local('public',card.asset.url));assert.equal(sha(data),card.asset.sha256);
  const {GLTFLoader}=await import(pathToFileURL(local('node_modules/three/examples/jsm/loaders/GLTFLoader.js')));
  const {Box3,Vector3}=await import(pathToFileURL(local('node_modules/three/build/three.module.js')));
  const model=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.length),'')).scene;
  const bounds=new Box3().setFromObject(model,true),panes=[],bars=[];
  model.traverseVisible(m=>{
    if(!m.isMesh)return;
    const box=new Box3().setFromObject(m,true),name=m.userData.name||m.name;
    if(/^pane-c\d+-r\d+$/.test(name)){assert(m.material.transparent && m.material.opacity>0 && m.material.opacity<1);panes.push({name,min:box.min.toArray(),max:box.max.toArray()});}
    if(/^transom-c\d+-r\d+$/.test(name)){assert.equal(m.material.opacity,1);bars.push({name,y:box.getCenter(new Vector3()).y});}
  });
  assert.equal(panes.length,design.bays*(design.rowFractions.length+1));assert.equal(bars.length,design.bays*design.rowFractions.length);
  for(const bar of bars){
    const row=Number(bar.name.split('-r')[1])-1;
    assert(Math.abs(bar.y-(.003+design.rowFractions[row]*(2.8-.006)))<.00001,bar.name+' actual transom height differs');
  }
  return {sha256:sha(data),bounds:[bounds.min.toArray(),bounds.max.toArray()],panes,bars};
}

try{
  report.originalSeal=await run('01-original',verify,[sealed,pin],sealed);assert(report.originalSeal.ok);
  await fs.cp(sealed,copy,{recursive:true,errorOnExist:true,force:false});
  const copiedVerify=path.join(copy,'verify.mjs');
  report.copySeal=await run('02-working-copy',copiedVerify,[copy,pin],copy);assert(report.copySeal.ok);
  const directions=await fs.readFile(readme,'utf8');assert(directions.includes('npm ci')&&directions.includes('vite.company.config.js'));
  assert.deepEqual(await fs.readdir(cache),[]);
  assert.equal(await fs.stat(local('node_modules')).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)),null);
  const lock=local('package-lock.json'),npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  report.lockSha256=await hash(lock);assert.equal(report.lockSha256,pinFor('source/prototype/package-lock.json'));
  await run('03-empty-cache-ci',npm,['ci','--cache',cache,'--prefer-online','--no-audit','--no-fund'],proto,{text:true});
  assert.equal(await hash(lock),report.lockSha256);report.cache={initialEntries:0,after:await fs.readdir(cache)};
  const build=local('scripts/build-company-id.mjs'),vite=local('node_modules/vite/bin/vite.js'),dist=local('dist-company');
  assert.equal(await run('04-original-build-id',build,[],proto,{text:true}),manifest.buildId);
  await run('05-original-build',vite,['build','--config','vite.company.config.js'],proto,{text:true});
  report.viewer=await run('06-entire-viewer-compare',verify,[sealed,pin,'--viewer',dist],sealed);assert(report.viewer.ok);
  const baseInput=path.join(source,batchName),spec=await read(baseInput),baseRooms=path.join(out,'fixed-rooms');
  const replay=await run('07-original-room-replay',...cli('batch',baseInput,baseRooms));assert(replay.ok);
  assert.deepEqual(spec.items.map(i=>i.key).sort(),[...keys].sort());
  const catalogPath=local('src/company/library-catalog.json'),catalog1=await read(catalogPath);
  const family=catalog1.resources.filter(r=>r.mountRole==='glass-partition');
  assert.equal(family.length,4);assert(family.every(f=>f.version===1));
  async function originalModels(){
    const entries={};
    for(const card of family){
      const model=local('public',card.asset.url);
      entries[card.id]={card:await hash(path.join(path.dirname(model),'resource.json')),model:await hash(model)};
      assert.equal(entries[card.id].model,card.asset.sha256);
    }
    return entries;
  }
  report.originalModels=await originalModels();
  for(const key of keys){
    const pins={};
    for(const f of ['input.json','layout.json','save.json','report.json']){
      pins[f]=await hash(path.join(baseRooms,key,f));assert.equal(pins[f],pinFor('data/rooms/'+key+'/batch-result/'+f),key+'/'+f);
    }
    report.originalRooms[key]=pins;
  }
  assert.equal(await hash(path.join(source,example)),pinFor('source/'+example));
  const recipe=await read(path.join(source,example)),design=recipe.designs[0];
  assert.equal(design.id,binding.id);assert.equal(design.version,2);assert.equal(design.bays,3);
  const signedRows=[...design.rowFractions];assert.notDeepEqual(signedRows,expectedRows);
  design.rowFractions=expectedRows;design.displayName='接收方错层九格玻璃隔断';
  await write(recipeAbs,recipe);
  report.recipe={name:recipeName,sha256:await hash(recipeAbs),exampleSha256:pinFor('source/'+example),signedRows,authoredRows:expectedRows};
  await run('08-original-producer-check',...cli('build-glass-partition','--check'));
  report.publication=await run('09-publish-nine',...cli('publish-room-appearance','--publish',recipeName));
  await run('10-check-nine',...cli('publish-room-appearance','--check',recipeName));
  await run('11-catalog-check',...cli('build-library','--check'));
  const catalog=await read(catalogPath),revision=catalog.resources.find(r=>r.id===binding.id&&r.version===2);
  assert.equal(catalog.resources.length,catalog1.resources.length+1);assert(revision);
  for(const card of family)assert.deepEqual(catalog.resources.find(r=>r.id===card.id&&r.version===1),card);
  assert.deepEqual(await originalModels(),report.originalModels);
  assert.equal(revision.provenance.sourceParametersSha256,report.recipe.sha256);
  const baselineRecipe=await read(path.join(source,assets,'parameters.json')),old=family.find(f=>f.id===binding.id);
  report.models={original:await inspectModel(old,baselineRecipe.designs.find(d=>d.id===binding.id)),receiver:await inspectModel(revision,design)};
  assert.equal(report.models.original.panes.length,6);assert.equal(report.models.receiver.panes.length,9);
  assert.deepEqual(report.models.original.bounds,report.models.receiver.bounds);assert.notEqual(old.asset.sha256,revision.asset.sha256);
  const bad=structuredClone(recipe);bad.designs[0].rowFractions=[.28,.73];
  const badName=assets+'/examples/receiver-conflicting-nine-v2.json';
  await write(path.join(source,badName),bad);
  const beforeConflict=await hash(catalogPath);
  report.conflict=await run('12-conflicting-version',...cli('publish-room-appearance','--publish',badName),{refusal:'appearance-version-conflict'});
  assert.equal(await hash(catalogPath),beforeConflict);assert.deepEqual(await originalModels(),report.originalModels);
  assert.equal(await hash(local('public',revision.asset.url)),revision.asset.sha256);
  await run('13-original-revision-still-passes',...cli('publish-room-appearance','--check',recipeName));
  const templates=await read(local('src/company/templates-extended.json'));
  const {decodeCompanySave}=await import(pathToFileURL(local('src/company/persistence.js')));
  for(const i of spec.items){
    const doc=await read(path.join(baseRooms,i.key,'layout.json')),raw=await fs.readFile(path.join(baseRooms,i.key,'save.json'),'utf8');
    assert.deepEqual(await decodeCompanySave(raw,catalog,templates),doc);
    const id=screen(doc,i.key).id,ops=i.operations.filter(op=>op.type==='add-facility'&&op.id===id);
    assert.equal(ops.length,1);ops[0].resource=binding;
  }
  const variant=path.join(out,'receiver-rooms.json'),rooms=path.join(out,'framed-rooms');
  await write(variant,spec);assert((await run('14-two-six-pane-seeds',...cli('batch',variant,rooms))).ok);
  report.seedRooms={};
  for(const key of keys){
    const expected=await read(path.join(baseRooms,key,'layout.json'));screen(expected,key).resource=binding;
    const seed=await read(path.join(rooms,key,'layout.json'));assert.deepEqual(seed,expected);
    report.seedRooms[key]={id:screen(seed,key).id,saveSha256:await hash(path.join(rooms,key,'save.json')),layoutSha256:await hash(path.join(rooms,key,'layout.json'))};
  }
  const newBuild=await run('15-receiver-build-id',build,[],proto,{text:true});assert.notEqual(newBuild,manifest.buildId);
  await run('16-receiver-viewer',vite,['build','--config','vite.company.config.js'],proto,{text:true});
  const transfer=path.join(out,'framed-v2-package');
  const packed=await run('17-package-both-seeds',...cli('package-company',dist,newBuild,path.join(rooms,keys[0]),transfer,'--source',source,
    ...keys.flatMap(key=>['--room',key,path.join(rooms,key)])));
  assert(packed.ok);
  const newPin=await hash(path.join(transfer,manifestFile));
  report.derivedPackage={path:transfer,manifestSha256:newPin,build:newBuild,files:packed.files};
  const verified=await run('18-verify-derived',path.join(transfer,'verify.mjs'),[transfer,newPin],transfer);assert(verified.ok);
  assert.equal(await hash(path.join(transfer,'source',revision.provenance.sourceParameters)),report.recipe.sha256);
  assert.equal(await hash(path.join(transfer,'source',example)),report.recipe.exampleSha256);
  // The ordinary packaged editor loads editing dependencies from its source tree. Use the installed working copy.
  for(const key of keys){
    const input=path.join(transfer,'data','rooms',key,'save.json'),id=report.seedRooms[key].id;
    assert.equal(await hash(input),report.seedRooms[key].saveSha256);
    const op=path.join(out,key+'.upgrade.json'),edits=path.join(out,key+'-nine');
    await write(op,[{type:'replace-resource',id,resource:{id:binding.id,version:2}}]);
    const editor=path.join(copy,'edit.mjs');
    const result=await run('19-'+key+'-upgrade',editor,['apply',input,op,edits,'--room',key],copy);assert(result.ok);
    const saved=path.join(edits,'save.json'),cold=await run('20-'+key+'-reopen',editor,['validate',saved,'--room',key],copy);assert(cold.ok);
    const text=await fs.readFile(saved,'utf8'),doc=await decodeCompanySave(text,catalog,templates),seed=await read(path.join(rooms,key,'layout.json'));
    assert.deepEqual(doc,await read(path.join(edits,'layout.json')));
    screen(seed,key).resource.version=2;assert.equal(doc.revision,seed.revision+1);seed.revision=doc.revision;assert.deepEqual(doc,seed);
    assert.equal(await hash(input),report.seedRooms[key].saveSha256);
    report.upgradedRooms[key]={id,resource:screen(doc,key).resource,saveSha256:sha(text),cold,originalSeedSha256:await hash(input)};
  }
  report.recheckedOriginal=await run('21-original-still-sealed',verify,[sealed,pin],sealed);assert(report.recheckedOriginal.ok);
  report.status='passed';await store();console.log(json({receipt,...report.derivedPackage}));
}catch(error){report.status='failed';report.error=error.message;await store();throw error;}
