import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';

const root = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const family = 'assets-source/company-floor-air-v1';
const models = 'prototype/public/company-assets/floor-air-v1';
const generator = 'scripts/company-platform/build-floor-air.mjs';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = data => Buffer.from(JSON.stringify(data, null, 2) + '\n');
const v = (...a) => new T.Vector3(...a);
const radians = T.MathUtils.degToRad;
const tau = 2 * Math.PI;
const indices = count => Array.from({ length: count }, (_, i) => i);
const indicNames = ['air-power-indicator', 'air-speed-1', 'air-speed-2', 'air-speed-3'];
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend(); }); }
};

async function safeFile(relative) {
  assert(typeof relative === 'string' && relative.split('/').every(p => /^[\w.-]+$/.test(p) && !p.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)),
    'Expected a portable project-relative path: ' + relative);
  let file = root;
  for (const segment of relative.split('/')) {
    file = path.join(file, segment);
    try {
      const stat = await fs.lstat(file);
      assert(!stat.isSymbolicLink() && await fs.realpath(file) === file, 'Linked path: ' + file);
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  return file;
}
const read = async relative => fs.readFile(await safeFile(relative));
const parseGlb = async bytes => (await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;

// The author's three blades share one indexed material. The positive-X blade has
// 20 independent triangles, and lies entirely to the right of the original hub.
async function extractBlade(source) {
  const [bytes, licence] = await Promise.all([read(source.path), read(source.licensePath)]);
  assert.equal(digest(bytes), source.sha256);
  assert.equal(digest(licence), source.licenseSha256);
  const scene = await parseGlb(bytes);
  scene.updateMatrixWorld(true);
  let blade;
  scene.traverse(node => {
    if (node.material?.name !== 'wood') return;
    const geom = node.geometry.toNonIndexed().applyMatrix4(node.matrixWorld);
    const pos = geom.getAttribute('position'), normal = geom.getAttribute('normal');
    const coords = [], normals = [];
    for (let i = 0; i < pos.count; i += 3) {
      if (![0, 1, 2].every(k => pos.getX(i + k) > .04)) continue;
      for (const k of [0, 1, 2]) {
        coords.push(pos.getX(i+k), pos.getY(i+k), pos.getZ(i+k));
        normals.push(normal.getX(i+k), normal.getY(i+k), normal.getZ(i+k));
      }
    }
    assert.equal(coords.length, 180, 'Expected the original 20-triangle blade');
    blade = new T.BufferGeometry();
    blade.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
    blade.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    blade.translate(0, .060, .0012).rotateX(Math.PI / 2);
  });
  assert(blade, 'Missing Kenney wood blade');
  return blade;
}

function plate(w, h, depth, radius) {
  const x = w / 2, y = h / 2, r = Math.min(radius, x, y);
  const p = new T.Shape();
  p.moveTo(-x+r,-y); p.lineTo(x-r,-y); p.quadraticCurveTo(x,-y,x,-y+r);
  p.lineTo(x,y-r); p.quadraticCurveTo(x,y,x-r,y);
  p.lineTo(-x+r,y); p.quadraticCurveTo(-x,y,-x,y-r);
  p.lineTo(-x,-y+r); p.quadraticCurveTo(-x,-y,-x+r,-y);
  return new T.ExtrudeGeometry(p,{depth,bevelEnabled:false,curveSegments:3}).translate(0,0,-depth/2);
}
const box = (w,h,d) => new T.BoxGeometry(w,h,d);
const drum = (r1,r2,h,n=32) => new T.CylinderGeometry(r1,r2,h,n);
const face = (r,d) => drum(r,r,d).rotateX(Math.PI/2);
const ring = (r,t) => new T.TorusGeometry(r,t,5,36);
function strut(a,b,r,sides=7) {
  const start=v(...a),end=v(...b),direction=end.clone().sub(start);
  return drum(r,r,direction.length(),sides).applyQuaternion(new T.Quaternion()
    .setFromUnitVectors(v(0,1,0),direction.normalize())).translate(...start.lerp(end,.5).toArray());
}
const joined = parts => mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g), false);

