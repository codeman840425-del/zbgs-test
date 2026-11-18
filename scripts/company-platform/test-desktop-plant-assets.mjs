import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix3, Raycaster, SRGBColorSpace, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-desktop-plants-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = location => fs.readFile(path.resolve(root, location));
const data = async location => JSON.parse(await read(location));
const rounded = (n, places = 8) => Number(n.toFixed(places));
const vec = xyz => new Vector3(...xyz);
const tolerance = 1e-6;
const importedModels = new WeakMap();

export function desktopGlbChunks(bytes) {
  assert(bytes.length >= 28, 'Truncated GLB');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const end = 20 + bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a && end + 8 <= bytes.length && bytes.readUInt32LE(end + 4) === 0x004e4942 &&
    end + 8 + bytes.readUInt32LE(end) === bytes.length, 'Expected complete JSON and BIN GLB chunks');
  const gltf = JSON.parse(bytes.subarray(20, end)), binary = bytes.subarray(end + 8);
  assert(gltf.buffers.length === 1 && gltf.buffers[0].uri === undefined, 'Plant GLB must not reference external buffers');
  return { gltf, binary };
}

function baseColorImages(gltf, binary) {
  assert((gltf.images?.length ?? 0) <= 3, 'Stock plant supports up to three embedded base-color images');
  const assigned = new Set();
  const byMaterial = (gltf.materials ?? []).map(material => {
    const pbr = material.pbrMetallicRoughness;
    assert(!material.normalTexture && !material.emissiveTexture && !material.occlusionTexture && !pbr?.metallicRoughnessTexture,
      'Plant import supports base-color textures only');
    const base = pbr?.baseColorTexture;
    if (!base) return null;
    assert((base.texCoord ?? 0) === 0 && !base.extensions, 'Plant base color must use UV0 without a texture transform');
    const texture = gltf.textures?.[base.index], image = gltf.images?.[texture?.source];
    assert(texture && !texture.extensions && image?.mimeType === 'image/png' && image.uri === undefined,
      'Expected an embedded base-color PNG bufferView');
    const view = gltf.bufferViews[image.bufferView];
    const start = view?.byteOffset ?? 0, length = view?.byteLength;
    assert(view?.buffer === 0 && Number.isSafeInteger(start) && Number.isSafeInteger(length) &&
      start >= 0 && length >= 33 && length <= 2 * 1024 * 1024 && start + length <= binary.length,
    'Invalid or oversized plant image bufferView');
    const bytes = binary.subarray(start, start + length);
    assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 2048 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 2048,
    'Invalid PNG or dimensions above 2048px');
    const png = PNG.sync.read(bytes, { checkCRC: true });
    assigned.add(texture.source);
    const sampler = texture.sampler === undefined ? undefined : gltf.samplers?.[texture.sampler];
    assert(texture.sampler === undefined || sampler, 'Expected a valid texture sampler reference');
    return { bytes, sha256: hash(bytes), sampler, size: [png.width, png.height] };
  });
  assert(assigned.size === (gltf.images?.length ?? 0), 'Unassigned or unsupported plant image');
  return byMaterial;
}

export async function loadDesktopGlb(bytes) {
  const { gltf, binary } = desktopGlbChunks(bytes), textures = baseColorImages(gltf, binary);
  if (gltf.images?.length) installNodeImageDecodeShim();
  const { scene, animations, parser } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), ''
  );
  assert.equal(animations.length, 0, 'Installed plant should remain static');
  scene.updateMatrixWorld(true);
  importedModels.set(scene, { textures, associations: parser.associations });
  return scene;
}

export function textureForPlantMesh(scene, mesh) {
  const { textures, associations } = importedModels.get(scene);
  const image = textures[associations.get(mesh.material)?.materials];
  if (image || mesh.material.map) {
    assert(image && mesh.material.map?.isTexture && mesh.material.map.colorSpace === SRGBColorSpace &&
      mesh.material.map.channel === 0 && !mesh.material.map.flipY && mesh.geometry.attributes.uv?.count === mesh.geometry.attributes.position.count,
    'Plant material must bind real sRGB base color on its UV0 vertices');
  }
  return image;
}

export function indexedPart(mesh, name) {
  assert(mesh?.isMesh && mesh.material?.isMeshStandardMaterial && mesh.material.opacity === 1 && !mesh.material.transparent,
    'Expected one named, opaque PBR mesh for source part ' + name);
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  return geometry.applyMatrix4(mesh.matrixWorld);
}

