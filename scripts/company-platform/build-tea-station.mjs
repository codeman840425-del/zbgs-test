import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';

const defaultRoot = fileURLToPath(new URL('../../',import.meta.url));
const defaultSource = 'assets-source/company-tea-station-v1';
const runtimePath = 'prototype/public/company-assets';
const generator = 'scripts/company-platform/build-tea-station.mjs';
const geometryPath = 'prototype/src/company/support-geometry.js';
const environment = 'assets-source/company-environment-specs-v1/branches.json';
const family = 'tea-station-v1';
const stockScale = 1.46;
const tol = 1e-6;
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const json = value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const isObject = value=>Boolean(value && typeof value==='object' && !Array.isArray(value));
const color = value=>typeof value==='string' && /^#[a-f\d]{6}$/i.test(value);
const vector = value=>Array.isArray(value) && value.length===3 && value.every(Number.isFinite);
const namePattern = /^[a-z][a-z0-9-]{0,65}$/;
const sourceFile = /^(?:assets-source\/company-|output\/)/;
const v = (...args)=>new THREE.Vector3(...args);
const rect = points=>new THREE.Box3().setFromPoints(points);
const coordinates = point=>point.toArray().map(value=>Number(value.toFixed(8)) || 0);
const shape = box=>({min:coordinates(box.min),max:coordinates(box.max),size:coordinates(box.getSize(v()))});
const fail = (code,location,message,details)=>{throw Object.assign(new Error(message),{code,path:location,details});};

if (typeof globalThis.FileReader==='undefined') globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.({target:this});}).catch(error=>this.onerror?.(error));
  }
};

function projectPath(root,name) {
  assert(typeof name==='string' && !/[\\:\x00-\x1f<>|"?*]/u.test(name) &&
    name.split('/').every(part=>part && !/[. ]$/u.test(part)), 'Invalid portable path: '+name);
  const result=path.resolve(root,name), relative=path.relative(root,result);
  assert(relative && !relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative),'Path escapes the project: '+name);
  return result;
}

async function readRegular(root,name) {
  const filename=projectPath(root,name);
  assert.equal(await fs.realpath(filename),filename,'Linked input: '+name);
  assert((await fs.lstat(filename)).isFile(),'Expected an input file: '+name);
  return fs.readFile(filename);
}

async function readPin(root,pin) {
  assert(isObject(pin) && sourceFile.test(pin.path) && /^[a-f\d]{64}$/.test(pin.sha256),'Invalid source pin: '+pin?.path);
  const bytes=await readRegular(root,pin.path);
  assert.equal(hash(bytes),pin.sha256,'Source hash mismatch: '+pin.path);
  return bytes;
}

async function sourceInput(root,source) {
  assert(isObject(source) && typeof source.author==='string' && source.author.trim() &&
    ['CC0-1.0','Project-authorized-original'].includes(source.license), 'Declare the real source author and permission.');
  const [bytes,license]=await Promise.all([readPin(root,source),readPin(root,{path:source.licensePath,sha256:source.licenseSha256})]);
  assert(license.toString('utf8').trim(),'Empty source license: '+source.licensePath);
  return bytes;
}

async function loadModel(bytes) {
  assert(bytes.length>=24 && bytes.readUInt32LE(0)===0x46546c67 && bytes.readUInt32LE(4)===2 &&
    bytes.readUInt32LE(8)===bytes.length && bytes.readUInt32LE(16)===0x4e4f534a,'Expected a glTF 2 binary asset.');
  const length=bytes.readUInt32LE(12), md=JSON.parse(bytes.subarray(20,20+length));
  assert(length<=bytes.length-20 && md.buffers?.every(buffer=>buffer.uri===undefined) &&
    !md.images?.length && !md.animations?.length && !md.skins?.length && !md.extensionsRequired?.length,
    'Use a local static, untextured triangle GLB with built-in materials.');
  assert(md.meshes.length && md.meshes.every(mesh=>mesh.primitives.every(primitive=>(primitive.mode??4)===4 && !primitive.targets)),
    'Use ordinary triangles with no morph targets.');
  const result=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  result.scene.updateMatrixWorld(true);
  return result.scene;
}

