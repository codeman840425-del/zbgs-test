import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { baseFront, designIds, doorFrameParts, outerFront } from '../../assets-source/company-door-frame-correction-v2/designs.mjs';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    }).catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-door-frame-correction-v2/designs.mjs';
const generatorPath = 'scripts/company-platform/build-door-frame-correction-v2.mjs';
const publicPath = 'prototype/public/company-assets/door-frame-correction-v2';
const verify = process.argv.includes('--verify');
const epsilon = 1e-6;
const axes = [0, 1, 2];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => fs.readFile(new URL(path, root));
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const readModel = glb => new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const near = (a, b) => Math.abs(a - b) <= epsilon;

function surfaceGeometry(parts) {
  // Split at the authored box planes. Each occupied cell contributes only faces
  // adjacent to empty space. The touching relief and frame therefore share one shell.
  const cuts = axes.map(axis => [...new Set(parts.flatMap(part => [part.min[axis], part.max[axis]]))].sort((a, b) => a - b));
  const cells = new Map();
  for (const part of parts) {
    const start = axes.map(axis => cuts[axis].indexOf(part.min[axis]));
    const end = axes.map(axis => cuts[axis].indexOf(part.max[axis]));
    for (let x = start[0]; x < end[0]; x++) {
      for (let y = start[1]; y < end[1]; y++) {
        for (let z = start[2]; z < end[2]; z++) {
          const cell = [x, y, z];
          assert(!cells.has(cell.join(',')), `${part.name} overlaps another solid`);
          cells.set(cell.join(','), { cell, part });
        }
      }
    }
  }
  const surfaces = new Map(parts.map(part => [part, { position: [], normal: [], index: [] }]));
  for (const { cell, part } of cells.values()) {
    const surface = surfaces.get(part);
    for (const axis of axes) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const side of [-1, 1]) {
        const neighbour = [...cell];
        neighbour[axis] += side;
        if (cells.has(neighbour.join(','))) continue;
        const faceIndex = surface.position.length / 3;
        const plane = cuts[axis][cell[axis] + Number(side === 1)];
        for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const point = [0, 0, 0], normal = [0, 0, 0];
          point[axis] = plane;
          point[u] = cuts[u][cell[u] + du];
          point[v] = cuts[v][cell[v] + dv];
          normal[axis] = side;
          surface.position.push(...point);
          surface.normal.push(...normal);
        }
        const winding = side === 1 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        surface.index.push(...winding.map(index => faceIndex + index));
      }
    }
  }
  return surfaces;
}

async function exportFrame(id, front) {
  const parts = doorFrameParts(id, front);
  const group = new THREE.Group();
  group.name = id;
  for (const [part, surface] of surfaceGeometry(parts)) {
    assert(surface.index.length, `${part.name} has no exposed surfaces`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(surface.normal, 3));
    geometry.setIndex(surface.index);
    const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: part.roughness });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    group.add(mesh);
  }
  try {
    return Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true }));
  } finally {
    group.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  }
}

function meshFaces(scene) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(node => {
    if (node.isMesh) meshes.push(node);
  });
  return meshes.map(mesh => {
    const name = mesh.userData.name ?? mesh.name;
    const triangles = [], rectangles = [];
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = index?.count ?? positions.count;
    assert(count > 0 && count % 6 === 0, `${mesh.name} must consist of triangle pairs`);
    for (let start = 0; start < count; start += 6) {
      const vertices = Array.from({ length: 6 }, (_, offset) => new THREE.Vector3()
        .fromBufferAttribute(positions, index ? index.getX(start + offset) : start + offset).applyMatrix4(mesh.matrixWorld));
      const pair = [new THREE.Triangle(...vertices.slice(0, 3)), new THREE.Triangle(...vertices.slice(3))];
      const box = new THREE.Box3().setFromPoints(vertices);
      const min = box.min.toArray(), max = box.max.toArray();
      const axis = axes.find(axis => near(min[axis], max[axis]));
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const normal = pair[0].getNormal(new THREE.Vector3()).getComponent(axis);
      const area = (max[u] - min[u]) * (max[v] - min[v]);
      assert(axis !== undefined && area > epsilon && near(Math.abs(normal), 1), `${mesh.name} has a nonrectangular face`);
      assert(near(normal, pair[1].getNormal(new THREE.Vector3()).getComponent(axis)));
      assert(near(pair[0].getArea() + pair[1].getArea(), area));
      rectangles.push({ axis, normal, min, max });
      triangles.push(...pair);
    }
    const box = new THREE.Box3().setFromObject(mesh, true);
    return { mesh, name, triangles, rectangles, min: box.min.toArray(), max: box.max.toArray() };
  });
}

