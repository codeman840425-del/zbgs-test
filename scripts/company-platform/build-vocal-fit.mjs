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
const family = 'assets-source/company-vocal-fit-v1';
const donor = 'prototype/public/company-assets/vocal-mic-looks-v1/floor-vocal-mic-disc/v1';
const generator = 'scripts/company-platform/build-vocal-fit.mjs';
const upstreamSidecarHash = '5d670085303e1dc2740c92e8cbbe053f9a527870c25d17d07b360b6ec8acb717';
const reference = 'https://www.k-m.de/en/kmPdf/datasheet/ordernumber/21090-300-55';
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
function validate(p) {
  assert.deepEqual(Object.keys(p).sort(), ['kind', 'id', 'version', 'displayName',
    'boomPitchDegrees', 'forwardMetres'].sort());
  assert.equal(p.kind, 'vocal');
  assert(/^floor-vocal-mic-disc-fit-[a-z0-9][a-z0-9-]{0,38}$/.test(p.id) && Number.isSafeInteger(p.version) && p.version > 0);
  assert(typeof p.displayName === 'string' && p.displayName.trim());
  assert(Number.isFinite(p.boomPitchDegrees) && p.boomPitchDegrees >= -8 && p.boomPitchDegrees <= -4, 'Pitch outside [-8, -4] degrees');
  assert(Number.isFinite(p.forwardMetres) && p.forwardMetres >= 0 && p.forwardMetres <= .047, 'Forward travel outside [0, .047] metres');
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
function boomPose(p) {
  const pivot = v(0, 1.423, .015), elbow = v(0, 1.552, .30);
  const sourcePivot = v(0,1.3300000429153442,-.18028409779071808);
  const deltaRotation = new T.Quaternion().setFromAxisAngle(v(1,0,0), (p.boomPitchDegrees+8)*Math.PI/180);
  const micOffset = sourcePivot.clone().sub(sourcePivot.clone().applyQuaternion(deltaRotation)).add(v(0,0,p.forwardMetres));
  const transformTip = point => point.clone().applyQuaternion(deltaRotation).add(micOffset);
  const newElbow = transformTip(elbow);
  const newPivot = pivot.clone().add(v(0,newElbow.y-elbow.y,0));
  const length = pivot.distanceTo(elbow), axis = newElbow.clone().sub(newPivot).normalize();
  const rotation = new T.Quaternion().setFromUnitVectors(elbow.clone().sub(pivot).normalize(), axis);
  return {newPivot, newElbow, axis, length, rotation, pivot, deltaRotation, micOffset, transformTip, sourcePivot};
}
function fittedModel(p, donorBytes) {
  const {g, bin} = decode(donorBytes), chunks = [bin];
  const node = name => { const n = g.nodes.find(n => n.name === name); assert(n, name); return n; };
  const rootNode = g.nodes[0];
  rootNode.name = p.id; g.asset.generator = 'company-vocal-fit-v1';
  function addNode(name, primitive) {
    const mesh = g.meshes.push({name, primitives:[primitive]}) - 1;
    const index = g.nodes.push({name, mesh}) - 1;
    rootNode.children.push(index);
    return g.nodes[index];
  }
  // The donor's unindexed triangle lists concatenate two independently authored cylinders.
  // Slice POSITION and NORMAL on identical triangle boundaries; the microphone UVs and embedded PBR maps stay byte-exact.
  function split(name, newName, vertices) {
    const mesh = g.meshes[node(name).mesh], [prim] = mesh.primitives;
    assert.equal(prim.indices, undefined);
    assert.deepEqual(Object.keys(prim.attributes).sort(), ['NORMAL','POSITION']);
    const originalAttrs = {...prim.attributes};
    function slice(first) {
      const attributes = {};
      for (const [key, index] of Object.entries(originalAttrs)) {
        const a = g.accessors[index], view = g.bufferViews[a.bufferView];
        assert(a.type === 'VEC3' && a.componentType === 5126 && a.count === 2*vertices && !view.byteStride);
        const offset = (a.byteOffset ?? 0) + first*12;
        const part = {...a, count:vertices, byteOffset:offset};
        if (key === 'POSITION') {
          const box = new T.Box3();
          for (let i=0; i<vertices; i++) {
            const start = (view.byteOffset ?? 0) + offset + i*12;
            box.expandByPoint(v(bin.readFloatLE(start), bin.readFloatLE(start+4), bin.readFloatLE(start+8)));
          }
          part.min = box.min.toArray(); part.max = box.max.toArray();
        }
        attributes[key] = g.accessors.push(part)-1;
      }
      return attributes;
    }
    prim.attributes = slice(0);
    return addNode(newName, {...prim, attributes:slice(vertices)});
  }
  const pose = boomPose(p), {pivot, newPivot, newElbow, axis, length, rotation, deltaRotation, micOffset, sourcePivot} = pose;
  const down = [0, newPivot.y-pivot.y, 0];
  split('telescoping-mast', 'mast-inner-slider', 384).translation = down;
  split('height-lock', 'upper-mast-collar', 384).translation = down;
  node('short-arm-hinge').translation = down; node('arm-thumbwheel').translation = down;
  const tip = split('singing-boom', 'boom-tip-joint', 168);
  tip.rotation = deltaRotation.toArray(); tip.translation = micOffset.toArray();
  const sleeve = node('singing-boom');
  sleeve.rotation = rotation.toArray();
  sleeve.translation = newPivot.clone().sub(pivot.clone().applyQuaternion(rotation)).toArray();
  const microphone = node('fitted-microphone');
  assert.deepEqual(microphone.translation, sourcePivot.toArray());
  microphone.translation = sourcePivot.clone().add(v(0,0,p.forwardMetres)).toArray();
  microphone.rotation = new T.Quaternion().setFromAxisAngle(v(1,0,0), p.boomPitchDegrees*Math.PI/180).toArray();
  // A fixed-length inner tube terminates at the clip adapter and slides inside the fixed-length outer sleeve.
  const innerLength = .154;
  const geometry = new T.CylinderGeometry(.0095, .0095, innerLength, 16).toNonIndexed();
  geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(v(0,1,0), axis));
  geometry.translate(...newElbow.clone().addScaledVector(axis, .006-.5*innerLength).toArray());
  const attributes = {};
  geometry.computeBoundingBox();
  for (const [label,key] of [['POSITION','position'],['NORMAL','normal']]) {
    const a = geometry.getAttribute(key), bytes = Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength);
    const view = g.bufferViews.push({buffer:0, byteOffset:g.buffers[0].byteLength, byteLength:bytes.length,target:34962})-1;
    chunks.push(bytes); g.buffers[0].byteLength += bytes.length;
    attributes[label] = g.accessors.push({bufferView:view, componentType:5126, count:a.count, type:'VEC3',
      ...(label==='POSITION'?{min:geometry.boundingBox.min.toArray(), max:geometry.boundingBox.max.toArray()}:{})})-1;
  }
  addNode('boom-inner-slider', {attributes, material:g.meshes[sleeve.mesh].primitives[0].material});
  assert(length + innerLength - .006 - newPivot.distanceTo(newElbow) >= .085, 'Insufficient boom sleeve engagement');
  return encode(g, Buffer.concat(chunks));
}

