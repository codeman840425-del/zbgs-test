import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {Box3, ShapeUtils, Vector2, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptSimplifier} from '../../prototype/node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';
import {SIDE_TABLE_MOUNTING, SIDE_TABLE_SUPPORT_SURFACES} from '../../prototype/src/company/side-table-data.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const root = new URL('../../', import.meta.url);
const sourceRoot = new URL('assets-source/company-sourced-side-table-v1/', root);
const originalRoot = new URL('original/', sourceRoot);
const meshoptModule = new URL('prototype/node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js', root);
const defaultRecipe = new URL('recipe.json', sourceRoot);
const defaultOutput = new URL('prototype/public/company-assets/sourced-side-table-v1/side-table-carved-round/v1/model.glb', root);
const names = ['sourced-side-table-body', 'side-table-top'];
const sourcePlaneTolerance = 5e-7;
const [surface] = SIDE_TABLE_SUPPORT_SURFACES;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadSource(recipe) {
  assert.equal(recipe.schema, 'company-sourced-side-table-v1');
  assert.equal(recipe.version, 1);
  assert.equal(recipe.asset.id, 'round_wooden_table_02');
  assert.equal(recipe.asset.license, 'CC0-1.0');
  assert(Number.isFinite(recipe.fit?.tabletopDiameterMetres) && recipe.fit.tabletopDiameterMetres >= .40 && recipe.fit.tabletopDiameterMetres <= .54,
    'tabletopDiameterMetres must be between .40m and .54m');
  const plan = recipe.simplification;
  assert(Number.isSafeInteger(plan.bodyTriangleTarget) && plan.bodyTriangleTarget >= 2400 && plan.bodyTriangleTarget <= 2420,
    'Body triangle target must stay within the verified 2400–2420 range');
  assert.equal(plan.maximumRelativeError, .002, 'Keep the measured simplification tolerance');
  assert.deepEqual(plan.normalAndUVWeights, [.1, .1, .1, 2, 2], 'Keep the measured normal/UV weights');
  assert.equal(sha256(await fs.readFile(meshoptModule)), plan.meshoptModuleSha256, 'Pinned meshoptimizer module differs');
  const files = new Map();
  for (const [name, digest] of Object.entries(recipe.asset.files)) {
    assert(/^(?:textures\/)?round_wooden_table_02(?:_\w+)?\.(?:gltf|bin|jpg)$/.test(name), `Unexpected source file ${name}`);
    const bytes = await fs.readFile(new URL(name, originalRoot));
    assert.equal(sha256(bytes), digest, `Original source digest differs: ${name}`);
    files.set(name, bytes);
  }
  const gltf = JSON.parse(files.get('round_wooden_table_02_1k.gltf'));
  assert.equal(gltf.asset.version, '2.0');
  assert.deepEqual(gltf.scenes[gltf.scene].nodes, [0]);
  assert.deepEqual(gltf.nodes, [{mesh: 0, name: 'round_wooden_table_02'}], 'Source mesh must be at identity');
  assert(gltf.meshes.length === 1 && gltf.meshes[0].primitives.length === 1 && gltf.materials.length === 1);
  const primitive = gltf.meshes[0].primitives[0], [buffer] = gltf.buffers;
  const meshBytes = files.get(buffer.uri);
  assert.equal(meshBytes.length, buffer.byteLength);
  const images = gltf.images.map(image => {
    assert.equal(image.mimeType, 'image/jpeg');
    const bytes = files.get(image.uri);
    assert(bytes?.[0] === 0xff && bytes[1] === 0xd8, `Expected original JPEG ${image.uri}`);
    return {name: image.name, bytes};
  });
  assert.equal(images.length, 3);
  function accessor(index, Type, componentType, type, arity) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    assert(a.componentType === componentType && a.type === type && view.buffer === 0 && !view.byteStride && !a.sparse);
    const start = view.byteOffset + (a.byteOffset || 0), end = start + a.count * arity * Type.BYTES_PER_ELEMENT;
    assert(end <= view.byteOffset + view.byteLength && end <= meshBytes.length);
    return new Type(meshBytes.buffer.slice(meshBytes.byteOffset + start, meshBytes.byteOffset + end));
  }
  const positions = accessor(primitive.attributes.POSITION, Float32Array, 5126, 'VEC3', 3);
  const normals = accessor(primitive.attributes.NORMAL, Float32Array, 5126, 'VEC3', 3);
  const uv = accessor(primitive.attributes.TEXCOORD_0, Float32Array, 5126, 'VEC2', 2);
  const indices = accessor(primitive.indices, Uint16Array, 5123, 'SCALAR', 1);
  assert(positions.length === normals.length && positions.length / 3 === uv.length / 2 && indices.length === 4254 * 3);
  return {gltf, images, positions, normals, uv, indices};
}

