import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {checkManagedOutput} from './package-company.mjs';

const {PNG} = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceDir = 'assets-source/company-wall-hvac-v1';
const sampleDir = 'output/wall-hvac-v1/adapter-first';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const originalSHA = 'a0bb34999e3060813a367a200d9ff7dcf1a0049317ea0b608e6dcea2eec70ad0';
const partNames = ['wall-ac-status', 'wall-ac-intake', 'wall-ac-body', 'wall-ac-louver', 'wall-ac-mount'];
const vec = (x, y, z) => new T.Vector3(x, y, z);
const bounds = object => new T.Box3().setFromObject(object, true);
const extent = box => ({min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(vec()).toArray()});

// Fixed source files must resolve inside this copy of the production project.
async function inside(relative) {
  assert(relative.split('/').every(part => /^[\w.-]+$/.test(part) && part !== '..' && part !== '.'));
  const base = await fs.realpath(root);
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      await fs.lstat(current);
      const resolved = await fs.realpath(current);
      assert.equal(path.relative(current,resolved),'','A fixed asset or output path cannot be redirected through a link');
      current = resolved;
      const within = path.relative(base,current);
      assert(within && within !== '..' && !within.startsWith('..' + path.sep) && !path.isAbsolute(within), 'Path escapes the production project');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A dangling junction or link must not be accepted as a new directory.
      assert(!(await fs.lstat(current).catch(() => null)), 'Dangling output link');
    }
  }
  return current;
}

function sourceMeshes(bytes) {
  const length = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length);
  assert.equal(doc.nodes[7].extras.license, 'CC0-1.0');
  assert(doc.asset.copyright.includes('Innerscene'));
  function view(i) {
    const v = doc.bufferViews[i];
    assert(!v.byteStride && v.buffer === 0);
    return binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  }
  function attribute(index) {
    const a = doc.accessors[index];
    const Type = {5123: Uint16Array, 5126: Float32Array}[a.componentType];
    const items = {SCALAR: 1, VEC2: 2, VEC3: 3}[a.type];
    assert(Type && items && !a.sparse);
    const data = view(a.bufferView), start = a.byteOffset || 0;
    const copy = Uint8Array.from(data.subarray(start, start + a.count * items * Type.BYTES_PER_ELEMENT));
    return new T.BufferAttribute(new Type(copy.buffer), items);
  }
  const sourceColors = [], sourceImages = [];
  const materials = doc.materials.slice(0, 4).map(original => {
    const pbr = original.pbrMetallicRoughness;
    const image = doc.images[doc.textures[pbr.baseColorTexture.index].source];
    const png = view(image.bufferView);
    const {width, height, data} = PNG.sync.read(png);
    sourceImages.push(png);
    const rgb = [0, 0, 0], squares = [0, 0, 0], min=[255,255,255], max=[0,0,0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) {
      const value = data[i+c];
      rgb[c] += value;
      squares[c] += value*value;
      min[c] = Math.min(min[c],value); max[c] = Math.max(max[c],value);
    }
    const count = width * height;
    const swatch = rgb.map(channel => Math.round(channel / (width * height)));
    sourceColors.push({material: original.name, width, height, pngSHA256:digest(png), min, max, meanSRGB8: swatch,
      standardDeviationSRGB8: squares.map((sum,c)=>Math.sqrt(sum/count-(rgb[c]/count)**2))});
    const color = new T.Color().setRGB(...swatch.map(value => value / 255), T.SRGBColorSpace);
    return new T.MeshStandardMaterial({name: original.name, color, metalness: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor, side: T.DoubleSide});
  });
  const parts = partNames.map((name, index) => {
    const [p] = doc.meshes[index].primitives;
    const geometry = new T.BufferGeometry();
    for (const [key, att] of [['position','POSITION'], ['normal','NORMAL'], ['uv','TEXCOORD_0']]) {
      geometry.setAttribute(key, attribute(p.attributes[att]));
    }
    geometry.setIndex(attribute(p.indices));
    const mesh = new T.Mesh(geometry, materials[p.material]);
    mesh.name = name;
    mesh.userData = {sourceNode: index, sourceName: doc.nodes[index].name};
    return mesh;
  });
  return {parts, sourceColors, sourceRootTranslation: doc.nodes[7].translation,
    surfaces:{doc, pngs:sourceImages}};
}

