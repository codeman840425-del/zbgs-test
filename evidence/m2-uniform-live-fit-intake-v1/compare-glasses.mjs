// CPU-only. Run against the two-body release checkout; no fit is generated or registered.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checkout = path.resolve(process.argv[2] || path.join(root, 'experiments/worktrees/live-pair-1239c0e2'));
const source = file => path.join(checkout, 'prototype', file);
const load = file => import(pathToFileURL(source(file)));
const asset = url => readFile(source('public' + url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonSha = object => sha(JSON.stringify(object));
const THREE = await load('node_modules/three/build/three.module.js');
const {GLTFLoader} = await load('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {VRMLoaderPlugin, VRMUtils} = await load('node_modules/@pixiv/three-vrm/lib/three-vrm.module.js');
const {foundationProfile} = await load('src/foundation-profiles.js');
const {createLivePresentation} = await load('src/live-presentation.js');
const {validateTempleProfile} = await load('src/glasses-temple-fit.js');
globalThis.self = {URL};
globalThis.ProgressEvent ??= class { constructor(type, fields) { Object.assign(this, {type}, fields); } };
const maleBodies = ['male', 'source-male-cc0-texture-release-v1'];
const maleGeometry = new Map();

async function parse(bytes, avatar) {
  const loader = new GLTFLoader();
  if (avatar) loader.register(parser => new VRMLoaderPlugin(parser));
  loader.register(() => ({name:'CPUTexture', loadTexture:async () =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

async function measure(body) {
  const profile = foundationProfile(body);
  const bytes = await asset(profile.url);
  assert.equal(sha(bytes), profile.sha256);
  const gltf = await parse(bytes, true);
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.position.y -= profile.sourceFloorY ?? 0;
  const group = new THREE.Group();
  group.add(vrm.scene);
  group.updateMatrixWorld(true);
  const live = createLivePresentation({vrm, root:group, bodyType:profile.referenceBody || body, avatarSha256:profile.sha256});
  const {eyeFitMethod, eyeSpacing, glassesForward, glassesScale} = live.getState().fit;
  const head = vrm.humanoid.getRawBoneNode('head');
  const fromWorld = head.matrixWorld.clone().invert();
  const rawMount = Object.fromEntries(['head', 'leftEye', 'rightEye'].map(name => {
    const bone = vrm.humanoid.getRawBoneNode(name);
    return [name, {rawName:bone.name, headLocal:fromWorld.clone().multiply(bone.matrixWorld).toArray()}];
  }));
  const surfaces = {iris:[], face:[], body:[], hair:[]};
  const captured = {};
  const point = new THREE.Vector3();
  vrm.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => m.name);
    const kind = Object.entries({iris:/_EyeIris_/, face:/_Face_.*SKIN/, body:/_Body_.*SKIN/, hair:/_HAIR/})
      .find(([, regex]) => materials.some(name => regex.test(name)))?.[0];
    if (!kind) return;
    const geom = mesh.geometry;
    const indices = geom.index?.array || Uint32Array.from({length:geom.attributes.position.count}, (_, i) => i);
    const values = new Float64Array(indices.length * 3);
    for (const [i, index] of indices.entries()) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(fromWorld);
      point.toArray(values, i * 3);
    }
    surfaces[kind].push({triangles:indices.length / 3, headLocalTriangleSha256:sha(Buffer.from(values.buffer))});
    if (maleBodies.includes(body)) {
      captured[kind] ??= [];
      for (let i = 0; i < values.length; i += 9) {
        const corners = values.subarray(i, i + 9);
        captured[kind].push({x:(corners[0] + corners[3] + corners[6]) / 3, corners});
      }
    }
  });
  if (maleBodies.includes(body)) maleGeometry.set(body, captured);
  assert(surfaces.iris.length && surfaces.face.length && surfaces.body.length && surfaces.hair.length);
  const doc = gltf.parser.json;
  const rig = {nodes:doc.nodes, skins:doc.skins.map(s => ({joints:s.joints, skeleton:s.skeleton})),
    humanoid:(doc.extensions.VRM ?? doc.extensions.VRMC_vrm).humanoid};
  const bySkin = await Promise.all(doc.skins.map(async s => {
    const matrices = await gltf.parser.getDependency('accessor', s.inverseBindMatrices);
    return sha(Buffer.from(matrices.array.buffer, matrices.array.byteOffset, matrices.array.byteLength));
  }));
  const result = {body, bodySha256:profile.sha256, url:profile.url, sourceFloorY:profile.sourceFloorY ?? 0,
    mount:{eyeFitMethod, eyeSpacing, glassesForward, glassesScale}, rawMount,
    headRestOrientation:head.getWorldQuaternion(new THREE.Quaternion()).toArray(), surfaces,
    nodeSkinAndHumanoidSha256:jsonSha(rig), inverseBindSha256:bySkin};
  live.dispose();
  VRMUtils.deepDispose(vrm.scene);
  return result;
}

// With any permutation, max corner separation bounds centroid X separation.
// This permits an exact nearest-triangle search without assuming a vertex order.
const orders = [[0,3,6],[0,6,3],[3,0,6],[3,6,0],[6,0,3],[6,3,0]];
function coveringDistance(a, b) {
  const sorted = [...b].sort((left, right) => left.x - right.x);
  let maximum = 0;
  for (const triangle of a) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid].x < triangle.x) lo = mid + 1; else hi = mid;
    }
    let best = Infinity;
    function visit(candidate) {
      if (Math.abs(candidate.x - triangle.x) > best) return false;
      for (const order of orders) {
        let worst = 0;
        for (let n = 0; n < 3 && worst < best; n++) {
          const k = n * 3, j = order[n], p = triangle.corners, q = candidate.corners;
          worst = Math.max(worst, Math.hypot(p[k]-q[j], p[k+1]-q[j+1], p[k+2]-q[j+2]));
        }
        best = Math.min(best, worst);
      }
      return true;
    }
    if (lo < sorted.length) visit(sorted[lo]);
    if (lo > 0) visit(sorted[lo-1]);
    for (let i = lo + 1; i < sorted.length && visit(sorted[i]); i++) {}
    for (let i = lo - 2; i >= 0 && visit(sorted[i]); i--) {}
    maximum = Math.max(best, maximum);
  }
  return maximum;
}

