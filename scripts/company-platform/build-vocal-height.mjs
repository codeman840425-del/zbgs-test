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

const root = await fs.realpath(fileURLToPath(new URL('../../', import.meta.url)));
const family = 'assets-source/company-vocal-height-v1';
const donor = 'prototype/public/company-assets/vocal-fit-v1/floor-vocal-mic-disc-fit-lower/v1';
const generator = 'scripts/company-platform/build-vocal-height.mjs';
const upstreamSidecarHash = 'faccd8e595767e43188947db2f38e9af1bd77308db2d80953f5d95760fa1d395';
const reference = 'https://www.k-m.de/media/pdf/2b/84/f3/25680-577-55.pdf';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const rounded = x => Number(x.toFixed(7));

async function safe(rootDir, relative) {
  const parts = relative.split('/');
  assert(parts.every(p => /^[\w-][\w.-]*$/.test(p) && !p.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'Unsafe project path: ' + relative);
  let target = rootDir;
  for (const part of parts) {
    target = path.join(target, part);
    const stat = await fs.lstat(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (stat) assert(!stat.isSymbolicLink() && await fs.realpath(target) === target, 'Linked project path: ' + target);
  }
  return target;
}
async function read(relative) { return fs.readFile(await safe(root, relative)); }
async function pinned(relative, expected) {
  const bytes = await read(relative);
  assert.equal(sha(bytes), expected, 'Changed production input: ' + relative);
  return bytes;
}
function decode(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const end = 20 + bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(end + 4), 0x004e4942);
  return {g: JSON.parse(bytes.subarray(20, end)), bin: bytes.subarray(end + 8)};
}
function encode(g, bin) {
  const body = Buffer.from(JSON.stringify(g)), size = Math.ceil(body.length / 4) * 4;
  const header = Buffer.alloc(20), tail = Buffer.alloc(8);
  [0x46546c67, 2, 28 + size + bin.length, size, 0x4e4f534a].forEach((n,i) => header.writeUInt32LE(n, i*4));
  tail.writeUInt32LE(bin.length); tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, body, Buffer.alloc(size-body.length, 32), tail, bin]);
}
const measuredDrop = .16437267564332592;
const moving = ['fitted-microphone','mast-inner-slider','upper-mast-collar','short-arm-hinge',
  'arm-thumbwheel','singing-boom','boom-tip-joint','boom-inner-slider'];
const base = ['weighted-disc','singing-tripod','disc-inlay','mast-socket'];
const head = ['singing-mic-pickup','singing-mic-collar','singing-mic-handle','singing-mic-clip'];
const mastZ = .015, tubeBottom = .1725, tubeTop = 1.0275, lockBottom = .9615, lockTop = 1.0385;
const screwY = (tubeTop+lockTop)/2, cut = .17, bore = .0202, guideBore = .01955;
function validate(p) {
  const fields=['kind','id','version','displayName','mastDropMetres'];
  if(Object.hasOwn(p,'observation')) fields.push('observation');
  assert.deepEqual(Object.keys(p).sort(),fields.sort());
  assert.equal(p.kind,'vocal');
  assert(/^floor-vocal-mic-disc-height-[a-z0-9][a-z0-9-]{0,38}$/.test(p.id));
  assert(Number.isSafeInteger(p.version) && p.version>0 && typeof p.displayName==='string' && p.displayName.trim());
  assert(Number.isFinite(p.mastDropMetres)&&p.mastDropMetres>0,'The lower stop needs a measured positive drop');
  if(!p.observation) assert.equal(p.mastDropMetres,measuredDrop,'A different stop requires a pinned mouth observation');
}