function panel(name,size,position,material) {
  const result=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  result.name=name;
  result.position.set(...position);
  return result;
}

const material = (name,values)=>new THREE.MeshStandardMaterial({name,roughness:.72,...values});

function fitModule(scene,module) {
  const source=new THREE.Box3().setFromObject(scene,true), size=source.getSize(v()), midpoint=source.getCenter(v());
  module.size.forEach((value,axis)=>assert(value>0 && size.getComponent(axis)>0,'Invalid source fit axis '+axis));
  const fit=new THREE.Group();
  fit.name=module.name;
  fit.scale.set(...module.size.map((value,axis)=>value/size.getComponent(axis)));
  fit.add(scene);
  const [x,z]=module.center, anchor=v(midpoint.x,source.min.y,midpoint.z).multiply(fit.scale);
  fit.position.set(x-anchor.x,module.bottom-anchor.y,z-anchor.z);
  return fit;
}

function counterModel(root,design,contract,sourceBytes) {
  assert(Number.isFinite(design.topThickness) && design.topThickness>=.018 && design.topThickness<=.065 &&
    isObject(design.palette) && ['top','case','accent','metal'].every(key=>color(design.palette[key])) &&
    Object.keys(design.palette).length===4 && Array.isArray(design.modules) && design.modules.length>=1 && design.modules.length<=6 &&
    Array.isArray(design.panels) && design.panels.length>=2 && design.panels.length<=30,
    'A counter requires a safe countertop thickness, four finishes, editable panels and actual furniture modules.');
  assert(design.modules.some(module=>module.source===design.source),'The declared main source must occur in the design.');
  const {width,height,depth}=contract.mounting;
  const finishes=Object.fromEntries(Object.entries(design.palette).map(([key,value])=>
    [key,material('tea-'+key,{color:value,metalness:key==='metal'?.23:0})]));
  root.add(panel('countertop',[width,design.topThickness,depth],[0,height-design.topThickness/2,0],finishes.top));
  const ids=new Set(['countertop']);
  function claim(entry) {
    assert(isObject(entry) && namePattern.test(entry.name) && !ids.has(entry.name) && vector(entry.size) &&
      entry.size.every(n=>n>.001),'Every counter part needs a unique name and positive metres.');
    ids.add(entry.name);
  }
  for (const entry of design.panels) {
    claim(entry);
    assert(vector(entry.center) && Object.hasOwn(finishes,entry.finish),'Invalid panel position or finish: '+entry.name);
    root.add(panel(entry.name,entry.size,entry.center,finishes[entry.finish]));
  }
  return Promise.all(design.modules.map(async module=>{
    claim(module);
    assert(Array.isArray(module.center) && module.center.length===2 && module.center.every(Number.isFinite) &&
      Number.isFinite(module.bottom),'Require two-axis module position and bottom height: '+module.name);
    const bytes=sourceBytes.get(module.source);
    assert(bytes,'Use an archived furniture module or the declared primary source: '+module.source);
    return fitModule(await loadModel(bytes),module);
  })).then(parts=>{root.add(...parts);});
}

function triangleRecords(object,postMatrix=new THREE.Matrix4()) {
  const result=[];
  object.updateWorldMatrix(true,true);
  object.traverse(mesh=>{
    if (!mesh.isMesh) return;
    const geometry=mesh.geometry, position=geometry.getAttribute('position'), normal=geometry.getAttribute('normal');
    const index=geometry.index, transform=postMatrix.clone().multiply(mesh.matrixWorld), normals=new THREE.Matrix3().getNormalMatrix(transform);
    const uv=geometry.getAttribute('uv'), count=index?.count??position.count;
    assert(normal && mesh.material?.isMeshStandardMaterial && Number.isInteger(count/3),'Malformed source triangle primitive: '+mesh.name);
    for (let offset=0;offset<count;offset+=3) {
      const vertices=[0,1,2].map(delta=>{
        const i=index?index.getX(offset+delta):offset+delta;
        return {position:v().fromBufferAttribute(position,i).applyMatrix4(transform),
          normal:v().fromBufferAttribute(normal,i).applyNormalMatrix(normals), uv:uv?[uv.getX(i),uv.getY(i)]:undefined};
      });
      result.push({vertices,material:mesh.material});
    }
  });
  return result;
}