function model(d, contract, donorBlade) {
  const rootNode = new T.Group();
  rootNode.name = d.id;
  const palette = {};
  for (const [key,c] of Object.entries(d.finishes)) {
    assert(/^#[a-f0-9]{6}$/i.test(c));
    palette[key] = new T.MeshStandardMaterial({name:'air-'+key,color:c,roughness:key==='metal'?.40:.63,metalness:key==='metal'?.45:.08});
  }
  const slots = {};
  function add(name, geometry, slot, at=[0,0,0], parent=rootNode) {
    assert(palette[slot] && !rootNode.getObjectByName(name), 'Invalid part ' + name);
    const mesh = new T.Mesh(geometry,palette[slot]);
    mesh.name=name; mesh.position.fromArray(at);
    parent.add(mesh); (slots[slot] ??= []).push(name);
    return mesh;
  }
  function controls(y,z,parent=rootNode) {
    add('control-bezel',plate(.147,.045,.012,.015),'insert',[0,y,z],parent);
    indicNames.forEach((name,i) => {
      const lamp = contract.display[i ? 'speed'+i : 'power'];
      palette[name] = new T.MeshStandardMaterial({name:name+'-lens',color:lamp.offColor,roughness:.4});
      const lens = i ? plate(.016,.010+i*.004,.004,.003) : face(.012,.004);
      const x = [-.047,-.010,.017,.044][i];
      add(name,lens,name,[x,y+(i ? (i-2)*.002 : 0),z+.008],parent);
    });
  }
  // Identical physical underside and mount envelope across the family.
  add('weighted-foot',drum(.193,.2,.018,32),'insert',[0,.009,0]);
  add('base-shoulder',drum(.144,.193,.023,32),'shell',[0,.0295,0]);

  if (d.mechanism === 'tower') {
    const w=d.bodyWidth;
    assert(w>=.19 && w<=.29 && Number.isInteger(d.outletRows) && d.outletRows>=8 && d.outletRows<=24);
    add('turntable-neck',drum(.065,.072,.052),'trim',[0,.062,0]);
    const cap = (width,depth,height) => plate(width,depth,height,.038).rotateX(-Math.PI/2);
    add('lower-fascia',cap(w,.168,.09),'shell',[0,.131,0]);
    add('rear-housing',cap(w,.11,.558),'shell',[0,.454,-.029]);
    add('outlet-dark-plenum',box(w-.034,.535,.017),'insert',[0,.452,.029]);
    add('outlet-side-stiles',joined([-1,1].map(s=>box(.020,.56,.108).translate(s*(w/2-.012),.454,.023))),'shell');
    add('transverse-vanes',joined(indices(d.outletRows).map(i=>box(w-.038,.008,.050).rotateX(-.21)
      .translate(0,.201+i*.5/(d.outletRows-1),.056))),'metal');
    add('upper-fascia',cap(w,.168,.076),'shell',[0,.762,0]);
    add('fascia-trim',cap(w+.002,.17,.007),'trim',[0,.726,0]);
    controls(.761,.085);
  } else if (d.mechanism === 'purifier') {
    const w=d.bodyWidth,n=d.inletColumns;
    assert(w>=.28 && w<=.36 && Number.isInteger(n) && n>=8 && n<=18 && Number.isInteger(d.outletRows) && d.outletRows>=4 && d.outletRows<=12);
    const cap = h => plate(w,.247,h,.033).rotateX(-Math.PI/2);
    add('lower-shell',cap(.091),'shell',[0,.0865,0]);
    add('filter-well-back',box(w-.036,.56,.196),'insert',[0,.389,-.006]);
    add('filter-side-shells',joined([-1,1].map(s=>plate(.026,.24,.637,.012).rotateX(-Math.PI/2)
      .translate(s*(w/2-.013),.424,0))),'shell');
    add('intake-pleated-screen',joined(indices(n).map(i=>box(.012,.518,.023).rotateY(.25)
      .translate(-(w-.064)/2+i*(w-.064)/(n-1),.398,.104))),'trim');
    add('filter-door-rails',joined([.14,.4,.653].map(y=>box(w-.038,.009,.017).translate(0,y,.116))),'shell');
    add('upper-control-shell',cap(.081),'shell',[0,.7045,0]);
    add('top-discharge-well',box(w-.03,.030,.192),'insert',[0,.752,0]);
    add('top-outlet-rails',joined([-1,1].flatMap(s=>[
      box(.019,.055,.213).translate(s*(w/2-.0095),.7725,0),
      plate(w-.026,.022,.055,.011).rotateX(-Math.PI/2).translate(0,.7725,s*.112)
    ])),'shell');
    add('top-discharge-louvres',joined(indices(d.outletRows).map(i=>box(w-.048,.022,.013).rotateX(-.25)
      .translate(0,.775,-.082+.164*i/(d.outletRows-1)))),'trim');
    controls(.706,.124);
  } else {
    const tilted=d.mechanism==='circulator';
    assert(tilted || d.mechanism==='pedestal');
    assert(Number.isInteger(d.bladeCount) && d.bladeCount>=3 && d.bladeCount<=7 &&
      d.chordScale>=1 && d.chordScale<=2.5 && d.pitchDegrees>=6 && d.pitchDegrees<=28 &&
      Number.isInteger(d.guardSpokes) && d.guardSpokes>=8 && d.guardSpokes<=20);
    const head=new T.Group(), rotor=new T.Group();
    head.name='fan-pivot'; rotor.name='air-rotor';
    head.position.set(0,tilted?.549:.608,-.008);
    rootNode.add(head); head.add(rotor);
    if (tilted) {
      assert(d.tiltDegrees>=10 && d.tiltDegrees<=28);
      head.rotation.x=-radians(d.tiltDegrees);
      // Independent tubular chassis and top grip support a deep, upward-facing barrel.
      add('twin-yoke',joined([-1,1].flatMap(s=>[
        strut([s*.10,.039,-.071],[s*.182,.337,-.080],.011),
        strut([s*.10,.039,.075],[s*.182,.337,-.080],.011),
        strut([s*.182,.337,-.080],[s*.182,.549,-.008],.012),
        strut([s*.182,.549,-.008],[s*.113,.786,-.05],.009)
      ])),'trim');
      add('carry-grip',strut([-.113,.786,-.05],[.113,.786,-.05],.014,8),'insert');
      add('pivot-caps',joined([-1,1].map(s=>drum(.023,.023,.019).rotateZ(Math.PI/2).translate(s*.178,.549,-.008))),'metal');
      controls(.265,.029);
      add('control-brace',strut([-.163,.266,-.024],[.163,.266,-.024],.014),'trim');
      add('control-mount',box(.116,.034,.05),'trim',[0,.265,0]);
      const duct = new T.LatheGeometry([[.150,-.107],[.165,-.105],[.176,-.047],[.178,.070],[.174,.085],[.158,.085],[.154,.065],[.148,-.087],[.150,-.107]]
        .map(([x,y])=>new T.Vector2(x,y)),36).rotateX(Math.PI/2);
      add('duct-shell',duct,'shell',[0,0,0],head);
    } else {
      add('column-lower',drum(.031,.045,.239),'shell',[0,.158,0]);
      add('telescoping-shaft',drum(.015,.015,.267),'metal',[0,.398,-.003]);
      add('column-collar',drum(.035,.035,.021),'trim',[0,.270,0]);
      add('pivot-support',strut([0,.484,-.003],[0,.609,-.063],.021),'trim');
      add('motor-case',face(.064,.083),'shell',[0,0,-.051],head);
      add('stem-control-housing',plate(.15,.058,.038,.017),'shell',[0,.225,.011]);
      controls(.225,.031);
    }
    const radius=tilted?.165:.187;
    const hubDepth=tilted?.025:.017;
    rotor.position.z=hubDepth;
    for (const i of indices(d.bladeCount)) {
      const g=donorBlade.clone().scale((radius-.015)/.285,(radius-.015)/.285*d.chordScale,.63)
        .rotateX(radians(d.pitchDegrees)).rotateZ(i*tau/d.bladeCount+.16);
      add('rotor-blade-'+(i+1),g,'blade',undefined,rotor);
    }
    add('rotor-hub',face(.059,.042),'trim',undefined,rotor);
    const z=tilted?.088:.063;
    const rings=tilted?[.51,.76,1]:[.40,.59,.79,1];
    add('fixed-grille-rings',joined(rings.map(f=>ring(radius*f,f===1?.005:.0023)
      .translate(0,0,z+.014*(1-f)))),'metal',undefined,head);
    add('fixed-grille-spokes',joined(indices(d.guardSpokes).map(i=>{
      const a=i*tau/d.guardSpokes;
      return strut([.022*Math.cos(a),.022*Math.sin(a),z+.019],[radius*Math.cos(a+.18),radius*Math.sin(a+.18),z],.0025,5);
    })),'trim',undefined,head);
    add('grille-medallion',face(.031,.011),'shell',[0,0,z+.019],head);
    const rearZ=tilted?-.106:-.035;
    add('rear-cage',joined([ring(radius*(tilted?.92:1),.0035).translate(0,0,rearZ),...indices(10).map(i=>{
      const a=i*tau/10,cs=Math.cos(a),sn=Math.sin(a);
      return strut([cs*.043,sn*.043,rearZ-.016],[cs*radius*(tilted?.92:1),sn*radius*(tilted?.92:1),rearZ],.0025,5);
    }),...(tilted?[]:indices(10).map(i=>{const a=i*tau/10;
      return strut([radius*Math.cos(a),radius*Math.sin(a),rearZ],[radius*Math.cos(a),radius*Math.sin(a),z],.0027,5);
    }))]),'metal',undefined,head);
  }
  return {rootNode,slots};
}

const rounded = xyz => xyz.map(n => Number(n.toFixed(7)) || 0);
async function inspect(bytes, design) {
  const scene = await parseGlb(bytes);
  scene.updateMatrixWorld(true);
  const bounds=new T.Box3().makeEmpty(), geometryHash=createHash('sha256');
  const parts=[], hitNodes=new Set();
  let contactArea=0, triangles=0;
  scene.traverse(part=>{
    assert(!part.isLight,'An indicator must never be a scene light');
    if (!part.isMesh) return;
    assert(!hitNodes.has(part.name) && part.material.isMeshStandardMaterial);
    hitNodes.add(part.name);
    const geom=part.geometry, pos=geom.getAttribute('position'), idx=geom.index;
    const count=idx?.count ?? pos.count;
    const p=[v(),v(),v()];
    for(let i=0;i<count;i+=3){
      for(let k=0;k<3;k++){
        p[k].fromBufferAttribute(pos,idx ? idx.getX(i+k) : i+k).applyMatrix4(part.matrixWorld);
        assert(p[k].toArray().every(Number.isFinite));
        bounds.expandByPoint(p[k]);
      }
      geometryHash.update(p.map(pt=>rounded(pt.toArray()).join(',')).sort().join(':')+'|');
      if(p.every(pt=>Math.abs(pt.y)<1e-7)) contactArea+=new T.Triangle(...p).getArea();
    }
    parts.push(part);
    triangles+=count/3;
  });
  const size=rounded(bounds.getSize(v()).toArray());
  assert(size.every((n,a)=>Math.abs(n-[.4,.8,.4][a])<.000001),
    design.id+' measured external size '+size+' (expected 0.40 × 0.80 × 0.40)');
  assert(Math.abs(bounds.min.y)<1e-7 && Math.abs(bounds.max.x+bounds.min.x)<1e-7 &&
    Math.abs(bounds.max.z+bounds.min.z)<1e-7 && contactArea>.12 && contactArea<.126, 'Physical base or centred mount differs');
  const ray = new T.Raycaster();
  function first(target,direction) {
    ray.set(target.clone().addScaledVector(direction,1),direction.clone().negate());
    return ray.intersectObjects(parts,false)[0]?.object.name;
  }
  const indicators=indicNames.map(name=>{
    const mesh=scene.getObjectByName(name);
    assert(mesh?.isMesh && mesh.material.name===name+'-lens' && mesh.material.emissive.getHex()===0);
    const center=mesh.getWorldPosition(v());
    for(const direction of [v(0,0,1),v(.48,.38,1).normalize()]) assert.equal(first(center,direction),name,'Obscured lens '+name);
    return {node:name,center:rounded(center.toArray()),frontVisible:true,obliqueVisible:true};
  });
  const rotor=scene.getObjectByName('air-rotor');
  let rotorProbe;
  if (['pedestal','circulator'].includes(design.mechanism)) {
    assert.equal(rotor?.children.filter(c=>c.name.startsWith('rotor-blade-')).length,design.bladeCount);
    const axis=v(0,0,1).transformDirection(rotor.matrixWorld), centre=rotor.getWorldPosition(v());
    assert(Math.abs(axis.x)<1e-6 && axis.dot(v(0,0,1))>.87);
    const visibleBlades=new Set();
    for(const i of indices(48)) for(const r of [.09,.117,.137]){
      const a=i*tau/48, target=rotor.localToWorld(v(r*Math.cos(a),r*Math.sin(a),0));
      const hit=first(target,axis);
      if(hit?.startsWith('rotor-blade-')) visibleBlades.add(hit);
    }
    assert.equal(visibleBlades.size,design.bladeCount,'Every blade must be visible through physical grille openings');
    rotorProbe={node:rotor.name,center:rounded(centre.toArray()),axis:rounded(axis.toArray()),visibleBlades:[...visibleBlades].sort()};
  } else assert(!rotor);
  return {min:rounded(bounds.min.toArray()),max:rounded(bounds.max.toArray()),size,contactArea:Number(contactArea.toFixed(7)),
    meshCount:parts.length,triangles,geometrySha256:geometryHash.digest('hex'),indicators,...(rotorProbe?{rotor:rotorProbe}:{})};
}

const args = parseArgs({options:{check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'},
  parameters:{type:'string'},help:{type:'boolean'}}}).values;
if(args.help) {
  console.log('node scripts/company-platform/build-floor-air.mjs --check | --write | --output NEW_PROJECT_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check,args.write,Boolean(args.output)].filter(Boolean).length,1,'Select --check, --write or --output');
assert(!args.parameters || args.output,'Edited recipes require an isolated --output');
const output = args.output && path.relative(root,path.resolve(args.output)).split(path.sep).join('/');
if(args.output) {
  assert(output && !args.output.split(/[\\/]/).includes('..'), 'Use a new project-local output directory');
  await safeFile(output);
  assert(output.startsWith('output/') || output.startsWith('company-workspace/production-trials/'),
    'Trial output must stay in the production project output or production-trials tree');
} else {
  await Promise.all([safeFile(family+'/collection.json'),safeFile(models)]);
}
const input=args.parameters ?? family+'/parameters.json', contractPath=family+'/contract.json', sourcePath=family+'/sources.json';
const [paramBytes,contractBytes,sourceBytes,branchBytes,generatorBytes]=await Promise.all(
  [input,contractPath,sourcePath,branchPath,generator].map(read));
const parameters=JSON.parse(paramBytes), contract=JSON.parse(contractBytes), sources=JSON.parse(sourceBytes);
const branch=JSON.parse(branchBytes).groups.flatMap(g=>g.branches).find(b=>b.id===contract.productionBranch);
const fixed=branch.fixedFunctionAndInstall;
assert.equal(contract.mount,fixed.mount); assert.equal(contract.parent,fixed.parent); assert.equal(fixed.state,'on-off-speed');
assert.deepEqual(contract.mounting,{origin:'bottom',width:fixed.dimensionsMeters.width,height:fixed.dimensionsMeters.height,depth:fixed.dimensionsMeters.depth});
assert(parameters.schema==='company-floor-air-collection' && parameters.version===1 && parameters.designs?.length);
if(!args.parameters) assert.deepEqual(parameters.designs.map(d=>d.id),['floor-air-tower','floor-air-pedestal','floor-air-circulator','floor-air-purifier']);
const files=new Map(),reports=[],seen=new Set();
const collection={schemaVersion:1,id:'company-floor-air-v1',generator,generatorSha256:digest(generatorBytes),
  sourceParameters:input,sourceParametersSha256:digest(paramBytes),contract:contractPath,contractSha256:digest(contractBytes),
  sourceManifest:sourcePath,sourceManifestSha256:digest(sourceBytes),resources:[]};
const {schema,version,...shared}=contract;
const source=sources.upstream;
const blade=parameters.designs.some(d=>['pedestal','circulator'].includes(d.mechanism)) ? await extractBlade(source) : null;
for(const d of parameters.designs) {
  assert(/^floor-air-[a-z0-9][a-z0-9-]{0,55}$/.test(d.id) && Number.isSafeInteger(d.version) && d.version>0 &&
    typeof d.displayName==='string' && d.displayName.trim(),'Invalid floor-air identity');
  const key=d.id+'@'+d.version;
  assert(!seen.has(key),'Duplicate '+key); seen.add(key);
  const hasRotor=['pedestal','circulator'].includes(d.mechanism);
  const copyright=hasRotor?'Adapted Kenney Furniture Kit blade geometry (CC0-1.0); project-authored appliance.':'Project-authored appliance geometry.';
  async function build() {
    const {rootNode,slots}=model(d,contract,blade);
    const bytes=Buffer.from(await new GLTFExporter().parseAsync(rootNode,{binary:true,copyright}));
    const mats=new Set();
    rootNode.traverse(n=>{if(n.isMesh){n.geometry.dispose();mats.add(n.material);}});
    for(const m of mats) m.dispose();
    return {bytes,slots};
  }
  const {bytes,slots}=await build();
  assert(bytes.equals((await build()).bytes),'Repeated export changed bytes: '+key);
  const geometry=await inspect(bytes,d);
  const folder=models+'/'+d.id+'/v'+d.version, modelPath=folder+'/model.glb',resourcePath=folder+'/resource.json';
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:digest(bytes),bytes:bytes.length};
  const provenance={license:copyright,author:sources.author,tools:['Three.js '+T.REVISION,'GLTFExporter','GLTFLoader readback'],
    generator,generatorSha256:collection.generatorSha256,sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
    environmentBranchSource:branchPath,environmentBranchSourceSha256:digest(branchBytes),environmentBranch:branch.id,
    sourceManifestPath:sourcePath,sourceManifestSha256:collection.sourceManifestSha256,
    ...(hasRotor?{sourceArtifactPath:source.path,sourceArtifactSha256:source.sha256,sourceAuthor:source.author,sourceUrl:source.url,
      sourceLicense:source.license,sourceLicensePath:source.licensePath,sourceLicenseSha256:source.licenseSha256}:{})};
  const data={id:d.id,version:d.version,displayName:d.displayName,...shared,...(hasRotor?{visualRotor:{node:'air-rotor'}}:{}),
    materialSlots:slots,provenance,asset};
  files.set(modelPath,bytes); files.set(resourcePath,json(data));
  collection.resources.push({id:d.id,version:d.version,resourcePath,modelPath,sha256:asset.sha256,
    geometrySha256:geometry.geometrySha256,triangles:geometry.triangles});
  reports.push({id:d.id,version:d.version,asset,geometry,repeatedExportByteIdentical:true});
}
assert.equal(new Set(reports.map(r=>r.geometry.geometrySha256)).size,reports.length,'Duplicate physical designs');
files.set(family+'/collection.json',json(collection));
if(output) files.set('report.json',json({status:'passed',scope:'CPU GLB readback, physical triangles and visibility rays',resources:reports}));
// Check every destination before creating a directory or publishing a version.
// Exclusive creates preserve conflicting versions and allow an interrupted write to resume.
const missing=[];
for(const [relative,bytes] of files) {
  const location=await safeFile(output?output+'/'+relative:relative);
  const existing=await fs.readFile(location).catch(err=>{if(err.code==='ENOENT' && !args.check) return null;throw err;});
  if(existing===null) missing.push([location,bytes]);
  else assert(existing.equals(bytes),'Existing version differs: '+relative+'. Use a new trial directory/version.');
}
if(missing.length) {
  const stageBase=await safeFile('output/floor-air');
  await fs.mkdir(stageBase,{recursive:true});
  const stage=await fs.mkdtemp(path.join(stageBase,'asset-build-'));
  try {
    for(const [index,[location,bytes]] of missing.entries()) {
      const complete=path.join(stage,String(index));
      await fs.writeFile(complete,bytes,{flag:'wx'});
      await fs.mkdir(path.dirname(location),{recursive:true});
      try { await fs.link(complete,location); }
      catch(error){if(error.code!=='EEXIST' || !(await fs.readFile(location)).equals(bytes)) throw error;}
    }
  } finally { await fs.rm(stage,{recursive:true,force:true}); }
}
console.log(JSON.stringify({status:'passed',resources:collection.resources}));
