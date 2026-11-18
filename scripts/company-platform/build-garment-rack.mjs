import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { garmentGlbChunks, inspectGarmentAsset, loadGarmentGlb, resolveStockFoot } from './test-garment-rack-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-garment-rack-v1';
const defaultInput = family + '/parameters.json', contractPath = family + '/contracts.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-garment-rack.mjs';
const geometryPath = 'scripts/company-platform/test-garment-rack-assets.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const within = (n, lo, hi) => Number.isFinite(n) && lo <= n && n <= hi;
const hex = n => typeof n === 'string' && /^#[a-fA-F0-9]{6}$/.test(n);
const tuple = (v, length, lo, hi) => Array.isArray(v) && v.length === length && v.every(n => within(n, lo, hi));
const vec = point => new THREE.Vector3(...point);
const vertical = new THREE.Vector3(0, 1, 0);

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); })
      .catch(error => this.onerror?.(error));
  }
};

function projectPath(relative) {
  assert(typeof relative === 'string' && !/[\\:\0]/.test(relative) &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected portable project-relative path');
  return path.join(root, relative);
}
const read = relative => fs.readFile(projectPath(relative));
const box = (w, h, d, x, y, z, r = .006) =>
  new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w * .37, h * .37, d * .37)).translate(x, y, z);

function merge(parts) {
  const compatible = parts.map(part => part.index ? part.toNonIndexed() : part);
  const combined = mergeGeometries(compatible);
  for (const geometry of new Set([...compatible, ...parts])) geometry.dispose();
  assert(combined, 'Geometry attributes of assembly parts must agree');
  return combined;
}

function rod(start, stop, radius, sides = 12) {
  const a = vec(start), b = vec(stop), axis = b.clone().sub(a), length = axis.length();
  assert(length > .0001 && within(radius, .001, .06));
  const turn = new THREE.Quaternion().setFromUnitVectors(vertical, axis.normalize());
  return new THREE.CylinderGeometry(radius, radius, length, sides).applyQuaternion(turn).translate(...a.lerp(b, .5));
}

function portal(shape, add) {
  const { postX, upright, top, footDepth, footWidth } = shape;
  assert(within(upright, .027, .046) && within(top, 1.60, 1.77) && within(footDepth, .34, .485) && within(footWidth, .060, .104));
  const cap = .029;
  add('rack-foot-pads', merge([-postX, postX].map(x => box(footWidth, cap, footDepth, x, cap / 2, 0))), 'feet');
  add('rack-frame', merge([
    ...[-postX, postX].map(x => box(upright, top - .022, upright, x, (top + .022) / 2, 0)),
    box(2 * postX + upright, upright, upright, 0, top - upright / 2, 0),
  ]), 'frame');
  add('rack-rail-bosses', merge([-postX, postX].map(x => box(.046, .052, .045, x, 1.5, 0))), 'fittings');
}

function aFrame(shape, add) {
  const { postX, strut, top, spread, footWidth } = shape;
  assert(within(strut, .02, .038) && within(top, 1.595, 1.72) && within(spread, .152, .205) && within(footWidth, .057, .098));
  add('rack-foot-pads', merge([-postX, postX].flatMap(x => [-spread, spread].map(z => box(footWidth, .022, .076, x, .011, z)))), 'feet');
  add('rack-frame', merge([-postX, postX].flatMap(x => [
    ...[-spread, spread].map(z => rod([x, .015, z], [x, top - .012, 0], strut / 2)),
    rod([x, .678, -.113], [x, .678, .113], strut * .39),
  ])), 'frame');
  add('rack-rail-bosses', merge([-postX, postX].map(x => box(.043, .084, .081, x, 1.522, 0))), 'fittings');
}

