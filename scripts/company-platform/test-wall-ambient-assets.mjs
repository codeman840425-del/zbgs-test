import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Box3, Color, Matrix3, Raycaster, SRGBColorSpace, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-wall-ambient-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const round = (value, digits = 8) => Number(value.toFixed(digits));
const load = file => fs.readFile(path.resolve(root, file));
const data = async file => JSON.parse(await load(file));
const tolerance = 1e-6;
const boundsOf = object => new Box3().setFromObject(object, true);
const normal = hit => hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
const ray = (x, y, z = .12) => new Raycaster(new Vector3(x, y, z), new Vector3(0, 0, -1));
const wallDepth = .04;

export async function loadWallGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(gltf.buffers.every(buffer => buffer.uri === undefined) && !gltf.images?.length, 'Wall lights must use standalone meshes and PBR material data');
  const { scene, animations } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''
  );
  assert.equal(animations.length, 0);
  scene.updateMatrixWorld(true);
  return scene;
}

function emitHit(scene, diffuser, x, y) {
  const hit = ray(x, y).intersectObject(scene, true)[0];
  return hit?.object === diffuser && hit.point.z >= .035 - tolerance && hit.point.z <= wallDepth + tolerance &&
    normal(hit).z > .30 ? hit : null;
}

export async function selectAmbientEmitter(bytes) {
  const scene = await loadWallGlb(bytes), diffuser = scene.getObjectByName('ambient-diffuser');
  assert(diffuser?.isMesh);
  const box = boundsOf(diffuser), local = box.getCenter(new Vector3());
  const ranges = [box.max.x - box.min.x, box.max.y - box.min.y];
  let result;
  for (let row = 1; row <= 32; row++) for (let col = 1; col <= 32; col++) {
    const x = round(local.x + (col / 33 - .5) * ranges[0], 5), y = round(local.y + (row / 33 - .5) * ranges[1], 5);
    const distance = x ** 2 + y ** 2;
    if (result && distance >= result.distance) continue;
    if (emitHit(scene, diffuser, x, y))
      result = { distance, position: [x, y, wallDepth], target: [x, round(y - .56, 8), .70] };
  }
  assert(result, 'Cannot find a front-facing emitted spot within 5 mm of Z=.04');
  return { position: result.position, target: result.target };
}

function measureMeshes(scene, materialSlots) {
  const model = scene.children[0], meshes = new Map(), signatures = new Map(), wallAreas = new Map(), materials = new Set();
  assert(scene.children.length === 1 && model.children.every(child => child.isMesh));
  let total = 0;
  for (const mesh of model.children) {
    assert(!meshes.has(mesh.name) && mesh.material?.isMeshStandardMaterial && !mesh.material.transparent);
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, index = mesh.geometry.index;
    const count = index?.count ?? p.count, triangles = [];
    assert.equal(p.count, n.count);
    assert.equal(count % 3, 0);
    total += count / 3;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(j => {
        const cursor = index?.getX(i + j) ?? i + j;
        assert(new Vector3().fromBufferAttribute(n, cursor).toArray().every(Number.isFinite));
        const point = new Vector3().fromBufferAttribute(p, cursor).applyMatrix4(mesh.matrixWorld);
        assert(point.toArray().every(Number.isFinite));
        return point;
      });
      triangles.push(points.map(point => point.toArray().map(n => round(n)).join(',')).sort().join('|'));
      if (!points.every(point => Math.abs(point.z) < tolerance)) continue;
      const [a, b, c] = points, surface = -.5 * b.clone().sub(a).cross(c.clone().sub(a)).z;
      if (surface <= 1e-11) continue;
      const entry = wallAreas.get(mesh.name) ?? { area: 0, biggest: 0 };
      entry.area += surface;
      if (entry.biggest < surface) {
        entry.biggest = surface; entry.sample = a.clone().add(b).add(c).divideScalar(3);
      }
      wallAreas.set(mesh.name, entry);
    }
    signatures.set(mesh.name, hash(triangles.sort().join('\n')));
  }
  assert(total <= 6000 && meshes.size <= 9 && materials.size <= 4, 'Wall light exceeds the reusable fixture budget');
  assert(Object.values(materialSlots).flat().length === meshes.size,
    'Each actual mesh must appear in exactly one finish slot');
  assert.equal(new Set(Object.values(materialSlots).flat()).size, meshes.size);
  for (const names of Object.values(materialSlots)) assert(names.every(name => meshes.has(name)));
  return { meshes, signatures, wallAreas, triangles: total, meshesCount: meshes.size, materialCount: materials.size };
}

