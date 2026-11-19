import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildIndoorAdapter, fixedProjectPath, embedSurfaces, verifyAdapterRays, verifyAdapterSweep} from './adapt-indoor-ac.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {PNG} from '../../prototype/node_modules/pngjs/lib/png.js';

const root = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const family = 'assets-source/company-wall-hvac-v1', publicRoot = 'prototype/public/company-assets/wall-hvac-v1';
const generator = 'scripts/company-platform/build-wall-hvac.mjs';
const contractPath = family+'/contract.json', defaults = family+'/parameters.json';
const donorPath = family+'/original/ductless-wall-mounted-indoor-unit.glb';
const dependencies = {adapter:'scripts/company-platform/adapt-indoor-ac.mjs',adapterRecipe:family+'/indoor-adapter.json',
  sourceReceipt:family+'/original/source.json',environmentBranch:'assets-source/company-environment-specs-v1/branches.json'};
const curveSHA = 'e1e8b193196402c0bcc598a8dde03f76541732db500f6958a5677ead7925ea47';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = data => Buffer.from(JSON.stringify(data,null,2)+'\n');
const read = async name=>fs.readFile(await fixedProjectPath(name));
const v = (x,y,z)=>new T.Vector3(x,y,z);
const rounded = values=>values.map(n=>Number(n.toFixed(7))||0);
const box = (w,h,d,x,y,z)=>new T.BoxGeometry(w,h,d).translate(x,y,z);
const merge = parts=>mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p),false);
const range = (n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;

// Extrude an X/Y outline between two depth planes.
function casting(outline,back,front) {
  const shape = new T.Shape(outline.map(([x,y])=>new T.Vector2(x,y)));
  return new T.ExtrudeGeometry(shape,{depth:front-back,bevelEnabled:false}).translate(0,0,back);
}
// The original shell changes front slope at native y=.060, .180 and .260.
// Cross-sections follow its actual profile, so feature roots meet the shell.
function shellFront(y) {
  const sections=[[-.145,.157],[-.085,.192],[.035,.202],[.115,.182],[.145,.142]];
  const i=sections.findIndex(([s])=>s>=y);
  assert(i>0 && i<sections.length);
  const [lo,z0]=sections[i-1], [hi,z1]=sections[i];
  return T.MathUtils.lerp(z0,z1,(y-lo)/(hi-lo));
}
function fascia(left,right,low,high,outerDepth,inset=.004) {
  const ys=[low,...[-.085,.035,.115].filter(y=>y>low && y<high),high];
  const outline=ys.map(y=>[shellFront(y)+outerDepth,y]).concat(ys.toReversed().map(y=>[shellFront(y)-inset,y]));
  // Shape X becomes model Z. Extrusion runs from right to left on model X.
  return casting(outline,0,right-left).rotateY(-Math.PI/2).translate(right,0,0);
}

function style(adapter,d) {
  const scene = adapter.scene;
  if (d.kind==='curve') {
    assert(range(d.bodyWidth,.78,.94),'Curve bodyWidth must be .78–.94 m');
    if(d.bodyWidth!==.8) for(const mesh of scene.children) {
      mesh.geometry.scale(d.bodyWidth/.8,1,1);
      mesh.position.x*=d.bodyWidth/.8;
    }
    return;
  }
  assert([d.finish,d.trim].every(c=>/^#[a-f0-9]{6}$/i.test(c)),'Invalid housing finish');
  const finish=new T.MeshStandardMaterial({name:'hvac-casing-finish',color:d.finish,roughness:.49,metalness:.15});
  const trim=new T.MeshStandardMaterial({name:'hvac-casing-trim',color:d.trim,roughness:.39,metalness:.34});
  function add(name,geometry,material) {
    const mesh=new T.Mesh(geometry,material); mesh.name='wall-ac-'+name; scene.add(mesh);
  }
  if(d.kind==='twin-intake') {
    const end=d.hoodHalfWidth;
    assert(range(end,.43,.49),'Twin intake half width must be .43–.49 m');
    for(const sign of [-1,1]) {
      const side=sign<0?'left':'right';
      const cheek=[[.382,-.049],[end-.015,-.029],[end,.063],[end-.005,.149],
        [end-.024,.171],[.383,.171],[.374,.125]].map(([x,y])=>[sign*x,y]);
      add(side+'-intake-shoulder',casting(cheek,.027,.175),finish);
      // Each open well has a front/rear lip and two side walls. Its interior
      // exposes the seven source intake strips, from rear to front.
      const inner=.011, outer=end-.017, top=.169;
      const x=sign*(outer+inner)/2,w=outer-inner;
      const front=[[inner,.072],[outer-.011,.055],[outer,.076],[outer,.150],
        [outer-.020,top],[inner+.020,top],[inner,.152]].map(([a,b])=>[sign*a,b]);
      add(side+'-intake-fascia',casting(front,.136,.192),finish);
      add(side+'-intake-rim',merge([box(w,.015,.014,x,top-.0075,.013),
        box(.010,.026,.131,sign*(inner+.005),top-.013,.077),
        box(.013,.026,.131,sign*(outer-.0065),top-.013,.077)]),trim);
      add(side+'-fascia-brow',casting([[inner+.017,.100],[outer-.025,.086],
        [outer-.023,.098],[inner+.017,.115]].map(([a,b])=>[sign*a,b]),.191,.198),trim);
    }
  } else if(d.kind==='ribbed') {
    assert(Number.isInteger(d.ribsPerBank) && range(d.ribsPerBank,5,12),'Expected 5–12 ribs per bank');
    const left=-.381,right=.263,low=-.068,high=.114;
    add('ribbed-fascia',fascia(left,right,low,high,.004),finish);
    add('fascia-frame',merge([fascia(left-.010,right+.010,high-.007,high+.009,.014),
      fascia(left-.010,right+.010,low-.007,low+.008,.014),
      fascia(left-.010,left+.004,low+.008,high-.007,.014),
      fascia(right-.004,right+.010,low+.008,high-.007,.014)]),trim);
    const groups=3, bankWidth=.187, gap=.016, start=left+.025;
    for(let g=0;g<groups;g++) {
      const ribs=[];
      for(let i=0;i<d.ribsPerBank;i++) {
        const spacing=bankWidth/d.ribsPerBank,x=start+g*(bankWidth+gap)+(i+.5)*spacing;
        ribs.push(fascia(x-spacing*.20,x+spacing*.20,low+.012,high-.011,.016));
      }
      add('vertical-rib-bank-'+(g+1),merge(ribs),trim);
    }
    // The status window remains on the white service bay, outside the frame.
  } else {
    assert.equal(d.kind,'stepped','Unknown wall HVAC casing design');
    const reach=d.shoulderReach; assert(range(reach,.455,.495),'Stepped shoulder reach must be .455–.495 m');
    for(const sign of [-1,1]) {
      const levels=[[.382,-.075],[reach,-.075],[reach,-.011],[reach-.027,-.011],
        [reach-.027,.056],[reach-.052,.056],[reach-.052,.126],[.382,.126]];
      add((sign<0?'left':'right')+'-three-step-shoulder',
        casting(levels.map(([x,y])=>[x*sign,y]),.025,.170),finish);
    }
    // The middle front casting has a physical break around the source display.
    const bands=[[-.075,-.016,reach,.012],[-.008,.050,reach-.027,.009],[.058,.124,reach-.052,.006]];
    for(const [i,[bottom,top,half,depth]] of bands.entries()) {
      const segments=i===1?[[-half,.278],[.352,half]]:[[-half,half]];
      const faces=segments.map(([a,b])=>fascia(a,b,bottom,top,depth,.030));
      const seams=segments.map(([a,b])=>fascia(a,b,bottom,bottom+.006,depth+.001,.030));
      add('step-face-'+(i+1),merge(faces),finish); add('step-reveal-'+(i+1),merge(seams),trim);
    }
  }
}

async function inspect(bytes,a,contract) {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async blob=>PNG.sync.read(Buffer.from(await blob.arrayBuffer()));
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const blade=scene.getObjectByName(contract.wallHvac.louver);
  assert.equal(blade.rotation.x,0);
  const lamp=scene.getObjectByName(contract.wallHvac.status);
  assert(Math.abs(lamp.material.specularIntensity-.7)<1e-6);
  for(const name of ['body','louver','intake','mount','status']) {
    const part=scene.getObjectByName('wall-ac-'+name);
    assert(part?.material.map?.image?.width===2048 && part.geometry.attributes.uv);
  }
  const hit=(origin,direction)=>new T.Raycaster(origin,direction).intersectObject(scene,true)[0]?.object.name;
  const poses=[];
  const casingParts=new Set(['wall-ac-body',...scene.children.slice(7).map(mesh=>mesh.name)]);
  for(const angle of [0,...contract.wallHvac.modeRadians]) {
    blade.rotation.x=angle;
    const rays=verifyAdapterRays(scene,a.original,angle!==0,a.offset,casingParts).filter(r=>!r.outsideAperture);
    poses.push({angle,first:rays.map(r=>r.actual.mesh),depths:rays.map(r=>r.actual.point[2])});
  }
  blade.rotation.x=0; scene.updateMatrixWorld(true);
  const lampCenter=new T.Box3().setFromObject(lamp,true).getCenter(v());
  for(const dir of [v(0,0,1),v(.20,-.12,1).normalize()]) {
    assert.equal(hit(lampCenter.clone().addScaledVector(dir,.5),dir.clone().negate()),lamp.name,'Status window obscured');
  }
  const intake=scene.getObjectByName('wall-ac-intake'), pos=intake.geometry.attributes.position;
  assert.equal(pos.count,14*24);
  for(let i=0;i<14;i++) {
    const b=new T.Box3();
    for(let k=0;k<24;k++) b.expandByPoint(v().fromBufferAttribute(pos,i*24+k));
    const x=b.getCenter(v()).x;
    for(const f of [.05,.5,.95]) assert.equal(hit(v(x,.35,T.MathUtils.lerp(b.min.z,b.max.z,f)),v(0,-1,0)),intake.name,'Intake strip covered');
  }
  const hash=createHash('sha256'),materials=new Set(); let triangles=0;
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    materials.add(mesh.material.name);
    const g=mesh.geometry,p=g.attributes.position,idx=g.index;
    triangles+=(idx?.count??p.count)/3;
    for(let i=0;i<(idx?.count??p.count);i++)hash.update(rounded(v().fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld).toArray()).join(',')+';');
  });
  // Sample the actual front silhouette in horizontal slices at 2 mm resolution.
  const silhouette=[-.110,-.055,-.025,.020,.078,.118,.158].map(y=>{
    let width=0;
    for(let i=-250;i<=250;i++) if(hit(v(i*.002,y,.6),v(0,0,-1))) width+=.002;
    return {y,width:Number(width.toFixed(3))};
  });
  return {poses,triangles,geometrySha256:hash.digest('hex'),materials:[...materials],intakeProbes:42,statusViews:2,silhouette};
}

