import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { compareFacilityFunction } from '../../prototype/src/company/appearance-contract.js';
import { deriveCompany, prepareCompanyChange } from '../../prototype/src/company/document.js';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import { decodeCompanySave, encodeCompanySave } from '../../prototype/src/company/persistence.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import loungeBatch from './batch-inputs/lounge-rooms.json' with { type: 'json' };
import { runCompanyBatch } from './batch.mjs';

const root = new URL('../../', import.meta.url);
const refs = ['books', 'plant', 'radio', 'open-box'].map(variant => ({ id: `tabletop-${variant}-kenney`, version: 1 }));
const fixtures = ['studio-lounge', 'rental-lounge'];
const options = { catalog, templates };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const change = (document, operations) => prepareCompanyChange(document, operations, options).document;
const write = (file, content) => fs.writeFile(file, content, { flag: 'wx' });
const writeJson = (file, content) => write(file, JSON.stringify(content, null, 2) + '\n');

function definition({ id, version }) {
  const resource = catalog.resources.find(candidate => candidate.id === id && candidate.version === version);
  assert(resource, `Missing resource ${id}@${version}`);
  return resource;
}

async function inspectGeometry(ref, control) {
  const resource = definition(ref);
  assert(compareFacilityFunction(control, resource).compatible, resource.id);
  const recipePath = new URL(resource.provenance.sourceParameters, root);
  const generator = await import(new URL(resource.provenance.generator, root));
  const rebuilt = await generator.buildTabletopOrnament(recipePath);
  const asset = await fs.readFile(new URL('prototype/public' + resource.asset.url, root));
  assert.equal(sha256(asset), resource.asset.sha256);
  assert.deepEqual(rebuilt.bytes, asset);

  const bytes = asset.buffer.slice(asset.byteOffset, asset.byteOffset + asset.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  scene.updateMatrixWorld(true);
  const entry = {
    ...ref, source: resource.provenance.sourceModelEntry, sourceSha256: resource.provenance.sourceGlbSha256,
    assetSha256: resource.asset.sha256, bytes: asset.length,
  };
  const bounds = new Box3().setFromObject(scene, true);
  entry.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  assert(Math.abs(bounds.min.y) < 1e-6);
  const triangles = [];
  const contacts = new Map();
  const materials = new Set();
  let meshCount = 0;
  scene.traverse(node => {
    if (!node.isMesh) return;
    meshCount++;
    for (const material of [node.material].flat()) materials.add(material);
    const points = node.geometry.getAttribute('position');
    const index = node.geometry.getIndex();
    for (let offset = 0; offset < (index?.count ?? points.count); offset += 3) {
      const vertices = [0, 1, 2].map(delta => {
        const vertexIndex = index?.getX(offset + delta) ?? offset + delta;
        return new Vector3().fromBufferAttribute(points, vertexIndex).applyMatrix4(node.matrixWorld);
      });
      const key = vertices.map(point => point.toArray().map(value => value.toFixed(7)).join(',')).sort().join(':');
      triangles.push(key);
      if (!vertices.every(point => Math.abs(point.y) < 1e-6)) continue;
      const [a, b, c] = vertices;
      const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
      if (area > 1e-10) contacts.set(key, area);
    }
  });
  entry.triangleCount = triangles.length;
  entry.meshCount = meshCount;
  entry.materialCount = materials.size;
  for (const key of ['triangleCount', 'meshCount', 'materialCount']) assert.equal(entry[key], rebuilt.report[key]);
  entry.geometrySha256 = sha256(triangles.sort().join('\n'));
  entry.uniqueContactTriangles = contacts.size;
  entry.uniqueContactAreaSquareMetres = [...contacts.values()].reduce((sum, area) => sum + area, 0);
  entry.summedContactAreaSquareMetres = rebuilt.report.bottomContactAreaSquareMetres;
  assert(entry.uniqueContactAreaSquareMetres > 0);

  if (resource.id === 'tabletop-open-box-kenney') {
    entry.apertureAndFlapHeights = [0, -.05, .05].map(x => {
      const ray = new Raycaster(new Vector3(x, 1, 0), new Vector3(0, -1, 0));
      const intersection = ray.intersectObject(scene, true)[0];
      assert(intersection, `No open-box geometry under x=${x}`);
      return intersection.point.y;
    });
    const [centre, ...flaps] = entry.apertureAndFlapHeights;
    assert(Math.abs(centre) < 1e-6 && flaps.every(y => y > .09));
    assert.equal(entry.uniqueContactTriangles, 6);
  }
  return entry;
}

async function verifyLayout(outputDirectory, fixture) {
  const originalSave = await fs.readFile(path.join(fixture.directory, 'save.json'), 'utf8');
  const original = await decodeCompanySave(originalSave, catalog, templates);
  const roomId = `${original.id}/ground/lounge`;
  const parentId = `${roomId}/cup-table`;
  const id = `${roomId}/sourced-ornament`;
  const installation = {
    type: 'add-facility', id, parentId, attachment: { surfaceId: 'top' }, resource: refs[0],
    transform: { position: [.035, .5, -.012], yaw: Math.PI / 2 },
  };
  const opening = change(original, [{ type: 'remove', id: `${roomId}/cup` }, installation]);
  const derived = deriveCompany(opening, catalog, templates);
  const initialNode = derived.nodes.get(id);
  assert.deepEqual(initialNode.attachment, installation.attachment);
  const record = {
    fixture: fixture.key, companyId: original.id, roomId, roomBounds: derived.nodes.get(roomId).bounds,
    parentId, instanceId: id, world: derived.worlds.get(id), replacements: [],
  };
  let fourth;
  for (const source of refs) {
    const previous = change(opening, [{ type: 'replace-resource', id, resource: source }]);
    for (const target of refs.filter(candidate => candidate !== source)) {
      const previousText = JSON.stringify(previous);
      const next = change(previous, [{ type: 'replace-resource', id, resource: target }]);
      assert.equal(JSON.stringify(previous), previousText);
      inspectCompanyPlacement(next, catalog, templates);
      assert.deepEqual(next.nodes.find(node => node.id === id), { ...initialNode, resource: target });
      assert.deepEqual(deriveCompany(next, catalog, templates).worlds.get(id), record.world);
      assert.deepEqual(next.nodes.filter(node => node.id !== id), previous.nodes.filter(node => node.id !== id));
      const saved = await encodeCompanySave(next, catalog, templates);
      assert.deepEqual(await decodeCompanySave(saved, catalog, templates), next);
      record.replacements.push({ from: source.id, to: target.id, saveSha256: sha256(saved) });
      if (source === refs[0] && target === refs.at(-1)) fourth = { document: next, save: saved };
    }
  }
  assert(fourth);
  const before = await encodeCompanySave(fourth.document, catalog, templates);
  assert.throws(() => change(fourth.document, [{
    type: 'move', id, transform: { position: [.035, .5, .08], yaw: Math.PI / 2 },
  }]), { code: 'invalid-support-fit' });
  assert.equal(await encodeCompanySave(fourth.document, catalog, templates), before);
  await writeJson(path.join(outputDirectory, `${fixture.key}-with-open-box.layout.json`), fourth.document);
  await write(path.join(outputDirectory, `${fixture.key}-with-open-box.save.json`), fourth.save);
  return record;
}

const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length || output.startsWith('-')) {
  throw new Error('Usage: node scripts/company-platform/test-four-sourced-ornaments.mjs NEW_OUTPUT_DIRECTORY');
}
const outputDirectory = path.resolve(output);
try {
  await fs.mkdir(outputDirectory);
} catch (error) {
  if (error.code === 'EEXIST') throw new Error(`Output directory already exists: ${outputDirectory}`, { cause: error });
  throw error;
}
const base = await runCompanyBatch(loungeBatch, { outputDirectory: path.join(outputDirectory, 'base-layouts') });
assert(base.ok, JSON.stringify(base));
assert.deepEqual(base.results.map(item => item.key).sort(), [...fixtures].sort());
assert(base.results.every(item => item.status === 'created'), JSON.stringify(base));

