import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates.json' with { type: 'json' };
import oldStudio from '../../prototype/src/company/examples/c1-studio.json' with { type: 'json' };
import { createCompany, prepareCompanyChange, serializeCompany, deriveCompany, pointInTransform } from '../../prototype/src/company/document.js';
import { inspectCompanyConnections } from '../../prototype/src/company/space.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';

const root = new URL('../../', import.meta.url);
const oldRoom = oldStudio.nodes.find(node => node.kind === 'room');
const oldRoomArea = oldRoom.bounds.width * oldRoom.bounds.depth;
assert.equal(oldRoomArea, 63, 'Review half-area input if the reference single room changes');

function shell(id, name, scale) {
  const document = createCompany({ id, name }, catalog);
  document.scale = scale;
  document.nodes = document.nodes.filter(node => node.kind === 'floor');
  document.nodes[0].connections = [];
  return document;
}
function region(document, { id, kind = 'room', name, purpose, width, depth, position, entry }) {
  const node = { id, kind, parentId: document.nodes[0].id, name,
    bounds: { width, depth }, transform: { position, yaw: 0 } };
  if (kind === 'room') node.purpose = purpose;
  if (entry) node.entry = { position: entry };
  document.nodes.push(node);
  return node;
}
function connect(document, id, from, to, width = 1.4) {
  document.nodes[0].connections.push({ id, from: { ...from, width }, to: { ...to, width } });
}
function station(id, parentId, position, yaw = 0) {
  return { type: 'add-workstation', id, parentId, template: { id: 'stream-station', version: 1 },
    transform: { position, yaw } };
}
function furniture(id, parentId, resourceId, position, yaw = 0) {
  return { type: 'add-facility', id, parentId, resource: { id: resourceId, version: 1 }, transform: { position, yaw } };
}
function populate(document, operations) {
  return prepareCompanyChange(document, operations, { catalog, templates }).document;
}
function makeSmallHome() {
  const document = shell('small-home-company', '民房 · 单人起步', 'small-home');
  const room = region(document, { id: 'small-home-company/room-1', name: '直播与休息单间', purpose: 'streaming',
    width: 6, depth: 5.25, position: [0, 0, 0], entry: [0, 0, 2] });
  assert.equal(room.bounds.width * room.bounds.depth, oldRoomArea / 2);
  return populate(document, [
    station('station-1', room.id, [-1.5, 0, -0.45]),
    furniture('lounge/sofa', room.id, 'lounge-sofa', [1.1, 0, -1]),
    furniture('home/plant', room.id, 'plant', [2.5, 0, 1.85]),
  ]);
}

function makeRentalHome() {
  const document = shell('rental-home-company', '出租屋 · 三房与公共客厅', 'rental-home');
  const stream = region(document, { id: 'rental/stream', name: '直播间', purpose: 'streaming',
    width: 6, depth: 5.25, position: [-6, 0, -2.625] });
  const work = region(document, { id: 'rental/work', name: '工作间', purpose: 'work',
    width: 6, depth: 5.25, position: [3, 0, -2.625] });
  const rest = region(document, { id: 'rental/rest', name: '休息间', purpose: 'rest',
    width: 6, depth: 5.25, position: [-6, 0, 2.625] });
  const living = region(document, { id: 'rental/living', kind: 'area', name: '公共客厅',
    width: 6, depth: 5.25, position: [0, 0, 2.625], entry: [-1.5, 0, 1.8] });
  const entrance = region(document, { id: 'rental/living-entry', kind: 'area', name: '客厅入口',
    width: 3, depth: 3, position: [-1.5, 0, -1.5] });
  connect(document, 'rental/door-stream', { regionId: stream.id, edge: 'east', offset: 1.125 },
    { regionId: entrance.id, edge: 'west', offset: 0 });
  connect(document, 'rental/door-work', { regionId: work.id, edge: 'south', offset: -1.5 },
    { regionId: living.id, edge: 'north', offset: 1.5 });
  connect(document, 'rental/door-rest', { regionId: rest.id, edge: 'east', offset: 0 },
    { regionId: living.id, edge: 'west', offset: 0 });
  connect(document, 'rental/living-connection', { regionId: entrance.id, edge: 'south', offset: 0 },
    { regionId: living.id, edge: 'north', offset: -1.5 });
  return populate(document, [
    station('station-1', stream.id, [-1.4, 0, -0.3]),
    station('station-2', stream.id, [1.4, 0, -0.3]),
    furniture('work/desk', work.id, 'desk', [-1.3, 0, -0.8]),
    furniture('work/chair', work.id, 'chair', [-1.3, 0, 0.65], Math.PI),
    furniture('rest/sofa', rest.id, 'lounge-sofa', [0, 0, -1]),
    furniture('public/sofa', living.id, 'lounge-sofa', [1.3, 0, 1], Math.PI),
    furniture('public/plant', living.id, 'plant', [-2.4, 0, -1.6]),
  ]);
}

