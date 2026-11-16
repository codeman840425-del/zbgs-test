// Actual GLTFLoader + Three objects in Node. No browser, canvas or GPU.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = process.env.RIGID_ACCESSORY_PACKAGE || path.join(root, 'prototype');
const require = createRequire(pathToFileURL(path.join(packageRoot, 'package.json')));
const esbuild = require('esbuild');
const bundle = await esbuild.build({ entryPoints: [path.join(root, 'prototype/src/rigid-accessory-layer.js')],
  bundle: true, write: false, format: 'esm', platform: 'node', nodePaths: [path.join(packageRoot, 'node_modules')], logLevel: 'silent',
  plugins: [{ name: 'native-three', setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ external: true, path: pathToFileURL(path.join(packageRoot, 'node_modules/three/build/three.module.js')).href }));
    build.onResolve({ filter: /^three\/addons\// }, args => ({ external: true,
      path: pathToFileURL(path.join(packageRoot, 'node_modules/three/examples/jsm', args.path.slice('three/addons/'.length))).href }));
  } }] });
const { createRigidAccessoryLayer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const T = await import(pathToFileURL(path.join(packageRoot, 'node_modules/three/build/three.module.js')));
const source = path.join(root, 'assets-source/m2-paired-ear-accessory-v1/generated');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json')));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalFetch = globalThis.fetch;
const checks = [], observed = [];
let geometryReleases = 0;
let onGeometryRelease = null;
const originalGeometryDispose = T.BufferGeometry.prototype.dispose;
T.BufferGeometry.prototype.dispose = function () {
  geometryReleases++;
  const callback = onGeometryRelease; onGeometryRelease = null; callback?.();
  return originalGeometryDispose.call(this);
};
let controls = {};
globalThis.fetch = async url => {
  const name = path.basename(new URL(url).pathname);
  controls.calls?.push(name);
  if (controls.missingManifest && name === 'manifest.json') return new Response(null, { status: 404 });
  if (name === manifest.asset.file && controls.wait) {
    controls.started?.();
    await controls.wait;
    if (controls.failAfterWait) return new Response(null, { status: 503 });
  }
  let bytes = fs.readFileSync(path.join(source, name));
  if (name === 'manifest.json' && controls.manifest) bytes = Buffer.from(JSON.stringify(controls.manifest));
  if (name.endsWith('-fit.json') && controls.badFit) bytes = Buffer.from('bad-fit');
  if (name === manifest.asset.file && controls.badAsset) bytes = Buffer.from('bad-asset');
  return new Response(bytes);
};
function actor(bodyType) {
  const ref = manifest.fits.find(fit => fit.bodyType === bodyType);
  const fit = JSON.parse(fs.readFileSync(path.join(source, ref.file)));
  const scene = new T.Group(), head = new T.Bone();
  head.name = 'J_Bip_C_Head';
  const matrix = new T.Matrix4().fromArray(fit.headWorldRestMatrixColumnMajor);
  matrix.decompose(head.position, head.quaternion, head.scale); scene.add(head);
  const ears = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial());
  head.add(ears);
  return { head, ears, fit, avatarSha256: ref.baseAvatarSha256, vrm: { scene,
    humanoid: { getRawBoneNode: name => name === 'head' ? head : null } } };
}
const create = input => createRigidAccessoryLayer({ ...input, manifestUrl: 'http://localhost/assets/m2-paired-ear-accessory-v1/manifest.json' });
const meshes = a => {
  const result = [];
  a.head.traverse(node => { if (node.isMesh && node.userData.rigidAccessoryId) result.push(node); });
  return result;
};
function deferred() {
  let release, started;
  const wait = new Promise(resolve => release = resolve), begun = new Promise(resolve => started = resolve);
  return { wait, begun, release, started };
}

