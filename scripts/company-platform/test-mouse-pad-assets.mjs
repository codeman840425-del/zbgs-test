import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, MathUtils, Matrix3, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { unzipSync } from '../../prototype/node_modules/three/examples/jsm/libs/fflate.module.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { validateCablePortGeometry } from '../../prototype/src/company/cable-port-geometry.js';
import { validateCableResource } from '../../prototype/src/company/cable-data.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-mouse-pad-v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const round = n => Number(n.toFixed(8));
const vec = xyz => new Vector3(...xyz);
const tolerance = 1e-6;
const read = file => fs.readFile(path.join(root, file));
const data = async file => JSON.parse(await read(file));
const boundsOf = object => new Box3().setFromObject(object, true);
const fail = (code, path, message, details) => { throw Object.assign(new Error(`${code} at ${path}: ${message}`), { code, details }); };
const ray = (x, z) => new Raycaster(vec([x, .15, z]), vec([0, -1, 0]));
const near = (a, b) => assert(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
async function loadGlb(bytes) {
  const result = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  result.scene.updateMatrixWorld(true);
  return result;
}

function triangleReport(scene, padHeight) {
  const meshes = new Map(), materials = new Set();
  const ground = new Map(), mouseFeet = new Map(), geometry = [], body = [], pad = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.name && !meshes.has(mesh.name) && mesh.material.isMeshStandardMaterial &&
      mesh.material.opacity === 1 && !mesh.material.transparent, 'Expected unique opaque standard meshes');
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal'), index = mesh.geometry.getIndex();
    assert(p.count && n.count === p.count);
    const count = index?.count ?? p.count;
    assert.equal(count % 3, 0);
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(delta => {
        const j = index?.getX(i + delta) ?? i + delta;
        assert(new Vector3().fromBufferAttribute(n, j).toArray().every(Number.isFinite), 'Mesh normal must be finite');
        return new Vector3().fromBufferAttribute(p, j).applyMatrix4(mesh.matrixWorld);
      });
      assert(points.every(point => point.toArray().every(Number.isFinite)), 'Mesh position must be finite');
      const key = points.map(point => point.toArray().map(round).join(',')).sort().join('|');
      geometry.push(key);
      if (mesh.name.startsWith('pad-')) pad.push(key);
      if (mesh.name.startsWith('mouse-body-')) body.push(key);
      const [a, b, c] = points;
      const area = -b.clone().sub(a).cross(c.clone().sub(a)).y / 2;
      if (area <= 1e-12) continue;
      if (points.every(point => Math.abs(point.y) < tolerance)) ground.set(key, { name: mesh.name, area });
      if (mesh.name.startsWith('mouse-body-') && points.every(point => Math.abs(point.y - padHeight) < tolerance))
        mouseFeet.set(key, area);
    }
  });
  assert(geometry.length <= 3200 && meshes.size <= 22 && materials.size <= 6, 'Mouse and pad exceed geometry budget');
  const floorContact = [...ground.values()];
  assert(floorContact.length && floorContact.every(item => item.name === 'pad-rubber-base'), 'The actual lower pad must rest on the desk');
  const padContactSquareMetres = floorContact.reduce((sum, item) => sum + item.area, 0);
  const mouseContactSquareMetres = [...mouseFeet.values()].reduce((sum, area) => sum + area, 0);
  assert(padContactSquareMetres > .024 && mouseContactSquareMetres > .0008, 'Expected positive-area desk and device contact');
  return { meshes, triangles: geometry.length, meshCount: meshes.size, materialCount: materials.size,
    geometrySha256: hash(geometry.sort().join('\n')), bodySha256: hash(body.sort().join('\n')), padSha256: hash(pad.sort().join('\n')),
    padContactSquareMetres: round(padContactSquareMetres), mouseContactSquareMetres: round(mouseContactSquareMetres) };
}

