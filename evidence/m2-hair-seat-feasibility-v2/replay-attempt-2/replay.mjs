// Fixed official solver replay from captured parent matrices and two history frames.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i+1]; };
const inputRoot = path.resolve(arg('--input-root') ?? root);
const modules = path.resolve(arg('--modules-root') ?? path.join(inputRoot, 'experiments/m2-long-hair-fixed-v4/prototype/node_modules'));
const sha = value => createHash('sha256').update(value).digest('hex');
const capturePath = path.join(inputRoot, 'evidence/m2-hair-seat-collision-e9b-v1/collision-observer/report.json');
const bytes = await fs.readFile(capturePath), report = JSON.parse(bytes), frames = report.capture.frames, config = report.fit.dynamics;
assert.equal(report.build, 'e9bd472be0f8'); assert(report.capture.wrappersRestored); assert.equal(report.capture.observationErrors.length, 0);
const THREE = await import(pathToFileURL(path.join(modules, 'three/build/three.module.js')).href);
const vrmUrl = pathToFileURL(path.join(modules, '@pixiv/three-vrm/lib/three-vrm.module.js')).href;
const {VRMSpringBoneManager, VRMSpringBoneJoint, VRMSpringBoneCollider, VRMSpringBoneColliderShapeSphere, VRMSpringBoneColliderShapeCapsule} = await import(vrmUrl);
const testedSource = path.join(root, 'evidence/m2-hair-seat-feasibility-v1/tested-hair-spring.js');
const appBytes = await fs.readFile(testedSource);
const moduleText = appBytes.toString().replace("from 'three'", `from '${pathToFileURL(path.join(modules, 'three/build/three.module.js')).href}'`)
  .replace("from '@pixiv/three-vrm'", `from '${vrmUrl}'`)+'\nexport {RoomBoxShape};\n';
const {RoomBoxShape} = await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
const hairPath = path.join(root, 'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb');
const hairBytes = await fs.readFile(hairPath); assert.equal(sha(hairBytes), report.fit.assetSha256);
const doc = JSON.parse(hairBytes.subarray(20, 20+hairBytes.readUInt32LE(12)).toString());
const rest = new Map(doc.nodes.filter(n => /^Pony[0-6]$/.test(n.name)).map(n => [n.name, n.translation]));
const matrix = array => new THREE.Matrix4().fromArray(array);
const position = array => new THREE.Vector3().fromArray(array);
const boxRows = report.capture.observedShapes.filter(s => s.category === 'room');

