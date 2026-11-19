import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {checkManagedOutput,findManagedProject} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root = await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const project = await fs.realpath(await findManagedProject(root) ?? root);
const family = 'assets-source/company-washroom-dispenser-v1';
const publicFamily = 'prototype/public/company-assets/washroom-dispenser-v1';
const generator = 'scripts/company-platform/build-washroom-dispensers.mjs';
const originalRecord = family+'/original/sources.json';
const contractPath = family+'/contract.json';
const baseRecipe = family+'/parameters.json';
const branchesPath = 'assets-source/company-environment-specs-v1/branches.json';
const scratchRelative = 'output/public-washroom-v1/dispenser/producer';
const names = {back:'dispenser-wall-back',housing:'dispenser-housing',actuator:'dispenser-actuator',outlet:'dispenser-outlet'};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const rounded = value => Number(value.toFixed(7)) || 0;
const coords = vector => vector.toArray().map(rounded);
const box = (w,h,d,x,y,z) => new T.BoxGeometry(w,h,d).translate(x,y,z);
const within = (n,min,max) => Number.isFinite(n) && n>=min && n<=max;

async function safe(base,relative) {
  let target=base;
  for(const part of relative.split('/')) {
    assert(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)&&!part.endsWith('.')&&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),'Unsafe project path: '+relative);
    target=path.join(target,part);
    const stat=await fs.lstat(target).catch(error=>{if(error.code!=='ENOENT')throw error;});
    if(stat)assert(!stat.isSymbolicLink()&&await fs.realpath(target)===target,'Linked project path: '+target);
  }
  return target;
}
const read = async relative => fs.readFile(await safe(root,relative));

function bevelShell(width,height,corner,back,front,y=0) {
  const halfW=width/2,halfH=height/2;
  const p=new T.Shape();
  p.moveTo(-halfW+corner,-halfH);
  p.lineTo(halfW-corner,-halfH);p.quadraticCurveTo(halfW,-halfH,halfW,-halfH+corner);
  p.lineTo(halfW,halfH-corner);p.quadraticCurveTo(halfW,halfH,halfW-corner,halfH);
  p.lineTo(-halfW+corner,halfH);p.quadraticCurveTo(-halfW,halfH,-halfW,halfH-corner);
  p.lineTo(-halfW,-halfH+corner);p.quadraticCurveTo(-halfW,-halfH,-halfW+corner,-halfH);
  return new T.ExtrudeGeometry(p,{depth:front-back,bevelEnabled:false,curveSegments:4}).translate(0,y,back);
}

function annulus(outside,inside,bottom,top,z) {
  const ring=new T.Shape(), hole=new T.Path();
  ring.absarc(0,0,outside,0,2*Math.PI,false);
  hole.absarc(0,0,inside,0,2*Math.PI,true);
  ring.holes.push(hole);
  const g=new T.ExtrudeGeometry(ring,{depth:top-bottom,bevelEnabled:false,curveSegments:8});
  return g.rotateX(-Math.PI/2).translate(0,bottom,z);
}

function combined(geometries) {
  return mergeGeometries(geometries.map(g=>{
    const part=g.index?g.toNonIndexed():g.clone();
    part.deleteAttribute('uv');
    return part;
  }),false);
}

function materials(bodyColor,trimColor) {
  return [
    {name:'body',color:new T.Color(bodyColor),metallicFactor:.05,roughnessFactor:.52},
    {name:'trim',color:new T.Color(trimColor),metallicFactor:.28,roughnessFactor:.53},
    {name:'accessory',color:new T.Color('#293c41'),metallicFactor:.22,roughnessFactor:.43},
    {name:'hardware',color:new T.Color('#abbab8'),metallicFactor:.62,roughnessFactor:.38},
  ].map(({name,color,metallicFactor,roughnessFactor})=>({name,
    pbrMetallicRoughness:{baseColorFactor:[...color.toArray(),1],metallicFactor,roughnessFactor}}));
}

function unpack(bytes) {
  const end=20+bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.length,bytes.readUInt32LE(8));
  assert.equal(bytes.readUInt32LE(end+4),0x004e4942);
  assert.equal(end+8+bytes.readUInt32LE(end),bytes.length);
  return {g:JSON.parse(bytes.subarray(20,end)),bin:bytes.subarray(end+8)};
}