async function pinnedReport(name, pin) {
  const bytes = await readFile(path.join(root, name));
  assert.equal(sha(bytes), pin);
  return JSON.parse(bytes);
}

const femaleReportPath = 'evidence/m2-uniform-lite-head-intake-v1/report.json';
const femaleReport = await pinnedReport(femaleReportPath, '85f9f4122dbe1a5d787edb4029774b5d9eaeef50254d3a0ce9be22b614375079');
const maleReportPath = 'evidence/m2-cc0-body-release-fit-v1/report.json';
const maleReport = await pinnedReport(maleReportPath, '7f10bfcaaa5ee0c6d0cb7d211592a99d4da7f941a756238a618864ad305319b6');
assert.equal(sha(await asset('/assets/source-outfit-release-v1/body.vrm')), maleReport.sourceBodySha256);
const registryBytes = await readFile(source('src/glasses-temple-fit-manifest.json'));
const registry = JSON.parse(registryBytes);
assert.equal(sha(registryBytes), '93bcae1f33c4235d43cf60f40e571689227dc9eec98a03a2691f87a014e3f26a');
const accessory = JSON.parse(await asset('/assets/m1c/accessories.json')).items.find(i => i.id === 'studio-glasses-v1');
const glassesBytes = await asset(accessory.url);
assert.equal(sha(glassesBytes), accessory.sha256);
assert.equal(glassesBytes.length, accessory.bytes);
const glasses = (await parse(glassesBytes, false)).scene;
const donors = [];
const nativeProfiles = new Map();
for (const row of registry.profiles) {
  const bytes = await asset(row.url);
  assert.equal(bytes.length, row.bytes);
  assert.equal(sha(bytes), row.sha256);
  const fit = JSON.parse(bytes);
  assert(validateTempleProfile(fit, row.bodySHA256, accessory.sha256));
  nativeProfiles.set(row.body, fit);
  for (const control of fit.controls) {
    const pos = glasses.getObjectByName(control.mesh).geometry.attributes.position;
    assert.equal(pos.count, control.vertices);
    assert.equal(sha(Buffer.from(pos.array.buffer, pos.array.byteOffset, pos.array.byteLength)), control.positionSHA256);
  }
  const measurement = await measure(row.body);
  assert.equal(measurement.bodySha256, row.bodySHA256);
  donors.push({fitId:fit.id, fitSha256:row.sha256, controlsSha256:jsonSha(fit.controls), ...measurement});
}

