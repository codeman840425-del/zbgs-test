import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';

// Run from any directory. Validate all generated data before replacing outputs.
const root = new URL('../../', import.meta.url);
const sourcePath = new URL('prototype/src/company/resources.json', root);
const sourceBytes = await readFile(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
assert.equal(sourceHash, '9a55c30df1c4492e1e470b6b1e5e988b4f67024ac9979c85bfc4050437b7f22e',
  'Legacy extraction changed. Review anchors and update the pinned input deliberately.');
const source = JSON.parse(sourceBytes);
const original = new Map(source.resources.map((entry) => [entry.id, entry.node]));
const identity = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
const group = (id, children) => ({ id, type: 'group', ...structuredClone(identity), children });
const reconstruction = [];

function localResource(id, sourceId, childIds, origin, category, options = {}) {
  const sourceNode = original.get(sourceId);
  assert(sourceNode, `Missing ${sourceId}`);
  for (const field of ['position', 'rotation', 'scale']) assert.deepEqual(sourceNode[field], identity[field]);
  const children = sourceNode.children.filter((node) => childIds.includes(node.id));
  assert.equal(children.length, childIds.length, `Missing or duplicate nodes in ${id}`);
  const localChildren = children.map((node) => {
    const local = structuredClone(node);
    local.position = node.position.map((value, axis) => value - origin[axis]);
    return local;
  });
  const resource = {
    id, version: 1, category, mountRole: id,
    provenance: {
      sourceCommit: source.provenance.sourceCommit,
      sourceFile: source.provenance.sourceFile,
      extractedFile: 'prototype/src/company/resources.json', sourceSha256: sourceHash,
      sourceResourceId: sourceId, sourceNodeIds: childIds, originalOrigin: origin,
      method: 'Existing project procedural geometry translated into a reusable local frame.',
      productionScope: 'C1 procedural graybox. Independent C3 model production is unverified.',
    },
    coordinates: {
      units: 'metres', up: '+Y', forward: '+Z',
      origin: options.originDescription ?? 'Ground centre of resource.',
    },
    node: group(`${id}-root`, localChildren), footprint: null, usePoints: [], stateDefaults: {},
    ...options,
  };
  delete resource.originDescription;
  reconstruction.push({ id, origin, original: group(`${id}-root`, structuredClone(children)), local: resource.node });
  return resource;
}

const deskChildren = original.get('desk').children;
const idsStarting = (prefix) => deskChildren.filter((node) => node.id.startsWith(prefix)).map((node) => node.id);
const resources = [
  localResource('desk', 'desk', ['desktop', ...idsStarting('desk-leg-')], [1.15, 0, -1.95], 'decor', {
    footprint: { center: [0, 0], halfSize: [1, 0.5], blocking: true },
    surface: { topY: 0.84, halfSize: [1, 0.5] },
  }),
  localResource('monitor', 'desk', idsStarting('monitor-'), [1.15, 0.84, -2.2], 'dynamic', {
    mount: 'desk-surface',
    originDescription: 'Support plane at original desk top, centred on monitor stem. Screen faces +Z.',
    stateDefaults: { on: true },
  }),
  localResource('keyboard', 'desk', ['keyboard'], [1.15, 0.84, -1.74], 'decor', {
    mount: 'desk-surface',
    originDescription: 'Support plane at original desk top, centred in XZ.',
  }),
  localResource('desk-microphone', 'desk', ['microphone-stand', 'microphone'], [0.35, 0.84, -1.77], 'decor', {
    mount: 'desk-surface',
    originDescription: 'Bottom of vertical desktop microphone stand. Capsule remains vertical.',
  }),
  localResource('chair', 'chair', original.get('chair').children.map((node) => node.id), [0, 0, 0], 'seat', {
    footprint: { center: [0, 0], halfSize: [0.275, 0.255], blocking: true },
    usePoints: [{ id: 'seat', seatHeight: 0.47, seatNodeId: 'chair-seat', backNodeId: 'chair-back' }],
  }),
  localResource('plant', 'plant', original.get('plant').children.map((node) => node.id), [-3.7, 0, -2.8], 'decor', {
    footprint: { center: [0, 0], halfSize: [0.4, 0.4], blocking: true },
  }),
];
resources.find((resource) => resource.id === 'monitor').node.children
  .find((node) => node.id === 'monitor-screen').screen = true;

function box(id, position, size, color) {
  return {
    id, type: 'mesh', ...structuredClone(identity), position,
    geometry: { type: 'BoxGeometry', parameters: size },
    material: { type: 'MeshStandardMaterial', color, roughness: 0.85 },
    castShadow: true, receiveShadow: true,
  };
}
resources.push({
  id: 'fill-light', version: 1, category: 'dynamic', mountRole: 'fill-light',
  provenance: {
    sourceFile: 'scripts/company-platform/build-facility-catalog.mjs',
    method: 'Project-authored procedural stand and rectangular diffuser. No external asset.',
    productionScope: 'C1 procedural graybox. Independent C3 model production is unverified.',
  },
  coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ground centre of stand. Diffuser faces +Z.' },
  node: group('fill-light', [
    box('light-base', [0, 0.025, 0], [0.4, 0.05, 0.4], '#607770'),
    box('light-pole', [0, 0.85, 0], [0.035, 1.65, 0.035], '#a7b3a6'),
    box('light-housing', [0, 1.7, 0], [0.44, 0.34, 0.06], '#6e7b78'),
    box('light-diffuser', [0, 1.7, 0.036], [0.4, 0.3, 0.015], '#fffaf0'),
  ]),
  footprint: { center: [0, 0], halfSize: [0.22, 0.2], blocking: true },
  usePoints: [], stateDefaults: { on: true, intensity: 5 },
  light: {
    kind: 'spot', position: [0, 1.7, 0.05], target: [0.7, 1.2, 1.4],
    color: '#ffffff', intensity: 5, distance: 5, angle: Math.PI / 4, penumbra: 0.6,
  },
});

const part = (key, parentKey, resourceId, position, yaw = 0) => ({
  key, parentKey, requiredRole: resourceId,
  resource: { id: resourceId, version: 1 }, transform: { position, yaw },
});
const catalog = {
  id: 'company-facilities', version: 1, units: 'metres',
  axes: 'Y up; local +Z forward; yaw about +Y', resources,
};
const templates = {
  id: 'company-templates', version: 1,
  coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Station ground centre.' },
  templates: [{
    id: 'stream-station', version: 1,
    assumptions: [
      'Candidate arrangement. Actor reach, seat alignment and microphone contact require runtime verification.',
      'Devices use desk ground-centre coordinates. Their Y=0.84 denotes the desk surface.',
      'Chair faces -Z toward desk and screen. Station +Z points toward seated user.',
    ],
    parts: [
      part('desk', null, 'desk', [0, 0, -0.9]),
      part('monitor', 'desk', 'monitor', [0, 0.84, -0.25]),
      part('keyboard', 'desk', 'keyboard', [0, 0.84, 0.21]),
      part('microphone', 'desk', 'desk-microphone', [-0.8, 0.84, 0.18]),
      part('chair', null, 'chair', [0, 0, 0.55], Math.PI),
      part('fill-light', null, 'fill-light', [-0.75, 0, -0.15]),
    ],
  }],
};

// True Three.js CPU matrices and vertex positions check the reversible split.
function instantiate(node, ids = new Set()) {
  assert(!ids.has(node.id), `Duplicate local node ${node.id}`);
  ids.add(node.id);
  const object = new THREE.Object3D();
  object.name = node.id;
  object.position.fromArray(node.position);
  object.rotation.fromArray(node.rotation);
  object.scale.fromArray(node.scale);
  if (node.type === 'mesh') {
    const Geometry = THREE[node.geometry.type];
    assert.equal(typeof Geometry, 'function');
    object.geometry = new Geometry(...node.geometry.parameters);
  }
  for (const child of node.children ?? []) object.add(instantiate(child, ids));
  return object;
}
let vertexCount = 0;
let maxError = 0;
const splitChecks = reconstruction.map(({ id, origin, original: originalNode, local }) => {
  const expected = instantiate(originalNode);
  const actual = instantiate(local);
  actual.position.fromArray(origin);
  expected.updateMatrixWorld(true);
  actual.updateMatrixWorld(true);
  let vertices = 0;
  expected.traverse((object) => {
    if (!object.geometry) return;
    const restored = actual.getObjectByName(object.name);
    assert(restored);
    const positions = object.geometry.attributes.position;
    assert.equal(positions.count, restored.geometry.attributes.position.count);
    for (let index = 0; index < positions.count; index++) {
      const before = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      const after = new THREE.Vector3().fromBufferAttribute(restored.geometry.attributes.position, index).applyMatrix4(restored.matrixWorld);
      maxError = Math.max(maxError, before.distanceTo(after));
      vertices++;
    }
  });
  vertexCount += vertices;
  return { resourceId: id, vertices, restoredOriginalOrigin: origin };
});
assert(maxError < 1e-12, `Reconstruction error ${maxError}`);
for (const resource of resources) instantiate(resource.node);
for (const template of templates.templates) {
  const keys = new Set();
  for (const entry of template.parts) {
    assert(!keys.has(entry.key));
    assert(entry.parentKey === null || keys.has(entry.parentKey));
    const resource = resources.find((candidate) => candidate.id === entry.resource.id && candidate.version === entry.resource.version);
    assert(resource);
    assert.equal(resource.mountRole, entry.requiredRole);
    if (resource.mount === 'desk-surface') {
      const parentPart = template.parts.find((candidate) => candidate.key === entry.parentKey);
      assert(parentPart, `Missing support for ${entry.key}`);
      const parentResource = resources.find((candidate) => candidate.id === parentPart.resource.id);
      assert(parentResource.surface, `Missing surface for ${entry.key}`);
      assert.equal(entry.transform.position[1], parentResource.surface.topY);
    }
    keys.add(entry.key);
  }
}
function stationAt(x) {
  const station = new THREE.Group();
  station.position.x = x;
  const objects = new Map();
  for (const entry of templates.templates[0].parts) {
    const definition = resources.find((resource) => resource.id === entry.resource.id);
    const object = instantiate(definition.node);
    object.position.fromArray(entry.transform.position);
    object.rotation.y = entry.transform.yaw;
    (entry.parentKey === null ? station : objects.get(entry.parentKey)).add(object);
    objects.set(entry.key, object);
  }
  station.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  station.traverse((object) => {
    if (!object.geometry) return;
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
    }
  });
  assert(bounds.min.x >= -4.5 && bounds.max.x <= 4.5);
  assert(bounds.min.z >= -3.5 && bounds.max.z <= 3.5);
  const monitorWorld = objects.get('monitor').getWorldPosition(new THREE.Vector3());
  assert(monitorWorld.distanceTo(new THREE.Vector3(x, 0.84, -1.15)) < 1e-12);
  return { groundOrigin: [x, 0, 0], min: bounds.min.toArray(), max: bounds.max.toArray() };
}
const twoStationBounds = [-1.5, 1.5].map(stationAt);
assert(twoStationBounds[0].max[0] < twoStationBounds[1].min[0]);
const report = {
  id: 'company-c1-catalog-cpu-v1', sourceSha256: sourceHash,
  dispatch: {
    difficulty: 'standard', model: 'sol (parent-confirmed shorthand)', reasoning_effort: 'medium',
    reason: 'Bounded catalog role and mount metadata correction with deterministic CPU validation.',
    verificationScope: 'Parent-confirmed existing agent configuration. Host hook interception is unverified here.',
  },
  validation: 'CPU geometry only', splitChecks, vertexCount, maxVertexErrorMetres: maxError,
  resourceCount: resources.length, twoStationBounds,
  limitations: [
    'No actor, reach, microphone use, browser or GPU acceptance performed.',
    'Legacy monitor foot bottom is 0.8345m and keyboard bottom is 0.8385m against 0.84m desktop. Original overlaps retained.',
    'Legacy chair mesh seat top is 0.475m. Requested use-point seatHeight is 0.47m.',
    'Desktop cup is intentionally excluded from station resources. Plant is standalone decor.',
    'Fill light output, aim and collision need runtime review. Room placement is owned by the layout.',
  ],
};
const outputs = [
  ['prototype/src/company/facility-catalog.json', catalog],
  ['prototype/src/company/templates.json', templates],
  ['evidence/company-c1-catalog-v1/cpu-report.json', report],
];
for (const [relativePath, value] of outputs) {
  const output = new URL(relativePath, root);
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    assert.equal(await readFile(output, 'utf8'), bytes, `Generated output differs at ${relativePath}`);
  } else {
    await mkdir(new URL('./', output), { recursive: true });
    await writeFile(output, bytes);
  }
}
console.log(JSON.stringify({ mode: process.argv.includes('--check') ? 'check' : 'build', resourceCount: resources.length, vertexCount, maxError, root: fileURLToPath(root) }));
