import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {inspectCornerAbsorberModel} from '../../prototype/src/company/corner-absorber-geometry.js';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=await fs.realpath(path.resolve(import.meta.dirname,'../..')),sourceDir='assets-source/company-corner-absorber-v1';
const generator='scripts/company-platform/build-corner-absorber.mjs',checker='prototype/src/company/corner-absorber-geometry.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),range=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
installNodeImageDecodeShim();
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},e=>this.onerror?.(e));}};
async function load(bytes){
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  scene.updateMatrixWorld(true);return scene;
}
function group(parent,name){const g=new T.Group();g.name=name;parent.add(g);return g;}
function mesh(parent,name,geo,mat){const m=new T.Mesh(geo,mat);m.name=name;parent.add(m);return m;}
function plain(name,color){const m=new T.MeshStandardMaterial({color,roughness:.93});m.name=name;return m;}
function cabinet(parent,name,points,low,high,material){
  // XZ vertices go counterclockwise viewed in a diagram with increasing Z upwards.
  const pos=[],uv=[];
  function tri(a,b,c){
    pos.push(...a,...b,...c);
    for(const p of [a,b,c])uv.push((p[0]-p[2])/.11,p[1]/.11);
  }
  const p=(i,y)=>[points[i][0],y,points[i][1]],n=points.length;
  for(let i=1;i<n-1;i++){tri(p(0,low),p(i,low),p(i+1,low));tri(p(i+1,high),p(i,high),p(0,high));}
  for(let i=0;i<n;i++){
    const j=(i+1)%n;tri(p(i,low),p(i,high),p(j,low));tri(p(i,high),p(j,high),p(j,low));
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
  return mesh(parent,name,geo,material);
}
function brackets(parent,donor,g){
  const parts=['side-bracket-wall-rail-left','side-bracket-arm-lower-left','side-bracket-brace-lower-left'];
  const [sx,sy,sz]=g.supportScale;
  for(const wall of ['z','x'])for(const [i,name] of parts.entries()){
    const src=donor.getObjectByName(name);assert(src?.isMesh,'Missing structural donor part '+name);
    const geo=src.geometry.clone().applyMatrix4(src.matrixWorld);
    geo.translate(.46,0,0).scale(sx,i===0?g.railHeightM/1.8:sy,sz).translate(g.supportAlongWallM,i===0?0:g.shelfTopM-.315*sy,0);
    if(wall==='x')geo.rotateY(Math.PI/2).translate(0,0,2*g.supportAlongWallM);
    mesh(parent,wall+'-'+['rail','arm','brace'][i],geo,src.material.clone());
  }
}
function wedge(body,d,m,g,donor,textured){
  const back=g.rearClearanceM,x=m.width,z=m.depth,bottom=g.shelfTopM,high=m.height;
  cabinet(body,'triangular-core',[[back,back],[x,back],[back,z]],bottom,high,plain('corner-core','#69605A'));
  donor.traverse(src=>{
    if(!src.isMesh)return;
    const geo=src.geometry.clone().applyMatrix4(src.matrixWorld);
    geo.scale(d.facingWidthM/.60,(high-bottom)/1.20,d.reliefM/.08).rotateY(Math.PI/4).translate((x+back)/2,(high+bottom)/2,(z+back)/2);
    const mat=src.material.clone();assert(mat.map&&geo.attributes.uv);mat.map=null;
    textured.add(mat.name);mesh(body,src.name,geo,mat);
  });
}
function column(body,d,m,g,textured){
  const radius=.16,centre=m.width-radius,cap=.035,upper=m.height-cap,lower=g.shelfTopM+cap;
  const cover=plain('woven-column',d.color),rim=plain('pressed-edge','#535D5B');textured.add(cover.name);
  for(const [id,y] of [['lower',g.shelfTopM+cap/2],['upper',m.height-cap/2]]){
    mesh(body,'column-'+id+'-cap',new T.CylinderGeometry(radius,radius,cap,64).translate(centre,y,centre),rim);
  }
  const r=radius-.002;
  const geo=new T.CylinderGeometry(r,r,upper-lower,d.flutes*8,1);
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),theta=Math.atan2(x,z);
    const scale=1-d.fluteDepthM*(1-Math.cos(theta*d.flutes))/(2*r);
    p.setXYZ(i,x*scale+centre,p.getY(i)+(lower+upper)/2,z*scale+centre);
  }
  geo.computeVertexNormals();mesh(body,'column-core',geo,cover);
}
function segmented(body,d,m,g,textured){
  const back=g.rearClearanceM,low=g.shelfTopM,span=m.height-low;
  // The inset rectangular spine runs through the gaps and through each solid module.
  cabinet(body,'segmented-spine',[[.07,.07],[.15,.07],[.15,.15],[.07,.15]],low,m.height,plain('inner-spine','#564D46'));
  const mats=d.colors.map((c,i)=>plain('woven-tier-'+i,c));for(const mat of mats)textured.add(mat.name);
  const height=(span-(d.tiers-1)*d.jointM)/d.tiers;
  for(let i=0;i<d.tiers;i++){
    const tip=m.width-(i%2)*.019,y=low+i*(height+d.jointM);
    cabinet(body,'segmented-tier-'+(i+1),[[back,back],[tip,back],[back,tip]],y,y+height,mats[i%2]);
  }
}
function unpack(bytes){
  const end=20+bytes.readUInt32LE(12);return {document:JSON.parse(bytes.subarray(20,end)),binary:bytes.subarray(end+8)};
}
function pack(j,binary){
  const pad=(b,c)=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4,c)]);
  const js=pad(Buffer.from(JSON.stringify(j)),32),bin=pad(binary,0),out=Buffer.alloc(28+js.length+bin.length);
  for(const [offset,value] of [[0,0x46546c67],[4,2],[8,out.length],[12,js.length],[16,0x4e4f534a],[20+js.length,bin.length],[24+js.length,0x4e4942]])out.writeUInt32LE(value,offset);
  js.copy(out,20);bin.copy(out,28+js.length);return out;
}
// Preserve the original immutable PNG and UVs; the exporter does not need a DOM canvas.
function withGrain(bytes,donor,textured){
  const {document:src,binary:source}=unpack(donor),{document:j,binary}=unpack(bytes);
  assert.equal(src.images.length,1);const im=src.images[0],view=src.bufferViews[im.bufferView];assert.equal(im.mimeType,'image/png');
  const png=source.subarray(view.byteOffset,view.byteOffset+view.byteLength);
  const ix=j.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:png.length})-1;
  j.images=[{...im,bufferView:ix}];j.samplers=src.samplers;j.textures=src.textures;
  for(const mat of j.materials)if(textured.has(mat.name))mat.pbrMetallicRoughness.baseColorTexture={index:0};
  j.buffers[0].byteLength=binary.length+png.length;return pack(j,Buffer.concat([binary,png]));
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
  console.log('build-corner-absorber.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/corner-absorber-v1/production';
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
assert(recipe.schema==='company-corner-absorber-collection'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length>=1&&recipe.designs.length<=40);
const deps={generator:await pin(generator),geometryChecker:await pin(checker),contract:await pin(contractPath),sourceRecord:await pin(recordPath),license:await pin(sources.licensePath)};
const donors={};
for(const key of ['bracketDonor','fabricDonor','feltDonor']){
  deps[key]=await pin(sources[key].path);assert.equal(deps[key].sha256,sources[key].sha256,'Donor differs '+key);
  const bytes=await read(deps[key].path);donors[key]={bytes,scene:await load(bytes)};
}
const collection={schemaVersion:1,id:'company-corner-absorber-v1',sourceParameters:input,sourceParametersSha256:sha(raw),generator,generatorSha256:deps.generator.sha256,
  contract:contractPath,contractSha256:deps.contract.sha256,resources:[]};
const seen=new Set(),files=new Map(),allowed={triangular:['facingWidthM','reliefM'],upholstered:['facingWidthM','reliefM'],column:['flutes','fluteDepthM','color'],segmented:['tiers','jointM','colors']};
for(const d of recipe.designs){
  assert(Object.hasOwn(allowed,d.kind),'Unknown corner construction.');
  assert.deepEqual(Object.keys(d).sort(),['id','kind','displayName','version',...allowed[d.kind]].sort());
  assert(/^[a-z][a-z0-9-]{1,62}$/.test(d.id)&&Number.isSafeInteger(d.version)&&d.version>0&&typeof d.displayName==='string'&&d.displayName.trim().length&&d.displayName.length<=120);
  const identity=d.id+'@'+d.version;assert(!seen.has(identity),'Duplicate '+identity);seen.add(identity);
  const signed=base.designs.find(x=>x.id===d.id&&x.version===d.version);if(args.parameters&&signed)assert.deepEqual(d,signed,'Use a new version or ID when changing the signed design.');
  const validColor=c=>typeof c==='string'&&/^#[a-f0-9]{6}$/i.test(c);
  if(d.kind==='segmented')assert(Number.isInteger(d.tiers)&&range(d.tiers,3,7)&&range(d.jointM,.015,.065)&&d.colors?.length===2&&d.colors.every(validColor));
  else if(d.kind==='column')assert(Number.isInteger(d.flutes)&&range(d.flutes,8,20)&&range(d.fluteDepthM,.002,.010)&&validColor(d.color));
  else assert(range(d.facingWidthM,.35,.412)&&range(d.reliefM,.012,.022));
  const scene=new T.Group();scene.name=d.id;
  brackets(group(scene,'hardware'),donors.bracketDonor.scene,g);
  const body=group(scene,'body'),textured=new Set(),grain=d.kind==='triangular'?donors.feltDonor:donors.fabricDonor;
  if(d.kind==='column')column(body,d,stamp.mounting,g,textured);
  else if(d.kind==='segmented')segmented(body,d,stamp.mounting,g,textured);
  else wedge(body,d,stamp.mounting,g,grain.scene,textured);
  const model=withGrain(Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true})),grain.bytes,textured);
  const dir='prototype/public/company-assets/corner-absorber-v1/'+d.id+'/v'+d.version,modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json';
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:sha(model),bytes:model.length};
  const provenance={sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:deps.generator.sha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:deps.contract.sha256,dependencies:deps,sourceDesign:d.kind,sourceAuthor:sources.author,
    sourceLicense:'Project-authored',license:'Project-authored',method:'Two signed wall bracket assemblies supporting a separate solid '+d.kind+' corner body with original embedded surface texture.'};
  const resource={id:d.id,version:d.version,displayName:d.displayName,...stamp,acoustic:{purpose:'corner-absorber',construction:d.kind,configuration:'static'},provenance,asset};
  const actual=await load(model),inspection=inspectCornerAbsorberModel(actual,resource,T,(code,id,message)=>{throw Error(code+' at '+id+': '+message);});
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