function topHit(objects, x, z) {
  const hit = ray(x, z).intersectObjects(objects, false)[0];
  assert(hit, `Expected a top surface at ${x},${z}`);
  assert(hit.face.normal.clone().applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld)).y > 0,
    'The top ray must hit a correctly outward-facing surface');
  return hit;
}

export async function inspectMousePadAsset(bytes, resource, design) {
  const { scene, animations } = await loadGlb(bytes);
  assert.equal(animations.length, 0);
  assert.equal(resource.mounting.reserveDesktopArea, true);
  const bounds = boundsOf(scene), limits = resource.mounting;
  near(bounds.min.y, 0);
  assert(bounds.min.x >= -limits.width / 2 - tolerance && bounds.max.x <= limits.width / 2 + tolerance &&
    bounds.min.z >= -limits.depth / 2 - tolerance && bounds.max.z <= limits.depth / 2 + tolerance && bounds.max.y <= limits.height + tolerance,
    'Physical mouse or pad exceeds its reserved desktop envelope');
  const { meshes, ...report } = triangleReport(scene, design.pad.thickness);
  const mat = meshes.get('pad-fabric-face'), bottom = meshes.get('pad-rubber-base');
  assert(mat?.isMesh && bottom?.isMesh && mat.material !== bottom.material, 'The pad needs distinct fabric and rubber geometry');
  const padSize = boundsOf(bottom).getSize(new Vector3());
  near(padSize.x, design.pad.width);
  near(padSize.z, design.pad.depth);
  for (const x of [-.32, .32]) for (const z of [-.32, .32])
    near(topHit([mat], x * padSize.x, z * padSize.z).point.y, design.pad.thickness);
  const body = [...meshes.values()].filter(mesh => mesh.name.startsWith('mouse-body-'));
  assert(body.length);
  for (const mesh of body) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      assert(ray(point.x, point.z).intersectObject(mat, false).length, 'Mouse body projects beyond its own support pad');
    }
  }
  const crownHeights = [-.059, -.03, .002, .022].map(z => round(topHit(body, 0, z).point.y));
  assert(Math.max(...crownHeights) > .025 && Math.max(...crownHeights) - Math.min(...crownHeights) > .004, 'Mouse should have a physical ergonomic crown');
  for (const [index, [x, z]] of design.buttons.entries()) {
    const button = meshes.get(index ? 'mouse-button-right' : 'mouse-button-left');
    assert(button?.isMesh && topHit([button, ...body], x, z).object === button, `${resource.id} button ${index} is not visible on the housing`);
  }
  const wheel = meshes.get('mouse-wheel');
  assert(wheel?.isMesh && topHit([wheel, ...body], ...design.wheel.at).object === wheel);
  const ball = meshes.get('mouse-trackball'), socket = meshes.get('mouse-trackball-socket');
  if (design.ball) {
    const [x, y, z] = design.ball.position;
    assert(ball?.isMesh && socket?.isMesh && topHit([ball, ...body], x, z).object === ball);
    near(boundsOf(ball).max.y, y + design.ball.radius);
    assert(boundsOf(ball).min.y < topHit(body, x, z).point.y, 'Ball must meet its housing');
  }
  validateCableResource(resource, fail);
  const contacts = validateCablePortGeometry(scene, resource, fail);
  assert(contacts.checked && contacts.ports.length === 1, 'Connector is not geometrically verified');
  const backing = meshes.get(resource.cablePortNodes.usb.backing);
  assert(body.some(mesh => boundsOf(mesh).intersectsBox(boundsOf(backing))), 'USB housing must meet the mouse body');
  for (const names of Object.values(resource.materialSlots))
    assert(names.length && names.every(name => meshes.has(name)));
  return { ...report, envelope: { min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round),
    size: bounds.getSize(new Vector3()).toArray().map(round) }, pad: [padSize.x, design.pad.thickness, padSize.z].map(round),
    crownProbesY: crownHeights, ball: ball ? boundsOf(ball).getSize(new Vector3()).toArray().map(round) : null, cable: contacts.ports[0] };
}

