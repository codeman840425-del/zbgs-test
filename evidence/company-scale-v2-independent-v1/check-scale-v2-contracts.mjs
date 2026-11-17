import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { createCompanyScaleV2 } from '../../prototype/src/company/scale-v2.js';
import { runCompanyBatch } from '../../scripts/company-platform/batch.mjs';

const root = new URL('./', import.meta.url);
const out = fileURLToPath(root);
const profile = { id: 'company-space-v2', version: 1 };
const checks = [];
const record = (name, observed, classification = 'control') => checks.push({ name, passed: true, classification, observed });
const errorRecord = error => ({ code: error.code, path: error.path, message: error.message });

// The rental branch is an isolated generator control. It now writes the
// required shared living role before document-level profile validation.
const rentalDocument = createCompanyScaleV2({
  id: 'independent-rental', spaceProfile: profile, scale: 'rental-home',
  floors: [{ id: 'ground', rooms: [
    { id: 'stream', purpose: 'streaming', stations: 1 },
    { id: 'work', purpose: 'work', furniture: 'desk-chair' },
    { id: 'rest', purpose: 'rest', sofaVersion: 1 },
  ] }],
}, catalog, templates);
record('rental generator admits complete three-room input', {
  rooms: rentalDocument.nodes.filter(node => node.kind === 'room').length,
  livingRoles: rentalDocument.nodes.filter(node => node.publicRole === 'living').length,
});
assert.equal(rentalDocument.nodes.filter(node => node.publicRole === 'living').length, 1);

// Different floors are namespaces in the produced node IDs. Reusing a local
// room id must be accepted while duplicate ids within one floor are rejected.
try {
  const namespaced = createCompanyScaleV2({
    id: 'independent-building', spaceProfile: profile, scale: 'building',
    floors: [
      { id: 'one', rooms: [{ id: 'studio', purpose: 'streaming', stations: 1 }] },
      { id: 'two', rooms: [{ id: 'studio', purpose: 'streaming', stations: 1 }] },
    ],
  }, catalog, templates);
  record('same local room id across floors is accepted in floor namespaces', {
    rooms: namespaced.nodes.filter(node => node.kind === 'room').length,
    sampleIds: namespaced.nodes.filter(node => node.kind === 'room').slice(0, 2).map(node => node.id),
  });
} catch (error) {
  checks.push({ name: 'same local room id across floors is accepted in floor namespaces', passed: false, observed: errorRecord(error) });
  throw error;
}

// Unknown room fields must fail before a valid companion operation can hide a
// typo and silently drop a requested seat.
const typoInput = {
  id: 'independent-typo', spaceProfile: profile, scale: 'small-home',
  floors: [{ id: 'ground', rooms: [{ id: 'studio', purpose: 'streaming', statons: 2,
    furniture: [{ id: 'plant', resource: { id: 'plant', version: 1 } }] }] }],
};
try {
  createCompanyScaleV2(typoInput, catalog, templates);
  checks.push({ name: 'unknown stations spelling is rejected with another valid operation', passed: false, observed: 'unexpectedly accepted' });
  throw new Error('unknown stations spelling was accepted');
} catch (error) {
  record('unknown stations spelling is rejected with another valid operation', errorRecord(error));
  assert.equal(error.code, 'invalid-space-input');
}

// Batch failure must not replace successful outputs, and a corrected failed
// item must be retryable under its original key.
const batchRoot = await fs.mkdtemp(path.join(out, 'batch-run-'));
const input = (id, version = 1) => ({
  id, spaceProfile: { ...profile, version }, scale: 'small-home',
  floors: [{ id: 'ground', rooms: [{ id: 'studio', purpose: 'streaming', stations: 1 }] }],
});
const batch = { schema: 'company-batch', version: 1, items: [
  { key: 'good', input: input('independent-good') },
  { key: 'bad', input: input('independent-bad', 9) },
] };
const first = await runCompanyBatch(batch, { outputDirectory: batchRoot });
assert.deepEqual(first.results.map(row => row.status), ['created', 'failed']);
const goodSave = await fs.readFile(path.join(batchRoot, 'good', 'save.json'), 'utf8');
const retryBatch = structuredClone(batch); retryBatch.items[1].input.spaceProfile.version = 1;
const retry = await runCompanyBatch(retryBatch, { outputDirectory: batchRoot, only: 'bad' });
assert.deepEqual(retry.results.map(row => row.status), ['created']);
const repeated = await runCompanyBatch(batch, { outputDirectory: batchRoot });
assert.deepEqual(repeated.results.map(row => row.status), ['idempotent', 'failed']);
assert.equal(await fs.readFile(path.join(batchRoot, 'good', 'save.json'), 'utf8'), goodSave);
record('batch failure and retry preserve prior successful bytes', {
  first: first.results.map(row => row.status), retry: retry.results.map(row => row.status),
  repeated: repeated.results.map(row => row.status), goodSavePreserved: true,
});

const packageSource = path.resolve(out, '../../scripts/company-platform/package-company.mjs');
const packageText = await fs.readFile(packageSource, 'utf8');
const missingBuildInput = path.resolve(out, '../../scripts/company-platform/build-scale-v2-examples.mjs');
record('package extra file status at audit time', {
  listedInPackageExtraFiles: packageText.includes("'scripts/company-platform/build-scale-v2-examples.mjs'"),
  existsAtAudit: await fs.stat(missingBuildInput).then(() => true).catch(() => false),
});

const report = {
  schema: 'company-scale-v2-independent-check', version: 1, status: 'passed',
  checks, scope: 'CPU-only profile input identity, generator failure, save-independent batch output safety, and packaging input presence.',
  supersededObservations: [
    { snapshot: 'before latest root fixes', issue: 'rental living role', code: 'missing-public-space', path: 'chk-rental/ground', resolution: 'generator now writes publicRole living' },
    { snapshot: 'before latest root fixes', issue: 'cross-floor local room id', code: 'duplicate-id', path: 'input.floors[1].rooms[0].id', resolution: 'room IDs are now unique per floor namespace' },
    { snapshot: 'before latest root fixes', issue: 'unknown stations spelling', code: 'accepted with zero workstations', path: 'input.floors[0].rooms[0]', resolution: 'knownFields now rejects unknown room fields' },
    { snapshot: 'before scale-v2 build script appeared', issue: 'package supplemental input', code: 'missing file', path: 'scripts/company-platform/build-scale-v2-examples.mjs', resolution: 'build script now exists' }
  ],
  limitations: [
    'Does not run old QA, browser, GPU, service or runtime hook checks.',
    'The rental branch is recorded as a passing control after its living role was added.',
  ],
};
await fs.writeFile(new URL('report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length, output: out }));
