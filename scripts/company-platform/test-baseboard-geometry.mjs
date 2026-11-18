import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { Box3, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { describeArchitecture } from '../../prototype/src/company/architecture.js';
import { createBaseboardGeometry, describeBaseboardRuns } from '../../prototype/src/company/baseboard-geometry.js';
import { deriveCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import { createCompanyScaleV2 } from '../../prototype/src/company/scale-v2.js';

const root = new URL('../../', import.meta.url);
const destination = new URL('output/baseboard-geometry/', root);
const square = [[0, 0], [.02, 0], [.02, .12], [0, .12]];
const profiles = {
  square,
  reveal: [[0, 0], [.02, 0], [.02, .100], [.010, .100], [.010, .109], [.02, .109], [.02, .12], [0, .12]],
  wood: [[0, 0], [.02, 0], [.02, .113], [.019, .117], [.016, .12], [0, .12]],
  stone: [[0, 0], [.02, 0], [.02, .113], [.013, .12], [0, .12]],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (actual, expected, tolerance = 1e-6) => assert(Math.abs(actual - expected) < tolerance, actual + ' != ' + expected);
const nearVector = (actual, expected) => actual.forEach((point, axis) => near(point, expected[axis]));
const documentOptions = { catalog, templates };
const mat = new MeshBasicMaterial();

function roomArchitecture(document, roomId) {
  const room = document.nodes.find(node => node.id === roomId);
  const architecture = describeArchitecture(document, catalog, templates);
  const before = structuredClone(architecture);
  const placement = inspectCompanyPlacement(document, catalog, templates);
  const derived = deriveCompany(document, catalog, templates);
  const runs = describeBaseboardRuns(room, architecture.walls, derived.facilities);
  assert.deepEqual(architecture, before);
  assert.deepEqual(inspectCompanyPlacement(document, catalog, templates), placement);
  assert.equal(new Set(runs.map(run => run.id)).size, runs.length);
  for (const run of runs) {
    assert(architecture.visibilityWalls.some(wall => wall.id === run.physicalBoundary && wall.edge === run.edge));
    near(new Vector3(...run.start).distanceTo(new Vector3(...run.end)), run.uEnd - run.uStart);
  }
  return { room, architecture, derived, placement, runs };
}

function firstHit(mesh, origin, direction) {
  mesh.updateWorldMatrix(true, true);
  return new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, 1).intersectObject(mesh, true)[0];
}

function geometryChecks(geometry) {
  const { position, normal, uv } = geometry.attributes;
  assert.equal(position.count % 3, 0);
  assert.equal(position.count, normal.count);
  assert.equal(position.count, uv.count);
  const edges = new Map();
  const key = vector => vector.toArray().map(value => Math.round(value * 1e6)).join(',');
  const vertex = index => new Vector3().fromBufferAttribute(position, index);
  for (let index = 0; index < position.count; index += 3) {
    const a = vertex(index), b = vertex(index + 1), c = vertex(index + 2);
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    assert(face.length() > 1e-10, 'Degenerate triangle');
    face.normalize();
    for (const [offset, from, to] of [[0, a, b], [1, b, c], [2, c, a]]) {
      const direction = new Vector3().fromBufferAttribute(normal, index + offset);
      near(direction.length(), 1);
      near(face.dot(direction), 1);
      assert([uv.getX(index + offset), uv.getY(index + offset)].every(Number.isFinite));
      const endpoints = [key(from), key(to)];
      const edge = endpoints.slice().sort().join('/');
      const incidence = edges.get(edge) || [];
      incidence.push(endpoints[0] < endpoints[1]);
      edges.set(edge, incidence);
    }
  }
  assert([...edges.values()].every(incidence => incidence.length === 2 && incidence[0] !== incidence[1]),
    'Expected a closed mesh with consistent triangle winding');
  return { vertices: position.count, triangles: position.count / 3,
    renderedGeometrySha256: hash(Buffer.from(position.array.buffer)) };
}

const singleId = 'baseboard-single';
const singleRoom = singleId + '/ground/live';
const singleInput = {
  id: singleId, spaceProfile: { id: 'company-space-v2', version: 1 }, scale: 'small-home',
  floors: [{
    id: 'ground',
    exteriorEntrances: [{ id: 'south-entry', regionId: 'live', edge: 'south', offset: -.35, width: 1.4, height: 2.2 }],
    rooms: [{
      id: 'live', purpose: 'streaming', stations: 0, furniture: [
        { id: 'window', resource: { id: 'window-opening-square-basic', version: 1 }, transform: { position: [.55, 1.42, -1.9], yaw: 0 } },
        { id: 'frame', resource: { id: 'door-frame-plain', version: 1 }, transform: { position: [-.35, 0, 1.9], yaw: Math.PI } },
      ],
    }],
  }],
};
const singleDoc = createCompanyScaleV2(singleInput, catalog, templates);
const single = roomArchitecture(singleDoc, singleRoom);
const [north] = single.runs.filter(run => run.edge === 'north');
assert.equal(single.runs.length, 5);
assert.equal(single.runs.filter(run => run.edge === 'north').length, 1);
assert.equal(single.architecture.walls.filter(wall => wall.sourceWallId === north.physicalBoundary && wall.position[1] < .6).length, 3);
nearVector(north.start, [-2.15, 0, -1.9]);
nearVector(north.end, [2.15, 0, -1.9]);
assert(north.mitreStart && north.mitreEnd);
const south = single.runs.filter(run => run.edge === 'south');
assert.equal(south.length, 2);
nearVector(south[0].start, [2.15, 0, 1.9]);
nearVector(south[0].end, [.50, 0, 1.9]);
nearVector(south[1].start, [-1.2, 0, 1.9]);
nearVector(south[1].end, [-2.15, 0, 1.9]);
assert.deepEqual(south.map(run => [run.mitreStart, run.mitreEnd]), [[true, false], [false, true]]);

const frame = single.derived.facilities.find(entry => entry.id === singleRoom + '/frame');
const frameBytes = await fs.readFile(new URL('prototype/public' + frame.resource.asset.url, root));
assert.equal(hash(frameBytes), frame.resource.asset.sha256);
const frameScene = (await new GLTFLoader().parseAsync(Uint8Array.from(frameBytes).buffer, '')).scene;
frameScene.position.fromArray(frame.node.transform.position);
frameScene.rotation.y = frame.node.transform.yaw;
frameScene.updateMatrixWorld(true);
const outerFoot = new Box3();
frameScene.traverse(mesh => {
  if (!mesh.isMesh) return;
  const positions = mesh.geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const point = new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    if (point.y <= .12 + 1e-6) outerFoot.expandByPoint(point);
  }
});
near(outerFoot.min.x, south[1].start[0]);
near(outerFoot.max.x, south[0].end[0]);

const geometries = new Map();
for (const run of single.runs) geometries.set(run.id, createBaseboardGeometry(run, square));
const northMesh = new Mesh(geometries.get(north.id), mat);
for (const x of [-1.5, .55, 1.7]) {
  const hit = firstHit(northMesh, [x, .06, -1.6], [0, 0, -1]);
  nearVector(hit.point.toArray(), [x, .06, -1.88]);
  nearVector(hit.face.normal.toArray(), [0, 0, 1]);
}
const top = firstHit(northMesh, [.55, .4, -1.89], [0, -1, 0]);
near(top.point.y, .12);
nearVector(top.face.normal.toArray(), [0, 1, 0]);
const northAttrs = northMesh.geometry.attributes;
for (let index = 0; index < northAttrs.position.count; index++) {
  if (northAttrs.normal.getZ(index) > .999) near(northAttrs.uv.getX(index), northAttrs.position.getX(index) + 2.25);
}

const southMesh = new Group();
for (const run of south) southMesh.add(new Mesh(geometries.get(run.id), mat));
for (const x of [-1.1, -1.05, -.35, .35, .4]) assert.equal(firstHit(southMesh, [x, .06, 1.6], [0, 0, 1]), undefined);
assert(firstHit(southMesh, [.55, .06, 1.6], [0, 0, 1]));
assert(firstHit(southMesh, [-1.25, .06, 1.6], [0, 0, 1]));

const west = single.runs.find(run => run.edge === 'west');
const [cornerX, , cornerZ] = north.start;
const cornerVertices = (geometry, expectedNormal) => {
  const { position, normal } = geometry.attributes;
  const found = new Set();
  for (let index = 0; index < position.count; index++) {
    const v = new Vector3().fromBufferAttribute(position, index), n = new Vector3().fromBufferAttribute(normal, index);
    if (n.dot(expectedNormal) < .999999) continue;
    near(v.x - cornerX, v.z - cornerZ);
    found.add(v.toArray().map(value => Math.round(value * 1e6)).join(','));
  }
  assert.equal(found.size, 4, 'Expected a real diagonal endcap at the internal corner');
  return [...found].sort();
};
const cornerNormal = new Vector3(-1, 0, 1).normalize();
assert.deepEqual(cornerVertices(geometries.get(north.id), cornerNormal),
  cornerVertices(geometries.get(west.id), cornerNormal.clone().negate()));

const profileEvidence = Object.entries(profiles).map(([name, profile]) => {
  const geometry = createBaseboardGeometry(north, profile);
  const result = geometryChecks(geometry);
  const reversed = createBaseboardGeometry(north, [profile[0], ...profile.slice(1).reverse()]);
  assert.deepEqual(reversed.attributes.position.array, geometry.attributes.position.array);
  reversed.dispose();
  const mesh = new Mesh(geometry, mat);
  result.outer = firstHit(mesh, [.55, .06, -1.6], [0, 0, -1]).point.z + 1.9;
  result.upper = firstHit(mesh, [.55, .105, -1.6], [0, 0, -1]).point.z + 1.9;
  result.nose = firstHit(mesh, [.55, .118, -1.6], [0, 0, -1]).point.z + 1.9;
  geometry.dispose();
  return { name, ...result };
});
assert.equal(new Set(profileEvidence.map(profile => profile.renderedGeometrySha256)).size, 4);
near(profileEvidence.find(profile => profile.name === 'reveal').upper, .010);
near(profileEvidence.find(profile => profile.name === 'square').upper, .020);
assert(profileEvidence.find(profile => profile.name === 'wood').nose > profileEvidence.find(profile => profile.name === 'stone').nose);
assert.throws(() => createBaseboardGeometry(north, [[0, 0], [.02, .12], [.02, 0], [0, .12]]), /cross or touch/);
assert.throws(() => createBaseboardGeometry(north, [...square, square[0]]), /distinct/);
assert.throws(() => createBaseboardGeometry(north, [[0, 0], [.03, 0], [.02, .12]]), /must be within/);
const redundant = createBaseboardGeometry(north, [square[0], [.01, 0], ...square.slice(1)]);
assert.deepEqual(redundant.attributes.position.array, northMesh.geometry.attributes.position.array);
redundant.dispose();
const narrowRecess = [[0, 0], [.02, 0], [.02, .101], [.019996, .101], [.019996, .1018], [.02, .1018], [.02, .12], [0, .12]];
const narrow = createBaseboardGeometry(north, narrowRecess);
const recessHit = firstHit(new Mesh(narrow, mat), [.55, .1014, -1.6], [0, 0, -1]);
near(recessHit.point.z + 1.9, .019996);
narrow.dispose();

const closeToCorner = structuredClone(singleInput);
closeToCorner.floors[0].exteriorEntrances[0].offset = 1.29;
closeToCorner.floors[0].rooms[0].furniture.find(item => item.id === 'frame').transform.position[0] = 1.29;
const shortCorner = roomArchitecture(createCompanyScaleV2(closeToCorner, catalog, templates), singleRoom);
const shortSouth = shortCorner.runs.filter(run => run.edge === 'south');
assert.equal(shortSouth.length, 1, 'The 10 mm wall foot cannot carry a 20 mm miter');
const cappedEast = shortCorner.runs.find(run => run.edge === 'east');
assert.equal(cappedEast.mitreEnd, false);
nearVector(cappedEast.end, [2.15, 0, 1.8]);
near(cappedEast.end[2], outerFoot.min.z);
const retreat = createBaseboardGeometry(cappedEast, square);
geometryChecks(retreat);
assert.equal(firstHit(new Mesh(retreat, mat), [1.95, .06, 1.85], [1, 0, 0]), undefined);
assert(firstHit(new Mesh(retreat, mat), [1.95, .06, 1.75], [1, 0, 0]));
retreat.dispose();

const rentalInput = JSON.parse(await fs.readFile(new URL('scripts/company-platform/space-v2-inputs/rental-home.json', root)));
const rental = createCompanyScaleV2(rentalInput, catalog, templates);
const rentalFloor = rental.id + '/ground';
const rotated = prepareCompanyChange(rental, [{
  type: 'move', id: rentalFloor, transform: { position: [1.25, 0, -.75], yaw: Math.PI / 2 },
}], documentOptions).document;
const shared = [];
for (const [name, edge, normalX, sign] of [['work', 'west', -2.15, 1], ['living', 'east', 2.15, -1]]) {
  const roomId = rentalFloor + '/' + name;
  const current = roomArchitecture(rotated, roomId), original = roomArchitecture(rental, roomId);
  assert.deepEqual(current.runs, original.runs, 'Changing the floor transform must retain the exact room-local profile');
  const door = current.placement.checkedPortals.find(point => point.regionId === roomId && Math.abs(point.center.local[0]) === 2.25 &&
    Math.abs(point.center.world[2] + 3) < 1e-6);
  nearVector(door.center.world, [1.25, 0, -3]);
  const boundary = current.runs.filter(run => run.edge === edge);
  assert.equal(boundary.length, 2);
  const jambEnds = [boundary[0].end, boundary[1].start].sort((a, b) => a[2] - b[2]);
  nearVector(jambEnds[0], [normalX, 0, -.70]);
  nearVector(jambEnds[1], [normalX, 0, .70]);
  const group = new Group();
  for (const run of boundary) group.add(new Mesh(createBaseboardGeometry(run, square), mat));
  const transform = current.derived.worlds.get(roomId);
  group.position.fromArray(transform.position);
  group.rotation.y = transform.yaw;
  group.updateMatrixWorld(true);
  const origin = z => group.localToWorld(new Vector3(normalX + sign * .25, .06, z)).toArray();
  const ray = new Vector3(-sign, 0, 0).transformDirection(group.matrixWorld).toArray();
  assert.equal(firstHit(group, origin(0), ray), undefined);
  const hit = firstHit(group, origin(1.1), ray);
  nearVector(group.worldToLocal(hit.point.clone()).toArray(), [normalX + sign * .02, .06, 1.1]);
  shared.push({ roomId, edge, runs: boundary, center: door.center, rayContact: hit.point.toArray() });
  group.traverse(object => object.geometry?.dispose());
}
assert.notEqual(shared[0].runs[0].physicalBoundary, shared[1].runs[0].physicalBoundary);
assert(Math.abs(shared[0].rayContact[2] - shared[1].rayContact[2]) > .2, 'Shared sides must have separate inward-facing trim');

for (const geometry of geometries.values()) geometry.dispose();
mat.dispose();
const report = { status: 'passed', single: { room: singleRoom, runs: single.runs, doorFrameAsset: frame.resource.asset.sha256,
  actualFrameFeet: { min: outerFoot.min.toArray(), max: outerFoot.max.toArray() }, profiles: profileEvidence },
  shortCorner: { omittedWidthMetres: .01, adjacentCap: cappedEast.end, setbackMetres: .10 }, shared };
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(new URL('report.json', destination), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, runs: single.runs.length, shapes: profileEvidence.length, sharedWalls: shared.length }));
