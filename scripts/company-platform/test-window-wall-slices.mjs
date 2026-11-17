import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { cutWallForWindows, WindowWallSliceError } from '../../prototype/src/company/window-wall-slices.js';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import { deriveCompany } from '../../prototype/src/company/document.js';
import { describeArchitecture } from '../../prototype/src/company/architecture.js';
import { makeRentalHome } from './build-home-examples.mjs';

const root = new URL('../../', import.meta.url);
const evidenceRoot = new URL('evidence/company-window-wall-slices-v1/', root);
const EPSILON = 1e-8;

function area(slice) { return (slice.edge === 'north' || slice.edge === 'south' ? slice.size[0] : slice.size[2]) * slice.size[1]; }
function assertThrows(code, fn) { assert.throws(fn, error => error instanceof WindowWallSliceError && error.code === code); }
function openingArea(openings) { return openings.reduce((sum, opening) => sum + opening.width * opening.height, 0); }
function checkNoHoleCoverage(slices, openings, span, height, centerAlong = 0) {
  for (const opening of openings) for (const slice of slices) {
    const sx = slice.edge === 'north' || slice.edge === 'south' ? slice.position[0] : slice.position[2];
    const sw = slice.edge === 'north' || slice.edge === 'south' ? slice.size[0] : slice.size[2];
    const sy = slice.position[1] - slice.size[1] / 2;
    const ex = opening.offset, ey = opening.bottom;
    const overlapX = Math.min(sx + sw / 2, ex + opening.width / 2) - Math.max(sx - sw / 2, ex - opening.width / 2);
    const overlapY = Math.min(sy + slice.size[1], ey + opening.height) - Math.max(sy, ey);
    assert(!(overlapX > EPSILON && overlapY > EPSILON), `slice ${slice.id} covers opening ${opening.id}`);
  }
  assert(slices.every(slice => {
    const along = slice.edge === 'north' || slice.edge === 'south' ? slice.position[0] : slice.position[2];
    return Math.abs(along - centerAlong) + (slice.edge === 'north' || slice.edge === 'south' ? slice.size[0] : slice.size[2]) / 2 <= span / 2 + EPSILON &&
      slice.position[1] - slice.size[1] / 2 >= -EPSILON && slice.position[1] + slice.size[1] / 2 <= height + EPSILON;
  }));
}

const horizontalWall = {
  id: 'room/wall-north-0', floorId: 'floor-1', regionId: 'room', edge: 'north',
  position: [0, 1.4, -3.45], size: [9, 2.8, .1], center: [10, 3.4, 20], halfSize: [4.5, .05],
};
const horizontalOpenings = [
  { id: 'window-left', regionId: 'room', edge: 'north', offset: -2.25, bottom: .8, width: 1.5, height: 1.2 },
  { id: 'window-right', regionId: 'room', edge: 'north', offset: 2.25, bottom: 1.1, width: 1.2, height: 1.0 },
];
const worldTransform = { position: [10, 2, 20], yaw: Math.PI / 2 };
const horizontalSlices = cutWallForWindows(horizontalWall, horizontalOpenings, worldTransform);
assert(horizontalSlices.length > 2);
assert.equal(new Set(horizontalSlices.map(slice => slice.sourceWallId)).size, 1);
assert.equal(horizontalSlices.filter(slice => slice.id === horizontalWall.id).length, 0);
assert(Math.abs(horizontalSlices.reduce((sum, slice) => sum + area(slice), 0) - (9 * 2.8 - openingArea(horizontalOpenings))) < EPSILON);
checkNoHoleCoverage(horizontalSlices, horizontalOpenings, 9, 2.8);
for (const slice of horizontalSlices) {
  assert.deepEqual(slice.center, [worldTransform.position[0] + slice.position[2], worldTransform.position[1] + slice.position[1], worldTransform.position[2] - slice.position[0]]);
  assert(slice.halfSize.every((value, index) => Math.abs(value - [slice.size[2] / 2, slice.size[0] / 2][index]) < EPSILON));
}

const verticalWall = {
  id: 'room/wall-east-0', floorId: 'floor-1', regionId: 'room', edge: 'east',
  position: [4.45, 1.4, 0], size: [.1, 2.8, 7], center: [4.45, 1.4, 0], halfSize: [.05, 3.5],
};
const verticalOpenings = [{ id: 'door', regionId: 'room', edge: 'east', offset: 0, bottom: 0, width: 1.4, height: 2.1 }];
const verticalSlices = cutWallForWindows(verticalWall, verticalOpenings, { position: [0, 0, 0], yaw: 0 });
assert(Math.abs(verticalSlices.reduce((sum, slice) => sum + area(slice), 0) - (7 * 2.8 - 1.4 * 2.1)) < EPSILON);
checkNoHoleCoverage(verticalSlices, verticalOpenings, 7, 2.8);
for (const [edge, size, position, yaw] of [
  ['south', [9, 2.8, .1], [0, 1.4, 3.45], Math.PI],
  ['west', [.1, 2.8, 7], [-4.45, 1.4, 0], -Math.PI / 2],
  ['east', [.1, 2.8, 7], [4.45, 1.4, 0], Math.PI / 2],
]) {
  const wall = { ...horizontalWall, id: `room/wall-${edge}-0`, edge, position, size,
    center: [0, 1.4, 0], halfSize: [edge === 'north' || edge === 'south' ? 4.5 : .05, edge === 'north' || edge === 'south' ? .05 : 3.5] };
  const opening = { ...horizontalOpenings[0], id: `${edge}-window`, edge };
  const slices = cutWallForWindows(wall, [opening], { position: [2, 1, -3], yaw });
  assert(Math.abs(slices.reduce((sum, slice) => sum + area(slice), 0) - (7 * 2.8 - 1.5 * 1.2)) < EPSILON ||
    Math.abs(slices.reduce((sum, slice) => sum + area(slice), 0) - (9 * 2.8 - 1.5 * 1.2)) < EPSILON);
}