// An annular frustum has two actual wall surfaces and annular end faces. A partial turn makes a radial screw passage.
function ring(bottom,top,outerBottom,outerTop,innerBottom,innerTop,gap=0) {
  const positions = [], segments=64;
  const point = (radius,y,angle) => v(radius*Math.cos(angle),y,radius*Math.sin(angle));
  function face(a,b,c,d,outward) {
    const normal = v().crossVectors(b.clone().sub(a),c.clone().sub(a));
    const order = normal.dot(outward)>0 ? [a,b,c,a,c,d] : [a,d,c,a,c,b];
    for(const p of order) positions.push(...p.toArray());
  }
  for(let i=0;i<segments;i++) {
    // The crown and liner leave opposed ports for the pressure screw and its adjustable backing stop.
    const half=segments/2, sector=(i<half?0:1);
    const angle=j=>gap ? sector*Math.PI+gap+(Math.PI-2*gap)*(j-sector*half)/half : 2*Math.PI*j/segments;
    const a=angle(i),b=angle(i+1), radial=point(1,0,(a+b)/2);
    const A=point(outerBottom,bottom,a), B=point(outerBottom,bottom,b);
    const C=point(outerTop,top,b), D=point(outerTop,top,a);
    const E=point(innerBottom,bottom,a), F=point(innerBottom,bottom,b);
    const G=point(innerTop,top,b), H=point(innerTop,top,a);
    face(A,B,C,D,radial); face(E,F,G,H,radial.clone().negate());
    face(A,B,F,E,v(0,-1,0)); face(D,C,G,H,v(0,1,0));
    if(gap && i%half===0) face(A,D,H,E,v(Math.sin(a),0,-Math.cos(a)));
    if(gap && (i+1)%half===0) face(B,C,G,F,v(-Math.sin(b),0,Math.cos(b)));
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals();
  return geo;
}
function heightModel(id,drop,bytes) {
  const {g,bin}=decode(bytes),chunks=[bin],rootNode=g.nodes[0];
  assert.equal(g.buffers[0].byteLength,bin.length);
  const node=name=>{const n=g.nodes.find(o=>o.name===name); assert(n,name); return n;};
  const frame=g.meshes[node('telescoping-mast').mesh].primitives[0].material;
  const accent=g.meshes[node('height-lock').mesh].primitives[0].material;
  const rubber=g.meshes[node('singing-tripod').mesh].primitives[0].material;
  const slider=node('mast-inner-slider'), prim=g.meshes[slider.mesh].primitives[0], bounds=g.accessors[prim.attributes.POSITION];
  const sliderBase=bounds.min[1]+slider.translation[1]-drop;
  const radiusAtLock=T.MathUtils.lerp(-bounds.min[0],.016,(screwY-sliderBase)/(bounds.max[1]-bounds.min[1]));
  rootNode.name=id; g.asset.generator='company-vocal-height-v1';
  for(const name of moving) {
    const n=node(name);
    n.translation??=[0,0,0]; n.translation[1]-=drop;
  }
  function mesh(name,geometry,material) {
    geometry.computeBoundingBox();
    const attributes={};
    for (const [label,key] of [['POSITION','position'],['NORMAL','normal']]) {
      const a=geometry.getAttribute(key),data=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
      const view=g.bufferViews.push({buffer:0,byteOffset:g.buffers[0].byteLength,byteLength:data.length,target:34962})-1;
      chunks.push(data); g.buffers[0].byteLength+=data.length;
      attributes[label]=g.accessors.push({bufferView:view,componentType:5126,count:a.count,type:'VEC3',
        ...(key==='position'?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:{})})-1;
    }
    const primitive={attributes,material},original=g.nodes.find(o=>o.name===name);
    if(original) g.meshes[original.mesh].primitives=[primitive];
    else {
      const index=g.meshes.push({name,primitives:[primitive]})-1;
      rootNode.children.push(g.nodes.push({name,mesh:index})-1);
    }
  }
  const vertical=(...dimensions)=>ring(...dimensions).translate(0,0,mastZ);
  const side=geometry=>geometry.rotateZ(-Math.PI/2).translate(0,screwY,mastZ);
  const solid=(from,to,radius,sides)=>side(new T.CylinderGeometry(radius,radius,to-from,sides).toNonIndexed().translate(0,(from+to)/2,0));
  const outerAtLock=T.MathUtils.lerp(.033,.025,(lockBottom-tubeBottom)/(tubeTop-tubeBottom));
  mesh('telescoping-mast',vertical(tubeBottom,tubeTop,.033,.025,bore,bore),frame);
  mesh('height-lock',vertical(lockBottom,tubeTop,.039,.0347,outerAtLock,.025),accent);
  mesh('height-lock-crown',vertical(tubeTop,lockTop,.0347,.034,.0235,.0235,cut),accent);
  mesh('mast-guide-bushing',vertical(tubeTop,lockTop,.0235,.0235,guideBore,guideBore,cut),frame);
  mesh('height-lock-barrel',side(ring(.029,.047,.0085,.0085,.0035,.0035)),accent);
  mesh('height-lock-pressure-screw',solid(radiusAtLock,.056,.0027,32),frame);
  mesh('height-lock-grip',solid(.054,.068,.013,12),rubber);
  const opposite=geometry=>geometry.translate(0,0,-mastZ).rotateY(Math.PI).translate(0,0,mastZ);
  mesh('height-lock-counter-barrel',opposite(side(ring(.029,.044,.0085,.0085,.0035,.0035))),accent);
  mesh('height-lock-counter-screw',opposite(solid(radiusAtLock,.046,.0027,32)),frame);
  mesh('height-lock-counter-head',opposite(solid(.044,.049,.006,6)),accent);
  return encode(g,Buffer.concat(chunks));
}
async function load(bytes) {
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isMesh)o.material.side=T.DoubleSide;});
  return scene;
}
function physicalState(scene,original,drop) {
  const obj=(name,s=scene)=>{const o=s.getObjectByName(name); assert(o,name); return o;};
  const box=o=>new T.Box3().setFromObject(o,true);
  const world=(o,i)=>o.localToWorld(v().fromBufferAttribute(o.geometry.attributes.position,i));
  const rays=(start,dir,objects,max=Infinity)=>new T.Raycaster(start,dir,0,max).intersectObjects(objects,false);
  const checkedVertices={};
  function samePart(name,dy) {
    const a=obj(name,original),b=obj(name),count=a.geometry.attributes.position.count;
    assert.equal(count,b.geometry.attributes.position.count);
    for(let i=0;i<count;i++) assert(world(a,i).add(v(0,dy,0)).distanceTo(world(b,i))<1e-7,'Rigid part displaced: '+name);
    checkedVertices[name]=count;
  }
  for(const name of base) samePart(name,0);
  for(const name of [...head,...moving.slice(1)]) samePart(name,-drop);
  const feet=obj('singing-tripod'),pads=[];
  for(let i=0;i<feet.geometry.attributes.position.count;i++) {
    const p=world(feet,i);
    if(Math.abs(p.y)<1e-5 && !pads.some(q=>p.distanceTo(q)<.06)) pads.push(p);
  }
  assert.equal(pads.length,3);
  for(const p of pads) {
    const hit=rays(v(p.x,.01,p.z),v(0,1,0),[obj('weighted-disc')])[0];
    assert(hit && Math.abs(hit.point.y-.013)<1e-5,'Disc misses a floor pad');
  }
  const fixed=['telescoping-mast','height-lock','height-lock-crown','mast-guide-bushing'].map(k=>obj(k));
  function passBore() {
    for(const r of [0,.01905]) for(let i=0;i<(r?64:1);i++) {
      const angle=2*Math.PI*i/64;
      assert.equal(rays(v(r*Math.cos(angle),1.05,mastZ+r*Math.sin(angle)),v(0,-1,0),fixed,.89).length,0,'Blocked axial bore');
    }
  }
  passBore();
  const slider=obj('mast-inner-slider'), sliderBox=box(slider), sleeve=box(fixed[0]);
  function radial(o,y,angle) {
    const hit=rays(v(0,y,mastZ),v(Math.cos(angle),0,Math.sin(angle)),[o])[0];
    assert(hit,'No radial wall: '+o.name); return hit.distance;
  }
  let gapAtGuide=Infinity,gapInTube=Infinity;
  const sectionAngles=64;
  for(let i=0;i<sectionAngles;i++) {
    const a=2*Math.PI*(i+.25)/sectionAngles;
    if(a>cut && a<2*Math.PI-cut && Math.abs(a-Math.PI)>cut) for(const y of [tubeTop+.0001,lockTop-.0001]) {
      gapAtGuide=Math.min(gapAtGuide,radial(fixed[3],y,a)-radial(slider,y,a));
    }
    for(const y of [sliderBox.min.y+.0001,tubeTop-.0001]) {
      gapInTube=Math.min(gapInTube,radial(fixed[0],y,a)-radial(slider,y,a));
    }
  }
  assert(gapAtGuide>.0005 && gapAtGuide<.0025 && gapInTube>.001,'Tube or guide interferes with inner mast');
  const lockMembers=fixed.slice(2).concat(obj('height-lock-barrel'),obj('height-lock-counter-barrel'));
  const tipGap={};
  for(const sign of [1,-1]) {
    for(const [dy,dz] of [[0,0],[.0027,0],[-.0027,0],[0,.0027],[0,-.0027]]) {
      assert.equal(rays(v(sign*.08,screwY+dy,mastZ+dz),v(-sign,0,0),lockMembers,.08).length,0,'Obstructed screw passage');
    }
    const label=sign>0?'pressure':'counter',screw=box(obj('height-lock-'+label+'-screw'));
    const end=sign>0?screw.min.x:-screw.max.x,angle=sign>0?0:Math.PI;
    tipGap[label]=rounded(end-radial(slider,screwY,angle));
    assert(Math.abs(tipGap[label])<.000025,'Lock screw fails to seat on slider: '+label);
  }
  const insertion=sleeve.max.y-sliderBox.min.y;
  assert(insertion>.055 && sliderBox.min.y-sleeve.min.y>.63,'Mast travel exceeds proven insertion or free depth');
  function thickness(name, y, z) {
    const hits=rays(v(-.2,y,z),v(1,0,0),[obj(name)]);
    return [...new Set(hits.map(h=>rounded(h.point.x)))];
  }
  // Sweep contact sections on the crown and barrel, lock-to-mast, grip, and socket. Lathed walls meet at their mating radii.
  function contact(name,first,second,tolerance) {
    assert(first.length>=2 && second.length>=2,name+' missing section');
    let gap=Infinity;
    for(let i=0;i<first.length-1;i+=2)for(let j=0;j<second.length-1;j+=2) {
      gap=Math.min(gap,Math.max(first[i],second[j])-Math.min(first[i+1],second[j+1]));
    }
    assert(gap<=tolerance,name+' disconnected'); return rounded(gap);
  }
  const joints={};
  for(const [a,b,y,z,tolerance] of [
    ['telescoping-mast','height-lock',.99,.016,.00001],
    ['mast-guide-bushing','height-lock-crown',screwY,.024,.00001],
    ['height-lock-barrel','height-lock-crown',screwY,.022,0],
    ['height-lock-pressure-screw','height-lock-grip',screwY+.0004,.0152,0],
    ['height-lock-counter-barrel','height-lock-crown',screwY,.022,0],
    ['height-lock-counter-screw','height-lock-counter-head',screwY+.0004,.0152,0],
    ['telescoping-mast','mast-socket',.174,.016,0]]) {
    joints[a+'/'+b]=contact(a+'/'+b,thickness(a,y,z),thickness(b,y,z),tolerance);
  }
  const grille=obj('singing-mic-pickup'), center=box(grille).getCenter(v());
  const meshes=[],slots={};
  scene.traverse(o=>{if(o.isMesh){meshes.push(o);(slots[o.material.name.startsWith('stand-')?o.material.name.slice(6):'microphone']??=[]).push(o.name);}});
  const hit=rays(center.clone().add(v(0,0,.18)),v(0,0,-1),meshes)[0];
  assert.equal(hit?.object.name,'singing-mic-pickup','First physical hit must be the grille');
  assert([grille.material.map,grille.material.normalMap,grille.material.roughnessMap].every(m=>m?.image?.width===512&&m.image.height===512));
  const b=box(scene);
  assert(Math.abs(b.min.y)<1e-5&&b.max.y<=1.75&&b.min.x>=-.33&&b.max.x<=.33&&b.min.z>=-.48&&b.max.z<=.48,'Exceeds operating envelope');
  return {slots,report:{checkedVertices,groundContactPoints:pads.map(p=>p.toArray().map(rounded)),
    bounds:{min:b.min.toArray().map(rounded),max:b.max.toArray().map(rounded)},grilleCenter:center.toArray().map(rounded),
    firstGrilleHit:hit.point.toArray().map(rounded),pickupMatrix:obj('fitted-microphone').matrixWorld.toArray(),
    axialBoreRays:65,radialSections:sectionAngles,screwPassageRays:10,guideClearanceMetres:rounded(gapAtGuide),
    mastClearanceMetres:rounded(gapInTube),opposedScrewTipGapsMetres:tipGap,mastInsertionMetres:rounded(insertion),
    bottomClearanceMetres:rounded(sliderBox.min.y-sleeve.min.y),
    exposedMastBetweenLocksMetres:rounded(box(obj('upper-mast-collar')).min.y-lockTop),jointSectionSignedGapsMetres:joints}};
}
async function inspectBoth(p,model,donorBytes) {
  const [original,low,high]=await Promise.all([load(donorBytes),load(model),load(heightModel(p.id,0,donorBytes))]);
  const readLow=()=>physicalState(low,original,p.mastDropMetres);
  const {slots,report:lowStop}=readLow(), highStop=physicalState(high,original,0).report;
  assert(Math.abs(highStop.grilleCenter[1]-lowStop.grilleCenter[1]-p.mastDropMetres)<1e-6);
  function negative(name,change,restore,re) {
    change(); low.updateMatrixWorld(true);
    assert.throws(readLow,re,name);
    restore(); low.updateMatrixWorld(true);
  }
  const mast=low.getObjectByName('telescoping-mast'),shell=mast.geometry;
  negative('Retained capped donor mast',()=>{mast.geometry=original.getObjectByName('telescoping-mast').geometry;},()=>{mast.geometry=shell;},/Blocked axial bore/);
  const screw=low.getObjectByName('height-lock-pressure-screw');
  negative('Unseated lock',()=>{screw.position.x+=.004;},()=>{screw.position.x-=.004;},/Lock screw fails to seat/);
  const hinge=low.getObjectByName('short-arm-hinge'),originalY=hinge.position.y;
  negative('Drop head without hinge',()=>{hinge.position.y+=p.mastDropMetres;},()=>{hinge.position.y=originalY;},/Rigid part displaced: short-arm-hinge/);
  const blocker=low.getObjectByName('mast-guide-bushing'),pickup=low.getObjectByName('singing-mic-pickup');
  const grilleBounds=new T.Box3().setFromObject(pickup,true),center=grilleBounds.getCenter(v());
  // Use an actual part as an obstruction just in front of the mesh. Restrict this control to the singer's sightline.
  const blockedProbe=()=>new T.Raycaster(center.clone().add(v(0,0,.18)),v(0,0,-1)).intersectObject(low,true)[0];
  blocker.position.copy(center).sub(v(.023,1.033,mastZ)).add(v(0,0,.08));
  low.updateMatrixWorld(true);
  assert.equal(blockedProbe()?.object,blocker,'Grille obstruction control must hit the blocker');
  blocker.position.set(0,0,0); low.updateMatrixWorld(true);
  assert.equal(blockedProbe()?.object,pickup);
  return {materialSlots:slots,inspection:{lowStop,highStop,negativeControls:['retained capped donor mast','4 mm open lock screw','hinge left at upper stop','hardware in front of the grille']}};
}
const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-vocal-height.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/vocal-height-profile-v1/mic';
const stage = await safe(project, scratch);
await checkManagedOutput(stage,root,{allowDelivery:false});
let dest;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'), 'Path traversal in trial destination');
  const absolute = path.resolve(project,args.output), trial = path.relative(project,absolute).split(path.sep).join('/');
  assert(/^(output|company-workspace\/production-trials)\//.test(trial), 'Trial must stay inside project outputs');
  assert(trial!==scratch && !trial.startsWith(scratch+'/publication.lock') && !trial.startsWith(scratch+'/fit-'), 'Reserved producer directory');
  dest = await safe(project,trial);
  await checkManagedOutput(dest,root,{allowDelivery:false});
}
const input = args.parameters ?? family+'/parameters.json';
assert(input.endsWith('.json'));
const canonical = await read(family+'/parameters.json');
const recipeBytes = args.parameters ? await read(input) : canonical;
const recipe = JSON.parse(recipeBytes);
assert.deepEqual(Object.keys(recipe).sort(), ['schema','version','designs'].sort());
assert(recipe.schema==='company-vocal-height' && recipe.version===1 && Array.isArray(recipe.designs) && recipe.designs.length===1,
  'Expected one company-vocal-height design');