function shapeParts(triangles) {
  const representatives = new Map();
  const owners = new Uint32Array(triangles.length);
  const owner = i => {
    let at = i;
    while (at !== owners[at]) at = owners[at];
    while (owners[i] !== at) { const next = owners[i]; owners[i] = at; i = next; }
    return at;
  };
  for (const [i, triangle] of triangles.entries()) {
    owners[i] = i;
    for (const p of triangle) {
      const key = p.toArray().map(x => rounded(x, 6)).join('/');
      if (!representatives.has(key)) representatives.set(key, i);
      else owners[owner(i)] = owner(representatives.get(key));
    }
  }
  return new Set(triangles.map((_, i) => owner(i))).size;
}

function readMeshes(scene) {
  const records = new Map(), materials = new Set();
  const box = new Box3(), desktop = [];
  let triangles = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.name && !records.has(mesh.name) && mesh.material.isMeshStandardMaterial && !mesh.material.transparent);
    materials.add(mesh.material);
    const geometry = indexedPart(mesh, mesh.name), positions = geometry.attributes.position, normals = geometry.attributes.normal;
    assert(positions.count > 0 && normals.count === positions.count && positions.count % 3 === 0);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox, pieces = [], signature = [];
    for (let i = 0; i < positions.count; i += 3) {
      const points = [0, 1, 2].map(j => {
        const position = new Vector3().fromBufferAttribute(positions, i + j), normal = new Vector3().fromBufferAttribute(normals, i + j);
        assert(position.toArray().every(Number.isFinite) && normal.toArray().every(Number.isFinite));
        return position;
      });
      const [a, b, c] = points, surface = b.clone().sub(a).cross(c.clone().sub(a));
      if (surface.lengthSq() < 1e-23) continue;
      pieces.push(points);
      signature.push(points.map(p => p.toArray().map(n => rounded(n)).join('/')).sort().join('|'));
      if (points.every(p => Math.abs(p.y) <= tolerance) && surface.y < -1e-10) {
        assert.equal(mesh.name, 'desktop-plant-pot', 'Only the actual pot base may touch the desktop');
        desktop.push({ area: -.5 * surface.y, point: a.clone().add(b).add(c).divideScalar(3) });
      }
    }
    box.union(bounds);
    triangles += positions.count / 3;
    records.set(mesh.name, { mesh, bounds, signature: hash(signature.sort().join('\n')), connectedParts: shapeParts(pieces) });
    geometry.dispose();
  });
  assert(triangles <= 9200 && records.size <= 7 && materials.size <= 6, 'Desktop plant exceeds its mesh budget');
  return { box, records, desktop, triangles, materialCount: materials.size, meshCount: records.size };
}

function contact(scene, pot, triangles) {
  const area = triangles.reduce((sum, item) => sum + item.area, 0);
  assert(area > .0005, 'A planted pot requires positive-area horizontal support');
  const sample = triangles.reduce((largest, face) => largest?.area > face.area ? largest : face).point;
  const hit = new Raycaster(vec([sample.x, -.15, sample.z]), vec([0, 1, 0])).intersectObject(scene, true)[0];
  const normal = hit?.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
  assert(hit?.object === pot.mesh && Math.abs(hit.point.y) <= tolerance && normal.y < -.99, 'Desk ray must hit the underside of the real pot');
  return { areaSquareMetres: rounded(area), sample: hit.point.toArray().map(n => rounded(n)) };
}

