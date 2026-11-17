import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { createCompanyScaleV2 } from '../../prototype/src/company/scale-v2.js';
import { deriveCompany, serializeCompany } from '../../prototype/src/company/document.js';
import { inspectCompanyConnections } from '../../prototype/src/company/space.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';

const root = new URL('../../', import.meta.url);
const here = fileURLToPath(import.meta.url);
const check = process.argv.includes('--check');
const presets={smallHome:'small-home.json',studio:'studio.json',base:'single-room.json',alternate:'single-alternate.json',rental:'rental-home.json',flat:'leased-floor.json',twoFloors:'two-floors.json',building:'five-floors-16.json'};
const inputNames=[...Object.values(presets),'six-floors-16.json'];
const previewDocuments={};
const outputRoot = new URL('../../evidence/company-scale-v2-generation-v1/', import.meta.url);

async function readInput(name) {
  return JSON.parse(await fs.readFile(new URL(`./space-v2-inputs/${name}`, import.meta.url), 'utf8'));
}

function summarize(document, inputName) {
  const derived = deriveCompany(document, catalog, templates);
  const connections = inspectCompanyConnections(document, catalog, templates);
  const placement = inspectCompanyPlacement(document, catalog, templates);
  const floors = document.nodes.filter(node => node.kind === 'floor').map(floor => {
    const regions = document.nodes.filter(node => node.parentId === floor.id && ['room', 'area'].includes(node.kind));
    return {
      id: floor.id,
      rooms: regions.filter(node => node.kind === 'room').map(node => ({ id: node.id, purpose: node.purpose, area: node.bounds.width * node.bounds.depth })),
      publicAreas: regions.filter(node => node.kind === 'area').map(node => ({ id: node.id, role: node.publicRole, width: node.bounds.width, depth: node.bounds.depth })),
      connectionCount: connections.floors.find(entry => entry.floorId === floor.id)?.connections.length ?? 0,
    };
  });
  return {
    input: inputName,
    id: document.id,
    scale: document.scale,
    profile: document.spaceProfile,
    floors,
    counts: {
      floors: floors.length,
      rooms: floors.reduce((sum, floor) => sum + floor.rooms.length, 0),
      publicAreas: floors.reduce((sum, floor) => sum + floor.publicAreas.length, 0),
      workstations: derived.capacity.installedStations,
      checkedPoints: placement.checkedPoints.length,
      checkedPortals: placement.checkedPortals.length,
    },
    limits: connections.limits,
  };
}

async function writeOrCheck(file, bytes) {
  const target = new URL(file, outputRoot);
  if (check) assert.equal(await fs.readFile(target, 'utf8'), bytes, `Generated output differs ${file}`);
  else {
    await fs.mkdir(new URL('./', target), { recursive: true });
    await fs.writeFile(target, bytes, 'utf8');
  }
}

const examples = [];
for (const inputName of inputNames) {
  const input = await readInput(inputName);
  const document = createCompanyScaleV2(input, catalog, templates);
  const serialized = serializeCompany(document, catalog, templates);
  const alias=Object.keys(presets).find(k=>presets[k]===inputName);if(alias)previewDocuments[alias]=document;
  const summary = summarize(document, inputName);
  const stem = inputName.replace(/\.json$/, '');
  await writeOrCheck(`${stem}.company.json`, serialized);
  await writeOrCheck(`${stem}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  examples.push({ stem, summary, documentSha256: createHash('sha256').update(serialized).digest('hex') });
}

const smallHomeCombination = {
  id: 'company-space-v2-small-home-combination',
  name: 'small-home static placement rejection',
  scale: 'small-home',
  spaceProfile: { id: 'company-space-v2', version: 1 },
  floors: [{ id: 'ground', rooms: [{ id: 'room', purpose: 'streaming', stations: 1, sofaVersion: 1 }] }],
};
let smallHomeRejection;
try {
  createCompanyScaleV2(smallHomeCombination, catalog, templates);
  smallHomeRejection = { status: 'unexpected-pass' };
} catch (error) {
  smallHomeRejection = { status: 'rejected', code: error.code, path: error.path, message: error.message,
    details: error.details ?? {} };
}
await writeOrCheck('small-home-station-sofa-rejection.json', `${JSON.stringify(smallHomeRejection, null, 2)}\n`);

const previewTarget=new URL('../../prototype/src/company/examples/c2-scale-v2.json',import.meta.url),previewBytes=JSON.stringify(previewDocuments,null,2)+'\n';
if(check)assert.equal(await fs.readFile(previewTarget,'utf8'),previewBytes,'Preview presets differ');else await fs.writeFile(previewTarget,previewBytes);

const report = {
  status: 'passed',
  generatedBy: 'scripts/company-platform/build-scale-v2-examples.mjs',
  inputs: inputNames,
  examples,
  smallHomeRejection,
  sourceSha256: createHash('sha256').update(await fs.readFile(here)).digest('hex'),
  verification: [
    'CPU createCompanyScaleV2 generation followed by deriveCompany, inspectCompanyConnections and inspectCompanyPlacement.',
    'Two-floor example retains explicit floor and room identities while filling each floor to 16 rooms.',
    'Five-floor example contains 5 x 16 business rooms without loading 100 character actors.',
    'No browser, GPU, network service or rendering process is used by this script.',
  ],
  limitations: [
    'Static placement and portal checks do not prove character navigation, vertical travel, elevator or stair behaviour.',
    'Small-home 4.5 x 4 m with one workstation and an optional sofa is rejected by the conservative placement grid. The sofa-only and workstation-only variants pass without resizing furniture.',
  ],
};
await writeOrCheck('report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, examples: examples.map(example => ({ stem: example.stem, counts: example.summary.counts })) }));
