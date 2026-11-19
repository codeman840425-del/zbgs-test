import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root = await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const family = 'assets-source/company-vocal-mic-looks-v1';
const donor = 'assets-source/company-singing-stage-v1';
const contractPath = donor+'/contract.json';
const generator = 'scripts/company-platform/build-vocal-mic-looks.mjs';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = object => Buffer.from(JSON.stringify(object,null,2)+'\n');
const v = (...coords) => new T.Vector3(...coords);
const inherited = ['singing-mic-pickup','singing-mic-collar','singing-mic-handle','singing-mic-clip'];
const styles = {disc:['baseRadius',.18,.24],suspension:['legSpread',.185,.23],broadcast:['columnWidth',.096,.14]};

async function safeFile(relative) {
  assert(typeof relative==='string' && relative.split('/').every(part=>
    /^[\w.-]+$/.test(part) && !part.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
    'Expected a portable project-relative path: '+relative);
  let file=root;
  for(const part of relative.split('/')) {
    file=path.join(file,part);
    try { assert(!(await fs.lstat(file)).isSymbolicLink() && await fs.realpath(file)===file,'Linked path: '+file); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  return file;
}
const read = async relative => fs.readFile(await safeFile(relative));
function validate(d) {
  assert(d.kind==='vocal' && Object.hasOwn(styles,d.style),'Unknown microphone style');
  const [key,min,max]=styles[d.style];
  assert.deepEqual(Object.keys(d).sort(),['kind','style','id','version','displayName',key,'frameColor','accentColor','commissioningPrompt'].sort());
  assert(Number.isFinite(d[key]) && d[key]>=min && d[key]<=max,'Unsupported '+key);
  assert(/^floor-vocal-mic-[a-z0-9][a-z0-9-]{0,52}$/.test(d.id) && Number.isSafeInteger(d.version) && d.version>0,'Invalid identity');
  assert([d.displayName,d.commissioningPrompt].every(s=>typeof s==='string' && s.trim()),'Missing appearance description');
  assert([d.frameColor,d.accentColor].every(s=>/^#[a-f\d]{6}$/i.test(s)),'Expected two sRGB finishes');
}
function decodeGlb(bytes) {
  const end=20+bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(end+4),0x004e4942);
  return {g:JSON.parse(bytes.subarray(20,end)),bin:bytes.subarray(end+8)};
}
function encodeGlb(g,bin) {
  const body=Buffer.from(JSON.stringify(g)), size=(body.length+3)&~3;
  const header=Buffer.alloc(20), tail=Buffer.alloc(8);
  [0x46546c67,2,28+size+bin.length,size,0x4e4f534a].forEach((n,i)=>header.writeUInt32LE(n,i*4));
  tail.writeUInt32LE(bin.length); tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,body,Buffer.alloc(size-body.length,32),tail,bin]);
}

const roundBox=(w,h,d,r)=>new RoundedBoxGeometry(w,h,d,1,r);
const drum=(top,bottom,h,n=32)=>new T.CylinderGeometry(top,bottom,h,n);
const at=(geom,x,y,z)=>geom.translate(x,y,z);
function rod(a,b,r,top=r) {
  const begin=v(...a),end=v(...b),direction=end.clone().sub(begin);
  return drum(top,r,direction.length(),14).applyQuaternion(new T.Quaternion()
    .setFromUnitVectors(v(0,1,0),direction.normalize())).translate(...begin.lerp(end,.5).toArray());
}
function tube(points,r) {
  return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(a=>v(...a))),24,r,10,false);
}
function pad(x,z) {return at(drum(.024,.024,.013,16),x,.0065,z);}
function stand(d) {
  const parts=[];
  function add(name,slot,...pieces) {
    const normalized=pieces.map(g=>g.index?g.toNonIndexed():g);
    parts.push({name,slot,geometry:normalized.length===1?normalized[0]:mergeGeometries(normalized)});
  }
  if(d.style==='disc') {
    const r=d.baseRadius,z=.015;
    const feet=Array.from({length:3},(_,i)=>{const a=i*2*Math.PI/3;return pad(.76*r*Math.sin(a),z+.76*r*Math.cos(a));});
    add('singing-tripod','rubber',...feet);
    add('weighted-disc','frame',at(drum(r,r,.034,64),0,.030,z),at(drum(.61*r,r,.037,64),0,.065,z));
    add('disc-inlay','accent',at(drum(r+.0008,r+.0008,.007,64),0,.041,z));
    add('mast-socket','accent',at(drum(.049,.069,.096),0,.127,z));
    add('telescoping-mast','frame',at(drum(.025,.033,.855),0,.60,z),at(drum(.016,.019,.42),0,1.214,z));
    add('height-lock','accent',at(drum(.034,.039,.077),0,1.00,z),at(drum(.029,.031,.026),0,1.423,z));
    add('short-arm-hinge','frame',rod([-.040,1.423,z],[.038,1.423,z],.035));
    add('singing-boom','frame',rod([0,1.423,z],[0,1.552,.30],.014),rod([0,1.55,.30],[0,1.591,.322],.015));
    add('arm-thumbwheel','accent',rod([.034,1.423,z],[.048,1.423,z],.029));
  } else if(d.style==='suspension') {
    const w=d.legSpread;
    add('singing-tripod','rubber',pad(-w,.06),pad(w,.06),pad(0,-.18));
    add('triangular-chassis','frame',rod([-w,.035,.06],[w,.035,.06],.023),
      rod([-w,.035,.06],[0,.035,-.18],.025),rod([0,.035,-.18],[w,.035,.06],.025));
    for(const sign of [-1,1]) {
      const x=w*sign;
      add(sign<0?'left-inclined-rail':'right-inclined-rail','frame',
        rod([x,.034,.06],[x*.47,1.27,-.018],.022,.017),
        rod([x*.47,1.27,-.018],[.064*sign,1.45,.103],.017,.012));
      add(sign<0?'left-rail-brace':'right-rail-brace','accent',rod([0,.036,-.18],[x*.82,.42,.034],.012),
        rod([x*.60,.94,.003],[0,.827,.012],.007));
    }
    add('frame-crossbars','frame',rod([-w*.64,.83,.012],[w*.64,.83,.012],.014),
      rod([-.098,1.255,-.017],[.098,1.255,-.017],.015));
    add('basket-carrier','frame',rod([-.064,1.45,.103],[.064,1.45,.103],.013),
      rod([.064,1.45,.103],[.066,1.606,.266],.012));
    // The rear ring remains behind the collar. The elastic strands cross from its rim to the real clip.
    const ring=(y,z)=>at(new T.TorusGeometry(.064,.0055,8,48),0,y,z);
    add('suspension-ring','accent',ring(1.611,.264),ring(1.606,.288));
    const strands=[];
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,b=a+Math.PI*.37;
      strands.push(rod([.062*Math.cos(a),1.606+.062*Math.sin(a),.288],
        [.024*Math.cos(b),1.604+.026*Math.sin(b),.322],.0028));
    }
    add('singing-boom','rubber',...strands);
    add('basket-spacers','frame',...[-1,1].map(s=>rod([s*.064,1.611,.264],[s*.064,1.606,.288],.005)));
  } else {
    const w=d.columnWidth,z=-.012;
    add('singing-tripod','rubber',pad(-.13,.087),pad(.13,.087),pad(0,-.148));
    add('stepped-plinth','frame',at(roundBox(.363,.051,.342,.022),0,.038,z),
      at(roundBox(.291,.048,.261,.019),0,.084,z));
    add('plinth-band','accent',at(roundBox(.349,.008,.331,.003),0,.056,z));
    add('fluted-column','frame',at(roundBox(w,.89,.084,.015),0,.54,z),at(drum(.024,.032,.26),0,1.102,z));
    add('column-trim','accent',...[-1,0,1].map(s=>at(roundBox(.006,.76,.007,.002),s*w*.265,.55,z+.042)),
      at(roundBox(w+.019,.038,.099,.009),0,.98,z),at(roundBox(w+.023,.041,.104,.010),0,.125,z));
    add('harp-socket','accent',at(drum(.037,.030,.054),0,1.23,z));
    const curves=[-1,1].map(s=>tube([[0,1.238,z],[s*.09,1.29,.02],[s*.12,1.35,.073],
      [s*.114,1.47,.14],[s*.105,1.589,.238],[s*.087,1.616,.27],[s*.047,1.606,.31]],.011));
    add('broadcast-yoke','accent',...curves);
    add('side-pivots','frame',...[-1,1].map(s=>rod([s*.043,1.606,.31],[s*.059,1.606,.31],.019)));
    add('singing-boom','accent',rod([-.049,1.606,.31],[.049,1.606,.31],.0065));
  }
  return parts;
}

