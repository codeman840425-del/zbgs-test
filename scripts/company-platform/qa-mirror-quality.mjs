import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMirrorBinding, mirrorResourceSnapshot, selectMirrorRenderProfile, validateMirrorRenderProfile} from '../../prototype/src/company/mirror-render.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';

const output = path.resolve(process.argv[2] || 'evidence/company-mirror-quality-cpu-v1');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function check(name, action) {
  try { checks.push({name, status: 'passed', detail: await action()}); }
  catch (error) { checks.push({name, status: 'failed', error: error.stack, code: error.code}); }
}
const profiles = {'single-512-v1': [512, 0], 'detail-1024-v1': [1024, 0], 'detail-1024-msaa4-v1': [1024, 4]};
function capabilities(overrides = {}) {
  const options = {texture: 4096, buffer: 4096, maxSamples: 8, color: [8, 4, 2], depth: [8, 4, 2], float: true, half: false, lost: false, ...overrides};
  const queries = [];
  const gl = {
    MAX_RENDERBUFFER_SIZE: 0x84e8, RENDERBUFFER: 0x8d41, RGBA16F: 0x881a, DEPTH_COMPONENT24: 0x81a6, SAMPLES: 0x80a9,
    isContextLost: () => options.lost,
    getParameter(parameter) { assert.equal(parameter, this.MAX_RENDERBUFFER_SIZE); return options.buffer; },
    getInternalformatParameter(target, format, parameter) {
      assert.equal(target, this.RENDERBUFFER); assert.equal(parameter, this.SAMPLES); queries.push(format);
      if (format === this.RGBA16F) return options.color === null ? null : Int32Array.from(options.color);
      assert.equal(format, this.DEPTH_COMPONENT24); return options.depth === null ? null : Int32Array.from(options.depth);
    },
  };
  return {queries, getContext: () => gl, capabilities: {maxTextureSize: options.texture, maxSamples: options.maxSamples},
    extensions: {has: name => name === 'EXT_color_buffer_float' ? options.float : name === 'EXT_color_buffer_half_float' && options.half}};
}
const definitions = await Promise.all(['round', 'full'].map(async name => JSON.parse(await fs.readFile(`prototype/public/company-assets/floor-mirror-v1/${name}/v1/resource.json`, 'utf8'))));
function visual(resource) {
  const root = new THREE.Group(), y = resource.mirrorSurface.position[1];
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.68, 1.68).translate(0, y, .026), new THREE.MeshStandardMaterial({color: 0x777777}));
  face.name = 'mirror-surface'; root.add(face);
  return {root, nodes: new Map([[face.name, face]]), face};
}
function binding(profile, floor = false) {
  const resource = floor ? structuredClone(definitions[0]) : {id: 'quality-wall', mountRole: 'mirror', mirrorSurface: {schema: 'planar-mirror-v1', profile: 'single-512-v1', position: [0, 0, .026]}, mirrorNodes: {face: 'mirror-surface'}};
  const instance = visual(resource), owner = createMirrorBinding(resource, instance.nodes, resource.id, profile);
  return {resource, ...instance, owner, dispose() { owner.dispose(); instance.face.geometry.dispose(); instance.face.material.dispose(); }};
}
function assertTarget(owner, profile) {
  const reflector = owner.activate(), target = reflector.getRenderTarget(), [size, samples] = profiles[profile];
  assert.equal(reflector.isReflector, true); assert(target.isWebGLRenderTarget);
  assert.equal(target.width, size); assert.equal(target.height, size); assert.equal(target.samples, samples);
  assert.equal(target.texture.type, THREE.HalfFloatType); assert.equal(target.depthBuffer, true);
  assert.equal(owner.snapshot().renderProfile, profile);
  return {width: target.width, height: target.height, samples: target.samples, type: target.texture.type};
}
const templates = {id: 'quality-templates', version: 1, templates: []};
function sceneInput() {
  const catalog = {id: 'quality-catalog', version: 1, resources: structuredClone(definitions)};
  let document = createCompany({id: 'quality-company', width: 7, depth: 5.25}, catalog);
  const room = document.nodes[1];
  document = prepareCompanyChange(document, catalog.resources.map((resource, index) => ({type: 'add-facility', id: `quality/mirror-${index}`, parentId: room.id,
    resource: {id: resource.id, version: resource.version}, transform: {position: [index ? 1.2 : -1.2, 0, 0], yaw: 0}})), {catalog, templates}).document;
  const instances = [], assetLibrary = {instantiate(resource) { const instance = visual(resource); instances.push(instance); return instance; }, preload: async () => {}, retainOnly() {}};
  return {catalog, document, assetLibrary, instances};
}
function sceneFixture(profile) {
  const input = sceneInput(), world = new THREE.Scene();
  const scene = createCompanyScene(world, input.document, {...input, templates, mirrorPreflight: () => {}, ...(profile ? {mirrorRenderProfile: profile} : {})});
  return {scene, world, ...input, dispose: () => scene.dispose()};
}
const move = [{type: 'move', id: 'quality/mirror-0', transform: {position: [-1.2, 0, 0], yaw: 0}}];