function inspect(name, document) {
  const serialized = serializeCompany(document, catalog, templates);
  const derived = deriveCompany(document, catalog, templates);
  const placement = inspectCompanyPlacement(document, catalog, templates);
  const connections = inspectCompanyConnections(document, catalog, templates);
  const regions = document.nodes.filter(node => ['room', 'area'].includes(node.kind)).map(node => ({
    id: node.id, name: node.name, kind: node.kind, purpose: node.purpose ?? 'public',
    width: node.bounds.width, depth: node.bounds.depth, area: node.bounds.width * node.bounds.depth,
    center: node.transform.position,
  }));
  return { name, document, serialized, placement, connections,
    summary: { regions, totalArea: regions.reduce((sum, region) => sum + region.area, 0),
      businessRooms: regions.filter(region => region.kind === 'room').length,
      installedStations: derived.capacity.installedStations, checkedPoints: placement.checkedPoints.length,
      checkedPortalSides: placement.checkedPortals.length,
      documentSha256: createHash('sha256').update(serialized).digest('hex') } };
}

function planData(document) {
  const derived = deriveCompany(document, catalog, templates);
  const connections = inspectCompanyConnections(document, catalog, templates);
  const rectangles = document.nodes.filter(node => ['room', 'area'].includes(node.kind)).map(node => {
    const points = [-1, 1].flatMap(x => [-1, 1].map(z => pointInTransform(derived.worlds.get(node.id),
      [x * node.bounds.width / 2, 0, z * node.bounds.depth / 2])));
    return { id: node.id, name: node.name, kind: node.kind, purpose: node.purpose ?? 'public',
      area: node.bounds.width * node.bounds.depth,
      min: [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[2]))],
      max: [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[2]))] };
  });
  const obstacles = derived.obstacles.map(obstacle => ({ id: obstacle.id, min: obstacle.min, max: obstacle.max,
    category: derived.facilities.find(facility => facility.id === obstacle.id).resource.category }));
  const portals = connections.floors.flatMap(floor => floor.connections.map(connection => ({
    id: connection.id, from: connection.from.regionId, to: connection.to.regionId,
    start: connection.from.world.start, end: connection.from.world.end,
  })));
  const points = derived.usePoints.map(point => ({ id: point.id,
    position: pointInTransform(point.world, point.position),
    approach: pointInTransform(point.world, point.approach), exit: pointInTransform(point.world, point.exit) }));
  return { rectangles, obstacles, portals, points };
}

