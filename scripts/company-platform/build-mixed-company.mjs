import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { appearanceBranches, appearanceCandidates } from '../../prototype/src/company/appearance-samples.js';
import { makeRentalHome } from './build-home-examples.mjs';
import { inspectCompanyConnections } from '../../prototype/src/company/space.js';
import { deriveCompany, prepareCompanyChange, serializeCompany } from '../../prototype/src/company/document.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const basePath = path.join(root, 'prototype/src/company/examples/c2-mixed-company.json');
const opsPath = path.join(root, 'prototype/src/company/examples/c2-mixed-company-edit.ops.json');
const evidenceDir = path.join(root, 'evidence/company-mixed-fixture-v1');

const ref = (id, version = 1) => ({ id, version });
const floorId = index => `mixed-company-c2/floor-${index}`;
const roomId = (floor, index) => `${floorId(floor)}/room-${index}`;
const stationId = (floor, room, index) => `${roomId(floor, room)}/station-${index}`;

function candidate(branch, index) {
  const value = appearanceCandidates(catalog, branch)[index];
  assert(value, `Missing appearance candidate ${branch}[${index}]`);
  return ref(value.id, value.version);
}

function replace(station, part, branch, index) {
  return { type: 'replace-resource', id: `${station}/${part}`, resource: candidate(branch, index) };
}

function add(id, parentId, branch, index, position, yaw = 0, state) {
  const operation = { type: 'add-facility', id, parentId, resource: candidate(branch, index), transform: { position, yaw } };
  if (state) operation.state = state;
  return operation;
}

function cloneRentalFloor(source, floorNumber) {
  const prefix = floorId(floorNumber);
  const sourceFloor = source.nodes.find(node => node.kind === 'floor');
  const regions = new Map([
    ['rental/stream', `${prefix}/room-1`],
    ['rental/work', `${prefix}/room-2`],
    ['rental/rest', `${prefix}/room-3`],
    ['rental/living', `${prefix}/living`],
    ['rental/living-entry', `${prefix}/living-entry`],
  ]);
  const stations = new Map([['station-1', `${prefix}/room-1/station-1`], ['station-2', `${prefix}/room-1/station-2`]]);
  const facilities = new Map([
    ['work/desk', `${prefix}/room-2/desk`], ['work/chair', `${prefix}/room-2/chair`],
    ['rest/sofa', `${prefix}/room-3/sofa`], ['public/sofa', `${prefix}/living/sofa`], ['public/plant', `${prefix}/living/plant`],
  ]);
  const idMap = new Map([['rental-home-company', 'mixed-company-c2'], [sourceFloor.id, prefix], ...regions, ...stations, ...facilities]);
  for (const station of stations.keys()) for (const part of ['desk', 'monitor', 'keyboard', 'microphone', 'chair', 'fill-light'])
    idMap.set(`${station}/${part}`, `${stations.get(station)}/${part}`);
  const mapId = id => {
    if (idMap.has(id)) return idMap.get(id);
    for (const [oldId, newId] of idMap) if (id.startsWith(`${oldId}/`)) return `${newId}${id.slice(oldId.length)}`;
    return id;
  };
  const cloned = source.nodes.filter(node => node.id === sourceFloor.id || node.parentId === sourceFloor.id || stations.has(node.id) || facilities.has(node.id) || [...stations.keys()].some(station => node.id.startsWith(`${station}/`))).map(node => {
    const copy = structuredClone(node);
    copy.id = mapId(node.id);
    copy.parentId = mapId(node.parentId);
    if (copy.stationId) copy.stationId = mapId(copy.stationId);
    if (copy.kind === 'floor') {
      copy.name = floorNumber === 1 ? '一层 · 住宅直播与公共客厅' : '二层 · 住宅制作与共享客厅';
      copy.connections = copy.connections.map(connection => ({ ...connection, id: `${prefix}/${connection.id}`, from: { ...connection.from, regionId: mapId(connection.from.regionId) }, to: { ...connection.to, regionId: mapId(connection.to.regionId) } }));
    }
    return copy;
  });
  // The second floor deliberately swaps work/rest room purposes and moves the existing furniture identities.
  if (floorNumber === 2) {
    const roomWork = cloned.find(node => node.id === `${prefix}/room-2`);
    const roomRest = cloned.find(node => node.id === `${prefix}/room-3`);
    roomWork.purpose = 'rest'; roomWork.name = '二层休息室';
    roomRest.purpose = 'work'; roomRest.name = '二层制作室';
    const desk = cloned.find(node => node.id === `${prefix}/room-2/desk`);
    const chair = cloned.find(node => node.id === `${prefix}/room-2/chair`);
    desk.id = `${prefix}/room-3/desk`; desk.parentId = `${prefix}/room-3`; desk.transform = { position: [0.9, 0, -0.75], yaw: 0 };
    chair.id = `${prefix}/room-3/chair`; chair.parentId = `${prefix}/room-3`; chair.transform = { position: [0.9, 0, 0.7], yaw: Math.PI };
    const sofa = cloned.find(node => node.id === `${prefix}/room-3/sofa`);
    sofa.id = `${prefix}/room-2/sofa`; sofa.parentId = `${prefix}/room-2`; sofa.transform = { position: [-0.9, 0, -0.85], yaw: 0 };
    const turnedStation = cloned.find(node => node.id === `${prefix}/room-1/station-2`);
    turnedStation.transform = { position: [0.5, 0, 1.4], yaw: Math.PI / 2 };
  }
  return cloned;
}