function positiveAreaOverlap(rectangles) {
  let pairs = 0, area = 0;
  for (const [index, a] of rectangles.entries()) {
    for (let next = index + 1; next < rectangles.length; next++) {
      const b = rectangles[next], axis = a.axis;
      if (b.axis !== axis || !near(a.min[axis], b.min[axis])) continue;
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const overlap = dim => Math.min(a.max[dim], b.max[dim]) - Math.max(a.min[dim], b.min[dim]);
      const du = overlap(u), dv = overlap(v);
      if (du > epsilon && dv > epsilon) {
        pairs++;
        area += du * dv;
      }
    }
  }
  return { pairs, area };
}

function assertClosedShell(triangles) {
  const edges = new Map();
  const key = vertex => vertex.toArray().map(value => Math.round(value / epsilon)).join(',');
  for (const { a, b, c } of triangles) {
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const from = key(start), to = key(end), forward = from < to;
      const id = forward ? `${from}:${to}` : `${to}:${from}`;
      const edge = edges.get(id) ?? { count: 0, winding: 0 };
      edge.count++;
      edge.winding += forward ? 1 : -1;
      edges.set(id, edge);
    }
  }
  for (const edge of edges.values()) assert(edge.count === 2 && edge.winding === 0, 'Shell has an open, overlapping or inconsistently wound edge');
  return edges.size;
}

function verifyFrame(scene, id, front, referenceMeshes) {
  const parts = doorFrameParts(id, front), geometry = meshFaces(scene);
  assert.deepEqual(geometry.map(part => part.name), parts.map(part => part.name));
  const bounds = new THREE.Box3().setFromObject(scene, true);
  assert(bounds.min.toArray().every((value, axis) => near(value, [-.85, 0, 0][axis])));
  assert(bounds.max.toArray().every((value, axis) => near(value, [.85, 2.4, outerFront][axis])));
  const triangles = geometry.flatMap(part => part.triangles);
  const aperture = new THREE.Box3(new THREE.Vector3(-.7 + epsilon, epsilon, -.1), new THREE.Vector3(.7 - epsilon, 2.2 - epsilon, .2));
  assert(triangles.every(triangle => !aperture.intersectsTriangle(triangle)), `${id} intrudes into the clear opening`);
  const overlap = positiveAreaOverlap(geometry.flatMap(part => part.rectangles));
  assert.equal(overlap.pairs, 0, `${id} has double surfaces on the same plane`);
  const closedEdges = assertClosedShell(triangles);
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(0, 0, -1);
  const meshes = geometry.map(part => part.mesh);

  for (const [index, measured] of geometry.entries()) {
    const part = parts[index], reference = referenceMeshes[index];
    for (const bound of ['min', 'max']) {
      assert(measured[bound].every((value, axis) => near(value, part[bound][axis])), `${part.name} bounds changed`);
      assert(measured[bound].slice(0, 2).every((value, axis) => near(value, reference[bound][axis])), `${part.name} changed v1 XY outline`);
    }
    assert(measured.mesh.material.color.equals(reference.mesh.material.color), `${part.name} changed v1 color`);
    assert(near(measured.mesh.material.roughness, reference.mesh.material.roughness), `${part.name} changed v1 roughness`);
    const exposedFront = measured.rectangles.filter(face => face.axis === 2 && face.normal > 0);
    assert(exposedFront.length && exposedFront.every(face => near(face.min[2], part.max[2])));
    // Aim at the centre of an actual exterior face to identify the first visible surface.
    const [face] = exposedFront;
    raycaster.set(origin.set((face.min[0] + face.max[0]) / 2, (face.min[1] + face.max[1]) / 2, 1), direction);
    const [hit] = raycaster.intersectObjects(meshes, false);
    assert(hit?.object === measured.mesh && near(hit.point.z, part.max[2]), `${part.name} front face occluded`);
  }

  return {
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    aperture: { width: 1.4, height: 2.2, toleranceMetres: epsilon },
    frontPlanes: { base: front, relief: outerFront },
    triangleCount: triangles.length,
    closedEdges,
    positiveAreaCoplanarPairs: overlap.pairs,
    materialMeshes: geometry.map(part => part.name),
  };
}

