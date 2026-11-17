import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMakeupMirrorSample} from '../../prototype/src/company/makeup-mirror-samples.js';
import {deriveCompany,prepareCompanyChange,composeTransform} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
import {mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';

const root = new URL('../../', import.meta.url);
const output = new URL('evidence/company-makeup-mirror-data-independent-v1/', root);
const json = value => JSON.stringify(value, null, 2) + '\n';
const read = async name => JSON.parse(await fs.readFile(new URL(name, root)));
const catalog = await read('prototype/src/company/library-catalog.json');
const templates = await read('prototype/src/company/templates-extended.json');
const mirrors = catalog.resources.filter(resource => resource.mountRole === 'makeup-mirror');
const resource = id => catalog.resources.find(candidate => candidate.id === id);
const ref = value => ({id: value.id, version: value.version});
const target = 'vanity/primary/mirror';
const checks = [], findings = [];
const fail = (code, path, message) => { throw Object.assign(new Error(message), {code, path}); };
await fs.mkdir(output, {recursive: true});

function fixture() {
  let document = createMakeupMirrorSample(catalog, templates, {alternate: true, index: 3}).document;
  const room = document.nodes.find(node => node.kind === 'room');
  const table = resource('vanity-table-plain'), seat = resource('vanity-chair-side-entry');
  const operations = [];
  for (const [id, position, index] of [['vanity/second', [1, 0, -1.3], 0], ['vanity/third', [1, 0, .8], 1]]) {
    const transform = {position, yaw: 0};
    operations.push({type: 'add-facility', id, parentId: room.id, resource: ref(table), transform});
    operations.push({type: 'add-facility', id: id + '/seat', parentId: room.id, resource: ref(seat), transform: composeTransform(transform, table.clearance.seat)});
    operations.push({type: 'add-facility', id: id + '/mirror', parentId: id, resource: ref(mirrors[index]), attachment: {surfaceId: 'top'}, transform: {position: [.02, .78, -.135], yaw: 0}, state: {on: true, intensity: index ? 5 : 7}});
  }
  operations.push({type: 'add-facility', id: 'a-fill', parentId: room.id, resource: ref(resource('fill-light')), transform: {position: [-2.5, 0, 1.5], yaw: 0}, state: {on: true, intensity: 2}});
  document = prepareCompanyChange(document, operations, {catalog, templates}).document;
  inspectCompanyPlacement(document, catalog, templates);
  return document;
}

const input = fixture();
await fs.writeFile(new URL('input-four-lamps-two-rooms.json', output), json(input));
const library = createCompanyAssetLibrary({fetchImpl: async url => {
  const bytes = await fs.readFile(new URL('prototype/public' + url, root));
  return {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
}});
await library.preload([...deriveCompany(input, catalog, templates).facilities.map(facility => facility.resource), ...mirrors]);

function apply(scene, operations) {
  let handle;
  try {handle = scene.prepareChange(operations); return scene.commit(handle);}
  finally {if (handle) scene.discard(handle);}
}

function reject(operation) {
  let error;
  try {operation();} catch (cause) {error = cause;}
  assert(error?.code, `Expected typed rejection, got ${error?.stack}`);
  return {code: error.code, path: error.path};
}

async function rejectAsync(operation) {
  let error;
  try {await operation();} catch (cause) {error = cause;}
  assert(error?.code, `Expected typed rejection, got ${error?.stack}`);
  return {code: error.code, path: error.path};
}

async function check(name, operation) {
  try {checks.push({name, passed: true, actual: await operation()});}
  catch (error) {
    const finding = {name, status: 'failed', message: error.message, code: error.code, path: error.path, stack: error.stack};
    checks.push({...finding, passed: false}); findings.push(finding);
    await fs.writeFile(new URL(`failure-${findings.length}.json`, output), json(finding));
  }
}

function makeScene(options = {}) {
  return createCompanyScene(new THREE.Scene(), input, {catalog, templates, assetLibrary: library, mirrorPreflight: () => {}, ...options});
}
const states = scene => scene.document.nodes.filter(node => node.resource).map(node => ({id: node.id, resource: node.resource, parentId: node.parentId, attachment: node.attachment, transform: node.transform, state: node.state}));
const activeLights = scene => scene.snapshot().lights.filter(light => light.intensity > 0).map(light => ({id: light.id, intensity: light.intensity}));
const object = (scene, id) => scene.root.getObjectByName(id);
const lamp = (scene, id) => object(scene, id).getObjectByName('makeup-lamp');
const light = (scene, id) => object(scene, id).children.find(child => child.isSpotLight);

try {
  await check('Strict new-resource dispatch rejects actual fixed light/mapping/state drift while preserving all legacy mirror resources', () => {
    const changes = [
      ['light unknown field', value => value.light.castShadow = true],
      ['light yaw direction', value => value.light.target = [0, .43, -.72]],
      ['light color', value => value.light.color = '#ffffff'],
      ['light NaN angle', value => value.light.angle = NaN],
      ['light infinite range', value => value.light.distance = Infinity],
      ['light point kind', value => value.light.kind = 'point'],
      ['light missing target', value => delete value.light.target],
      ['lamp different node', value => value.makeupLamp.node = 'makeup-face-center'],
      ['lamp different intensity', value => value.makeupLamp.maxEmissiveIntensity = 2],
      ['node different base', value => value.makeupNodes.base = 'makeup-back-center'],
      ['side wrong back', value => value.mirrorPanels[1].backNode = 'makeup-back-right'],
      ['side duplicate key', value => value.mirrorPanels[1].id = 'center'],
      ['side missing group member', value => value.mirrorPanels.pop()],
      ['state meaning drift', value => value.stateSemantics.on = 'reflection-on'],
      ['state invalid default', value => value.stateDefaults.intensity = 10],
      ['state permissive bound', value => value.stateSchema.intensity.max = 11],
      ['unknown state field', value => value.stateSchema.reflectionOn = {type: 'boolean'}],
      ['schema disguise', value => value.mirrorSurface.schema = 'planar-mirror-v1'],
      ['role disguise', value => value.mountRole = 'mirror'],
      ['omitted schema', value => delete value.mirrorSurface],
      ['mechanism moving part', value => value.movingParts = []],
    ];
    const results = changes.map(([name, change]) => {
      const mutated = structuredClone(mirrors[3]); change(mutated);
      const failure = reject(() => validateMirrorResource(mutated, fail));
      const alteredCatalog = structuredClone(catalog);
      alteredCatalog.resources[alteredCatalog.resources.findIndex(candidate => candidate.id === mutated.id)] = mutated;
      const derived = reject(() => deriveCompany(input, alteredCatalog, templates));
      return {name, failure, documentFailure: derived};
    });
    for (const field of ['kind', 'color', 'position', 'target', 'distance', 'angle', 'penumbra']) {
      const changed = structuredClone(mirrors[0]);
      changed.light[field] = Array.isArray(changed.light[field]) ? changed.light[field].map(value => value + .01) : typeof changed.light[field] === 'number' ? changed.light[field] + .01 : 'changed';
      const comparison = compareFacilityFunction(mirrors[0], changed);
      assert(!comparison.compatible && comparison.differences.some(difference => difference.field.startsWith('light.')));
    }
    const legacy = catalog.resources.filter(candidate => ['mirror', 'floor-mirror'].includes(candidate.mountRole));
    for (const old of legacy) validateMirrorResource(old, fail);
    for (const first of mirrors) for (const second of mirrors) assert(compareFacilityFunction(first, second).compatible);
    return {rejections: results, legacyResourcesAccepted: legacy.length, mirrorCompatibilityPairs: 16};
  });

  await check('Attachment attacks and unsupported material targets reject before changing the live hierarchy, document or lights', () => {
    const scene = makeScene();
    try {
      const saved = scene.save(), oldRoot = scene.root, oldMirror = object(scene, target), oldLights = activeLights(scene);
      const roomId = scene.document.nodes.find(node => node.kind === 'room').id;
      const invalid = [
        [{type: 'attach-surface', id: target, parentId: roomId, surfaceId: 'top', transform: {position: [.02, .78, -.135], yaw: 0}}],
        [{type: 'attach-surface', id: target, parentId: 'vanity/primary/ornament-0', surfaceId: 'top', transform: {position: [.02, .78, -.135], yaw: 0}}],
        [{type: 'attach-surface', id: target, parentId: 'vanity/primary', surfaceId: 'bottom', transform: {position: [.02, .78, -.135], yaw: 0}}],
        [{type: 'attach-surface', id: target, parentId: target, surfaceId: 'top', transform: {position: [.02, .78, -.135], yaw: 0}}],
        [{type: 'move', id: target, transform: {position: [.02, .78, -.135], yaw: Math.PI / 2}}],
        [{type: 'set-appearance', id: target, appearance: {materials: {'makeup-lamp': {color: '#000000'}}}}],
        [{type: 'set-state', id: target, state: {intensity: -1}}],
        [{type: 'set-state', id: target, state: {on: 1}}],
        [{type: 'set-state', id: target, state: {on: true, intensity: 1, reflectionOn: false}}],
      ];
      const rejections = invalid.map(operations => {
        const result = reject(() => apply(scene, operations));
        assert.equal(scene.save(), saved); assert.equal(scene.root, oldRoot); assert.equal(object(scene, target), oldMirror); assert.deepEqual(activeLights(scene), oldLights);
        return {operations, result};
      });
      for (const edit of [node => delete node.attachment, node => node.attachment.extra = true]) {
        const bad = scene.document; edit(bad.nodes.find(node => node.id === target));
        reject(() => deriveCompany(bad, catalog, templates)); assert.equal(scene.save(), saved);
      }
      return {rejections, oldMirrorParent: oldMirror.parent.name};
    } finally {scene.dispose();}
  });

  await check('Four real lamps share exactly two slots and suppressed lamps enter immediately when earlier lamps turn off or reach zero', () => {
    const scene = makeScene();
    try {
      const snapshots = [];
      assert.deepEqual(activeLights(scene), [{id: 'a-fill', intensity: 2}, {id: target, intensity: 7}]);
      snapshots.push({action: 'initial', active: activeLights(scene)});
      apply(scene, [{type: 'set-state', id: 'a-fill', state: {on: false}}]);
      assert.deepEqual(activeLights(scene), [{id: target, intensity: 7}, {id: 'vanity/second/mirror', intensity: 7}]);
      snapshots.push({action: 'fill off', active: activeLights(scene)});
      apply(scene, [{type: 'set-state', id: target, state: {intensity: 0}}]);
      assert.deepEqual(activeLights(scene), [{id: 'vanity/second/mirror', intensity: 7}, {id: 'vanity/third/mirror', intensity: 5}]);
      snapshots.push({action: 'primary intensity zero', active: activeLights(scene)});
      const zeroNode = scene.document.nodes.find(node => node.id === target);
      assert.deepEqual(zeroNode.state, {on: true, intensity: 0}); assert.equal(lamp(scene, target).material.emissiveIntensity, 0);
      for (const id of [target, 'vanity/second/mirror', 'vanity/third/mirror']) {
        const actual = light(scene, id);
        assert(actual.isSpotLight && !actual.castShadow && actual.decay === 2);
        assert.equal(actual.parent, object(scene, id)); assert.equal(actual.target.parent, object(scene, id));
      }
      const allLamps = [target, 'vanity/second/mirror', 'vanity/third/mirror'].map(id => lamp(scene, id).material);
      assert.equal(new Set(allLamps).size, 3);
      assert(Math.abs(allLamps[1].emissiveIntensity - 1.05) < 1e-12); assert.equal(allLamps[2].emissiveIntensity, .75);
      return {snapshots, allLampStates: states(scene).filter(node => node.id.endsWith('/mirror')), bindingsStillPresent: scene.mirrorBindings().length};
    } finally {scene.dispose();}
  });

  await check('Room, building and rejected view changes preserve stored lamp states while suppressing hidden-room lights', () => {
    const scene = makeScene();
    try {
      apply(scene, [{type: 'set-state', id: 'vanity/secondary/mirror', state: {on: true, intensity: 3}}]);
      const before = states(scene), rooms = scene.document.nodes.filter(node => node.kind === 'room'), snapshots = [];
      scene.setView({mode: 'room', roomId: rooms[1].id});
      assert.deepEqual(activeLights(scene), [{id: 'vanity/secondary/mirror', intensity: 3}]);
      assert.deepEqual(states(scene), before);
      snapshots.push({view: scene.view, lights: scene.snapshot().lights});
      const saved = scene.save(), liveRoot = scene.root, view = scene.view;
      const rejections = [
        reject(() => scene.setView({mode: 'unknown'})),
        reject(() => scene.setView({mode: 'room', roomId: target})),
        reject(() => scene.setView({mode: 'room', roomId: 'missing-room'})),
        reject(() => scene.setView({mode: 'floor', floorId: 'missing-floor'})),
      ];
      assert.equal(scene.save(), saved); assert.equal(scene.root, liveRoot); assert.deepEqual(scene.view, view);
      scene.setView({mode: 'building'});
      assert.equal(scene.snapshot().lights.length, 0); assert.equal(scene.mirrorBindings().length, 0); assert.deepEqual(states(scene), before);
      snapshots.push({view: scene.view, lights: scene.snapshot().lights});
      scene.setView({mode: 'room', roomId: rooms[0].id});
      assert.deepEqual(activeLights(scene), [{id: 'a-fill', intensity: 2}, {id: target, intensity: 7}]); assert.deepEqual(states(scene), before);
      snapshots.push({view: scene.view, lights: scene.snapshot().lights});
      return {snapshots, rejections};
    } finally {scene.dispose();}
  });

  await check('Rejected GPU-host admission disposes all candidate plane targets while retaining old real owner, materials, lights and saved bytes', () => {
    let shouldReject = false;
    const scene = makeScene({mirrorPreflight: ({mirrors: bindings}) => {
      if (!shouldReject) return;
      for (const binding of bindings.filter(binding => binding.ownerId === target)) binding.activate();
      throw Object.assign(new Error('Independent injected host-admission failure after real target-object allocation'), {code: 'independent-host-admission'});
    }});
    try {
      const oldBindings = scene.mirrorBindings().filter(binding => binding.ownerId === target);
      assert.equal(oldBindings.length, 3); for (const binding of oldBindings) binding.activate();
      const saved = scene.save(), oldRoot = scene.root, oldObject = object(scene, target), oldMaterial = lamp(scene, target).material, before = mirrorResourceSnapshot(), oldLights = activeLights(scene);
      let handle;
      try {
        handle = scene.prepareChange([{type: 'set-state', id: target, state: {intensity: 8}}]);
        shouldReject = true;
        const failure = reject(() => scene.commit(handle));
        assert.equal(failure.code, 'independent-host-admission');
        scene.discard(handle); scene.discard(handle);
        assert.equal(scene.save(), saved); assert.equal(scene.root, oldRoot); assert.equal(object(scene, target), oldObject); assert.equal(lamp(scene, target).material, oldMaterial); assert.deepEqual(activeLights(scene), oldLights);
        const after = mirrorResourceSnapshot();
        assert.equal(after.live, before.live); assert.equal(after.created - before.created, 3); assert.equal(after.disposed - before.disposed, 3);
        assert(oldBindings.every(binding => binding.active && !binding.snapshot().disposed));
        return {failure, targetsBefore: before, targetsAfter: after, oldBindings: oldBindings.map(binding => binding.snapshot())};
      } finally {if (handle) scene.discard(handle);}
    } finally {scene.dispose();}
  });

  await check('Stale prepared candidate and discarded replacement cannot publish after a view change or mutate another mirror instance', () => {
    const scene = makeScene();
    try {
      const beforeStates = states(scene), firstMaterial = lamp(scene, target).material, secondMaterial = lamp(scene, 'vanity/second/mirror').material;
      assert.notEqual(firstMaterial, secondMaterial);
      let handle = scene.prepareChange([{type: 'set-state', id: target, state: {on: false}}]);
      scene.discard(handle); scene.discard(handle);
      assert.deepEqual(states(scene), beforeStates); assert.equal(lamp(scene, target).material, firstMaterial); assert(Math.abs(secondMaterial.emissiveIntensity - 1.05) < 1e-12);
      handle = scene.prepareChange([{type: 'replace-resource', id: target, resource: ref(mirrors[0])}]);
      scene.setView({mode: 'room', roomId: scene.document.nodes.find(node => node.kind === 'room').id});
      const saved = scene.save(), rootBefore = scene.root;
      const failure = reject(() => scene.commit(handle)); scene.discard(handle);
      assert.equal(failure.code, 'revision-conflict'); assert.equal(scene.save(), saved); assert.equal(scene.root, rootBefore); assert.deepEqual(states(scene), beforeStates);
      return {failure, materialObjectsDistinct: true, originalLampValues: [firstMaterial.emissiveIntensity, secondMaterial.emissiveIntensity]};
    } finally {scene.dispose();}
  });

  await check('Moving the table and paired seat carries every baked mirror plane, real lamp and target while other owners keep identity and state', () => {
    const scene = makeScene();
    try {
      const otherNodes = states(scene).filter(node => !node.id.startsWith('vanity/primary'));
      const tableNode = scene.document.nodes.find(node => node.id === 'vanity/primary');
      const tableResource = resource(tableNode.resource.id);
      const transform = {position: [-1.5, 0, -1.1], yaw: Math.PI / 2};
      apply(scene, [
        {type: 'move', id: tableNode.id, transform},
        {type: 'move', id: tableNode.id + '/seat', transform: composeTransform(transform, tableResource.clearance.seat)},
      ]);
      assert.deepEqual(states(scene).filter(node => !node.id.startsWith('vanity/primary')), otherNodes);
      const mirrorObject = object(scene, target), expectedMirror = composeTransform(transform, {position: [.02, .78, -.135], yaw: 0});
      assert.equal(mirrorObject.parent, object(scene, tableNode.id));
      assert(mirrorObject.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...expectedMirror.position)) < 1e-10);
      const actualLight = light(scene, target);
      for (const [actual, local] of [[actualLight, mirrors[3].light.position], [actualLight.target, mirrors[3].light.target]]) {
        const expected = composeTransform(expectedMirror, {position: local, yaw: 0}).position;
        assert(actual.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...expected)) < 1e-10);
      }
      const planes = [];
      for (const binding of scene.mirrorBindings().filter(candidate => candidate.ownerId === target)) {
        const reflector = binding.activate(), descriptor = binding.snapshot(); reflector.updateWorldMatrix(true, false);
        const expected = composeTransform(expectedMirror, {position: descriptor.planePosition, yaw: descriptor.planeYaw});
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(reflector.matrixWorld);
        assert(reflector.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...expected.position)) < 1e-10);
        assert(normal.distanceTo(new THREE.Vector3(Math.sin(expected.yaw), 0, Math.cos(expected.yaw))) < 1e-10);
        planes.push({id: descriptor.id, position: reflector.getWorldPosition(new THREE.Vector3()).toArray(), normal: normal.toArray()});
      }
      assert.equal(planes.length, 3);
      return {expectedMirror, light: actualLight.getWorldPosition(new THREE.Vector3()).toArray(), target: actualLight.target.getWorldPosition(new THREE.Vector3()).toArray(), planes, otherOwnerNodesPreserved: otherNodes.length};
    } finally {scene.dispose();}
  });

  await check('Authoring save and transactional import retain storage bytes and live scene on bad mounting/state or failed host preflight', async () => {
    const stored = new Map(), storage = {getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value)};
    let deny = false;
    const authoring = await createCompanyAuthoring(new THREE.Scene(), input, {catalog, templates, assetLibrary: library, storage, mirrorPreflight: () => {if (deny) throw Object.assign(new Error('Injected admission failure'), {code: 'independent-authoring-admission'});}});
    try {
      await authoring.save(); const oldStorage = [...stored], saved = authoring.scene.save(), oldRoot = authoring.scene.root;
      const invalid = structuredClone(input); invalid.nodes.find(node => node.id === target).attachment.surfaceId = 'missing';
      const rejectedMount = await rejectAsync(() => authoring.import(JSON.stringify(invalid)));
      const rejectedState = await rejectAsync(() => authoring.apply([{type: 'set-state', id: target, state: {intensity: 100}}]));
      deny = true;
      const rejectedHost = await rejectAsync(() => authoring.apply([{type: 'replace-resource', id: target, resource: ref(mirrors[1])}]));
      assert.equal(authoring.scene.save(), saved); assert.equal(authoring.scene.root, oldRoot); assert.deepEqual([...stored], oldStorage);
      deny = false;
      await authoring.restore(); assert.equal(authoring.scene.save(), saved); assert.deepEqual([...stored], oldStorage);
      return {rejectedMount, rejectedState, rejectedHost, retainedStorageEntries: stored.size, retainedBytes: oldStorage.reduce((sum, [, value]) => sum + Buffer.byteLength(value), 0)};
    } finally {authoring.dispose();}
  });
} finally {
  library.dispose();
  const sources = {};
  for (const name of ['prototype/src/company/makeup-mirror-data.js', 'prototype/src/company/mirror-data.js', 'prototype/src/company/document.js', 'prototype/src/company/appearance-contract.js', 'prototype/src/company/render.js', 'prototype/src/company/library-catalog.json', 'prototype/src/company/makeup-mirror-geometry.js', 'scripts/company-platform/verify-makeup-mirror-data-independent.mjs'])
    sources[name] = createHash('sha256').update(await fs.readFile(new URL(name, root))).digest('hex');
  const report = {status: findings.length ? 'failed' : 'passed', checks, findings, sources, finalTargetObjects: mirrorResourceSnapshot(), limits: ['Independent CPU review using actual GLBs, shared authoring/save/scene entry points and real Three target objects. Mirror host preflight is a controlled synchronous stub.', 'No GPU draw, framebuffer/shader, pixel reflection/light transport, browser-process reopening, ordinary-device performance or C3 character-lighting acceptance.']};
  await fs.writeFile(new URL('report.json', output), json(report));
  console.log(JSON.stringify({status: report.status, checks: checks.length, findings, finalTargetObjects: report.finalTargetObjects}));
  if (findings.length) process.exitCode = 1;
}