function inspectContacts(scene, meshes, wallAreas) {
  const diffuser = meshes.get('ambient-diffuser'), diffuserBounds = boundsOf(diffuser);
  const contacts = [];
  for (const [name, item] of wallAreas) {
    const probe = new Raycaster(new Vector3(item.sample.x, item.sample.y, -.1), new Vector3(0, 0, 1));
    const hit = probe.intersectObject(scene, true)[0];
    assert(hit?.object !== diffuser && Math.abs(hit?.point.z) <= tolerance && normal(hit).z < -.99,
      'Wall anchors need a real outward-facing contact surface');
    contacts.push({ node: name, areaSquareMetres: round(item.area), sample: hit.point.toArray().map(n => round(n)) });
  }
  assert(contacts.length && !wallAreas.has('ambient-diffuser') && contacts.reduce((sum, entry) => sum + entry.areaSquareMetres, 0) > .00025,
    'Wall light needs positive-area, non-luminous physical anchors at its rear');
  assert(contacts.some(contact => boundsOf(meshes.get(contact.node)).intersectsBox(diffuserBounds)) ||
    [...meshes.values()].some(mesh => mesh !== diffuser && boundsOf(mesh).intersectsBox(diffuserBounds) &&
      contacts.some(item => boundsOf(meshes.get(item.node)).intersectsBox(boundsOf(mesh)))), 'Diffuser must meet its mounted structure');
  return contacts;
}

export async function inspectWallAmbientAsset(bytes, resource, design) {
  const scene = await loadWallGlb(bytes), envelope = boundsOf(scene), limits = resource.mounting;
  assert(envelope.min.x >= -limits.width / 2 - tolerance && envelope.max.x <= limits.width / 2 + tolerance &&
    envelope.min.y >= -limits.height / 2 - tolerance && envelope.max.y <= limits.height / 2 + tolerance &&
    Math.abs(envelope.min.z) <= tolerance && envelope.max.z <= limits.depth + tolerance,
    resource.id + ' exceeds the real wall mount envelope ' + JSON.stringify({ min: envelope.min, max: envelope.max }));
  const { meshes, signatures, wallAreas, ...stats } = measureMeshes(scene, resource.materialSlots);
  assert.deepEqual(resource.display.diffuser.nodes, ['ambient-diffuser']);
  const diffuser = meshes.get('ambient-diffuser');
  assert(diffuser?.isMesh && diffuser.material.emissiveIntensity > 0 && diffuser.material.emissive.getHexString() === 'e19447');
  assert.equal(new Color().setHSL(resource.stateDefaults.colorHue / 360, .72, .58, SRGBColorSpace).getHexString(), 'e19447');
  const { position, target } = resource.light;
  assert.deepEqual([position[2], target[0], target[1], target[2]], [.04, position[0], round(position[1] - .56), .70]);
  const hit = emitHit(scene, diffuser, ...position);
  assert(hit, 'Declared light point lacks an actual front-facing diffuser');
  const facing = normal(hit), direction = new Vector3().fromArray(target).sub(new Vector3().fromArray(position)).normalize();
  assert(direction.dot(facing) > 0, 'Beam should leave the fixture on the visible side');
  if (design.form === 'outline-tube')
    assert(!ray(0, 0).intersectObject(diffuser, false).length && !ray(0, 0).intersectObject(scene, true).length, 'Star must be truly hollow');
  if (design.form === 'linear-bars') {
    const { width, pitch } = design.shape;
    for (const y of [-pitch, 0, pitch]) assert(ray(-width * .39, y).intersectObject(diffuser, false).length);
    for (const y of [-pitch / 2, pitch / 2]) assert(!ray(-width * .39, y).intersectObject(diffuser, false).length);
  }
  if (design.form === 'studio-plaque') {
    const { symbolHeight, plateWidth } = design.shape;
    assert(ray(0, symbolHeight * .29).intersectObject(scene, true)[0]?.object === diffuser);
    assert(ray(plateWidth * .40, 0).intersectObject(scene, true)[0]?.object.name === 'studio-plaque');
  }
  const dimensions = envelope.getSize(new Vector3()).toArray().map(n => round(n));
  return { ...stats, geometrySha256: hash([...signatures.values()].sort().join('\n')), diffuserSha256: signatures.get('ambient-diffuser'),
    envelope: { min: envelope.min.toArray().map(n => round(n)), max: envelope.max.toArray().map(n => round(n)), dimensions },
    wallContacts: inspectContacts(scene, meshes, wallAreas),
    emitted: { hit: hit.point.toArray().map(n => round(n)), frontNormal: facing.toArray().map(n => round(n)),
      lightToDiffuserDepthMetres: round(position[2] - hit.point.z), position, target, direction: direction.toArray().map(n => round(n)) } };
}