const sourceHash = hash(await read(sourcePath)), generatorHash = hash(await read(generatorPath));
const generated = new Map(), results = [], resources = [];
const referenceSourcePath = 'assets-source/company-architecture-collection/designs.mjs';
const referenceSourceHash = hash(await read(referenceSourcePath));
for (const id of designIds) {
  const referenceDir = `prototype/public/company-assets/architecture-collection/${id}/v1`;
  const reference = JSON.parse(await read(`${referenceDir}/resource.json`));
  const referenceGlb = await read(`${referenceDir}/model.glb`);
  assert.equal(hash(referenceGlb), reference.asset.sha256);
  assert.equal(reference.provenance.sourceParametersSha256, referenceSourceHash);
  const referenceMeshes = meshFaces((await readModel(referenceGlb)).scene);
  const previousFront = positiveAreaOverlap(referenceMeshes.flatMap(part => part.rectangles.filter(face => face.axis === 2 && face.normal > 0)));
  assert(previousFront.pairs > 0, `${id}@1 should reproduce overlapping front faces`);

  const glb = await exportFrame(id, baseFront);
  assert(glb.equals(await exportFrame(id, baseFront)), `${id} export changed between runs`);
  const measured = verifyFrame((await readModel(glb)).scene, id, baseFront, referenceMeshes);
  const editedFront = baseFront - .01;
  const editedGlb = await exportFrame(id, editedFront);
  assert(!glb.equals(editedGlb) && editedGlb.equals(await exportFrame(id, editedFront)), `${id} must export geometry changes deterministically`);
  verifyFrame((await readModel(editedGlb)).scene, id, editedFront, referenceMeshes);

  const dir = `${publicPath}/${id}/v2`;
  const resource = {
    ...reference,
    version: 2,
    asset: {
      format: 'glb',
      url: `/company-assets/door-frame-correction-v2/${id}/v2/model.glb`,
      sha256: hash(glb),
      bytes: glb.length,
    },
    provenance: {
      ...reference.provenance,
      sourceParameters: sourcePath,
      sourceParametersSha256: sourceHash,
      generator: generatorPath,
      generatorSha256: generatorHash,
      tools: [`Three.js ${THREE.REVISION}`, 'GLTFExporter', 'GLTFLoader'],
      reference: `${id}@1`,
      referenceAssetSha256: reference.asset.sha256,
      referenceSourceParametersSha256: referenceSourceHash,
    },
  };
  assert(compareFacilityFunction(reference, resource).compatible);
  assert.deepEqual(measured.materialMeshes, resource.materialSlots.construction);
  generated.set(`${dir}/model.glb`, glb);
  generated.set(`${dir}/resource.json`, json(resource));
  resources.push(`${dir}/resource.json`);
  results.push({
    id, version: resource.version, asset: resource.asset, resourcePath: `${dir}/resource.json`,
    referenceAssetSha256: reference.asset.sha256, previousPositiveAreaCoplanarFront: previousFront,
    measured, functionCompatible: true, repeatByteIdentical: true,
    testedParameterChange: { baseFront: editedFront, sha256: hash(editedGlb), repeatByteIdentical: true },
  });
}
assert.equal(new Set(results.map(result => result.asset.sha256)).size, designIds.length);
generated.set('assets-source/company-door-frame-correction-v2/collection.json', json({ resources }));
generated.set('evidence/company-door-frame-correction-v2/report.json', json({
  status: 'passed',
  scope: 'Asset-local CPU readback of project GLBs, material bindings and deterministic regeneration',
  referenceSourcePath, referenceSourceHash, sourcePath, sourceHash, generatorPath, generatorHash,
  previousVisualEvidence: 'evidence/company-entrance-release-2d3/browser-final/02-door-frame-crown.png',
  results,
}));

for (const [path, bytes] of generated) {
  if (verify) {
    assert(bytes.equals(await read(path)), `${path} differs from a fresh deterministic export`);
  } else {
    const file = new URL(path, root);
    await fs.mkdir(new URL('./', file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
}
for (const { id, version, asset, measured } of results) {
  console.log(`${id}@${version} ${asset.sha256} ${asset.bytes} bytes, ${measured.triangleCount} triangles`);
}