function pack(g,bin) {
  g.buffers[0].byteLength=bin.length;
  const body=Buffer.from(JSON.stringify(g)),aligned=(body.length+3)&~3;
  const start=Buffer.alloc(20), middle=Buffer.alloc(8);
  [0x46546c67,2,28+aligned+bin.length,aligned,0x4e4f534a].forEach((n,i)=>start.writeUInt32LE(n,i*4));
  middle.writeUInt32LE(bin.length);middle.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([start,body,Buffer.alloc(aligned-body.length,0x20),middle,bin]);
}

function writer(design,donor) {
  const g=donor?.g??{asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[]};
  const imported=donor?structuredClone(g.meshes[0].primitives[0]):undefined;
  const chunks=donor?[donor.bin]:[];
  let offset=donor?.bin.length??0;
  g.asset.generator='Gamemake washroom dispenser';
  g.scene=0;g.scenes=[{nodes:[]}];g.nodes=[];g.meshes=[];
  const materialStart=g.materials.length;
  g.materials.push(...materials(design.bodyColor,design.trimColor));
  function append(array,type,componentType,count,target,min,max) {
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength), aligned=(bytes.length+3)&~3;
    const view=g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target})-1;
    chunks.push(bytes,Buffer.alloc(aligned-bytes.length));offset+=aligned;
    return g.accessors.push({bufferView:view,componentType,count,type,...(min?{min,max}:{})})-1;
  }
  function item(name,primitive,matrix) {
    const mesh=g.meshes.push({name,primitives:[primitive]})-1;
    const node=g.nodes.push({name,mesh,...(matrix?{matrix}:{})})-1;
    g.scenes[0].nodes.push(node);
  }
  function part(name,geometry,material) {
    geometry.computeBoundingBox();
    const {position,normal}=geometry.attributes;
    const {min,max}=geometry.boundingBox;
    const attributes={POSITION:append(position.array,'VEC3',5126,position.count,34962,min.toArray(),max.toArray()),
      NORMAL:append(normal.array,'VEC3',5126,normal.count,34962)};
    const indices=geometry.index?append(geometry.index.array,'SCALAR',geometry.index.array.BYTES_PER_ELEMENT===2?5123:5125,
      geometry.index.count,34963):undefined;
    item(name,{attributes,mode:4,material:materialStart+material,...(indices===undefined?{}:{indices})});
  }
  function importBottle(scale,y,z) {
    const pos=g.accessors[imported.attributes.POSITION], ix=g.accessors[imported.indices];
    assert.equal(pos.count,446);assert.equal(pos.componentType,5126);assert.equal(ix.componentType,5123);
    const posStart=(g.bufferViews[pos.bufferView].byteOffset||0)+(pos.byteOffset||0);
    const ixStart=(g.bufferViews[ix.bufferView].byteOffset||0)+(ix.byteOffset||0);
    const body=[], actuator=[];
    for(let i=0;i<ix.count;i+=3) {
      const triangle=[0,1,2].map(j=>donor.bin.readUInt16LE(ixStart+(i+j)*2));
      const cap=triangle.every(index=>donor.bin.readFloatLE(posStart+index*12+8)>=.0172);
      (cap?actuator:body).push(...triangle);
    }
    assert.equal(body.length+actuator.length,ix.count);
    assert(body.length>400&&actuator.length>150);
    const rotationScale=100*scale;
    // Source X is nozzle-forward and source Z is up. The cyclic basis preserves handedness.
    const matrix=[0,0,rotationScale,0,rotationScale,0,0,0,0,rotationScale,0,0,0,y,z,1];
    for(const [name,indices] of [[names.housing,body],[names.actuator,actuator]])
      item(name,{...imported,indices:append(Uint16Array.from(indices),'SCALAR',5123,indices.length,34963)},matrix);
    return {sourceVertices:pos.count,sourceTriangles:ix.count/3,
      housingTriangles:body.length/3,actuatorTriangles:actuator.length/3,embeddedSourceImages:g.images.length};
  }
  return {part,importBottle,finish:()=>pack(g,Buffer.concat(chunks))};
}

