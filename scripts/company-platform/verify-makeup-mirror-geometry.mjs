import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {validateMakeupMirrorGeometry} from '../../prototype/src/company/makeup-mirror-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-makeup-mirror-geometry-v1');
const collectionPath = path.resolve(process.argv[3] || 'prototype/public/company-assets/makeup-mirror-v1/collection.json');
const runDirectory = path.join(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDirectory, {recursive: true});
const checks = [], realAssets = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, failurePath, message, details) => { throw Object.assign(new Error(message), {code, path: failurePath, details}); };
const invoke = (root, resource) => validateMakeupMirrorGeometry(root, resource, fail);

function independent(root, name) {
  const mesh = root.getObjectByName(name);
  assert(mesh?.isMesh, `Missing fixture ${name}`);
  mesh.geometry = mesh.geometry.clone();
  return mesh;
}

function box(name, min, max, material) {
  const geometry = new THREE.BoxGeometry(...max.map((value, i) => value - min[i]));
  geometry.translate(...max.map((value, i) => (value + min[i]) / 2));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name; return mesh;
}

function flatPositions(mesh) {
  mesh.geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  return mesh.geometry.getAttribute('position');
}

function reject(name, root, resource, codes) {
  let error;
  try { invoke(root, resource); } catch (caught) { error = caught; }
  assert(error, `${name} unexpectedly passed`);
  assert((Array.isArray(codes) ? codes : [codes]).includes(error.code), `${name} expected ${codes}, received ${error.code} / ${error.message}`);
  checks.push({name, passed: true, rejection: {code: error.code, path: error.path, message: error.message, details: error.details}});
}

function mutate(name, scene, resource, change, codes) {
  const root = scene.clone(true), definition = structuredClone(resource);
  change(root, definition);
  reject(`${resource.id} / ${name}`, root, definition, codes);
}

function faceRectangle(root, name, min, max) {
  const mesh = independent(root, name), values = [min, [max[0], min[1], 0], max, min, max, [min[0], max[1], 0]].flat();
  mesh.geometry = new THREE.BufferGeometry();
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
}