function canopyReport(design, records, box) {
  const get = name => records.get('desktop-plant-' + name);
  const pot = get('pot'), soil = get('soil'), foliage = get('foliage'), stem = get('stems'), accent = get('accent');
  const crownTop = Math.max(foliage.bounds.max.y, accent?.bounds.max.y ?? -Infinity);
  assert(crownTop > pot.bounds.max.y + .04 && foliage.mesh.material !== pot.mesh.material,
    'A real crown must project above its own pot');
  const boxes = [...records.values()].map(r => r.bounds);
  const attached = new Set([pot.bounds]), pending = new Set(boxes.filter(part => part !== pot.bounds));
  for (const next of attached) for (const part of pending) {
    if (next.clone().expandByScalar(tolerance).intersectsBox(part)) {
      attached.add(part); pending.delete(part);
    }
  }
  assert.equal(pending.size, 0, 'A visible part floats apart from the plant assembly');
  if (design.form === 'stock-plant') return { sourceFoliage: true };
  assert(soil && stem && accent && pot.bounds.intersectsBox(soil.bounds));
  const rooted = design.form === 'ribbed-cactus' ? foliage : stem;
  assert(rooted.bounds.min.y < soil.bounds.max.y + tolerance, 'Botanical root should meet actual potting soil');
  if (design.form === 'tiered-bonsai') {
    assert(foliage.connectedParts + accent.connectedParts >= design.shape.branches.length * 3 && stem.bounds.max.y - stem.bounds.min.y > .165);
  } else if (design.form === 'ribbed-cactus') {
    assert(stem.connectedParts === design.shape.columns.length - 1 && stem.bounds.min.x < foliage.bounds.min.x - .035 &&
      stem.bounds.max.x > foliage.bounds.max.x + .035 && foliage.bounds.max.y > stem.bounds.max.y + .025);
  } else if (design.form === 'broadleaf-fan') {
    assert(foliage.connectedParts + accent.connectedParts === design.shape.leaves.length && box.max.y - pot.bounds.max.y > .24);
  } else {
    assert.equal(design.form, 'succulent-rosette');
    assert(foliage.connectedParts + accent.connectedParts === design.shape.rings.reduce((sum, item) => sum + item.count, 0));
    assert(foliage.bounds.min.x < -.07 && foliage.bounds.max.x > .07 && foliage.bounds.min.z < -.07 && foliage.bounds.max.z > .07 &&
      box.max.y - pot.bounds.max.y < .12, 'Succulent should spread as a low rosette in all directions');
  }
  return { crownParts: foliage.connectedParts, accentParts: accent.connectedParts, branchParts: stem.connectedParts };
}

function preserveParts(design, donor, source, scene, records) {
  const stock = design.form === 'stock-plant';
  const roles = ['pot', ...(source.soilNode ? ['soil'] : []), ...(stock ? ['foliage'] : [])];
  const parts = Object.fromEntries(roles.map(role => {
    const node = donor.getObjectByName(source[role + 'Node']);
    const mesh = indexedPart(node, source[role + 'Node']);
    mesh.computeBoundingBox();
    return [role, { node, mesh }];
  }));
  const pot = parts.pot.mesh.boundingBox, centre = pot.getCenter(new Vector3());
  const offset = vec([centre.x, pot.min.y, centre.z]);
  const height = Math.max(...roles.map(role => parts[role].mesh.boundingBox.max.y)) -
    Math.min(...roles.map(role => parts[role].mesh.boundingBox.min.y));
  const scale = stock ? vec(Array(3).fill(design.fit.height / height)) : vec(design.potScale);
  const results = [];
  for (const role of roles) {
    const { node, mesh } = parts[role], result = records.get('desktop-plant-' + role).mesh;
    const actual = indexedPart(result, result.name), position = mesh.attributes.position;
    assert.equal(actual.attributes.position.count, position.count);
    let maximumError = 0;
    for (let i = 0; i < position.count; i++) {
      const expected = new Vector3().fromBufferAttribute(position, i).sub(offset);
      if (stock) expected.applyAxisAngle(vec([0, 1, 0]), design.fit.yawQuarterTurns * Math.PI / 2);
      expected.multiply(scale);
      maximumError = Math.max(maximumError, expected.distanceTo(new Vector3().fromBufferAttribute(actual.attributes.position, i)));
    }
    assert(maximumError < 1e-7, 'Output does not preserve the original component vertices');
    assert.deepEqual(actual.attributes.uv?.array, mesh.attributes.uv?.array);
    const originalTexture = textureForPlantMesh(donor, node), rebuiltTexture = textureForPlantMesh(scene, result);
    assert.equal(Boolean(rebuiltTexture), Boolean(stock && originalTexture), 'Stock base-color map was changed or added');
    if (stock) {
      assert(result.material.color.equals(node.material.color));
      assert.equal(result.material.metalness, node.material.metalness);
      assert.equal(result.material.roughness, node.material.roughness);
      assert.equal(result.material.name, node.material.name);
      if (originalTexture) {
        assert(rebuiltTexture.bytes.equals(originalTexture.bytes), 'Stock source PNG bytes changed');
        assert.deepEqual(rebuiltTexture.sampler, originalTexture.sampler);
        assert.deepEqual(rebuiltTexture.size, originalTexture.size);
      }
    }
    results.push({ sourceNode: node.name, modelNode: result.name, triangles: position.count / 3,
      maximumVertexErrorMetres: maximumError, preserveMaterial: stock,
      ...(rebuiltTexture ? { baseColorImage: { sha256: rebuiltTexture.sha256, dimensions: rebuiltTexture.size, uvSet: 0 } } : {}) });
    mesh.dispose(); actual.dispose();
  }
  return results;
}