function buildBase() {
  const source = makeRentalHome();
  const document = {
    ...structuredClone(source),
    id: 'mixed-company-c2',
    name: '混合素材公司 · 两层住宅与公共客厅',
    scale: 'building',
    nodes: [...cloneRentalFloor(source, 1), ...cloneRentalFloor(source, 2)],
  };

  const ops = [];
  const first = [stationId(1, 1, 1), stationId(1, 1, 2)];
  const second = [stationId(2, 1, 1), stationId(2, 1, 2)];
  const stationLooks = [
    ['desk', 0, 'chair', 0, 'monitor', 0, 'keyboard', 0, 'desk-microphone', 0, 'fill-light', 0],
    ['desk', 1, 'chair', 1, 'monitor', 1, 'keyboard', 1, 'desk-microphone', 1, 'fill-light', 1],
    ['desk', 2, 'chair', 2, 'monitor', 2, 'keyboard', 2, 'desk-microphone', 2, 'fill-light', 2],
    ['desk', 3, 'chair', 3, 'monitor', 3, 'keyboard', 3, 'desk-microphone', 3, 'fill-light', 3],
  ];
  for (const [station, look] of first.concat(second).map((id, index) => [id, stationLooks[index]])) {
    for (let index = 0; index < look.length; index += 2)
      ops.push(replace(station, { desk: 'desk', chair: 'chair', monitor: 'monitor', keyboard: 'keyboard', 'desk-microphone': 'microphone', 'fill-light': 'fill-light' }[look[index]], look[index], look[index + 1]));
  }
  ops.push({ type: 'replace-resource', id: `${roomId(2, 2)}/sofa`, resource: candidate('sofa', 3) });

  // Each floor keeps the real rental-home public living spaces and portal routes.
  for (const [floor, sofaIndex, plantIndex, rugIndex, panelIndex, artIndex, windowIndex, doorIndex] of [
    [1, 1, 0, 0, 0, 0, 0, 0],
    [2, 2, 1, 1, 1, 1, 1, 1],
  ]) {
    const stream = roomId(floor, 1), work = roomId(floor, 2), rest = roomId(floor, 3);
    const living = `${floorId(floor)}/living`, entry = `${floorId(floor)}/living-entry`;
    ops.push(add(`${living}/mixed-sofa`, living, 'sofa', sofaIndex, [-1.3, 0, 1], Math.PI));
    ops.push(add(`${living}/mixed-plant`, living, 'plant', plantIndex, [0, 0, 2], 0));
    ops.push(add(`${living}/fill-light`, living, 'fill-light', floor === 1 ? 3 : 2, [2.5, 0, -1.5], 0));
    ops.push(add(`${living}/rug`, living, 'rug', rugIndex, [0, 0, 1], 0));
    for (const [region, index] of [[stream, panelIndex], [work, panelIndex + 1], [rest, panelIndex + 2], [living, panelIndex + 3], [entry, panelIndex]])
      ops.push(add(`${region}/floor-panel`, region, 'floor-panel', index % 4, [0, 0, 0], 0));
    ops.push(add(`${stream}/wall-panel`, stream, 'wall-panel', panelIndex % 4, [0, 0, -2.525], 0));
    ops.push(add(`${work}/wall-panel`, work, 'wall-panel', (panelIndex + 1) % 4, [0, 0, -2.525], 0));
    ops.push(add(`${rest}/wall-panel`, rest, 'wall-panel', (panelIndex + 2) % 4, [0, 0, -2.525], 0));
    ops.push(add(`${living}/wall-panel`, living, 'wall-panel', (panelIndex + 3) % 4, [0, 0, 2.525], Math.PI));
    ops.push(add(`${entry}/wall-panel`, entry, 'wall-panel', panelIndex, [0, 0, -1.4], 0));
    ops.push(add(`${stream}/wall-art`, stream, 'wall-art', artIndex % 4, [-1.4, 1.4, -2.525], 0));
    ops.push(add(`${work}/wall-art`, work, 'wall-art', (artIndex + 1) % 4, [1.4, 1.4, -2.525], 0));
    ops.push(add(`${rest}/wall-art`, rest, 'wall-art', (artIndex + 2) % 4, [1.4, 1.4, -2.525], 0));
    ops.push(add(`${living}/wall-art`, living, 'wall-art', (artIndex + 3) % 4, [2, 1.4, 2.525], Math.PI));
    ops.push(add(`${stream}/window-panel`, stream, 'window-panel', windowIndex % 4, [-2.9, 1.4, -0.8], Math.PI / 2));
    ops.push(add(`${work}/window-panel`, work, 'window-panel', (windowIndex + 1) % 4, [2.9, 1.4, -1], Math.PI * 1.5));
    ops.push(add(`${rest}/window-panel`, rest, 'window-panel', (windowIndex + 2) % 4, [-2.9, 1.4, 0.8], Math.PI / 2));
    ops.push(add(`${living}/window-panel`, living, 'window-panel', (windowIndex + 3) % 4, [-1.5, 1.4, 2.525], Math.PI));
    ops.push(add(`${entry}/window-panel`, entry, 'window-panel', windowIndex, [1.4, 1.4, -0.4], Math.PI * 1.5));
    // Door frames sit on the room side of each real rental-home portal.
    ops.push(add(`${stream}/door-frame`, stream, 'door-frame', doorIndex, [2.9, 0, 1.125], Math.PI * 1.5));
    ops.push(add(`${work}/door-frame`, work, 'door-frame', doorIndex + 1, [-1.5, 0, 2.525], Math.PI));
    ops.push(add(`${rest}/door-frame`, rest, 'door-frame', doorIndex + 2, [2.9, 0, 0], Math.PI * 1.5));
  }
  const base = prepareCompanyChange(document, ops, { catalog, templates }).document;
  inspectCompanyConnections(base, catalog, templates);
  inspectCompanyPlacement(base, catalog, templates);
  return base;
}

