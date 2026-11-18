import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const catalogPath = new URL('prototype/src/company/library-catalog.json', root);
const collectionPath = new URL('assets-source/company-camera-background-v1/collection.json', root);
const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
const resources = [];
for (const record of collection.resources) {
  const resource = JSON.parse(await fs.readFile(new URL(record.resourcePath, root), 'utf8'));
  assert.equal(resource.id, record.id);
  assert.equal(resource.version, 1);
  assert.equal(resource.asset?.sha256, record.sha256);
  resources.push(resource);
}
assert.equal(resources.length, 8);
assert.equal(new Set(resources.map(r => r.id)).size, resources.length);
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const retained = catalog.resources.filter(resource => !resources.some(next => next.id === resource.id && next.version === resource.version));
catalog.resources = [...retained, ...resources];
const output = Buffer.from(JSON.stringify(catalog, null, 2) + '\n');
if (process.argv.includes('--check')) assert((await fs.readFile(catalogPath)).equals(output), 'Camera/background catalog registration is stale');
else await fs.writeFile(catalogPath, output);
console.log(JSON.stringify({status: 'passed', mode: process.argv.includes('--check') ? 'check' : 'write', registered: resources.map(r => ({id: r.id, productionBranch: r.productionBranch, mount: r.mount}))}));