const targets = [];
for (const body of ['source-female-uniform-texture-v1', 'source-male-cc0-texture-release-v1']) {
  const target = await measure(body);
  const isFemale = body === 'source-female-uniform-texture-v1';
  const parent = isFemale ? femaleReport.records[0].base.sha256 : maleReport.sourceBodySha256;
  const targetPin = isFemale ? femaleReport.records[1].base.sha256 : maleReport.targetBodySha256;
  assert.equal(target.bodySha256, targetPin);
  assert(!registry.profiles.some(row => row.bodySHA256 === targetPin));
  const comparisons = donors.map(donor => {
    assert.equal(validateTempleProfile(nativeProfiles.get(donor.body), targetPin, accessory.sha256), false);
    const fields = ['mount', 'rawMount', 'headRestOrientation', 'surfaces', 'nodeSkinAndHumanoidSha256', 'inverseBindSha256'];
    const different = fields.filter(key => jsonSha(donor[key]) !== jsonSha(target[key]));
    const sameParent = donor.bodySha256 === parent;
    return {donor:donor.body, donorSha256:donor.bodySha256, fitSha256:donor.fitSha256, provenParent:sameParent,
      different, reuseEligible:sameParent && different.length === 0};
  });
  targets.push({...target, parentSha256:parent, previousProof:isFemale ? femaleReportPath : maleReportPath, comparisons});
}
assert.deepEqual(targets.map(x => x.comparisons.filter(c => c.reuseEligible).map(c => c.donor)), [['female'], []]);
const [roundtrip, targetMale] = maleBodies.map(id => maleGeometry.get(id));
const neutralMaleSurfaces = Object.fromEntries(Object.keys(roundtrip).map(kind => [kind, {
  roundtripTriangles:roundtrip[kind].length, targetTriangles:targetMale[kind].length,
  roundtripToTargetMaxCornerMetres:coveringDistance(roundtrip[kind], targetMale[kind]),
  targetToRoundtripMaxCornerMetres:coveringDistance(targetMale[kind], roundtrip[kind]),
}]));
const original = {x:1, corners:[0,0,0, 1,1,0, 2,0,0]};
const reordered = {x:1, corners:[2,0,0, 0,0,0, 1,1,0]};
const displaced = {x:1, corners:[2,0,0, 0,0,0, 1,1,0.001]};
assert.equal(coveringDistance([original], [reordered]), 0);
assert.equal(coveringDistance([original], [displaced]), 0.001);
const temples = nativeProfiles.get('female').controls.map(c => ({
  mesh:c.mesh, vertices:c.vertices, positionSha256:c.positionSHA256, rings:c.rings.length,
}));
console.log(JSON.stringify({schema:'uniform-glasses-fit-intake-v1', registrySha256:sha(registryBytes),
  accessory:{id:accessory.id, sha256:accessory.sha256, sockets:accessory.sockets, temples}, targets, donors, neutralMaleSurfaces,
  scope:'Neutral original hair and face. Indexed CPU skinned triangle corners in raw head-local space; 1-pixel texture placeholders. Static data and mounted-frame inputs only; ear-root support, motion and visual acceptance require their own evidence.'}, null, 2));