async function stockReuse(bytes, resource, design, source) {
  const archive = await read(source.path);
  assert.equal(hash(archive), resource.provenance.sourceArtifactSha256);
  const entries = unzipSync(archive, { filter: item => [source.entry, source.licenseEntry].includes(item.name) });
  assert.equal(hash(entries[source.entry]), resource.provenance.sourceGlbSha256);
  assert.equal(hash(entries[source.licenseEntry]), resource.provenance.sourceLicenseSha256);
  const { scene: sourceScene } = await loadGlb(entries[source.entry]);
  const { scene } = await loadGlb(bytes);
  let oldMesh;
  sourceScene.traverse(mesh => { if (mesh.isMesh && mesh.material.name === source.primitive) oldMesh = mesh; });
  const newMesh = scene.getObjectByName('mouse-body-stock');
  const oldGeometry = oldMesh.geometry.index ? oldMesh.geometry.toNonIndexed() : oldMesh.geometry.clone();
  oldGeometry.applyMatrix4(oldMesh.matrixWorld).rotateY(MathUtils.degToRad(design.body.sourceFit.yawDegrees));
  const original = oldGeometry.getAttribute('position'), actual = newMesh.geometry.getAttribute('position');
  const size = design.body.sourceFit.size;
  oldGeometry.computeBoundingBox();
  const originalBox = oldGeometry.boundingBox, previousSize = originalBox.getSize(new Vector3()), centre = originalBox.getCenter(new Vector3());
  const translation = new Vector3(design.body.sourceFit.centerX, design.pad.thickness, design.body.sourceFit.frontZ);
  assert.equal(original.count, actual.count);
  let error = 0;
  for (let i = 0; i < actual.count; i++) {
    const point = new Vector3().fromBufferAttribute(original, i);
    point.sub(vec([centre.x, originalBox.min.y, originalBox.min.z])).divide(previousSize).multiply(vec(size)).add(translation);
    error = Math.max(error, point.distanceTo(new Vector3().fromBufferAttribute(actual, i)));
  }
  assert(error < 1e-7, 'Native model vertices do not agree with the declared transformation');
  assert.deepEqual(Array.from(newMesh.geometry.getAttribute('uv').array), Array.from(oldGeometry.getAttribute('uv').array));
  assert.equal(newMesh.material.metalness, oldMesh.material.metalness);
  assert.equal(newMesh.material.roughness, oldMesh.material.roughness);
  assert(newMesh.material.color.equals(oldMesh.material.color));
  return { source: source.entry, triangles: original.count / 3, preservedPBRAndUV: true, maximumVertexErrorMetres: error };
}

async function main([output, ...extra]) {
  if (!output || extra.length || output.startsWith('-')) throw Error('Usage: node scripts/company-platform/test-mouse-pad-assets.mjs NEW_OUTPUT_DIRECTORY');
  const target = path.resolve(output);
  await fs.mkdir(target);
  const collection = await data(family + '/collection.json'), recipe = await data(collection.sourceParameters);
  const variants = [];
  for (const record of collection.resources) {
    const design = recipe.designs.find(item => item.id === record.id && item.version === record.version);
    const resource = await data(record.resourcePath), bytes = await read(record.modelPath);
    assert.equal(hash(bytes), resource.asset.sha256);
    if (variants.length) assert(compareFacilityFunction(variants[0].resource, resource).compatible);
    const geometry = await inspectMousePadAsset(bytes, resource, design);
    const stock = design.source && await stockReuse(bytes, resource, design, recipe.sources[design.source]);
    variants.push({ resource, geometry, ...(stock ? { stock } : {}) });
  }
  assert.equal(variants.length, 4);
  for (const field of ['bodySha256', 'padSha256']) assert.equal(new Set(variants.map(item => item.geometry[field])).size, 4);
  const report = path.join(target, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', variants }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', variants: variants.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