function signedArea(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function outlineAndUV(top, positions, uv) {
  const getXZ = index => [positions[index * 3], positions[index * 3 + 2]];
  const edges = new Map();
  const vertices = new Set();
  for (let i = 0; i < top.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = top[i + j], b = top[i + (j + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      vertices.add(a);
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }
  }
  const from = new Map(edges.values());
  assert.equal(from.size, 48, 'The pinned source must expose one 48-vertex upper perimeter');
  const [first] = from.keys(), outline = [];
  let next = first;
  do {
    outline.push(next);
    next = from.get(next);
    assert(next !== undefined && outline.length <= from.size, 'Upper perimeter must close');
  } while (next !== first);
  assert.equal(outline.length, from.size);

  // Use the largest original upper-plane face to derive its affine UV map.
  const best = {indices: [], area: 0};
  for (let i = 0; i < top.length; i += 3) {
    const triangle = top.slice(i, i + 3), area = Math.abs(signedArea(...triangle.map(getXZ)));
    if (area > best.area) Object.assign(best, {indices: triangle, area});
  }
  const [a, b, c] = best.indices.map(getXZ), determinant = signedArea(a, b, c);
  const map = (x, z) => {
    const point = [x, z];
    const wa = signedArea(point, b, c) / determinant, wb = signedArea(a, point, c) / determinant;
    return [0, 1].map(axis => {
      const [ua, ub, uc] = best.indices.map(index => uv[index * 2 + axis]);
      return ua * wa + ub * wb + uc * (1 - wa - wb);
    });
  };
  let maxUVError = 0;
  for (const index of vertices) {
    const projected = map(...getXZ(index));
    maxUVError = Math.max(maxUVError, Math.abs(projected[0] - uv[index * 2]), Math.abs(projected[1] - uv[index * 2 + 1]));
  }
  assert(maxUVError < 2e-6, 'The original tabletop UV must follow one affine map before re-triangulation');
  return {outline, map, maxUVError};
}

function positionsBounds(positions) {
  const bounds = new Box3(), point = new Vector3();
  for (let i = 0; i < positions.length; i += 3) bounds.expandByPoint(point.fromArray(positions, i));
  return bounds;
}

function inTwoMeshes(source, recipe) {
  const {positions, normals, uv, indices} = source;
  const bounds = positionsBounds(positions), center = bounds.getCenter(new Vector3());
  const top = [], rest = [];
  for (let i = 0; i < indices.length; i += 3) {
    const face = Array.from(indices.subarray(i, i + 3));
    const destination = face.every(p => bounds.max.y - positions[3 * p + 1] <= sourcePlaneTolerance) ? top : rest;
    destination.push(...face);
  }
  assert.equal(top.length / 3, 144, 'Unexpected source top plane');
  const {outline, map, maxUVError} = outlineAndUV(top, positions, uv);
  const rim = new Box3().setFromPoints(outline.map(index => new Vector3().fromArray(positions, 3 * index)));
  const topSize = rim.getSize(new Vector3());
  const uniformXZ = recipe.fit.tabletopDiameterMetres / Math.max(topSize.x, topSize.z);
  const yScale = surface.topY / (bounds.max.y - bounds.min.y);

  // Preserve ground contacts, top seam and the source silhouette extrema before decimation.
  // LockBorder keeps deliberate hard edges and opening boundaries from the source mesh.
  const vertexCount = positions.length / 3, attributes = new Float32Array(vertexCount * 5), locked = new Uint8Array(vertexCount);
  const eps = 1e-6;
  for (let index = 0; index < vertexCount; index++) {
    attributes.set(normals.subarray(3 * index, 3 * index + 3), 5 * index);
    attributes.set(uv.subarray(2 * index, 2 * index + 2), 5 * index + 3);
    const [x, y, z] = positions.subarray(3 * index, 3 * index + 3);
    if ([y - bounds.min.y, bounds.max.y - y, x - bounds.min.x, bounds.max.x - x, z - bounds.min.z, bounds.max.z - z].some(delta => delta <= eps)) locked[index] = 1;
  }
  const plan = recipe.simplification;
  const [reduced, simplificationError] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(rest), positions, 3, attributes, 5,
    plan.normalAndUVWeights, locked, plan.bodyTriangleTarget * 3, plan.maximumRelativeError, ['LockBorder']);
  assert(reduced.length <= plan.bodyTriangleTarget * 3, 'Decimation did not meet the triangle budget within the fixed error');

  function getVertex(index) {
    const [x, y, z] = positions.subarray(3 * index, 3 * index + 3);
    const local = [(x - center.x) * uniformXZ, (y - bounds.min.y) * yScale, (z - center.z) * uniformXZ];
    if (y - bounds.min.y <= sourcePlaneTolerance) local[1] = 0;
    if (bounds.max.y - y <= sourcePlaneTolerance) local[1] = surface.topY;
    const n = new Vector3().fromArray(normals, 3 * index);
    n.set(n.x / uniformXZ, n.y / yScale, n.z / uniformXZ).normalize();
    return {position: local, normal: n.toArray(), uv: Array.from(uv.subarray(index * 2, index * 2 + 2))};
  }

  const [halfX, halfZ] = surface.halfSize;
  const patch = [[-halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ], [halfX, -halfZ]].map(([x, z]) => ({
    position: [x, surface.topY, z], normal: [0, 1, 0], uv: map(x / uniformXZ + center.x, z / uniformXZ + center.z),
  }));
  const contour = outline.map(index => new Vector2(getVertex(index).position[0], getVertex(index).position[2]));
  const hole = patch.map(vertex => new Vector2(vertex.position[0], vertex.position[2]));
  for (const point of hole) {
    const sides = contour.map((start, index) => signedArea(start.toArray(), contour[(index + 1) % contour.length].toArray(), point.toArray()));
    assert(sides.every(area => area > 0) || sides.every(area => area < 0), 'The entire top support patch must stay inside the source top rim');
  }
  // There are no hidden overlapping faces: all original flat top triangles are removed,
  // then split into the source boundary minus the rectangle and one real support patch.
  const points = [...contour, ...hole];
  const keys = [...outline, ...patch.map((_, index) => vertexCount + index)];
  const replacement = ShapeUtils.triangulateShape(contour, [hole]).map(triangle => {
    const area = signedArea(...triangle.map(index => points[index].toArray()));
    assert(Math.abs(area) > 1e-10);
    return (area > 0 ? triangle.reverse() : triangle).map(index => keys[index]);
  });
  const retainedArea = replacement.reduce((sum, triangle) => {
    const [a, b, c] = triangle.map(key => points[keys.indexOf(key)].toArray());
    return sum + Math.abs(signedArea(a, b, c)) / 2;
  }, 0);
  assert(Math.abs(retainedArea + 4 * halfX * halfZ - Math.abs(ShapeUtils.area(contour))) < 1e-8,
    'The physical tabletop partition must cover the original outline exactly');
  const mesh = (mapping, get) => compactMesh(mapping, get);
  const body = mesh([...reduced, ...replacement.flat()], index => index < vertexCount ? getVertex(index) : patch[index - vertexCount]);
  const support = mesh([0, 1, 2, 0, 2, 3], index => patch[index]);
  assert((body.indices.length + support.indices.length) / 3 <= 2500, 'Adapted table exceeds 2500 triangles');

  const originalFeet = groundContact(rest, index => getVertex(index).position);
  const simplifiedFeet = groundContact(body.indices, index => Array.from(body.position.subarray(3 * index, 3 * index + 3)));
  assert(originalFeet.every((area, i) => area > 1e-5 && Math.abs(area - simplifiedFeet[i]) < 1e-8),
    'Each original foot must preserve its positive-area floor contact');
  return {body, support, details: {sourceBounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, uniformXZ, yScale, maxUVError,
    originalTopTriangles: top.length / 3, retainedTopTriangles: replacement.length, topPartitionArea: retainedArea + 4 * halfX * halfZ,
    lockedVertices: locked.reduce((sum, value) => sum + value, 0), simplificationError, groundContactSquareMetres: simplifiedFeet}};
}

function groundContact(indices, pointAt) {
  const areas = [0, 0, 0, 0];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]].map(pointAt);
    if (!triangle.every(point => Math.abs(point[1]) < 1e-6)) continue;
    const sign = (axis, side) => triangle.every(point => point[axis] * side > 0);
    const quadrant = (sign(0, -1) ? 0 : sign(0, 1) ? 2 : -1) + (sign(2, -1) ? 0 : sign(2, 1) ? 1 : -10);
    assert(quadrant >= 0 && quadrant <= 3, 'Ground contact must remain in one of the four actual feet');
    areas[quadrant] += Math.abs(signedArea(...triangle.map(point => [point[0], point[2]]))) / 2;
  }
  return areas;
}