try {
  for (const bodyType of ['female', 'male']) {
    controls = {};
    const a = actor(bodyType), original = a.ears.geometry;
    const transform = [a.head.position.toArray(), a.head.quaternion.toArray(), a.head.scale.toArray()];
    const layer = await create(a);
    assert.equal(layer.getState().selection, 'none');
    await layer.setSelection('left'); assert.equal(meshes(a).length, 1);
    assert.equal(meshes(a)[0].userData.socket, 'ear.left');
    await layer.setSelection('pair');
    let pair = meshes(a); assert.equal(pair.length, 2);
    assert.equal(pair[0].geometry, pair[1].geometry); assert.notEqual(pair[0].material, pair[1].material);
    for (const mesh of pair) {
      const mount = a.fit.mounts.find(row => row.side === mesh.userData.side);
      assert.deepEqual(mesh.position.toArray(), mount.position);
      assert.deepEqual(mesh.quaternion.toArray(), mount.quaternion);
    }
    const previous = pair[0];
    previous.material.color.setRGB(.1, .2, .3);
    assert.notDeepEqual(previous.material.color.toArray(), pair[1].material.color.toArray());
    let released = 0; pair.forEach(mesh => mesh.material.addEventListener('dispose', () => released++));
    await layer.setSelection('right'); assert.equal(meshes(a).length, 1); assert.equal(released, 2);
    // Inject a real material clone failure while the old right instance is active.
    const active = meshes(a)[0], clone = active.material.constructor.prototype.clone;
    active.material.constructor.prototype.clone = () => { throw Error('Injected clone failure'); };
    try { await assert.rejects(layer.setSelection('pair'), /Injected clone failure/); }
    finally { active.material.constructor.prototype.clone = clone; }
    assert.equal(layer.getState().selection, 'right'); assert.equal(meshes(a)[0], active);
    await layer.setSelection('none'); assert.equal(meshes(a).length, 0);
    assert.equal(a.ears.geometry, original); assert.deepEqual([a.head.position.toArray(), a.head.quaternion.toArray(), a.head.scale.toArray()], transform);
    for (let i = 0; i < 8; i++) { await layer.setSelection('pair'); await layer.setSelection('none'); }
    await layer.setSelection('pair'); pair = meshes(a);
    let geometryDisposed = 0, materialDisposed = 0;
    pair[0].geometry.addEventListener('dispose', () => geometryDisposed++);
    pair.forEach(mesh => mesh.material.addEventListener('dispose', () => materialDisposed++));
    layer.dispose(); layer.dispose();
    assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 2); assert.equal(meshes(a).length, 0);
    await assert.rejects(layer.setSelection('left'), /disposed/);
    checks.push(bodyType+' actual fit/GLTF left/pair/right/none, independent materials, clone failure preserves old, repeated toggles and exact dispose');
    observed.push({ bodyType, assetSha256: manifest.asset.sha256, fitSha256: sha(fs.readFileSync(path.join(source, manifest.fits.find(f => f.bodyType === bodyType).file))),
      sourceEarGeometryUnchanged: a.ears.geometry === original, geometryDisposed, materialDisposed });
  }
  controls = {};
  const a = actor('male'), b = actor('male'), first = await create(a), second = await create(b);
  await first.setSelection('pair'); await second.setSelection('pair');
  assert.notEqual(meshes(a)[0].geometry, meshes(b)[0].geometry);
  assert.notEqual(meshes(a)[0].material, meshes(b)[0].material);
  first.dispose(); assert.equal(meshes(b).length, 2); second.dispose();
  checks.push('two actors allocate independent geometry and mutable materials; first dispose preserves second');

  controls = {};
  {
    const a = actor('male'), layer = create(a);
    await layer.setSelection('pair');
    const pair = meshes(a), counts = [0, 0], nested = [];
    pair.forEach((mesh, i) => mesh.material.addEventListener('dispose', () => {
      counts[i]++; nested.push(layer.setSelection('none'));
    }));
    assert.equal((await layer.setSelection('none')).applied, false);
    await Promise.all(nested);
    assert.deepEqual(counts, [1, 1]); assert.equal(meshes(a).length, 0);
    assert.equal(layer.getState().selection, 'none'); layer.dispose();
    checks.push('continuous material dispose listeners reenter none without recursion or duplicate release');
  }
  {
    const a = actor('male'), layer = create(a);
    let materialReleases = 0;
    const before = geometryReleases;
    const onAdd = event => {
      if (!event.child.name.startsWith('RigidAccessory:')) return;
      event.child.traverse(mesh => { if (mesh.isMesh) mesh.material.addEventListener('dispose', () => materialReleases++); });
      layer.dispose();
    };
    a.head.addEventListener('childadded', onAdd);
    assert.deepEqual(await layer.setSelection('pair'), { applied: false, reason: 'cancelled' });
    a.head.removeEventListener('childadded', onAdd);
    assert.equal(meshes(a).length, 0); assert.equal(layer.getState().status, 'disposed');
    assert.equal(materialReleases, 2); assert.equal(geometryReleases-before, 1);
    checks.push('dispose during actual head childadded removes candidate and releases its two materials and geometry once');
  }
  {
    const a = actor('male'), layer = create(a);
    await layer.setSelection('left');
    const prototype = meshes(a)[0].material.constructor.prototype, originalClone = prototype.clone;
    let cloneReleases = 0;
    prototype.clone = function () {
      const material = originalClone.call(this);
      material.addEventListener('dispose', () => cloneReleases++);
      layer.dispose(); return material;
    };
    try { assert.deepEqual(await layer.setSelection('pair'), { applied: false, reason: 'cancelled' }); }
    finally { prototype.clone = originalClone; }
    assert.equal(cloneReleases, 1); assert.equal(meshes(a).length, 0);
    assert.equal(layer.getState().status, 'disposed');
    checks.push('dispose during actual material clone releases returned local clone without attaching or committing it');
  }
  {
    const a = actor('male'), layer = create(a);
    await layer.setSelection('left');
    let newer, triggered = false;
    const onAdd = event => {
      if (!event.child.name.startsWith('RigidAccessory:') || triggered) return;
      triggered = true; newer = layer.setSelection('right');
    };
    a.head.addEventListener('childadded', onAdd);
    assert.deepEqual(await layer.setSelection('pair'), { applied: false, reason: 'cancelled' });
    assert.equal((await newer).applied, true);
    a.head.removeEventListener('childadded', onAdd);
    assert.equal(layer.getState().selection, 'right'); assert.equal(meshes(a).length, 1);
    assert.equal(meshes(a)[0].userData.side, 'right'); layer.dispose();
    checks.push('newer right intent during head childadded cancels candidate and preserves only the newer commit');
  }

  for (const mode of ['badAsset', 'badFit', 'unsupportedBody']) {
    controls = { [mode]: true };
    const a = actor('male');
    if (mode === 'badAsset') {
      const layer = await create(a);
      await assert.rejects(layer.setSelection('left'), /asset integrity/);
      assert.equal(layer.getState().selection, 'none'); assert.equal(meshes(a).length, 0); layer.dispose();
    } else {
      const layer = await create(mode === 'badFit' ? a : { ...a, avatarSha256: '0'.repeat(64) });
      await assert.rejects(layer.setSelection('left'), mode === 'badFit' ? /fit integrity/ : /no exact fit/);
      assert.equal(layer.getState().selection, 'none'); layer.dispose();
    }
    checks.push(mode+' explicitly rejected without changing ears or installing accessory');
  }
  controls = { calls: [], missingManifest: true };
  const unlisted = actor('male');
  const empty = create({ ...unlisted, avatarSha256: '0'.repeat(64) });
  assert.equal(typeof empty.setSelection, 'function');
  assert.deepEqual(controls.calls, []);
  await empty.setSelection('none'); assert.deepEqual(controls.calls, []);
  await assert.rejects(empty.setSelection('pair'), /HTTP 404/);
  assert.equal(empty.getState().selection, 'none'); assert.equal(meshes(unlisted).length, 0);
  await empty.setSelection('none'); empty.dispose();
  checks.push('synchronous empty layer and none make zero network requests for unlisted body and missing accessory manifest');
  for (const mode of ['none', 'dispose', 'late503', 'newerSide', 'restartDuringCleanup']) {
    const beforeDisposals = geometryReleases;
    const gate = deferred(); controls = { wait: gate.wait, started: gate.started, failAfterWait: mode === 'late503' };
    const a = actor('male'), layer = await create(a);
    const old = layer.setSelection('pair'); await gate.begun;
    let newer;
    if (mode === 'dispose') layer.dispose();
    else if (mode === 'newerSide') newer = layer.setSelection('right');
    else await layer.setSelection('none');
    if (mode === 'restartDuringCleanup') onGeometryRelease = () => { newer = layer.setSelection('right'); };
    gate.release();
    assert.deepEqual(await old, { applied: false, reason: 'cancelled' });
    if (newer) { assert.equal((await newer).applied, true); assert.equal(meshes(a).length, 1); }
    else { assert.equal(meshes(a).length, 0); assert.equal(layer.getState().cachedGeometries, 0); }
    layer.dispose(); assert.equal(geometryReleases-beforeDisposals, mode === 'late503' ? 0 : mode === 'restartDuringCleanup' ? 2 : 1);
    checks.push(mode+' supersedes delayed actual asset parse/load and releases exact source geometry without late installation');
  }
  // Exercise the real publisher in an isolated temporary directory. The public
  // target and every retained source file remain untouched by this CPU test.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-stud-publish-'));
  try {
    const program = `import importlib.util,pathlib,json\np=pathlib.Path(${JSON.stringify(path.join(root, 'scripts/m2-paired-ear-accessory-v1/publish.py'))})\ns=importlib.util.spec_from_file_location('publisher',p)\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\ntarget=pathlib.Path(${JSON.stringify(temporary)})\na=m.publish(target)\nb=m.publish(target)\nassert a==b\n(target/'stud.glb').write_bytes(b'bad')\ntry: m.publish(target)\nexcept ValueError: pass\nelse: raise AssertionError('differing existing output accepted')\nprint(json.dumps({'passed':True,'files':len(a['published'])}))`;
    const result = spawnSync('python', ['-c', program], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).files, 4);
  } finally {
    for (const name of ['manifest.json', 'stud.glb', 'female-fit.json', 'male-fit.json']) {
      const file = path.join(temporary, name); if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(temporary);
  }
  checks.push('actual publisher copies four pinned files idempotently and rejects differing existing bytes');
  console.log(JSON.stringify({ schema: 'zbgs-paired-ear-runtime-qa-v1', passed: true, checks, observations: observed,
    runtimeSourceSha256: sha(fs.readFileSync(path.join(root, 'prototype/src/rigid-accessory-layer.js'))),
    GPUUsed: false, browserStarted: false, visualAcceptance: false }, null, 2));
} finally { globalThis.fetch = originalFetch; T.BufferGeometry.prototype.dispose = originalGeometryDispose; }