function model(d,master) {
  const {g:src,bin:original}=master;
  const g={asset:{version:'2.0',generator:'company-vocal-mic-looks-v1',copyright:'Grab3D CC0-1.0 microphone; project-authored floor stands.'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{name:d.id,children:[]}],meshes:[],materials:[],textures:[],images:[],samplers:src.samplers,
    buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  const chunks=[];
  function view(bytes,target) {
    const offset=g.buffers[0].byteLength, padding=Buffer.alloc((4-bytes.length%4)%4);
    chunks.push(bytes,padding); g.buffers[0].byteLength+=bytes.length+padding.length;
    return g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})})-1;
  }
  function copyView(index) {
    const desc=src.bufferViews[index],from=desc.byteOffset??0;
    assert(!desc.byteStride && !desc.buffer);
    return view(original.subarray(from,from+desc.byteLength),desc.target);
  }
  function copyAccessor(index) {
    const a=src.accessors[index];
    return g.accessors.push({...a,bufferView:copyView(a.bufferView)})-1;
  }
  function mesh(name,primitive,parent) {
    const index=g.meshes.push({name,primitives:[primitive]})-1;
    g.nodes[parent].children.push(g.nodes.push({name,mesh:index})-1);
  }
  const donorMaterial=structuredClone(src.materials.find(material=>material.name==='microphone-stand_boom_pbr'));
  const pbr=donorMaterial.pbrMetallicRoughness;
  for(const descriptor of [donorMaterial.normalTexture,pbr.baseColorTexture,pbr.metallicRoughnessTexture]) {
    const texture=src.textures[descriptor.index],image=src.images[texture.source];
    const source=g.images.push({...image,bufferView:copyView(image.bufferView)})-1;
    descriptor.index=g.textures.push({...texture,source})-1;
  }
  g.materials.push(donorMaterial);
  const joint=src.nodes.find(n=>n.name==='microphone-stand_boom');
  const halfAngle=-8*Math.PI/360;
  g.nodes[0].children.push(g.nodes.push({name:'fitted-microphone',translation:joint.translation,
    rotation:[Math.sin(halfAngle),0,0,Math.cos(halfAngle)],children:[]})-1);
  for(const name of inherited) {
    const node=src.nodes.find(n=>n.name===name);
    assert(joint.children.includes(src.nodes.indexOf(node)));
    const [p]=src.meshes[node.mesh].primitives;
    const attributes=Object.fromEntries(Object.entries(p.attributes).map(([key,index])=>[key,copyAccessor(index)]));
    mesh(name,{attributes,indices:copyAccessor(p.indices),material:0},1);
  }
  const palette={frame:[d.frameColor,.52,.38],accent:[d.accentColor,.56,.30],rubber:['#272d32',.04,.84]};
  const materials={};
  for(const [name,[color,metallicFactor,roughnessFactor]] of Object.entries(palette)) {
    materials[name]=g.materials.push({name:'stand-'+name,pbrMetallicRoughness:{
      baseColorFactor:[...new T.Color(color).toArray(),1],metallicFactor,roughnessFactor}})-1;
  }
  for(const {name,slot,geometry} of stand(d)) {
    geometry.computeBoundingBox();
    const attributes={};
    for(const [label,attr] of [['POSITION','position'],['NORMAL','normal']]) {
      const a=geometry.getAttribute(attr), bytes=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
      attributes[label]=g.accessors.push({bufferView:view(bytes,34962),componentType:5126,count:a.count,type:'VEC3',
        ...(attr==='position'?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:{})})-1;
    }
    mesh(name,{attributes,material:materials[slot]},0);
  }
  return encodeGlb(g,Buffer.concat(chunks));
}

