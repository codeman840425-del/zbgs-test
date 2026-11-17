import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateWallShelfGeometry} from '../../prototype/src/company/wall-shelf-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-wall-shelf-geometry-v1');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], realAssets = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const invoke = (scene, resource) => validateWallShelfGeometry(scene, resource, (code, location, message, details) => {
  throw Object.assign(new Error(message), {code, path: location, details});
});
const reject = (name, scene, resource, codes) => {
  let error;
  try { invoke(scene, resource); } catch (caught) { error = caught; }
  assert(error, `${name} unexpectedly passed`);
  assert((Array.isArray(codes) ? codes : [codes]).includes(error.code), `${name} expected ${codes}, got ${error.code}: ${error.message}`);
  checks.push({name, passed: true, rejection: {code: error.code, path: error.path, message: error.message, details: error.details}});
};
const cloneMesh = (scene, name) => {
  const mesh = scene.getObjectByName(name);
  assert(mesh?.isMesh, `Missing fixture mesh ${name}`);
  mesh.geometry = mesh.geometry.clone();
  return mesh;
};
const discover = async design => {
  const roots = [`prototype/public/company-assets/wall-shelf-v1/${design}/v1`, `prototype/public/company-assets/wall-shelf/${design}/v1`];
  for (const root of roots) {
    try { const [model, resource] = await Promise.all([fs.readFile(path.join(root, 'model.glb')), fs.readFile(path.join(root, 'resource.json'), 'utf8')]); return {model, resource: JSON.parse(resource), modelPath: path.join(root, 'model.glb'), resourcePath: path.join(root, 'resource.json')}; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return null;
};
const load = async fixture => {
  const parsed = await new GLTFLoader().parseAsync(fixture.model.buffer.slice(fixture.model.byteOffset, fixture.model.byteOffset + fixture.model.byteLength), '');
  return parsed.scene;
};

let failure;
try {
  assert.deepEqual(validateWallShelfGeometry(null, {mountRole: 'side-table'}, () => {}), {checked: false});
  checks.push({name: 'Unrelated resources remain on their existing geometry path', passed: true});
  const fixtures = [];
  for (const design of ['side-bracket', 'cantilever', 'frame', 'back-panel']) {
    const fixture = await discover(design);
    if (!fixture) continue;
    assert.equal(sha(fixture.model), fixture.resource.asset.sha256);
    assert.equal(fixture.model.length, fixture.resource.asset.bytes);
    const scene = await load(fixture);
    const actual = invoke(scene, fixture.resource);
    assert(actual.checked && actual.wallMounted);
    assert.equal(actual.sourceDesign, design);
    assert.equal(actual.support.surfaces.length, 3);
    fixtures.push({design, fixture, scene});
    realAssets.push({design, modelPath: fixture.modelPath, resourcePath: fixture.resourcePath, sha256: sha(fixture.model), actual});
    checks.push({name: `${design} actual GLB proves wall contact, three bearing tops and connected solids`, passed: true});
  }
  if (fixtures.length !== 4) {
    checks.push({name: 'Four production wall shelf GLBs are present', passed: false, pending: true, found: fixtures.length});
  } else {
    const base = fixtures[0];
    const boardName = base.fixture.resource.supportNodes.lower;
    const board = cloneMesh(base.scene, boardName);
    board.position.y += .01;
    reject('Wrong bearing top is rejected by the existing support top gate', base.scene, base.fixture.resource, ['invalid-support-topology', 'support-clearance-occupied']);

    const detached = await load(base.fixture);
    const candidate = detached.getObjectByName(boardName);
    assert(candidate);
    candidate.removeFromParent();
    reject('A missing actual board cannot be replaced by support metadata', detached, base.fixture.resource, 'missing-support-node');

    const wallFloat = await load(base.fixture);
    wallFloat.traverse(node => { if (node.isMesh) node.position.z += .01; });
    reject('A complete shelf floating off z=0 is rejected', wallFloat, base.fixture.resource, ['wall-shelf-wall-contact', 'wall-shelf-board-geometry']);

    const open = await load(base.fixture);
    const first = open.getObjectByName(boardName);
    const geometry = first.geometry.index ? first.geometry.toNonIndexed() : first.geometry.clone();
    const position = geometry.getAttribute('position');
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(position.array).slice(9), 3));
    first.geometry = geometry;
    reject('A board with one removed face is rejected as open geometry', open, base.fixture.resource, ['wall-shelf-open-or-inconsistent', 'wall-shelf-degenerate-face']);

    const reversed = await load(base.fixture);
    const reversedBoard = cloneMesh(reversed, boardName);
    const reversedGeometry = reversedBoard.geometry.index ? reversedBoard.geometry.toNonIndexed() : reversedBoard.geometry;
    const reversedPositions = reversedGeometry.getAttribute('position');
    const firstVertex = Array.from(reversedPositions.array.slice(0, 3)), secondVertex = Array.from(reversedPositions.array.slice(3, 6));
    reversedPositions.setXYZ(0, ...secondVertex); reversedPositions.setXYZ(1, ...firstVertex);
    reversedBoard.geometry = reversedGeometry;
    reject('A reversed actual board face is rejected by oriented edge closure', reversed, base.fixture.resource, 'wall-shelf-open-or-inconsistent');

    const thin = await load(base.fixture);
    const thinBoard = cloneMesh(thin, boardName);
    thinBoard.scale.y = .5;
    reject('An over-thin board is rejected against the fixed slab dimensions', thin, base.fixture.resource, ['wall-shelf-board-geometry', 'invalid-support-topology']);

    const intrude = await load(base.fixture);
    const top = cloneMesh(intrude, base.fixture.resource.supportNodes.top);
    top.position.y += .1;
    reject('A support board entering the declared layer gate is rejected', intrude, base.fixture.resource, ['invalid-support-topology', 'support-clearance-occupied', 'wall-shelf-board-geometry']);
    const angled = await load(base.fixture);
    const brace = angled.getObjectByName('side-bracket-brace-lower-left'), arm = angled.getObjectByName('side-bracket-arm-lower-left');
    assert(brace && arm, 'Side bracket angled-contact fixture requires the real brace and arm meshes');
    brace.position.x += .035;
    brace.position.y -= .04;
    brace.rotation.z = Math.PI / 4;
    angled.updateMatrixWorld(true);
    assert(new THREE.Box3().setFromObject(brace).intersectsBox(new THREE.Box3().setFromObject(arm)), 'Angled fixture must retain an AABB overlap for the adversarial contact case');
    reject('AABB-overlapping angled brace with no real contact is rejected by convex contact', angled, base.fixture.resource, 'wall-shelf-detached-component');
    checks.push({name: 'Controlled real mesh mutations hit the intended wall-shelf gates', passed: true});
  }
} catch (error) { failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}; }

const sourceHashes = {};
for (const filename of ['prototype/src/company/wall-shelf-geometry.js', 'scripts/company-platform/test-wall-shelf-geometry.mjs']) sourceHashes[filename] = sha(await fs.readFile(filename));
const report = {status: failure ? 'failed' : realAssets.length === 4 ? 'passed' : 'pending-real-assets', generatedAt: new Date().toISOString(), checks, realAssets, sourceHashes, failure,
  limits: ['CPU validation reads the actual imported GLB triangles and controlled mutations. It proves finite static wall contact, positive closed components, bearing tops, clearance and geometric connectivity. It does not prove anchor strength, runtime save/reopen, browser performance or human visual acceptance.']};
await fs.writeFile(path.join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(output, 'latest.json'), JSON.stringify({status: report.status, report: path.relative(process.cwd(), path.join(runDirectory, 'report.json')).replaceAll('\\', '/')}, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, checks: checks.length, assets: realAssets.length, report: path.join(runDirectory, 'report.json'), failure}, null, 2));
if (failure) process.exitCode = 1;

