import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Box3, BufferGeometry, Float32BufferAttribute, Matrix3, Raycaster, SRGBColorSpace, Triangle, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-garment-rack-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = location => fs.readFile(path.resolve(root, location));
const data = async location => JSON.parse(await read(location));
const num = value => Number(value.toFixed(8));
const eps = 1e-6;
const vec = position => new Vector3(...position);
const boundsOf = item => new Box3().setFromObject(item, true);
const point = p => p.toArray().map(num);
const normal = hit => hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
const near = (a, b, tolerance = eps) => assert(Math.abs(a - b) <= tolerance, `Expected ${b}, got ${a}`);

export function garmentGlbChunks(bytes) {
  assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length, 'Expected single-file GLB 2');
  const end = 20 + bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a && end + 8 <= bytes.length &&
    bytes.readUInt32LE(end + 4) === 0x004e4942 && end + 8 + bytes.readUInt32LE(end) === bytes.length, 'GLB chunk bounds are invalid');
  const gltf = JSON.parse(bytes.subarray(20, end)), binary = bytes.subarray(end + 8);
  assert(gltf.buffers.length === 1 && gltf.buffers[0].uri === undefined && gltf.images?.every(i => i.uri === undefined) !== false,
    'Only standalone models with internal images and buffers are supported');
  return { gltf, binary };
}

export async function loadGarmentGlb(bytes) {
  const { gltf } = garmentGlbChunks(bytes);
  if (gltf.images?.length) installNodeImageDecodeShim();
  const { scene, animations } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), ''
  );
  assert.equal(animations.length, 0, 'Display rack geometry is static');
  scene.updateMatrixWorld(true);
  return scene;
}

function meshGeometry(mesh) {
  assert(mesh?.isMesh && mesh.material?.isMeshStandardMaterial && !mesh.material.transparent && mesh.material.opacity === 1,
    'Expected single, opaque PBR parts');
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  return geometry.applyMatrix4(mesh.matrixWorld);
}

export function resolveStockFoot(scene, source) {
  const original = scene.getObjectByName(source.mesh), world = meshGeometry(original);
  const p = world.attributes.position, n = world.attributes.normal, t = world.attributes.uv;
  const position = [], normal = [], uv = [];
  for (let i = 0; i < p.count; i += 3) {
    if ([i, i + 1, i + 2].some(j => p.getY(j) > source.footTop + eps)) continue;
    for (const j of [i, i + 1, i + 2]) {
      position.push(p.getX(j), p.getY(j), p.getZ(j));
      normal.push(n.getX(j), n.getY(j), n.getZ(j));
      uv.push(t?.getX(j) ?? 0, t?.getY(j) ?? 0);
    }
  }
  world.dispose();
  assert(position.length > 36, 'No actual donor foot triangles below the specified top layer');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  near(geometry.boundingBox.min.y, 0);
  near(geometry.boundingBox.max.y, source.footTop, .0001);
  return geometry;
}

function meshReport(scene) {
  const entries = new Map(), contacts = [], roof = new Box3(), materials = new Set();
  let triangles = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.name && !entries.has(mesh.name));
    const geometry = meshGeometry(mesh), p = geometry.attributes.position, n = geometry.attributes.normal;
    assert(p.count && p.count % 3 === 0 && n.count === p.count);
    const signature = [];
    geometry.computeBoundingBox();
    for (let i = 0; i < p.count; i += 3) {
      const points = [0, 1, 2].map(j => {
        const vertex = new Vector3().fromBufferAttribute(p, i + j);
        assert(vertex.toArray().every(Number.isFinite) && new Vector3().fromBufferAttribute(n, i + j).toArray().every(Number.isFinite));
        return vertex;
      });
      signature.push(points.map(p => point(p).join(',')).sort().join('|'));
      if (!mesh.name.startsWith('rack-') || !points.every(p => Math.abs(p.y) < eps)) continue;
      const [a, b, c] = points, contact = -b.clone().sub(a).cross(c.clone().sub(a)).y / 2;
      if (contact > 1e-10) contacts.push({ area: contact, at: a.clone().add(b).add(c).divideScalar(3), mesh });
    }
    roof.union(geometry.boundingBox);
    triangles += p.count / 3;
    materials.add(mesh.material);
    entries.set(mesh.name, { mesh, bounds: geometry.boundingBox, signature: hash(signature.sort().join('\n')) });
    geometry.dispose();
  });
  assert(triangles <= 10500 && entries.size <= 10 && materials.size <= 5, 'Furniture exceeds its mesh budget');
  return { entries, contacts, envelope: roof, triangles, meshes: entries.size, materials: materials.size,
    geometrySha256: hash([...entries.values()].map(r => r.signature).sort().join('\n')) };
}

