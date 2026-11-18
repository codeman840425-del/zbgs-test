import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Box3, DoubleSide, Matrix3, Raycaster, SRGBColorSpace, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-backdrop-fabric-v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const read = relative => fs.readFile(path.resolve(root, relative));
const data = async relative => JSON.parse(await read(relative));
const tolerance = 1e-6;
const moving = ['fabric-sheet', 'lift-rail', 'lift-mast'];
const feet = ['foot-left', 'foot-right'];
const round = value => Number(value.toFixed(8));
const boundsOf = object => new Box3().setFromObject(object, true);
const coordinates = bounds => ({ min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round),
  size: bounds.getSize(new Vector3()).toArray().map(round) });
const normal = hit => hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
const near = (actual, expected) => assert(Math.abs(actual - expected) < tolerance, `Expected ${expected}, measured ${actual}`);

async function loadGlb(bytes) {
  installNodeImageDecodeShim();
  const { scene, animations } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''
  );
  assert.equal(animations.length, 0, 'Roll-up pose is applied through the facility state');
  scene.updateMatrixWorld(true);
  return scene;
}

function inspectMeshGeometry(scene) {
  const model = scene.children[0];
  assert(model.children.every(node => node.isMesh) && scene.children.length === 1);
  const meshes = new Map(), supports = new Map(), byNode = new Map(), materials = new Set();
  let triangles = 0;
  for (const mesh of model.children) {
    assert(!meshes.has(mesh.name) && mesh.material.isMeshStandardMaterial);
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal'), index = mesh.geometry.index;
    assert(positions.count && positions.count === normals.count);
    const count = index?.count ?? positions.count, keys = new Set();
    assert.equal(count % 3, 0);
    triangles += count / 3;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(delta => {
        const offset = index?.getX(i + delta) ?? i + delta;
        const point = new Vector3().fromBufferAttribute(positions, offset).applyMatrix4(mesh.matrixWorld);
        assert(point.toArray().every(Number.isFinite) && new Vector3().fromBufferAttribute(normals, offset).toArray().every(Number.isFinite));
        return point;
      });
      keys.add(points.map(point => point.toArray().map(round).join(',')).sort().join('|'));
      if (!points.every(point => Math.abs(point.y) < tolerance)) continue;
      const [a, b, c] = points, area = -b.clone().sub(a).cross(c.clone().sub(a)).y / 2;
      if (area <= 1e-11) continue;
      assert(feet.includes(mesh.name), 'Unexpected floor contact on ' + mesh.name);
      const entry = supports.get(mesh.name) ?? { area: 0, largest: 0 };
      entry.area += area;
      if (area > entry.largest) {
        entry.largest = area;
        entry.sample = a.clone().add(b).add(c).divideScalar(3);
      }
      supports.set(mesh.name, entry);
    }
    byNode.set(mesh.name, hash([...keys].sort().join('\n')));
  }
  assert(triangles <= 9500 && meshes.size <= 16 && materials.size <= 7, 'Backdrop exceeds the portable geometry budget');
  return { model, meshes, supports, triangles, byNode, meshCount: meshes.size, materialCount: materials.size };
}

function contactReport(scene, meshes, supports, design) {
  const contact = [];
  const casing = boundsOf(meshes.get('roller-case'));
  for (const name of feet) {
    const { area, sample } = supports.get(name) ?? {};
    assert(area > .003, name + ' requires positive-area floor contact');
    const ray = new Raycaster(new Vector3(sample.x, -.10, sample.z), new Vector3(0, 1, 0));
    const hit = ray.intersectObject(scene, true)[0];
    assert(hit?.object.name === name && normal(hit).y < -.99, 'Floor ray must reach an outward-facing foot');
    near(hit.point.y, 0);
    const riser = boundsOf(meshes.get(name.replace('foot-', 'riser-')));
    assert(riser.intersectsBox(casing) && riser.intersectsBox(boundsOf(hit.object)), name + ' must be joined to the cassette');
    assert(Math.abs(Math.abs(sample.x) - design.feet.span) < .065);
    contact.push({ node: name, point: hit.point.toArray().map(round), areaSquareMetres: round(area) });
  }
  assert(boundsOf(meshes.get(feet[0])).max.x < boundsOf(meshes.get(feet[1])).min.x);
  return contact;
}

