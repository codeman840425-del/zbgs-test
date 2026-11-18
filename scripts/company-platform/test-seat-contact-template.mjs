import assert from 'node:assert/strict';
import catalog from '../../prototype/src/company/library-catalog.json' with {type: 'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type: 'json'};
import {deriveCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {decodeCompanySave, encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {prepareTemplateUpgrade} from '../../prototype/src/company/upgrade.js';

const context = {catalog, templates};
const chair = {id: 'chair', version: 1};
const ladder = {id: 'chair-ladder', version: 1};
const stationRef = version => ({id: 'stream-station', version});
const template = version => templates.templates.find(t => t.id === 'stream-station' && t.version === version);
const change = (document, operation) => prepareCompanyChange(document, [operation], context).document;
const station = document => document.nodes.find(node => node.kind === 'workstation');
const seat = document => document.nodes.find(node => node.partKey === 'chair' || node.resource?.id.startsWith('chair'));

function create(room, furnishingVersion) {
  return createCompanyScaleV2({
    id: 'seat-test', scale: 'single-room', spaceProfile: {id: 'company-space-v2', version: 1},
    ...(furnishingVersion === undefined ? {} : {furnishingVersion}),
    floors: [{id: 'floor', rooms: [{id: 'room', ...room}]}],
  }, catalog, templates);
}

// The change from the historical default is exactly one resource reference.
const expected = structuredClone(template(1));
expected.version = 3;
expected.parts.find(part => part.key === 'chair').resource = ladder;
assert.deepEqual(template(3), expected);
assert.deepEqual(template(2).parts.find(part => part.key === 'chair').resource, chair);

const streaming = {purpose: 'streaming', stations: 1};
const work = {purpose: 'work', furniture: 'desk-chair'};
const historical = create(streaming);
const current = create(streaming, 2);
for (const [version, expectedStation, expectedChair] of [[undefined, 1, chair], [1, 1, chair], [2, 3, ladder]]) {
  for (const stations of [1, [{id: 'desk-station'}], undefined]) {
    const document = create({purpose: 'streaming', ...(stations === undefined ? {} : {stations})}, version);
    const stationsInRoom = document.nodes.filter(node => node.kind === 'workstation');
    assert.equal(stationsInRoom.length, stations === undefined ? 2 : 1);
    for (const member of stationsInRoom) {
      assert.deepEqual(member.template, stationRef(expectedStation));
      assert.deepEqual(document.nodes.find(node => node.stationId === member.id && node.partKey === 'chair').resource, expectedChair);
    }
  }
  const independent = create(work, version);
  assert.deepEqual(seat(independent).resource, expectedChair);
  assert.equal(seat(independent).parentId, independent.nodes.find(node => node.kind === 'room').id);
  for (const pinnedVersion of [1, 2]) {
    const pinned = create({purpose: 'streaming', stations: [{id: 'pinned', template: stationRef(pinnedVersion)}]}, version);
    assert.deepEqual(station(pinned).template, stationRef(pinnedVersion));
    assert.deepEqual(seat(pinned).resource, chair);
  }
  const explicit = create({purpose: 'work', furniture: [{id: 'pinned', resource: chair}]}, version);
  assert.deepEqual(seat(explicit).resource, chair);
}
for (const invalid of [0, 3, '2', null]) {
  assert.throws(() => create(work, invalid), {code: 'unsupported-furnishing-version', path: 'input.furnishingVersion'});
}

assert.equal(seat(current).appearance, undefined);
assert.deepEqual(seat(current).transform, seat(historical).transform);
assert.deepEqual(deriveCompany(current, catalog, templates).usePoints, deriveCompany(historical, catalog, templates).usePoints);
const target = stationRef(3);
const upgrade = document => prepareTemplateUpgrade(document, station(document).id, target, context).document;
assert.deepEqual(seat(upgrade(historical)), seat(current));

const color = (document, slot) => change(document, {type: 'set-appearance', id: seat(document).id,
  appearance: {materials: {[slot]: {color: '#674324'}}}});
const oldColor = color(historical, 'chair-seat');
const historicalTemplates = {...templates, templates: [template(1), template(2)]};
const oldSave = await encodeCompanySave(oldColor, catalog, historicalTemplates);
assert.deepEqual(await decodeCompanySave(oldSave, catalog, templates), oldColor);
assert.throws(() => upgrade(oldColor), error =>
  error.code === 'template-upgrade-conflict' && error.details.cause.code === 'unknown-material-slot');
assert.equal(await encodeCompanySave(oldColor, catalog, templates), oldSave);
const custom = color(change(historical, {type: 'replace-resource', id: seat(historical).id,
  resource: {id: 'chair-pedestal', version: 1}}), 'seat');
assert.deepEqual(seat(upgrade(custom)), seat(custom));
const decorated = color(current, 'seat');
const newSave = await encodeCompanySave(decorated, catalog, templates);
assert.deepEqual(await decodeCompanySave(newSave, catalog, templates), decorated);
assert.equal(create(streaming, 2).nodes.find(node => node.partKey === 'chair').appearance, undefined);

console.log(JSON.stringify({status: 'passed', historical: {template: station(historical).template, chair: seat(historical).resource},
  current: {template: station(current).template, chair: seat(current).resource}, independent: seat(create(work, 2)).resource,
  legacyColorUpgrade: 'template-upgrade-conflict / unknown-material-slot', savedHistoricalColorPreserved: true,
  savedCurrentColorPreserved: true, customizedResourceSurvivesUpgrade: true}, null, 2));
