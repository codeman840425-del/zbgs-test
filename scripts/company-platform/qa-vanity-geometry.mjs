import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {validateVanityGeometry} from '../../prototype/src/company/vanity-geometry.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-vanity-geometry-v1');
const collectionPath = path.resolve(process.argv[3] || 'prototype/public/company-assets/vanity-table-v1/collection.json');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const material = new THREE.MeshBasicMaterial();
const checks = [], realAssets = [];
const definition = (sourceDesign = 'plain') => ({id: 'vanity-geometry-fixture', mount: 'floor-surface', mountRole: 'vanity-table', provenance: {sourceDesign},
  footprint: {blocking: true}, supportSurfaces: [{id: 'top', center: [.02, 0], topY: .78, halfSize: [.40, .22], clearanceHeight: .65}],
  supportNodes: {top: 'vanity-top'}, clearance: {schema: 'vanity-clearance-v1', knee: {min: [-.33, 0, -.12], max: [.37, .70, .25]}}});
const fail = (code, failurePath, message, details) => { throw Object.assign(new Error(message), {code, path: failurePath, details}); };
const invoke = (scene, resource = definition()) => validateVanityGeometry(scene, resource, fail);

function box(name, min, max, surfaceMaterial = material) {
  const geometry = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const mesh = new THREE.Mesh(geometry, surfaceMaterial); mesh.name = name;
  return mesh;
}

function scene({legBottom = 0} = {}) {
  const root = new THREE.Scene();
  root.add(box('vanity-top', [-.55, .745, -.25], [.55, .78, .25]));
  for (const x of [-.5, .5]) for (const z of [-.2, .2]) root.add(box(`leg-${x}-${z}`, [x - .02, legBottom, z - .02], [x + .02, .745, z + .02]));
  return root;
}

function changeGeometry(root, name, change) {
  const mesh = root.getObjectByName(name);
  mesh.geometry = mesh.geometry.toNonIndexed();
  change(mesh.geometry);
}

function removeTriangle(geometry) {
  const original = geometry.getAttribute('position');
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(original.array).slice(9), 3));
}

function mergeInto(root, targetName, extra) {
  const target = root.getObjectByName(targetName);
  target.geometry = mergeGeometries([target.geometry.toNonIndexed(), extra.geometry.toNonIndexed()]);
}

function pass(name, root, resource = definition()) {
  const observed = invoke(root, resource);
  const support = resource.mountRole === 'vanity-table' ? validateSupportGeometry(root, resource, fail) : undefined;
  checks.push({name, passed: true, observed, support});
}

function reject(name, root, resource, codes) {
  let captured;
  try { invoke(root, resource); } catch (error) { captured = error; }
  assert(captured, `${name} unexpectedly passed`);
  assert((Array.isArray(codes) ? codes : [codes]).includes(captured.code), `${name} expected ${codes}, received ${captured.code}: ${captured.message}`);
  checks.push({name, passed: true, rejected: {code: captured.code, path: captured.path, message: captured.message, details: captured.details}});
}