const positions = triangle=>triangle.vertices.map(vertex=>vertex.position);
const triangleBox = triangle=>rect(positions(triangle));
const extents = triangles=>rect(triangles.flatMap(positions));

function bake(name,triangles,finish=triangles[0]?.material) {
  assert(triangles.length,'No physical triangles for '+name);
  const vertices=triangles.flatMap(triangle=>triangle.vertices), geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(vertex=>vertex.position.toArray()),3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(vertices.flatMap(vertex=>vertex.normal.toArray()),3));
  if (vertices.every(vertex=>vertex.uv)) geometry.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap(vertex=>vertex.uv),2));
  const mesh=new THREE.Mesh(geometry,finish);
  mesh.name=name;
  return mesh;
}

function fitTeaSource(source,kind) {
  const cup=source.getObjectByName('mug');
  assert(cup?.isMesh,'Expected the original independent mug primitive.');
  let selected=cup;
  if (kind==='machine') {cup.removeFromParent();selected=source;}
  const scale=new THREE.Matrix4().makeScale(stockScale,stockScale,stockScale);
  const first=triangleRecords(selected,scale), box=extents(first), center=box.getCenter(v());
  const translate=v(-center.x,-box.min.y,-center.z);
  for (const triangle of first) for (const vertex of triangle.vertices) vertex.position.add(translate);
  return first;
}

function machineModel(root,triangles,resource) {
  const traySpec=resource.supportSurfaces[0];
  const [x,z]=traySpec.center, [hx,hz]=traySpec.halfSize, top=traySpec.topY, headroom=top+traySpec.clearanceHeight;
  const tray=[], body=new Map();
  for (const triangle of triangles) {
    const box=triangleBox(triangle), points=positions(triangle);
    const face=new THREE.Triangle(...points);
    if (box.min.x<x-hx && box.max.x>x+hx && box.min.z<z-hz && box.max.z>z+hz &&
        points.every(point=>Math.abs(point.y-top)<tol) && face.getNormal(v()).y>.999) {
      tray.push(triangle);
      continue;
    }
    // Keep the original triangles and colours. Bounds of each part stay on one
    // side of the real cup opening so the shared AABB support guard remains valid.
    const region=box.max.y<=top+tol?'base':box.min.y>=headroom-tol?'head':
      box.max.x<=x-hx+tol?'left':box.min.x>=x+hx-tol?'right':
      box.max.z<=z-hz+tol?'rear':box.min.z>=z+hz-tol?'front':null;
    assert(region,'Original machine geometry enters the cup volume: '+JSON.stringify(shape(box)));
    const key=region+'-'+triangle.material.name.toLowerCase();
    if (!body.has(key)) body.set(key,[]);
    body.get(key).push(triangle);
  }
  assert.equal(tray.length,2,'The author tray has two actual top triangles.');
  root.add(bake(resource.supportNodes.tray,tray));
  for (const [key,parts] of [...body].sort(([a],[b])=>a.localeCompare(b))) root.add(bake('tea-machine-'+key,parts));
  root.updateMatrixWorld(true);
  const xLamp=-.045,yLamp=.22;
  const ray=new THREE.Raycaster(v(xLamp,yLamp,.24),v(0,0,-1),0,.42);
  const front=ray.intersectObject(root,true)[0];
  assert(front?.face.normal.z>.98,'Expected a physical front fascia for the lamp.');
  const ringMaterial=material('tea-machine-indicator-rim',{color:'#28323a',metalness:.26});
  const ledMaterial=material('tea-machine-led-off',{color:resource.display.status.offColor,roughness:.35});
  function button(name,radius,length,offset,finish) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,20),finish);
    mesh.name=name;
    mesh.rotation.x=Math.PI/2;
    mesh.position.set(xLamp,yLamp,front.point.z+offset);
    root.add(mesh);
  }
  button('tea-machine-indicator-rim',.008,.003,.0005,ringMaterial);
  button(resource.display.status.nodes[0],.005,.003,.0028,ledMaterial);
}