function compactMesh(mapping, getVertex) {
  const vertices = new Map(), position = [], normal = [], uv = [];
  const indices = mapping.map(key => {
    if (!vertices.has(key)) {
      const vertex = getVertex(key);
      vertices.set(key, vertices.size);
      position.push(...vertex.position);
      normal.push(...vertex.normal);
      uv.push(...vertex.uv);
    }
    return vertices.get(key);
  });
  return {position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uv), indices: new Uint16Array(indices)};
}

function glb(source, meshes) {
  const {materials, textures, samplers} = source.gltf;
  const accessors = [], bufferViews = [], parts = [];
  let byteOffset = 0;
  function addBytes(bytes, target) {
    const view = {buffer: 0, byteOffset, byteLength: bytes.length};
    if (target !== undefined) view.target = target;
    const padding = (4 - bytes.length % 4) % 4;
    parts.push(bytes, Buffer.alloc(padding));
    byteOffset += bytes.length + padding;
    return bufferViews.push(view) - 1;
  }
  function accessor(array, type, arity, target, position = false) {
    const bufferView = addBytes(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target);
    const entry = {bufferView, componentType: array instanceof Uint16Array ? 5123 : 5126, count: array.length / arity, type};
    if (position) {
      const bounds = positionsBounds(array);
      Object.assign(entry, {min: bounds.min.toArray(), max: bounds.max.toArray()});
    }
    return accessors.push(entry) - 1;
  }
  const primitives = meshes.map(mesh => ({attributes: {
    POSITION: accessor(mesh.position, 'VEC3', 3, 34962, true), NORMAL: accessor(mesh.normal, 'VEC3', 3, 34962),
    TEXCOORD_0: accessor(mesh.uv, 'VEC2', 2, 34962),
  }, indices: accessor(mesh.indices, 'SCALAR', 1, 34963), material: 0}));
  const images = source.images.map(image => ({name: image.name, mimeType: 'image/jpeg', bufferView: addBytes(image.bytes)}));
  const model = {
    asset: {version: '2.0', generator: 'company-sourced-side-table-v1'}, scene: 0, scenes: [{nodes: [0, 1]}],
    nodes: names.map((name, mesh) => ({name, mesh})), meshes: names.map((name, index) => ({name, primitives: [primitives[index]]})),
    materials, textures, samplers, images, accessors, bufferViews, buffers: [{byteLength: byteOffset}],
  };
  const json = Buffer.from(JSON.stringify(model));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const binary = Buffer.concat(parts);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binaryHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + binary.length, 8);
  jsonHeader.writeUInt32LE(paddedJson.length);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binaryHeader.writeUInt32LE(binary.length);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, binary]);
}