function validate(design) {
  assert.deepEqual(Object.keys(design).sort(),['bodyColor','displayName','id','kind','profile','trimColor','version']);
  assert(/^washroom-dispenser-[a-z][a-z0-9-]{0,40}$/.test(design.id)&&Number.isSafeInteger(design.version)&&design.version>0);
  assert(typeof design.displayName==='string'&&design.displayName.trim()&&design.displayName.length<=60);
  assert([design.bodyColor,design.trimColor].every(color=>typeof color==='string'&&/^#[a-f0-9]{6}$/i.test(color)));
  assert(['pump','cartridge','lever','clad'].includes(design.kind));
  const p=design.profile;
  if(design.kind==='pump') {
    assert.deepEqual(Object.keys(p).sort(),['baseY','scale']);
    assert(within(p.scale,.087,.108)&&within(p.baseY,-.103,-.090));
  } else {
    assert.deepEqual(Object.keys(p).sort(),['corner','depth','height','width']);
    assert(within(p.width,.097,.139)&&within(p.height,.179,.221)&&within(p.depth,.062,.093));
    assert(within(p.corner,.006,.036)&&p.corner<p.width/2);
  }
}

function build(design,donor) {
  const p=design.profile, out=writer(design,donor);
  out.part(names.back,bevelShell(.132,.230,.010,0,.014),1);
  let witness, source;
  if(design.kind==='pump') {
    const z=.014+.410634*p.scale;
    source=out.importBottle(p.scale,p.baseY,z);
    out.part('dispenser-bottle-cradle',bevelShell(.102,.010,.004,.008,z+.443*p.scale,p.baseY-.0046),0);
    const nozzleZ=z+.605*p.scale, top=p.baseY+1.824*p.scale, bottom=top-.009;
    out.part(names.outlet,annulus(.0068,.0036,bottom,top,nozzleZ),3);
    witness={position:[0,bottom,nozzleZ],actuatorRay:{point:[0,p.baseY+1.944*p.scale,z+.49*p.scale],from:[0,1,0]}};
    return {...out,witness,source};
  }

  const front=.011+p.depth, lower=-p.height/2;
  const nozzleZ=.119, nozzleBottom=lower-.005, nozzleTop=lower+.012;
  out.part('dispenser-outlet-manifold',bevelShell(.033,.031,.008,front-.014,.128,lower+.011),1);
  out.part(names.outlet,annulus(.008,.004,nozzleBottom,nozzleTop,nozzleZ),2);
  if(design.kind==='cartridge') {
    out.part(names.housing,bevelShell(p.width,p.height,p.corner,.010,front),0);
    out.part(names.actuator,bevelShell(p.width*.74,.039,.015,front-.005,.119,-.050),1);
    out.part('dispenser-level-window',bevelShell(.016,.057,.007,front-.002,front+.002,.028),2);
    witness={position:[0,nozzleBottom,nozzleZ],actuatorRay:{point:[0,-.050,.117],from:[0,0,1]}};
  } else if(design.kind==='lever') {
    out.part(names.housing,bevelShell(p.width,p.height,p.corner,.010,front),0);
    const arm=box(.066,.086,.009,0,-.028,0).rotateX(.29).translate(0,0,front+.031);
    const hinge=box(.083,.018,.037,0,.008,front+.013);
    out.part(names.actuator,combined([hinge,arm]),3);
    out.part('dispenser-level-window',bevelShell(.061,.019,.007,front-.002,front+.002,.059),2);
    witness={position:[0,nozzleBottom,nozzleZ],actuatorRay:{point:[0,-.039,front+.022],from:[0,0,1]}};
  } else {
    const w=p.width/2,d=p.depth/2,corner=p.corner;
    const profile=[[0,lower],[w*.72,lower],[w*.94,lower+corner*.75],[w,lower+corner*1.65],[w,-lower-corner*1.65],
      [w*.94,-lower-corner*.75],[w*.72,-lower],[0,-lower]].map(([x,y])=>new T.Vector2(x,y));
    const housing=new T.LatheGeometry(profile,32).scale(1,1,d/w).translate(0,0,.011+d);
    out.part(names.housing,housing,0);
    const clasp=bevelShell(p.width*.83,.039,.018,.010,.104,-.056);
    out.part('dispenser-housing-clasp',clasp,3);
    out.part(names.actuator,bevelShell(.043,.032,.015,.096,.122,-.052),1);
    witness={position:[0,nozzleBottom,nozzleZ],actuatorRay:{point:[0,-.052,.119],from:[0,0,1]}};
  }
  return {...out,witness};
}

function meshFaces(mesh) {
  const position=mesh.geometry.attributes.position, indices=mesh.geometry.index;
  const point=i=>mesh.localToWorld(v().fromBufferAttribute(position,indices?indices.getX(i):i));
  const faces=[];
  for(let i=0;i<(indices?.count??position.count);i+=3) {
    const points=[point(i),point(i+1),point(i+2)], triangle=new T.Triangle(...points);
    if(triangle.getArea()>1e-11)faces.push({triangle,box:new T.Box3().setFromPoints(points)});
  }
  return faces;
}

function joined(a,b) {
  const tolerance=.00025, nearest=v(), hit=v(), ray=new T.Ray();
  if(!a.bounds.clone().expandByScalar(tolerance).intersectsBox(b.bounds))return false;
  for(const faceA of a.faces) {
    const box=faceA.box.clone().expandByScalar(tolerance);
    for(const faceB of b.faces) {
      if(!box.intersectsBox(faceB.box))continue;
      for(const [from,to] of [[faceA.triangle,faceB.triangle],[faceB.triangle,faceA.triangle]]) {
        const vertices=[from.a,from.b,from.c];
        for(const [i,start] of vertices.entries()) {
          if(to.closestPointToPoint(start,nearest).distanceTo(start)<=tolerance)return true;
          const segment=vertices[(i+1)%3].clone().sub(start), distance=segment.length();
          if(distance>0&&ray.set(start,segment.multiplyScalar(1/distance)).intersectTriangle(to.a,to.b,to.c,false,hit)&&
            hit.distanceTo(start)<=distance+1e-8)return true;
        }
      }
    }
  }
  return false;
}

async function inspect(model,assembly,contract) {
  const {scene}=await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength),'');
  scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(scene,true), {width,height,depth}=contract.mounting;
  assert(bounds.min.y>=-height/2-1e-7&&bounds.max.y<=height/2+1e-7&&
    bounds.min.x>=-width/2-1e-7&&bounds.max.x<=width/2+1e-7&&bounds.min.z>=-1e-7&&bounds.max.z<=depth+1e-7,
  'Fits the protected wall envelope');
  const parts=new Map(), geometry=createHash('sha256');
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const faces=meshFaces(mesh);
    assert(faces.length&&faces.every(face=>[face.triangle.a,face.triangle.b,face.triangle.c].every(point=>point.toArray().every(Number.isFinite))));
    assert(!parts.has(mesh.name));
    mesh.material.side=T.DoubleSide;
    parts.set(mesh.name,{mesh,faces,bounds:new T.Box3().setFromObject(mesh,true)});
    geometry.update(mesh.name+'\0'+JSON.stringify(faces.map(({triangle:t})=>[coords(t.a),coords(t.b),coords(t.c)])));
  });
  for(const name of Object.values(names))assert(parts.has(name),'Missing mesh '+name);
  const connected=new Set([names.back]), joints=[];
  for(let changed=true;changed;) {
    changed=false;
    for(const [part,data] of parts) {
      if(connected.has(part))continue;
      const support=[...connected].find(known=>joined(parts.get(known),data));
      if(support){connected.add(part);joints.push([support,part]);changed=true;}
    }
  }
  assert.equal(connected.size,parts.size,'Detached appliance parts: '+[...parts.keys()].filter(name=>!connected.has(name)));
  const meshes=[...parts.values()].map(p=>p.mesh);
  const ray=(origin,direction,far=1,objects=meshes)=>new T.Raycaster(origin,direction,0,far).intersectObjects(objects);
  const wallSamples=[];
  for(const x of [-.048,0,.048])for(const y of [-.086,0,.086]) {
    const first=ray(v(x,y,-.06),v(0,0,1))[0];
    assert(first?.object.name===names.back&&Math.abs(first.point.z)<1e-7,'Nine true backplate-to-wall witnesses');
    wallSamples.push(coords(first.point));
  }
  const [x,y,z]=assembly.witness.position;
  const outlet=parts.get(names.outlet).mesh, towardOutlet=v(0,1,0);
  assert(z>=.108&&z<=.130,'Outlet stays on the room side');
  assert(ray(v(x,y-.040,z),towardOutlet,parts.get(names.outlet).bounds.max.y-y+.040,[outlet]).length===0,'No cap across bore');
  assert(ray(v(x+.005,y-.040,z),towardOutlet,.041,[outlet]).length>0,'Visible annular outlet');
  assert.equal(ray(v(x,y-.052,z),towardOutlet,.051).length,0,'Room below discharge');
  assert.equal(ray(v(x,y-.020,z+.10),v(0,0,-1),.10).length,0,'Hands approach from room side');
  const {point,from}=assembly.witness.actuatorRay;
  const outward=v(...from), target=v(...point);
  const pressing=ray(target.clone().addScaledVector(outward,.08),outward.clone().negate(),.13)[0];
  assert.equal(pressing?.object.name,names.actuator,'Accessible contact surface on the actuator');
  return {geometrySha256:geometry.digest('hex'),triangles:[...parts.values()].reduce((n,p)=>n+p.faces.length,0),
    bounds:{min:coords(bounds.min),max:coords(bounds.max)},joints,wallSamples,
    outlet:{point:assembly.witness.position.map(rounded),direction:[0,-1,0],boreClear:true,handApproachClear:true},
    actuator:{point:coords(pressing.point),approach:from},...(assembly.source?{source:assembly.source}:{})};
}

