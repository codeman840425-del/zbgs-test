import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {buildInformationResources,SOURCE_PATH,CONTRACT_PATH,GENERATOR_PATH,CONTENT_HELPER_PATH} from './build-information.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {checkManagedOutput} from './package-company.mjs';

const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const sourceDir='assets-source/company-wayfinding-v1',generator='scripts/company-platform/build-wayfinding.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const rule=(text,min,max)=>typeof text==='string'&&text===text.trim()&&[...text].length>=min&&[...text].length<=max&&!/[\x00-\x1f\x7f]/u.test(text);
function checkDesign(d,art){
  const fields=['id','kind','title','displayName','version','purpose','subtitle','layout','icon','palette','author',...(d.iconPaths?['iconPaths']:[])];
  assert.deepEqual(Object.keys(d).sort(),fields.sort(),'Unknown or missing wayfinding design field');
  assert(d.kind==='wayfinding'&&/^wayfinding-[a-z][a-z0-9-]{0,47}$/.test(d.id));
  assert(Number.isSafeInteger(d.version)&&d.version>=1&&d.version<=999);
  assert(['arrivals','training','lift','stairs'].includes(d.purpose),'Unknown wayfinding meaning');
  assert(rule(d.title,1,8)&&rule(d.subtitle,1,18)&&rule(d.displayName,1,48)&&rule(d.author,1,80));
  assert(Object.hasOwn(art.layouts,d.layout)&&/^[a-z][a-z0-9-]{0,47}$/.test(d.icon));
  assert(d.iconPaths?Array.isArray(d.iconPaths)&&!Object.hasOwn(art.icons,d.icon):Object.hasOwn(art.icons,d.icon));
  assert.deepEqual(Object.keys(d.palette).sort(),['accent','icon','ink','panel','paper']);
  assert(Object.values(d.palette).every(c=>/^#[0-9a-fA-F]{6}$/.test(c)));
}

// Read back accessor bytes, material binding and the original PNG stream inside the GLB.
function checkFace(model,png){
  assert.equal(model.readUInt32LE(0),0x46546c67);assert.equal(model.readUInt32LE(4),2);assert.equal(model.readUInt32LE(8),model.length);
  const end=20+model.readUInt32LE(12),doc=JSON.parse(model.subarray(20,end));
  assert.equal(model.readUInt32LE(end+4),0x004e4942);const binary=model.subarray(end+8);
  const range=idx=>{const b=doc.bufferViews[idx];assert.equal(b.buffer,0);return binary.subarray(b.byteOffset??0,(b.byteOffset??0)+b.byteLength);};
  const prim=doc.meshes[doc.nodes[doc.scenes[doc.scene].nodes[0]].mesh].primitives[0];
  assert.equal(doc.nodes[0].name,'information-face');const inputs=[prim.attributes.POSITION,prim.attributes.NORMAL,prim.attributes.TEXCOORD_0,prim.indices];
  const pieces=inputs.map((n,i)=>{
    const a=doc.accessors[n],bytes=range(a.bufferView);
    const data=bytes.subarray(a.byteOffset??0,(a.byteOffset??0)+[48,48,32,12][i]);
    assert.equal(a.componentType,i===3?5123:5126);assert.equal(a.count,i===3?6:4);
    return data;
  });
  const values=i=>Array.from({length:pieces[i].length/4},(_,j)=>Number(pieces[i].readFloatLE(j*4).toFixed(5)));
  assert.deepEqual(values(0),[-.44,-.28,0,.44,-.28,0,.44,.28,0,-.44,.28,0]);
  assert.deepEqual(values(1),[0,0,1,0,0,1,0,0,1,0,0,1]);assert.deepEqual(values(2),[0,1,1,1,1,0,0,0]);
  assert.deepEqual(Array.from({length:6},(_,i)=>pieces[3].readUInt16LE(i*2)),[0,1,2,0,2,3]);
  const material=doc.materials[prim.material].pbrMetallicRoughness,texture=doc.textures[material.baseColorTexture.index];
  assert.equal(texture.source,0);const image=doc.images[texture.source];assert.equal(image.mimeType,'image/png');
  const packed=range(image.bufferView);assert(packed.length-png.length>=0&&packed.length-png.length<4);
  assert(packed.subarray(0,png.length).equals(png)&&packed.subarray(png.length).every(b=>b===0));
  assert.equal(png.readUInt32BE(16),1100);assert.equal(png.readUInt32BE(20),700);
  return {geometrySha256:sha(Buffer.concat(pieces)),faceNode:'information-face',widthMetres:.88,heightMetres:.56,
    triangles:2,uv:values(2),embeddedPngBytes:png.length,embeddedPngSha256:sha(png)};
}
async function safe(owner,relative) {
  const parts=relative.split('/');
  assert(parts.every(p=>/^[\w-][\w.-]*$/.test(p) && !p.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)),'Invalid project path: '+relative);
  let dest=owner;
  for(const part of parts) {
    dest=path.join(dest,part);
    const stat=await fs.lstat(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(stat)assert(!stat.isSymbolicLink() && await fs.realpath(dest)===dest,'Linked path: '+dest);
  }
  return dest;
}
const read=async relative=>fs.readFile(await safe(root,relative));
const pin=async relative=>({path:relative,sha256:sha(await read(relative))});

const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-wayfinding.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.write,args.check,Boolean(args.output)].filter(Boolean).length, 1, 'Choose one output mode');
assert(!args.parameters || args.output, 'Trial recipes require --output');
let project = root;
for(let current=root; current!==path.dirname(current); current=path.dirname(current)) {
  if(['company-workspace','output'].includes(path.basename(current).toLowerCase())) {
    const candidate = path.dirname(current);
    const marker = await fs.stat(path.join(candidate,'scripts/company-platform/local-workspace.ps1')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(marker?.isFile()) project = candidate;
  }
}
const scratch = 'output/public-wayfinding-v1/production';
const stage = await safe(project, scratch);
await checkManagedOutput(stage,root,{allowDelivery:false});
let dest;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'), 'Path traversal in trial destination');
  const absolute = path.resolve(project,args.output), trial = path.relative(project,absolute).split(path.sep).join('/');
  assert(/^(output|company-workspace\/production-trials)\//.test(trial), 'Trial must stay inside project outputs');
  assert(trial!==scratch && !trial.startsWith(scratch+'/publication.lock') && !trial.startsWith(scratch+'/stage-'), 'Reserved producer directory');
  dest = await safe(project,trial);
  await checkManagedOutput(dest,root,{allowDelivery:false});
}
const input=args.parameters??sourceDir+'/parameters.json',artPath=sourceDir+'/artwork.json',recordPath=sourceDir+'/original/sources.json';
assert(input.endsWith('.json'),'Use a project-relative JSON recipe');
const [recipeBytes,canonicalBytes,artBytes,infoBytes,contractBytes,meshGenBytes]=await Promise.all([
  input,sourceDir+'/parameters.json',artPath,SOURCE_PATH,CONTRACT_PATH,GENERATOR_PATH].map(read));
const recipe=JSON.parse(recipeBytes),canonical=JSON.parse(canonicalBytes),art=JSON.parse(artBytes),common=JSON.parse(infoBytes);
const record=JSON.parse(await read(recordPath));
assert.deepEqual(Object.keys(recipe).sort(),['designs','schema','version']);
assert(recipe.schema==='company-wayfinding-signs'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length>=1&&recipe.designs.length<=64);
const font=common.common.font;
assert.equal(record.artwork,artPath);assert.equal(record.font,font.file);assert.equal(record.fontLicense,font.licenseFile);
assert.equal(record.licensePath,sourceDir+'/original/PROJECT-SOURCE.txt');assert.equal(record.meshSource,GENERATOR_PATH);
const depPaths={generator,renderer:sourceDir+'/render.py',artwork:artPath,sourceRecord:recordPath,license:record.licensePath,
  meshGenerator:GENERATOR_PATH,contract:CONTRACT_PATH,commonParameters:SOURCE_PATH,commonHelper:CONTENT_HELPER_PATH,
  requirements:'assets-source/company-information-v1/requirements.txt',font:font.file,fontLicense:font.licenseFile};
const dependencies=Object.fromEntries(await Promise.all(Object.entries(depPaths).map(async([key,p])=>[key,await pin(p)])));
assert.equal(dependencies.font.sha256,font.sha256);assert.equal(dependencies.fontLicense.sha256,font.licenseSha256);
const seen=new Set();
for(const d of recipe.designs){
  checkDesign(d,art);
  const key=d.id+'@'+d.version;assert(!seen.has(key),'Duplicate identity '+key);seen.add(key);
  const signed=canonical.designs.find(s=>s.id===d.id&&s.version===d.version);
  if(args.parameters&&signed)assert.deepEqual(d,signed,'Edit a signed design under a new ID/version.');
  const ancestor=canonical.designs.find(s=>s.id===d.id);
  if(ancestor)assert.equal(d.purpose,ancestor.purpose,'New purpose needs a new ID');
}
await fs.mkdir(stage,{recursive:true});
const paint=spawnSync(process.env.PYTHON??'python',['-I','-B',path.join(root,depPaths.renderer)],{
  input:JSON.stringify({designs:recipe.designs,artwork:art}),encoding:'utf8',maxBuffer:96*1024*1024,
  cwd:root,windowsHide:true,env:{...process.env,TMP:stage,TEMP:stage,TMPDIR:stage}});
if(paint.error)throw paint.error;assert.equal(paint.status,0,paint.stderr);
const raster=JSON.parse(paint.stdout);
assert.equal(raster.length,recipe.designs.length);
const baseContents=recipe.designs.map((d,i)=>{
  assert.equal(raster[i].id,d.id);assert.equal(raster[i].version,d.version);
  return {content:{id:d.id,title:d.title},png:Buffer.from(raster[i].png,'base64')};
});
const packed=await buildInformationResources({source:common,sourceBytes:infoBytes,contractBytes,generatorBytes:meshGenBytes,baseContents});
const collection={schemaVersion:1,id:'company-wayfinding-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:dependencies.generator.sha256,contract:CONTRACT_PATH,contractSha256:dependencies.contract.sha256,resources:[]};
const files=new Map();
for(const [i,d] of recipe.designs.entries()){
  const {model,png,resource:base,repeat}=packed.contents[i];assert(model.equals(repeat));
  const face=checkFace(model,png),dir='prototype/public/company-assets/wayfinding-v1/'+d.id+'/v'+d.version;
  const modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json',texturePath=dir+'/texture.png';
  const resource={...base,id:d.id,version:d.version,displayName:d.displayName,productionBranch:'public-wayfinding-content',wayfindingMeaning:d.purpose,
    asset:{...base.asset,url:modelPath.slice('prototype/public'.length)},
    provenance:{...base.provenance,license:'Project-authored vector print and text; Noto Sans SC under SIL Open Font License 1.1',
      prompt:'Editable wayfinding print from signed vector artwork and text. Print size 0.88 × 0.56 m; model contains the full PNG.',
      sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,sourceDesign:d.purpose,title:d.title,subtitle:d.subtitle,sourceAuthor:d.author,
      artworkAuthor:d.iconPaths?d.author:record.author,sourceImage:texturePath,sourceImageSha256:sha(png),
      generator,generatorSha256:collection.generatorSha256,contentHelper:depPaths.renderer,contentHelperSha256:dependencies.renderer.sha256,
      meshGenerator:GENERATOR_PATH,meshGeneratorSha256:dependencies.meshGenerator.sha256,dependencies}};
  assert(compareFacilityFunction(base,resource).compatible,'Wayfinding print cannot replace ordinary information content');
  assert.deepEqual(resource.stateDefaults,{visible:true});assert.equal(resource.informationNodes.face,face.faceNode);
  files.set(modelPath,model);files.set(texturePath,png);files.set(resourcePath,json(resource));
  collection.resources.push({id:d.id,version:d.version,modelPath,resourcePath,texturePath,sha256:sha(model),textureSha256:sha(png),
    geometrySha256:face.geometrySha256,inspection:{...face,...raster[i].inspection}});
}
files.set(sourceDir+'/collection.json',json(collection));
const manifestTargets = await Promise.all([...files].map(async ([rel,bytes])=>({rel,bytes,target:await safe(dest??root,rel)})));
const missing = file => fs.lstat(file).then(()=>false).catch(e=>{if(e.code!=='ENOENT')throw e; return true;});
async function publish() {
  if(args.check) {
    for(const {bytes,target} of manifestTargets) assert(bytes.equals(await fs.readFile(target)),'Signed output differs: '+target);
    return;
  }
  await fs.mkdir(stage,{recursive:true});
  const lock = path.join(stage,'publication.lock');
  await fs.mkdir(lock);
  let spool;
  const own = [], dirs = [];
  try {
    if(dest) assert(await missing(dest),'Trial output already exists: '+dest);
    const pending = [];
    for(const item of manifestTargets) {
      if(await missing(item.target)) pending.push(item);
      else assert(item.bytes.equals(await fs.readFile(item.target)),'Refusing to replace signed output: '+item.target);
    }
    if(!pending.length) return;
    spool = await fs.mkdtemp(path.join(stage,'stage-'));
    const batch = path.join(spool,'batch');
    for(const {rel,bytes} of pending) {
      const target = await safe(batch,rel);
      await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes,{flag:'wx'});
    }
    async function mkdirs(parent, directory) {
      let cursor = parent;
      for(const part of path.relative(parent,directory).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor,part);
        try { await fs.mkdir(cursor); dirs.push(cursor); }
        catch(error) {
          if(error.code!=='EEXIST') throw error;
          assert((await fs.lstat(cursor)).isDirectory() && await fs.realpath(cursor)===cursor);
        }
      }
    }
    if(dest) {
      await mkdirs(project,path.dirname(dest)); await fs.rename(batch,dest);
    } else {
      for(const {rel,target} of pending) {
        await mkdirs(root,path.dirname(target));
        const source = path.join(batch,rel);
        await fs.link(source,target); own.push({source,target});
      }
    }
  } catch(error) {
    for(const {source,target} of own.reverse()) {
      const a = await fs.stat(source,{bigint:true}), b = await fs.lstat(target,{bigint:true});
      if(a.dev===b.dev && a.ino===b.ino) await fs.unlink(target);
    }
    for(const dir of dirs.reverse()) await fs.rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;});
    throw error;
  } finally {
    try {
      if(spool) {
        assert.equal(path.dirname(await fs.realpath(spool)),stage);
        await fs.rm(spool,{recursive:true});
      }
    } finally { await fs.rmdir(lock); }
  }
}
await publish();
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,textureSha256})=>({id,version,sha256,textureSha256}))}));