async function readback(bytes, images) {
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async () => ({width: 1024, height: 1024, close() {}});
  const {scene, parser} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const {json} = parser;
  try {
    const resource = {mount: 'floor-surface', footprint: {blocking: true}, supportSurfaces: SIDE_TABLE_SUPPORT_SURFACES, supportNodes: {top: names[1]}};
    const support = validateSupportGeometry(scene, resource, (code, path, message) => {throw Error(`${code} at ${path}: ${message}`);});
    assert(support.checked);
    const bounds = new Box3().setFromObject(scene, true), mount = SIDE_TABLE_MOUNTING, eps = 1e-6;
    assert(Math.abs(bounds.min.y) < eps && Math.abs(bounds.max.y - mount.height) < eps &&
      bounds.min.x >= -mount.width / 2 - eps && bounds.max.x <= mount.width / 2 + eps &&
      bounds.min.z >= -mount.depth / 2 - eps && bounds.max.z <= mount.depth / 2 + eps,
    'Actual adapted GLB falls outside the fixed side-table mounting envelope');
    const meshes = names.map(name => scene.getObjectByName(name));
    const [body, patch] = meshes;
    assert(meshes.every(mesh => mesh.isMesh && mesh.geometry.attributes.uv) && body.material === patch.material);
    assert(body.material.map && body.material.normalMap && body.material.roughnessMap && body.material.metalnessMap);
    assert.equal(patch.geometry.index.count, 6);
    assert.equal(json.materials.length, 1);
    assert(json.buffers.every(buffer => buffer.uri === undefined) && json.images.every(image => image.uri === undefined));
    const binaryOffset = 28 + bytes.readUInt32LE(12);
    for (const [index, image] of json.images.entries()) {
      const view = json.bufferViews[image.bufferView], start = binaryOffset + view.byteOffset;
      assert(bytes.subarray(start, start + view.byteLength).equals(images[index].bytes), 'Original PBR texture bytes changed during embedding');
    }
    return {bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()}, support, triangles: meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
      textureSha256: images.map(image => ({name: image.name, sha256: sha256(image.bytes)})), meshNames: names, material: json.materials[0].name};
  } finally {
    const owned = new Set();
    scene.traverse(node => {
      if (!node.isMesh) return;
      owned.add(node.geometry);
      owned.add(node.material);
      for (const value of Object.values(node.material)) if (value?.isTexture) owned.add(value);
    });
    for (const item of owned) item.dispose();
  }
}