const selections = [
  ['RGBA16F and DEPTH_COMPONENT24 support four samples', {}, 'detail-1024-msaa4-v1'],
  ['half-float extension alone is sufficient', {float: false, half: true}, 'detail-1024-msaa4-v1'],
  ['maxSamples below four disables MSAA', {maxSamples: 2}, 'detail-1024-v1'],
  ['color does not offer sample four', {color: [8, 2]}, 'detail-1024-v1'],
  ['depth does not offer sample four', {depth: [8, 2]}, 'detail-1024-v1'],
  ['no color sample list', {color: null}, 'detail-1024-v1'],
  ['empty depth sample list', {depth: []}, 'detail-1024-v1'],
  ['sample four at the exact maxSamples limit', {maxSamples: 4, color: [4], depth: [4]}, 'detail-1024-msaa4-v1'],
  ['texture size below 1024 retains 512', {texture: 1023}, 'single-512-v1'],
  ['renderbuffer size below 1024 retains 512', {buffer: 768}, 'single-512-v1'],
  ['exactly 512 is admitted', {texture: 512, buffer: 512}, 'single-512-v1'],
  ['exactly 1024 is admitted', {texture: 1024, buffer: 1024}, 'detail-1024-msaa4-v1'],
];
for (const [name, options, expected] of selections) await check(`capability selection / ${name}`, () => {
  const renderer = capabilities(options), observed = selectMirrorRenderProfile(renderer); assert.equal(observed, expected);
  if (expected === 'single-512-v1') assert.deepEqual(renderer.queries, []);
  else assert.deepEqual(renderer.queries, [renderer.getContext().RGBA16F, renderer.getContext().DEPTH_COMPONENT24]);
  const f = binding(observed); try { return {selected: observed, ...assertTarget(f.owner, observed)}; } finally { f.dispose(); }
});
for (const [name, options, code] of [
  ['missing renderable HalfFloat extensions', {float: false, half: false}, 'mirror-device-limit'],
  ['texture maximum under 512', {texture: 511}, 'mirror-device-limit'],
  ['renderbuffer maximum under 512', {buffer: 511}, 'mirror-device-limit'],
  ['nonfinite combined target limit', {texture: Infinity, buffer: Infinity}, 'mirror-device-limit'],
  ['missing texture capability', {texture: undefined}, 'mirror-device-limit'],
  ['lost context', {lost: true}, 'mirror-context-lost'],
]) await check(`capability rejection / ${name}`, () => {
  const before = mirrorResourceSnapshot(); assert.throws(() => selectMirrorRenderProfile(capabilities(options)), error => error.code === code);
  assert.deepEqual(mirrorResourceSnapshot(), before);
});

await check('default wall and floor bindings retain 512 / MSAA0', () => {
  for (const floor of [false, true]) { const f = binding(undefined, floor); try { assertTarget(f.owner, 'single-512-v1'); } finally { f.dispose(); } }
});
for (const invalid of ['detail-2048-v1', '', null, undefined, {}, [], ['single-512-v1'], new String('single-512-v1')])
  await check(`invalid explicit render profile / ${Object.prototype.toString.call(invalid)} ${String(invalid)}`, () => {
    assert.throws(() => validateMirrorRenderProfile(invalid), error => error.code === 'invalid-mirror-render-profile');
  });
