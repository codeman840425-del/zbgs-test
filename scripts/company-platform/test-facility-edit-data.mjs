import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCompany, prepareCompanyChange, CompanyError} from '../../prototype/src/company/document.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import {createFacilityPlacement, getFacilityEditConstraints, listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';

const root = new URL('../../', import.meta.url);
const options = {templates};
const resource = id => catalog.resources.find(candidate => candidate.id === id && candidate.version === 1);
const base = id => createCompany({id, width: 9, depth: 7}, catalog);
const roomId = id => `${id}/room-1`;
const apply = (document, operations) => prepareCompanyChange(document, operations, {catalog, templates}).document;
const placement = (document, resourceId, targetId, values = {}, region = roomId(document.id)) => createFacilityPlacement(document, catalog, resource(resourceId), targetId, values, region, options);
const deriveTarget = (document, resourceId, values = {}, region = roomId(document.id)) => {
  const targets = listPlacementTargets(document, catalog, resource(resourceId), region, options);
  assert(targets.length, `${resourceId} has no target in ${region}`);
  const result = placement(document, resourceId, targets[0].id, values, region);
  const next = apply(document, [result.operation]);
  return {targets, result, next};
};
const failures = [];
function expectFailure(id, callback) {
  let error = null;
  try { callback(); } catch (candidate) { error = candidate; }
  assert(error, `${id} accepted an invalid request`); failures.push({id, code: error.code, passed: true}); return error;
}

