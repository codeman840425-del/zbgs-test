import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Box3, MathUtils, Matrix3, Raycaster, SRGBColorSpace, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-phone-static-v1';
const tolerance = 1e-6;
const hash = value => createHash('sha256').update(value).digest('hex');
const round = n => Number(n.toFixed(8));
const localFile = file => fs.readFile(path.join(root, file));
const data = async file => JSON.parse(await localFile(file));
const boundsOf = object => new Box3().setFromObject(object, true);
const normal = intersection => intersection.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(intersection.object.matrixWorld));

async function loadGlb(bytes) {
  installNodeImageDecodeShim();
  const { scene, animations } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''
  );
  scene.updateMatrixWorld(true);
  assert.equal(animations.length, 0, 'Static phone GLB should have no animations');
  return scene;
}

function triangleReport(scene, supportNames) {
  const meshes = new Map(), contacts = new Map(), materials = new Set(), signatures = [];
  let triangles = 0, contactArea = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.name && !meshes.has(mesh.name) && mesh.material.isMeshStandardMaterial &&
      mesh.material.opacity === 1 && !mesh.material.transparent, 'Expected a unique opaque standard mesh');
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const p = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal'), index = mesh.geometry.getIndex();
    assert(p.count && normals.count === p.count);
    const count = index?.count ?? p.count;
    assert.equal(count % 3, 0);
    triangles += count / 3;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(delta => {
        const j = index?.getX(i + delta) ?? i + delta;
        assert(new Vector3().fromBufferAttribute(normals, j).toArray().every(Number.isFinite), 'Non-finite phone mesh normal');
        return new Vector3().fromBufferAttribute(p, j).applyMatrix4(mesh.matrixWorld);
      });
      assert(points.every(point => point.toArray().every(Number.isFinite)), 'Non-finite phone mesh vertex');
      signatures.push(points.map(point => point.toArray().map(round).join(',')).sort().join('|'));
      if (!points.every(point => Math.abs(point.y) < tolerance)) continue;
      const [a, b, c] = points;
      const area = -b.clone().sub(a).cross(c.clone().sub(a)).y / 2;
      if (area <= 1e-12) continue;
      assert(supportNames.includes(mesh.name), 'Only declared physical feet may touch the desk');
      contactArea += area;
      if (area > (contacts.get(mesh.name)?.area ?? 0)) {
        contacts.set(mesh.name, { area, centre: a.clone().add(b).add(c).divideScalar(3) });
      }
    }
  });
  assert(triangles <= 5000 && meshes.size <= 16 && materials.size <= 5, 'Phone model exceeds geometry budget');
  assert(contactArea > .0002, 'Expected a real positive-area desk contact');
  return { meshes, contacts, triangles, meshCount: meshes.size, materialCount: materials.size,
    geometrySha256: hash(signatures.sort().join('\n')), contactAreaSquareMetres: round(contactArea) };
}

function inspectFeet(scene, meshes, contacts, supportNames) {
  const grounded = [...contacts];
  const deskRays = grounded.map(([name, { centre: { x, z } }]) => {
    const ray = new Raycaster(new Vector3(x, -.022, z), new Vector3(0, 1, 0));
    const first = ray.intersectObject(scene, true)[0];
    assert(first?.object.name === name && Math.abs(first.point.y) <= tolerance && normal(first).y < -.99,
      'Expected a real outward-facing desk contact on ' + name);
    return { node: name, x: round(x), z: round(z), y: round(first.point.y) };
  });
  const body = meshes.get('phone-body-stock') ?? meshes.get('phone-body-authored');
  assert(body);
  const parts = [...supportNames, body.name].map(name => {
    assert(meshes.has(name), 'Missing physical mount part ' + name);
    return { name, bounds: boundsOf(meshes.get(name)).expandByScalar(.00006) };
  });
  const connected = new Set(contacts.keys());
  const queue = [...connected];
  for (let i = 0; i < queue.length; i++) {
    const current = parts.find(part => part.name === queue[i]);
    for (const part of parts) {
      if (!connected.has(part.name) && current.bounds.intersectsBox(part.bounds)) {
        connected.add(part.name); queue.push(part.name);
      }
    }
  }
  assert.equal(connected.size, parts.length, 'Body and every support part must reach the grounded assembly');
  return deskRays;
}