function inspectModel(scene,resource) {
  const all=triangleRecords(scene), bounds=extents(all), {width,height,depth}=resource.mounting;
  const want=[width,height,depth], support=validateSupportGeometry(scene,resource,fail);
  assert(Math.abs(bounds.min.y)<=tol && bounds.max.y<=height+tol && Math.abs(bounds.min.x+bounds.max.x)<=tol &&
    Math.abs(bounds.min.z+bounds.max.z)<=tol && bounds.getSize(v()).toArray().every((n,i)=>n<=want[i]+tol),
    'Physical dimensions exceed the bottom-centred envelope: '+JSON.stringify(shape(bounds)));
  if (resource.mountRole==='tea-counter')
    assert(bounds.getSize(v()).toArray().every((n,i)=>Math.abs(n-want[i])<=tol),'The four counters share actual external dimensions.');
  const contacts=all.map(positions).filter(points=>points.every(point=>Math.abs(point.y)<=tol));
  const contactArea=contacts.reduce((total,points)=>{
    const triangle=new THREE.Triangle(...points);
    return total+(triangle.getNormal(v()).y<-.98 ? triangle.getArea() : 0);
  },0);
  assert(contactArea>1e-6,'The asset base must have a downward-facing floor or support contact of nonzero area.');
  const supports=(resource.supportSurfaces??[]).map(spec=>{
    const [x,z]=spec.center,[hx,hz]=spec.halfSize;
    const locations=[-.98,0,.98].flatMap(dx=>[-.98,0,.98].map(dz=>[x+dx*hx,z+dz*hz]));
    const hits=locations.map(([sx,sz])=>{
      const cast=new THREE.Raycaster(v(sx,spec.topY+spec.clearanceHeight-.001,sz),v(0,-1,0),0,spec.clearanceHeight+.005);
      const hit=cast.intersectObject(scene,true)[0];
      assert(hit?.object.name===resource.supportNodes[spec.id] && Math.abs(hit.point.y-spec.topY)<tol,'Ray missed the declared actual support: '+spec.id);
      return coordinates(hit.point);
    });
    return {id:spec.id,node:resource.supportNodes[spec.id],hits};
  });
  const names=[];
  scene.traverse(mesh=>{if(mesh.isMesh) names.push(mesh.name);});
  const status=resource.display?.status;
  if (status) {
    const led=scene.getObjectByName(status.nodes[0]);
    assert(led?.isMesh && led.material.emissive && led.material.color,'Indicator needs a real separately controllable material.');
    const center=new THREE.Box3().setFromObject(led,true).getCenter(v());
    const hit=new THREE.Raycaster(v(center.x,center.y,.30),v(0,0,-1)).intersectObject(scene,true)[0];
    assert.equal(hit?.object,led,'Indicator must be visible from the actual machine front.');
  }
  assert(names.length<=64 && all.length<=3500,'Tea station assets exceed the intended lightweight geometry budget.');
  const geometrySha256=hash(json(all.map(triangle=>positions(triangle).map(coordinates))));
  return {bounds:shape(bounds),nodes:names,triangles:all.length,geometrySha256,actualBaseContactArea:contactArea,actualSupports:supports,support};
}

async function exportModel(design,resource,sourceBytes) {
  const root=new THREE.Group();
  root.name=design.id;
  if (design.kind==='counter') await counterModel(root,design,resource,sourceBytes);
  else {
    const triangles=fitTeaSource(await loadModel(sourceBytes.get(design.source)),design.kind);
    if (design.kind==='machine') machineModel(root,triangles,resource);
    else {
      assert(color(design.glaze),'Specify a ceramic glaze colour.');
      root.add(bake('tea-cup-ceramic',triangles,material('tea-cup-glaze',{color:design.glaze,roughness:.31})));
    }
  }
  return Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true}));
}