function checkStockFoot(design, source, mesh) {
  const old = source.foot, original = old.attributes.position, actual = meshGeometry(mesh);
  const p = actual.attributes.position;
  assert.equal(p.count, original.count * 2);
  let maximumError = 0;
  for (const [copy, x] of [-design.shape.shoeX, design.shape.shoeX].entries()) for (let i = 0; i < original.count; i++) {
    const expected = new Vector3().fromBufferAttribute(original, i).multiply(vec(design.shape.shoeScale)).add(vec([x, 0, 0]));
    maximumError = Math.max(maximumError, expected.distanceTo(new Vector3().fromBufferAttribute(p, i + copy * original.count)));
  }
  assert(maximumError < 1e-7, 'Real source foot vertices changed beyond the declared fit');
  const oldUv = Array.from(old.attributes.uv.array);
  assert.deepEqual(Array.from(actual.attributes.uv.array), [...oldUv, ...oldUv]);
  actual.dispose();
  return { originalTrianglesPerFoot: original.count / 3, maximumVertexErrorMetres: maximumError };
}

function inspectRack(scene, report, resource, design, source) {
  const { envelope, contacts, entries } = report, mount = resource.mounting;
  assert(envelope.min.x >= -mount.width / 2 - eps && envelope.max.x <= mount.width / 2 + eps &&
    envelope.min.z >= -mount.depth / 2 - eps && envelope.max.z <= mount.depth / 2 + eps &&
    Math.abs(envelope.min.y) <= eps && envelope.max.y <= mount.height + eps, 'Actual rack is outside the fixed floor envelope');
  assert(contacts.every(item => ['rack-foot-pads', 'rack-stock-feet'].includes(item.mesh.name)));
  const underside = [];
  for (const side of [-1, 1]) {
    const relevant = contacts.filter(entry => Math.sign(entry.at.x) === side);
    const area = relevant.reduce((sum, entry) => sum + entry.area, 0);
    assert(area > .001, 'Both sides need real positive-area floor contact');
    const { at } = relevant.reduce((a, b) => a.area > b.area ? a : b);
    const hit = new Raycaster(vec([at.x, -.05, at.z]), vec([0, 1, 0])).intersectObject(scene, true)[0];
    assert(hit && normal(hit).y < -.99);
    near(hit.point.y, 0);
    underside.push({ point: point(hit.point), contactSquareMetres: num(area), node: hit.object.name });
  }
  const rail = entries.get('garment-rail'), { radius, centerY, slots } = resource.garmentRail;
  assert(rail?.mesh.isMesh);
  const geometry = meshGeometry(rail.mesh), position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const radiusAt = Math.hypot(position.getY(i) - centerY, position.getZ(i));
    assert(radiusAt <= radius + eps && (radiusAt < eps || Math.abs(radiusAt - radius) < eps), 'Rail is no longer cylindrical along X');
  }
  near(rail.bounds.max.y, centerY + radius); near(rail.bounds.min.y, centerY - radius);
  near(rail.bounds.max.z, radius); near(rail.bounds.min.z, -radius);
  assert(rail.bounds.intersectsBox(entries.get('rack-rail-bosses').bounds));
  const railSlots = slots.map(slot => {
    const [x, y, z] = slot.position;
    const hit = new Raycaster(vec([x, y + .015, z]), vec([0, -1, 0])).intersectObject(scene, true)[0];
    assert(hit?.object === rail.mesh && normal(hit).y > .99, 'Actual rod should be exposed below each hanger slot');
    near(hit.point.y, y);
    return { id: slot.id, point: point(hit.point) };
  });
  geometry.dispose();
  const shape = design.form === 'trestle' ? checkStockFoot(design, source, entries.get('rack-stock-feet').mesh) : undefined;
  return { underside, rail: { radius, centerY, slots: railSlots, length: num(rail.bounds.max.x - rail.bounds.min.x) },
    ...(shape ? { sourceFoot: shape } : {}) };
}

