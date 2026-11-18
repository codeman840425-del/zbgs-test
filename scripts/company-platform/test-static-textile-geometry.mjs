import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Euler, Matrix4, MathUtils, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { digest, loadTextileStock, parseTextileGlb, projectPath } from './build-static-textile-model.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tolerance = 1e-6;
const round = number => Number(number.toFixed(8));
const read = file => fs.readFile(projectPath(root, file));
const boundsOf = object => new Box3().setFromObject(object, true);
const sizeOf = object => boundsOf(object).getSize(new Vector3());

function inspectTriangles(scene) {
  const signatures = [], groundedTriangles = new Map(), materials = new Set(), meshes = new Map();
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert(mesh.material.isMeshStandardMaterial && mesh.material.opacity === 1 && !mesh.material.transparent, `${mesh.name}: expected opaque textile PBR`);
    assert(mesh.name && !meshes.has(mesh.name), 'Each textile mesh must have a stable unique name');
    meshes.set(mesh.name, mesh);
    materials.add(mesh.material);
    const points = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const count = index?.count ?? points.count;
    assert.equal(count % 3, 0);
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(delta => new Vector3().fromBufferAttribute(points, index?.getX(i + delta) ?? i + delta).applyMatrix4(mesh.matrixWorld));
      assert(vertices.every(vertex => vertex.toArray().every(Number.isFinite)));
      const id = vertices.map(vertex => vertex.toArray().map(round).join(',')).sort().join('|');
      signatures.push(id);
      if (vertices.every(vertex => Math.abs(vertex.y) <= tolerance)) {
        const [a, b, c] = vertices;
        const projection = -b.clone().sub(a).cross(c.clone().sub(a)).y / 2;
        if (projection > 1e-9) groundedTriangles.set(id, { mesh: mesh.name, area: projection });
      }
    }
  });
  assert(signatures.length > 0 && signatures.length <= 2500 && meshes.size <= 16 && materials.size <= 4, 'Textile exceeds geometry budget');
  const contacts = {};
  for (const { mesh, area } of groundedTriangles.values()) contacts[mesh] = (contacts[mesh] ?? 0) + area;
  const contactArea = Object.values(contacts).reduce((a, b) => a + b, 0);
  assert(contactArea > .006, 'Textile has no meaningful positive-area physical bottom contact');
  return { meshes, triangles: signatures.length, meshCount: meshes.size, materialCount: materials.size,
    geometrySha256: digest(signatures.sort().join('\n')), contactAreaSquareMetres: round(contactArea), contactMeshes: contacts };
}

function inspectCushion(meshes) {
  const cushion = meshes.get('pillow-native-cushion');
  assert(cushion?.isMesh && meshes.has('pillow-button') && meshes.has('pillow-piping'));
  const bounds = sizeOf(cushion);
  assert(bounds.x >= .28 && bounds.y > .06 && bounds.z >= .26 && bounds.y < .13, 'Cushion must show loft and an actual three-dimensional shape');
  return { cushion: bounds.toArray().map(round), piping: sizeOf(meshes.get('pillow-piping')).toArray().map(round) };
}

function inspectThrow(meshes) {
  const cloth = meshes.get('throw-folded-ribbon'), fringe = meshes.get('throw-fringe');
  assert(cloth?.isMesh && fringe?.isMesh && meshes.has('throw-woven-stripes'));
  const origin = new Vector3(.037, 1, 0);
  const ray = new Raycaster(origin, new Vector3(0, -1, 0));
  const layerHeights = [...new Set(ray.intersectObject(cloth, false).map(hit => round(hit.point.y)))];
  assert(layerHeights.length >= 3 && layerHeights[0] - layerHeights.at(-1) > .04, 'A physical folded throw must have separate horizontal passes');
  assert(sizeOf(fringe).y > .017 && sizeOf(fringe).z > .025, 'The throw must carry an exposed hanging fringe');
  return { exposedLayerHeights: layerHeights, fringe: sizeOf(fringe).toArray().map(round) };
}

function inspectCover(meshes) {
  const flap = meshes.get('cover-native-outer-flap');
  const cuff = meshes.get('cover-gathered-cuff');
  assert(flap?.isMesh && cuff?.isMesh && meshes.has('cover-compressed-layers') && meshes.has('cover-elastic-hem'));
  assert(sizeOf(flap).y > .045, 'Native cover flap needs actual downward returns');
  assert(sizeOf(cuff).z > .015 && sizeOf(cuff).y > .027, 'Gathered cuff must have visible physical folds');
  return { coverFlap: sizeOf(flap).toArray().map(round), gatheredCuff: sizeOf(cuff).toArray().map(round) };
}

function inspectMat(meshes, scene) {
  const mat = meshes.get('mat-continuous-scroll');
  const roll = scene.getObjectByName('mat-roll-axis');
  assert(mat?.isMesh && roll && meshes.has('mat-edge-binding') && meshes.has('mat-inset-border'));
  const centre = roll.getWorldPosition(new Vector3());
  const hit = y => {
    const ray = new Raycaster(new Vector3(1, centre.y + y, centre.z), new Vector3(-1, 0, 0));
    return ray.intersectObject(mat, false).length > 0;
  };
  assert(!hit(0) && !hit(.006) && !hit(-.006), 'Rolled mat must have an open, real core from the side');
  const layerRadii = [];
  let occupied = false;
  for (let i = 8; i <= 46; i++) {
    const y = i / 1000;
    const next = hit(y);
    if (next && !occupied) layerRadii.push(y);
    occupied = next;
  }
  assert(layerRadii.length >= 2, 'Rolled mat must have multiple visible layers around its core');
  return { openRollCentre: centre.toArray().map(round), visibleLayerRadiiMetres: layerRadii };
}

