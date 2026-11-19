import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {inspectGlassPartitionModel} from '../../prototype/src/company/glass-partition-geometry.js';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=await fs.realpath(path.resolve(import.meta.dirname,'../..')),sourceDir='assets-source/company-glass-partition-v1';
const generator='scripts/company-platform/build-glass-partition.mjs',checker='prototype/src/company/glass-partition-geometry.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),range=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
installNodeImageDecodeShim();
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},e=>this.onerror?.(e));}};
async function load(bytes){
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  scene.updateMatrixWorld(true);return scene;
}
function geometryDigest(scene){
  const digest=createHash('sha256'),p=v(),b=Buffer.alloc(12);
  scene.traverseVisible(m=>{
    if(!m.isMesh)return;
    const g=m.geometry,ix=g.index,n=ix?.count??g.attributes.position.count;
    for(let i=0;i<n;i++){
      m.getVertexPosition(ix?ix.getX(i):i,p).applyMatrix4(m.matrixWorld);
      b.writeFloatLE(p.x,0);b.writeFloatLE(p.y,4);b.writeFloatLE(p.z,8);digest.update(b);
    }
  });
  return digest.digest('hex');
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
  console.log('build-glass-partition.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/glass-partition-v1/production';
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
const defaults=sourceDir+'/parameters.json',input=args.parameters??defaults,contractPath=sourceDir+'/contract.json',recordPath=sourceDir+'/original/sources.json';
assert(input.endsWith('.json'));
const raw=await read(input),recipe=JSON.parse(raw),base=JSON.parse(await read(defaults));
const {resource:stamp,geometry:g}=JSON.parse(await read(contractPath)),sources=JSON.parse(await read(recordPath));
assert.deepEqual(Object.keys(recipe).sort(),['designs','schema','version']);
assert(recipe.schema==='company-glass-partition-collection'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length>=1&&recipe.designs.length<=40);

const deps={generator:await pin(generator),geometryChecker:await pin(checker),contract:await pin(contractPath),sourceRecord:await pin(recordPath),license:await pin(sources.licensePath)};
for(const key of ['windowDonor','screenDonor','kenneyLicense']){
  deps[key]=await pin(sources[key].path);
  assert.equal(deps[key].sha256,sources[key].sha256,'Original input differs: '+key);
}
const donor=await load(await read(deps.screenDonor.path));
const leaf=donor.getObjectByName('glass-pane-1'),metal=donor.getObjectByName('glass-ground-rail').material,gasket=donor.getObjectByName('glass-gaskets').material;
const header=bytes=>JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const original=header(await read(deps.windowDonor.path)).materials.find(m=>m.name==='glass');
assert.equal(original.alphaMode,'BLEND');
function glassFor(kind,upper){
  const pbr=original.pbrMetallicRoughness;
  const material=new T.MeshStandardMaterial({name:original.name,color:new T.Color().fromArray(pbr.baseColorFactor),
    emissive:new T.Color().fromArray(original.emissiveFactor),metalness:pbr.metallicFactor,roughness:pbr.roughnessFactor,transparent:true,opacity:pbr.baseColorFactor[3],depthWrite:false});
  if(kind==='clear')return material;
  const settings=kind==='frosted'?['etched-glass','#dae6e3',.74,.91]:
    kind==='framed'?['neutral-glazing','#c1dbdf',.30,.20]:
    upper?['smoke-teal','#85b9ac',.42,.23]:['deep-teal','#36877d',.54,.29];
  const [name,color,opacity,roughness]=settings;
  material.name=name;material.color.set(color);material.emissive.setRGB(0,0,0);material.metalness=.04;
  material.opacity=opacity;material.roughness=roughness;return material;
}
function build(d){
  const scene=new T.Group();scene.name=d.id;
  function add(name,role,geometry,material){
    const node=new T.Mesh(geometry,material);node.name=name;node.userData.glazingRole=role;scene.add(node);return node;
  }
  function box(name,role,material,sizes,center){
    const node=add(name,role,new T.BoxGeometry(...sizes),material);node.position.fromArray(center);return node;
  }
  const {width,height,depth}=stamp.mounting;
  const {facePlateM:plate,channelDepthM:channel,channelHeightM:lipHeight,lipM:lip,paneM:thickness}=g;
  // Actual broad cover/anchor web and narrow glazed channel share the bearing plane.
  for(const [end,y,sign] of [['base',0,1],['head',height,-1]]){
    box(end+'-web','rail',metal,[width,plate,depth],[0,y+sign*plate/2,0]);
    const height=lipHeight-plate,seal=(channel-2*lip-thickness)/2;
    for(const side of [-1,1]){
      box(end+'-lip-'+side,'rail',metal,[width,height,lip],[0,y+sign*(plate+height/2),side*(channel-lip)/2]);
      box(end+'-seal-'+side,'seal',gasket,[width,height,seal],[0,y+sign*(plate+height/2),side*(thickness+seal)/2]);
    }
  }
  const frame=d.kind==='framed'?metal.clone():metal;
  if(d.kind==='framed'){frame.name='graphite-anodized-frame';frame.color.set('#303942');}
  const rowY=[plate,...d.rowFractions.map(f=>plate+(height-2*plate)*f),height-plate];
  const bayX=Array.from({length:d.bays+1},(_,i)=>-width/2+width*i/d.bays);
  const frameDepth=.036,bw=d.barWidthM;
  for(let i=1;i<d.bays;i++){
    box('mullion-'+i,'frame',frame,[bw,height-2*plate,frameDepth],[bayX[i],height/2,0]);
  }
  const lower=glassFor(d.kind,false),upper=d.kind==='tinted'?glassFor(d.kind,true):lower;
  const source=leaf.geometry.clone().applyMatrix4(leaf.matrixWorld);source.computeBoundingBox();
  const centre=source.boundingBox.getCenter(v()),size=source.boundingBox.getSize(v());
  assert(Math.abs(size.z-thickness)<1e-6);source.translate(-centre.x,-centre.y,-centre.z);
  for(let col=0;col<d.bays;col++){
    const x0=bayX[col]+(col?bw/2:0),x1=bayX[col+1]-(col+1<d.bays?bw/2:0);
    for(let r=1;r<rowY.length-1;r++){
      box('transom-c'+(col+1)+'-r'+r,'frame',frame,[x1-x0,bw,frameDepth],[(x1+x0)/2,rowY[r],0]);
    }
    for(let row=0;row<rowY.length-1;row++){
      const y0=rowY[row]+(row?bw/2:0),y1=rowY[row+1]-(row+2<rowY.length?bw/2:0);
      const part=source.clone().scale((x1-x0)/size.x,(y1-y0)/size.y,1);
      part.translate((x1+x0)/2,(y1+y0)/2,0);
      add('pane-c'+(col+1)+'-r'+(row+1),d.kind==='frosted'?'privacy':'pane',part,row?upper:lower);
    }
  }
  return scene;
}
const collection={schemaVersion:1,id:'company-glass-partition-v1',sourceParameters:input,sourceParametersSha256:sha(raw),generator,generatorSha256:deps.generator.sha256,
  contract:contractPath,contractSha256:deps.contract.sha256,resources:[]};
const seen=new Set(),files=new Map();
for(const d of recipe.designs){
  assert.deepEqual(Object.keys(d).sort(),['id','version','kind','displayName','bays','rowFractions','barWidthM'].sort());
  assert(['clear','frosted','tinted','framed'].includes(d.kind),'Unknown glazing construction');
  assert(/^[a-z][a-z0-9-]{1,62}$/.test(d.id)&&Number.isSafeInteger(d.version)&&d.version>0&&typeof d.displayName==='string'&&d.displayName.trim().length&&d.displayName.length<=120);
  assert(Number.isInteger(d.bays)&&range(d.bays,1,5)&&Array.isArray(d.rowFractions)&&d.rowFractions.length<=4&&range(d.barWidthM,.018,.065));
  assert(d.rowFractions.every((x,i)=>range(x,.1,.9)&&(!i||x-d.rowFractions[i-1]>=.10)),'Each transom requires a usable bay');
  assert(d.kind!=='tinted'||d.rowFractions.length>0,'Two-tone construction requires a glazed transom.');
  const identity=d.id+'@'+d.version;assert(!seen.has(identity),'Duplicate '+identity);seen.add(identity);
  const signed=base.designs.find(x=>x.id===d.id&&x.version===d.version);if(args.parameters&&signed)assert.deepEqual(d,signed,'Use a new version or ID when changing the signed design.');
  const model=Buffer.from(await new GLTFExporter().parseAsync(build(d),{binary:true}));
  if(d.kind==='clear')assert.deepEqual(header(model).materials.find(m=>m.name==='glass'),original,'Kenney PBR values differ');
  const dir='prototype/public/company-assets/glass-partition-v1/'+d.id+'/v'+d.version,modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json';
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:sha(model),bytes:model.length};
  const provenance={sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:deps.generator.sha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:deps.contract.sha256,dependencies:deps,sourceDesign:d.kind,sourceAuthor:sources.author,
    sourceLicense:'Kenney CC0-1.0 and project-authored',license:'Kenney CC0-1.0 and project-authored',
    method:'Solid 12 mm signed donor pane geometry seated in project-made channel and grid members. Original Kenney glass PBR or recipe-specific roughness, tint and opacity.'};
  const resource={id:d.id,version:d.version,displayName:d.displayName,...stamp,glassPartition:{construction:d.kind,configuration:'static'},provenance,asset};
  const actual=await load(model),inspection=inspectGlassPartitionModel(actual,resource,T,(code,id,message)=>{throw Error(code+' at '+id+': '+message);});
  assert.equal(inspection.panes,d.bays*(1+d.rowFractions.length));
  const geometrySha256=geometryDigest(actual);
  files.set(modelPath,model);files.set(resourcePath,json(resource));
  collection.resources.push({id:d.id,version:d.version,modelPath,resourcePath,sha256:asset.sha256,geometrySha256,inspection});
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
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,inspection})=>({id,version,sha256,triangles:inspection.triangles,bounds:inspection.bounds}))}));