// Copy the retained embedded PNG streams without a second encoding. Hook the
// donor material indices back into the modified geometry by material identity.
function embedSurfaces(geometryGLB, surfaces) {
  const raw = Buffer.from(geometryGLB), size = raw.readUInt32LE(12);
  const doc = JSON.parse(raw.subarray(20,20+size)), donor = surfaces.doc;
  const bins = [raw.subarray(28+size)], align = length => (4-length%4)%4;
  let cursor = bins[0].length;
  doc.samplers = donor.samplers;
  doc.textures = donor.textures.slice(0,surfaces.pngs.length);
  doc.images = surfaces.pngs.map((png,i)=>{
    const pad = Buffer.alloc(align(cursor));
    bins.push(pad,png); cursor += pad.length;
    const bufferView = doc.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:png.length})-1;
    cursor += png.length;
    return {...donor.images[i],bufferView};
  });
  for (const original of donor.materials.slice(0,surfaces.pngs.length)) {
    const index = doc.materials.findIndex(material=>material.name === original.name);
    assert(index >= 0, 'Retained material name missing in geometry export');
    doc.materials[index] = original;
  }
  doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), ...donor.extensionsUsed])];
  doc.asset.copyright = donor.asset.copyright;
  doc.buffers[0].byteLength = cursor;
  bins.push(Buffer.alloc(align(cursor)));
  const blob = Buffer.concat(bins), json = Buffer.from(JSON.stringify(doc));
  const text = Buffer.concat([json,Buffer.alloc(align(json.length),0x20)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28+text.length+blob.length,8);
  header.writeUInt32LE(text.length,12); header.write('JSON',16);
  binHeader.writeUInt32LE(blob.length); binHeader.write('BIN\0',4);
  const result = Buffer.concat([header,text,binHeader,blob]);
  for (const [i,image] of doc.images.entries()) {
    const view = doc.bufferViews[image.bufferView], start = 28+text.length+view.byteOffset;
    assert(result.subarray(start,start+view.byteLength).equals(surfaces.pngs[i]));
  }
  return result;
}

function bevelPatch(geometry, recipe, cx) {
  const old = geometry.toNonIndexed();
  const pos = old.attributes.position, normal = old.attributes.normal, uv = old.attributes.uv;
  const vertices = [], normals = [], uvs = [];
  const [i, j] = recipe.shellBevelTriangles.map(t => t * 3);
  const low = vec().fromBufferAttribute(pos, i + 1), high = vec().fromBufferAttribute(pos, i);
  const lowN = vec().fromBufferAttribute(normal, i + 1), highN = vec().fromBufferAttribute(normal, i);
  assert(Math.abs(high.y - low.y - .06) < 1e-6 && Math.abs(high.z - low.z - .035) < 1e-6);
  const zAt = y => T.MathUtils.lerp(low.z, high.z, (y - low.y) / (high.y - low.y));
  const [y0,y1] = recipe.slotY, half = recipe.slotHalfWidth;
  const x0 = cx - half, x1 = cx + half;
  const upperLeft = i, lowerLeft = i + 1, lowerRight = i + 2;
  const xmin = pos.getX(lowerLeft), xmax = pos.getX(lowerRight);
  assert(xmin < x0 && x1 < xmax && low.y < y0 && y0 < y1 && y1 < high.y);
  function newVertex(x, y) {
    const t = (y - low.y) / (high.y - low.y), s = (x - xmin) / (xmax - xmin);
    vertices.push(x, y, zAt(y));
    normals.push(...lowN.clone().lerp(highN, t).normalize().toArray());
    for (const read of [n => uv.getX(n), n => uv.getY(n)]) {
      uvs.push(read(lowerLeft) + t * (read(upperLeft) - read(lowerLeft)) + s * (read(lowerRight) - read(lowerLeft)));
    }
  }
  function rim(left, right, bottom, top) {
    for (const [x,y] of [[left,top], [left,bottom], [right,bottom], [left,top], [right,bottom], [right,top]]) newVertex(x,y);
  }
  for (let k = 0; k < pos.count; k++) if (!(k >= i && k < i + 3 || k >= j && k < j + 3)) {
    vertices.push(pos.getX(k), pos.getY(k), pos.getZ(k));
    normals.push(normal.getX(k), normal.getY(k), normal.getZ(k));
    uvs.push(uv.getX(k), uv.getY(k));
  }
  rim(xmin,x0,low.y,high.y); rim(x1,xmax,low.y,high.y);
  rim(x0,x1,low.y,y0); rim(x0,x1,y1,high.y);
  const result = new T.BufferGeometry();
  result.setAttribute('position', new T.Float32BufferAttribute(vertices,3));
  result.setAttribute('normal', new T.Float32BufferAttribute(normals,3));
  result.setAttribute('uv', new T.Float32BufferAttribute(uvs,2));
  return {geometry: result, zAt, mouth: [[x0,y0,zAt(y0)], [x1,y0,zAt(y0)], [x1,y1,zAt(y1)], [x0,y1,zAt(y1)]],
    slopeAngle: Math.atan2(high.y-low.y,high.z-low.z)};
}