// Use walls emitted by the actual architecture description. Their wall
// segments already account for portal gaps, and opening offsets remain in the
// room-edge coordinate frame rather than being relative to each segment.
const rental = makeRentalHome();
const rentalDerived = deriveCompany(rental, catalog, templates);
const describedWalls = describeArchitecture(rental, catalog, templates).walls;
for (const edge of ['north', 'south', 'west', 'east']) {
  const wall = describedWalls.find(candidate => candidate.edge === edge &&
    (edge === 'north' || edge === 'south' ? candidate.size[0] : candidate.size[2]) > 1.2);
  assert(wall, `architecture must emit a ${edge} wall segment`);
  const along = edge === 'north' || edge === 'south' ? wall.position[0] : wall.position[2];
  const span = edge === 'north' || edge === 'south' ? wall.size[0] : wall.size[2];
  const opening = { id: `test-window-${edge}`, regionId: wall.regionId, edge, offset: along, bottom: .8,
    width: Math.min(1, span * .5), height: .9 };
  const world = rentalDerived.worlds.get(wall.regionId);
  const transform = { position: world.position, yaw: edge === 'west' ? Math.PI / 2 : world.yaw };
  const slices = cutWallForWindows(wall, [opening], transform);
  assert(slices.length > 1);
  assert(slices.every(slice => slice.sourceWallId === wall.id && slice.halfSize.length === 2));
  assert(Math.abs(slices.reduce((sum, slice) => sum + area(slice), 0) - (span * wall.size[1] - opening.width * opening.height)) < EPSILON);
  checkNoHoleCoverage(slices, [opening], span, wall.size[1], along);
}

const unchanged = cutWallForWindows(horizontalWall, []);
assert.deepEqual(unchanged, horizontalWall);
assert.notEqual(unchanged, horizontalWall);
const snapshot = structuredClone(horizontalWall);
cutWallForWindows(horizontalWall, horizontalOpenings, worldTransform);
assert.deepEqual(horizontalWall, snapshot);

assertThrows('opening-outside-wall', () => cutWallForWindows(horizontalWall, [{ ...horizontalOpenings[0], offset: 5, id: 'outside' }], worldTransform));
assertThrows('overlapping-openings', () => cutWallForWindows(horizontalWall, [horizontalOpenings[0], { ...horizontalOpenings[0], id: 'overlap', offset: -1.8 }], worldTransform));
assertThrows('invalid-opening', () => cutWallForWindows(horizontalWall, [{ ...horizontalOpenings[0], bottom: Number.NaN }], worldTransform));
assertThrows('opening-wall-mismatch', () => cutWallForWindows(horizontalWall, [{ ...horizontalOpenings[0], edge: 'south' }], worldTransform));
assertThrows('invalid-world-transform', () => cutWallForWindows(horizontalWall, horizontalOpenings, { position: [0, 0], yaw: 0 }));

const report = {
  status: 'passed',
  scope: 'CPU rectangular wall slicing around non-overlapping window/door openings',
  checks: {
    horizontalSlices: horizontalSlices.length,
    verticalSlices: verticalSlices.length,
    horizontalArea: horizontalSlices.reduce((sum, slice) => sum + area(slice), 0),
    expectedHorizontalArea: 9 * 2.8 - openingArea(horizontalOpenings),
    verticalArea: verticalSlices.reduce((sum, slice) => sum + area(slice), 0),
    expectedVerticalArea: 7 * 2.8 - openingArea(verticalOpenings),
    noHoleLegacyIdentity: unchanged.id === horizontalWall.id,
    inputImmutable: JSON.stringify(horizontalWall) === JSON.stringify(snapshot),
    fourWayWorldTransform: 'north/south/west/east edge cuts with quarter-turn world transforms',
    architectureSource: 'describeArchitecture(makeRentalHome()) emitted real portal-separated wall segments for all four edges',
    wallHalfSizeContract: '2D [xHalf,zHalf]',
    openingOffsetFrame: 'room-edge coordinate translated against each segment position',
  },
  rejectionCodes: ['opening-outside-wall', 'overlapping-openings', 'invalid-opening', 'opening-wall-mismatch', 'invalid-world-transform'],
  limitations: ['Static rectangular geometry only. Navigation keeps the original wall description and is not changed by this pure cutter.', 'Opening portals and cross-wall conflicts are validated upstream.'],
};
await fs.mkdir(evidenceRoot, { recursive: true });
await fs.writeFile(new URL('report.json', evidenceRoot), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));

