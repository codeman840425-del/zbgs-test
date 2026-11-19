import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {checkManagedOutput,findManagedProject} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const family='assets-source/company-readable-score-v1';
const generator='scripts/company-platform/build-readable-score.mjs';
const donor='prototype/public/company-assets/singing-stage-v1/floor-score-stand-tripod/v1';
const receiptPin='59a9d6d9fa07c4b7d05511bc94f3d4c81632670a016a15eeabfcfa2dd68b8402';
const scratchRelative='output/vocal-height-profile-v1/score';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const angle=T.MathUtils.degToRad(18);
const along=new T.Vector3(0,Math.cos(angle),-Math.sin(angle));
const normal=new T.Vector3(0,Math.sin(angle),Math.cos(angle));
const plane=(x,y,z)=>new T.Vector3(x,0,0).addScaledVector(along,y).addScaledVector(normal,z);
const read=relative=>fs.readFile(path.join(root,relative));

async function safe(base,relative) {
  const parts=relative.split('/');
  assert(parts.length&&parts.every(part=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)&&!part.endsWith('.')&&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),`Unsafe path: ${relative}`);
  let file=base;
  for(const part of parts) {
    file=path.join(file,part);
    const info=await fs.lstat(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    if(info) assert(!info.isSymbolicLink()&&await fs.realpath(file)===file,`Linked path: ${file}`);
  }
  return file;
}
async function pinned(relative,digest) {
  const bytes=await fs.readFile(await safe(root,relative));
  assert.equal(sha(bytes),digest,`Source changed: ${relative}`);
  return bytes;
}
function split(bytes) {
  const end=20+bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(end+4),0x004e4942);
  return {g:JSON.parse(bytes.subarray(20,end)),bin:bytes.subarray(end+8)};
}
function pack(g,bin) {
  const body=Buffer.from(JSON.stringify(g)),length=(body.length+3)&~3;
  const header=Buffer.alloc(20),tail=Buffer.alloc(8);
  [0x46546c67,2,28+length+bin.length,length,0x4e4f534a].forEach((value,i)=>header.writeUInt32LE(value,i*4));
  tail.writeUInt32LE(bin.length);tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,body,Buffer.alloc(length-body.length,0x20),tail,bin]);
}
async function load(bytes) {
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  scene.traverse(item=>{if(item.isMesh)item.material.side=T.DoubleSide;});
  return scene;
}
function named(scene,name) {
  const item=scene.getObjectByName(name);
  assert(item?.isMesh,`Missing physical part ${name}`);
  return item;
}
function limits(mesh,axis) {
  let min=Infinity,max=-Infinity;
  const position=new T.Vector3();
  for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
    const value=mesh.getVertexPosition(i,position).applyMatrix4(mesh.matrixWorld).dot(axis);
    min=Math.min(min,value);max=Math.max(max,value);
  }
  return [min,max];
}
function ray(mesh,from,direction,distance) {
  const [hit]=new T.Raycaster(from,direction,0,distance).intersectObject(mesh,false);
  assert(hit,`Contact ray misses ${mesh.name} at ${from.toArray()}`);
  return hit.point;
}
function towardBack(mesh,x,y) {return ray(mesh,plane(x,y,1.6),normal.clone().negate(),2.4).dot(normal);}
function towardFront(mesh,x,y) {return ray(mesh,plane(x,y,-.6),normal,2.4).dot(normal);}

function addHardware(g,bin,deskIndex,parts,finish) {
  const chunks=[bin];let size=bin.length;
  const material=g.materials.push({name:'score-support-charcoal',pbrMetallicRoughness:{
    baseColorFactor:[...new T.Color(finish).toArray(),1],metallicFactor:.28,roughnessFactor:.64,
  }})-1;
  const desk=g.nodes[deskIndex],translation=new T.Vector3(...desk.translation);
  function attribute(array,type,componentType,target,bounds={}) {
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),length=bytes.length;
    assert(size%4===0);
    const view=g.bufferViews.push({buffer:0,byteOffset:size,byteLength:length,target})-1;
    chunks.push(bytes);size+=length;
    const padding=(4-size%4)%4;
    if(padding) {chunks.push(Buffer.alloc(padding));size+=padding;}
    return g.accessors.push({bufferView:view,componentType,count:array.length/(type==='VEC3'?3:1),type,...bounds})-1;
  }
  for(const part of parts) {
    const {x,y,z}=part, geometry=new T.BoxGeometry(x[1]-x[0],y[1]-y[0],z[1]-z[0]);
    const [cx,cy,cz]=[x,y,z].map(bounds=>(bounds[0]+bounds[1])/2);
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const point=plane(positions.getX(i)+cx,positions.getY(i)+cy,positions.getZ(i)+cz).sub(translation);
      positions.setXYZ(i,...point.toArray());
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();
    const box=geometry.boundingBox;
    const attributes={POSITION:attribute(positions.array,'VEC3',5126,34962,{min:box.min.toArray(),max:box.max.toArray()}),
      NORMAL:attribute(geometry.attributes.normal.array,'VEC3',5126,34962)};
    const indices=attribute(geometry.index.array,'SCALAR',5123,34963);
    const mesh=g.meshes.push({name:part.name,primitives:[{attributes,indices,material}]})-1;
    desk.children.push(g.nodes.push({name:part.name,mesh})-1);
    geometry.dispose();
  }
  g.buffers[0].byteLength=size;
  return Buffer.concat(chunks);
}