function inspectClothImage(model, cloth, png) {
  const { gltf, binary } = garmentGlbChunks(model);
  if (!png) {
    assert(!gltf.images?.length && !cloth.material.map);
    return null;
  }
  assert.equal(gltf.images.length, 1);
  const node = gltf.nodes.find(node => node.name === cloth.name), part = gltf.meshes[node.mesh].primitives[0];
  const material = gltf.materials[part.material], texture = material.pbrMetallicRoughness.baseColorTexture;
  const image = gltf.images[gltf.textures[texture.index].source], view = gltf.bufferViews[image.bufferView];
  const inset = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  assert(image.mimeType === 'image/png' && inset.equals(png), 'Source cloth PNG bytes must be embedded unchanged');
  assert(cloth.material.map?.isTexture && cloth.material.map.colorSpace === SRGBColorSpace && cloth.material.map.flipY === false &&
    cloth.material.map.channel === 0 && cloth.geometry.attributes.uv, 'Actual garment mesh must use sRGB base color through UV0');
  return { sha256: hash(inset), bytes: inset.length, dimensions: [inset.readUInt32BE(16), inset.readUInt32BE(20)] };
}

function inspectClothShell(cloth) {
  const geometry = meshGeometry(cloth), positions = geometry.attributes.position;
  const edges = new Map();
  for (let i = 0; i < positions.count; i += 3) {
    const corners = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i + j));
    assert(new Triangle(...corners).getArea() > 1e-12, 'Cloth shell has a collapsed triangle');
    const keys = corners.map(vertex => vertex.toArray().map(value => Math.round(value * 1e7)).join(','));
    for (const [j, from] of keys.entries()) {
      const to = keys[(j + 1) % 3];
      assert.notEqual(from, to, 'Cloth shell has a collapsed edge');
      const forward = from < to, key = forward ? `${from}/${to}` : `${to}/${from}`;
      const edge = edges.get(key) ?? { faces: 0, orientation: 0 };
      edge.faces++;
      edge.orientation += forward ? 1 : -1;
      edges.set(key, edge);
    }
  }
  geometry.dispose();
  const mismatchedEdges = [...edges.values()].filter(edge => edge.faces !== 2 || edge.orientation !== 0).length;
  assert.equal(mismatchedEdges, 0, 'Cloth shell has unpaired or inconsistently wound edges');
  return { triangles: positions.count / 3, sharedEdges: edges.size, mismatchedEdges };
}