function replay({bodyEnabled, reference}) {
  const scene = new THREE.Scene(), center = new THREE.Object3D(), head = new THREE.Object3D(), chest = new THREE.Object3D();
  center.matrixAutoUpdate = head.matrixAutoUpdate = chest.matrixAutoUpdate = false;
  scene.add(center); center.add(head, chest);
  const anchor = new THREE.Bone(); head.add(anchor);
  const bones = Array.from({length: 7}, (_, i) => {
    const bone = new THREE.Bone(); bone.name = 'Pony'+i; bone.position.fromArray(rest.get(bone.name)); bone.updateMatrix(); return bone;
  });
  anchor.add(bones[0]); for (let i=1;i<7;i++) bones[i-1].add(bones[i]);
  const boxes = new Map();
  for (const row of boxRows) if (!boxes.has(row.box.name)) {
    const mesh = new THREE.Object3D(); mesh.matrixAutoUpdate = false; scene.add(mesh);
    boxes.set(row.box.name, {name: row.box.name, mesh, matrixWorld: mesh.matrixWorld, inverseMatrixWorld: new THREE.Matrix4(),
      localBox: new THREE.Box3(position(row.box.min), position(row.box.max)), projectOut() { throw Error('Unused legacy point projection'); }});
  }
  let negativeBody = 0, negativeRoom = 0, activeQueries = [];
  function observe(shape, category, boneName) {
    const original = shape.calculateCollision;
    shape.calculateCollision = function(m, p, r, target) {
      const before = p.toArray(), dist = original.call(this, m, p, r, target);
      if (dist < 0) { if(category === 'body') negativeBody++; else negativeRoom++; }
      activeQueries.push({category, bone: boneName, before, distance: dist}); return dist;
    };
    return shape;
  }
  const body = bodyEnabled ? config.colliders.map(c => {
    const params = {offset: position(c.offset), radius: c.radius}; if(c.tail) params.tail = position(c.tail);
    const shape = c.shape === 'sphere' ? new VRMSpringBoneColliderShapeSphere(params) : new VRMSpringBoneColliderShapeCapsule(params);
    const collider = new VRMSpringBoneCollider(observe(shape, 'body', null)); (c.bone === 'head' ? head : chest).add(collider); return collider;
  }) : [];
  const manager = new VRMSpringBoneManager(), joints = [];
  config.joints.forEach((j, i) => {
    const environment = [...boxes.values()].map(proxy => {
      const collider = new VRMSpringBoneCollider(observe(new RoomBoxShape(proxy, bones[i]), 'room', j.bone)); proxy.mesh.add(collider); return collider;
    });
    const joint = new VRMSpringBoneJoint(bones[i], bones[i+1], {...j, gravityDir: position(j.gravityDir)}, [{colliders: body}, {colliders: environment}]);
    joint.center = reference === 'head' ? head : center; joints.push(joint); manager.addJoint(joint);
  });
  function parentPose(frame) {
    center.matrix.fromArray(frame.centerWorld);
    const inverse = matrix(frame.centerWorld).invert();
    head.matrix.multiplyMatrices(inverse, matrix(frame.headWorld)); chest.matrix.multiplyMatrices(inverse, matrix(frame.chestWorld));
    for (const proxy of boxes.values()) {
      const query = frame.queries.find(q => q.shape === proxy.name+'/Pony0'); assert(query);
      proxy.mesh.matrix.fromArray(query.colliderMatrix);
    }
    // Match the official manager's lazy world-matrix order. Updating auxiliary
    // children recursively here changes the observed world-length input.
    for (const proxy of boxes.values()) {
      proxy.mesh.updateWorldMatrix(true, false);
      proxy.inverseMatrixWorld.copy(proxy.mesh.matrixWorld).invert();
    }
  }
  parentPose(frames[0]); scene.updateMatrixWorld(true); manager.setInitState();
  // The private history fields belong only to this disposable diagnostic manager.
  // Seed from two actual consecutive post-update frames, in the chosen center.
  parentPose(frames[1]);
  joints.forEach((joint, i) => {
    bones[i].quaternion.fromArray(frames[1].dynamics.localRotations[i]); bones[i].updateMatrix();
    const currentCenter = reference === 'head' ? frames[1].headWorld : frames[1].centerWorld;
    const previousCenter = reference === 'head' ? frames[0].headWorld : frames[0].centerWorld;
    // These two seed frames have no collision corrections. Their final query
    // points retain the actual private solver tails, distinct from child origins.
    const solverTail = frame => {
      const queries = frame.queries.filter(q => q.bone === config.joints[i].bone);
      assert(queries.every(q => q.signedDistance >= 0));
      return queries.at(-1).pointBefore;
    };
    joint._currentTail.copy(position(solverTail(frames[1]))).applyMatrix4(matrix(currentCenter).invert());
    joint._prevTail.copy(position(solverTail(frames[0]))).applyMatrix4(matrix(previousCenter).invert());
  });
  scene.updateMatrixWorld(true);
  let maxTailErrorM = 0, maxQueryErrorM = 0, peak = {tipAbovePony1M: -Infinity}, firstMismatch = null;
  const series = [];
  for (let i=2;i<frames.length;i++) {
    const frame = frames[i]; parentPose(frame); activeQueries = [];
    manager.update(frame.dt);
    const tails = bones.slice(1).map(bone => bone.getWorldPosition(new THREE.Vector3()).toArray());
    const error = Math.max(...tails.map((tail, index) => position(tail).distanceTo(position(frame.dynamics.worldTails[index]))));
    maxTailErrorM = Math.max(maxTailErrorM, error);
    if (bodyEnabled && reference === 'avatar-scene') {
      assert.equal(activeQueries.length, frame.queries.length);
      for (let q=0;q<activeQueries.length;q++) {
        const queryError = position(activeQueries[q].before).distanceTo(position(frame.queries[q].pointBefore));
        maxQueryErrorM = Math.max(maxQueryErrorM, queryError);
      }
      if (error > 1e-7 && firstMismatch === null) firstMismatch = {frame: i, ms: frame.ms, errorM: error};
    }
    const tipAbovePony1M = tails[5][1]-tails[0][1];
    if (tipAbovePony1M > peak.tipAbovePony1M) peak = {frame: i, ms: frame.ms, tipAbovePony1M};
    series.push({frame: i, ms: frame.ms, tipAbovePony1M, tails, actualTailErrorM: error});
  }
  joints.forEach(j => manager.deleteJoint(j));
  return {bodyEnabled, reference, peak, maxTailErrorM, maxQueryErrorM, firstMismatch, negativeBodyQueries: negativeBody, negativeRoomQueries: negativeRoom, series};
}

const full = replay({bodyEnabled: true, reference: 'avatar-scene'});
const noBody = replay({bodyEnabled: false, reference: 'avatar-scene'});
const head = replay({bodyEnabled: true, reference: 'head'});
const maxDifference = (a, b) => Math.max(...a.series.map((row, i) => Math.max(...row.tails.map((tail, j) => position(tail).distanceTo(position(b.series[i].tails[j]))))));
const result = {capture: {path: path.relative(inputRoot, capturePath).split(path.sep).join('/'), sha256: sha(bytes), bytes: bytes.length, frames: frames.length},
  source: {runtimeSha256: sha(appBytes), assetSha256: sha(hairBytes), ThreeRevision: THREE.REVISION, officialVersion: JSON.parse(await fs.readFile(path.join(modules, '@pixiv/three-vrm-springbone/package.json'), 'utf8')).version},
  seed: 'Final collision-query tails in frames 0 and 1; exact rest bones; official lazy world-matrix order; private history fields of CPU-only managers',
  full: {...full, series: undefined}, noBody: {...noBody, series: undefined}, headReference: {...head, series: undefined},
  fullVsNoBodyMaxTailDifferenceM: maxDifference(full, noBody),
  exactReplayAdmitted: full.maxTailErrorM < 1e-7 && full.maxQueryErrorM < 1e-7,
  limits: ['Counterfactual reference changes and disabled body queries are diagnostic controls. Product collision rules remain unchanged.', 'No browser/GPU, rendered mesh contact, gait, visual or general-body acceptance.']};
await fs.writeFile(path.join(here, 'replay-result.json'), JSON.stringify(result, null, 2)+'\n');
await fs.writeFile(path.join(here, 'replay-series.jsonl'), [full, noBody, head].flatMap(run => run.series.map(row => JSON.stringify({case: run.reference+(run.bodyEnabled ? '-body' : '-no-body'), ...row}))).join('\n')+'\n');
console.log(JSON.stringify(result, null, 2));