export async function inspectDesktopPlant(bytes, resource, design, donor, source) {
  const scene = await loadDesktopGlb(bytes), { box, records, desktop, ...stats } = readMeshes(scene);
  const mount = resource.mounting;
  assert.equal(resource.mount, 'desk-surface');
  assert.equal(resource.parent, 'desk.desktop');
  assert.equal(mount.reserveDesktopArea, true);
  assert(Math.abs(box.min.y) <= tolerance && box.max.y <= mount.height + tolerance &&
    box.min.x >= -mount.width / 2 - tolerance && box.max.x <= mount.width / 2 + tolerance &&
    box.min.z >= -mount.depth / 2 - tolerance && box.max.z <= mount.depth / 2 + tolerance,
  resource.id + ' exceeds its actual supported desktop envelope ' + JSON.stringify(box));
  const nodes = Object.values(resource.materialSlots).flat();
  assert(nodes.length === records.size && new Set(nodes).size === records.size && nodes.every(name => records.has(name)));
  const fol = records.get('desktop-plant-foliage');
  const rays = [];
  const crown = fol.bounds, size = crown.getSize(new Vector3()), centre = crown.getCenter(new Vector3());
  for (const x of [-.38, -.2, 0, .2, .38]) for (const y of [-.30, -.1, .12, .34]) {
    const ray = new Raycaster(vec([centre.x + x * size.x, centre.y + y * size.y, .32]), vec([0, 0, -1]));
    const hit = ray.intersectObject(scene, true)[0];
    if (hit?.object.name.startsWith('desktop-plant-') && ['foliage', 'accent', 'stems'].some(slot => hit.object.name.endsWith(slot)))
      rays.push(hit.point.toArray().map(n => rounded(n)));
  }
  assert(rays.length >= 4, 'Visible canopy should intercept front-facing probes');
  return { ...stats, envelope: { min: box.min.toArray().map(n => rounded(n)), max: box.max.toArray().map(n => rounded(n)),
    dimensions: box.getSize(new Vector3()).toArray().map(n => rounded(n)) },
  geometrySha256: hash([...records.values()].map(part => part.signature).sort().join('\n')), foliageSha256: fol.signature,
  contact: contact(scene, records.get('desktop-plant-pot'), desktop), silhouette: canopyReport(design, records, box),
  frontCanopyHits: rays, originalComponents: preserveParts(design, donor, source, scene, records) };
}

async function main([output, ...extra]) {
  if (!output || output.startsWith('-') || extra.length) throw Error('Usage: node scripts/company-platform/test-desktop-plant-assets.mjs NEW_OUTPUT_DIRECTORY');
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters), variants = [];
  for (const entry of collection.resources) {
    const resource = await data(entry.resourcePath), bytes = await read(entry.modelPath);
    const design = recipe.designs.find(item => item.id === entry.id && item.version === entry.version);
    assert.equal(hash(bytes), resource.asset.sha256);
    assert.equal(bytes.length, resource.asset.bytes);
    if (variants.length) assert(compareFacilityFunction(variants[0].resource, resource).compatible);
    const source = recipe.sources[design.source], original = await read(source.path);
    assert.equal(hash(original), source.sha256);
    assert.equal(hash(await read(source.licensePath)), source.licenseSha256);
    const geometry = await inspectDesktopPlant(bytes, resource, design, await loadDesktopGlb(original), source);
    assert.equal(geometry.geometrySha256, entry.geometrySha256);
    variants.push({ resource, geometry });
  }
  assert.equal(variants.length, 4);
  for (const field of ['geometrySha256', 'foliageSha256'])
    assert.equal(new Set(variants.map(item => item.geometry[field])).size, 4);
  const target = path.resolve(output);
  await fs.mkdir(target);
  const report = path.join(target, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', variants }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', resources: variants.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