function inspectTexture(bytes, design, sheet, provenance) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.length, bytes.readUInt32LE(8));
  const jsonEnd = 20 + bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, jsonEnd));
  assert(gltf.buffers.every(buffer => buffer.uri === undefined) && gltf.images.length === 1);
  const [image] = gltf.images;
  assert(image.uri === undefined && image.mimeType === 'image/png');
  const view = gltf.bufferViews[image.bufferView], address = jsonEnd + 8 + view.byteOffset;
  const encoded = bytes.subarray(address, address + view.byteLength);
  assert.equal(hash(encoded), provenance.texture.embeddedSha256);
  const png = PNG.sync.read(encoded, { checkCRC: true });
  assert.deepEqual([png.width, png.height], [288, 256]);
  let minAlpha = 255, maxAlpha = 0;
  const distinctAreas = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = png.data.subarray(i, i + 4);
    minAlpha = Math.min(minAlpha, a);
    maxAlpha = Math.max(maxAlpha, a);
    distinctAreas.add([r, g, b].map(value => value >>> 5).join('/'));
  }
  const { side, map, transparent, opacity } = sheet.material;
  assert(side === DoubleSide && map?.colorSpace === SRGBColorSpace && !map.flipY, 'Front and back must render the embedded fabric');
  if (design.sheet.opacity !== undefined) {
    assert(transparent && opacity > .25 && opacity < .75 && minAlpha < maxAlpha && maxAlpha < 255,
      'Sheer must use actual alpha blend and a variable alpha weave');
    near(opacity, design.sheet.opacity);
  } else assert(!transparent && opacity === 1 && minAlpha === 255, 'Opaque fabrics must remain opaque');
  if (design.print) assert(distinctAreas.size >= 9, 'Printed cloth should have several actual ink areas');
  return { dimensionsPixels: [png.width, png.height], alphaRange: [minAlpha, maxAlpha], opacity,
    distinctQuantizedColors: distinctAreas.size, sha256: hash(encoded) };
}

