import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('hairstyle contract audit keeps legacy rows out of new production', async () => {
  const report = JSON.parse(await readFile('evidence/m2-hairstyle-contract-v1/report.json', 'utf8'));
  assert.equal(report.schema, 'm2-hairstyle-contract-v1');
  assert.equal(report.status, 'candidate-only');
  assert.equal(report.runtimeAdmissionChanged, false);
  assert.equal(report.catalogCount, 27);
  assert.equal(report.explicitFitCount, 25);
  assert.equal(report.legacyImplicitFitCount, 2);
  assert.deepEqual(
    report.rows.filter(row => row.status === 'legacy-requires-migration').map(row => row.id).sort(),
    ['female-bob-v1', 'male-sidepart-v1'],
  );
  assert.ok(report.rows.filter(row => row.status === 'candidate-contract-closed').length >= 20);
});