async function inspect(p, bytes, donorBytes) {
  const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const original = (await new GLTFLoader().parseAsync(donorBytes.buffer.slice(donorBytes.byteOffset,donorBytes.byteOffset+donorBytes.byteLength),'')).scene;
  scene.updateMatrixWorld(true); original.updateMatrixWorld(true);
  const obj = name => { const o = scene.getObjectByName(name); assert(o, name); return o; };
  const bounds = new T.Box3().setFromObject(scene,true);
  assert(Math.abs(bounds.min.y)<.00001 && bounds.max.y<=1.75 && bounds.min.x>=-.33 && bounds.max.x<=.33 &&
    bounds.min.z>=-.48 && bounds.max.z<=.48, 'Model exceeds original working envelope');
  const {newPivot,newElbow,axis,length,transformTip} = boomPose(p);
  const checkedVertices = {};
  function verifyVertices(name, move) {
    const src = original.getObjectByName(name), fitted = obj(name);
    const from = src.geometry.getAttribute('position'), to = fitted.geometry.getAttribute('position');
    assert.equal(from.count,to.count);
    for(let i=0;i<from.count;i++) {
      const wanted = move(src.localToWorld(v().fromBufferAttribute(from,i)));
      const actual = fitted.localToWorld(v().fromBufferAttribute(to,i));
      assert(actual.distanceTo(wanted)<1e-7, 'Wrong physical vertex transform: '+name);
    }
    checkedVertices[name] = from.count;
  }
  for (const name of ['weighted-disc','singing-tripod','disc-inlay','mast-socket']) verifyVertices(name, point=>point);
  for (const name of ['singing-mic-pickup','singing-mic-collar','singing-mic-handle','singing-mic-clip']) verifyVertices(name, transformTip);
  const widths = {};
  function interval(name, y, z) {
    const hits = new T.Raycaster(v(-1, y, z), v(1,0,0)).intersectObject(obj(name), false);
    const xs = [...new Set(hits.map(h => rounded(h.point.x)))];
    assert(xs.length >= 2 && xs.length % 2 === 0, 'No solid cross section: ' + name);
    return xs;
  }
  function joint(a, b, at) {
    const A = interval(a, at.y, at.z), B = interval(b, at.y, at.z);
    let overlap = 0;
    for(let i=0;i<A.length;i+=2) for(let j=0;j<B.length;j+=2)
      overlap = Math.max(overlap, Math.min(A[i+1],B[j+1])-Math.max(A[i],B[j]));
    assert(overlap > .001, 'Disconnected solids: ' + a + ' / ' + b);
    widths[a+'/'+b] = rounded(overlap);
  }
  scene.traverse(o => { if(o.isMesh) o.material.side = T.DoubleSide; });
  const offAxis = .01537;
  joint('weighted-disc','mast-socket',v(0,.081,offAxis));
  joint('weighted-disc','disc-inlay',v(0,.04,.021));
  joint('mast-socket','telescoping-mast',v(0,.1737,offAxis));
  joint('telescoping-mast','height-lock',v(0,.991,offAxis));
  joint('telescoping-mast','mast-inner-slider',v(0,1.015,offAxis));
  joint('mast-inner-slider','upper-mast-collar',newPivot.clone().add(v(0,-.004,.001)));
  joint('upper-mast-collar','short-arm-hinge',newPivot.clone().add(v(0,.002,.001)));
  joint('short-arm-hinge','arm-thumbwheel',newPivot.clone().add(v(0,.002,.001)));
  joint('short-arm-hinge','singing-boom',newPivot.clone().addScaledVector(axis,.006));
  joint('singing-boom','boom-inner-slider',newPivot.clone().addScaledVector(axis,length-.03));
  joint('boom-inner-slider','boom-tip-joint',newElbow.clone().addScaledVector(axis,.003));
  joint('boom-tip-joint','singing-mic-clip',transformTip(v(0,1.58,.322)));
  const feet = obj('singing-tripod'), positions = feet.geometry.getAttribute('position');
  const pads = [];
  for(let i=0;i<positions.count;i++) {
    const point = feet.localToWorld(v().fromBufferAttribute(positions,i));
    if(Math.abs(point.y)<.00001 && !pads.some(other=>point.distanceTo(other)<.06)) pads.push(point);
  }
  assert.equal(pads.length,3);
  for(const point of pads) {
    const discBottom = new T.Raycaster(v(point.x,.01,point.z),v(0,1,0)).intersectObject(obj('weighted-disc'),false)[0];
    assert(discBottom && Math.abs(discBottom.point.y-.013)<.00001,'Disc must rest on the floor pads');
  }
  const grille = obj('singing-mic-pickup'), grilleBounds = new T.Box3().setFromObject(grille,true);
  const center = grilleBounds.getCenter(v()), probe = center.clone().add(v(0,0,.18));
  const hit = new T.Raycaster(probe,v(0,0,-1)).intersectObject(scene,true)[0];
  assert.equal(hit?.object,grille,'A stand part obstructs the real grille');
  assert([grille.material.map,grille.material.normalMap,grille.material.roughnessMap].every(m=>m?.image?.width===512 && m.image.height===512));
  const materialSlots = {}, parts = {};
  scene.traverse(o => {
    if(!o.isMesh) return;
    const slot = o.material.name.startsWith('stand-') ? o.material.name.slice(6) : 'microphone';
    (materialSlots[slot] ??= []).push(o.name);
    const box = new T.Box3().setFromObject(o,true);
    parts[o.name] = {min:box.min.toArray().map(rounded), max:box.max.toArray().map(rounded)};
  });
  return {materialSlots, checkedVertices, pickupParentMatrix:obj('fitted-microphone').matrixWorld.toArray(), groundContacts:pads.length, crossSectionOverlapMetres:widths, grilleCenter:center.toArray().map(rounded),
    singerSideGrilleHit:hit.point.toArray().map(rounded), parts,
    mastInsertionMetres:rounded(parts['telescoping-mast'].max[1]-parts['mast-inner-slider'].min[1]),
    boomInsertionMetres:rounded(length+.154-.006-newPivot.distanceTo(newElbow))};
}
const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-vocal-fit.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
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
const scratch = 'output/vocal-fit-v1/producer';
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
assert(recipe.schema==='company-vocal-fit' && recipe.version===1 && Array.isArray(recipe.designs) && recipe.designs.length===1,
  'Expected one company-vocal-fit design');