function panel(name, quads, color) {
  const coordinates = [];
  for (const q of quads) for (const index of [0,1,2,0,2,3]) coordinates.push(...q[index]);
  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.Float32BufferAttribute(coordinates,3));
  geom.computeVertexNormals();
  const mesh = new T.Mesh(geom, new T.MeshStandardMaterial({name, color, roughness: .83, side: T.DoubleSide}));
  mesh.name = name;
  return mesh;
}

export async function buildIndoorAdapter() {
  const recipe = JSON.parse(await fs.readFile(await inside(sourceDir + '/indoor-adapter.json')));
  assert.equal(recipe.schema, 'company-wall-hvac-indoor-adapter-v1');
  assert.equal(recipe.source, 'original/ductless-wall-mounted-indoor-unit.glb');
  assert.equal(recipe.license, 'CC0-1.0');
  const bytes = await fs.readFile(await inside(sourceDir + '/' + recipe.source));
  assert.equal(digest(bytes), originalSHA); assert.equal(recipe.sourceSha256, originalSHA);
  const {parts, sourceColors, sourceRootTranslation, surfaces} = sourceMeshes(bytes);
  const [status, intake, shell, blade, mount] = parts;
  const plate = bounds(mount), centre = plate.getCenter(vec());
  const offset = vec(-centre.x,-centre.y,-plate.min.z);
  const original = new T.Group();
  for (const part of parts) {
    const mesh = part.clone();
    mesh.position.copy(offset);
    original.add(mesh);
  }
  const section = bevelPatch(shell.geometry,recipe,centre.x);
  shell.geometry = section.geometry;
  const mouth = section.mouth, rear = mouth.map(([x,y]) => [x,y,recipe.backZ]);
  assert(recipe.backZ > .04 && recipe.backZ < mouth[0][2] - .02);
  const liners = mouth.map((point,i) => [point,mouth[(i+1)%4],rear[(i+1)%4],rear[i]]);
  const lining = panel('wall-ac-outlet-lining', liners, recipe.ductColorSRGB);
  const back = panel('wall-ac-outlet-back', [rear], recipe.backColorSRGB);
  const bladeBox = bounds(blade), sourcePivot = bladeBox.getCenter(vec());
  sourcePivot.z = bladeBox.min.z + recipe.hingeOffsetFromSourceFlapRear;
  const hinge = vec(centre.x, recipe.hingeY, section.zAt(recipe.hingeY)).add(offset);
  blade.geometry = blade.geometry.clone().translate(-sourcePivot.x, -sourcePivot.y, -sourcePivot.z).rotateX(-section.slopeAngle);
  blade.position.copy(hinge);
  const openRadians = T.MathUtils.degToRad(recipe.openBladeDegreesFromHorizontal) + section.slopeAngle;
  blade.userData.hinge = {axis: 'local +X', closedRotationX: 0, openRotationX: openRadians, unit: 'radian'};
  const scene = new T.Scene();
  scene.name = 'Innerscene-indoor-unit';
  for (const part of [status,intake,shell,mount,lining,back]) {
    part.geometry = part.geometry.clone().translate(...offset.toArray());
    scene.add(part);
  }
  scene.add(blade);
  scene.userData = {author: recipe.sourceAuthor, originalLicense: recipe.license, originalSHA256: originalSHA};
  return {scene,original,blade,openRadians,hinge,offset,sourcePivot,mouth,rear,recipe,sourceColors,sourceRootTranslation,surfaces};
}