async function inspect(bytes) {
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(scene,true);
  assert(Math.abs(bounds.min.y)<.00001 && bounds.max.y<=1.75 &&
    bounds.min.x>=-.33 && bounds.max.x<=.33 && bounds.min.z>=-.48 && bounds.max.z<=.48,'Mount envelope');
  const mouth=v(0,1.555,.54),pickup=scene.getObjectByName('singing-mic-pickup'),
    center=new T.Box3().setFromObject(pickup,true).getCenter(v());
  const ray=new T.Raycaster(mouth,center.clone().sub(mouth).normalize(),0,.26);
  const hit=ray.intersectObject(scene,true)[0];
  assert.equal(hit?.object,pickup,'Mouth ray must hit the actual grille first');
  assert(hit.distance>=.06);
  const feet=scene.getObjectByName('singing-tripod'), groups=[], contact=feet.geometry.getAttribute('position');
  for(let i=0;i<contact.count;i++) {
    const p=v().fromBufferAttribute(contact,i);
    if(Math.abs(p.y)<.001 && !groups.some(g=>p.distanceTo(g)<.1)) groups.push(p);
  }
  assert.equal(groups.length,3);
  const geometryHash=createHash('sha256');
  let triangles=0;
  const materialSlots={};
  scene.traverse(n=>{
    if(!n.isMesh) return;
    const slot=n.material.name.startsWith('stand-')?n.material.name.slice(6):'microphone';
    (materialSlots[slot]??=[]).push(n.name);
    const geometry=n.geometry, a=geometry.getAttribute('position');
    triangles+=(geometry.index?.count??a.count)/3;
    geometryHash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    if(geometry.index) geometryHash.update(Buffer.from(geometry.index.array.buffer,geometry.index.array.byteOffset,geometry.index.array.byteLength));
  });
  const image=pickup.material;
  assert([image.map,image.normalMap,image.roughnessMap].every(m=>m?.image?.width===512 && m.image.height===512),'Expected three embedded Grab3D PBR maps');
  return {materialSlots,geometrySha256:geometryHash.digest('hex'),triangles,groundContacts:groups.length,mouthToGrilleMetres:hit.distance};
}