async function inspectOriginalSconce(source, design, bytes) {
  const stockBytes = await load(source.path);
  assert.equal(hash(stockBytes), source.sha256);
  const donor = await loadWallGlb(stockBytes), model = await loadWallGlb(bytes);
  const pairs = [[source.mountNode, 'stock-wall-plate'], [source.diffuserNode, 'ambient-diffuser']].map(([previous, next]) => {
    const mesh = donor.getObjectByName(previous), made = model.getObjectByName(next);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    return { previous, next, geometry: geometry.applyMatrix4(mesh.matrixWorld), made };
  });
  pairs[1].geometry.computeBoundingBox();
  const centre = pairs[1].geometry.boundingBox.getCenter(new Vector3());
  return pairs.map(({ previous, next, geometry, made }, index) => {
    const oldPositions = geometry.attributes.position, newPositions = made.geometry.attributes.position;
    assert.equal(oldPositions.count, newPositions.count);
    assert.equal(oldPositions.count / 3, [12, 30][index]);
    let maxError = 0;
    for (let i = 0; i < oldPositions.count; i++) {
      const old = new Vector3().fromBufferAttribute(oldPositions, i);
      old.sub(new Vector3(centre.x, centre.y, 0)).multiply(new Vector3(design.shape.scaleXY, design.shape.scaleXY, design.shape.scaleZ));
      maxError = Math.max(maxError, old.distanceTo(new Vector3().fromBufferAttribute(newPositions, i).applyMatrix4(made.matrixWorld)));
    }
    assert(maxError < 1e-7, 'Stock sconce fit did not preserve the actual triangles');
    return { sourceNode: previous, modelNode: next, triangles: oldPositions.count / 3, maxVertexErrorMetres: maxError };
  });
}

async function main([output, ...rest]) {
  if (!output || output.startsWith('-') || rest.length) throw Error('Usage: node scripts/company-platform/test-wall-ambient-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters), variants = [];
  for (const entry of collection.resources) {
    const resource = await data(entry.resourcePath), bytes = await load(entry.modelPath);
    const design = recipe.designs.find(item => item.id === entry.id && item.version === entry.version);
    assert.equal(bytes.length, resource.asset.bytes);
    assert.equal(hash(bytes), resource.asset.sha256);
    if (variants.length) assert(compareFacilityFunction(variants[0].resource, resource).compatible);
    const result = await inspectWallAmbientAsset(bytes, resource, design);
    assert.equal(result.geometrySha256, entry.geometrySha256);
    assert.deepEqual(await selectAmbientEmitter(bytes), { position: resource.light.position, target: resource.light.target });
    const source = recipe.sources[design.source];
    const stock = source.kind === 'glb' ? await inspectOriginalSconce(source, design, bytes) : undefined;
    variants.push({ resource, result, stock });
  }
  assert.equal(variants.length, 4);
  for (const field of ['geometrySha256', 'diffuserSha256'])
    assert.equal(new Set(variants.map(item => item.result[field])).size, 4);
  const target = path.resolve(output);
  await fs.mkdir(target);
  const report = path.join(target, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', variants }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', resources: variants.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