const {values:args}=parseArgs({options:{write:{type:'boolean'},check:{type:'boolean'},output:{type:'string'},
  parameters:{type:'string'},help:{type:'boolean'}}});
if(args.help) {
  console.log('node scripts/company-platform/build-wall-hvac.mjs --write | --check | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.write,args.check,Boolean(args.output)].filter(Boolean).length,1,'Select --write, --check or --output NEW_DIRECTORY');
assert(!args.parameters || args.output,'Edited parameters need a fresh --output');
const output=args.output && path.resolve(args.output);
const current=async file=>{
  try{return await fs.lstat(file);}catch(err){if(err.code!=='ENOENT')throw err;return null;}
};
if(output) {
  await checkManagedOutput(output,root,{allowDelivery:false});
  assert(!await current(output),'Trial output already exists: '+output);
}
const input=args.parameters??defaults;
assert(input.endsWith('.json'),'Expected a project-relative JSON parameter file');
const [paramBytes,contractBytes,toolBytes,...depBytes]=await Promise.all([input,contractPath,generator,...Object.values(dependencies)].map(read));
const pins=Object.fromEntries(Object.entries(dependencies).map(([key,file],i)=>[key,{path:file,sha256:digest(depBytes[i])}]));
const parameters=JSON.parse(paramBytes),{schema,version,...contract}=JSON.parse(contractBytes);
const branches=JSON.parse(depBytes[3]).groups.flatMap(g=>g.branches);
const fixed=branches.find(b=>b.id===contract.productionBranch)?.fixedFunctionAndInstall;
assert(schema==='company-wall-hvac-contract' && version===1 && fixed.mount===contract.mount &&
  fixed.parent===contract.parent && fixed.state==='on-off-mode');
assert.deepEqual([contract.mounting.width,contract.mounting.height,contract.mounting.depth],
  [fixed.dimensionsMeters.width,fixed.dimensionsMeters.height,fixed.dimensionsMeters.depth]);
assert.equal(parameters.schema,'company-wall-hvac-collection');assert.equal(parameters.version,1);
assert(Array.isArray(parameters.designs)&&parameters.designs.length);
const defaultIds=['wall-ac-curve','wall-ac-twin-intake','wall-ac-ribbed','wall-ac-stepped'];
if(input===defaults) assert.deepEqual(parameters.designs.map(d=>d.id),defaultIds);
const source=JSON.parse(depBytes[2]);
assert.equal(digest(await read(donorPath)),source.sha256);
const collection={schemaVersion:1,id:'company-wall-hvac-v1',generator,generatorSha256:digest(toolBytes),
  sourceParameters:input,sourceParametersSha256:digest(paramBytes),contract:contractPath,contractSha256:digest(contractBytes),
  sourceManifest:dependencies.sourceReceipt,sourceManifestSha256:pins.sourceReceipt.sha256,resources:[]};
const provenance={license:'CC0-1.0 (retained Innerscene indoor-unit components); project-authored outlet adaptation and casing designs.',
  author:'Innerscene Corp and project authors',tools:['Three.js '+T.REVISION,'GLTFExporter','GLTFLoader readback'],generator,
  generatorSha256:collection.generatorSha256,sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,
  functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
  sourceArtifactPath:donorPath,sourceArtifactSha256:source.sha256,sourceAuthor:source.author,sourceUrl:source.page,sourceLicense:source.license.spdx,
  sourceManifestPath:dependencies.sourceReceipt,sourceManifestSha256:pins.sourceReceipt.sha256,environmentBranch:contract.productionBranch,
  environmentBranchSource:dependencies.environmentBranch,environmentBranchSourceSha256:pins.environmentBranch.sha256,dependencies:pins};
const seen=new Set(), files=new Map(), results=[];
for(const d of parameters.designs) {
  const key=d.id+'@'+d.version;
  assert(/^wall-ac-[a-z0-9][a-z0-9-]{0,56}$/.test(d.id)&&typeof d.displayName==='string'&&d.displayName.trim()&&
    Number.isSafeInteger(d.version)&&d.version>0&&!seen.has(key),'Invalid or duplicate design '+key);
  seen.add(key);
  const a=await buildIndoorAdapter();style(a,d);
  assert.deepEqual(contract.wallHvac.modeRadians,[.8,.68,1].map(x=>x*a.openRadians));
  const sweep=verifyAdapterSweep(a);
  for(const mesh of a.scene.children.slice(7)) assert(new T.Box3().setFromObject(mesh,true).min.y>sweep.sweep.max[1]+.002,
    'Casing enters blade sweep: '+mesh.name);
  const exportScene=async()=>embedSurfaces(await new GLTFExporter().parseAsync(a.scene,{binary:true,trs:true}),a.surfaces);
  const bytes=await exportScene();assert(bytes.equals(await exportScene()),'Model export must reproduce exactly');
  const hash=digest(bytes);
  if(d.kind==='curve'&&d.bodyWidth===.8) assert.equal(hash,curveSHA,'Curve must reuse the verified adapted GLB byte-for-byte');
  const geometry=await inspect(bytes,a,contract);
  const folder=publicRoot+'/'+d.id+'/v'+d.version,modelPath=folder+'/model.glb',resourcePath=folder+'/resource.json';
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:hash,bytes:bytes.length};
  files.set(modelPath,bytes);files.set(resourcePath,json({id:d.id,version:d.version,displayName:d.displayName,...contract,provenance,asset}));
  collection.resources.push({id:d.id,version:d.version,resourcePath,modelPath,sha256:hash,
    geometrySha256:geometry.geometrySha256,triangles:geometry.triangles});
  results.push({id:d.id,asset,sweep,geometry});
}
// Compare three different physical outlines at multiple elevations.
if(input===defaults) {
  const widths=i=>results[i].geometry.silhouette.map(s=>s.width);
  for(const [a,b] of [[0,1],[0,3],[1,3]]) assert(widths(a).filter((w,i)=>Math.abs(w-widths(b)[i])>.035).length>=2,
    'Casing silhouettes need materially different widths at multiple heights');
  assert.equal(new Set(results.map(r=>r.geometry.geometrySha256)).size,4);
}
files.set(family+'/collection.json',json(collection));
if(output) files.set('report.json',json({scope:'Physical GLB readback, full hinge sweep, six outlet rays per pose, status and intake rays, frontal silhouette',resources:results}));

// Staged trial publication is a same-parent rename. Installation never replaces
// an existing version; a hard link exposes each complete file, collection last.
const missing=[];
for(const [relative,bytes] of files) {
  if(output) {missing.push([relative,bytes]); continue;}
  const dest=await fixedProjectPath(relative), stat=await current(dest);
  if(stat) assert(stat.isFile() && bytes.equals(await fs.readFile(dest)),'Existing version differs: '+relative);
  else {assert(!args.check,'Missing installed output: '+relative);missing.push([relative,bytes]);}
}
if(missing.length) {
  const parent=output?path.dirname(output):await fixedProjectPath('output/wall-hvac-v1/four-producer');
  const prefix=path.join(parent,'.wall-hvac-stage-');
  await checkManagedOutput(prefix,root,{allowDelivery:false});
  await fs.mkdir(parent,{recursive:true});
  const stage=await fs.mkdtemp(prefix);
  try {
    for(const [relative,bytes] of missing) {
      const file=path.join(stage,relative);
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});
    }
    if(output) {
      await checkManagedOutput(output,root,{allowDelivery:false});
      assert(!await current(output),'Trial output already exists: '+output);await fs.rename(stage,output);
    } else {
      for(const [relative,bytes] of missing) {
        const dest=await fixedProjectPath(relative);
        await fs.mkdir(path.dirname(dest),{recursive:true});
        try{await fs.link(path.join(stage,relative),dest);}
        catch(e){if(e.code!=='EEXIST' || !bytes.equals(await fs.readFile(await fixedProjectPath(relative))))throw e;}
      }
    }
  } finally {
    if(await current(stage)) {
      assert.equal(path.dirname(await fs.realpath(stage)),await fs.realpath(parent));
      await fs.rm(stage,{recursive:true,force:true});
    }
  }
}
console.log(JSON.stringify({status:'passed',resources:collection.resources}));