const checks = {
  'piped-cushion': inspectCushion, 'fringed-throw': inspectThrow, 'gathered-cover': inspectCover, 'rolled-mat': inspectMat,
};

export async function inspectTextileGeometry(bytes, mounting, construction) {
  const { scene, animations } = await parseTextileGlb(bytes);
  assert.equal(animations.length, 0, 'The installed shape must be fixed');
  const bounds = boundsOf(scene);
  const measured = bounds.getSize(new Vector3());
  assert(Math.abs(bounds.min.y) < tolerance && bounds.getCenter(new Vector3()).setY(0).length() < tolerance,
    'Expected the actual textile to rest at the bottom-centred mounting origin');
  assert(measured.x <= mounting.width + tolerance && measured.y <= mounting.height + tolerance && measured.z <= mounting.depth + tolerance,
    'Actual textile exceeds its common mounting envelope');
  const { meshes, ...geometry } = inspectTriangles(scene);
  assert(checks[construction], `Unknown textile geometry ${construction}`);
  const shape = checks[construction](meshes, scene);
  return { ...geometry, ...shape, envelope: { min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round),
    size: measured.toArray().map(round) } };
}

async function verifyNativeFabric(asset, parameters, design) {
  const source = parameters.sources[design.source];
  const stock = await loadTextileStock(root, source, parameters.archives[source.archive]);
  const { scene } = await parseTextileGlb(asset);
  const name = design.construction === 'piped-cushion' ? 'pillow-native-cushion' : 'cover-native-outer-flap';
  const native = scene.getObjectByName(name);
  const orientation = new Euler(...(design.parts.sourceRotateDegrees ?? [0, 0, 0]).map(MathUtils.degToRad));
  stock.geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(orientation));
  const geometry = native.geometry;
  const inputs = [stock.geometry, geometry].map(mesh => {
    mesh.computeBoundingBox();
    return { positions: mesh.getAttribute('position'), uv: mesh.getAttribute('uv'),
      origin: mesh.boundingBox.min.clone(), extents: mesh.boundingBox.getSize(new Vector3()), index: mesh.getIndex() };
  });
  const count = inputs[0].index?.count ?? inputs[0].positions.count;
  assert.equal(inputs[1].index?.count ?? inputs[1].positions.count, count);
  assert.equal(Boolean(inputs[0].uv), Boolean(inputs[1].uv));
  let largestNormalisedError = 0;
  for (let i = 0; i < count; i++) {
    const [a, b] = inputs.map(({ index, positions, origin, extents }) =>
      new Vector3().fromBufferAttribute(positions, index?.getX(i) ?? i).sub(origin).divide(extents));
    largestNormalisedError = Math.max(largestNormalisedError, a.distanceTo(b));
    if (inputs[0].uv) {
      const uvs = inputs.map(({ index, uv }) => {
        const j = index?.getX(i) ?? i;
        return [uv.getX(j), uv.getY(j)];
      });
      assert.deepEqual(...uvs);
    }
  }
  assert(largestNormalisedError < 2e-6, 'The fitted native shape changed triangle coordinates beyond rotation and scale');
  assert.equal(native.material.metalness, stock.material.metalness);
  assert.equal(native.material.roughness, stock.material.roughness);
  for (const channel of ['r', 'g', 'b']) assert(Math.abs(native.material.color[channel] - stock.material.color[channel]) < tolerance);
  return { sourceEntry: source.entry, triangles: count / 3, largestNormalisedError, sourcePBR: true, nativeUV: Boolean(inputs[0].uv) };
}

async function main([output, ...extra]) {
  if (!output || extra.length || output.startsWith('-')) throw new Error('Usage: node scripts/company-platform/test-static-textile-geometry.mjs NEW_OUTPUT_DIRECTORY');
  const directory = path.resolve(output);
  await fs.mkdir(directory);
  const collection = JSON.parse(await read('assets-source/company-static-textile-v1/collection.json'));
  const recipe = JSON.parse(await read(collection.sourceParameters));
  const textiles = [];
  for (const record of collection.resources) {
    const resource = JSON.parse(await read(record.resourcePath));
    const asset = await read(record.modelPath);
    assert.equal(digest(asset), resource.asset.sha256);
    if (textiles.length) assert(compareFacilityFunction(textiles[0].resource, resource).compatible);
    assert.deepEqual(resource.stateDefaults, {});
    assert.equal(resource.mount, 'support-surface');
    assert.equal(resource.footprint.blocking, false);
    const result = { resource, geometry: await inspectTextileGeometry(asset, resource.mounting, record.construction) };
    const design = recipe.designs.find(item => item.id === resource.id && item.version === resource.version);
    if (design.source) result.nativeFabric = await verifyNativeFabric(asset, recipe, design);
    textiles.push(result);
  }
  assert.equal(textiles.length, 4);
  assert.equal(new Set(textiles.map(item => item.geometry.geometrySha256)).size, 4);
  const report = path.join(directory, 'report.json');
  await fs.writeFile(report, JSON.stringify({ status: 'passed', textiles }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', textiles: textiles.length, report }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