function buildOperations() {
  const target = stationId(1, 1, 1);
  return [
    { type: 'move', id: target, transform: { position: [-1.35, 0, 0.2], yaw: Math.PI / 2 } },
    { type: 'move', id: `${target}/desk`, transform: { position: [0.12, 0, -0.9], yaw: 0 } },
    replace(target, 'monitor', 'monitor', 3),
    replace(target, 'chair', 'chair', 3),
    replace(target, 'keyboard', 'keyboard', 3),
    { type: 'set-state', id: `${target}/monitor`, state: { on: false } },
    { type: 'set-state', id: `${target}/fill-light`, state: { on: true, intensity: 35 } },
  ];
}

function inspect(document) {
  const derived = deriveCompany(document, catalog, templates);
  const placement = inspectCompanyPlacement(document, catalog, templates);
  const connections = inspectCompanyConnections(document, catalog, templates);
  return { derived, placement, connections };
}

function summary(document, checks) {
  const regions = document.nodes.filter(node => ['room', 'area'].includes(node.kind));
  const facilities = document.nodes.filter(node => node.kind === 'facility');
  const stations = document.nodes.filter(node => node.kind === 'workstation');
  const byFloor = document.nodes.filter(node => node.kind === 'floor').map(floor => ({
    id: floor.id,
    name: floor.name,
    regions: regions.filter(region => region.parentId === floor.id).map(region => ({ id: region.id, name: region.name, kind: region.kind, purpose: region.purpose ?? 'public' })),
    stations: stations.filter(station => station.parentId && document.nodes.find(node => node.id === station.parentId)?.parentId === floor.id).map(station => station.id),
    fillLights: facilities.filter(facility => facility.id.startsWith(`${floor.id}/`) && facility.resource?.id.startsWith('fill-light')).map(facility => facility.id),
  }));
  return {
    schema: 'company-mixed-fixture-report', version: 1, status: 'passed',
    company: { id: document.id, revision: document.revision, floors: byFloor, nodeCount: document.nodes.length, facilityCount: facilities.length, stationCount: stations.length },
    branchCoverage: appearanceBranches.map(([branch, name]) => ({ branch, name, candidateCount: appearanceCandidates(catalog, branch).length, installed: document.nodes.some(node => node.kind === 'facility' && node.resource && appearanceCandidates(catalog, branch).some(candidateValue => candidateValue.id === node.resource.id && candidateValue.version === node.resource.version)) || branch === 'stream-station' })),
    edit: { operations: buildOperations(), activeEditableTarget: `${stationId(1, 1, 1)}/monitor`, preservedReferenceStation: stationId(1, 1, 2), preservedOtherFloor: floorId(2), expectedRelations: ['station-1 transform rotates to +90° yaw and shifts +0.2m local Z', 'station-1/desk moves locally while monitor, keyboard and microphone remain desk children', 'station-1/monitor replacement keeps monitor role and state is switched off', 'station-1/fill-light remains independent and intensity changes to 35', 'all floor-2 nodes and station-1/station-2 reference remain unchanged'] },
    checks: { base: checks.base, edited: checks.edited },
    commands: [
      'node scripts/company-platform/build-mixed-company.mjs',
      'node scripts/company-platform/build-mixed-company.mjs --check',
      'node scripts/company-platform/company.mjs apply prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json evidence/company-mixed-fixture-v1/edited.company.json',
      'node scripts/company-platform/company.mjs validate evidence/company-mixed-fixture-v1/edited.company.json',
    ],
    limits: ['Static placement and same-floor portal geometry only. Real character navigation, stairs and use remain C3 validation.', 'The fixture demonstrates branch resources and deterministic authoring operations. It is not a final visual acceptance.'],
  };
}