function hit(scene, start, direction) {
  scene.updateMatrixWorld(true);
  const ray = new T.Raycaster(start, direction.clone().normalize());
  const first = ray.intersectObject(scene,true).find(item => item.object.visible);
  return first ? {mesh: first.object.name, point: first.point.toArray(), distance: first.distance} : null;
}

function verify(model, original, open, offset, casingParts = new Set(['wall-ac-body'])) {
  const tests = [];
  for (const x of [-.31, 0, .31]) for (const rise of [0,.23]) {
    // In both views the ray passes the bevel at native y=.034, z=.175.
    const start = vec(x,.034-rise*(.45-.175),.45).add(offset), dir = vec(0,rise,-1);
    const donor = hit(original,start,dir);
    const actual = hit(model,start,dir);
    assert.equal(donor?.mesh, 'wall-ac-body', 'Untouched source must physically occlude the target');
    assert.equal(actual?.mesh, open ? 'wall-ac-outlet-back' : 'wall-ac-louver', 'Expected physical first intersection from the room');
    if (open) assert(actual.point[2] < .14 && donor.point[2] - actual.point[2] > .045);
    tests.push({x,rise,origin: start.toArray(), direction: dir.normalize().toArray(), donor, actual});
  }
  const shellWidth = bounds(model.getObjectByName('wall-ac-body')).getSize(vec()).x;
  // Place the side negative in the end cheek even for a recipient's widened
  // curve design. Keep the fixed 380 mm pilot ray for the original 800 mm shell.
  const cheekX = Math.abs(shellWidth-.8)<1e-6 ? .38 : shellWidth*.475;
  for (const [x,y] of [[-cheekX,.034],[cheekX,.034],[0,.085],[0,.001]]) {
    const start = vec(x,y,.45).add(offset);
    const actual = hit(model,start,vec(0,0,-1));
    // In the open pose the blade may occlude the very bottom rim.
    assert(casingParts.has(actual?.mesh) || open && y === .001 && actual?.mesh === 'wall-ac-louver');
    tests.push({outsideAperture: true, origin: start.toArray(), direction: [0,0,-1],actual});
  }
  return tests;
}

