import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const sourceDir='assets-source/company-movable-absorber-v1', generator='scripts/company-platform/build-movable-absorber.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), rounded=n=>Number(n.toFixed(6))||0;
const size=o=>new T.Box3().setFromObject(o,true);
const close=(a,b)=>assert(Math.abs(a-b)<1e-5,JSON.stringify({actual:a,expected:b}));
const within=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
installNodeImageDecodeShim();
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}).catch(e=>this.onerror?.(e));}};
async function load(bytes){
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);return scene;
}
function finish(name,color,metalness=0){
  const mat=new T.MeshStandardMaterial({color,metalness,roughness:metalness?.47:.92});mat.name=name;return mat;
}
function mesh(parent,name,geometry,material){
  const obj=new T.Mesh(geometry,material);obj.name=name;parent.add(obj);return obj;
}
function box(parent,name,w,h,d,x,y,z,mat){
  const obj=mesh(parent,name,new T.BoxGeometry(w,h,d),mat);obj.position.set(x,y,z);return obj;
}
function cylinder(parent,name,r,h,x,y,z,mat){
  const obj=mesh(parent,name,new T.CylinderGeometry(r,r,h,20),mat);obj.position.set(x,y,z);return obj;
}
function duplicateMesh(parent,source,name,mat){
  assert(source?.isMesh,'Missing donor mesh '+name);
  return mesh(parent,name,source.geometry.clone().applyMatrix4(source.matrixWorld),mat??source.material);
}
function feet(group,donor,spacing=.80){
  const base=donor.getObjectByName('information-base');
  for(const sign of [-1,1]){
    const foot=duplicateMesh(group,base,'steel-foot-'+(sign<0?'left':'right'));foot.position.x=sign*spacing/2;
    // GLTFExporter preserves userData.name; use the identity of the assembled component.
    foot.userData.name=foot.name;
  }
}
function widthTo(panel,width){
  panel.updateMatrixWorld(true);
  const b=size(panel);panel.scale.x*=width/(b.max.x-b.min.x);panel.position.x=-((b.max.x+b.min.x)/2)*panel.scale.x;
}
function doubleSided(group,d,donors){
  feet(group,donors.footDonor,d.footSpacingM);
  const panel=donors.panelDonor.clone(true),bounds=size(panel),spans=bounds.getSize(v());
  panel.name='two-sided-tiled-panel';panel.scale.set(1.2/spans.x,1.74/spans.y,.12/spans.z);
  panel.position.y=.06-bounds.min.y*panel.scale.y;group.add(panel);
}
function folding(group,d,donors,mats){
  feet(group,donors.footDonor);
  const assembly=new T.Group();assembly.name='folded-frame';group.add(assembly);
  const angle=d.foldDegrees*Math.PI/180,step=1.2/d.leaves,offset=step*Math.tan(angle);
  const points=Array.from({length:d.leaves+1},(_,i)=>v(-.6+i*step,0,(i%2?1:-1)*offset/2));
  for(let i=0;i<d.leaves;i++){
    const a=points[i],b=points[i+1],mid=a.clone().lerp(b,.5),length=a.distanceTo(b)-.010;
    const leaf=new T.Group();leaf.name='leaf-assembly-'+(i+1);leaf.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
    leaf.position.copy(mid);assembly.add(leaf);
    box(leaf,'folding-leaf-'+(i+1),length,1.74,.054,0,.93,0,mats[0]);
    for(const side of [-1,1]){
      box(leaf,'leaf-cloth-'+(i+1)+'-'+(side<0?'rear':'front'),length-.034,1.697,.019,0,.93,side*.035,mats[1+i%2]);
    }
    if(i){
      for(const [j,y] of [.23,.93,1.62].entries())
        cylinder(assembly,'hinge-'+i+'-'+(j+1),.022,.102,a.x,y,a.z,mats[3]);
    }
  }
  widthTo(assembly,1.2);
}
function wheelSet(group,source,x,z,label,tyre,steel){
  // Selected front-right Innerscene caster, dimensions and axle direction preserved.
  const components=[
    ['Rubber_caster_wheel002','wheel-',tyre],['Caster_wheel_hub004','hub-out-',steel],
    ['Caster_wheel_hub005','hub-in-',steel],['Caster_fork004','fork-out-',steel],
    ['Caster_fork005','fork-in-',steel],['Caster_swivel_bearing002','bearing-',steel]
  ];
  const dx=x-.19,dz=z-.20;
  for(const [sourceName,prefix,material] of components){
    const obj=duplicateMesh(group,source.getObjectByName(sourceName),prefix+label,material);obj.position.set(dx,0,dz);
  }
  // Plate bridges the two original fork cheeks; the kingpin enters both bridge and swivel bearing.
  box(group,'fork-bridge-'+label,.021,.008,.035,x,.096,z,steel);
  cylinder(group,'kingpin-'+label,.009,.044,x,.118,z,steel);
}
function casters(group,d,donors,mats){
  const tyre=finish('Caster tread','#303339'),steel=mats[3],top=.175;
  for(const s of [-1,1]){
    const x=s*.40,side=s<0?'left':'right';
    for(const t of [-1,1])wheelSet(group,donors.casterDonor,x,t*.158,side+'-'+(t<0?'rear':'front'),tyre,steel);
    // Top of donor bearing is 0.1425 m; solid carrier overlaps it by 0.5 mm.
    box(group,'caster-carrier-'+side,.080,top-.142,.38,x,(top+.142)/2,0,steel);
  }
  box(group,'caster-core',1.2,1.8-top,.080,0,(1.8+top)/2,0,mats[0]);
  const pitch=(1.8-top-.070)/d.bands;
  for(const s of [-1,1])for(let i=0;i<d.bands;i++){
    box(group,'caster-cloth-'+(s>0?'front':'rear')+'-'+(i+1),1.144,pitch-.014,.022,
      0,top+.035+(i+.5)*pitch,s*.049,mats[1+i%2]);
  }
}
function curved(group,d,donors,mats){
  feet(group,donors.footDonor);
  const shell=new T.Group();shell.name='curved-panel';group.add(shell);
  const half=.60,radius=(half*half+d.sagM*d.sagM)/(2*d.sagM),endAngle=Math.asin(half/radius);
  // Bend each signed solid in a circular plan; both face normals rotate with the tangent, including the open arcs at the ends.
  function curvedSolid(name,lo,hi,yLow,yHigh,back,front,segments,material){
    const geo=new T.BoxGeometry(hi-lo,yHigh-yLow,front-back,segments,1,1);
    const attr=geo.attributes.position;
    for(let i=0;i<attr.count;i++){
      const theta=(attr.getX(i)+(lo+hi)/2)/half*endAngle;
      const r=radius+attr.getZ(i)+(front+back)/2;
      attr.setXYZ(i,r*Math.sin(theta),attr.getY(i)+(yLow+yHigh)/2,r*Math.cos(theta)-radius+d.sagM/2);
    }
    geo.computeVertexNormals();mesh(shell,name,geo,material);
  }
  curvedSolid('curved-core',-half,half,.06,1.80,-.031,.031,48,mats[0]);
  const step=1.15/d.ribs;
  for(let i=0;i<d.ribs;i++)for(const side of [-1,1]){
    const lo=-.575+i*step+.003,hi=lo+step-.006;
    curvedSolid('curved-rib-'+(side>0?'front':'rear')+'-'+(i+1),lo,hi,.078,1.781,side>0?.029:-.046,side>0?.046:-.029,5,mats[1+i%2]);
  }
  widthTo(shell,1.2);
}
function inspect(scene){
  const bounds=size(scene),meshes=[],digest=createHash('sha256');let triangles=0;
  scene.traverse(obj=>{
    if(!obj.isMesh)return;
    meshes.push(obj);const geometry=obj.geometry,attr=geometry.attributes.position,ix=geometry.index;
    triangles+=(ix?ix.count:attr.count)/3;
    for(let i=0;i<(ix?ix.count:attr.count);i++){
      const p=v().fromBufferAttribute(attr,ix?ix.getX(i):i).applyMatrix4(obj.matrixWorld);
      const b=Buffer.allocUnsafe(12);[p.x,p.y,p.z].forEach((x,k)=>b.writeFloatLE(x,4*k));digest.update(b);
    }
  });
  const dimensions=bounds.getSize(v()).toArray().map(rounded);assert.deepEqual(dimensions,[1.2,1.8,.38]);
  close(bounds.min.y,0);close(bounds.min.x,-.6);close(bounds.min.z,-.19);
  const faces=[];
  // Even-leaf designs have an actual hinge seam at x=0. Measure the central
  // face of every leaf instead of sampling the side of a seam as upholstery.
  const leaves=meshes.filter(m=>m.name.startsWith('folding-leaf-'));
  const sampleX=leaves.length?leaves.map(m=>size(m).getCenter(v()).x):[-.42,0,.42];
  for(const side of [-1,1])for(const x of sampleX){
    const cast=new T.Raycaster(v(x,1.0,side*.5),v(0,0,-side));
    const h=cast.intersectObjects(meshes,false)[0];assert(h,'Missing solid surface');assert(h.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(h.object.matrixWorld)).z*side>.5,'Missing facing surface');
    faces.push({side,x,part:h.object.name,z:rounded(h.point.z)});
  }
  const standing=meshes.filter(m=>size(m).min.y<.001).map(m=>m.name);
  assert(standing.length>=2,'Missing separate ground supports');
  return {geometrySha256:digest.digest('hex'),triangles,meshes:meshes.length,dimensions,groundParts:standing,faces};
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
  console.log('build-movable-absorber.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/movable-absorber-v1/production';
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
const recipeBytes=await read(input),recipe=JSON.parse(recipeBytes),signed=JSON.parse(await read(defaults));
const stamp=JSON.parse(await read(contractPath)).resource,sources=JSON.parse(await read(recordPath));
assert.deepEqual(Object.keys(recipe).sort(),['designs','schema','version']);
assert(recipe.schema==='company-movable-absorber-collection'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length>=1&&recipe.designs.length<=40);
const deps={generator:await pin(generator),contract:await pin(contractPath),sourceRecord:await pin(recordPath),license:await pin(sources.licensePath)};
for(const key of ['panelDonor','footDonor','casterDonor','casterLicense']){
  deps[key]=await pin(sources[key].path);assert.equal(deps[key].sha256,sources[key].sha256,'Archived source differs: '+key);
}
const donors={};
for(const key of ['panelDonor','footDonor','casterDonor'])donors[key]=await load(await read(deps[key].path));
const collection={schemaVersion:1,id:'company-movable-absorber-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:deps.generator.sha256,contract:contractPath,contractSha256:deps.contract.sha256,resources:[]};
const files=new Map(),seen=new Set();
const builders={folding,casters,'double-sided':doubleSided,curved};
for(const d of recipe.designs){
  const kind=d.kind,allowed={folding:['leaves','foldDegrees','colors'],casters:['bands','colors'],'double-sided':['footSpacingM'],curved:['sagM','ribs','colors']};
  assert(Object.hasOwn(builders,kind),'Unknown absorber construction '+kind);
  assert.deepEqual(Object.keys(d).sort(),['id','version','displayName','kind',...allowed[kind]].sort());
  assert(typeof d.id==='string'&&/^[a-z][a-z0-9-]{1,62}$/.test(d.id)&&Number.isSafeInteger(d.version)&&d.version>=1);
  assert(typeof d.displayName==='string'&&d.displayName.trim().length>0&&d.displayName.length<=120);
  const identity=d.id+'@'+d.version;assert(!seen.has(identity),'Duplicate resource '+identity);seen.add(identity);
  const stock=signed.designs.find(s=>s.id===d.id&&s.version===d.version);
  if(args.parameters && stock)assert.deepEqual(d,stock,'Edit a signed design under a new version or ID.');
  if(kind==='folding')assert(Number.isInteger(d.leaves)&&within(d.leaves,3,5)&&within(d.foldDegrees,9,23));
  if(kind==='casters')assert(Number.isInteger(d.bands)&&within(d.bands,2,6));
  if(kind==='double-sided')assert(within(d.footSpacingM,.62,.92));
  if(kind==='curved')assert(within(d.sagM,.10,.21)&&Number.isInteger(d.ribs)&&within(d.ribs,5,15));
  const mats=[];
  if(kind!=='double-sided'){
    assert(Array.isArray(d.colors)&&d.colors.length===3&&d.colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
    mats.push(...d.colors.map((c,i)=>finish(['perimeter','cloth-a','cloth-b'][i],c)),finish('Steel fittings','#58626A',.72));
  }
  const group=new T.Group();group.name=d.id;
  builders[kind](group,d,donors,mats);
  const model=Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true}));
  const inspection=inspect(await load(model));
  const dir='prototype/public/company-assets/movable-absorber-v1/'+d.id+'/v'+d.version;
  const modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json';
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:sha(model),bytes:model.length};
  const license=kind==='casters'?'Project-authored and Innerscene CC0-1.0 caster components':'Project-authored';
  const provenance={sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:deps.generator.sha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:deps.contract.sha256,dependencies:deps,sourceDesign:kind,sourceAuthor:sources.author,
    sourceLicense:license,license,method:'Adapt signed source meshes and construct a fixed deployed '+kind+' screen with measured installed footprint.'};
  const resource={id:d.id,version:d.version,displayName:d.displayName,...stamp,acoustic:{purpose:'movable-absorber-screen',construction:kind,configuration:'fixed-deployed'},provenance,asset};
  files.set(modelPath,model); files.set(resourcePath,json(resource));
  collection.resources.push({id:d.id,version:d.version,modelPath,resourcePath,sha256:asset.sha256,geometrySha256:inspection.geometrySha256,inspection});
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
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,inspection})=>({id,version,sha256,triangles:inspection.triangles,dimensions:inspection.dimensions}))}));