async function emit(file, bytes, check) {
  if (check) {
    assert.equal(await fs.readFile(file, 'utf8'), bytes, `Generated file differs ${path.relative(root, file)}`);
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
}

export function makeMixedCompany() { return buildBase(); }
export function makeEditOperations() { return buildOperations(); }

async function main() {
  const check = process.argv.includes('--check');
  const base = makeMixedCompany();
  const operations = makeEditOperations();
  const edited = prepareCompanyChange(base, operations, { catalog, templates }).document;
  const baseChecks = inspect(base);
  const editedChecks = inspect(edited);
  const serializedBase = serializeCompany(base, catalog, templates);
  const serializedEdited = serializeCompany(edited, catalog, templates);
  const serializedOps = JSON.stringify(operations, null, 2) + '\n';
  assert.equal(base.revision, 2);
  assert.equal(edited.revision, 3);
  assert.equal(base.id, 'mixed-company-c2');
  assert.equal(new Set(base.nodes.filter(node => node.kind === 'floor').map(node => node.id)).size, 2);
  assert(baseChecks.connections.floors.every(floor => floor.connections.length >= 2));
  assert(baseChecks.placement.checkedPortals.length >= 8);
  assert(editedChecks.placement.checkedPoints.length >= 4);
  assert.equal(edited.nodes.find(node => node.id === `${stationId(1, 1, 1)}/monitor`).state.on, false);
  assert.equal(edited.nodes.find(node => node.id === `${stationId(1, 1, 1)}/fill-light`).state.intensity, 35);
  const reportData = summary(edited, { base: { placement: baseChecks.placement, connections: baseChecks.connections, sha256: createHash('sha256').update(serializedBase).digest('hex') }, edited: { placement: editedChecks.placement, connections: editedChecks.connections, sha256: createHash('sha256').update(serializedEdited).digest('hex') } });
  const floor2Before = base.nodes.filter(node => node.id.startsWith(`${floorId(2)}/`));
  const floor2After = edited.nodes.filter(node => node.id.startsWith(`${floorId(2)}/`));
  const referenceId = stationId(1, 1, 2);
  reportData.edit.preservation = {
    otherFloorId: floorId(2),
    otherFloorUnchanged: JSON.stringify(floor2Before) === JSON.stringify(floor2After),
    referenceStationId: referenceId,
    referenceStationUnchanged: JSON.stringify(base.nodes.filter(node => node.id === referenceId || node.id.startsWith(`${referenceId}/`))) === JSON.stringify(edited.nodes.filter(node => node.id === referenceId || node.id.startsWith(`${referenceId}/`))),
  };
  reportData.layoutContrast = {
    floor1Station2: base.nodes.find(node => node.id === stationId(1, 1, 2)).transform,
    floor2Station2: base.nodes.find(node => node.id === stationId(2, 1, 2)).transform,
    floor1RestSofa: base.nodes.find(node => node.id === `${roomId(1, 3)}/sofa`).resource,
    floor2RestSofa: base.nodes.find(node => node.id === `${roomId(2, 2)}/sofa`).resource,
    floor1PublicSofa: base.nodes.find(node => node.id === `${floorId(1)}/living/mixed-sofa`).resource,
    floor2PublicSofa: base.nodes.find(node => node.id === `${floorId(2)}/living/mixed-sofa`).resource,
    reason: 'Floor 2 turns the second station by +90 degrees and uses a distinct sofa version plus distinct wall, floor, window, art, plant, light and workstation candidate resources.',
  };
  assert(reportData.edit.preservation.otherFloorUnchanged);
  assert(reportData.edit.preservation.referenceStationUnchanged);
  const report = JSON.stringify(reportData, null, 2) + '\n';
  await emit(basePath, serializedBase, check);
  await emit(opsPath, serializedOps, check);
  await emit(path.join(evidenceDir, 'edited.company.json'), serializedEdited, check);
  await emit(path.join(evidenceDir, 'report.json'), report, check);
  console.log(JSON.stringify({ status: 'passed', check, base: path.relative(root, basePath), operations: path.relative(root, opsPath), edited: path.relative(root, path.join(evidenceDir, 'edited.company.json')), revision: edited.revision, floors: 2, branchCount: appearanceBranches.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
