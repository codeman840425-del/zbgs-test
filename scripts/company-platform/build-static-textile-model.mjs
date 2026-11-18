import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { RoundedBoxGeometry } from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
};

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const tools = [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader readback'];
const radians = THREE.MathUtils.degToRad;
const inRange = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const vec3 = array => new THREE.Vector3(...array);
const box = (size, at) => new THREE.BoxGeometry(...size).translate(...at);

export function projectPath(root, relative) {
  assert(typeof relative === 'string' && relative.split('/').every(part => part && part !== '.' && part !== '..') &&
    !/[\\:]/.test(relative), `Expected a project-relative path: ${relative}`);
  return path.join(root, relative);
}

export async function parseTextileGlb(bytes) {
  assert(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length && bytes.readUInt32LE(16) === 0x4e4f534a, 'Expected a complete GLB 2');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(!json.images?.length && json.buffers.every(buffer => buffer.uri === undefined), 'Expected a local solid-material GLB');
  const parsed = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  parsed.scene.updateMatrixWorld(true);
  return parsed;
}

export async function loadTextileStock(root, source, archive) {
  const bytes = await fs.readFile(projectPath(root, archive.path));
  assert.equal(digest(bytes), archive.sha256, 'Native source archive changed');
  const entries = unzipSync(bytes, { filter: entry => [source.entry, archive.licenseEntry].includes(entry.name) });
  assert.equal(digest(entries[archive.licenseEntry]), archive.licenseSha256, 'Native source license changed');
  assert.equal(digest(entries[source.entry]), source.modelSha256, 'Native source model changed');
  const { scene } = await parseTextileGlb(Buffer.from(entries[source.entry]));
  const options = [];
  scene.traverse(node => { if (node.isMesh && node.material.name === source.primitive) options.push(node); });
  assert(options.length === 1 && options[0].material.isMeshStandardMaterial, 'Expected an unambiguous native cloth primitive');
  const [mesh] = options;
  const position = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  return { geometry: position.applyMatrix4(mesh.matrixWorld), material: mesh.material };
}

function join(geometries) {
  const result = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  assert(result, 'Expected geometries with compatible buffers');
  return result;
}

function fittedStock(stock, size, bottom, angles = [0, 0, 0]) {
  const euler = new THREE.Euler(...angles.map(radians));
  const geometry = stock.geometry.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox, fitted = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  return geometry.translate(-centre.x, -bounds.min.y, -centre.z)
    .scale(size[0] / fitted.x, size[1] / fitted.y, size[2] / fitted.z).translate(0, bottom, 0);
}

function cord(points, radius, segments, closed = false) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), segments, radius, 6, closed);
}

function pillow(p, stock, add) {
  assert(stock && inRange(p.pipingCornerFraction, .65, .83) && inRange(p.pipingRadius, .0015, .004));
  const [width, height, depth] = p.size;
  add('pillow-native-cushion', fittedStock(stock, p.size, 0, p.sourceRotateDegrees), 'stock', 'fabric');
  const x = width / 2 + .0008, z = depth / 2 + .0008, cut = p.pipingCornerFraction;
  const outline = [[-x * cut, -z], [x * cut, -z], [x, -z * cut], [x, z * cut], [x * cut, z],
    [-x * cut, z], [-x, z * cut], [-x, -z * cut]];
  const curve = new THREE.CurvePath();
  outline.forEach(([a, b], index) => {
    const [c, d] = outline[(index + 1) % outline.length];
    curve.add(new THREE.LineCurve3(new THREE.Vector3(a, height / 2, b), new THREE.Vector3(c, height / 2, d)));
  });
  add('pillow-piping', new THREE.TubeGeometry(curve, 48, p.pipingRadius, 6, true), 'trim');
  add('pillow-button', new THREE.CylinderGeometry(p.buttonRadius, p.buttonRadius * .94, .004, 16).translate(0, height + .001, 0), 'trim');
}

function sampledFolds(p) {
  const points = [new THREE.Vector2(...p.start)];
  assert(Array.isArray(p.folds) && p.folds.length >= 3 && p.folds.length <= 14);
  for (const part of p.folds) {
    const last = points.at(-1);
    if (part.line) {
      const end = new THREE.Vector2(...part.line);
      points.push(last.clone().lerp(end, .33), last.clone().lerp(end, .67), end);
    } else {
      assert(part.curve?.length === 3, 'Each return fold uses three cubic control points');
      const curve = new THREE.CubicBezierCurve(last, ...part.curve.map(coords => new THREE.Vector2(...coords)));
      points.push(...curve.getPoints(12).slice(1));
    }
  }
  return points;
}