const checks = [];
{
  const document = base('facility-edit-ground');
  const {targets, result} = deriveTarget(document, 'plant');
  assert.equal(targets[0].mode, 'ground'); assert.equal(result.operation.parentId, roomId(document.id));
  checks.push({kind: 'ground', resource: 'plant', targets: targets.length, id: result.id});
}
{
  const document = base('facility-edit-floor');
  const {targets, result} = deriveTarget(document, 'side-table-round');
  assert.equal(targets[0].mode, 'floor-surface'); assert.deepEqual(targets[0].lockedAxes, ['y']);
  checks.push({kind: 'floor-surface', resource: 'side-table-round', targets: targets.length, id: result.id});
}
{
  const document = base('facility-edit-wall');
  const {targets, result} = deriveTarget(document, 'wall-art-triptych');
  assert.equal(targets.length, 4); assert.equal(targets[0].mode, 'wall');
  assert(targets[0].lockedAxes.includes('yaw')); checks.push({kind: 'wall', resource: 'wall-art-triptych', targets: targets.length, id: result.id});
}
{
  const document = base('facility-edit-ceiling');
  const {targets, result} = deriveTarget(document, 'ceiling-acoustic-cloud');
  assert.equal(targets[0].mode, 'ceiling'); assert.equal(targets[0].position[1], 2.8);
  checks.push({kind: 'ceiling', resource: 'ceiling-acoustic-cloud', targets: targets.length, id: result.id});
}
{
  let document = base('facility-edit-desk');
  const room = roomId(document.id);
  document = apply(document, [{type: 'add-facility', id: `${document.id}/desk`, parentId: room, resource: {id: 'desk', version: 1}, transform: {position: [-2, 0, 0], yaw: 0}}]);
  const {targets, result} = deriveTarget(document, 'monitor-aurora');
  assert.equal(targets[0].mode, 'desk-surface'); assert.equal(result.operation.parentId, `${document.id}/desk`);
  assert.deepEqual(getFacilityEditConstraints({transform: result.operation.transform}, resource('monitor-aurora')).lockedAxes, ['y']);
  checks.push({kind: 'desk-surface', resource: 'monitor-aurora', targets: targets.length, id: result.id});
}
{
  let document = base('facility-edit-support');
  const room = roomId(document.id);
  document = apply(document, [{type: 'add-facility', id: `${document.id}/shelf`, parentId: room, resource: {id: 'support-shelf-frame-posts', version: 1}, transform: {position: [2, 0, 0], yaw: 0}}]);
  const {targets, result} = deriveTarget(document, 'tabletop-ornament-vase');
  assert(targets.some(candidate => candidate.attachment.surfaceId === 'top')); assert.equal(result.operation.parentId, `${document.id}/shelf`);
  checks.push({kind: 'support-surface', resource: 'tabletop-ornament-vase', targets: targets.length, id: result.id});
}
{
  let document = base('facility-edit-information');
  const room = roomId(document.id);
  const boardTargets = listPlacementTargets(document, catalog, resource('information-board-whiteboard'), room, options);
  assert.equal(boardTargets.length, 4);
  document = apply(document, [placement(document, 'information-board-whiteboard', boardTargets[0].id, {}, room).operation]);
  const contentTargets = listPlacementTargets(document, catalog, resource('information-content-company-news-cn'), room, options);
  assert.equal(contentTargets.length, 1); assert.equal(contentTargets[0].mode, 'information-surface');
  const content = placement(document, 'information-content-company-news-cn', contentTargets[0].id, {}, room);
  document = apply(document, [content.operation]);
  assert.deepEqual(getFacilityEditConstraints({transform: content.operation.transform}, resource('information-content-company-news-cn')).lockedAxes, ['x', 'y', 'z', 'yaw']);
  checks.push({kind: 'information-surface', resource: 'information-content-company-news-cn', targets: contentTargets.length, id: content.id});
}
{
  let document = base('facility-edit-portal');
  const floor = document.nodes.find(node => node.kind === 'floor');
  floor.connections = [{id: `${document.id}/door`, from: {regionId: roomId(document.id), edge: 'south', offset: 0, width: 1.4}, to: {regionId: `${document.id}/outside`, edge: 'north', offset: 0, width: 1.4}}];
  const targets = listPlacementTargets(document, catalog, resource('door-frame-plain'), roomId(document.id), options);
  assert.equal(targets.length, 1); assert.equal(targets[0].mode, 'portal');
  const result = placement(document, 'door-frame-plain', targets[0].id, {}, roomId(document.id));
  apply(document, [result.operation]); checks.push({kind: 'portal', resource: 'door-frame-plain', targets: targets.length, id: result.id});
}
{
  let document = base('facility-edit-wall-door');
  const floor = document.nodes.find(node => node.kind === 'floor');
  floor.connections = [{id: `${document.id}/door`, from: {regionId: roomId(document.id), edge: 'south', offset: 0, width: 1.4}, to: {regionId: `${document.id}/outside`, edge: 'north', offset: 0, width: 1.4}}];
  const targets = listPlacementTargets(document, catalog, resource('wall-art-triptych'), roomId(document.id), options);
  assert.equal(targets.length, 4); const south = targets.find(target => target.edge === 'south'); assert(south && Math.abs(south.position[0]) > .7);
  checks.push({kind: 'wall-portal-gap', resource: 'wall-art-triptych', targets: targets.length, southAlong: south.position[0], passed: true});
}
{
  let document = base('facility-edit-offset-support');
  const room = roomId(document.id);
  document = apply(document, [{type: 'add-facility', id: `${document.id}/vanity`, parentId: room, resource: {id: 'vanity-table-plain', version: 1}, transform: {position: [-2, 0, 0], yaw: 0}}]);
  const targets = listPlacementTargets(document, catalog, resource('makeup-mirror-round'), room, options);
  assert.equal(targets.length, 1); assert.equal(targets[0].attachment.surfaceId, 'top'); assert.equal(targets[0].position[0], .02);
  const result = placement(document, 'makeup-mirror-round', targets[0].id, {}, room); apply(document, [result.operation]);
  checks.push({kind: 'offset-vanity-support', resource: 'makeup-mirror-round', targetX: targets[0].position[0], id: result.id, passed: true});
}
{
  const document = base('facility-edit-empty-hosts');
  assert.equal(listPlacementTargets(document, catalog, resource('monitor-aurora'), roomId(document.id), options).length, 0);
  failures.push({id: 'missing-desk-host', code: 'no-placement-target', passed: true});
}
{
  const document = base('facility-edit-no-portal');
  assert.equal(listPlacementTargets(document, catalog, resource('door-frame-plain'), roomId(document.id), options).length, 0);
  failures.push({id: 'missing-portal-host', code: 'no-placement-target', passed: true});
}
{
  const document = base('facility-edit-invalid');
  const target = listPlacementTargets(document, catalog, resource('plant'), roomId(document.id), options)[0];
  expectFailure('unknown-target', () => placement(document, 'plant', `${target.id}:missing`, {}, roomId(document.id)));
  expectFailure('nan-position', () => placement(document, 'plant', target.id, {x: Number.NaN}, roomId(document.id)));
  const first = placement(document, 'plant', target.id, {}, roomId(document.id));
  const second = placement(apply(document, [first.operation]), 'plant', target.id, {}, roomId(document.id));
  assert.equal(second.id, `${document.id}/room-1/plant-2`);
  failures.push({id: 'stable-sequence-id', idValue: second.id, passed: true});
}

const report = {status: 'passed', api: ['listPlacementTargets', 'createFacilityPlacement', 'getFacilityEditConstraints', 'deriveEditControls'], checks, failures, limitations: ['Pure data and CPU derive checks only. DOM controls and session.apply integration remain with the root agent.', 'No cable resources are used.']};
await fs.mkdir(new URL('evidence/company-facility-edit-data-v1/', root), {recursive: true});
await fs.writeFile(new URL('evidence/company-facility-edit-data-v1/report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