let failure;
try {
  assert.deepEqual(validateMakeupMirrorGeometry(null, {id: 'legacy-mirror'}, fail), {checked: false});
  checks.push({name: 'Legacy resources skip the new gate', passed: true});
  const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
  assert.equal(collection.resources.length, 4);
  for (const item of collection.resources) {
    const resourcePath = path.resolve(item.resourcePath), resource = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
    const assetPath = path.resolve('prototype/public', resource.asset.url.replace(/^\//, '')), bytes = await fs.readFile(assetPath);
    assert.equal(sha(bytes), resource.asset.sha256); assert.equal(bytes.length, resource.asset.bytes);
    const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const observed = invoke(scene, resource);
    assert(observed.checked && observed.grounded);
    assert.equal(observed.panels.length, resource.provenance.sourceDesign === 'tri-fold' ? 3 : 1);
    realAssets.push({id: resource.id, resourcePath, assetPath, sha256: sha(bytes), bytes: bytes.length, observed});
    checks.push({name: `${resource.id} / actual GLB full geometry admission`, passed: true});
    for (const name of ['makeup-base', 'makeup-post', 'makeup-lamp', ...resource.mirrorPanels.flatMap(panel => [panel.node, panel.backNode, `makeup-frame-${panel.id}`])])
      mutate(`missing ${name}`, scene, resource, root => root.getObjectByName(name).removeFromParent(), 'makeup-node');
    mutate('duplicate required node', scene, resource, root => root.add(root.getObjectByName('makeup-base').clone()), 'makeup-node');
    mutate('node offset cannot disguise unbaked mesh', scene, resource, root => { root.getObjectByName('makeup-base').position.x = .001; }, 'makeup-transform');
    mutate('hidden solid cannot be counted as support', scene, resource, root => { root.getObjectByName('makeup-post').visible = false; }, 'makeup-transform');
    mutate('hidden face material cannot stand in for actual mirror', scene, resource, root => {
      const mesh = independent(root, 'makeup-face-center'); mesh.material = mesh.material.clone(); mesh.material.visible = false;
    }, 'makeup-material');
    mutate('transparent back cannot fake opaque backing', scene, resource, root => {
      const mesh = independent(root, 'makeup-back-center'); mesh.material = mesh.material.clone(); mesh.material.transparent = true; mesh.material.opacity = .1;
    }, 'makeup-material');
    mutate('material group holes cannot hide triangles', scene, resource, root => {
      const mesh = independent(root, 'makeup-face-center'); mesh.material = [mesh.material]; mesh.geometry.clearGroups();
    }, 'makeup-topology');
    mutate('fake central plane', scene, resource, root => independent(root, 'makeup-face-center').geometry.translate(0, 0, .002), 'makeup-face-geometry');
    mutate('reversed face normals', scene, resource, root => {
      const p = flatPositions(independent(root, 'makeup-face-center'));
      for (let i = 0; i < p.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
        p.setXYZ(i, b.x, b.y, b.z); p.setXYZ(i + 1, a.x, a.y, a.z);
      }
    }, 'makeup-face-geometry');
    mutate('face triangle missing', scene, resource, root => {
      const mesh = independent(root, 'makeup-face-center'), p = flatPositions(mesh);
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(p.array).slice(9), 3));
    }, 'makeup-face-coverage');
    mutate('repeated face triangle', scene, resource, root => {
      const mesh = independent(root, 'makeup-face-center'), p = flatPositions(mesh);
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([...p.array, ...Array.from(p.array).slice(0, 9)], 3));
    }, 'makeup-face-coverage');
    for (const name of ['makeup-base', 'makeup-post', 'makeup-back-center'])
      mutate(`flat ${name}`, scene, resource, root => independent(root, name).geometry.scale(1, 1, 0), ['makeup-degenerate-face', 'makeup-open-or-inconsistent', 'makeup-nonpositive-volume']);
    mutate('base full dimensions are required', scene, resource, root => independent(root, 'makeup-base').geometry.scale(.8, 1, 1), 'makeup-support-box');
    mutate('post cannot float above base', scene, resource, root => independent(root, 'makeup-post').geometry.translate(0, .01, 0), 'makeup-support-box');
    mutate('curved AABB overlap is not actual contact', scene, resource, root => {
      const geometry = new THREE.CylinderGeometry(.06, .06, .015, 48).rotateX(Math.PI / 2).translate(.17, .085, -.0525);
      const mesh = new THREE.Mesh(geometry, root.getObjectByName('makeup-base').material); mesh.name = 'curved-disconnected-solid'; root.add(mesh);
      geometry.computeBoundingBox();
      const base = root.getObjectByName('makeup-base'); base.geometry.computeBoundingBox();
      assert(geometry.boundingBox.intersectsBox(base.geometry.boundingBox), 'This adversary must overlap the real base AABB');
    }, 'makeup-detached-component');
    mutate('lamp source must be inside actual housing', scene, resource, root => independent(root, 'makeup-lamp').geometry.translate(.12, 0, 0), 'makeup-lamp-geometry');
    mutate('floating lamp with unchanged housing source', scene, resource, root => {
      const riser = root.getObjectByName('makeup-lamp-riser'); assert(riser, 'Actual asset must contain rear riser'); riser.removeFromParent();
    }, 'makeup-detached-component');
    mutate('frame cannot fill mirror opening', scene, resource, root => {
      const mesh = independent(root, 'makeup-frame-center');
      mesh.geometry = box('filled', [-.10, .25, -.025], [.10, .45, .004], mesh.material).geometry;
    }, 'makeup-frame-geometry');
    mutate('front blocking plate', scene, resource, root => root.add(box('blocked-mirror', [-.03, .3, .001], [.03, .4, .008], root.getObjectByName('makeup-base').material)), 'makeup-surface-occluded');
    mutate('front vertical fin crossing interior', scene, resource, root => root.add(box('blocked-fin', [-.00002, .3, -.01], [.00002, .4, .03], root.getObjectByName('makeup-base').material)), 'makeup-surface-occluded');
    mutate('out of full mounting envelope', scene, resource, root => root.add(box('outside', [.34, .1, -.02], [.36, .2, .02], root.getObjectByName('makeup-base').material)), 'makeup-envelope');
    mutate('changed declared outline cannot select another gate', scene, resource, (root, r) => { r.mirrorPanels[0].polygons[0][0][0] += .001; }, 'makeup-panel-contract');
    mutate('source design cannot infer a new profile from mesh', scene, resource, (root, r) => { r.provenance.sourceDesign = 'unknown'; }, 'makeup-shape-profile');
    mutate('hidden floating shell inside an otherwise connected mesh', scene, resource, root => {
      const mesh = independent(root, 'makeup-base');
      const extra = box('hidden', [.27, .1, -.02], [.29, .12, 0], mesh.material);
      mesh.geometry = mergeGeometries([mesh.geometry.toNonIndexed(), extra.geometry.toNonIndexed()]);
    }, 'makeup-node');
    if (resource.provenance.sourceDesign === 'round' || resource.provenance.sourceDesign === 'arch') {
      mutate('filled rectangular silhouette cannot replace curved pane', scene, resource, root => faceRectangle(root, 'makeup-face-center', [-.17, .185, 0], [.17, .545, 0]), 'makeup-face-coverage');
      mutate('rectangular back cannot fake curved actual backing', scene, resource, root => {
        const mesh = independent(root, 'makeup-back-center'); mesh.geometry = box('fake-back', [-.17, .185, -.025], [.17, .545, -.009], mesh.material).geometry;
      }, 'makeup-back-geometry');
    }
    if (resource.provenance.sourceDesign === 'tri-fold') {
      for (const panel of resource.mirrorPanels.slice(1)) {
        mutate(`${panel.id} fake coplanar wing`, scene, resource, root => {
          const p = independent(root, panel.node).geometry.getAttribute('position');
          for (let i = 0; i < p.count; i++) p.setZ(i, 0);
        }, 'makeup-face-geometry');
        mutate(`${panel.id} duplicated central surface mapping`, scene, resource, (root, r) => { r.mirrorPanels.find(p => p.id === panel.id).node = 'makeup-face-center'; }, 'makeup-panel-contract');
      }
      mutate('side wing support removed', scene, resource, root => {
        const hinges = [], sides = []; root.traverse(node => { if (/hinge/.test(node.name)) hinges.push(node); if (node.isMesh && /^makeup-(face|back|frame)-(left|right)$/.test(node.name)) sides.push(node); });
        assert.equal(hinges.length, 2); for (const hinge of hinges) hinge.removeFromParent();
        // The panels' ring/back at the seam still have actual shared contact.
        // A separated real wing must fail even while its AABB remains plausible.
        for (const node of sides) independent(root, node.name).geometry.translate(0, .003, 0);
      }, ['makeup-face-coverage', 'makeup-back-geometry', 'makeup-detached-component']);
    }
  }
} catch (error) {
  failure = {message: error.message, code: error.code, path: error.path, details: error.details, stack: error.stack};
}
const report = {status: failure ? 'failed' : 'passed', checkedAt: new Date().toISOString(), collectionPath, checks, realAssets, failure,
  verifier: {path: 'prototype/src/company/makeup-mirror-geometry.js', sha256: sha(await fs.readFile('prototype/src/company/makeup-mirror-geometry.js'))},
  originalFailedBatch: 'evidence/company-makeup-mirror-production-v1/failures/post-front-occlusion',
  limits: ['CPU actual imported geometry only. Runtime GPU reflection, real illumination, visual acceptance and physical tipping stability need separate evidence.', 'Connectivity proves static positive face area or positive intersection volume between closed convex components and proven ring decompositions. It does not model hinges or rigid-body strength.']};
await fs.writeFile(path.join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(output, 'latest.json'), JSON.stringify({status: report.status, report: path.relative(process.cwd(), path.join(runDirectory, 'report.json')).replaceAll('\\', '/')}, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, checks: checks.length, assets: realAssets.length, report: path.join(runDirectory, 'report.json'), failure}, null, 2));
if (failure) process.exitCode = 1;
