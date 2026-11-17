import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { adaptCableGeometry, validateCableVisualPlacement } from '../../prototype/src/company/cable-render.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); } };
const root = process.cwd(), ids = ['single-sleeve', 'dual-sleeve', 'braided-loop', 'flat-ribbon'];
const loadScene = async id => {
  const bytes = await fs.readFile(path.join(root, 'prototype/public/company-assets/cable-route-v1', id, 'v1/model.glb'));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true); return { scene, bytes };
};
const bounds = object => new THREE.Box3().setFromObject(object);
const dims = object => bounds(object).getSize(new THREE.Vector3()).toArray();
const fail = (code, id, message, details) => { throw Object.assign(new Error(message), { code, id, details }); };
const checks = [], assets = [];

for (const id of ids) {
  const fixture = await loadScene(id), beforeA = dims(fixture.scene.getObjectByName('endpoint-A')), beforeHead = dims(fixture.scene.getObjectByName('plug-A-head'));
  assert(beforeA[1] > .005 && beforeA[2] > .015); assert(beforeHead[1] > .009 && beforeHead[2] > .017);
  const spanResults = [];
  for (const span of [.14, .7]) {
    const visual = fixture.scene.clone(true); visual.traverse(node => { if (node.isMesh) node.geometry = node.geometry.clone(); });
    const route = { id: `cable-${id}`, parentId: 'desk', a: [0, .014, 0], b: [span, .014, 0], end: [span, .014, 0], direction: [1, 0, 0], span, length: span, connected: true };
    adaptCableGeometry(visual, route);
    const afterA = dims(visual.getObjectByName('endpoint-A')), afterHead = dims(visual.getObjectByName('plug-A-head'));
    assert(Math.abs(afterA[1] - beforeA[1]) < 1e-5 && Math.abs(afterA[2] - beforeA[2]) < 1e-5);
    assert(Math.abs(afterHead[1] - beforeHead[1]) < 1e-5 && Math.abs(afterHead[2] - beforeHead[2]) < 1e-5);
    const routeBounds = bounds(visual); assert(routeBounds.min.x >= -.004 && routeBounds.max.x <= span + .004); assert(routeBounds.min.y >= .007 && routeBounds.max.y <= .03);
    assert.deepEqual(visual.userData.cableRoute, route); spanResults.push({ span, bounds: { min: routeBounds.min.toArray(), max: routeBounds.max.toArray() }, fixedPlugSize: { nose: afterA, head: afterHead } });
  }
  const disconnected = fixture.scene.clone(true); disconnected.traverse(node => { if (node.isMesh) node.geometry = node.geometry.clone(); });
  const disconnectedRoute = { id: `cable-${id}`, parentId: 'desk', a: [0, .014, 0], b: [.3, .014, 0], end: [.275, .014, 0], direction: [1, 0, 0], span: .3, length: .275, connected: false };
  adaptCableGeometry(disconnected, disconnectedRoute); assert.deepEqual(disconnected.userData.cableRoute, disconnectedRoute); assert(bounds(disconnected).max.x < .29);
  assets.push({ id, bytes: fixture.bytes.length, fixedNoseSize: beforeA, fixedHeadSize: beforeHead, spans: spanResults, disconnectedLength: disconnectedRoute.length });
  checks.push({ name: `${id} real GLB adapts at 0.14m and 0.70m while plug dimensions stay fixed`, passed: true });
}

const clearVisual = await loadScene('single-sleeve');
const parentRoot = new THREE.Group(); parentRoot.updateMatrixWorld(true);
const cable = { id: 'cable-single', floorId: 'floor', node: { cableLink: { a: { deviceId: 'screen', portId: 'usb' }, b: { deviceId: 'keys', portId: 'usb' } } }, visual: clearVisual.scene };
adaptCableGeometry(cable.visual, { id: cable.id, parentId: 'desk', a: [0, .014, 0], b: [.3, .014, 0], end: [.3, .014, 0], direction: [1, 0, 0], span: .3, length: .3, connected: true });
const parent = { id: 'desk', floorId: 'floor', root: parentRoot, visual: parentRoot };
const screen = { id: 'screen', floorId: 'floor', visual: new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .05), new THREE.MeshBasicMaterial()) };
const keys = { id: 'keys', floorId: 'floor', visual: new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .05), new THREE.MeshBasicMaterial()) };
const lamp = { id: 'lamp', floorId: 'floor', visual: new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .04), new THREE.MeshBasicMaterial()) }; lamp.visual.position.set(.15, .014, 0); lamp.visual.updateMatrixWorld(true);
const facilities = new Map([['desk', parent], ['cable-single', cable], ['screen', screen], ['keys', keys], ['lamp', lamp]]);
let obstruction; try { validateCableVisualPlacement(facilities, new Map([['cable-single', cable.visual.userData.cableRoute]]), fail); } catch (error) { obstruction = error; }
assert(obstruction?.code === 'cable-route-obstructed'); checks.push({ name: 'Actual imported cable corridor rejects a third-device obstruction', passed: true, code: obstruction.code });
const beforeRoute = structuredClone(cable.visual.userData.cableRoute); let clearError; const clearFacilities = new Map([['desk', parent], ['cable-single', cable], ['screen', screen], ['keys', keys]]); try { validateCableVisualPlacement(clearFacilities, new Map([['cable-single', cable.visual.userData.cableRoute]]), fail); } catch (error) { clearError = error; } assert(!clearError); assert.deepEqual(cable.visual.userData.cableRoute, beforeRoute); checks.push({ name: 'Clear corridor passes and preserves route metadata', passed: true });

const report = { status: 'passed', profile: 'company-cable-render-v1', checks, assets, limits: ['CPU GLB adaptation and corridor checks only. No browser renderer, physics, electrical simulation or arbitrary curved route support.'] };
const output = path.join(root, 'evidence/company-cable-render-v1'); await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ status: report.status, checks: checks.length, report: 'evidence/company-cable-render-v1/report.json' }, null, 2));