function cantilever(shape, add) {
  const { postX, back, upright, top, footDepth } = shape, x = -postX;
  assert(within(back, .111, .17) && within(upright, .044, .076) && within(top, 1.67, 1.779) && within(footDepth, .35, .48));
  add('rack-foot-pads', merge([box(.116, .039, footDepth, x + .017, .0195, -.002),
    box(.801, .034, .078, -.028, .017, -back), box(.111, .022, .097, .358, .011, -back)]), 'feet');
  add('rack-frame', merge([box(upright, top - .03, upright, x, (top + .03) / 2, -back),
    box(upright, .045, back + .053, x, 1.507, -back / 2),
    box(.775, .038, .036, -.057, top - .036, -back),
    rod([x, 1.539, -.018], [x, top - .055, -back], .014)]), 'frame');
  add('rack-rail-bosses', box(.044, .052, .046, x, 1.5, 0), 'fittings');
}

function trestle(shape, add, source) {
  const { postX, shoeX, shoeScale, top, strut } = shape;
  assert(within(shoeX, .25, .33) && tuple(shoeScale, 3, .59, 1.56) && within(top, 1.53, 1.65) && within(strut, .026, .047));
  assert(source?.mesh && within(source.footTop, .04, .17), 'Trestle needs its declared real foot donor');
  const endY = source.footTop * shoeScale[1];
  add('rack-stock-feet', merge([-shoeX, shoeX].map(x => source.foot.clone().scale(...shoeScale).translate(x, 0, 0))), 'feet');
  add('rack-frame', merge([-1, 1].map(side =>
    rod([side * shoeX, endY - .008, 0], [side * postX, top, 0], strut / 2, 12))), 'frame');
  add('rack-rail-bosses', merge([-postX, postX].map(x => box(.051, .063, .048, x, 1.507, 0))), 'fittings');
}

const frames = { portal, 'a-frame': aFrame, cantilever, trestle };
function rackModel(design, source, contract, add) {
  assert(Object.hasOwn(frames, design.form) && within(design.shape.postX, .403, .435), 'Expected a supported upright assembly');
  const { radius, centerY } = contract.garmentRail;
  frames[design.form](design.shape, add, source);
  add('garment-rail', rod([-.445, centerY, 0], [.445, centerY, 0], radius, 96), 'rail');
}

