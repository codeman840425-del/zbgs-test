import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {checkManagedOutput} from './package-company.mjs';

const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const family='cleaning-loads-v1',sourceDir='assets-source/company-'+family;
const generator='scripts/company-platform/build-cleaning-loads.mjs';
const sha=data=>createHash('sha256').update(data).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const round=n=>Number(n.toFixed(7));
const vector=p=>p.toArray().map(round);
const loader=new GLTFLoader();
globalThis.FileReader??=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();},error=>this.onerror?.(error));}
};
async function parse(bytes){
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);return scene;
}
const materials={};
for(const [name,color] of Object.entries({polymer:0x48796f,grip:0x314b48,tray:0x8e7260,linen:0xe1d5b6,linenBlue:0x76939d})){
  materials[name]=new T.MeshStandardMaterial({color,roughness:.88});materials[name].name=name;
}
function part(group,name,width,height,depth,x,y,z,finish,corner){
  const geo=corner?new RoundedBoxGeometry(width,height,depth,2,corner):new T.BoxGeometry(width,height,depth);
  const mesh=new T.Mesh(geo,materials[finish]);mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);return mesh;
}
function makeTray(group,{width,depth,floor,lip,wall,finish}){
  part(group,'tray-floor',width,floor,depth,0,floor/2,0,finish);
  const sideY=floor+(lip-floor)/2;
  for(const side of [-1,1]){
    part(group,'tray-end-'+(side<0?'left':'right'),wall,lip-floor,depth-2*wall,side*(width-wall)/2,sideY,0,finish);
    part(group,'tray-edge-'+(side<0?'back':'front'),width,lip-floor,wall,0,sideY,side*(depth-wall)/2,finish);
  }
}
function makeCaddy(design){
  const g=new T.Group(),h=design.handleTopMetres;
  makeTray(g,{width:.34,depth:.21,floor:.016,lip:.12,wall:.012,finish:'polymer'});
  part(g,'bin-divider',.316,.085,.014,0,.0585,0,'polymer');
  for(const side of [-1,1]){
    const bottom=.12,top=h-.012;
    part(g,'grip-riser-'+(side<0?'left':'right'),.012,top-bottom,.03,side*.164,(bottom+top)/2,0,'grip');
  }
  part(g,'carry-grip',.34,.02,.03,0,h-.01,0,'grip',.003);
  return g;
}
function makeLinen(design){
  const g=new T.Group(),floor=.014;
  makeTray(g,{width:.356,depth:.214,floor,lip:.060,wall:.009,finish:'tray'});
  part(g,'linen-divider',.010,.081,.196,0,floor+.0405,0,'tray');
  for(const side of [-1,1]){
    const x=side*.086;
    for(let i=0;i<design.foldPairs;i++){
      const y=floor+i*.029;
      part(g,'fold-'+(side<0?'left':'right')+'-'+i+'-under',.144,.017,.164,x,y+.0085,0,'linen',.006);
      part(g,'fold-'+(side<0?'left':'right')+'-'+i+'-over',.134,.012,.159,x+side*.003,y+.023,.0015,side<0?'linen':'linenBlue',.004);
    }
  }
  return g;
}
const originalKeys={'open-carton':'cardboardBoxOpen','sealed-carton':'cardboardBoxClosed'};
function checkDesign(d){
  assert(['caddy','open-carton','sealed-carton','linen-tray'].includes(d.kind) && /^cleaning-load-[a-z][a-z0-9-]{0,48}$/.test(d.id));
  assert(Number.isSafeInteger(d.version)&&d.version>0&&typeof d.displayName==='string'&&d.displayName.trim());
  const field=originalKeys[d.kind]?'sourceScale':d.kind==='caddy'?'handleTopMetres':'foldPairs';
  assert.deepEqual(Object.keys(d).sort(),['id','kind','version','displayName',field].sort());
  const n=d[field];
  const valid=d.kind==='caddy'?Number.isFinite(n)&&n>=.24&&n<=.298:
    d.kind==='linen-tray'?Number.isInteger(n)&&n>=1&&n<=4:Number.isFinite(n)&&n>=.9&&n<=1;
  assert(valid,'Unsupported design measurement: '+field);
}
async function originalCarton(d,original){
  const bytes=await read(original.path);assert.equal(sha(bytes),original.sha256);assert.equal(bytes.length,original.bytes);
  const source=await parse(bytes),bounds=new T.Box3().setFromObject(source,true),center=bounds.getCenter(v());
  const group=new T.Group();source.position.set(-center.x,-bounds.min.y,-center.z).multiplyScalar(d.sourceScale);
  source.scale.setScalar(d.sourceScale);group.add(source);return group;
}
function inspect(scene,d,mounting){
  const bounds=new T.Box3().setFromObject(scene,true),meshes=[],probes=[],geometryHash=createHash('sha256');
  let triangles=0;
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geo=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),surface=new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide}));
    surface.name=mesh.userData.name||mesh.name;meshes.push(surface);
    const positions=geo.getAttribute('position'),count=geo.index?.count??positions.count;
    assert(count>0 && count%3===0);triangles+=count/3;
    const coords=Buffer.alloc(count*12);
    for(let i=0;i<count;i++){
      const vertex=v().fromBufferAttribute(positions,geo.index?geo.index.getX(i):i);
      for(const [j,n]of vertex.toArray().entries()){assert(Number.isFinite(n));coords.writeInt32LE(Math.round(n*1e6),i*12+j*4);}
    }
    geometryHash.update(coords);
  });
  assert(triangles>0&&Math.abs(bounds.min.y)<1e-5);
  assert(bounds.min.x>=-mounting.width/2-1e-6 && bounds.max.x<=mounting.width/2+1e-6);
  assert(bounds.min.z>=-mounting.depth/2-1e-6 && bounds.max.z<=mounting.depth/2+1e-6 && bounds.max.y<=mounting.height+1e-6);
  const hit=(x,y,z,dir,target=meshes)=>new T.Raycaster(v(x,y,z),dir,0,.7).intersectObjects(target,false)[0];
  const up=v(0,1,0),down=v(0,-1,0);
  for(const x of [-.06,0,.06])for(const z of [-.045,0,.045]){
    const h=hit(x,-.02,z,up);assert(h&&Math.abs(h.point.y)<1e-5,'Missing physical bottom support');probes.push(vector(h.point));
  }
  const details={};
  if(d.kind==='caddy'){
    const grip=hit(0,.36,0,down),under=hit(0,.14,0,up);
    assert(grip?.object.name==='carry-grip'&&Math.abs(grip.point.y-d.handleTopMetres)<1e-5);
    assert(under?.object.name==='carry-grip'&&under.point.y>.21);details.handle=[vector(under.point),vector(grip.point)];
    for(const x of [-.164,.164]){
      const riser=hit(x,.13,0,down,meshes.filter(m=>m.name.startsWith('tray-end')));
      assert(riser && Math.abs(riser.point.y-.12)<1e-5);
      const upper=hit(x,.13,0,up,meshes.filter(m=>m.name.startsWith('grip-riser')));
      assert(upper && upper.point.y>=under.point.y,'Grip is detached from riser');
    }
    details.openCompartments=[-.047,.047].map(z=>{const h=hit(.045,.36,z,down);assert(h?.object.name==='tray-floor');return vector(h.point);});
  }else if(d.kind==='linen-tray'){
    details.accessibleFolds=[-.086,.086].map(x=>{const h=hit(x,.36,0,down);
      assert(h?.object.name.endsWith((d.foldPairs-1)+'-over'));assert(Math.abs(h.point.y-(.014+.029*d.foldPairs))<1e-5);return vector(h.point);});
    const h=hit(0,.36,0,down);assert(h?.object.name==='linen-divider');details.divider=vector(h.point);
  }else{
    const samples=[];for(const x of [-.035,0,.035])for(const z of [-.04,0,.04]){
      const h=hit(x,.36,z,down);assert(h,'Carton face missing');samples.push(round(h.point.y));
    }
    if(d.kind==='open-carton')assert(samples.every(y=>Math.abs(y)<1e-5) && bounds.max.y>.24,'Carton flaps must leave access to the real interior floor');
    else assert(samples.every(y=>y>.20),'Closed replenishment carton must have a solid upper face');
    details.topRays=samples;
  }
  return {geometrySha256:geometryHash.digest('hex'),triangles,dimensions:vector(bounds.getSize(v())),bottomContacts:probes,...details};
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
  console.log('build-cleaning-loads.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/public-storage-cleaning-v1/production';
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
const input=args.parameters??sourceDir+'/parameters.json',contractPath=sourceDir+'/contract.json',recordPath=sourceDir+'/original/sources.json';
assert(input.endsWith('.json'));

const [recipeBytes,canonical,contractBytes,recordBytes]=await Promise.all([input,sourceDir+'/parameters.json',contractPath,recordPath].map(read));
const recipe=JSON.parse(recipeBytes),signed=JSON.parse(canonical).designs,contract=JSON.parse(contractBytes),record=JSON.parse(recordBytes);
assert.deepEqual(Object.keys(recipe).sort(),['schema','version','designs'].sort());
assert(recipe.schema==='company-cleaning-loads' && recipe.version===1 && Array.isArray(recipe.designs) && recipe.designs.length);
assert.deepEqual(contract.resource.mounting,{origin:'bottom',width:.38,height:.30,depth:.23});
assert(record.author==='Kenney'&&record.release==='Furniture Kit 2.0'&&record.license==='CC0-1.0');
assert.equal(record.licensePath,sourceDir+'/original/Kenney-License.txt');
assert.equal(record.projectAuthored.licensePath,sourceDir+'/original/PROJECT-SOURCE.txt');
assert((await read(record.licensePath)).toString().includes('Creative Commons Zero, CC0'));
const collection={schemaVersion:1,id:'company-cleaning-loads-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),contract:contractPath,contractSha256:sha(contractBytes),resources:[]};
const files=new Map(),seen=new Set();
for(const design of recipe.designs){
  checkDesign(design);const key=design.id+'@'+design.version;assert(!seen.has(key),'Duplicate identity: '+key);seen.add(key);
  const stock=signed.find(s=>s.id===design.id&&s.version===design.version);
  if(args.parameters&&stock)assert.deepEqual(design,stock,'Edit a signed design under a new ID/version.');
  const originalKey=originalKeys[design.kind],original=record.originalModels[originalKey];
  let source,licenseFile,licenseHash;
  if(originalKey){
    assert(original && original.path===sourceDir+'/original/'+originalKey+'.glb' && original.member==='Models/GLTF format/'+originalKey+'.glb');
    source=await originalCarton(design,original);licenseFile=record.licensePath;licenseHash=record.licenseSha256;
  }else{
    assert(record.projectAuthored.kinds.includes(design.kind));
    source=design.kind==='caddy'?makeCaddy(design):makeLinen(design);
    licenseFile=record.projectAuthored.licensePath;licenseHash=record.projectAuthored.licenseSha256;
  }
  source.name=design.id;source.updateMatrixWorld(true);
  const model=Buffer.from(await new GLTFExporter().parseAsync(source,{binary:true,onlyVisible:false}));
  const decoded=await parse(model),inspection=inspect(decoded,design,contract.resource.mounting);
  const dir='prototype/public/company-assets/'+family+'/'+design.id+'/v'+design.version;
  const modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json',asset={format:'glb',url:modelPath.slice('prototype/public'.length),bytes:model.length,sha256:sha(model)};
  const deps={generator:{path:generator,sha256:collection.generatorSha256},contract:{path:contractPath,sha256:collection.contractSha256},
    sourceRecord:{path:recordPath,sha256:sha(recordBytes)},license:await pin(licenseFile)};
  assert.equal(deps.license.sha256,licenseHash);
  if(originalKey)deps.originalModel={path:original.path,sha256:original.sha256};
  const provenance={license:originalKey?'CC0-1.0':'Project-authored',source:originalKey?record.page:record.projectAuthored.licensePath,
    sourceDesign:design.kind,sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:collection.generatorSha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,dependencies:deps,
    method:originalKey?'Original Kenney Furniture Kit 2.0 carton, bottom-centred with uniform source scale; mesh and materials retained.':'Editable project-authored tray with physically supported parts, measured after GLB readback.'};
  if(originalKey){provenance.sourceArtifactPath=original.path;provenance.sourceArtifactSha256=original.sha256;}
  files.set(modelPath,model);files.set(resourcePath,json({id:design.id,version:design.version,displayName:design.displayName,...contract.resource,provenance,asset}));
  collection.resources.push({id:design.id,version:design.version,resourcePath,modelPath,sha256:asset.sha256,geometrySha256:inspection.geometrySha256,
    triangles:inspection.triangles,inspection});
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
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,triangles})=>({id,version,sha256,triangles}))}));
