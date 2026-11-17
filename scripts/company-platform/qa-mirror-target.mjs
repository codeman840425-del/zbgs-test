import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMirrorController, mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';

const output = path.resolve(process.argv[2] || 'evidence/company-mirror-quality-cpu-v1/target-gate');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], hash = value => createHash('sha256').update(value).digest('hex');
function check(name, action) {
  try { checks.push({name, status: 'passed', detail: action()}); }
  catch (error) { checks.push({name, status: 'failed', error: error.stack, code: error.code}); }
}
function rendererSubstitute() {
  const hostTarget = new THREE.WebGLRenderTarget(16, 16);
  let target = hostTarget, face = 2, mip = 1, pendingError = 0, scissorTest = true;
  const viewport = new THREE.Vector4(2, 3, 12, 11), scissor = new THREE.Vector4(1, 2, 10, 9), programs = new Map();
  const observations = {statusQueries: 0, sampleQueries: 0, draws: 0, targetIds: []};
  const gl = {
    FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5, FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    SAMPLES: 0x80a9, SCISSOR_BOX: 0x0c10, SCISSOR_TEST: 0x0c11,
    isContextLost: () => false,
    getError() { const observed = pendingError; pendingError = 0; return observed; },
    checkFramebufferStatus(framebuffer) {
      assert.equal(framebuffer, this.FRAMEBUFFER); assert(target?.isWebGLRenderTarget); assert.equal(target.width, 1024);
      observations.statusQueries++; observations.targetIds.push(target.uuid);
      if (renderer.mode === 'missing-fbo') return 0;
      return renderer.mode === 'incomplete-fbo' ? this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT : this.FRAMEBUFFER_COMPLETE;
    },
    getParameter(parameter) {
      if (parameter === this.SCISSOR_BOX) return Int32Array.from(scissor.toArray());
      if (parameter === this.SCISSOR_TEST) return scissorTest;
      assert.equal(parameter, this.SAMPLES); observations.sampleQueries++;
      return renderer.mode === 'sample-mismatch' ? 0 : target.samples;
    },
  };
  const renderer = {
    mode: 'normal', observations, xr: {enabled: true}, shadowMap: {autoUpdate: true}, autoClear: false,
    debug: {onShaderError: null, checkShaderErrors: false},
    properties: {get: material => programs.get(material)},
    compile(object) { programs.set(object.material, {currentProgram: {getUniforms: () => ({})}}); },
    getContext: () => gl, getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    getCurrentViewport: result => result.copy(viewport),
    state: {buffers: {depth: {setMask() {}}}, viewport: value => viewport.copy(value), scissor: value => scissor.copy(value), setScissorTest: value => { scissorTest = value; }},
    setRenderTarget(value, nextFace = 0, nextMip = 0) {
      target = value; face = nextFace; mip = nextMip;
      if (value) { viewport.copy(value.viewport); scissor.copy(value.scissor); scissorTest = value.scissorTest; }
      if (value?.width === 1024 && renderer.mode === 'allocation-error') pendingError = 0x0505;
    },
    clear() {},
    render() {
      observations.draws++;
      if (renderer.mode === 'draw-error') pendingError = 0x0506;
      if (renderer.mode === 'unknown-draw-throw') throw new Error('injected unknown renderer internals failure');
    },
    setPendingError(value) { pendingError = value; },
    snapshot() { return {target, face, mip, viewport: viewport.toArray(), scissor: scissor.toArray(), scissorTest,
      xr: this.xr.enabled, shadow: this.shadowMap.autoUpdate, render: this.render, shaderCallback: this.debug.onShaderError, shaderChecks: this.debug.checkShaderErrors}; },
    dispose() { hostTarget.dispose(); },
  };
  return renderer;
}
const definitions = await Promise.all(['round', 'full'].map(async name => JSON.parse(await fs.readFile(`prototype/public/company-assets/floor-mirror-v1/${name}/v1/resource.json`, 'utf8'))));
function fixture() {
  const world = new THREE.Scene(), renderer = rendererSubstitute(), controller = createMirrorController();
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 100); camera.position.set(0, .92, 3); camera.lookAt(0, .92, 0); camera.updateMatrixWorld(true);
  const catalog = {id: 'target-gate-catalog', version: 1, resources: structuredClone(definitions)}, templates = {templates: []};
  let document = createCompany({id: 'target-gate-company', width: 7, depth: 5.25}, catalog);
  document = prepareCompanyChange(document, [{type: 'add-facility', id: 'target-gate/mirror', parentId: document.nodes[1].id,
    resource: {id: definitions[0].id, version: 1}, transform: {position: [0, 0, 0], yaw: 0}}], {catalog, templates}).document;
  const instances = [], candidateTargets = [];
  const assetLibrary = {instantiate(resource) {
    const root = new THREE.Group(), face = new THREE.Mesh(new THREE.PlaneGeometry(.68, 1.68).translate(0, .92, .026), new THREE.MeshStandardMaterial());
    face.name = 'mirror-surface'; root.add(face); const instance = {root, face, nodes: new Map([[face.name, face]])}; instances.push(instance); return instance;
  }};
  let frameId = 0;
  const scene = createCompanyScene(world, document, {catalog, templates, assetLibrary, mirrorRenderProfile: 'detail-1024-msaa4-v1',
    mirrorPreflight({mirrors}) {
      for (const owner of mirrors) {
        const instance = instances.find(item => item.face === owner.surface);
        instance.owner = owner;
        instance.root.addEventListener('childadded', event => {
          if (event.child.isReflector) candidateTargets.push(event.child.getRenderTarget());
        });
      }
      controller.preflight(mirrors, renderer, world, camera, {frameId: ++frameId, timeMs: frameId * 34});
    }});
  return {scene, controller, renderer, world, instances, candidateTargets, dispose() { scene.dispose(); controller.dispose(); renderer.dispose(); }};
}
const replace = [{type: 'replace-resource', id: 'target-gate/mirror', resource: {id: definitions[1].id, version: 1}}];