// Analytic YZ hook section. The phi=pi sample at theta=0 touches the top
// of the actual rail. The bottom-rear opening leaves space for mounting.
function hookGeometry() {
  const positions = [], normals = [], uv = [], index = [], rings = 95, sides = 24;
  const wire = .0035, circle = .0185;
  for (let r = 0; r <= rings; r++) {
    const theta = (-105 + 3 * r) * Math.PI / 180, y = Math.cos(theta), z = Math.sin(theta);
    for (let p = 0; p <= sides; p++) {
      const phi = p * 2 * Math.PI / sides, radial = circle + wire * Math.cos(phi);
      positions.push(wire * Math.sin(phi), -.015 + y * radial, z * radial);
      normals.push(Math.sin(phi), Math.cos(phi) * y, Math.cos(phi) * z);
      uv.push(r / rings, p / sides);
      if (r < rings && p < sides) {
        const a = r * (sides + 1) + p, b = a + sides + 1;
        index.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return merge([geometry, rod([0, -.0329, 0], [0, -.059, 0], wire, 16),
    new THREE.SphereGeometry(wire, 12, 7).translate(0, -.015 + Math.cos(-105 * Math.PI / 180) * circle, Math.sin(-105 * Math.PI / 180) * circle)]);
}

function drapedCloth(raw, amplitude) {
  const original = raw.attributes.position, vertices = [], vertexIds = new Map();
  const cornerIds = Array.from({ length: original.count }, (_, index) => {
    const point = new THREE.Vector3().fromBufferAttribute(original, index);
    const key = point.toArray().map(value => Math.round(value * 1e7)).join(',');
    if (!vertexIds.has(key)) {
      vertexIds.set(key, vertices.length);
      vertices.push(point);
    }
    return vertexIds.get(key);
  });
  let triangles = Array.from({ length: cornerIds.length / 3 }, (_, i) => cornerIds.slice(i * 3, i * 3 + 3));
  for (let pass = 0; pass < 4; pass++) {
    const midpoints = new Map();
    const split = (a, b) => {
      if (vertices[a].distanceToSquared(vertices[b]) <= .065 ** 2) return undefined;
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      if (!midpoints.has(key)) {
        midpoints.set(key, vertices.length);
        vertices.push(vertices[a].clone().lerp(vertices[b], .5));
      }
      return midpoints.get(key);
    };
    const next = [];
    for (const corners of triangles) {
      const sides = corners.map((a, i) => split(a, corners[(i + 1) % 3]));
      const count = sides.filter(id => id !== undefined).length;
      if (count === 0) next.push(corners);
      else if (count === 3) {
        const [a, b, c] = corners, [ab, bc, ca] = sides;
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else {
        // Rotate the triangle so one split is on AB, or two are on AB and BC.
        const first = count === 1 ? sides.findIndex(id => id !== undefined) : (sides.indexOf(undefined) + 1) % 3;
        const [a, b, c] = [0, 1, 2].map(i => corners[(first + i) % 3]);
        const ab = sides[first], bc = sides[(first + 1) % 3];
        if (count === 1) next.push([a, ab, c], [ab, b, c]);
        else next.push([a, ab, c], [ab, bc, c], [ab, b, bc]);
      }
    }
    triangles = next;
    if (!midpoints.size) break;
  }
  const bounds = new THREE.Box3().setFromPoints(vertices), positions = [], uv = [];
  for (const { x, y, z } of vertices) {
    const drape = amplitude * Math.sin(z * 39 + y * 13) * (.29 + .71 * THREE.MathUtils.clamp((-.12 - y) / .36, 0, 1));
    positions.push(x + drape, y, z);
    uv.push((z - bounds.min.z) / (bounds.max.z - bounds.min.z), (bounds.max.y - y) / (bounds.max.y - bounds.min.y));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles.flat());
  geometry.computeVertexNormals();
  return geometry;
}

function trimTube(centres, radius) {
  const sides = 8, position = [], uv = [], index = [];
  for (const [i, centre] of centres.entries()) {
    const a = centres[Math.max(i - 1, 0)], b = centres[Math.min(i + 1, centres.length - 1)];
    const side = new THREE.Vector3(0, b.z - a.z, a.y - b.y).normalize();
    for (let j = 0; j < sides; j++) {
      const angle = 2 * Math.PI * j / sides;
      const vertex = centre.clone().addScaledVector(side, radius * Math.sin(angle));
      vertex.x += radius * Math.cos(angle);
      position.push(...vertex);
      uv.push(j / sides, i / (centres.length - 1));
      if (i + 1 < centres.length) {
        const first = i * sides + j, next = i * sides + (j + 1) % sides;
        index.push(first, next, first + sides, next, next + sides, first + sides);
      }
    }
  }
  const end = (centres.length - 1) * sides;
  for (let j = 1; j < sides - 1; j++) index.push(0, j + 1, j, end, end + j, end + j + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function clothTrim(cloth, seams) {
  const body = new THREE.Mesh(cloth);
  const ray = new THREE.Raycaster(new THREE.Vector3(.12, 0, 0), new THREE.Vector3(-1, 0, 0)), trim = [];
  function project(z, y) {
    ray.ray.origin.set(.12, y, z);
    const hit = ray.intersectObject(body, false)[0];
    assert(hit, `Trim leaves the displayed cloth at z=${z}, y=${y}`);
    return hit.point;
  }
  function followSegment(a, b, centres, depth = 0) {
    const middle = project((a.z + b.z) / 2, (a.y + b.y) / 2);
    if (Math.abs(middle.x - (a.x + b.x) / 2) > .00035) {
      assert(depth < 5, 'Trim must follow a continuous garment surface');
      followSegment(a, middle, centres, depth + 1);
      followSegment(middle, b, centres, depth + 1);
    } else centres.push(b);
  }
  try {
    for (const seam of seams) {
      assert(seam.path.length >= 2 && seam.path.length <= 12 && seam.path.every(p => tuple(p, 2, -.827, .207) && Math.abs(p[0]) < .208 && p[1] < -.075) &&
        within(seam.radius, .0018, .0053), 'Trim must use finite on-garment paths');
      const points = seam.path.map(([z, y]) => project(z, y));
      const centres = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1], to = points[i];
        const steps = Math.ceil(Math.hypot(to.y - from.y, to.z - from.z) / .018);
        assert(steps > 0, 'Trim requires distinct consecutive points');
        let previous = from;
        for (let j = 1; j <= steps; j++) {
          const current = j === steps ? to : project(THREE.MathUtils.lerp(from.z, to.z, j / steps), THREE.MathUtils.lerp(from.y, to.y, j / steps));
          followSegment(previous, current, centres);
          previous = current;
        }
      }
      trim.push(trimTube(centres, seam.radius));
    }
    return merge(trim);
  } finally {
    body.material.dispose();
  }
}

function garmentModel(design, add) {
  const { outline, thickness, fold, hangerHalfWidth, seams } = design.shape;
  assert(Array.isArray(outline) && within(outline.length, 8, 40) && outline.every(p => tuple(p, 2, -.84, .211) && Math.abs(p[0]) < .212 && p[1] < -.066),
    'Expected finite cloth silhouette vertices inside the hanger');
  assert(within(thickness, .008, .028) && within(fold, .004, .028) && within(hangerHalfWidth, .082, .184));
  assert(Array.isArray(seams) && within(seams.length, 1, 11));
  const silhouette = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
  assert(Math.abs(THREE.ShapeUtils.area(silhouette.getPoints())) > .06, 'Displayed clothing needs a real fabric face');
  const raw = new THREE.ExtrudeGeometry(silhouette, { depth: thickness, bevelEnabled: true, bevelSize: .0019,
    bevelThickness: .0019, bevelSegments: 2 }).translate(0, 0, -thickness / 2).rotateY(Math.PI / 2);
  const draped = drapedCloth(raw, fold);
  raw.dispose();
  add('hanger-hook', hookGeometry(), 'hook');
  add('garment-hanger', merge([
    ...[-hangerHalfWidth, hangerHalfWidth].map(z => rod([0, -.055, 0], [0, -.186, z], .0068)),
    rod([0, -.186, -hangerHalfWidth], [0, -.186, hangerHalfWidth], .0054),
  ]), 'hanger');
  add('garment-cloth', draped, 'cloth');
  add('garment-seams', clothTrim(draped, seams), 'trim');
}

const pad = (bytes, value = 0) => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
function embedClothPng(model, png) {
  const { gltf, binary } = garmentGlbChunks(model);
  const cloth = gltf.nodes.find(node => node.name === 'garment-cloth');
  const primitive = gltf.meshes[cloth.mesh].primitives[0];
  assert(primitive.attributes.TEXCOORD_0 !== undefined);
  const bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: binary.length, byteLength: png.length }) - 1;
  gltf.images = [{ bufferView, mimeType: 'image/png' }];
  gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
  gltf.textures = [{ source: 0, sampler: 0 }];
  gltf.materials[primitive.material].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  const bin = Buffer.concat([binary, pad(png)]);
  gltf.buffers[0].byteLength = bin.length;
  const parts = [pad(Buffer.from(JSON.stringify(gltf)), 32), bin], header = Buffer.alloc(12);
  [0x46546c67, 2, 28 + parts[0].length + parts[1].length].forEach((value, i) => header.writeUInt32LE(value, i * 4));
  return Buffer.concat([header, ...parts.flatMap((bytes, index) => {
    const descriptor = Buffer.alloc(8);
    descriptor.writeUInt32LE(bytes.length, 0);
    descriptor.writeUInt32LE(index ? 0x004e4942 : 0x4e4f534a, 4);
    return [descriptor, bytes];
  })]);
}

async function generate(design, source, contract) {
  const group = new THREE.Group();
  group.name = design.id;
  const colors = design.type === 'rack' ? ['frame', 'rail', 'feet', 'fittings'] : ['cloth', 'trim', 'hook', 'hanger'];
  assert(colors.every(slot => hex(design.finish[slot])), 'Expected project PBR finish colors');
  const materials = Object.fromEntries(colors.map(slot => [slot, new THREE.MeshStandardMaterial({
    name: slot, color: source?.png && slot === 'cloth' ? '#ffffff' : design.finish[slot],
    metalness: ['rail', 'hook', 'fittings'].includes(slot) ? .48 : .02,
    roughness: ['cloth', 'trim'].includes(slot) ? .90 : .60,
  })]));
  const slots = {};
  function add(name, geometry, finish) {
    const mesh = new THREE.Mesh(geometry, materials[finish]);
    mesh.name = name;
    group.add(mesh);
    (slots[finish] ??= []).push(name);
  }
  try {
    if (design.type === 'rack') rackModel(design, source, contract, add);
    else garmentModel(design, add);
    const copyright = source ? `${source.author} (${source.license}); project-authored garment-rack adaptation.` :
      'Project-authored static garment rack geometry.';
    const raw = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright }));
    return { bytes: source?.png ? embedClothPng(raw, source.png) : raw, slots };
  } finally {
    group.traverse(mesh => mesh.geometry?.dispose());
    for (const material of Object.values(materials)) material.dispose();
  }
}