async function main() {
  const {values:args}=parseArgs({options:{check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'},
    parameters:{type:'string'},root:{type:'string'},source:{type:'string'},'asset-root':{type:'string'},help:{type:'boolean'}}});
  if (args.help) {
    console.log('node scripts/company-platform/build-tea-station.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON] [--root PROJECT] [--source PROJECT_RELATIVE_SOURCE_DIR] [--asset-root COMPANY_ASSETS_ROOT]');
    return;
  }
  assert.equal([args.check,args.write,Boolean(args.output)].filter(Boolean).length,1,'Choose one export mode.');
  assert(!args.parameters || args.output,'Use a new output directory for alternate recipes.');
  const root=await fs.realpath(args.root??defaultRoot), sourceDir=args.source??defaultSource;
  assert(sourceDir.startsWith('assets-source/company-'),'Use a portable company source directory.');
  const recipePath=args.parameters??sourceDir+'/parameters.json', contractPath=sourceDir+'/contract.json';
  const sourceRecordPath=sourceDir+'/original/sources.json';
  assert(sourceFile.test(recipePath),'Use a portable company recipe path.');
  const [recipeBytes,contractBytes,sourceRecordBytes,environmentBytes,scriptBytes,geometryBytes]=await Promise.all(
    [recipePath,contractPath,sourceRecordPath,environment,generator,geometryPath].map(name=>readRegular(root,name)));
  const recipe=JSON.parse(recipeBytes), contract=JSON.parse(contractBytes), record=JSON.parse(sourceRecordBytes);
  assert(recipe.schema==='company-tea-station-collection' && recipe.version===1 && isObject(recipe.sources) &&
    Array.isArray(recipe.designs) && recipe.designs.length>0,'Expected a tea-station collection of editable designs.');
  assert(contract.schema==='company-tea-station-contract' && contract.version===1 && contract.environmentBranch==='tea-rest');
  assert(record.schema==='company-tea-station-sources' && record.version===1 && isObject(record.sources));
  const branch=JSON.parse(environmentBytes).groups.flatMap(group=>group.branches).find(item=>item.id===contract.environmentBranch);
  const {width,height,depth}=branch.fixedFunctionAndInstall.dimensionsMeters;
  assert.deepEqual([width,height,depth],[1.2,.9,.6]);
  assert.deepEqual(contract.resources.counter.mounting,{origin:'bottom',width,height,depth});
  await readPin(root,record.archive);

  const stock=new Map(), stockDependencies={};
  for (const [name,source] of Object.entries(record.sources)) {
    stock.set(name,await sourceInput(root,source));
    stockDependencies['original-'+name]={path:source.path,sha256:source.sha256};
  }
  const collection={schemaVersion:1,id:'company-'+family,sourceParameters:recipePath,sourceParametersSha256:hash(recipeBytes),
    contract:contractPath,contractSha256:hash(contractBytes),generator,generatorSha256:hash(scriptBytes),resources:[]};
  const files=new Map(), reports=[], cabinetShapes=[];
  for (const design of recipe.designs) {
    const {id,version,displayName,kind,source:sourceKey}=design;
    assert(typeof id==='string' && namePattern.test(id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(id) &&
      Number.isSafeInteger(version) && version>0 && typeof displayName==='string' && displayName.trim() &&
      Object.hasOwn(contract.resources,kind) && Object.hasOwn(recipe.sources,sourceKey),'Invalid resource identity, production kind or source.');
    const keys=['kind','id','version','displayName','source',...(kind==='counter'?['topThickness','palette','panels','modules']:kind==='cup'?['glaze']:[])];
    assert.deepEqual(Object.keys(design).sort(),keys.sort(),'Unknown or missing fields on '+id);
    const source=recipe.sources[sourceKey], inputs=new Map(stock);
    const primary=await sourceInput(root,source);
    if (stock.has(sourceKey))
      assert.deepEqual(source,record.sources[sourceKey],'Use a new source name for different input bytes or attribution.');
    inputs.set(sourceKey,primary);
    const resource=structuredClone(contract.resources[kind]);
    validateSupportResource(resource,fail,id);
    const model=await exportModel(design,resource,inputs);
    assert(model.equals(await exportModel(design,resource,inputs)),'Repeated GLB export produced different bytes: '+id);
    const geometry=inspectModel(await loadModel(model),resource);
    if (kind==='counter') cabinetShapes.push(geometry.geometrySha256);
    const modelUrl='/company-assets/'+family+'/'+id+'/v'+version, modelPath='prototype/public'+modelUrl+'/model.glb';
    const resourcePath='prototype/public'+modelUrl+'/resource.json';
    assert(!files.has(modelPath),'Duplicate version: '+id+'@'+version);
    const provenance={license:source.license+' source with project geometry and fitting.',sourceDesign:kind,sourceAuthor:source.author,
      sourceLicense:source.license,sourceUrl:source.url,sourceArtifactPath:source.path,sourceArtifactSha256:source.sha256,
      sourceArchiveSha256:record.sources[sourceKey]?.sha256===source.sha256 ? record.archive.sha256 : undefined,
      sourceEntry:source.entry,sourceParameters:recipePath,sourceParametersSha256:collection.sourceParametersSha256,
      generator,generatorSha256:collection.generatorSha256,functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
      environmentBranch:branch.id,environmentBranchSource:environment,environmentBranchSourceSha256:hash(environmentBytes),
      dependencies:{sourceRecord:{path:sourceRecordPath,sha256:hash(sourceRecordBytes)},sourceArchive:{path:record.archive.path,sha256:record.archive.sha256},
        geometryValidation:{path:geometryPath,sha256:hash(geometryBytes)},license:{path:source.licensePath,sha256:source.licenseSha256},
        ...stockDependencies},tools:[`Three.js r${THREE.REVISION}`,'GLTFLoader','GLTFExporter']};
    const asset={format:'glb',url:modelUrl+'/model.glb',bytes:model.length,sha256:hash(model)};
    files.set(modelPath,model);
    files.set(resourcePath,json({id,version,displayName,...resource,provenance,asset}));
    collection.resources.push({id,version,modelPath,resourcePath,sha256:asset.sha256,geometrySha256:geometry.geometrySha256,
      triangles:geometry.triangles});
    reports.push({id,version,asset,geometry});
  }
  assert.equal(new Set(cabinetShapes).size,cabinetShapes.length,'Counter designs must have genuinely different meshes.');
  files.set(sourceDir+'/collection.json',json(collection));
  const output=args.output?path.resolve(args.output):root;
  const assetsRoot=args['asset-root']?path.resolve(output,args['asset-root']):path.join(output,runtimePath);
  if (args.output) {
    const relative=path.relative(output,assetsRoot);
    assert(relative && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative),
      'Asset root must stay inside the isolated export directory.');
    files.set('report.json',json({status:'passed',resources:reports}));
  }
  const additions=[];
  for (const [filename,bytes] of files) {
    const target=filename.startsWith(runtimePath+'/')?path.join(assetsRoot,filename.slice(runtimePath.length+1)):path.join(output,filename);
    const existing=await fs.readFile(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if (existing!==null) assert(existing.equals(bytes),'Existing output differs. Choose a new version or directory: '+filename);
    else {assert(!args.check,'Missing recorded output: '+filename);additions.push([target,bytes]);}
  }
  if (args.output) await fs.mkdir(output);
  for (const [target,bytes] of additions) {
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,bytes,{flag:'wx'});
  }
  console.log(JSON.stringify({status:'passed',resources:collection.resources},null,2));
}

try {await main();}
catch (error) {
  console.error(JSON.stringify({code:error.code??'tea-station-generation-failed',path:error.path,message:error.message,details:error.details}));
  process.exitCode=1;
}
