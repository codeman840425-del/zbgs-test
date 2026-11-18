import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [inputArg, outputArg, ...extra] = process.argv.slice(2);
const reopen = extra[0] === '--reopen' && extra.length === 1;
if (!inputArg || !outputArg || (extra.length && !reopen)) {
  throw new Error('From the package source directory: node PATH/probe-usepoints.mjs PATH/seat-input.json NEW_RECEIPT_DIRECTORY');
}
const root = await fs.realpath(process.cwd());
const inputPath = path.resolve(inputArg);
const output = path.resolve(outputArg);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(path.join(root, file));
const importSource = file => import(pathToFileURL(path.join(root, file)));
const source = file => 'prototype/src/company/' + file;
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6);
const closeVector = (actual, expected) => expected.forEach((value, index) => near(actual[index], value));
const reject = async (action, code) => {
  let observed;
  await assert.rejects(action, error => {
    observed = { code: error.code, path: error.path, message: error.message, details: error.details };
    return error.code === code;
  });
  return observed;
};
const input = JSON.parse(await fs.readFile(inputPath));
assert.equal(input.schema, 'company-usepoint-round1');
assert.equal(input.version, 1);
for (const entry of input.sourceFiles) assert.equal(digest(await read(entry.file)), entry.sha256, entry.file);
const original = await fs.readFile(path.resolve(path.dirname(inputPath), input.save.file));
assert.equal(digest(original), input.save.sha256);
const { sofa } = input;
const require = createRequire(path.join(root, 'prototype/package.json'));
const threeEntry = await fs.realpath(require.resolve('three'));
const dependency = path.join(root, 'prototype/node_modules/three');
assert(threeEntry.startsWith(dependency + path.sep), 'Install the package-local locked dependencies in prototype');
const { Vector3, Raycaster, Scene } = await import(pathToFileURL(path.join(path.dirname(threeEntry), 'three.module.js')));
const { installNodeImageDecodeShim } = await importSource('scripts/company-platform/preflight-library-assets.mjs');
installNodeImageDecodeShim();
const { createCompanyAssetLibrary } = await importSource(source('asset-library.js'));
const { createCompanyAuthoring } = await importSource(source('authoring.js'));
const { createCompany, prepareCompanyChange } = await importSource(source('document.js'));
const { decodeCompanySave, createCompanySaveStore } = await importSource(source('persistence.js'));
const catalog = JSON.parse(await read(source('library-catalog.json')));
const templates = JSON.parse(await read(source('templates-extended.json')));
const document = await decodeCompanySave(original.toString('utf8'), catalog, templates);
assert.equal(document.id, input.save.companyId);
assert.equal(document.revision, input.save.revision);
const sofaNode = document.nodes.find(node => node.id === sofa.id);
assert.deepEqual(sofaNode.resource, sofa.resource);
const sofaResource = catalog.resources.find(resource => resource.id === sofa.resource.id && resource.version === sofa.resource.version);
assert.deepEqual(sofaResource.asset, sofa.asset);
const imports = new Set();
const assets = createCompanyAssetLibrary({ fetchImpl: async url => {
  assert(/^\/company-assets\/[^\?#%]+\.glb$/.test(url) && !url.split('/').includes('..'));
  const bytes = await read('prototype/public' + url);
  imports.add(url);
  return { ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
} });
let session;
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const store = createCompanySaveStore({ storage, catalog, templates });
const storageKey = 'company-platform:v1:' + encodeURIComponent(document.id);
const stateFile = path.join(output, 'restorable.save.json');
const externalBusy = new Set();
const options = { catalog, templates, storage, assetLibrary: assets, isUsePointBusy: id => externalBusy.has(id) };
const logical = scene => input.points.map(point => scene.describeUsePoint(point.usePointId));
const contacts = [];

function hit(mesh, start, direction) {
  const ray = new Raycaster(start, direction, 0, .9);
  const contact = ray.intersectObject(mesh, false)[0];
  assert(contact && contact.object === mesh && Number.isInteger(contact.faceIndex), 'The ray must hit an actual contact triangle');
  return { position: contact.point.toArray(), triangle: contact.faceIndex };
}

function checkContact(point, expected, mesh) {
  assert.equal(point.id, expected.usePointId);
  assert.equal(point.facilityId, sofa.id);
  assert.equal(point.roomId, sofa.roomId);
  assert.equal(point.floorId, sofa.floorId);
  assert.equal(point.capacity, expected.capacity);
  assert.equal(point.capacity, 1);
  assert.deepEqual(point.missingFields, []);
  assert.deepEqual(point.resource, sofa.resource);
  assert.deepEqual(point.contact, { seatNodeId: expected.seatMesh, backNodeId: expected.backMesh });
  near(point.transform.yaw, expected.yawRadians);
  const facing = new Vector3(Math.sin(point.transform.yaw), 0, Math.cos(point.transform.yaw));
  closeVector(facing.toArray(), expected.facing);
  closeVector(point.transform.position, expected.origin);
  closeVector(point.approachPosition, expected.approach);
  closeVector(point.exitPosition, expected.exit);
  assert(mesh.seat.isMesh && mesh.back.isMesh);
  assert.equal(mesh.seat.name, expected.seatMesh);
  assert.equal(mesh.back.name, expected.backMesh);
  const origin = new Vector3(...point.transform.position);
  const rays = [[0, 0], [-.02, 0], [.02, 0], [0, -.02], [0, .02]].map(([x, z]) => {
    const offset = new Vector3(x, .92, z).applyAxisAngle(new Vector3(0, 1, 0), point.transform.yaw);
    const result = hit(mesh.seat, origin.clone().add(offset), new Vector3(0, -1, 0));
    near(result.position[1] - origin.y, point.seatHeight);
    return result;
  });
  near(point.seatHeight, .47);
  const back = hit(mesh.back, origin.clone().add(new Vector3(0, .72, 0)).addScaledVector(facing, .15), facing.clone().negate());
  return { ...point, facing: facing.toArray(), rays, back };
}

async function visibleGeometry() {
  await session.setView({ mode: 'room', floorId: sofa.floorId, roomId: sofa.roomId });
  return logical(session.scene).map((point, index) => {
    const runtime = session.scene.resolveUsePoint(point.id);
    closeVector(runtime.chair.getWorldPosition(new Vector3()).toArray(), point.transform.position);
    closeVector(new Vector3(0, 0, 1).transformDirection(runtime.chair.matrixWorld).toArray(), input.points[index].facing);
    return checkContact(point, input.points[index], { seat: runtime.chairSeat, back: runtime.chairBack });
  });
}

try {
  if (reopen) {
    const saved = await fs.readFile(stateFile, 'utf8');
    // Equivalent to a new process reloading its own company key from persistent storage.
    storage.setItem(storageKey, saved);
    const other = document.id + '-foreign';
    const missing = await reject(() => store.load(other), 'save-not-found');
    const foreign = await reject(() => store.import(saved, { expectedCompanyId: other }), 'save-identity-mismatch');
    session = await createCompanyAuthoring(new Scene(), createCompany({ id: 'usepoint-probe-empty' }, catalog), options);
    await session.restore(document.id);
    assert.deepEqual(session.document, document);
    assert.equal(session.readSavedText(document.id), saved);
    const geometry = await visibleGeometry();
    // Restore again with the same data before taking any handles. No live occupancy survived.
    await session.restore(document.id);
    assert.deepEqual(session.document, document);
    console.log(JSON.stringify({ processId: process.pid, savedSha256: digest(saved), missing, foreign, geometry,
      initialLiveGuards: externalBusy.size, storageKeys: [...values.keys()] }));
  } else {
    await fs.mkdir(output);
    session = await createCompanyAuthoring(new Scene(), document, options);
    const measured = await visibleGeometry();
    assert.notEqual(measured[0].id, measured[1].id);
    assert(imports.has(sofa.asset.url));
    const describeBefore = logical(session.scene);
    const transform = structuredClone(sofaNode.transform);
    transform.position[0] += .025;
    const move = [{ type: 'move', id: sofa.id, transform }];
    prepareCompanyChange(document, move, { catalog, templates });
    const [left, right] = measured.map(point => point.id);

    externalBusy.add(left);
    const external = await reject(() => session.apply(move), 'facility-busy');
    assert.equal(external.path, sofa.id);
    assert.equal(external.details.usePointId, left);
    externalBusy.clear();
    for (const id of [left, right]) contacts.push(await session.retainUsePointContact(id));
    const [leftHandle, rightHandle] = contacts;
    assert.notEqual(leftHandle.seat.geometry, rightHandle.seat.geometry);
    const layouts = contacts.map(handle => [handle.seat.matrixWorld.toArray(), handle.back.matrixWorld.toArray()]);
    const samePoint = await session.retainUsePointContact(left);
    assert.equal(samePoint.seat, leftHandle.seat);
    samePoint.release();
    assert.equal(leftHandle.released, false);
    await session.setView({ mode: 'building', floorId: sofa.floorId });
    assert.equal(session.scene.resolveUsePoint(left), null);
    assert.deepEqual(logical(session.scene), describeBefore);
    assert.deepEqual(contacts.map(handle => [handle.seat.matrixWorld.toArray(), handle.back.matrixWorld.toArray()]), layouts);
    const hiddenContacts = contacts.map((handle, index) => checkContact(describeBefore[index], input.points[index], handle));
    await session.save();
    const saved = session.readSavedText(document.id);
    assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ['dependencies', 'document', 'schema', 'version']);
    assert.deepEqual(await decodeCompanySave(saved, catalog, templates), document);
    assert.deepEqual([...values.keys()], [storageKey]);
    const restoreBusy = await reject(() => session.restore(document.id), 'facility-busy');
    leftHandle.release();
    assert.throws(() => leftHandle.seat, error => error.code === 'contact-handle-invalid');
    assert.equal(rightHandle.released, false);
    assert.deepEqual(checkContact(describeBefore[1], input.points[1], rightHandle), hiddenContacts[1]);
    const otherHeld = await reject(() => session.apply(move), 'facility-busy');
    assert.equal(otherHeld.path, sofa.id);
    assert.equal(otherHeld.details.usePointId, right);
    assert.deepEqual(session.document, document);
    assert.equal(session.readSavedText(document.id), saved);
    rightHandle.release();
    await session.apply(move);
    assert.notDeepEqual(session.document, document);
    await session.restore(document.id);
    assert.deepEqual(session.document, document);
    await fs.writeFile(stateFile, saved);
    session.dispose();
    session = null;
    const subprocess = spawnSync(process.execPath, [fileURLToPath(import.meta.url), inputPath, output, '--reopen'], {
      cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    assert.equal(subprocess.status, 0, subprocess.stderr || subprocess.error?.message);
    const restored = JSON.parse(subprocess.stdout);
    assert.notEqual(restored.processId, process.pid);
    assert.equal(restored.savedSha256, digest(saved));
    assert.deepEqual(restored.geometry, measured);
    const receipt = { status: 'passed', package: input.package, originalSaveSha256: input.save.sha256,
      asset: sofa.asset, processId: process.pid, actualSeats: measured, hiddenContacts,
      busy: { external, restoreBusy, otherHeld, allowedAfterRelease: true }, samePointHandlesShareGeometry: true, restored,
      scope: 'Package-local Node, Three contact meshes and company save adapter. Capacity is declared per use point. Actor occupancy and task execution are owned by the character system.' };
    await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ status: receipt.status, savedSha256: restored.savedSha256, output }));
  }
} finally {
  for (const contact of contacts) contact.release();
  session?.dispose();
  assets.dispose();
}
