import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';

const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const sourceDir='assets-source/company-equipment-cart-v1', family='equipment-cart-v1';
const generator='scripts/company-platform/build-equipment-carts.mjs';
const branches='assets-source/company-environment-specs-v1/branches.json';
const geometryValidator='prototype/src/company/support-geometry.js';
const dataValidator='prototype/src/company/support-data.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const round=x=>Number(x.toFixed(7));
const coords=point=>point.toArray().map(round);
const fail=(code,at,message)=>{throw Object.assign(Error(message),{code,path:at});};

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
const kinds=['open','flightcase','tool','display'];
function validate(d) {
  assert.deepEqual(Object.keys(d).sort(),['kind','id','version','displayName','boardThickness','frameColor','deckColor','trimColor'].sort());
  assert(kinds.includes(d.kind) && /^equipment-cart-[a-z][a-z0-9-]{0,45}$/.test(d.id) &&
    Number.isSafeInteger(d.version) && d.version>=1 && typeof d.displayName==='string' && d.displayName.trim());
  assert(Number.isFinite(d.boardThickness) && d.boardThickness>=.018 && d.boardThickness<=.035,'Deck thickness outside 18–35 mm');
  assert([d.frameColor,d.deckColor,d.trimColor].every(s=>/^#[\da-f]{6}$/i.test(s)),'Invalid sRGB finish');
}
function unpack(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const end=20+bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(end+4),0x004e4942);
  return {g:JSON.parse(bytes.subarray(20,end)),bin:bytes.subarray(end+8)};
}
function pack(g,bin) {
  const body=Buffer.from(JSON.stringify(g)),size=Math.ceil(body.length/4)*4,header=Buffer.alloc(20),tail=Buffer.alloc(8);
  [0x46546c67,2,28+size+bin.length,size,0x4e4f534a].forEach((n,i)=>header.writeUInt32LE(n,4*i));
  tail.writeUInt32LE(bin.length);tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,body,Buffer.alloc(size-body.length,32),tail,bin]);
}
async function load(bytes) {
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  scene.updateMatrixWorld(true);return scene;
}
const bounds=mesh=>new T.Box3().setFromObject(mesh,true);
function build(d,bytes,sourceScene) {
  const {g,bin}=unpack(bytes),chunks=[bin];
  const cart=g.nodes[g.scenes[g.scene].nodes[0]],original=[...cart.children];
  assert.equal(cart.name,'Roll Platform');assert.equal(original.length,27);
  cart.name=d.id;delete cart.extras;
  g.asset.generator='company-equipment-cart-v1';
  cart.children=[];
  function material(slot,color,metallicFactor) {
    return g.materials.push({name:'cart-'+slot,pbrMetallicRoughness:{baseColorFactor:[...new T.Color(color).toArray(),1],
      metallicFactor,roughnessFactor:metallicFactor>.4?.35:.61}})-1;
  }
  const metal=material('frame',d.frameColor,.49),deck=material('deck',d.deckColor,d.kind==='display'?.05:.35),trim=material('trim',d.trimColor,.52);
  const attach=node=>{const i=g.nodes.push(node)-1;cart.children.push(i);return i;};
  const geometries=new Map();
  function geometry(shape,slot) {
    const key=shape+'-'+slot;
    if(geometries.has(key))return geometries.get(key);
    const geo=shape==='box'?new T.BoxGeometry(1,1,1).toNonIndexed():new T.CylinderGeometry(.5,.5,1,16).toNonIndexed();
    geo.computeBoundingBox();
    const attributes={};
    for(const [label,key] of [['POSITION','position'],['NORMAL','normal']]) {
      const a=geo.getAttribute(key),data=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
      const view=g.bufferViews.push({buffer:0,byteOffset:g.buffers[0].byteLength,byteLength:data.length,target:34962})-1;
      chunks.push(data);g.buffers[0].byteLength+=data.length;
      attributes[label]=g.accessors.push({bufferView:view,componentType:5126,count:a.count,type:'VEC3',
        ...(label==='POSITION'?{min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()}:{})})-1;
    }
    const mesh=g.meshes.push({primitives:[{attributes,material:slot}]})-1;
    geometries.set(key,mesh);return mesh;
  }
  const box=(name,x,y,z,w,h,depth,slot=metal)=>attach({name,mesh:geometry('box',slot),translation:[x,y,z],scale:[w,h,depth]});
  function rod(name,from,to,diameter,slot=metal) {
    const delta=to.clone().sub(from);
    attach({name,mesh:geometry('cyl',slot),translation:from.clone().lerp(to,.5).toArray(),
      rotation:new T.Quaternion().setFromUnitVectors(v(0,1,0),delta.clone().normalize()).toArray(),scale:[diameter,delta.length(),diameter]});
  }
  const casters=new Map();
  for(const index of original) {
    const n=g.nodes[index],name=n.name,mesh=sourceScene.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));
    assert(mesh?.isMesh,'Missing donor mesh '+name);
    const box=bounds(mesh);
    if(name.startsWith('Platform cart deck')||name.startsWith('Load deck traction')) {
      // Turn the donor's long travel axis across the room. The four rolling units keep their circular wheel profiles.
      attach({name:'adapted-'+index,children:[index],translation:[0,.035,0],rotation:new T.Quaternion().setFromAxisAngle(v(0,1,0),Math.PI/2).toArray(),
        scale:[.50/.49,1,.70/.76]});
    } else if(name==='Folding cart push handle') {
      const sy=(1-.195)/(box.max.y-box.min.y);
      attach({name:'handle-mount',children:[index],translation:[0,.195-sy*box.min.y,.063],scale:[1.53,sy,1]});
    } else {
      const center=box.getCenter(v()),sx=Math.sign(center.x),sz=Math.sign(center.z),corner=(sx<0?'left':'right')+'-'+(sz<0?'rear':'front');
      const delta=[sx*(.26-.19),0,sz*(.17-.20)];
      if(name.startsWith('Rubber caster wheel'))n.name='wheel-'+corner;
      if(name.startsWith('Caster swivel bearing'))n.name='bearing-'+corner;
      attach({name:'mount-'+index,children:[index],translation:delta});
      casters.set(corner,[sx*.26,sz*.17]);
    }
  }
  assert.equal(casters.size,4);
  for(const [corner,[x,z]] of casters) {
    // The donor fork ends below its swivel ring. A steel bridge covers both fork plates and a stem reaches the original bearing.
    box('fork-bridge-'+corner,x,.096,z,.021,.008,.035,trim);
    rod('caster-stem-'+corner,v(x,.096,z),v(x,.138,z),.018,trim);
    box('bearing-plate-'+corner,x,.143,z,.062,.009,.060,metal);
  }
  const thick=d.boardThickness;
  box('cart-lower-deck',0,.30-thick/2,0,.674,thick,.442,deck);
  box('cart-upper-deck',0,.82-thick/2,0,.674,thick,.442,deck);
  const levels=[['lower',.30],['upper',.82]];
  if(d.kind==='open') {
    for(const x of [-.308,.308])for(const z of [-.203,.203])
      rod('tubular-post-'+x+'-'+z,v(x,.199,z),v(x,.815,z),.030);
    for(const [id,y] of levels) {
      rod(id+'-rear-rail',v(-.31,y+.033,-.203),v(.31,y+.033,-.203),.014,trim);
      for(const x of [-.308,.308]) {
        rod(id+'-side-rail-'+x,v(x,y+.033,-.203),v(x,y+.033,.19),.014,trim);
        for(const z of [-.20,.19])rod(id+'-rail-foot-'+x+'-'+z,v(x,y-.004,z),v(x,y+.033,z),.013,trim);
      }
    }
  } else if(d.kind==='flightcase') {
    for(const [name,lo,hi] of [['bottom',.204,.518],['top',.520,.813]]) {
      for(const x of [-.319,.319]) {
        box(name+'-case-side-'+x,x,(hi+lo)/2,0,.032,hi-lo,.434);
        for(const z of [-.205,.205])box(name+'-aluminium-edge-'+x+'-'+z,x,(lo+hi)/2,z,.043,hi-lo,.023,trim);
        for(const y of [lo+.014,hi-.014])box(name+'-side-band-'+x+'-'+y,x,y,0,.043,.028,.435,trim);
        box(name+'-latch-'+x,x,hi-.066,.216,.040,.055,.015,trim);
      }
      box(name+'-case-back',0,(hi+lo)/2,-.209,.628,hi-lo,.019);
    }
    for(const x of [-.30,.30])box('stack-coupler-'+x,x,.519,-.204,.078,.035,.043,trim);
    box('rack-brow',0,.773,.196,.637,.035,.028,trim);
  } else if(d.kind==='tool') {
    for(const x of [-.311,.311]){
      box('press-formed-side-'+x,x,.505,-.045,.038,.613,.305);
      box('front-box-post-'+x,x,.504,.203,.030,.614,.034);
      for(const y of [.39,.46,.53,.60])box('rail-eyelet-'+x+'-'+y,x+Math.sign(x)*.021,y,0,.008,.012,.088,trim);
    }
    box('shallow-tool-drawer',0,.733,0,.639,.125,.408);
    box('drawer-face',0,.729,.21,.617,.084,.013,deck);
    for(const x of [-.133,.133])box('drawer-pull-tab-'+x,x,.736,.223,.023,.014,.023,trim);
    box('drawer-pull',0,.736,.235,.285,.016,.013,trim);
    box('tool-tray-back',0,.332,-.209,.647,.064,.020);
  } else {
    for(const x of [-.307,.307]){
      rod('display-swept-front-'+x,v(x,.205,.155),v(x,.81,-.135),.041);
      rod('display-swept-back-'+x,v(x,.206,-.17),v(x,.81,.165),.041);
      for(const [,y] of levels)box('display-bracket-'+x+'-'+y,x,y-.026,0,.032,.036,.424,trim);
    }
    for(const [name,y] of levels)box(name+'-curved-nose',0,y-.014,.221,.665,.019,.016,trim);
    box('display-rear-plaque',0,.874,-.219,.568,.112,.018,deck);
  }
  return pack(g,Buffer.concat(chunks));
}
async function inspect(bytes,resource,d) {
  const scene=await load(bytes), size=bounds(scene), meshes=[], materialSlots={};
  scene.traverse(n=>{if(n.isMesh) {
    meshes.push(n);
    const slot=n.material.name.startsWith('cart-')?n.material.name.slice(5):'original';
    (materialSlots[slot]??=[]).push(n.name);
  }});
  const support=validateSupportGeometry(scene,resource,fail);
  assert(size.min.distanceTo(v(-.35,0,-.25))<.001 && size.max.distanceTo(v(.35,1,.25))<.001,'Installation box mismatch '+JSON.stringify([coords(size.min),coords(size.max)]));
  const standing=[];
  for(const side of ['left','right'])for(const face of ['rear','front']) {
    const corner=side+'-'+face, wheel=scene.getObjectByName('wheel-'+corner), bearing=scene.getObjectByName('bearing-'+corner);
    const body=bounds(wheel), c=body.getCenter(v());
    const hit=new T.Raycaster(v(c.x,-.012,c.z),v(0,1,0),0,.015).intersectObject(scene,true)[0];
    assert(hit?.object===wheel && Math.abs(hit.point.y)<.001,'Missing tire-to-floor contact '+corner);
    const x=side==='left'?-.26:.26,z=face==='rear'?-.17:.17;
    const hits=new T.Raycaster(v(x+.001,.190,z+.001),v(0,-1,0),0,.15).intersectObject(scene,true);
    const chain=['Platform_cart_deck','bearing-plate-'+corner,bearing.name,'caster-stem-'+corner,'fork-bridge-'+corner];
    for(const part of chain)assert(hits.some(h=>h.object.name===part),'Unconnected caster load path: '+part);
    for(const [a,b] of [[bearing,scene.getObjectByName('caster-stem-'+corner)],[bearing,scene.getObjectByName('bearing-plate-'+corner)],
      [scene.getObjectByName('caster-stem-'+corner),scene.getObjectByName('fork-bridge-'+corner)]]) {
      assert(bounds(a).intersectsBox(bounds(b)),'Caster component gap '+corner);
    }
    standing.push({corner,point:coords(hit.point),axleCenter:coords(c),bearing:coords(bounds(bearing).getCenter(v())),loadPath:chain});
  }
  const frontClearance=[];
  for(const s of resource.supportSurfaces) {
    const [hx,hz]=s.halfSize;
    const prism=new T.Box3(v(-hx+.001,s.topY+.001,-hz+.001),v(hx-.001,s.topY+s.clearanceHeight-.001,.42));
    for(const mesh of meshes)assert(!bounds(mesh).intersectsBox(prism),'Front loading path blocked by '+mesh.name+' at '+s.id);
    const hits=[];
    for(const dx of [-.98,0,.98])for(const dz of [-.98,0,.98]) {
      const ray=new T.Raycaster(v(dx*hx,s.topY+s.clearanceHeight-.002,dz*hz),v(0,-1,0),0,s.clearanceHeight+.005);
      const hit=ray.intersectObject(scene,true)[0];
      assert(hit?.object.name===resource.supportNodes[s.id] && Math.abs(hit.point.y-s.topY)<1e-5,'Support surface missed at '+s.id);
      hits.push(coords(hit.point));
    }
    frontClearance.push({id:s.id,throughZ:prism.max.z,topY:s.topY,headroom:s.clearanceHeight,supportHits:hits});
  }
  // At the two rail intersections, sample actual triangles through the structural section
  // immediately below each solid deck. The optical ray crosses both faces of that member.
  const deckJoints=[];
  for(const level of resource.supportSurfaces) {
    const y=level.topY-d.boardThickness+.001;
    const specs={
      open:{x:.308,z:.203+.001,part:'tubular-post-0.308-0.203'},
      flightcase:{x:.319,z:.199,part:(level.id==='upper'?'top':'bottom')+'-case-side-0.319'},
      tool:{x:.311,z:.203+.001,part:'front-box-post-0.311'},
      display:{x:.307,z:.117,part:'display-bracket-0.307-'+level.topY}
    };
    const q=specs[d.kind],part=scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(q.part));
    assert(part?.isMesh,'Missing deck support '+q.part);
    const material=part.material, side=material.side; material.side=T.DoubleSide;
    try {
      const hits=new T.Raycaster(v(q.x-.08,y,q.z),v(1,0,0),0,.16).intersectObject(part,false);
      assert(hits.length>=2 && hits[0].point.x<q.x && hits.at(-1).point.x>q.x,'Deck underside loses its load path: '+part.name);
      const supportRay=new T.Raycaster(v(q.x,level.topY+.004,q.z),v(0,-1,0),0,.01);
      const deckHit=supportRay.intersectObject(scene.getObjectByName(resource.supportNodes[level.id]),false)[0];
      assert(deckHit && Math.abs(deckHit.point.y-level.topY)<1e-5);
      deckJoints.push({surface:level.id,part:part.name,topContact:coords(deckHit.point),postSection:coords(v(q.x,y,q.z))});
    } finally {material.side=side;}
  }
  // Connected AABBs locate load-bearing neighbours. Real deck/ground/forward sample rays are checked above.
  const base=scene.getObjectByName('Platform_cart_deck');
  const connected=new Set([base]);const boxes=new Map(meshes.map(m=>[m,bounds(m).expandByScalar(.0002)]));
  let changed;
  do {
    changed=false;
    for(const mesh of meshes)if(!connected.has(mesh) && [...connected].some(n=>boxes.get(n).intersectsBox(boxes.get(mesh)))) {
      connected.add(mesh);changed=true;
    }
  }while(changed);
  assert.equal(connected.size,meshes.length,'Detached part bounds: '+meshes.filter(n=>!connected.has(n)).map(n=>n.name));
  assert(meshes.some(m=>m.material.map?.image?.width===128 && m.material.normalMap?.image?.width===256),'Original texture maps not decoded');
  const shapeHash=createHash('sha256');
  let triangles=0;
  for(const mesh of meshes) {
    const geometry=mesh.geometry,pos=geometry.attributes.position,index=geometry.index,vertices=index?.count??pos.count;
    const positions=Buffer.alloc(vertices*12), point=v();
    for(let i=0;i<vertices;i++) {
      point.fromBufferAttribute(pos,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
      positions.writeFloatLE(point.x,12*i);positions.writeFloatLE(point.y,12*i+4);positions.writeFloatLE(point.z,12*i+8);
    }
    shapeHash.update(positions); triangles+=vertices/3;
  }
  return {materialSlots,bounds:{min:coords(size.min),max:coords(size.max)},triangles,support,standing,frontClearance,deckJoints,
    connectedParts:connected.size,geometrySha256:shapeHash.digest('hex')};
}
const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-equipment-carts.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/equipment-cart-v1/producer';
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
const input=args.parameters??sourceDir+'/parameters.json', contractPath=sourceDir+'/contract.json';
assert(input.endsWith('.json'));
const recordPath=sourceDir+'/original/sources.json';
const [recipeBytes,contractBytes,recordBytes,environmentBytes]=await Promise.all([input,contractPath,recordPath,branches].map(read));
const recipe=JSON.parse(recipeBytes), contract=JSON.parse(contractBytes), record=JSON.parse(recordBytes);
assert.deepEqual(Object.keys(recipe).sort(),['schema','version','designs'].sort());
assert(recipe.schema==='company-equipment-carts' && recipe.version===1 && recipe.designs?.length>0);
assert(contract.schema==='company-equipment-cart-contract' && contract.environmentBranch==='cart-and-equipment-storage');
const branch=JSON.parse(environmentBytes).groups.flatMap(g=>g.branches).find(b=>b.id===contract.environmentBranch);
const {width,height,depth}=branch.fixedFunctionAndInstall.dimensionsMeters;
assert.deepEqual(contract.resource.mounting,{origin:'bottom',width,height,depth});
assert(branch.fixedFunctionAndInstall.mount===contract.resource.mount && branch.fixedFunctionAndInstall.parent===contract.resource.parent);
assert(record.path===sourceDir+'/original/platform-utility-cart.glb' && record.author==='Innerscene Corp' && record.license==='CC0-1.0');
const sourceBytes=await read(record.path);
assert(sha(sourceBytes)===record.sha256 && sourceBytes.length===record.bytes,'Original platform cart source changed');
const {g}=unpack(sourceBytes);
assert.equal(g.asset.copyright,record.embeddedCopyright);
assert(record.embeddedCopyright.includes('CC0 1.0 Universal'));
const license=sourceDir+'/original/CC0-source-declaration.txt';
assert((await read(license)).toString().includes(record.embeddedCopyright));
const dependencies={sourceRecord:await pin(recordPath),license:await pin(license),originalModel:await pin(record.path)};
installNodeImageDecodeShim();
const sourceScene=await load(sourceBytes), files=new Map();
const collection={schemaVersion:1,id:'company-equipment-cart-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),contract:contractPath,contractSha256:sha(contractBytes),validationTools:[geometryValidator,dataValidator],resources:[]};
const signed=JSON.parse(await read(sourceDir+'/parameters.json')).designs;
for(const d of recipe.designs) {
  validate(d);
  const stock=signed.find(s=>s.id===d.id && s.version===d.version);
  if(args.parameters && stock)assert.deepEqual(d,stock,'Edit geometry under a new ID/version');
  const resource=structuredClone(contract.resource);
  validateSupportResource(resource,fail,d.id);
  const model=build(d,sourceBytes,sourceScene),{materialSlots,...inspection}=await inspect(model,resource,d);
  const folder='prototype/public/company-assets/'+family+'/'+d.id+'/v'+d.version;
  const modelPath=folder+'/model.glb',resourcePath=folder+'/resource.json';
  assert(!files.has(modelPath),'Duplicate identity: '+d.id);
  const asset={format:'glb',url:modelPath.replace('prototype/public',''),sha256:sha(model),bytes:model.length};
  const provenance={license:'Innerscene CC0-1.0 industrial cart assembly and original PBR maps. Project-authored upper structures and caster stems.',
    sourceAuthor:record.author,sourceLicense:record.license,sourceUrl:record.page,sourceDesign:d.kind,
    sourceArtifactPath:record.path,sourceArtifactSha256:record.sha256,sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,
    generator,generatorSha256:collection.generatorSha256,functionalContractSource:contractPath,functionalContractSourceSha256:collection.contractSha256,
    environmentBranch:branch.id,environmentBranchSource:branches,environmentBranchSourceSha256:sha(environmentBytes),dependencies,
    tools:['Three.js r'+T.REVISION,'Blender-authored GLB assembly','GLTFLoader with decoded source maps']};
  files.set(modelPath,model);
  files.set(resourcePath,json({id:d.id,version:d.version,displayName:d.displayName,...resource,materialSlots,provenance,asset}));
  collection.resources.push({id:d.id,version:d.version,modelPath,resourcePath,sha256:asset.sha256,geometrySha256:inspection.geometrySha256,
    triangles:inspection.triangles,inspection});
}
assert.equal(new Set(collection.resources.map(r=>r.geometrySha256)).size,collection.resources.length,'Duplicate cart structure');
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