async function render(donorBytes,recipe) {
  const original=await load(donorBytes), {g,bin}=split(donorBytes);
  const page=named(original,'singing-score-pages'),panel=named(original,'singing-score-panel-and-slider');
  const deskIndex=g.nodes.findIndex(item=>item.name==='music-stand_desk'),pageIndex=g.nodes.findIndex(item=>item.name===page.name);
  assert(g.nodes[deskIndex].children.includes(pageIndex)&&!g.nodes[deskIndex].rotation&&!g.nodes[pageIndex].translation);
  const [low,high]=limits(page,along),[paperBack,paperFront]=limits(page,normal),[,panelFront]=limits(panel,normal);
  const standOff=panelFront-paperBack+recipe.paperClearanceMetres;
  assert(standOff>.02&&standOff<.085,'Paper projection outside the measured assembly range');
  const parts=[], underChecks=[], rearChecks=[];
  for(const [side,x] of [['left',-.13],['right',.13]]) {
    const lowFront=towardBack(page,x,low+.001),lowBack=towardFront(page,x,low+.001);
    const behind=towardBack(panel,x,low-.004)-.003;
    const front=lowFront+standOff+.003;
    const rail={name:`score-seat-${side}`,x:[x-.020,x+.020],y:[low-.011,low+.00010],z:[behind,front]};
    parts.push(rail);
    underChecks.push({name:rail.name,x,faceN:(lowBack+lowFront)/2+standOff,y:low});
    for(const [position,fraction] of [['mid',.38],['top',.78]]) {
      const y=T.MathUtils.lerp(low,high,fraction),panelN=towardBack(panel,x,y),pageN=towardFront(page,x,y)+standOff;
      const pad={name:`score-pad-${side}-${position}`,x:[x-.012,x+.012],y:[y-.009,y+.009],z:[panelN-.002,pageN+.00015]};
      assert(pad.z[1]>pad.z[0]+.004);
      parts.push(pad);rearChecks.push({name:pad.name,x,y,panelN,pageN});
    }
  }
  g.nodes[pageIndex].translation=normal.clone().multiplyScalar(standOff).toArray();
  g.nodes[g.scenes[g.scene??0].nodes[0]].name=recipe.id;
  g.asset.generator='company-readable-score-v1 / build-readable-score.mjs';
  const result=pack(g,addHardware(g,bin,deskIndex,parts,recipe.supportColor));
  const unchanged=split(result);
  assert(unchanged.bin.subarray(0,bin.length).equals(bin),'Upstream textures or attributes changed');
  assert.deepEqual(unchanged.g.images,split(donorBytes).g.images);
  const fitted=await load(result),sheet=named(fitted,page.name),base=named(fitted,'singing-tripod');
  const bounds=new T.Box3().setFromObject(fitted,true),oldBaseBounds=new T.Box3().setFromObject(named(original,base.name),true);
  assert.deepEqual(new T.Box3().setFromObject(base,true),oldBaseBounds);
  for(let i=0;i<sheet.geometry.attributes.position.count;i++) {
    const after=sheet.getVertexPosition(i,new T.Vector3()).applyMatrix4(sheet.matrixWorld);
    const before=page.getVertexPosition(i,new T.Vector3()).applyMatrix4(page.matrixWorld).addScaledVector(normal,standOff);
    assert(after.distanceTo(before)<1e-7,'Paper vertex motion changed');
  }
  const bottom=[];
  for(const {name,x,faceN,y} of underChecks) {
    const rail=named(fitted,name);
    const underside=ray(sheet,plane(x,y-.03,faceN),along,.035);
    const bearing=ray(rail,plane(x,y+.02,faceN),along.clone().negate(),.04);
    const gap=underside.distanceTo(bearing);
    const paperOverlap=along.dot(bearing.clone().sub(underside));
    assert(gap<=.001&&paperOverlap>0,`${name} does not touch the paper bottom`);
    const attachmentV=y-.004;
    const panelOverlap=towardBack(named(fitted,panel.name),x,attachmentV)-towardFront(rail,x,attachmentV);
    assert(panelOverlap>.002&&panelOverlap<.004,`${name} must be seated on the original panel`);
    bottom.push({mesh:name,point:underside.toArray(),bearing:bearing.toArray(),distanceMetres:gap,
      paperOverlapMetres:paperOverlap,oldPanelOverlapMetres:panelOverlap});
  }
  const rear=[];
  for(const {name,x,y,panelN,pageN} of rearChecks) {
    const pad=named(fitted,name);
    const oldPanel=towardBack(named(fitted,panel.name),x,y),paper=towardFront(sheet,x,y);
    const padPanel=towardFront(pad,x,y),padPaper=towardBack(pad,x,y);
    assert(Math.abs(oldPanel-panelN)<1e-7&&Math.abs(paper-pageN)<1e-7);
    assert(oldPanel-padPanel>.001&&padPaper-paper>=0&&padPaper-paper<.0005,`${name} must meet both the old panel and the paper`);
    rear.push({mesh:name,oldPanelOverlapMetres:oldPanel-padPanel,paperOverlapMetres:padPaper-paper});
  }
  return {model:result,parts:parts.map(part=>part.name),inspection:{standOffMetres:standOff,
    paperNormal:normal.toArray(),minimumOldPanelClearanceMetres:limits(sheet,normal)[0]-panelFront,
    originalPaperProjection:[paperBack,paperFront],originalPanelFrontProjection:panelFront,
    fittedBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},identicalSourceImageEntries:unchanged.g.images.length,
    translatedPaperVertices:sheet.geometry.attributes.position.count,bottom,rear}};
}

