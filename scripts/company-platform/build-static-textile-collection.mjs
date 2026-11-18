import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildTextileModel, digest, loadTextileStock, projectPath, tools } from './build-static-textile-model.mjs';
import { inspectTextileGeometry } from './test-static-textile-geometry.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-static-textile-v1';
const defaultParameters = family + '/parameters.json';
const contractPath = family + '/contract.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-static-textile-collection.mjs';
const modelPath = 'scripts/company-platform/build-static-textile-model.mjs';
const geometryPath = 'scripts/company-platform/test-static-textile-geometry.mjs';
const publicDir = 'company-assets/static-textile-v1';
const json = content => Buffer.from(JSON.stringify(content, null, 2) + '\n');
const read = relative => fs.readFile(projectPath(root, relative));

const args = parseArgs({
  options: { check: { type: 'boolean' }, write: { type: 'boolean' }, output: { type: 'string' },
    parameters: { type: 'string' }, help: { type: 'boolean' } },
}).values;
if (args.help) {
  console.log('node scripts/company-platform/build-static-textile-collection.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.check, args.write, Boolean(args.output)].filter(Boolean).length, 1, 'Use exactly one of --check, --write or --output NEW_DIRECTORY');
assert(!args.parameters || args.output, 'Alternate parameters require a new --output directory');
const parametersPath = args.parameters ?? defaultParameters;
const [parametersBytes, contractBytes, branchBytes, generatorBytes, modelBytes, geometryBytes] = await Promise.all(
  [parametersPath, contractPath, branchPath, generatorPath, modelPath, geometryPath].map(read),
);
const parameters = JSON.parse(parametersBytes), contract = JSON.parse(contractBytes);
const branch = JSON.parse(branchBytes).groups.flatMap(group => group.branches).find(item => item.id === contract.productionBranch);
const declared = branch.fixedFunctionAndInstall;
assert(declared.mount === 'seat-surface' && declared.state === 'static' && declared.parent === contract.parent);
assert.equal(contract.mount, 'support-surface');
assert.equal(contract.mounting.origin, 'bottom');
for (const axis of ['width', 'height', 'depth']) assert(contract.mounting[axis] > 0 && contract.mounting[axis] <= declared.dimensionsMeters[axis]);
assert.deepEqual(contract.footprint, { center: [0, 0], halfSize: [contract.mounting.width / 2, contract.mounting.depth / 2], blocking: false });
assert(parameters.schema === 'company-static-textile-collection' && parameters.version === 1 && parameters.designs?.length > 0,
  'Expected company-static-textile-collection version 1');
if (!args.parameters) assert.equal(parameters.designs.length, 4);
const dependencies = { model: { path: modelPath, sha256: digest(modelBytes) }, geometryValidation: { path: geometryPath, sha256: digest(geometryBytes) } };
const collection = { schemaVersion: 1, id: 'company-static-textile-v1', generator: generatorPath, generatorSha256: digest(generatorBytes),
  sourceParameters: parametersPath, sourceParametersSha256: digest(parametersBytes),
  contract: contractPath, contractSha256: digest(contractBytes), dependencies, resources: [] };
const files = new Map(), reports = [], stock = new Map(), identities = new Set();
for (const design of parameters.designs) {
  assert(/^[a-z][a-z0-9-]{0,70}$/.test(design.id) && Number.isSafeInteger(design.version) && design.version > 0 &&
    typeof design.displayName === 'string' && design.displayName.trim(), 'Design requires a portable ID, positive version and a display name');
  const identity = `${design.id}@${design.version}`;
  assert(!identities.has(identity), `Duplicate textile version ${identity}`);
  identities.add(identity);
  const source = design.source && parameters.sources[design.source];
  const archive = source && parameters.archives[source.archive];
  assert(!design.source || (source && archive), `Unknown source for ${identity}`);
  if (source && !stock.has(design.source)) stock.set(design.source, await loadTextileStock(root, source, archive));
  const donor = stock.get(design.source);
  const first = await buildTextileModel(design, donor);
  assert.deepEqual(first.bytes, (await buildTextileModel(design, donor)).bytes, `Non-deterministic export ${identity}`);
  const geometry = await inspectTextileGeometry(first.bytes, contract.mounting, design.construction);
  const destination = `${publicDir}/${design.id}/v${design.version}`;
  const asset = { format: 'glb', url: '/' + destination + '/model.glb', sha256: digest(first.bytes), bytes: first.bytes.length };
  const { schema, version, ...resourceContract } = contract;
  const resource = {
    id: design.id, version: design.version, displayName: design.displayName, ...resourceContract,
    materialSlots: first.materialSlots,
    provenance: {
      license: source ? 'CC0-1.0 source fabric geometry with project-authored adaptation' : 'Project-authored geometry and materials',
      sourceDesign: design.construction, tools,
      sourceParameters: parametersPath, sourceParametersSha256: collection.sourceParametersSha256,
      functionalContractSource: contractPath, functionalContractSourceSha256: collection.contractSha256,
      environmentBranchSource: branchPath, environmentBranchSourceSha256: digest(branchBytes), environmentBranch: branch.id,
      generator: generatorPath, generatorSha256: collection.generatorSha256, dependencies,
      ...(source ? {
        sourceArtifactPath: archive.path, sourceArtifactSha256: archive.sha256, sourceModelEntry: source.entry,
        sourceGlbSha256: source.modelSha256, sourcePrimitive: source.primitive, sourceAuthor: archive.author, sourceUrl: archive.url,
        sourceLicense: archive.license, sourceLicenseEntry: archive.licenseEntry, sourceLicenseSha256: archive.licenseSha256,
      } : {}),
    },
    asset,
  };
  const modelPath = 'prototype/public/' + destination + '/model.glb';
  const resourcePath = 'prototype/public/' + destination + '/resource.json';
  files.set(modelPath, first.bytes);
  files.set(resourcePath, json(resource));
  collection.resources.push({ id: design.id, version: design.version, construction: design.construction, resourcePath, modelPath,
    sha256: asset.sha256, triangles: geometry.triangles, geometrySha256: geometry.geometrySha256 });
  reports.push({ id: design.id, version: design.version, asset, geometry, repeatedExportByteIdentical: true });
}
assert.equal(new Set(collection.resources.map(item => item.geometrySha256)).size, collection.resources.length, 'Static textile forms must differ');
files.set(family + '/collection.json', json(collection));

if (args.output) {
  const out = path.resolve(args.output);
  await fs.mkdir(out);
  files.set('report.json', json({ status: 'passed', scope: 'Static textile CPU GLB readback and real mounting contact geometry', resources: reports }));
  for (const [relative, bytes] of files) {
    const target = path.join(out, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
} else {
  const missing = [];
  for (const [relative, bytes] of files) {
    const existing = await read(relative).catch(error => {
      if (error.code === 'ENOENT' && args.write) return null;
      throw error;
    });
    if (existing === null) missing.push([relative, bytes]);
    else assert(existing.equals(bytes), `Existing ${relative} differs. Retain the registered version and use --output first.`);
  }
  for (const [relative, bytes] of missing) {
    const target = projectPath(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
  }
}
console.log(JSON.stringify({ status: 'passed', resources: collection.resources }));