async function sourceData(source, design) {
  assert(typeof source?.author === 'string' && source.author.trim() && source.author.length <= 160 && !/[\r\n]/.test(source.author) &&
    ['CC0-1.0', 'Project-authorized-original'].includes(source.license), 'Expected declared author and source permission');
  assert(source.url === undefined || /^https:\/\//.test(source.url));
  if (source.entry !== undefined || source.archiveSha256 !== undefined)
    assert(typeof source.entry === 'string' && source.entry.trim() && /^[a-f0-9]{64}$/.test(source.archiveSha256));
  const [file, license] = await Promise.all([source.path, source.licensePath].map(read));
  assert.equal(hash(file), source.sha256, 'Source artwork differs');
  assert.equal(hash(license), source.licenseSha256, 'Source license differs');
  assert(license.toString('utf8').trim(), 'Source needs its actual written license');
  if (source.kind === 'glb') {
    assert(design.type === 'rack' && design.form === 'trestle', 'Source GLB can contribute a trestle floor foot');
    const scene = await loadGarmentGlb(file);
    return { ...source, scene, foot: resolveStockFoot(scene, source) };
  }
  assert(source.kind === 'png' && design.type === 'garment', 'Embedded art source must be a garment base-color PNG');
  assert(file.length >= 33 && file.length <= 2 * 1024 * 1024 &&
    file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    within(file.readUInt32BE(16), 1, 2048) && within(file.readUInt32BE(20), 1, 2048), 'Invalid or oversized texture');
  PNG.sync.read(file, { checkCRC: true });
  return { ...source, png: file };
}

const args = parseArgs({ options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
  parameters: { type: 'string' }, help: { type: 'boolean' } } }).values;
