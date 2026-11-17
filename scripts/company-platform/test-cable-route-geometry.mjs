import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { validateCableRouteGeometry } from '../../prototype/src/company/cable-route-geometry.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); }
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const productionDirectory = 'evidence/company-cable-route-production-v1';
const geometryDirectory = 'evidence/company-cable-route-geometry-v1';
await fs.mkdir(productionDirectory, { recursive: true });
await fs.mkdir(geometryDirectory, { recursive: true });
const fail = (code, location, message, details) => { throw Object.assign(new Error(message), { code, path: location, details }); };
const invoke = (scene, resource) => validateCableRouteGeometry(scene, resource, fail);
const models = new Map();
const checks = [];
const sourceFiles = ['assets-source/company-cable-route-v1/parameters.json', 'scripts/company-platform/build-cable-route.mjs', 'prototype/src/company/cable-route-geometry.js', 'scripts/company-platform/test-cable-route-geometry.mjs'];
const sourceHashes = {};
for (const filename of sourceFiles) sourceHashes[filename] = sha(await fs.readFile(filename));

async function load(directory) {
  const bytes = await fs.readFile(path.join(directory, 'model.glb'));
  const resource = JSON.parse(await fs.readFile(path.join(directory, 'resource.json'), 'utf8'));
  assert.equal(sha(bytes), resource.asset.sha256);
  assert.equal(bytes.length, resource.asset.bytes);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  assert(!json.animations?.length && !json.images?.length && !json.textures?.length && !json.skins?.length);
  assert((json.materials?.length ?? 0) <= 4);
  assert(!json.extensionsUsed?.includes('KHR_lights_punctual'));
  assert(json.buffers?.every(buffer => buffer.uri === undefined));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.traverse(node => {
    if (!node.isMesh) return;
    assert(node.position.length() < 1e-6 && node.rotation.toArray().slice(0, 3).every(value => Math.abs(value) < 1e-6) && node.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6, `${resource.id} mesh ${node.name} is not baked to identity transform`);
  });
  return { bytes, resource, scene, json };
}

async function exportMutation(id, base, mutation, expectedCodes) {
  const scene = base.scene.clone(true);
  scene.traverse(node => { if (node.isMesh) node.geometry = node.geometry.clone(); });
  const resource = structuredClone(base.resource);
  mutation(scene, resource);
  const bytes = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true }));
  const filename = `${id}.glb`;
  await fs.writeFile(path.join(productionDirectory, filename), bytes);
  const { scene: actualScene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let error;
  try { invoke(actualScene, resource); } catch (caught) { error = caught; }
  assert(error, `${id} unexpectedly passed`);
  assert(expectedCodes.includes(error.code), `${id} expected ${expectedCodes}, got ${error.code}: ${error.message}`);
  const report = { id, model: `${productionDirectory}/${filename}`, sha256: sha(bytes), bytes: bytes.length, rejected: true,
    error: { code: error.code, path: error.path, message: error.message, details: error.details } };
  checks.push(report);
  await fs.writeFile(path.join(productionDirectory, `${id}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

let failure;
try {
  for (const id of ['single-sleeve', 'dual-sleeve', 'braided-loop', 'flat-ribbon']) {
    const fixture = await load(`prototype/public/company-assets/cable-route-v1/${id}/v1`);
    const actual = invoke(fixture.scene, fixture.resource);
    models.set(id, fixture);
    fixture.resource.checks = { readback: actual, connected: true, physics: 'static-restricted-line-only' };
    await fs.writeFile(`prototype/public/company-assets/cable-route-v1/${id}/v1/resource.json`, `${JSON.stringify(fixture.resource, null, 2)}\n`);
    checks.push({ id, sha256: sha(fixture.bytes), bytes: fixture.bytes.length, actual });
  }
  const single = models.get('single-sleeve');
  await exportMutation('broken-end', single, scene => {
    const mesh = scene.getObjectByName('single-sleeve-route');
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) if (positions.getX(index) > 0.4) positions.setX(index, positions.getX(index) - 0.2);
  }, ['cable-endpoint-contact', 'cable-continuity']);
  await exportMutation('thin-sheet', single, scene => {
    scene.traverse(node => { if (node.isMesh) { const p = node.geometry.getAttribute('position'); for (let index = 0; index < p.count; index += 1) p.setY(index, 0); } });
  }, ['cable-positive-thickness', 'cable-solid-volume']);
  await exportMutation('outside-envelope', single, scene => {
    const p = scene.getObjectByName('single-sleeve-route').geometry.getAttribute('position');
    for (let index = 0; index < p.count; index += 1) if (Math.abs(p.getX(index)) < 0.12) p.setY(index, p.getY(index) + 0.04);
  }, ['cable-envelope']);
  await exportMutation('duplicate-endpoint-floating', single, scene => {
    const duplicate = scene.getObjectByName('endpoint-A').clone(); duplicate.name = 'endpoint-A'; scene.add(duplicate);
    const mesh = scene.getObjectByName('single-sleeve-route'); mesh.position.y = 0.02;
  }, ['cable-endpoint-uniqueness']);
  await exportMutation('floating-segment', models.get('braided-loop'), scene => {
    const mesh = scene.getObjectByName('braided-strand-B'); mesh.position.z += 0.025;
  }, ['cable-envelope', 'cable-continuity']);
  const regenerationRoot = path.resolve(productionDirectory, 'single-width-0.009');
  await fs.rm(regenerationRoot, { recursive: true, force: true });
  execFileSync(process.execPath, ['scripts/company-platform/build-cable-route.mjs', '--single-width=0.009', `--out-dir=${regenerationRoot}`], { cwd: process.cwd(), stdio: 'pipe' });
  const regeneration = [];
  for (const [id, fixture] of models) {
    const after = await load(path.join(regenerationRoot, id, 'v1'));
    const actual = invoke(after.scene, after.resource);
    const changed = sha(fixture.bytes) !== sha(after.bytes);
    assert.equal(changed, id === 'single-sleeve');
    regeneration.push({ id, beforeSha256: sha(fixture.bytes), afterSha256: sha(after.bytes), changed, actual });
  }
  await fs.writeFile(path.join(productionDirectory, 'parameter-regeneration.json'), `${JSON.stringify({ status: 'passed', parameter: 'single-sleeve width', before: 0.010, after: 0.009, output: regenerationRoot, assets: regeneration }, null, 2)}\n`);
  checks.push({ id: 'independent-parameter-regeneration', passed: true, assets: regeneration });
} catch (error) { failure = { message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack }; }
const report = { status: failure ? 'failed' : 'passed', profile: 'company-cable-route-v1', sourceHashes, checks, failure,
  limits: ['Production-source static route samples use fixed local endpoints. Actual device route, variable distance and parent transformation require shared runtime integration evidence.', 'No flexible physics, cable tension, electrical simulation or ordinary-computer performance acceptance.'] };
await fs.writeFile(path.join(geometryDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(productionDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, checks: checks.length, report: `${geometryDirectory}/report.json`, failure }, null, 2));
if (failure) process.exitCode = 1;