const {values:args}=parseArgs({options:{check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'},
  parameters:{type:'string'},help:{type:'boolean'}}});
if(args.help) {
  console.log('build-washroom-dispensers.mjs --check | --write | --output NEW_PROJECT_OUTPUT [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check,args.write,Boolean(args.output)].filter(Boolean).length,1,'Choose one output mode');
assert(args.parameters===undefined||args.output,'Alternate recipes require --output');
const scratch=await safe(project,scratchRelative);
await checkManagedOutput(scratch,root,{allowDelivery:false});
let dest=root;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'),'Path traversal in trial directory');
  const trial=path.relative(project,path.resolve(project,args.output)).split(path.sep).join('/');
  assert(/^(output|company-workspace\/production-trials)\//.test(trial),'Trial must stay inside project outputs');
  assert(trial!==scratchRelative&&!trial.startsWith(scratchRelative+'/'),'Reserved producer directory');
  dest=await safe(project,trial);
  await checkManagedOutput(dest,root,{allowDelivery:false});
  await fs.lstat(dest).then(()=>assert.fail('Trial directory already exists: '+dest),e=>{if(e.code!=='ENOENT')throw e;});
}
const parameters=args.parameters??baseRecipe;
assert(/^assets-source\/company-[^/]+\/.+\.json$/.test(parameters),'Expected a project-relative design recipe');
const [recipeBytes,canonicalBytes,contractBytes,recordBytes,branchBytes,generatorBytes]=await Promise.all(
  [parameters,baseRecipe,contractPath,originalRecord,branchesPath,generator].map(read));
const recipe=JSON.parse(recipeBytes),original=JSON.parse(recordBytes),contract=JSON.parse(contractBytes);
assert.deepEqual(Object.keys(recipe).sort(),['designs','schema','version']);
assert(recipe.schema==='company-washroom-dispensers'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length);
assert.equal(contract.schema,'company-washroom-dispenser-contract');
assert.deepEqual(contract.resource.dispenser,{backNode:names.back,housingNode:names.housing,actuatorNode:names.actuator,
  outletNode:names.outlet,outletDirection:[0,-1,0]});
assert(JSON.parse(branchBytes).groups.flatMap(g=>g.branches).some(branch=>branch.id===contract.environmentBranch));
const signed=JSON.parse(canonicalBytes).designs, tools=['Three.js r'+T.REVISION,'Native binary GLB writer','GLTFLoader mesh readback'];
const collection={schemaVersion:1,id:'company-washroom-dispenser-v1',sourceParameters:parameters,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(generatorBytes),contract:contractPath,contractSha256:sha(contractBytes),resources:[]};
const files=new Map(), sourceRecord={path:originalRecord,sha256:sha(recordBytes)};
installNodeImageDecodeShim();
for(const design of recipe.designs) {
  validate(design);
  if(parameters!==baseRecipe)assert(!signed.some(d=>d.id===design.id&&d.version===design.version),'Use a new identity or version for an alternate recipe');
  const record=design.kind==='pump'?original.pump:original.authored;
  const dependencies={sourceRecord};
  let donor, attribution={sourceAuthor:record.author,sourceLicense:record.license};
  if(design.kind==='pump') {
    assert.equal(record.path,family+'/original/hand-wash-bottle.glb');
    assert.equal(record.licensePath,family+'/original/CC0-1.0.txt');
    const [source,license]=await Promise.all([record.path,record.licensePath].map(read));
    assert.equal(source.length,record.bytes);assert.equal(sha(source),record.sha256);assert.equal(sha(license),record.licenseSha256);
    donor=unpack(source);
    dependencies.originalModel={path:record.path,sha256:record.sha256};
    dependencies.license={path:record.licensePath,sha256:record.licenseSha256};
    attribution={...attribution,sourceUrl:record.page,sourceArtifactPath:record.path,sourceArtifactSha256:record.sha256};
  } else assert(record.kinds.includes(design.kind));
  const assembly=build(design,donor), model=assembly.finish(), inspection=await inspect(model,assembly,contract.resource);
  const directory=publicFamily+'/'+design.id+'/v'+design.version;
  const modelPath=directory+'/model.glb',resourcePath=directory+'/resource.json';
  assert(!files.has(modelPath),'Duplicate source identity');
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:sha(model),bytes:model.length};
  const provenance={license:donor?'CC0-1.0 MiniPoly bottle. Project-authored wall backing, cradle and outlet.':'Project-authored editable geometry.',
    ...attribution,sourceDesign:design.kind,sourceParameters:parameters,sourceParametersSha256:collection.sourceParametersSha256,
    generator,generatorSha256:collection.generatorSha256,functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
    environmentBranch:contract.environmentBranch,environmentBranchSource:branchesPath,environmentBranchSourceSha256:sha(branchBytes),
    dependencies,tools};
  const resource={id:design.id,version:design.version,displayName:design.displayName,...contract.resource,
    materialSlots:{housing:[names.housing],trim:[names.back,names.actuator,names.outlet]},provenance,asset};
  files.set(modelPath,model);files.set(resourcePath,json(resource));
  collection.resources.push({id:design.id,version:design.version,modelPath,resourcePath,sha256:asset.sha256,
    geometrySha256:inspection.geometrySha256,inspection});
}
assert.equal(new Set(collection.resources.map(r=>r.geometrySha256)).size,collection.resources.length,'Each design must have distinct real geometry');
files.set(family+'/collection.json',json(collection));

const targets=await Promise.all([...files].map(async ([relative,bytes])=>({relative,bytes,path:await safe(dest,relative)})));
async function publish() {
  const newFiles=[];
  for(const item of targets) {
    const existing=await fs.readFile(item.path).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(existing) assert(existing.equals(item.bytes)&&!args.output,'Refusing to replace versioned output: '+item.relative);
    else {assert(!args.check,'Missing versioned output: '+item.relative);newFiles.push(item);}
  }
  if(!newFiles.length)return;
  await fs.mkdir(scratch,{recursive:true});
  const lock=path.join(scratch,'publish.lock');
  await fs.mkdir(lock);
  let stage;
  const linked=[];
  try {
    stage=await fs.mkdtemp(path.join(scratch,'stage-'));
    for(const {relative,bytes} of newFiles) {
      const staged=await safe(stage,relative);
      await fs.mkdir(path.dirname(staged),{recursive:true});
      await fs.writeFile(staged,bytes,{flag:'wx'});
    }
    if(args.output) {
      await fs.mkdir(path.dirname(dest),{recursive:true});
      await fs.lstat(dest).then(()=>assert.fail('Trial directory already exists: '+dest),e=>{if(e.code!=='ENOENT')throw e;});
      await fs.rename(stage,dest);stage=undefined;
    } else {
      for(const item of newFiles) {
        await fs.mkdir(path.dirname(item.path),{recursive:true});
        await fs.link(path.join(stage,item.relative),item.path);linked.push(item.path);
      }
    }
  } catch(e) {
    for(const file of linked.reverse())await fs.unlink(file);
    throw e;
  } finally {
    try {
      if(stage){assert.equal(path.dirname(await fs.realpath(stage)),scratch);await fs.rm(stage,{recursive:true});}
    } finally {await fs.rmdir(lock);}
  }
}
await publish();
console.log(JSON.stringify({status:args.check?'checked':'generated',resources:collection.resources.map(({id,version,sha256,inspection})=>
  ({id,version,sha256,triangles:inspection.triangles,outlet:inspection.outlet,actuator:inspection.actuator}))}));