const {values:args}=parseArgs({options:{check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'},
  parameters:{type:'string'},help:{type:'boolean'}}});
if(args.help){
  console.log('build-readable-score.mjs --check | --write | --output NEW_PROJECT_OUTPUT [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check,args.write,Boolean(args.output)].filter(Boolean).length,1,'Choose one output mode');
assert(args.parameters===undefined||args.output,'Alternate recipes require --output');
const project=await fs.realpath(await findManagedProject(root)??root);
const scratch=await safe(project,scratchRelative);
await checkManagedOutput(scratch,root,{allowDelivery:false});
let dest=root;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'),'Path traversal in trial destination');
  const relative=path.relative(project,path.resolve(project,args.output)).split(path.sep).join('/');
  assert(relative.startsWith('output/')||relative.startsWith('company-workspace/production-trials/'),'Trial must be inside this project');
  assert(relative!==scratchRelative&&!relative.startsWith(scratchRelative+'/.production-lock')&&
    !relative.startsWith(scratchRelative+'/score-stage-'),'Reserved producer directory');
  dest=await safe(project,relative);
  await checkManagedOutput(dest,root,{allowDelivery:false});
}
const defaultParameters=family+'/parameters.json';
const parameters=args.parameters??defaultParameters;
assert(/^assets-source\/company-[^/]+\/.+\.json$/.test(parameters),'Expected a project-relative recipe in assets-source/company-*');
const recipeBytes=await fs.readFile(await safe(root,parameters)),spec=JSON.parse(recipeBytes);
assert.deepEqual(Object.keys(spec).sort(),['designs','schema','version']);
assert(spec.schema==='company-readable-score'&&spec.version===1&&Array.isArray(spec.designs)&&spec.designs.length===1,
  'Expected one company-readable-score design');
const [recipe]=spec.designs;
assert.deepEqual(Object.keys(recipe).sort(),['displayName','id','paperClearanceMetres','supportColor','version']);
assert(/^floor-score-stand-[a-z][a-z0-9-]{0,45}$/.test(recipe.id)&&Number.isSafeInteger(recipe.version)&&recipe.version>0);
assert(typeof recipe.displayName==='string'&&recipe.displayName.trim()&&/^#[\da-f]{6}$/i.test(recipe.supportColor));
assert(Number.isFinite(recipe.paperClearanceMetres)&&recipe.paperClearanceMetres>=.004&&recipe.paperClearanceMetres<=.009);
if(parameters!==defaultParameters) {
  const [canonical]=JSON.parse(await fs.readFile(await safe(root,defaultParameters))).designs;
  assert(recipe.id!==canonical.id||recipe.version!==canonical.version,'Use a new ID or version for an independent recipe');
}
const source=JSON.parse(await pinned(donor+'/resource.json',receiptPin));
const donorBytes=await pinned(donor+'/model.glb',source.asset.sha256);
const dependencies={...source.provenance.dependencies,donorSidecar:{path:donor+'/resource.json',sha256:receiptPin},
  donorModel:{path:donor+'/model.glb',sha256:source.asset.sha256},
  donorParameters:{path:source.provenance.sourceParameters,sha256:source.provenance.sourceParametersSha256},
  donorGenerator:{path:source.provenance.generator,sha256:source.provenance.generatorSha256}};
await Promise.all(Object.values(dependencies).map(({path,sha256})=>pinned(path,sha256)));
installNodeImageDecodeShim();
const {model,parts,inspection}=await render(donorBytes,recipe);
const fitted=inspection.fittedBounds,{width,height,depth}=source.mounting;
assert(Math.abs(fitted.min[1])<1e-7&&fitted.max[1]<=height&&fitted.min[0]>=-width/2&&fitted.max[0]<=width/2&&
  fitted.min[2]>=-depth/2&&fitted.max[2]<=depth/2,'The new geometry extends past the old mounting envelope');
const folder=`prototype/public/company-assets/readable-score-v1/${recipe.id}/v${recipe.version}`;
const modelPath=folder+'/model.glb', resourcePath=folder+'/resource.json';
const asset={format:'glb',url:modelPath.slice('prototype/public'.length),bytes:model.length,sha256:sha(model)};
const provenance={...source.provenance,sourceParameters:parameters,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),dependencies};
const resource={...source,id:recipe.id,version:recipe.version,displayName:recipe.displayName,
  materialSlots:{...source.materialSlots,support:parts},provenance,asset};
const collection={schemaVersion:1,id:'company-readable-score-v1',sourceParameters:parameters,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:provenance.generatorSha256,resources:[{id:recipe.id,version:recipe.version,modelPath,resourcePath,
    sha256:asset.sha256,inspection}]};
const files=[[modelPath,model],[resourcePath,json(resource)],[family+'/collection.json',json(collection)]];
const targets=await Promise.all(files.map(async ([relative,bytes])=>({relative,bytes,target:await safe(dest,relative)})));
const existing=async file=>fs.readFile(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const pending=[];
if(!args.output) for(const item of targets) {
  const found=await existing(item.target);
  if(found) assert(found.equals(item.bytes),'Refusing to overwrite a different version '+item.relative);
  else {assert(!args.check,'Generated file is missing '+item.relative);pending.push(item);}
} else pending.push(...targets);
if(pending.length) {
  await fs.mkdir(scratch,{recursive:true});
  const lock=path.join(scratch,'.production-lock');
  await fs.mkdir(lock);
  let stage;const linked=[];
  try {
    stage=await fs.mkdtemp(path.join(scratch,'score-stage-'));
    for(const item of pending) {
      const staged=await safe(stage,item.relative);
      await fs.mkdir(path.dirname(staged),{recursive:true});await fs.writeFile(staged,item.bytes,{flag:'wx'});
      if(!args.output) {
        await fs.mkdir(path.dirname(item.target),{recursive:true});
        await fs.link(staged,item.target);linked.push(item.target);
      }
    }
    if(args.output) {
      const present=await fs.lstat(dest).catch(error=>{if(error.code!=='ENOENT')throw error;});
      assert(!present,'Trial directory already exists');
      await fs.mkdir(path.dirname(dest),{recursive:true});await fs.rename(stage,dest);stage=null;
    }
  } catch(error) {for(const item of linked.reverse())await fs.unlink(item);throw error;}
  finally {
    if(stage){assert.equal(path.dirname(await fs.realpath(stage)),scratch);await fs.rm(stage,{recursive:true});}
    await fs.rmdir(lock);
  }
}
console.log(JSON.stringify({ok:true,id:resource.id,version:resource.version,sha256:asset.sha256,
  standOffMetres:inspection.standOffMetres,bottomWitnesses:inspection.bottom.length,rearWitnesses:inspection.rear.length}));