function inspectScreenImage(bytes, screen, orientation) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonEnd = 20 + bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, jsonEnd));
  assert(gltf.buffers.every(buffer => buffer.uri === undefined));
  assert.equal(gltf.images.length, 1);
  const [image] = gltf.images;
  assert(image.uri === undefined && image.mimeType === 'image/png');
  const view = gltf.bufferViews[image.bufferView];
  const address = jsonEnd + 8 + view.byteOffset;
  const encoded = bytes.subarray(address, address + view.byteLength), png = PNG.sync.read(encoded, { checkCRC: true });
  const size = orientation === 'landscape' ? [160, 80] : [80, 160];
  assert.deepEqual([png.width, png.height], size);
  const pixel = (x, y) => {
    const start = 4 * (Math.floor(y * png.height) * png.width + Math.floor(x * png.width));
    return [...png.data.subarray(start, start + 4)];
  };
  assert.deepEqual(pixel(.097, .083), [220, 96, 83, 255], 'Monitor image power indicator is at the top');
  assert.deepEqual(pixel(.52, .36), [128, 203, 169, 255], 'Monitor image contains the lit preview');
  const { map, emissiveMap, name } = screen.material;
  assert(map && emissiveMap && name === 'phone-screen-material' && map.colorSpace === SRGBColorSpace &&
    emissiveMap.colorSpace === SRGBColorSpace && !map.flipY && !emissiveMap.flipY);
  const record = gltf.materials.find(material => material.name === name);
  assert.equal(record.pbrMetallicRoughness.baseColorTexture.index, record.emissiveTexture.index);
  return { dimensionsPixels: size, bytes: encoded.length, sha256: hash(encoded), colorSpace: 'sRGB' };
}

export async function inspectPhoneAsset(bytes, resource, design) {
  const scene = await loadGlb(bytes);
  const bounds = boundsOf(scene), limits = resource.mounting;
  assert(resource.stateDefaults.on && resource.stateSchema.on.type === 'boolean' && limits.reserveDesktopArea);
  assert(Math.abs(bounds.min.y) <= tolerance && bounds.max.y <= limits.height + tolerance &&
    bounds.min.x >= -limits.width / 2 - tolerance && bounds.max.x <= limits.width / 2 + tolerance &&
    bounds.min.z >= -limits.depth / 2 - tolerance && bounds.max.z <= limits.depth / 2 + tolerance,
    `${resource.id} exceeds the reserved desktop envelope: [${bounds.min.toArray().map(round)}] to [${bounds.max.toArray().map(round)}]`);
  const { meshes, contacts, ...geometry } = triangleReport(scene, design.support.map(part => part.name));
  for (const names of Object.values(resource.materialSlots))
    assert(names.length && names.every(name => meshes.has(name)), 'Expected real material slot members');
  const [screenName] = resource.display.screen.nodes;
  assert.deepEqual(resource.display.screen.nodes, ['phone-screen']);
  const screen = meshes.get(screenName);
  assert(screen?.material.isMeshStandardMaterial && screen.material.emissiveIntensity > 0);
  const display = boundsOf(screen), size = display.getSize(new Vector3()), centre = display.getCenter(new Vector3());
  assert(size.x > .055 && size.y > .058 && (design.orientation === 'landscape' ? size.x / size.y > 1.5 : size.y / size.x > 1.65),
    'Orientation must follow the physical screen proportions');
  const front = [[0, 0], [-.28, 0], [.28, 0], [0, -.28], [0, .28]].map(([x, y]) => {
    const ray = new Raycaster(new Vector3(centre.x + x * size.x, centre.y + y * size.y, .3), new Vector3(0, 0, -1));
    const first = ray.intersectObject(scene, true)[0];
    assert(first?.object === screen && first.uv && normal(first).z > .99, 'Front ray must reach outward-facing phone screen mesh');
    const expected = [.5 + x, .5 - y];
    assert(first.uv.toArray().every((value, i) => Math.abs(value - expected[i]) < .018), 'Screen UVs must run from top left');
    return { point: first.point.toArray().map(round), uv: first.uv.toArray().map(round), normal: normal(first).toArray().map(round) };
  });
  const rearRay = new Raycaster(new Vector3(centre.x, centre.y, -.3), new Vector3(0, 0, 1));
  const rear = rearRay.intersectObject(scene, true)[0];
  assert(rear && rear.object !== screen && normal(rear).z < -.85, 'Back of phone must physically obscure its screen');
  return { ...geometry, envelope: { min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round),
    size: bounds.getSize(new Vector3()).toArray().map(round) },
    deskRays: inspectFeet(scene, meshes, contacts, design.support.map(part => part.name)),
    screen: { dimensionsMetres: [size.x, size.y].map(round), orientation: design.orientation, front,
      rearHidesScreen: rear.object.name, image: inspectScreenImage(bytes, screen, design.orientation) } };
}

