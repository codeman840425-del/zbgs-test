// CPU-only structural admission for the two native parameter bodies.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';

registerHooks({load(url, context, next) {
  if (url.endsWith('.json')) return {format: 'module', source: 'export default ' + fs.readFileSync(new URL(url), 'utf8'), shortCircuit: true};
  return next(url, context);
}});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : 'evidence/m2-native-eye-admission-v1');
if (fs.existsSync(path.join(out, 'cpu.json'))) throw Error('Refuse overwrite');
fs.mkdirSync(out, {recursive: false});
await import('./headless-avatar-node.mjs');
globalThis.location = {search: '', href: 'http://geometry.local/'};
const {THREE} = await import('./headless-avatar-node.mjs');
const {GLTFLoader} = await import('../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {VRMLoaderPlugin} = await import('../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bodies = ['native-contour-roundness-a-v1', 'native-contour-cheek-b-v1'];
const reference = 'native-female-843ac-v1';
const bodyPaths = {
  'native-female-843ac-v1': 'prototype/public/assets/native-factory-v1/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm',
  'native-contour-roundness-a-v1': 'prototype/public/assets/native-contour-roundness-a-v1/body.vrm',
  'native-contour-cheek-b-v1': 'prototype/public/assets/native-contour-cheek-b-v1/body.vrm',
};
const load = async body => {
  const bytes = fs.readFileSync(path.join(root, bodyPaths[body]));
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const parsed = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return {vrm: parsed.userData.vrm, sha256: sha(bytes)};
};
const clean = name => name?.replace(/ \(Outline\)$/, '');
const faceMeshes = avatar => {
  const rows = [];
  avatar.vrm.scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
    const names = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => clean(material?.name));
    const roles = names.map(name => name?.match(/(?:F00_000_00_|N00_000_00_)([^ ]+?)(?: \(Instance\))?$/)?.[1] ?? null);
    if (roles.some(role => ['FaceMouth_00_FACE','Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE','FaceBrow_00_FACE','EyeIris_00_EYE','EyeHighlight_00_EYE','EyeExtra_01_EYE'].includes(role))) {
      rows.push({mesh, names, roles});
    }
  });
  return rows;
};
const semantic = (dictionary, suffix) => Object.entries(dictionary).filter(([name]) => name.endsWith('Fcl_' + suffix));
const structure = avatar => {
  const rows = faceMeshes(avatar);
  const errors = [];
  if (rows.length !== 9) errors.push(`face primitive count ${rows.length}`);
  const expression = avatar.vrm.expressionManager;
  const roleRows = rows.map(({mesh, names, roles}) => {
    if (new Set(roles).size !== 1) errors.push(`mixed role ${mesh.name}`);
    const role = roles[0], dictionary = mesh.morphTargetDictionary;
    const eye = semantic(dictionary, 'EYE_Joy'), all = semantic(dictionary, 'ALL_Joy'), close = semantic(dictionary, 'EYE_Close');
    if (eye.length !== 1 || all.length !== 1 || close.length !== 1) errors.push(`${role} target key multiplicity`);
    const morphCount = mesh.geometry.morphAttributes.position.length;
    if (morphCount !== 56) errors.push(`${role} morph count ${morphCount}`);
    return {meshName: mesh.name, names, role, morphCount: mesh.geometry.morphAttributes.position.length,
      eyeTargetIndex: eye[0]?.[1] ?? null, allTargetIndex: all[0]?.[1] ?? null, closeTargetIndex: close[0]?.[1] ?? null,
      dictionarySha256: sha(Buffer.from(JSON.stringify(dictionary))),
      influenceLength: mesh.morphTargetInfluences.length};
  });
  const byRole = Object.fromEntries(roleRows.map(row => [row.role, row]));
  const targetRoles = ['Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE'];
  const protectedRoles = ['FaceMouth_00_FACE','FaceBrow_00_FACE','EyeIris_00_EYE','EyeHighlight_00_EYE','EyeExtra_01_EYE'];
  for (const row of roleRows) if (row.influenceLength !== row.morphCount) errors.push(`${row.role} influence count`);
  for (const [name, index] of [['happy', byRole.Face_00_SKIN?.allTargetIndex], ['blink', byRole.Face_00_SKIN?.closeTargetIndex]]) {
    const current = expression.getExpression(name);
    if (!current || current.overrideBlink !== 'none' || current.overrideMouth !== 'none' || current.overrideLookAt !== 'none') errors.push(`${name} expression override`);
    const binds = current?.binds?.filter(bind => bind.index === index && bind.weight === 1) ?? [];
    if (binds.length !== 1 || binds[0].primitives.length !== 9) errors.push(`${name} bind coverage ${binds.length ? binds[0].primitives.length : 0}`);
  }
  const fingerprint = roleRows.map(row => ({role: row.role, morphCount: row.morphCount,
    eyeTargetIndex: row.eyeTargetIndex, allTargetIndex: row.allTargetIndex, closeTargetIndex: row.closeTargetIndex,
    dictionarySha256: row.dictionarySha256}));
  return {roleRows, targetRoles, protectedRoles, expressionNames: ['happy','blink','aa'], fingerprint,
    expressions: Object.fromEntries(['happy','blink','aa'].map(name => {
      const current = expression.getExpression(name);
      return [name, {isBinary: current.isBinary, overrideBlink: current.overrideBlink, overrideMouth: current.overrideMouth,
        overrideLookAt: current.overrideLookAt, binds: current.binds.map(bind => ({index: bind.index, weight: bind.weight, primitives: bind.primitives.length}))}];
    })), errors, runtimeShape: errors.length === 0};
};
const avatars = {};
try {
  for (const body of [reference, ...bodies]) {
    const avatar = await load(body);
    avatars[body] = {sha256: avatar.sha256, structure: structure(avatar)};
  }
  const refStructure = avatars[reference].structure;
  const rows = bodies.map(body => {
    const current = avatars[body];
    const exact = JSON.stringify(current.structure.fingerprint) === JSON.stringify(refStructure.fingerprint)
      && JSON.stringify(current.structure.targetRoles) === JSON.stringify(refStructure.targetRoles)
      && JSON.stringify(current.structure.protectedRoles) === JSON.stringify(refStructure.protectedRoles)
      && JSON.stringify(current.structure.expressions) === JSON.stringify(refStructure.expressions);
    return {bodyType: body, avatarSha256: current.sha256, exact, structure: current.structure,
      admission: exact && current.structure.runtimeShape ? {sha256: current.sha256, prefix: current.structure.roleRows[0].names[0].split('Face')[0], targets: 56} : null,
      admissionRejection: exact && !current.structure.runtimeShape ? 'Observed source has 8 face primitives and 57 morph targets. The runtime adapter requires 9 primitives and 56 targets.' : null};
  });
  const report = {schema: 'native-eye-blink-admission-v1', status: rows.every(row => row.exact && row.structure.runtimeShape) ? 'passed' : 'rejected',
    scope: 'CPU structural comparison through GLTFLoader, three-vrm and foundation loader. No GPU shading or visual acceptance.',
    reference: {bodyType: reference, ...avatars[reference]}, rows};
  fs.writeFileSync(path.join(out, 'cpu.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'passed') process.exitCode = 2;
  console.log(JSON.stringify({status: report.status, out, rows: rows.map(row => ({bodyType: row.bodyType, exact: row.exact, sha256: row.avatarSha256}))}));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({schema: 'native-eye-blink-admission-v1', status: 'rejected', reason: String(error.stack || error)}, null, 2) + '\n');
  console.error(error);
  process.exitCode = 2;
}