function verifySweep(adapter) {
  const {scene, blade, openRadians, recipe, offset, mouth} = adapter;
  const body = scene.getObjectByName('wall-ac-body');
  const lining = scene.getObjectByName('wall-ac-outlet-lining');
  const back = scene.getObjectByName('wall-ac-outlet-back');
  const bladeMesh = blade.geometry.toNonIndexed(), pos = bladeMesh.attributes.position;
  const sweep = new T.Box3(), a = vec(), b = vec(), c = vec();
  // For this convex source flap, any intersection with an obstacle triangle
  // occurs on a flap edge or obstacle edge. Check both directions.
  function edges(geometry) {
    const attr = geometry.attributes.position, index = geometry.index;
    const out = [], seen = new Set();
    for (let i=0; i<(index?.count ?? attr.count); i+=3) for(let j=0;j<3;j++) {
      const points = [j,(j+1)%3].map(k => vec().fromBufferAttribute(attr, index ? index.getX(i+k) : i+k));
      const key = points.map(p => p.toArray().map(v => v.toFixed(7)).join(',')).sort().join('/');
      if (!seen.has(key)) { seen.add(key); out.push(points); }
    }
    return out;
  }
  const obstructions = [body,lining,back], fixed = obstructions.flatMap(mesh => edges(mesh.geometry));
  const movable = edges(blade.geometry);
  const cast = new T.Raycaster();
  function intersects(p,q,objects) {
    const direction = q.clone().sub(p), length = direction.length();
    if (length < 1e-7) return false;
    cast.set(p,direction.divideScalar(length)); cast.near = 1e-7; cast.far = length - 1e-7;
    return cast.intersectObjects(objects,false).length > 0;
  }
  assert.equal(recipe.sweepIntervals,400);
  const minimum = vec(-.5,-.175,0), maximum = vec(.5,.175,.22);
  for (let i=0;i<=recipe.sweepIntervals;i++) {
    blade.rotation.x = openRadians * i / recipe.sweepIntervals;
    scene.updateMatrixWorld(true);
    for (let k=0;k<pos.count;k++) sweep.expandByPoint(a.fromBufferAttribute(pos,k).applyMatrix4(blade.matrixWorld));
    for(const [p,q] of movable) assert(!intersects(b.copy(p).applyMatrix4(blade.matrixWorld),c.copy(q).applyMatrix4(blade.matrixWorld),obstructions),
      'Blade edge collides with casing or duct, sample ' + i);
    for(const [p,q] of fixed) assert(!intersects(p,q,[blade]), 'Casing or duct edge collides with blade, sample ' + i);
  }
  blade.rotation.x = 0;
  const box = bounds(scene).union(sweep);
  assert(new T.Box3(minimum,maximum).expandByScalar(2e-7).containsBox(box),'Mounted swept model exceeds the specified wall volume');
  return {samples: recipe.sweepIntervals+1, sweep: extent(sweep), wholeUnit: extent(box), designEnvelope: {min: minimum.toArray(),max: maximum.toArray()},
    obstructionMeshes: obstructions.map(o=>o.name), apertureMountCoordinates: mouth.map(p=>vec(...p).add(offset).toArray())};
}

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {this.result=result; this.onloadend?.({target:this});}).catch(error=>this.onerror?.(error));
  }
};