function ribbon(profile, width, thickness) {
  const positions = [], indices = [];
  for (const [i, point] of profile.entries()) {
    const previous = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 1)];
    const tangent = next.clone().sub(previous);
    assert(tangent.length() > .000001, 'Ribbon path has a zero-length tangent');
    tangent.normalize();
    const dy = -tangent.x * thickness / 2, dz = tangent.y * thickness / 2;
    for (const side of [1, -1]) for (const x of [-width / 2, width / 2]) {
      positions.push(x, point.y + side * dy, point.x + side * dz);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 4, b = a + 4;
    indices.push(a, a + 1, b + 1, a, b + 1, b);
    indices.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    indices.push(a, b, b + 2, a, b + 2, a + 2);
    indices.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1);
  }
  indices.push(0, 2, 3, 0, 3, 1);
  const last = (profile.length - 1) * 4;
  indices.push(last, last + 1, last + 3, last, last + 3, last + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function thrownBlanket(p, stock, add) {
  assert(inRange(p.thickness, .008, .016) && Number.isInteger(p.fringeCount) && inRange(p.fringeCount, 9, 20));
  const profile = sampledFolds(p);
  add('throw-folded-ribbon', ribbon(profile, p.width, p.thickness), 'fabric');
  const end = profile.at(-1), hemY = Math.max(...profile.map(point => point.y)) + p.thickness / 2;
  add('throw-woven-stripes', join(p.stripeCentres.map(z => box([p.width - .008, .0012, p.stripeWidth], [0, hemY + .0002, z]))), 'trim');
  const fringe = Array.from({ length: p.fringeCount }, (_, index) => {
    const x = (index / (p.fringeCount - 1) - .5) * (p.width - .017);
    const bias = Math.sin(index * 2.4) * .003;
    const points = [[x, end.y, end.x - .002], [x + bias, end.y - .006, end.x + p.fringeLength * .48],
      [x + bias * .7, end.y - p.fringeDrop, end.x + p.fringeLength + bias]];
    return cord(points.map(vec3), .00125, 5);
  });
  add('throw-fringe', join(fringe), 'trim');
}

function sofaCover(p, stock, add) {
  assert(stock && inRange(p.bevel, .007, .024) && Number.isInteger(p.gathers) && inRange(p.gathers, 10, 24));
  const [width, , depth] = p.drapedShell;
  add('cover-compressed-layers', new RoundedBoxGeometry(...p.compressedBody, 2, p.bevel).translate(0, p.compressedBody[1] / 2, 0), 'fabric');
  add('cover-native-outer-flap', fittedStock(stock, p.drapedShell, p.shellLow), 'stock', 'fabric');
  const front = depth / 2, cuff = new THREE.BoxGeometry(width, p.cuffHeight, p.cuffDepth, 64, 1, 1);
  const gather = x => p.gatherAmplitude * Math.sin(2 * Math.PI * p.gathers * (x / width + .5));
  const points = cuff.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i);
    points.setZ(i, points.getZ(i) + front + gather(x) * (.68 - .22 * y / p.cuffHeight));
    points.setY(i, y + p.shellLow + p.cuffHeight / 2 - .003);
  }
  cuff.computeVertexNormals();
  add('cover-gathered-cuff', cuff, 'fabric');
  const hem = Array.from({ length: 65 }, (_, i) => {
    const x = width * (i / 64 - .5);
    return new THREE.Vector3(x, p.shellLow - .001, front + gather(x) * .78 + p.cuffDepth / 2);
  });
  add('cover-elastic-hem', cord(hem, p.hemRadius, 72), 'trim');
}

function mat(p, stock, add, group) {
  assert(inRange(p.turns, 1.5, 2.6) && inRange(p.thickness, .004, .009) && inRange(p.innerRadius, .009, .020));
  assert(p.outerRadius > p.innerRadius && (p.outerRadius - p.innerRadius) / p.turns > p.thickness * 1.4, 'Scroll layers must stay separate');
  const y = p.thickness / 2, z = p.rollCentreZ, axisY = y + p.outerRadius;
  const profile = [p.tongue, p.tongue * .70, p.tongue * .35, (p.tongue + z) / 3, z].map(x => new THREE.Vector2(x, y));
  const samples = 91;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples, angle = t * p.turns * 2 * Math.PI;
    const r = p.outerRadius - (p.outerRadius - p.innerRadius) * (t - .05 * Math.sin(2 * Math.PI * t));
    profile.push(new THREE.Vector2(z - r * Math.sin(angle), axisY - r * Math.cos(angle)));
  }
  add('mat-continuous-scroll', ribbon(profile, p.width, p.thickness), 'fabric');
  const borders = [-1, 1].map(side =>
    cord(profile.map(point => new THREE.Vector3(side * (p.width / 2 - .001), point.y, point.x)), p.bindingRadius, 54));
  add('mat-edge-binding', join(borders), 'trim');
  add('mat-inset-border', box([p.width - .006, .0011, p.insetTrimWidth], [0, p.thickness + .0002, p.tongue - .016]), 'trim');
  const axis = new THREE.Object3D();
  axis.name = 'mat-roll-axis';
  axis.position.set(0, axisY, z);
  group.add(axis);
}

const constructors = {
  'piped-cushion': pillow, 'fringed-throw': thrownBlanket, 'gathered-cover': sofaCover, 'rolled-mat': mat,
};

export async function buildTextileModel(design, stock) {
  const make = constructors[design.construction];
  assert(make && design.parts && Object.values(design.parts).every(value => Array.isArray(value) || Number.isFinite(value)),
    'Expected a supported textile construction and finite dimensions');
  const group = new THREE.Group();
  group.name = design.id;
  const materialSlots = { fabric: [], trim: [] };
  const finishes = new Map(Object.entries(design.finishes).map(([name, opts]) => {
    const material = new THREE.MeshStandardMaterial(opts);
    material.name = name;
    return [name, material];
  }));
  if (stock) finishes.set('stock', stock.material.clone());
  function add(name, geometry, finish, slot = finish) {
    const material = finishes.get(finish);
    assert(material, `Unknown finish ${finish}`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    materialSlots[slot].push(name);
  }
  try {
    make(design.parts, stock, add, group);
    const centre = new THREE.Box3().setFromObject(group, true).getCenter(new THREE.Vector3());
    for (const node of group.children) {
      node.position.x -= centre.x;
      node.position.z -= centre.z;
    }
    const copyright = stock ? 'Contains Kenney Furniture Kit 2.0 cloth geometry, CC0-1.0; adapted for this project.' :
      'Project-authored fixed textile geometry.';
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true, copyright }));
    return { bytes, materialSlots };
  } finally {
    for (const node of group.children) node.geometry?.dispose();
    for (const material of finishes.values()) material.dispose();
  }
}
