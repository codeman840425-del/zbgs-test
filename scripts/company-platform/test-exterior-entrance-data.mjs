import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { deriveExteriorEntrances, floorPortalSides } from '../../prototype/src/company/exterior-entrance-data.js';

const ninetyDegrees = Math.PI / 2;
const frame = (x = 0, z = 0, yaw = 0) => ({ position: [x, 0, z], yaw });
const entrance = overrides => ({ id: 'entry-a', regionId: 'room-a', edge: 'north', offset: 0, width: 1.4, height: 2.2, ...overrides });
const region = (id, parentId, transform, { kind = 'room', width = 8, depth = 4 } = {}) => ({
  id, kind, parentId, bounds: { width, depth }, transform,
});

function fixture({ transform = frame(), entrances = [entrance()] } = {}) {
  return {
    id: 'example-company',
    nodes: [
      { id: 'floor-a', kind: 'floor', exteriorEntrances: entrances, transform: frame() },
      region('room-a', 'floor-a', transform),
      { id: 'floor-b', kind: 'floor', transform: frame() },
      region('room-b', 'floor-b', frame()),
      { id: 'lamp', kind: 'facility', parentId: 'room-a', transform: frame() },
    ],
  };
}

function derive(document) {
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const worlds = new Map(document.nodes.map(node => [node.id, node.transform]));
  const floorIds = new Map(document.nodes.map(node => [node.id, node.kind === 'floor' ? node.id : node.parentId]));
  const context = { document, nodes, worlds, floorIds };
  const before = structuredClone(context);
  try {
    return deriveExteriorEntrances(context, (code, path, message, details) => {
      throw Object.assign(new Error(message), { code, path, details });
    });
  } finally {
    assert.deepEqual(context, before, 'Derivation must preserve the input document and lookup maps');
  }
}

function closePoint(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, axis) => assert(Math.abs(value - expected[axis]) < 1e-9, `${actual} != ${expected}`));
}

const cases = [];
function check(name, run) {
  try {
    run();
    cases.push({ name, passed: true });
  } catch (error) {
    cases.push({ name, passed: false, error: error.stack });
  }
}

check('Legacy floor and an explicit empty array return an empty entrance map', () => {
  const document = fixture({ entrances: [] });
  assert.deepEqual(derive(document), new Map());
  delete document.nodes[0].exteriorEntrances;
  assert.deepEqual(derive(document), new Map());
});

check('Quarter-turn owner produces the ground aperture and inward sample in both coordinate systems', () => {
  const definition = entrance({ offset: 1.5 });
  const document = fixture({ transform: frame(10, -5, ninetyDegrees), entrances: [definition] });
  const result = derive(document).get(definition.id);
  assert.equal(result.floorId, 'floor-a');
  for (const [key, value] of Object.entries(definition)) assert.equal(result[key], value);
  closePoint(result.local.start, [.8, 0, -2]);
  closePoint(result.local.end, [2.2, 0, -2]);
  closePoint(result.local.center, [1.5, 0, -2]);
  closePoint(result.local.interior, [1.5, 0, -1.65]);
  closePoint(result.world.start, [8, 0, -5.8]);
  closePoint(result.world.end, [8, 0, -7.2]);
  closePoint(result.world.center, [8, 0, -6.5]);
  closePoint(result.world.interior, [8.35, 0, -6.5]);
  closePoint(result.world.normal, [-1, 0, 0]);
});

check('Public areas, all edges, dimensional endpoints and corner returns are admitted', () => {
  const entrances = [
    entrance({ id: 'north', width: .8, height: 2, offset: -3.5 }),
    entrance({ id: 'south', edge: 'south', width: 2.4, height: 2.6, offset: 2.7 }),
    entrance({ id: 'west', edge: 'west', offset: 1.2 }),
    entrance({ id: 'east', edge: 'east', offset: -1.2 }),
  ];
  const document = fixture({ entrances });
  document.nodes[1].kind = 'area';
  const result = derive(document);
  assert.equal(result.size, 4);
  closePoint(result.get('south').world.normal, [0, 0, 1]);
  closePoint(result.get('west').world.center, [-4, 0, 1.2]);
  closePoint(result.get('east').world.center, [4, 0, -1.2]);
});