async function stockReuse(bytes, resource, design, source) {
  const [original, license, manifest] = await Promise.all([source.path, source.licensePath, source.manifestPath].map(localFile));
  assert.equal(hash(original), resource.provenance.sourceArtifactSha256);
  assert.equal(hash(license), resource.provenance.sourceLicenseSha256);
  assert.equal(hash(manifest), resource.provenance.sourceManifestSha256);
  const oldScene = await loadGlb(original), newScene = await loadGlb(bytes);
  const pairs = [[source.bodyNode, 'phone-body-stock'], [source.screenNode, 'phone-screen']].map(([oldName, newName]) => {
    const mesh = oldScene.getObjectByName(oldName);
    assert(mesh?.isMesh);
    const oldGeometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const actual = newScene.getObjectByName(newName);
    return { oldGeometry: oldGeometry.applyMatrix4(mesh.matrixWorld).rotateX(MathUtils.degToRad(design.body.pitchDegrees)),
      actual, oldName, newName };
  });
  const casing = pairs[0].oldGeometry;
  casing.computeBoundingBox();
  const centre = casing.boundingBox.getCenter(new Vector3()), height = casing.boundingBox.min.y;
  const scale = design.body.scale;
  const correction = new Vector3(-centre.x * scale, design.body.bottom - height * scale, -centre.z * scale);
  return pairs.map(({ oldGeometry, actual, oldName, newName }) => {
    const originalPosition = oldGeometry.getAttribute('position'), position = actual.geometry.getAttribute('position');
    assert.equal(originalPosition.count, position.count);
    assert.equal(actual.geometry.index, null);
    if (newName === 'phone-body-stock')
      assert.deepEqual([...oldGeometry.getAttribute('uv').array], [...actual.geometry.getAttribute('uv').array]);
    let maxVertexError = 0;
    for (let i = 0; i < position.count; i++) {
      const expected = new Vector3().fromBufferAttribute(originalPosition, i).multiplyScalar(scale).add(correction);
      const observed = new Vector3().fromBufferAttribute(position, i).applyMatrix4(actual.matrixWorld);
      maxVertexError = Math.max(maxVertexError, expected.distanceTo(observed));
    }
    assert(maxVertexError < 1e-7, 'Native phone vertices differ after the declared rigid fit');
    return { sourceNode: oldName, modelNode: newName, triangles: position.count / 3, maxVertexErrorMetres: maxVertexError,
      surfaceUV: newName === 'phone-screen' ? 'monitor-image-uv' : 'original' };
  });
}

async function main([output, ...extra]) {
  if (!output || extra.length || output.startsWith('-')) throw Error('Usage: node scripts/company-platform/test-phone-static-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters);
  const variants = [];
  for (const record of collection.resources) {
    const design = recipe.designs.find(item => item.id === record.id && item.version === record.version);
    const resource = await data(record.resourcePath), bytes = await localFile(record.modelPath);
    assert.equal(hash(bytes), resource.asset.sha256);
    assert.equal(resource.asset.bytes, bytes.length);
    if (variants.length) assert(compareFacilityFunction(variants[0].resource, resource).compatible, 'Phone replacements must share one fixed installation contract');
    const geometry = await inspectPhoneAsset(bytes, resource, design);
    assert.equal(geometry.geometrySha256, record.geometrySha256);
    const stock = design.source && await stockReuse(bytes, resource, design, recipe.sources[design.source]);
    variants.push({ resource, geometry, ...(stock ? { stock } : {}) });
  }
  assert.equal(variants.length, 4);
  assert.equal(new Set(variants.map(item => item.geometry.geometrySha256)).size, 4);
  const target = path.resolve(output);
  await fs.mkdir(target);
  const report = path.join(target, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', variants }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', variants: variants.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