function inspectClothTrim(cloth, trim, seams) {
  const front = new Raycaster(vec([.12, 0, 0]), vec([-1, 0, 0]));
  const back = new Raycaster(vec([-.12, 0, 0]), vec([1, 0, 0]));
  let probes = 0, maximumDecalGap = 0;
  for (const seam of seams) for (let i = 1; i < seam.path.length; i++) {
    const [az, ay] = seam.path[i - 1], [bz, by] = seam.path[i];
    const count = Math.ceil(Math.hypot(by - ay, bz - az) / .008);
    for (let j = 0; j < count; j++) {
      const t = (j + .5) / count, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      front.ray.origin.set(.12, y, z);
      back.ray.origin.set(-.12, y, z);
      const clothHit = front.intersectObject(cloth, false)[0];
      const trimFront = front.intersectObject(trim, false)[0], trimRear = back.intersectObject(trim, false)[0];
      assert(clothHit && trimFront && trimRear, `Trim is missing from its cloth path at z=${z}, y=${y}`);
      const gap = Math.max(trimRear.point.x - clothHit.point.x, clothHit.point.x - trimFront.point.x, 0);
      maximumDecalGap = Math.max(maximumDecalGap, gap);
      assert(gap <= .00025, `Trim is detached from the visible cloth by ${gap}m at z=${z}, y=${y}`);
      probes++;
    }
  }
  return { probes, maximumGapMetres: num(maximumDecalGap) };
}

function inspectHanger(scene, report, resource, design, bytes, png) {
  const { envelope, entries } = report, mount = resource.mounting;
  assert(envelope.min.x >= -mount.width / 2 - eps && envelope.max.x <= mount.width / 2 + eps &&
    envelope.min.z >= -mount.depth / 2 - eps && envelope.max.z <= mount.depth / 2 + eps &&
    envelope.min.y >= -mount.height - eps && envelope.max.y <= .010 + eps, 'Hanging garment exceeds its support envelope');
  const hook = entries.get('hanger-hook'), hanger = entries.get('garment-hanger'), body = entries.get('garment-cloth');
  const trim = entries.get('garment-seams');
  assert(hook?.mesh && hanger?.mesh && body?.mesh && trim?.mesh && body.bounds.max.y < -.064 && body.bounds.min.y < -.46);
  assert(hook.bounds.intersectsBox(hanger.bounds) && hanger.bounds.intersectsBox(body.bounds));
  const hookInner = new Raycaster(vec([0, -.015, 0]), vec([0, 1, 0])).intersectObject(hook.mesh, false)[0];
  assert(hookInner && normal(hookInner).y < -.99, 'Actual crook top must have an inward-facing contact');
  near(hookInner.point.y, 0, .0002);
  const wire = meshGeometry(hook.mesh), p = wire.attributes.position;
  let minimumRadius = Infinity;
  for (let i = 0; i < p.count; i++) minimumRadius = Math.min(minimumRadius, Math.hypot(p.getY(i) + .015, p.getZ(i)));
  near(minimumRadius, .015, .0002);
  wire.dispose();
  let joined = 0;
  for (const z of [-.7, -.45, 0, .45, .7].map(value => value * design.shape.hangerHalfWidth)) {
    const probe = new Raycaster(vec([.1, -.186, z]), vec([-1, 0, 0]));
    if (probe.intersectObject(hanger.mesh, false).length && probe.intersectObject(body.mesh, false).length) joined++;
  }
  assert(joined >= 3, 'Hanger needs a physical shoulder span inside the cloth');
  const size = body.bounds.getSize(new Vector3()), center = body.bounds.getCenter(new Vector3()), visible = [];
  for (const z of [-.32, -.14, 0, .14, .32]) for (const y of [-.27, -.12, .13, .28]) {
    const ray = new Raycaster(vec([.14, center.y + y * size.y, center.z + z * size.z]), vec([-1, 0, 0]));
    const result = ray.intersectObject(body.mesh, false)[0];
    if (result && normal(result).x > .5) visible.push(point(result.point));
  }
  assert(visible.length >= 7 && size.x > design.shape.thickness + .003, 'Cloth must have a real draped and ray-visible outward face');
  return { innerHookPoint: point(hookInner.point), minimumHookRadius: num(minimumRadius), actualHangerClothProbes: joined,
    clothSha256: body.signature, clothShell: inspectClothShell(body.mesh), trimContact: inspectClothTrim(body.mesh, trim.mesh, design.shape.seams),
    visible, clothTexture: inspectClothImage(bytes, body.mesh, png) };
}