function clothReport(scene, sheet, design, slotY, topY) {
  const box = boundsOf(sheet), available = box.getSize(new Vector3());
  near(box.min.y, slotY); near(box.max.y, topY); near(available.x, design.sheet.width);
  const p = sheet.geometry.getAttribute('position'), uv = sheet.geometry.getAttribute('uv'), rows = new Set();
  assert(p.count === uv.count);
  for (let i = 0; i < p.count; i++) {
    rows.add(round(p.getY(i)));
    near(uv.getY(i), 1 - (p.getY(i) - slotY) / (topY - slotY));
  }
  assert(rows.size >= 17 && available.z >= design.sheet.foldDepth, 'Cloth needs enough real fabric bands and pleat depth');
  const front = [];
  for (const xf of [-.31, 0, .31]) for (const v of [.08, .38, .67, .92]) {
    const y = slotY + v * (topY - slotY);
    const ray = new Raycaster(new Vector3(xf * available.x, y, .25), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(scene, true)[0];
    assert(hit?.object === sheet && hit.uv && normal(hit).z > .6, 'Front ray must reach a real front-facing cloth triangle');
    near(hit.uv.y, 1 - v);
    assert(Math.abs(hit.uv.x - (xf + .5)) < .002);
    front.push({ point: hit.point.toArray().map(round), uv: hit.uv.toArray().map(round), normal: normal(hit).toArray().map(round) });
  }
  return { longitudinalSegments: rows.size - 1, bounds: coordinates(box), front };
}

export async function inspectBackdropFabric(bytes, resource, design) {
  const scene = await loadGlb(bytes);
  const { model, meshes, supports, triangles, byNode, meshCount, materialCount } = inspectMeshGeometry(scene);
  const { mounting, backdropRoll: { slotY, travel } } = resource, topY = slotY + travel;
  const box = boundsOf(scene);
  near(box.min.y, 0);
  assert(box.min.x >= -mounting.width / 2 - tolerance && box.max.x <= mounting.width / 2 + tolerance &&
    box.min.z >= -mounting.depth / 2 - tolerance && box.max.z <= mounting.depth / 2 + tolerance &&
    box.max.y <= mounting.height + tolerance, `Backdrop exceeds envelope: ${JSON.stringify(coordinates(box))}`);
  assert(moving.every(name => {
    const node = meshes.get(name);
    return node?.parent === model && node.position.lengthSq() === 0 && node.quaternion.w === 1 && node.scale.equals(new Vector3(1, 1, 1));
  }), 'All three roll nodes must directly inherit one model origin with identity transforms');
  const sheet = meshes.get(moving[0]), rail = boundsOf(meshes.get(moving[1])), mast = boundsOf(meshes.get(moving[2]));
  const cloth = clothReport(scene, sheet, design, slotY, topY);
  const drum = boundsOf(meshes.get('roller-drum'));
  near(mast.min.y, slotY); near(mast.max.y, topY);
  assert(rail.min.y < topY && rail.max.y > topY && rail.getSize(new Vector3()).x > design.sheet.width &&
    rail.intersectsBox(boundsOf(sheet)) && rail.intersectsBox(mast) && drum.intersectsBox(boundsOf(sheet)) &&
    mast.min.z < -.04 && mast.max.z < .014 && rail.max.y - travel < .15 && rail.min.y - travel > .07,
    'Rail must close to the roller and have the physical sheet and mast contact at full rise');
  const statics = [...meshes.values()].filter(mesh => !moving.includes(mesh.name));
  assert(statics.every(mesh => boundsOf(mesh).max.y < .124), 'Retracting the moving parts should leave only the floor chassis');
  assert(statics.every(mesh => !mesh.material.transparent && mesh.material.opacity === 1), 'Fixed structural hardware must be opaque');
  for (const names of Object.values(resource.materialSlots))
    assert(names.length && names.every(name => meshes.has(name)), 'Material slots must refer to actual nodes');
  return { triangles, meshCount, materialCount, geometrySha256: hash([...byNode.values()].sort().join('\n')),
    sheetSha256: byNode.get('fabric-sheet'), footSha256: hash(feet.map(name => byNode.get(name)).join('\n')),
    railSha256: byNode.get('lift-rail'), envelope: coordinates(box), feet: contactReport(scene, meshes, supports, design),
    cloth, rail: coordinates(rail), mast: coordinates(mast),
    railRetractedY: [rail.min.y - travel, rail.max.y - travel].map(round),
    texture: inspectTexture(bytes, design, sheet, resource.provenance) };
}

async function main([output, ...extra]) {
  if (!output || extra.length || output.startsWith('-')) throw Error('Usage: node scripts/company-platform/test-backdrop-fabric-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters);
  const results = [];
  for (const entry of collection.resources) {
    const resource = await data(entry.resourcePath), bytes = await read(entry.modelPath);
    const design = recipe.designs.find(item => item.id === entry.id && item.version === entry.version);
    assert.equal(hash(bytes), resource.asset.sha256);
    assert.equal(bytes.length, resource.asset.bytes);
    if (results.length) assert(compareFacilityFunction(results[0].resource, resource).compatible);
    if (results.length) assert.deepEqual(results[0].resource.backdropRoll, resource.backdropRoll);
    const geometry = await inspectBackdropFabric(bytes, resource, design);
    assert.equal(geometry.geometrySha256, entry.geometrySha256);
    results.push({ resource, geometry });
  }
  assert.equal(results.length, 4);
  for (const key of ['geometrySha256', 'sheetSha256', 'footSha256', 'railSha256'])
    assert.equal(new Set(results.map(item => item.geometry[key])).size, results.length);
  const destination = path.resolve(output);
  await fs.mkdir(destination);
  const report = path.join(destination, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', results }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', results: results.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