const args=parseArgs({options:{write:{type:'boolean'},check:{type:'boolean'},output:{type:'string'},parameters:{type:'string'},help:{type:'boolean'}}}).values;
if(args.help) {
  console.log('build-vocal-mic-looks.mjs --check | --write | --output PROJECT_OUTPUT_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.write,args.check,Boolean(args.output)].filter(Boolean).length,1,'Select one output mode');
assert(!args.parameters || args.output,'Edited recipes require --output');
const output=args.output && path.relative(root,path.resolve(root,args.output)).split(path.sep).join('/');
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..') && /^(output|company-workspace\/production-trials)\//.test(output),'Trial path must stay in project output');
  await safeFile(output);
}
const input=args.parameters??family+'/parameters.json';
assert(/^(assets-source\/company-|output\/)/.test(input) && input.endsWith('.json'),'Invalid recipe path');
const [parameters,contractBytes,script,branch]=await Promise.all([input,contractPath,generator,branchPath].map(read));
const recipe=JSON.parse(parameters),contract=JSON.parse(contractBytes),spec=contract.designs.vocal;
assert.equal(recipe.schema,'company-vocal-mic-looks');
assert(recipe.version===1 && Array.isArray(recipe.designs) && recipe.designs.length);
recipe.designs.forEach(validate);
assert(JSON.parse(branch).groups.some(group=>group.branches.some(b=>b.id===contract.environmentBranch)));
const dependencies={};
for(const [name,rel] of Object.entries({sourceRecord:'original/sources.json',license:'original/CC0-1.0.txt',sourceConverter:'tools/prepare_master.py',
  editableReader:'tools/read_blend.py',topologyReader:'tools/gltf_parts.py',textureFilter:'tools/resize_maps.py'})) {
  const file=donor+'/'+rel; dependencies[name]={path:file,sha256:digest(await read(file))};
}
Object.assign(dependencies,{editableSource:spec.editable,originalGlb:spec.original,fittedMaster:spec.neutral});
const [original,editable,neutral]=await Promise.all([spec.original,spec.editable,spec.neutral].map(async pin=>{
  assert(pin.path.startsWith(donor+'/'));
  const bytes=await read(pin.path);assert.equal(digest(bytes),pin.sha256,'Pinned source changed: '+pin.path);return bytes;
}));
const upstream=JSON.parse(await read(dependencies.sourceRecord.path)).find(r=>r.id===spec.source);
assert(upstream.embeddedLicense==='CC0-1.0' && upstream.declaredByPublisher==='CC0-1.0' &&
  upstream.sha256===digest(original) && upstream.editable.sha256===digest(editable));
const master=decodeGlb(neutral);
installNodeImageDecodeShim();
const files=new Map();
const collection={schemaVersion:1,id:'company-vocal-mic-looks-v1',sourceParameters:input,sourceParametersSha256:digest(parameters),
  contract:contractPath,contractSha256:digest(contractBytes),generator,generatorSha256:digest(script),resources:[]};
for(const d of recipe.designs) {
  const folder='prototype/public/company-assets/vocal-mic-looks-v1/'+d.id+'/v'+d.version;
  const modelPath=folder+'/model.glb',resourcePath=folder+'/resource.json';
  assert(!files.has(modelPath),'Duplicate resource identity: '+d.id);
  const bytes=model(d,master), {materialSlots,...geometry}=await inspect(bytes);
  assert(bytes.equals(model(d,master)),'Repeated export produced different bytes');
  const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:digest(bytes),bytes:bytes.length};
  const provenance={license:'Grab3D CC0-1.0 capsule, collar, handle, clip and 512px PBR textures. Project-authored floor frame, mount and finishes.',
    sourceAuthor:'Grab3D',sourceLicense:'CC0-1.0',sourceUrl:spec.sourceUrl,sourceDesign:spec.source,
    sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:collection.generatorSha256,
    functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
    sourceArtifactPath:spec.editable.path,sourceArtifactSha256:spec.editable.sha256,environmentBranch:contract.environmentBranch,
    environmentBranchSource:branchPath,environmentBranchSourceSha256:digest(branch),dependencies,
    tools:['Three.js '+T.REVISION,'Native GLB mesh and texture assembly','GLTFLoader with decoded JPEGs']};
  files.set(modelPath,bytes);
  files.set(resourcePath,json({id:d.id,version:d.version,displayName:d.displayName,...spec.resource,materialSlots,asset,provenance}));
  collection.resources.push({id:d.id,version:d.version,resourcePath,modelPath,sha256:asset.sha256,...geometry});
}
files.set(family+'/collection.json',json(collection));
async function makeParents(directory,owned) {
  const relative=path.relative(root,directory).split(path.sep).join('/');
  await safeFile(relative);
  let current=root;
  for(const name of relative.split('/')) {
    current=path.join(current,name);
    try {await fs.mkdir(current);owned.push(current);}
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      assert((await fs.lstat(current)).isDirectory() && await fs.realpath(current)===current,'Linked directory: '+current);
    }
  }
}
async function publish() {
  const targets=await Promise.all([...files].map(async ([relative,bytes])=>({
    relative,bytes,target:await safeFile(output?output+'/'+relative:relative)
  })));
  if(args.check) {
    for(const {bytes,target} of targets) assert(bytes.equals(await fs.readFile(target)),'Existing version differs: '+target);
    return;
  }
  const staging=await safeFile('output/vocal-mic-looks/producer');
  await fs.mkdir(staging,{recursive:true});
  const lock=path.join(staging,'publication.lock');
  await fs.mkdir(lock).catch(error=>{
    if(error.code==='EEXIST') throw Error('Another vocal-microphone publication owns '+lock);
    throw error;
  });
  const owned=[],links=[];
  let spool;
  try {
    const dest=output && await safeFile(output);
    if(dest) {
      const found=await fs.lstat(dest).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
      assert(!found,'Trial output already exists: '+dest);
    }
    const missing=[];
    for(const item of targets) {
      const existing=await fs.readFile(item.target).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
      if(existing) assert(existing.equals(item.bytes),'Existing version differs: '+item.target);
      else missing.push(item);
    }
    if(!missing.length) return;
    spool=await fs.mkdtemp(path.join(staging,'model-'));
    const batch=path.join(spool,'batch');
    for(const {relative,bytes} of missing) {
      const temp=path.join(batch,relative);
      await fs.mkdir(path.dirname(temp),{recursive:true});
      await fs.writeFile(temp,bytes,{flag:'wx'});
    }
    if(dest) {
      await makeParents(path.dirname(dest),owned);
      await fs.rename(batch,dest);
    } else {
      // Add immutable files exclusively. On an error, unlink only our own inodes, under the publication lock.
      for(const {relative,target} of missing) {
        const source=path.join(batch,relative);
        await makeParents(path.dirname(target),owned);
        await fs.link(source,target);
        links.push({source,target});
      }
    }
  } catch(error) {
    for(const {source,target} of links.reverse()) {
      const ours=await fs.stat(source,{bigint:true});
      const current=await fs.lstat(target,{bigint:true}).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
      if(current && ours.dev===current.dev && ours.ino===current.ino) await fs.unlink(target);
    }
    for(const directory of owned.reverse()) await fs.rmdir(directory).catch(e=>{
      if(!['ENOTEMPTY','ENOENT','EEXIST'].includes(e.code))throw e;
    });
    throw error;
  } finally {
    try {
      if(spool) {
        assert(path.dirname(await fs.realpath(spool))===staging);
        await fs.rm(spool,{recursive:true});
      }
    } finally {await fs.rmdir(lock);}
  }
}
await publish();
console.log(JSON.stringify({status:'passed',resources:collection.resources}));