export async function inspectGarmentAsset(bytes, resource, design, source) {
  const scene = await loadGarmentGlb(bytes), report = meshReport(scene);
  const { envelope, triangles, meshes, materials, geometrySha256 } = report;
  for (const names of Object.values(resource.materialSlots)) assert(names.length && names.every(name => report.entries.has(name)));
  assert.equal(resource.usePoints.length, 0);
  const detail = design.type === 'rack' ? inspectRack(scene, report, resource, design, source) :
    inspectHanger(scene, report, resource, design, bytes, source?.png);
  return { triangles, meshes, materials, geometrySha256,
    envelope: { min: point(envelope.min), max: point(envelope.max), dimensions: point(envelope.getSize(new Vector3())) }, ...detail };
}

function assertAllMounts(rack, garments) {
  const geometry = [];
  rack.scene.traverse(node => {
    if (!node.isMesh || node.name === 'garment-rail') return;
    const shape = meshGeometry(node), p = shape.attributes.position;
    for (let i = 0; i < p.count; i += 3)
      geometry.push(new Triangle(...[0, 1, 2].map(offset => new Vector3().fromBufferAttribute(p, i + offset))));
    shape.dispose();
  });
  return rack.resource.garmentRail.slots.flatMap(slot => garments.map(item => {
    const shift = vec(slot.position), assembly = boundsOf(item.scene).translate(shift);
    assert(!geometry.some(triangle => assembly.intersectsTriangle(triangle)), 'Rack frame intersects a correctly hooked garment');
    const rod = rack.scene.getObjectByName('garment-rail'), cloth = boundsOf(item.scene.getObjectByName('garment-cloth')).translate(shift);
    assert(!cloth.intersectsBox(boundsOf(rod)), 'Only the actual hook may touch its host rod');
    return { slot: slot.id, occupant: item.resource.id };
  }));
}

async function main([output, ...extra]) {
  if (!output || output.startsWith('-') || extra.length) throw Error('Usage: node scripts/company-platform/test-garment-rack-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters), groups = { rack: [], garment: [] };
  for (const entry of collection.resources) {
    const resource = await data(entry.resourcePath), bytes = await read(entry.modelPath);
    const design = recipe.designs.find(item => item.id === entry.id && item.version === entry.version);
    assert.equal(hash(bytes), resource.asset.sha256); assert.equal(bytes.length, resource.asset.bytes);
    const siblings = groups[design.type];
    if (siblings.length) assert(compareFacilityFunction(siblings[0].resource, resource).compatible);
    let source = design.source && recipe.sources[design.source];
    if (source) {
      const original = await read(source.path);
      assert.equal(hash(original), source.sha256);
      assert.equal(hash(await read(source.licensePath)), source.licenseSha256);
      source = source.kind === 'glb' ? { ...source, foot: resolveStockFoot(await loadGarmentGlb(original), source) } : { ...source, png: original };
    }
    const geometry = await inspectGarmentAsset(bytes, resource, design, source);
    assert.equal(geometry.geometrySha256, entry.geometrySha256);
    siblings.push({ resource, geometry, scene: await loadGarmentGlb(bytes) });
  }
  assert.deepEqual([groups.rack.length, groups.garment.length], [4, 4]);
  assert.equal(new Set(groups.rack.map(item => item.geometry.geometrySha256)).size, 4);
  assert.equal(new Set(groups.garment.map(item => item.geometry.clothSha256)).size, 4);
  const installations = groups.rack.map(rack => ({ rack: rack.resource.id, mounted: assertAllMounts(rack, groups.garment) }));
  const target = path.resolve(output);
  await fs.mkdir(target);
  const report = path.join(target, 'report.json');
  const variants = Object.values(groups).flat().map(({ resource, geometry }) => ({ resource, geometry }));
  await fs.writeFile(report, JSON.stringify({ status: 'passed', variants, installations }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', variants: variants.length,
    checkedInstallations: installations.reduce((n, rack) => n + rack.mounted.length, 0), report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
