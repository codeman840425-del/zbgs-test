// CPU FIT01 identity probe. Loads the real male VRM and registered hair through
// foundation-avatar. Texture decoding and renderer/WebGL are explicit fixtures.
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ROOT = path.resolve(getArg('--root', process.cwd()));
const OUT = path.resolve(getArg('--out', path.join(ROOT, 'evidence/m2-fit-identity-gap-rerun')));
const source = rel => pathToFileURL(path.join(ROOT, rel)).href;

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return { format: 'module', source: `export default ${readFileSync(new URL(url), 'utf8')}`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

globalThis.self = globalThis;
globalThis.location = { search: '' };
globalThis.window = { location: { href: 'http://fit-identity.local/' } };
globalThis.ProgressEvent = class extends Event {
  constructor(type, init = {}) { super(type); Object.assign(this, init); }
};
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
const nativeRequest = globalThis.Request;
globalThis.Request = class extends nativeRequest {
  constructor(input, init) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://fit-identity.local${input}` : input, init);
  }
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : typeof input === 'string' ? new URL(input, 'http://fit-identity.local/') : new URL(input.url);
  if (url.hostname !== 'fit-identity.local') return nativeFetch(input, init);
  const file = path.resolve(ROOT, 'prototype/public', `.${decodeURIComponent(url.pathname)}`);
  const publicRoot = path.resolve(ROOT, 'prototype/public');
  if (!file.startsWith(publicRoot + path.sep)) throw Error(`Asset escaped public root: ${url.pathname}`);
  const bytes = await fs.readFile(file);
  return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};

const THREE = await import(source('prototype/node_modules/three/build/three.module.js'));
const { loadFoundationAvatar } = await import(source('prototype/src/foundation-avatar.js'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function facePositionHashes(avatar) {
  const result = [];
  avatar.vrm.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(material => /_Face_.*SKIN/.test(material.name))) return;
    const ids = [...new Set(mesh.geometry.index.array)];
    const values = [];
    for (const index of ids) values.push(...mesh.getVertexPosition(index, new THREE.Vector3()).toArray());
    result.push(digest(new Float64Array(values)));
  });
  return result;
}
function snapshot(avatar, label) {
  const geometry = avatar.facialGeometry.getState();
  return {
    label,
    facePositionHashes: facePositionHashes(avatar),
    bodyPositionHashes: (() => {
      const values = [];
      avatar.vrm.scene.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!materials.some(material => /_Body_.*SKIN/.test(material.name))) return;
        const ids = [...new Set(mesh.geometry.index.array)];
        const points = [];
        for (const index of ids) points.push(...mesh.getVertexPosition(index, new THREE.Vector3()).toArray());
        values.push(digest(new Float64Array(points)));
      });
      return values;
    })(),
    headMatrix: avatar.vrm.humanoid.getRawBoneNode('head').matrixWorld.toArray(),
    geometryIdentity: geometry.geometryIdentity,
    hairFit: avatar.appearance.getState().hairFit,
    hairAssetSha256: avatar.appearance.getState().replacementSHA256,
    equipment: avatar.getEquipmentRecipe(0),
  };
}

await fs.mkdir(OUT, { recursive: true });
const rendererFixture = {
  compileAsync: async () => {},
  getContext: () => ({ isContextLost: () => false }),
  shadowMap: { enabled: false },
};
const avatar = await loadFoundationAvatar({ scene: new THREE.Scene(), renderer: rendererFixture, bodyType: 'male' });
try {
  const hair = await avatar.appearance.set({ hairStyle: 'male-sidepart-v1' });
  if (!hair.applied) throw Error(`Hair fixture failed: ${hair.reason || 'unknown'}`);
  const baseline = snapshot(avatar, 'original with registered male sidepart hair');
  const changedResult = await avatar.facialGeometry.set({ mouthWidth: 0.12 });
  if (!changedResult.applied) throw Error(`Mouth geometry fixture failed: ${changedResult.reason || 'unknown'}`);
  const changed = snapshot(avatar, 'mouthWidth 0.12');
  const resetResult = await avatar.facialGeometry.set({ reset: true });
  if (!resetResult.applied) throw Error(`Geometry reset failed: ${resetResult.reason || 'unknown'}`);
  const reset = snapshot(avatar, 'reset');
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const checks = {
    actualFaceChanges: !equal(baseline.facePositionHashes, changed.facePositionHashes),
    actualFaceRestores: equal(baseline.facePositionHashes, reset.facePositionHashes),
    geometryIdentityRestores: equal(baseline.geometryIdentity, reset.geometryIdentity),
    bodyUnchanged: equal(baseline.bodyPositionHashes, changed.bodyPositionHashes) && equal(baseline.bodyPositionHashes, reset.bodyPositionHashes),
    headUnchanged: equal(baseline.headMatrix, changed.headMatrix) && equal(baseline.headMatrix, reset.headMatrix),
    hairFitUnchanged: equal(baseline.hairFit, changed.hairFit) && equal(baseline.hairFit, reset.hairFit),
    equipmentIdentityUnchanged: equal(baseline.equipment, changed.equipment) && equal(baseline.equipment, reset.equipment),
  };
  for (const [name, passed] of Object.entries(checks)) if (!passed) throw Error(`FIT identity assertion failed: ${name}`);
  const report = {
    scope: 'Actual male roundtrip VRM, registered male sidepart hair, and facial mouth recipe through foundation-avatar. CPU texture decode and renderer fixtures. No browser/GPU proof.',
    root: ROOT,
    inputs: [{ hairStyle: 'male-sidepart-v1' }, { mouthWidth: 0.12 }, { reset: true }],
    checks,
    states: [baseline, changed, reset],
  };
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.copyFile(new URL(import.meta.url), path.join(OUT, 'probe.mjs'));
  console.log(JSON.stringify({ out: OUT, checks }));
} finally {
  avatar.dispose();
}