const control = definition({ id: 'tabletop-ornament-vase', version: 1 });
const geometry = [];
for (const ref of refs) geometry.push(await inspectGeometry(ref, control));
assert.equal(new Set(geometry.map(item => item.geometrySha256)).size, refs.length);
assert.equal(new Set(geometry.map(item => item.sourceSha256)).size, refs.length);
const layouts = [];
for (const fixture of base.results) layouts.push(await verifyLayout(outputDirectory, fixture));
assert.notEqual(layouts[0].companyId, layouts[1].companyId);
assert.notDeepEqual(layouts[0].roomBounds, layouts[1].roomBounds);

const report = {
  status: 'passed', contract: 'tabletop-ornament / support-surface / table top',
  baseInput: 'scripts/company-platform/batch-inputs/lounge-rooms.json', geometry, layouts,
  rejectsOutOfBoundsPlacement: true,
  scope: 'CPU actual GLB binary reproduction, geometry and support, document replacements and save/restore',
};
const reportPath = path.join(outputDirectory, 'report.json');
await writeJson(reportPath, report);
console.log(JSON.stringify({
  status: report.status, resources: geometry.length, layoutFixtures: layouts.length,
  directionalSwaps: layouts.flatMap(layout => layout.replacements).length, report: reportPath,
}));