check('Malformed arrays, records, dimensions and region references fail', () => {
  const malformed = [null, false, 3, {}];
  for (const value of malformed) assert.throws(() => derive(fixture({ entrances: value })), { code: 'invalid-exterior-entrances' });
  const missing = entrance();
  delete missing.height;
  const invalidEntrances = [
    null, [], missing, entrance({ state: 'open' }), entrance({ id: 'bad id' }),
    entrance({ edge: 'down' }), entrance({ edge: 'constructor' }), entrance({ edge: ['south'] }),
    entrance({ width: .799 }), entrance({ width: 2.401 }), entrance({ width: '1.4' }),
    entrance({ height: 1.999 }), entrance({ height: 2.601 }), entrance({ offset: Infinity }),
    entrance({ offset: '0' }),
  ];
  for (const value of invalidEntrances) assert.throws(() => derive(fixture({ entrances: [value] })), { code: 'invalid-exterior-entrance' });
  for (const regionId of ['missing', 'lamp', 'floor-a', 'room-b']) {
    assert.throws(() => derive(fixture({ entrances: [entrance({ regionId })] })), { code: 'invalid-exterior-entrance-region' });
  }
  assert.throws(() => derive(fixture({ entrances: [entrance({ edge: 'east', offset: 1.201 })] })), { code: 'outside-exterior-entrance-edge' });
});

check('Entrance IDs are unique against company, nodes, other floors’ connections and exterior entries', () => {
  for (const id of ['example-company', 'floor-b', 'room-b', 'lamp', 'interior-b']) {
    const document = fixture({ entrances: [entrance({ id })] });
    document.nodes[2].connections = [{ id: 'interior-b' }];
    assert.throws(() => derive(document), { code: 'duplicate-exterior-entrance-id' });
  }
  const document = fixture();
  document.nodes[2].exteriorEntrances = [entrance({ regionId: 'room-b' })];
  assert.throws(() => derive(document), { code: 'duplicate-exterior-entrance-id' });
});

check('Either interior portal side and adjacent exterior apertures reserve wall intervals', () => {
  const portal = { regionId: 'room-a', edge: 'north', offset: 0, width: 1.4 };
  const opposite = { regionId: 'hall', edge: 'south', offset: 0, width: 1.4 };
  for (const [from, to] of [[portal, opposite], [opposite, portal]]) {
    const document = fixture();
    document.nodes.push(region('hall', 'floor-a', frame(0, -4), { kind: 'area' }));
    document.nodes[0].connections = [{ id: 'to-hall', from, to }];
    assert.throws(() => derive(document), { code: 'overlapping-exterior-entrance' });
  }
  const adjacentEntrances = [entrance({ offset: -.7 }), entrance({ id: 'entry-2', offset: .7 })];
  assert.equal(derive(fixture({ entrances: adjacentEntrances })).size, 2);
  adjacentEntrances[1].offset -= .01;
  assert.throws(() => derive(fixture({ entrances: adjacentEntrances })), { code: 'overlapping-exterior-entrance' });
});

check('Quarter-turned region blocks the rotated aperture at contact and throughout the clearance', () => {
  const samples = [
    { x: 6.5, z: -6.5, blocked: true },
    { x: 6.425, z: -6.5, blocked: true },
    { x: 6.35, z: -6.5, blocked: true },
    { x: 6.5, z: -10.2, blocked: true },
    { x: 6.349, z: -6.5, blocked: false },
    { x: 6.5, z: -10.201, blocked: false },
    { x: 6.5, z: -6.5, floor: 'floor-b', blocked: false },
  ];
  for (const { x, z, floor = 'floor-a', blocked } of samples) {
    const document = fixture({ transform: frame(10, -5, ninetyDegrees), entrances: [entrance({ offset: 1.5 })] });
    document.nodes.push(region('wide-hall', floor, frame(x, z, ninetyDegrees), { kind: 'area', width: 6, depth: 3 }));
    if (blocked) assert.throws(() => derive(document), { code: 'blocked-exterior-entrance', details: { otherId: 'wide-hall' } });
    else assert.equal(derive(document).size, 1);
  }
});

check('Floor-side lookup provides raw connection and entrance side references for wall consumers', () => {
  const from = { regionId: 'room-a', edge: 'south', offset: 0, width: 1.4 };
  const to = { regionId: 'hall', edge: 'north', offset: 0, width: 1.4 };
  const outside = entrance();
  const connections = [{ id: 'hall-link', from, to }];
  const sides = floorPortalSides({ connections, exteriorEntrances: [outside] });
  assert.equal(sides.length, 3);
  assert.equal(sides[0], from);
  assert.equal(sides[1], to);
  assert.equal(sides[2], outside);
  assert.deepEqual(floorPortalSides({ connections }), [from, to]);
  assert.deepEqual(floorPortalSides({}), []);
});

const output = process.argv[2];
const source = new URL('../../prototype/src/company/exterior-entrance-data.js', import.meta.url);
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  status: cases.every(result => result.passed) ? 'passed' : 'failed',
  scope: 'CPU data validation with precomputed room frames and floor ownership',
  sourceSha256: await sha256(source),
  testSha256: await sha256(new URL(import.meta.url)),
  cases,
};
if (output) {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
