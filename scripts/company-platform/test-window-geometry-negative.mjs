import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateWindowGeometry } from '../../prototype/src/company/window-geometry.js';

globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); } };

const designs = ['square-basic', 'square-detailed', 'wide-square', 'round-detailed'];
const root = new URL('../../', import.meta.url);
const evidenceRoot = new URL('../../evidence/company-window-geometry-negative-v1/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assetPath = design => new URL(`../../prototype/public/company-assets/window-opening-v1/${design}/v1/model.glb`, import.meta.url);
const resourcePath = design => new URL(`../../prototype/public/company-assets/window-opening-v1/${design}/v1/resource.json`, import.meta.url);

async function load(design) {
  const bytes = await fs.readFile(assetPath(design));
  const resourceBytes = await fs.readFile(resourcePath(design));
  const resource = JSON.parse(resourceBytes);
  const pack = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { design, bytes, resourceBytes, resource, root: pack.scene };
}

function validate(scene, resource) {
  validateWindowGeometry(scene, resource, (code, path, message) => {
    const error = new Error(message); error.code = code; error.path = path; throw error;
  });
}

function sourceFrameTriangles(scene) {
  const mesh = scene.getObjectByName('source-frame-detail');
  if (!mesh?.isMesh) return 0;
  return mesh.geometry.index ? mesh.geometry.index.count / 3 : 0;
}

function freshMutation(base, mutation) {
  const scene = base.root.clone(true);
  scene.traverse(node => {
    if (node.geometry) node.geometry = node.geometry.clone();
    if (node.material) node.material = Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone();
  });
  mutation(scene, base.resource);
  scene.updateMatrixWorld(true);
  return scene;
}

function expectReject(name, scene, resource, expectedCodes, checks) {
  try {
    validate(scene, resource);
    checks.push({ name, passed: false, observed: 'unexpected-pass', expectedCodes });
  } catch (error) {
    checks.push({ name, passed: expectedCodes.includes(error.code), code: error.code, path: error.path, expectedCodes });
  }
}

const checks = [], source = [];
for (const design of designs) {
  const base = await load(design);
  const sourceTriangles = sourceFrameTriangles(base.root);
  source.push({ design, glbSha256: hash(base.bytes), resourceSha256: hash(base.resourceBytes), sourceFrameTriangles });
  if (!sourceTriangles) checks.push({ name: `${design}: source-frame-detail has indexed geometry`, passed: false, observed: 'zero-triangles' });
  else checks.push({ name: `${design}: source-frame-detail has indexed geometry`, passed: true, observed: { triangles: sourceTriangles } });

  // Positive readiness gate. This intentionally runs only after the producer
  // announces that all four final GLBs are ready.
  try { validate(base.root, base.resource); checks.push({ name: `${design}: final geometry accepts`, passed: true }); }
  catch (error) { checks.push({ name: `${design}: final geometry accepts`, passed: false, code: error.code, path: error.path }); }

  expectReject(`${design}: opaque glass rejected`, freshMutation(base, scene => {
    for (const name of [base.resource.windowParts.fixedGlass, base.resource.windowParts.movingGlass]) {
      const pane = scene.getObjectByName(name), material = Array.isArray(pane.material) ? pane.material[0] : pane.material;
      material.transparent = false; material.opacity = 1;
    }
  }), base.resource, ['invalid-window-glass'], checks);

  expectReject(`${design}: missing named pane rejected`, base.root.clone(true), { ...base.resource, windowParts: { ...base.resource.windowParts, fixedGlass: 'missing-fixed-glass' } }, ['missing-window-part'], checks);

  expectReject(`${design}: moving glass outside sash rejected`, freshMutation(base, scene => {
    const moving = scene.getObjectByName(base.resource.windowParts.movingGlass);
    scene.add(moving);
  }), base.resource, ['invalid-window-hierarchy'], checks);

  expectReject(`${design}: wrong sash baseline rejected`, freshMutation(base, scene => {
    scene.getObjectByName(base.resource.windowParts.sash).position.x = 0;
  }), base.resource, ['invalid-window-sash-origin'], checks);

  expectReject(`${design}: sealed left aperture rejected`, freshMutation(base, scene => {
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(.30, .80, .02), new THREE.MeshBasicMaterial());
    blocker.name = 'negative-sealed-left-aperture'; blocker.position.set(-.36, 0, .06); scene.add(blocker);
  }), base.resource, ['window-open-aperture-blocked', 'window-closed-gap'], checks);

  expectReject(`${design}: closed glazing gap rejected`, freshMutation(base, scene => {
    const pane = scene.getObjectByName(base.resource.windowParts.movingGlass); pane.scale.x = .1;
  }), base.resource, ['missing-window-glazing', 'window-closed-gap'], checks);

  expectReject(`${design}: sash track intersection rejected`, freshMutation(base, scene => {
    scene.getObjectByName(base.resource.windowParts.fixedGlass).position.z = .10;
  }), base.resource, ['window-track-intersection'], checks);
}

const failures = checks.filter(check => !check.passed);
const report = {
  schema: 'company-window-geometry-negative',
  version: 1,
  status: failures.length ? 'failed' : 'passed',
  source,
  checks,
  runPolicy: 'Run only after the asset producer announces final four GLBs. Preserve prior failed reports under their original evidence identity.',
  scope: 'CPU GLTFLoader, actual indexed mesh and window geometry validator. No browser, GPU, service or runtime hook.',
};
await fs.mkdir(evidenceRoot, { recursive: true });
await fs.writeFile(new URL('report.json', evidenceRoot), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, designs: designs.length, checks: checks.length, failures: failures.length }));
if (failures.length) process.exitCode = 1;
