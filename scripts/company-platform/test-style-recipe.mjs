import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { applyStyleRecipe, publishStyleRecipeResult } from './apply-style-recipe.mjs';
import { encodeCompanySave, decodeCompanySave } from '../../prototype/src/company/persistence.js';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const root = new URL('../../', import.meta.url);
const warm = await read(new URL('scripts/company-platform/style-recipes/warm-live.json', root));
const cool = await read(new URL('scripts/company-platform/style-recipes/cool-work.json', root));
const layouts = [await read(new URL('prototype/src/company/examples/c2-mixed-company.json', root)), await read(new URL('prototype/src/company/examples/c2-small-home.json', root))];
const checks = [];
const record = (name, observed) => checks.push({ name, passed: true, observed });
const facilitySnapshot = doc => new Map(doc.nodes.filter(node => node.kind === 'facility').map(node => [node.id, { resource: node.resource, parentId: node.parentId, transform: node.transform, state: node.state }]));
const effectiveStates = doc => new Map(doc.nodes.filter(node => node.kind === 'facility').map(node => {
  const resource = catalog.resources.find(value => value.id === node.resource.id && value.version === node.resource.version);
  return [node.id, { ...resource?.stateDefaults, ...node.state }];
}));

const firstBefore = facilitySnapshot(layouts[0]);
const firstStatesBefore = effectiveStates(layouts[0]);
const firstResult = applyStyleRecipe(layouts[0], warm, { catalog, templates });
const firstAfter = facilitySnapshot(firstResult.document);
const firstStatesAfter = effectiveStates(firstResult.document);
assert.equal(firstResult.operations.length > 0, true);
assert.equal(firstAfter.size, firstBefore.size);
for (const [id, before] of firstBefore) {
  const after = firstAfter.get(id);
  assert.deepEqual(after.parentId, before.parentId);
  assert.deepEqual(after.transform, before.transform);
  assert.deepEqual(firstStatesAfter.get(id), firstStatesBefore.get(id));
}
record('Warm recipe changes compatible resources while preserving facility identity, parent and transforms', { operations: firstResult.operations.length, facilities: firstAfter.size });

const secondResult = applyStyleRecipe(layouts[1], cool, { catalog, templates });
assert.equal(secondResult.document.id, layouts[1].id);
assert.equal(facilitySnapshot(secondResult.document).size, facilitySnapshot(layouts[1]).size);
record('Second layout accepts the same recipe mechanism with independent identities', { layout: layouts[1].id, operations: secondResult.operations.length });
const smallHomeReplacements = secondResult.operations.filter(operation => operation.type === 'replace-resource');
assert(smallHomeReplacements.length > 0, 'Small-home recipe must replace at least one facility appearance');
record('Small-home recipe resolves base facility resources instead of silently skipping them', { replacements: smallHomeReplacements.length, changedIds: smallHomeReplacements.map(operation => operation.id) });

const unchanged = JSON.stringify(layouts[0]);
assert.throws(() => applyStyleRecipe(layouts[0], { ...warm, facilities: { default: { desk: { id: 'missing-desk', version: 1 } } } }, { catalog, templates }), error => error.code === 'invalid-style-recipe');
assert.equal(JSON.stringify(layouts[0]), unchanged);
record('Unknown or incompatible resource fails before changing the input document', { code: 'invalid-style-recipe' });

const saved = await encodeCompanySave(firstResult.document, catalog, templates);
const restored = await decodeCompanySave(saved, catalog, templates);
assert.deepEqual(restored, firstResult.document);
record('Style result preserves the existing save and dependency pin chain', { bytes: Buffer.byteLength(saved) });

assert.throws(() => applyStyleRecipe(layouts[0], { ...warm, version: 2 }, { catalog, templates }), error => error.code === 'invalid-style-recipe');
record('Unsupported recipe version is rejected', { code: 'invalid-style-recipe' });

const publishDir = new URL('evidence/company-style-recipe-v1/atomic-publish/', root);
await fs.rm(publishDir, { recursive: true, force: true });
await fs.mkdir(publishDir, { recursive: true });
const publishOutput = fileURLToPath(new URL('warm.json', publishDir));
const publishManifest = `${publishOutput}.style.json`;
const publishBytes = Buffer.from(JSON.stringify(firstResult.document, null, 2) + '\n');
const publishManifestBytes = Buffer.from(JSON.stringify({ schema: 'company-style-recipe-result@1' }) + '\n');
await publishStyleRecipeResult(publishOutput, publishBytes, publishManifestBytes);
assert.equal((await fs.readFile(publishOutput)).equals(publishBytes), true);
assert.equal((await fs.readFile(publishManifest)).equals(publishManifestBytes), true);
await assert.rejects(() => publishStyleRecipeResult(publishOutput, Buffer.from('replacement\n'), publishManifestBytes), error => error.code === 'style-output-exists');
assert.equal((await fs.readFile(publishOutput)).equals(publishBytes), true);
assert.equal((await fs.readFile(publishManifest)).equals(publishManifestBytes), true);
record('Style output and manifest publish as a pair and preserve an existing result on retry', { output: publishOutput, preserved: true });

const report = { status: 'passed', schema: 'company-style-recipe@1', checks, limits: ['Recipes reuse existing resource and surface contracts.', 'No player economy or real-character C3 behavior is included.', 'Browser and ordinary-PC performance require separate evidence.'] };
await fs.mkdir(new URL('evidence/company-style-recipe-v1/', root), { recursive: true });
await fs.writeFile(new URL('evidence/company-style-recipe-v1/report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length, report: 'evidence/company-style-recipe-v1/report.json' }));