export { makeSmallHome, makeRentalHome, inspect, planData };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const selected = process.argv.includes('--rental-only') ? [['rental-home', makeRentalHome]] :
    [['small-home', makeSmallHome], ['rental-home', makeRentalHome]];
  const inspected = selected.map(([name, build]) => inspect(name, build()));
  const rental = inspected.find(example => example.name === 'rental-home');
  if (rental) {
    assert.equal(rental.summary.businessRooms, 3);
    assert(rental.summary.regions.filter(region => region.kind === 'room').every(region => region.area === 31.5));
    assert.equal(rental.summary.totalArea, 135);
    const businessIds = new Set(rental.summary.regions.filter(region => region.kind === 'room').map(region => region.id));
    for (const connection of rental.connections.floors[0].connections) {
      assert(!(businessIds.has(connection.from.regionId) && businessIds.has(connection.to.regionId)),
        'Business room access must use shared public space');
    }
  }
  const report = { status: 'passed', reference: { input: 'prototype/src/company/examples/c1-studio.json',
    width: oldRoom.bounds.width, depth: oldRoom.bounds.depth, area: oldRoomArea },
    sizeRule: { A: 31.5, smallHome: 'A', singleRoom: '2A', rentalHome: '3A plus one connected public living space' },
    examples: inspected.map(example => ({ name: example.name, ...example.summary,
      connections: example.connections, staticPlacement: example.placement })),
    routes: ['Small home test entry to one workstation and independent sofa within one room.',
      'Rental stream room to 3x3 living entrance to public living room.',
      'Rental work room directly to public living room.', 'Rental rest room directly to public living room.',
      'The living entrance and living rectangle form one connected public living space. No business room is used as a passage.'],
    layoutReview: ['Rental actual area 135m2 inside a 15x10.5m stepped outline. The exterior bounding box is 157.5m2 and occupied coverage is about 85.7%.',
      'Three business rooms are each exactly 31.5m2. Public living is 31.5m2 plus a 9m2 entrance.',
      'Only a 3m deep entrance joins the living room. There is no repeated corridor-cell row.',
      'Workstations face desks. Rest sofa faces into its room. Public sofa faces into the common living space.',
      'Furniture retains resource dimensions and unit scale. Door widths are 1.4m, with exact shared-edge portal correspondence.'],
    planReview: { method: 'Reviewed CPU PNG plans drawn directly from derived world-coordinate regions, footprints, use points and portal endpoints.',
      artifacts: ['small-home.plan.png', 'rental-home.plan.png'],
      observed: ['Workstation devices remain parented to their desks. Functional furniture footprints leave central circulation space.',
        'Rental shared doors match room boundaries. Three business-room routes join public space without crossing another business room.'] },
    commands: ['node scripts/company-platform/build-home-examples.mjs', 'node scripts/company-platform/build-home-examples.mjs --check',
      'python evidence/company-home-layouts-v1/draw-plan.py evidence/company-home-layouts-v1/small-home.plan.json',
      'python evidence/company-home-layouts-v1/draw-plan.py evidence/company-home-layouts-v1/rental-home.plan.json'],
    sourceSha256: createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),
    dispatch: { difficulty: 'standard', model: 'gpt-6.1-sol', reasoning_effort: 'medium',
      reason: 'Explicit residential scale, shared-space routes and common-primitive layout creation with conservative static checks.',
      configurationEvidence: 'Parent-confirmed existing configuration. Host hook interception unverified.' },
    limitations: ['Static geometry and conservative grid admission only. Real character use, contact, navigation and browser/GPU visual acceptance remain unverified.',
      'Small home starts with one workstation. This example does not establish its product capacity limit.',
      'Default or explicit entry positions are internal test origins. External entrance doors, kitchen and bathroom functionality are unverified.'],
  };
  const files = inspected.flatMap(example => [
    [`prototype/src/company/examples/c2-${example.name}.json`, example.serialized],
    [`evidence/company-home-layouts-v1/${example.name}.plan.json`, JSON.stringify(planData(example.document), null, 2) + '\n'],
  ]);
  const reportName = process.argv.includes('--rental-only') ? 'rental-only.report.json' : 'report.json';
  files.push([`evidence/company-home-layouts-v1/${reportName}`, JSON.stringify(report, null, 2) + '\n']);
  for (const [file, bytes] of files) {
    const url = new URL(file, root);
    if (process.argv.includes('--check')) assert.equal(await fs.readFile(url, 'utf8'), bytes, `Generated layout differs ${file}`);
    else { await fs.mkdir(new URL('./', url), { recursive: true }); await fs.writeFile(url, bytes); }
  }
  console.log(JSON.stringify({ status: 'passed', examples: inspected.map(example => ({ name: example.name, ...example.summary })) }));
}