async function existing(target) {
  try { return await fs.lstat(target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

async function requireNew(directory) {
  assert(!(await existing(directory)), 'Output already exists. Use --check or choose a new directory: '+directory);
}

async function publish(directory, files) {
  const parent = path.dirname(directory);
  await fs.mkdir(parent,{recursive:true});
  const stagePrefix = path.join(parent,'.'+path.basename(directory)+'.stage-');
  await checkManagedOutput(stagePrefix,root,{allowDelivery:false});
  const stage = await fs.mkdtemp(stagePrefix);
  try {
    for (const [name,bytes] of files) await fs.writeFile(path.join(stage,name),bytes,{flag:'wx'});
    // A competing producer can only publish a populated directory. Directory
    // rename cannot replace it. Recheck before rename to also preserve empty
    // destinations created while this job was building its files.
    await checkManagedOutput(directory,root,{allowDelivery:false});
    await requireNew(directory);
    await fs.rename(stage,directory);
  } catch (error) {
    for (const name of files.keys()) await fs.rm(path.join(stage,name),{force:true});
    await fs.rmdir(stage);
    throw error;
  }
}

async function run() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && ['--check','--output'].includes(args[0]) && args[1].trim()),
    'Usage: node scripts/company-platform/adapt-indoor-ac.mjs --output NEW_DIR | --check EXISTING_DIR');
  const directory = args.length ? path.resolve(args[1]) : path.resolve(root,sampleDir);
  await checkManagedOutput(directory,root,{allowDelivery:false});
  const check = args.length ? args[0] === '--check' : Boolean(await existing(directory));
  if (check) assert((await existing(directory))?.isDirectory(),'Expected existing adapter output directory: '+directory);
  else await requireNew(directory);
  const a = await buildIndoorAdapter();
  const sweep = verifySweep(a);
  const report = {sourceSHA256: originalSHA, sourceAuthor: a.recipe.sourceAuthor, license: a.recipe.license,
    sourceRootTranslationRemoved: a.sourceRootTranslation, appliedMeshLocalTranslation: a.offset.toArray(),
    measuredOriginalSwatches: a.sourceColors, excludedSourceMeshes: [5,6],
    retainedAppearance: 'All four original mounted-unit PNG byte streams, UV mapping, samplers and PBR definitions are retained, including the control panel KHR_materials_specular. The omitted fifth material belongs only to the excluded drain hose. New outlet surfaces have separate solid PBR materials.',
    construction: 'Replaced lower-front bevel source triangles 20 and 21 with four rim strips. The other 22 shell triangles, including the bottom, are retained. Four physical reveal walls reach a separate recessed back plane.',
    sceneBasis: 'identity; metres; +Y up and +Z into room; mount back face centred on origin',
    hinge: {node: a.blade.name, parent: a.scene.name, localPosition: a.hinge.toArray(), localAxis: [1,0,0],
      closedRotationX: 0, openRotationX: a.openRadians, unit: 'radian', rotationType: 'absolute local Euler X; authored closed slope baked into mesh vertices; parent identity; mesh scale 1'},
    sweep, files: {}};
  const output = new Map();
  for (const isOpen of [false,true]) {
    const name = isOpen ? 'open.glb' : 'closed.glb';
    a.blade.rotation.x = isOpen ? a.openRadians : 0;
    const buffer = await new GLTFExporter().parseAsync(a.scene,{binary:true,trs:true});
    const bytes = embedSurfaces(buffer,a.surfaces);
    // GLTFLoader can decode actual PNG pixels through the project PNG library
    // in Node. Browsers load the identical embedded streams natively.
    globalThis.self ??= globalThis;
    globalThis.createImageBitmap ??= async blob=>PNG.sync.read(Buffer.from(await blob.arrayBuffer()));
    const readback = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
    for (const name of partNames) {
      const map = readback.getObjectByName(name).material.map;
      assert(map?.image.width === 2048 && map.image.height === 2048, 'Retained donor map failed to decode: '+name);
    }
    assert(Math.abs(readback.getObjectByName('wall-ac-status').material.specularIntensity-.7)<1e-6);
    const blade = readback.getObjectByName('wall-ac-louver');
    assert(blade?.isMesh && blade.geometry.attributes.position.count === 96);
    assert(Math.abs(blade.rotation.x - a.blade.rotation.x)<1e-6 && blade.scale.equals(vec(1,1,1)));
    const hits = verify(readback,a.original,isOpen,a.offset);
    output.set(name,bytes);
    report.files[name] = {sha256:digest(bytes),bytes:bytes.length, mountedBounds:extent(bounds(readback)), fixedRays:hits};
  }
  // Fault replay: refit the original uninterrupted lower shell over the open
  // outlet. This must make the exact same open-state verification fail.
  const sealed = a.original.getObjectByName('wall-ac-body').clone();
  a.scene.add(sealed);
  assert.throws(()=>verify(a.scene,a.original,true,a.offset),/Expected physical first intersection/);
  a.scene.remove(sealed);
  verify(a.scene,a.original,true,a.offset);
  report.failureAndRetry = 'Reinstating the untouched solid shell in the open pose was rejected. Removing the obstruction restored all six back-plane ray hits.';
  output.set('report.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
  if (check) {
    for (const [name,bytes] of output) {
      const file = path.join(directory,name);
      await checkManagedOutput(file,root,{allowDelivery:false});
      assert((await existing(file))?.isFile() && bytes.equals(await fs.readFile(file)), 'Missing or mismatched adapter output: '+file);
    }
  } else {
    await publish(directory,output);
  }
  console.log(JSON.stringify({mode:check?'checked':'created',directory,
    sha256:Object.fromEntries(Object.entries(report.files).map(([name,file])=>[name,file.sha256]))}));
}
export {inside as fixedProjectPath, embedSurfaces, verify as verifyAdapterRays, verifySweep as verifyAdapterSweep};
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().catch(error=>{console.error(error); process.exitCode=1;});
}