const [p] = recipe.designs;
validate(p);
if(args.parameters && !canonical.equals(recipeBytes)) {
  const [signed] = JSON.parse(canonical).designs;
  assert(p.id!==signed.id || p.version!==signed.version, 'Edited geometry needs a new ID/version');
}
const source = JSON.parse(await pinned(donor+'/resource.json', upstreamSidecarHash));
const donorModel = await pinned(donor+'/model.glb', source.asset.sha256);
const dependencies = {...source.provenance.dependencies,
  donorSidecar:{path:donor+'/resource.json',sha256:upstreamSidecarHash},
  donorModel:{path:donor+'/model.glb',sha256:source.asset.sha256},
  donorParameters:{path:source.provenance.sourceParameters,sha256:source.provenance.sourceParametersSha256},
  donorGenerator:{path:source.provenance.generator,sha256:source.provenance.generatorSha256}};
await Promise.all(Object.values(dependencies).map(pin=>pinned(pin.path,pin.sha256)));
const model = fittedModel(p,donorModel);
installNodeImageDecodeShim();
const {materialSlots,...inspection} = await inspect(p,model,donorModel);
const folder = 'prototype/public/company-assets/vocal-fit-v1/'+p.id+'/v'+p.version;
const asset = {format:'glb',url:folder.replace('prototype/public','')+'/model.glb',sha256:sha(model),bytes:model.length};
const provenance = {...source.provenance,sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
  generator,generatorSha256:sha(await read(generator)),dependencies,mechanicalReference:reference};
const microphone = {...source.microphone,pickupFit:{boomPitchDegrees:p.boomPitchDegrees,forwardMetres:p.forwardMetres}};
const resource = {...source,id:p.id,version:p.version,displayName:p.displayName,materialSlots,microphone,asset,provenance};
const collection = {schemaVersion:1,id:'company-vocal-fit-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),
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
console.log(JSON.stringify({id:p.id,version:p.version,sha256:asset.sha256,grilleCenter:inspection.grilleCenter,
  meshGrilleHit:inspection.singerSideGrilleHit,groundContacts:inspection.groundContacts,
  mastInsertionMetres:inspection.mastInsertionMetres,boomInsertionMetres:inspection.boomInsertionMetres}));