for (const [mode, expected, expectedDraws] of [
  ['missing-fbo', 'mirror-target-failed', 0],
  ['incomplete-fbo', 'mirror-target-failed', 0],
  ['sample-mismatch', 'mirror-target-failed', 0],
  ['allocation-error', 'mirror-target-failed', 0],
  ['draw-error', 'mirror-target-failed', 1],
  ['preexisting-host-error', 'mirror-host-gl-error', 0],
  ['unknown-draw-throw', 'mirror-renderer-reset-required', 1],
]) check(`candidate target gate / ${mode}`, () => {
  const f = fixture(); let handle;
  try {
    const oldOwner = f.scene.mirrorBindings()[0], oldTarget = oldOwner.reflector.getRenderTarget(), beforeSave = f.scene.save(), beforeDocument = f.scene.document;
    let oldDisposals = 0, candidateDisposals = 0;
    oldTarget.addEventListener('dispose', () => oldDisposals++);
    handle = f.scene.prepareChange(replace);
    const candidate = f.instances.at(-1);
    candidate.root.addEventListener('childadded', event => { if (event.child.isReflector) event.child.getRenderTarget().addEventListener('dispose', () => candidateDisposals++); });
    f.renderer.mode = mode;
    if (mode === 'preexisting-host-error') f.renderer.setPendingError(0x0502);
    const state = f.renderer.snapshot(), draws = f.renderer.observations.draws, statusQueries = f.renderer.observations.statusQueries;
    assert.throws(() => f.scene.commit(handle), error => error.code === expected);
    assert.equal(f.scene.mirrorBindings()[0], oldOwner); assert.equal(oldOwner.reflector.getRenderTarget(), oldTarget);
    assert.equal(oldOwner.active, true); assert.equal(oldDisposals, 0); assert.equal(candidateDisposals, 1);
    assert.equal(candidate.owner.active, false); assert.equal(candidate.owner.fresh, false);
    assert.deepEqual(f.scene.document, beforeDocument); assert.equal(f.scene.save(), beforeSave);
    assert.deepEqual(f.renderer.snapshot(), state);
    assert.equal(f.renderer.observations.draws - draws, expectedDraws);
    assert.equal(f.renderer.observations.statusQueries - statusQueries, mode === 'preexisting-host-error' ? 0 : 1);
    const rejectedTarget = f.candidateTargets.at(-1);
    if (mode !== 'preexisting-host-error') assert.equal(f.renderer.observations.targetIds.at(-1), rejectedTarget.uuid);
    f.scene.discard(handle); f.scene.discard(handle); assert.equal(candidateDisposals, 1);
    assert.equal(mirrorResourceSnapshot().live, 1);
    return {error: expected, oldTargetRetained: true, candidateDisposals, drawCallsBeforeRejection: expectedDraws,
      glStatusQueriedAfterActualTargetBinding: mode !== 'preexisting-host-error', documentAndSavedBytesUnchanged: true};
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
check('healthy matching MSAA target commits and releases its previous owner', () => {
  const f = fixture(); let handle;
  try {
    const old = f.scene.mirrorBindings()[0], target = old.reflector.getRenderTarget(); let oldDisposals = 0;
    target.addEventListener('dispose', () => oldDisposals++);
    handle = f.scene.prepareChange(replace); f.scene.commit(handle);
    const next = f.scene.mirrorBindings()[0]; assert.notEqual(next, old); assert.equal(next.fresh, true);
    assert.equal(next.reflector.getRenderTarget().samples, 4); assert.equal(oldDisposals, 1); assert.equal(old.disposed, true);
    assert.equal(f.scene.document.nodes.find(node => node.id === 'target-gate/mirror').resource.id, definitions[1].id);
    assert.equal(mirrorResourceSnapshot().live, 1);
  } finally { if (handle) f.scene.discard(handle); f.dispose(); }
});
const resources = mirrorResourceSnapshot();
checks.push({name: 'all reflection target objects disposed exactly once', status: resources.live === 0 && resources.created === resources.disposed ? 'passed' : 'failed', resources});
const sourceHashes = {};
for (const filename of ['prototype/src/company/mirror-render.js', 'prototype/src/company/render.js', 'scripts/company-platform/qa-mirror-target.mjs']) sourceHashes[filename] = hash(await fs.readFile(filename));
const report = {status: checks.every(result => result.status === 'passed') ? 'passed' : 'failed', generatedAt: new Date().toISOString(), checks, sourceHashes,
  limits: ['Actual pinned Three Reflector, target objects, scene prepare/commit/discard and disposal events execute on CPU with renderer/GL substitutes and synthetic face geometry.',
    'The substitute injects framebuffer status, actual sample count and WebGL error results. It does not establish real GPU allocation, multisampling or image quality.',
    'Unknown renderer exceptions require host renderer reconstruction. Retaining old target objects and restoring public state does not prove recovery of Three private render stacks.']};
const json = JSON.stringify(report, null, 2) + '\n'; await fs.writeFile(path.join(runDirectory, 'report.json'), json); await fs.writeFile(path.join(output, 'report.json'), json);
console.log(JSON.stringify({status: report.status, checks: checks.length, failures: checks.filter(result => result.status === 'failed'), resources, runDirectory}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