/** Read a pinned input, adapt it, and validate the written GLB in memory. */
export async function buildSourcedSideTable({recipePath = defaultRecipe} = {}) {
  const recipeBytes = await fs.readFile(recipePath);
  const recipe = JSON.parse(recipeBytes);
  const source = await loadSource(recipe);
  await MeshoptSimplifier.ready;
  const {body, support, details} = inTwoMeshes(source, recipe);
  const bytes = glb(source, [body, support]);
  const report = {source: recipe.asset.id, recipeSha256: sha256(recipeBytes), sha256: sha256(bytes), ...details, ...await readback(bytes, source.images)};
  return {bytes, report};
}

async function existingOutput(output, bytes) {
  try {
    const info = await fs.lstat(output);
    if (info.isFile() && !info.isSymbolicLink() && bytes.equals(await fs.readFile(output))) return 'unchanged';
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  throw Object.assign(new Error(`Existing output differs at ${output}. Use --output with a new version path.`), {code: 'sourced-table-output-conflict'});
}

async function publish(output, bytes) {
  const current = await existingOutput(output, bytes);
  if (current) return current;
  const directory = path.dirname(output);
  await fs.mkdir(directory, {recursive: true});
  const staged = path.join(directory, `.sourced-table-${randomUUID()}.tmp`);
  const handle = await fs.open(staged, 'wx');
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {await handle.close();}
    try {
      // Linking an already complete file publishes atomically and gives EEXIST instead of replacing a winner.
      await fs.link(staged, output);
    } catch (error) {
      if (error.code === 'EEXIST') {
        const concurrent = await existingOutput(output, bytes);
        if (concurrent) return concurrent;
      }
      throw error;
    }
    return 'created';
  } finally {await fs.rm(staged, {force: true});}
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const {values} = parseArgs({options: {recipe: {type: 'string'}, output: {type: 'string'}, check: {type: 'boolean'}}});
  const {bytes, report} = await buildSourcedSideTable({recipePath: values.recipe});
  const output = values.output ? path.resolve(values.output) : fileURLToPath(defaultOutput);
  let publication = 'checked';
  if (values.check) assert(bytes.equals(await fs.readFile(output)), `Generated GLB differs from ${output}`);
  else publication = await publish(output, bytes);
  console.log(JSON.stringify({status: 'passed', publication, output, ...report}, null, 2));
}