const [p] = recipe.designs;
validate(p);
if(args.parameters && !canonical.equals(recipeBytes)) {
  const [signed] = JSON.parse(canonical).designs;
  assert(p.id!==signed.id || p.version!==signed.version, 'Edited geometry needs a new ID/version');
}
const source = JSON.parse(await pinned(donor+'/resource.json', upstreamSidecarHash));
const donorModel = await pinned(donor+'/model.glb', source.asset.sha256);
const dependencies = {...source.provenance.dependencies,
  heightSourceRecord:{path:family+'/source-record.json',sha256:'00c0cc6489bb7d1a568740a89ed22abdb3d66bf4c8b29ef9578d7bfe47bb366c'},
  heightSourceSidecar:{path:donor+'/resource.json',sha256:upstreamSidecarHash},
  heightSourceModel:{path:donor+'/model.glb',sha256:source.asset.sha256},
  heightSourceParameters:{path:source.provenance.sourceParameters,sha256:source.provenance.sourceParametersSha256},
  heightSourceGenerator:{path:source.provenance.generator,sha256:source.provenance.generatorSha256}};
await Promise.all(Object.values(dependencies).map(pin=>pinned(pin.path,pin.sha256)));
const basis=JSON.parse(await read(dependencies.heightSourceRecord.path)).measurement;
let mouthHeight=basis.medianFemaleLipYMetres, targetAboveLip=basis.targetAboveLipMetres;
if(Object.hasOwn(p,'observation')) {
  const obs=p.observation;
  assert(obs&&Object.keys(obs).sort().join(',')==='frameId,source,targetAboveLipMetres'&&
    obs.source&&Object.keys(obs.source).sort().join(',')==='path,sha256','Expected a pinned mouth observation');
  assert(/^assets-source\/company-[a-z0-9-]+\/(?:[\w-]+\/)*[\w-]+\.json$/.test(obs.source.path)&&/^[a-f0-9]{64}$/.test(obs.source.sha256));
  const footage=JSON.parse(await pinned(obs.source.path,obs.source.sha256));
  assert(footage.schema==='company-vocal-height-observations'&&footage.version===1&&Array.isArray(footage.frames));
  const matches=footage.frames.filter(f=>f.id===obs.frameId);
  assert(matches.length===1&&matches[0].mouthM?.length===3&&matches[0].mouthM.every(Number.isFinite),'Expected one measured facility-local mouth');
  mouthHeight=matches[0].mouthM[1];targetAboveLip=obs.targetAboveLipMetres;
  assert(Number.isFinite(targetAboveLip)&&Math.abs(targetAboveLip)<=.04,'Keep the measured fit near the mouth');
  dependencies.heightObservation=obs.source;
}
assert(Math.abs(p.mastDropMetres-(basis.originalGrilleYMetres-(mouthHeight+targetAboveLip)))<1e-9,'The proposed stop must match the measured mouth and reference offset');
const model = heightModel(p.id,p.mastDropMetres,donorModel);
const before=decode(donorModel),after=decode(model);
assert(after.bin.subarray(0,before.bin.length).equals(before.bin),'Original embedded mesh and image bytes changed');
for(const field of ['images','textures','materials']) assert.deepEqual(after.g[field],before.g[field]);
for(const name of [...base,...head,...moving.slice(1)]) {
  const index=before.g.nodes.find(n=>n.name===name).mesh;
  assert.deepEqual(after.g.meshes[index],before.g.meshes[index],'Changed donor UVs, triangles or normals: '+name);
}
installNodeImageDecodeShim();
const {materialSlots,inspection} = await inspectBoth(p,model,donorModel);
const folder = 'prototype/public/company-assets/vocal-height-v1/'+p.id+'/v'+p.version;
const asset = {format:'glb',url:folder.replace('prototype/public','')+'/model.glb',sha256:sha(model),bytes:model.length};
const provenance = {...source.provenance,sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),dependencies,mechanicalReference:reference};
const microphone = {...source.microphone,pickupFit:{...source.microphone.pickupFit,mastDropMetres:p.mastDropMetres}};
const resource = {...source,id:p.id,version:p.version,displayName:p.displayName,materialSlots,microphone,asset,provenance};
const collection = {schemaVersion:1,id:'company-vocal-height-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:provenance.generatorSha256,resources:[{id:p.id,version:p.version,resourcePath:folder+'/resource.json',
    modelPath:folder+'/model.glb',sha256:asset.sha256,inspection}]};
const files = new Map([[folder+'/model.glb',model],[folder+'/resource.json',json(resource)],[family+'/collection.json',json(collection)]]);
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
    spool = await fs.mkdtemp(path.join(stage,'fit-'));
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
console.log(JSON.stringify({id:p.id,sha256:asset.sha256,inspection}));