const mutations = [
  {name: 'missing real board', code: 'vanity-top', change(root) { root.getObjectByName('vanity-top').removeFromParent(); }},
  {name: 'real board missing triangle', code: 'vanity-open-or-inconsistent', change(root) { changeGeometry(root, 'vanity-top', removeTriangle); }},
  {name: 'top bound does not replace uniform real board thickness', code: 'vanity-top', change(root) {
    const positions = root.getObjectByName('vanity-top').geometry.clone().getAttribute('position');
    for (let index = 0; index < positions.count; index++) if (positions.getY(index) < .75) {
      positions.setX(index, positions.getX(index) * .8); positions.setZ(index, positions.getZ(index) * .8);
    }
    root.getObjectByName('vanity-top').geometry = root.getObjectByName('vanity-top').geometry.clone();
    root.getObjectByName('vanity-top').geometry.setAttribute('position', positions);
  }},
  {name: 'floating leg despite other grounded legs', code: 'vanity-detached-component', change(root) {
    const leg = root.children.find(node => node.isMesh && node.name !== 'vanity-top' && /leg/.test(node.name));
    assert(leg, 'Fixture needs a real leg');
    const geometry = leg.geometry.clone(), positions = geometry.getAttribute('position');
    let minY = Infinity, maxY = -Infinity;
    for (let index = 0; index < positions.count; index++) { minY = Math.min(minY, positions.getY(index)); maxY = Math.max(maxY, positions.getY(index)); }
    // Isolate from both the real back brace and the mobile caster chain.
    for (let index = 0; index < positions.count; index++) positions.setY(index, .3 + (positions.getY(index) - minY) / (maxY - minY) * .1);
    leg.geometry = geometry;
  }},
  {name: 'one mesh contains hidden floating closed block', code: 'vanity-detached-component', change(root) {
    let leg; root.traverse(node => { if (!leg && node.isMesh && /leg/.test(node.name)) leg = node; });
    assert(leg, 'Fixture needs a real leg');
    mergeInto(root, leg.name, box('hidden', [-.05, .71, -.05], [.05, .73, .05]));
  }},
  {name: 'real knee intruder', code: 'vanity-knee-occupied', change(root) {
    root.add(box('knee-intruder', [-.05, .65, -.05], [.05, .745, .05], root.getObjectByName('vanity-top').material));
  }},
  {name: 'reverse one real board face', code: 'vanity-open-or-inconsistent', change(root) {
    changeGeometry(root, 'vanity-top', geometry => {
      const position = geometry.getAttribute('position'), a = new THREE.Vector3().fromBufferAttribute(position, 0), b = new THREE.Vector3().fromBufferAttribute(position, 1);
      position.setXYZ(0, b.x, b.y, b.z); position.setXYZ(1, a.x, a.y, a.z);
    });
  }},
  {name: 'fully inward real board', code: 'vanity-nonpositive-volume', change(root) {
    changeGeometry(root, 'vanity-top', geometry => {
      const position = geometry.getAttribute('position');
      for (let index = 0; index < position.count; index += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(position, index), b = new THREE.Vector3().fromBufferAttribute(position, index + 1);
        position.setXYZ(index, b.x, b.y, b.z); position.setXYZ(index + 1, a.x, a.y, a.z);
      }
    });
  }},
  {name: 'out of installation envelope', code: 'vanity-envelope', change(root) {
    root.add(box('outside', [.54, .70, -.05], [.57, .745, .05], root.getObjectByName('vanity-top').material));
  }},
];