if (args.help) {
  console.log('node scripts/company-platform/build-garment-rack.mjs --check | --write | --output NEW_DIRECTORY [--parameters REPO_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use a single production mode');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const input = args.parameters ?? defaultInput;
const [inputBytes, contractBytes, generatorBytes, geometryBytes, branchBytes] = await Promise.all(
  [input, contractPath, generatorPath, geometryPath, branchPath].map(read)
);
const recipe = JSON.parse(inputBytes), contracts = JSON.parse(contractBytes);
assert.equal(contracts.schema, 'company-garment-rack-contracts'); assert.equal(contracts.version, 1);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(item => item.id === contracts.rack.productionBranch);
assert.equal(branch?.fixedFunctionAndInstall.mount, 'floor-surface');
assert.equal(recipe.schema, 'company-garment-rack-collection');
assert(recipe.version === 1 && Array.isArray(recipe.designs) && recipe.designs.length);
if (!args.parameters) assert.deepEqual(['rack', 'garment'].map(type => recipe.designs.filter(d => d.type === type).length), [4, 4]);
const collection = { schemaVersion: 1, id: 'company-garment-rack-v1', sourceParameters: input, sourceParametersSha256: hash(inputBytes),
  contract: contractPath, contractSha256: hash(contractBytes), generator: generatorPath, generatorSha256: hash(generatorBytes), resources: [] };
const files = new Map(), checks = [], seen = new Set();
for (const design of recipe.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) &&
    Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim() &&
    ['rack', 'garment'].includes(design.type), 'Expected portable furniture identity and type');
  const key = design.id + '@' + design.version;
  assert(!seen.has(key), 'Duplicate garment-rack identity ' + key); seen.add(key);
  const source = design.source && await sourceData(recipe.sources[design.source], design);
  const contract = contracts[design.type];
  const { bytes, slots } = await generate(design, source, contract);
  assert(bytes.equals((await generate(design, source, contract)).bytes), 'Changed repeated export for ' + key);
  const directory = '/company-assets/garment-rack-v1/' + design.id + '/v' + design.version;
  const asset = { format: 'glb', url: directory + '/model.glb', bytes: bytes.length, sha256: hash(bytes) };
  const resource = { id: design.id, version: design.version, displayName: design.displayName, ...contract, materialSlots: slots, asset,
    provenance: { license: source ? source.license + ' source with project-authored adaptation.' : 'Project-authored frame or garment geometry.',
      sourceDesign: design.form ?? 'editable-hanging-silhouette',
      sourceParameters: input, sourceParametersSha256: collection.sourceParametersSha256, generator: generatorPath,
      generatorSha256: collection.generatorSha256, functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: branchPath, environmentBranchSourceSha256: hash(branchBytes), environmentBranch: branch.id,
      ...(source ? { sourceArtifactPath: source.path, sourceArtifactSha256: source.sha256, sourceAuthor: source.author, sourceLicense: source.license,
        sourceArchiveSha256: source.archiveSha256, sourceEntry: source.entry, sourceUrl: source.url } : {}),
      dependencies: { geometryValidation: { path: geometryPath, sha256: hash(geometryBytes) },
        ...(source ? { license: { path: source.licensePath, sha256: source.licenseSha256 } } : {}) },
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'],
    },
  };
  const geometry = await inspectGarmentAsset(bytes, resource, design, source);
  const modelPath = 'prototype/public' + asset.url, resourcePath = 'prototype/public' + directory + '/resource.json';
  files.set(modelPath, bytes); files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, resourcePath, modelPath, sha256: asset.sha256,
    geometrySha256: geometry.geometrySha256, triangles: geometry.triangles });
  checks.push({ id: design.id, version: design.version, type: design.type, geometry, asset, repeatedExportByteIdentical: true });
}
for (const type of ['rack', 'garment']) {
  const shapes = checks.filter(item => item.type === type).map(item => item.geometry.geometrySha256);
  assert(new Set(shapes).size === shapes.length, 'Variations need genuinely different mesh geometry');
}
files.set(family + '/collection.json', json(collection));
const output = args.output && path.resolve(args.output);
if (output) {
  await fs.mkdir(output);
  files.set('report.json', json({ status: 'passed', scope: 'Read back rack supports, rail, hooked textiles and true mounting capacity', resources: checks }));
}
const additions = [];
for (const [relative, bytes] of files) {
  const target = output ? path.join(output, relative) : projectPath(relative);
  const current = await fs.readFile(target).catch(error => {
    if (error.code === 'ENOENT' && !args.check) return null;
    throw error;
  });
  if (current === null) additions.push([target, bytes]);
  else assert(current.equals(bytes), `Existing ${relative} differs; use a new ID/version or isolated output`);
}
for (const [target, bytes] of additions) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: 'wx' });
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