await check('invalid binding profile rejects without allocating a target or marking source', () => {
  const instance = visual(definitions[0]), before = mirrorResourceSnapshot();
  try {
    assert.throws(() => createMirrorBinding(definitions[0], instance.nodes, 'invalid', 'unknown'), error => error.code === 'invalid-mirror-render-profile');
    assert.equal(instance.face.userData.companyMirrorSurface, undefined); assert.deepEqual(mirrorResourceSnapshot(), before);
  } finally { instance.face.geometry.dispose(); instance.face.material.dispose(); }
});
await check('active owner blocks quality edits and preserves its exact target', () => {
  const f = binding('single-512-v1');
  try {
    const target = f.owner.activate().getRenderTarget(), before = f.owner.snapshot();
    for (const profile of Object.keys(profiles)) assert.throws(() => f.owner.setRenderProfile(profile), error => error.code === 'mirror-quality-active');
    assert.equal(f.owner.reflector.getRenderTarget(), target); assert.deepEqual(f.owner.snapshot(), before);
  } finally { f.dispose(); }
});
await check('inactive profile cycles dispose exact real targets and preserve source surface / resource', () => {
  const f = binding(undefined, true), resource = JSON.stringify(f.resource), positions = [...f.face.geometry.getAttribute('position').array], material = f.face.material;
  let sourceDisposals = 0, targetDisposals = 0;
  f.face.geometry.addEventListener('dispose', () => sourceDisposals++);
  try {
    for (const profile of [...Object.keys(profiles), 'single-512-v1']) {
      f.owner.setRenderProfile(profile); assertTarget(f.owner, profile);
      f.owner.reflector.getRenderTarget().addEventListener('dispose', () => targetDisposals++);
      f.owner.deactivate(); f.owner.deactivate();
      assert.equal(f.owner.active, false); assert.equal(f.face.visible, true); assert.equal(sourceDisposals, 0);
      assert.deepEqual([...f.face.geometry.getAttribute('position').array], positions); assert.equal(f.face.material, material);
      assert.equal(JSON.stringify(f.resource), resource);
    }
    assert.equal(targetDisposals, 4); assert.equal(f.owner.snapshot().created, f.owner.snapshot().disposed);
    const before = f.owner.snapshot(); assert.throws(() => f.owner.setRenderProfile('unknown'), error => error.code === 'invalid-mirror-render-profile'); assert.deepEqual(f.owner.snapshot(), before);
    f.owner.dispose(); assert.throws(() => f.owner.setRenderProfile('single-512-v1'), error => error.code === 'mirror-binding-disposed');
    assert.equal(f.face.userData.companyMirrorSurface, undefined);
    return {targetDisposals, sourceDisposalsBeforeFixtureCleanup: sourceDisposals};
  } finally { f.dispose(); }
});
await check('scene quality changes all inactive current owners and all future builds without save changes', () => {
  const f = sceneFixture();
  try {
    const saved = f.scene.save(), resources = JSON.stringify(f.catalog);
    for (const owner of f.scene.mirrorBindings()) assert.equal(owner.snapshot().renderProfile, 'single-512-v1');
    f.scene.setMirrorRenderProfile('detail-1024-msaa4-v1');
    for (const owner of f.scene.mirrorBindings()) { assertTarget(owner, 'detail-1024-msaa4-v1'); owner.deactivate(); }
    assert.equal(f.scene.save(), saved); assert.equal(JSON.stringify(f.catalog), resources);
    const handle = f.scene.prepareChange(move); f.scene.commit(handle);
    for (const owner of f.scene.mirrorBindings()) { assertTarget(owner, 'detail-1024-msaa4-v1'); owner.deactivate(); }
    f.scene.setView({mode: 'building'}); f.scene.setMirrorRenderProfile('detail-1024-v1'); f.scene.setView({mode: 'floor'});
    for (const owner of f.scene.mirrorBindings()) { assertTarget(owner, 'detail-1024-v1'); owner.deactivate(); }
  } finally { f.dispose(); }
});
await check('scene blocks a quality change atomically if any current target is active', () => {
  const f = sceneFixture('detail-1024-v1');
  try {
    const owners = f.scene.mirrorBindings(); owners[1].activate(); const before = owners.map(owner => owner.snapshot());
    assert.throws(() => f.scene.setMirrorRenderProfile('single-512-v1'), error => error.code === 'mirror-quality-active');
    assert.deepEqual(owners.map(owner => owner.snapshot()), before);
    owners[1].deactivate(); f.scene.setMirrorRenderProfile('single-512-v1');
    for (const owner of owners) assert.equal(owner.snapshot().renderProfile, 'single-512-v1');
  } finally { f.dispose(); }
});
await check('prepared candidate cannot reintroduce an old profile after host quality changes', () => {
  const f = sceneFixture(); let handle;
  try {
    handle = f.scene.prepareChange(move); f.scene.setMirrorRenderProfile('detail-1024-msaa4-v1');
    try { f.scene.commit(handle); }
    catch (error) { assert.equal(error.code, 'revision-conflict'); f.scene.discard(handle); handle = f.scene.prepareChange(move); f.scene.commit(handle); }
    for (const owner of f.scene.mirrorBindings()) assert.equal(owner.snapshot().renderProfile, 'detail-1024-msaa4-v1');
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
await check('quality invalidation keeps candidate ownership until explicit idempotent discard', () => {
  const f = sceneFixture(); let handle;
  try {
    const count = f.instances.length, saved = f.scene.save(), revision = f.scene.revision;
    handle = f.scene.prepareChange(move);
    const candidateInstances = f.instances.slice(count);
    let geometries = 0, materials = 0;
    for (const instance of candidateInstances) {
      instance.face.geometry.addEventListener('dispose', () => geometries++);
      instance.face.material.addEventListener('dispose', () => materials++);
    }
    f.scene.setMirrorRenderProfile('detail-1024-msaa4-v1');
    assert.equal(f.scene.revision, revision); assert.equal(f.scene.save(), saved);
    assert.throws(() => f.scene.commit(handle), error => error.code === 'revision-conflict');
    assert.deepEqual([geometries, materials], [0, 0]);
    f.scene.discard(handle); f.scene.discard(handle);
    assert.deepEqual([geometries, materials], [candidateInstances.length, candidateInstances.length]);
    return {discardedGeometries: geometries, discardedMaterials: materials};
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
await check('setting the same inactive scene quality keeps a prepared candidate valid', () => {
  const f = sceneFixture(); let handle;
  try {
    handle = f.scene.prepareChange(move); f.scene.setMirrorRenderProfile('single-512-v1'); f.scene.commit(handle);
    for (const owner of f.scene.mirrorBindings()) assert.equal(owner.snapshot().renderProfile, 'single-512-v1');
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
await check('invalid scene quality preserves current owners and prepared candidate validity', () => {
  const f = sceneFixture(); let handle;
  try {
    handle = f.scene.prepareChange(move); const before = f.scene.mirrorBindings().map(owner => owner.snapshot());
    for (const invalid of ['unknown', ['single-512-v1'], new String('single-512-v1')])
      assert.throws(() => f.scene.setMirrorRenderProfile(invalid), error => error.code === 'invalid-mirror-render-profile');
    assert.deepEqual(f.scene.mirrorBindings().map(owner => owner.snapshot()), before);
    f.scene.commit(handle);
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
await check('authoring forwards the host profile while persisted company bytes omit runtime quality', async () => {
  const input = sceneInput(), values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const session = await createCompanyAuthoring(new THREE.Scene(), input.document, {...input, templates, storage, mirrorPreflight: () => {}, mirrorRenderProfile: 'detail-1024-msaa4-v1'});
  try {
    for (const owner of session.scene.mirrorBindings()) assert.equal(owner.snapshot().renderProfile, 'detail-1024-msaa4-v1');
    await session.save(); const before = [...values.values()][0];
    session.scene.setMirrorRenderProfile('single-512-v1'); await session.save(); assert.equal([...values.values()][0], before);
    assert.equal(before.includes('detail-1024'), false); assert.equal(before.includes('mirrorRenderProfile'), false);
  } finally { session.dispose(); }
});
const resources = mirrorResourceSnapshot();
checks.push({name: 'all actual reflection targets released', status: resources.live === 0 && resources.created === resources.disposed ? 'passed' : 'failed', resources});
const sourceHashes = {};
for (const filename of ['prototype/src/company/mirror-render.js', 'prototype/src/company/render.js', 'prototype/src/company/authoring.js', 'scripts/company-platform/qa-mirror-quality.mjs']) sourceHashes[filename] = hash(await fs.readFile(filename));
const report = {status: checks.every(result => result.status === 'passed') ? 'passed' : 'failed', generatedAt: new Date().toISOString(), checks, sourceHashes,
  limits: ['Capability queries use a renderer substitute. Reflector geometries, WebGLRenderTarget objects, HalfFloat types and disposal events use actual pinned Three.js code.',
    'Company scene integration uses real document/authoring/scene entry points and valid real resource definitions with synthetic face geometry and a no-op GPU preflight. This does not verify actual shader/sample support or reflection pixels.',
    'GPU same-camera appearance, browser renderer rebuilding/failure recovery and ordinary-computer performance require root integration evidence. Target counters describe objects and events, not allocated GPU bytes.']};
const json = JSON.stringify(report, null, 2) + '\n';
await fs.writeFile(path.join(runDirectory, 'report.json'), json); await fs.writeFile(path.join(output, 'report.json'), json);
console.log(JSON.stringify({status: report.status, checks: checks.length, failures: checks.filter(check => check.status === 'failed'), resources, runDirectory}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
