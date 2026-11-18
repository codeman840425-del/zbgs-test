import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.({target: this});
    }).catch(error => this.onerror?.(error));
  }
};

const root = new URL('../../', import.meta.url);
const collectionPath = new URL('assets-source/company-desktop-computer-v1/collection.json', root);
const collection = JSON.parse(await fs.readFile(collectionPath));
assert.equal(collection.id, 'company-desktop-computer-v1');
assert.equal(collection.resources.length, 4);
assert.equal(collection.verification.cpuOnly, true);
assert.equal(collection.verification.visiblePowerStatusEndpoint, true);

const checks = [];
for (const record of collection.resources) {
  const resource = JSON.parse(await fs.readFile(new URL(record.resourcePath, root)));
  const bytes = await fs.readFile(new URL(record.modelPath, root));
  assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(resource.mount, 'desk-surface');
  assert.equal(resource.parent, 'desk.desktop');
  assert.deepEqual(resource.mounting, {width: 0.22, height: 0.45, depth: 0.45, origin: 'desk contact plane centred under the asset'});
  assert.equal(resource.powerStatusEndpoint.visible, true);
  assert.equal(resource.powerStatusEndpoint.node, 'power-status');
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = loaded.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  assert(bounds.min.y >= -0.000001 && bounds.max.y <= 0.451);
  assert(bounds.min.x >= -0.111 && bounds.max.x <= 0.111);
  assert(bounds.min.z >= -0.226 && bounds.max.z <= 0.226);
  const nodes = [];
  const geometryHash = createHash('sha256');
  scene.traverse(node => {
    if (!node.isMesh) return;
    nodes.push(node.name);
    const position = node.geometry.getAttribute('position');
    assert(position?.count);
    geometryHash.update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength));
  });
  assert(nodes.includes('power-status'));
  for (const names of Object.values(resource.materialSlots)) for (const name of names) assert(nodes.includes(name));
  assert.equal(record.geometrySha256, geometryHash.digest('hex'));
  checks.push({
    id: record.id,
    sha256: record.sha256,
    geometrySha256: record.geometrySha256,
    nodeCount: nodes.length,
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    powerStatusNode: 'power-status',
    cpuOnly: true,
    gltfReadback: true
  });
}
assert.equal(new Set(checks.map(item => item.geometrySha256)).size, 4);
const report = {
  status: 'passed',
  schema: 'company-desktop-computer-cpu-qa-v1',
  collection: collection.id,
  checks,
  assertions: [
    'Four stable resource IDs and four distinct geometry hashes',
    'Desk-surface mount, parent and fixed envelope read back from every resource',
    'Every GLB is self-contained and readable by GLTFLoader on CPU',
    'Visible power-status node and material slots are present in every GLB'
  ],
  limitations: [
    'No browser scene, save/restore or visual acceptance in this CPU-only package.',
    'No real computer behavior, cable routing or character use.'
  ]
};
const output = new URL('evidence/company-desktop-computer-v1/qa-report.json', root);
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, resources: checks.length, output: output.pathname}));