let failure, realAssetsPending = false;
try {
  pass('closed convex four-leg table with real positive-area contacts', scene());
  const transformed = scene(); transformed.position.set(12, -3, 5); transformed.rotation.set(.1, .7, -.2);
  pass('validation uses resource scene coordinates under transformed root', transformed);
  const wrapperScene = new THREE.Scene(), wrapper = new THREE.Group(); wrapperScene.add(wrapper);
  for (const child of [...scene().children]) wrapper.add(child);
  pass('actual nested static meshes remain supported', wrapperScene);
  const corner = scene(), old = corner.getObjectByName('vanity-top'); old.removeFromParent();
  corner.add(box('vanity-top', [-.4, .745, -.25], [.55, .78, .25]));
  corner.add(box('vanity-wing', [-.55, .745, -.25], [-.4, .78, 0]));
  corner.getObjectByName('leg--0.5-0.2').removeFromParent();
  pass('real L-top with positive-area wing interface', corner, definition('corner'));
  const missingWing = corner.clone(true); missingWing.getObjectByName('vanity-wing').removeFromParent();
  reject('corner main board requires the real back-left wing', missingWing, definition('corner'), 'vanity-top');
  const filledNotch = corner.clone(true); filledNotch.add(box('illegal-notch-filler', [-.55, .745, 0], [-.4, .78, .25]));
  reject('corner front-left notch cannot be silently filled', filledNotch, definition('corner'), 'vanity-corner-notch');
  reject('plain source identity cannot silently select the corner gate', corner.clone(true), definition('plain'), 'vanity-top');
  reject('corner source identity cannot silently select the plain gate', scene(), definition('corner'), 'vanity-top');
  const missingProfile = definition(); delete missingProfile.provenance;
  reject('missing source profile cannot infer rules from actual bounds', scene(), missingProfile, 'vanity-shape-profile');
  const unknownProfile = definition('unknown-profile');
  reject('unsupported source profile is explicit failure', scene(), unknownProfile, 'vanity-shape-profile');
  for (const mutation of mutations) { const root = scene(); mutation.change(root); reject(`synthetic / ${mutation.name}`, root, definition(), mutation.code); }
  const flat = scene(); flat.getObjectByName('vanity-top').geometry.scale(1, 0, 1);
  reject('zero thickness board', flat, definition(), ['vanity-degenerate-face', 'vanity-open-or-inconsistent', 'vanity-nonpositive-volume']);
  const thin = scene(); thin.add(box('paper-component', [.42, .4, -.05], [.44, .400002, .05]));
  reject('closed component below resolved thickness', thin, definition(), 'vanity-no-thickness');
  reject('floating entire support network', scene({legBottom: .1}), definition(), 'vanity-ground-support');
  const fakeGround = scene({legBottom: .1}); fakeGround.add(box('unconnected-ground-decoration', [.48, 0, -.02], [.52, .03, .02]));
  reject('grounded decoration cannot hide floating table network', fakeGround, definition(), 'vanity-detached-component');
  const pointGround = scene();
  for (const child of [...pointGround.children]) if (child.name !== 'vanity-top') child.removeFromParent();
  const tetraPoints = [new THREE.Vector3(.5, 0, 0), new THREE.Vector3(.47, .745, -.03), new THREE.Vector3(.53, .745, -.03), new THREE.Vector3(.5, .745, .03)];
  const centroid = tetraPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(.25), tetraFaces = [];
  for (const face of [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]) {
    const points = face.map(index => tetraPoints[index]);
    const normal = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0]));
    if (normal.dot(centroid.clone().sub(points[0])) > 0) points.reverse();
    tetraFaces.push(...points.flatMap(point => point.toArray()));
  }
  const tetraGeometry = new THREE.BufferGeometry(); tetraGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tetraFaces, 3));
  const tetra = new THREE.Mesh(tetraGeometry, material); tetra.name = 'single-point-ground-support'; pointGround.add(tetra);
  reject('real closed positive-volume support with only one ground point', pointGround, definition(), 'vanity-ground-support');
  const nonconvex = scene(), dent = box('dented-shell', [.42, .4, -.06], [.46, .5, .06]);
  const dentPositions = dent.geometry.getAttribute('position');
  for (let index = 0; index < dentPositions.count; index++) {
    if (dentPositions.getX(index) > .45 && dentPositions.getY(index) > .49 && dentPositions.getZ(index) > .05) dentPositions.setXYZ(index, .435, .44, -.01);
  }
  nonconvex.add(dent);
  reject('closed outward shell with an inward dent is outside convex profile', nonconvex, definition(), 'vanity-nonconvex');
  const edgeContact = scene(); edgeContact.add(box('edge-only-decoration', [.43, .40, .13], [.48, .50, .18]));
  reject('edge contact with a leg has no real contact area', edgeContact, definition(), 'vanity-detached-component');
  const aabbOnly = scene();
  const diamond = new THREE.Mesh(new THREE.BoxGeometry(.04 * Math.SQRT2, .1, .04 * Math.SQRT2), material);
  diamond.name = 'aabb-overlap-without-solid-contact'; diamond.rotation.y = Math.PI / 4; diamond.position.set(.45, .45, .15); aabbOnly.add(diamond);
  reject('overlapping AABB corner cannot establish solid contact', aabbOnly, definition(), 'vanity-detached-component');
  const kneeAabb = scene();
  const kneeDiamond = new THREE.Mesh(new THREE.BoxGeometry(.04 * Math.SQRT2, .05, .04 * Math.SQRT2), material);
  kneeDiamond.name = 'outside-knee-despite-aabb-overlap'; kneeDiamond.rotation.y = Math.PI / 4; kneeDiamond.position.set(.395, .72, -.145); kneeAabb.add(kneeDiamond);
  // Its actual diamond stays outside the knee corner and joins the tabletop.
  pass('actual convex test preserves a legal slanted component near knee corner', kneeAabb);
  const invalidContract = definition(); invalidContract.clearance.knee.max[0] = .2;
  reject('altered knee contract cannot weaken checking', scene(), invalidContract, 'vanity-clearance-contract');
  const tapered = scene();
  for (const child of [...tapered.children]) if (child.name !== 'vanity-top') child.removeFromParent();
  const taperedPositions = tapered.getObjectByName('vanity-top').geometry.getAttribute('position');
  for (let index = 0; index < taperedPositions.count; index++) if (taperedPositions.getY(index) < .75) {
    taperedPositions.setX(index, taperedPositions.getX(index) * .8); taperedPositions.setZ(index, taperedPositions.getZ(index) * .8);
  }
  tapered.add(box('support-under-tapered-board', [.42, 0, -.2], [.44, .745, -.14]));
  await fs.writeFile(path.join(runDirectory, 'tapered-board-counterexample.scene.json'), JSON.stringify(tapered.toJSON(), null, 2) + '\n');
  reject('full support top over tapered underside is not a uniform .035m board', tapered, definition(), 'vanity-top');
  assert.deepEqual(invoke(null, {mountRole: 'chair'}), {checked: false});
  checks.push({name: 'unrelated resources skip the new vanity gate', passed: true});
  const independentInput = 'evidence/company-vanity-geometry-v1/regression-fixtures';
  const independentSceneBytes = await fs.readFile(path.join(independentInput, 'corner-filled-notch.scene.json'));
  const independentResourceBytes = await fs.readFile(path.join(independentInput, 'corner-filled-notch.resource.json'));
  const independentScene = new THREE.ObjectLoader().parse(JSON.parse(independentSceneBytes));
  reject('independent original saved corner-filled-notch counterexample', independentScene, JSON.parse(independentResourceBytes), 'vanity-top');
  checks.at(-1).input = {originalEvidence: 'evidence/company-vanity-geometry-independent-v1/run-2026-11-17T08-00-05-627Z',
    scenePath: path.join(independentInput, 'corner-filled-notch.scene.json'), sceneSha256: hash(independentSceneBytes),
    resourcePath: path.join(independentInput, 'corner-filled-notch.resource.json'), resourceSha256: hash(independentResourceBytes)};
  try { await fs.access(collectionPath); } catch (error) { if (error.code !== 'ENOENT') throw error; realAssetsPending = true; }
  if (!realAssetsPending) {
    const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
    assert.equal(collection.resources.length, 4, 'Vanity collection must contain four actual production GLBs');
    for (const entry of collection.resources) {
      const resourcePath = path.resolve(entry.resourcePath), resource = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
      const assetPath = path.resolve('prototype/public', resource.asset.url.replace(/^\//, ''));
      const bytes = await fs.readFile(assetPath);
      assert.equal(hash(bytes), resource.asset.sha256); assert.equal(bytes.length, resource.asset.bytes);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      pass(`production GLB / ${resource.id}`, gltf.scene, resource);
      if (resource.provenance.sourceDesign === 'corner') {
        const filledCorner = gltf.scene.clone(true), board = filledCorner.getObjectByName('vanity-top');
        board.geometry = board.geometry.clone();
        const positions = board.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) if (positions.getX(index) < -.39) positions.setX(index, Math.fround(-.55));
        filledCorner.getObjectByName('vanity-wing').removeFromParent();
        reject('production GLB corner identity retained while notch filled and wing removed', filledCorner, resource, 'vanity-top');
      }
      for (const mutation of mutations) {
        const candidate = gltf.scene.clone(true);
        // Mutations locate by names, but GLTFLoader may include an extra group.
        if (mutation.name === 'floating leg despite other grounded legs') {
          const meshes = []; candidate.traverse(node => { if (node.isMesh) meshes.push(node); });
          const proxy = {children: meshes}; mutation.change(proxy);
        } else mutation.change(candidate);
        reject(`production GLB ${resource.id} / ${mutation.name}`, candidate, resource, mutation.code);
      }
      realAssets.push({id: resource.id, version: resource.version, resourcePath, assetPath, sha256: hash(bytes), status: 'passed-real-readback-support-and-geometry-mutations'});
    }
  }
} catch (error) { failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack}; }
const report = {status: failure ? 'failed' : realAssetsPending ? 'pending-real-assets' : 'passed', generatedAt: new Date().toISOString(),
  source: {geometrySha256: hash(await fs.readFile('prototype/src/company/vanity-geometry.js')), qaSha256: hash(await fs.readFile(new URL(import.meta.url))),
    contractSha256: hash(await fs.readFile('docs/COMPANY-VANITY-TABLE-CONTRACT-v1.txt'))}, collectionPath, checks, realAssets, failure,
  realAssetsPending: realAssetsPending ? 'Four production GLBs not present yet.' : false,
  limits: [
    'CPU validation of closed convex static components, including multiple independent closed shells merged into one mesh. No arbitrary concave or articulated bodies.',
    'Coordinate weld 1e-7m, geometric boundary 1e-6m, triangle area 1e-10m², face-contact area >1e-8m², positive-volume intersection >1e-12m³, resolved thickness >1e-5m. Features below these bounds are unresolved.',
    'Ground requires at least two actual boundary vertices separated by more than 1e-5m at y=0 within 1e-6m. This supports faceted wheel line contact and rejects isolated point contact.',
    'Connectivity measures clipped real surface area or real convex intersection volume. Knee clearance uses complete convex SAT axes. Total bounds are used only for the installation envelope and early separation.',
    'The existing support validator independently verifies the actual rectangular bearing face and clearance for every passing vanity fixture and production GLB.',
    'The main tabletop and corner wing are the exact full rectangular .035m slabs defined by v1. A tapered underside, missing corner wing or filled corner notch is rejected.',
    'The pinned provenance.sourceDesign selects the geometric shape profile. Actual mesh bounds cannot select a different profile, and this display provenance is separate from the functional compatibility contract.',
    'Static geometric connectivity does not prove physical stability, ordinary-computer performance, character sitting/reaching, browser save/reopen or C3 acceptance.',
  ]};
const json = JSON.stringify(report, null, 2) + '\n';
await fs.writeFile(path.join(runDirectory, 'report.json'), json);
await fs.writeFile(path.join(output, 'report.json'), json);
console.log(JSON.stringify({status: report.status, output, runDirectory, checks: checks.length, productionModels: realAssets.length, failure}, null, 2));
if (failure) process.exitCode = 1;
