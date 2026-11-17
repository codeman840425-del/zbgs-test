import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMirrorBinding, createMirrorController, mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

const output = process.argv[2]
  ? pathToFileURL(path.resolve(process.argv[2]) + path.sep)
  : new URL('../../evidence/company-floor-mirror-render-v1/', import.meta.url);
await fs.mkdir(output, {recursive:true});
const checks = [];

function check(name, action) {
  try {
    const detail = action();
    checks.push({name, status:'passed', ...(detail ? {detail} : {})});
  } catch (error) {
    checks.push({name, status:'failed', error:error.stack});
  }
}

function resource(kind, id = `cpu-${kind}`) {
  const floor = kind === 'floor';
  const centerY = floor ? .92 : 0;
  return {
    id, version:1, category:'decor',
    asset:{format:'glb', url:`/cpu-only/${id}.glb`, bytes:20, sha256:'0'.repeat(64)},
    coordinates:{units:'metres', up:'+Y', forward:'+Z'},
    mount:floor ? 'floor-surface' : 'wall',
    mountRole:floor ? 'floor-mirror' : 'mirror',
    productionBranch:floor ? 'floor-mirror' : 'mirror',
    mounting:{origin:floor ? 'bottom' : 'center', width:.8, height:1.8, depth:floor ? .6 : .04},
    ...(floor ? {footprint:{center:[0,0], halfSize:[.4,.3], blocking:true}} : {}),
    mirrorSurface:{schema:'planar-mirror-v1', profile:'single-512-v1', position:[0,centerY,.026]},
    mirrorNodes:floor ? {face:'mirror-surface', back:'mirror-back', base:'mirror-base', post:'mirror-post'} : {face:'mirror-surface'},
    mirrorShape:{polygons:[[[-.34,centerY-.84],[.34,centerY-.84],[.34,centerY+.84],[-.34,centerY+.84]]]},
    stateDefaults:{}, usePoints:[],
  };
}

function fail(code, location, message) {
  throw Object.assign(new Error(message), {code, path:location});
}

// Limited renderer substitute adapted from qa-mirror-render.mjs. The actual
// locked Reflector performs all camera/plane calculations. No GPU is created.
function rendererSubstitute() {
  let target = null, face = 0, mip = 0;
  const viewport = new THREE.Vector4(0,0,640,480);
  const scissor = new THREE.Vector4(5,6,30,32);
  let scissorTest = true;
  const programs = new Map();
  const context = {
    SCISSOR_BOX:0x0c10, SCISSOR_TEST:0x0c11,
    FRAMEBUFFER:0x8d40, FRAMEBUFFER_COMPLETE:0x8cd5, SAMPLES:0x80a9,
    checkFramebufferStatus(framebuffer) { assert.equal(framebuffer,this.FRAMEBUFFER);return this.FRAMEBUFFER_COMPLETE; },
    getError:() => 0,
    isContextLost:() => false,
    getParameter(parameter) {
      if (parameter === this.SCISSOR_BOX) return Int32Array.from(scissor.toArray());
      if (parameter === this.SCISSOR_TEST) return scissorTest;
      if (parameter === this.SAMPLES) return target?.samples || 0;
      throw new Error(`Unsupported CPU GL parameter ${parameter}`);
    },
  };
  const renderer = {
    xr:{enabled:true}, shadowMap:{autoUpdate:true}, autoClear:false,
    debug:{checkShaderErrors:false, onShaderError:null},
    info:{autoReset:true, render:{calls:0, triangles:0}},
    calls:0, onRender:null, failShader:false,
    properties:{get:material => programs.get(material)},
    compile(object) {
      programs.set(object.material, {currentProgram:{getUniforms() {
        if (renderer.failShader) renderer.debug.onShaderError();
        return {};
      }}});
      return new Set([object.material]);
    },
    state:{
      buffers:{depth:{setMask() {}}},
      viewport:value => viewport.copy(value),
      scissor:value => scissor.copy(value),
      setScissorTest:value => {scissorTest = value;},
    },
    getContext:() => context,
    getRenderTarget:() => target,
    getActiveCubeFace:() => face,
    getActiveMipmapLevel:() => mip,
    getCurrentViewport:result => result.copy(viewport),
    setRenderTarget(value, nextFace = 0, nextMip = 0) {
      target = value; face = nextFace; mip = nextMip;
      viewport.copy(value ? value.viewport : new THREE.Vector4(0,0,640,480));
      scissor.copy(value ? value.scissor : new THREE.Vector4(4,6,30,31));
      scissorTest = value ? value.scissorTest : true;
    },
    clear() {},
    render(world, camera) {
      this.calls++;
      this.info.render.calls = 7;
      this.info.render.triangles = 12;
      this.onRender?.(world, camera);
    },
    snapshot() {
      return {target, face, mip, viewport:viewport.toArray(), scissor:scissor.toArray(),
        scissorTest, xr:this.xr.enabled, shadow:this.shadowMap.autoUpdate};
    },
  };
  return renderer;
}

function fixture() {
  const world = new THREE.Scene();
  const root = new THREE.Group();
  world.add(root);
  const camera = new THREE.PerspectiveCamera(55,1,.05,100);
  camera.position.set(0,.92,3);
  camera.lookAt(0,.92,0);
  camera.updateMatrixWorld(true);
  const renderer = rendererSubstitute();
  const controller = createMirrorController();
  const owners = [];
  return {
    world, root, camera, renderer, controller, owners,
    add(kind, id, {position = [0,0,0], yaw = 0, definition = resource(kind,id)} = {}) {
      const group = new THREE.Group();
      group.position.fromArray(position);
      group.rotation.y = yaw;
      root.add(group);
      const centerY = kind === 'floor' ? .92 : 0;
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(.68,1.68).translate(0,centerY,.026), new THREE.MeshStandardMaterial());
      surface.name = 'mirror-surface';
      group.add(surface);
      try {
        const owner = createMirrorBinding(definition, new Map([[surface.name,surface]]), id);
        owners.push(owner);
        return owner;
      } catch (error) {
        surface.geometry.dispose(); surface.material.dispose(); group.removeFromParent();
        throw error;
      }
    },
    update(frameId, timeMs, bindings = owners) {
      return controller.update(bindings,renderer,world,camera,{frameId,timeMs});
    },
    preflight(bindings, frameId, timeMs) {
      return controller.preflight(bindings,renderer,world,camera,{frameId,timeMs});
    },
    dispose() {
      controller.dispose();
      for (const owner of owners) {
        owner.dispose(); owner.surface.geometry.dispose(); owner.surface.material.dispose();
      }
    },
  };
}

function worldVertexDifference(owner, world) {
  world.updateMatrixWorld(true);
  const before = owner.surface.geometry.getAttribute('position');
  const after = owner.reflector.geometry.getAttribute('position');
  let maximum = 0;
  for (let index = 0; index < before.count; index++) {
    const original = new THREE.Vector3().fromBufferAttribute(before,index).applyMatrix4(owner.surface.matrixWorld);
    const reflected = new THREE.Vector3().fromBufferAttribute(after,index).applyMatrix4(owner.reflector.matrixWorld);
    maximum = Math.max(maximum,original.distanceTo(reflected));
    assert.ok(Math.abs(after.getZ(index)) < 1e-7);
  }
  assert.ok(maximum < 1e-7, `World vertex difference ${maximum}`);
  return maximum;
}

check('floor contract accepts its complete fixed position and wall remains unchanged', () => {
  validateMirrorResource(resource('floor'),fail);
  validateMirrorResource(resource('wall'),fail);
  assert.deepEqual(resource('floor').mirrorSurface.position,[0,.92,.026]);
  assert.deepEqual(resource('wall').mirrorSurface.position,[0,0,.026]);
  assert.equal(compareFacilityFunction(resource('floor'),resource('wall')).compatible,false);
});

check('floor binding is lazy and captures its full position independently', () => {
  const f = fixture();
  try {
    const definition = resource('floor','floor');
    const before = mirrorResourceSnapshot();
    const owner = f.add('floor','floor',{definition});
    assert.equal(owner.reflector,null);
    assert.equal(mirrorResourceSnapshot().created,before.created);
    definition.mirrorSurface.position[1] = 100;
    const copy = owner.planePosition;
    copy[2] = 100;
    assert.deepEqual(owner.planePosition,[0,.92,.026]);
  } finally { f.dispose(); }
});

for (const yaw of [0,Math.PI/2]) {
  check(`floor complete-plane rebasing preserves world vertices at yaw ${yaw}`, () => {
    const f = fixture();
    try {
      const owner = f.add('floor','floor',{position:[1,0,-2],yaw});
      owner.activate();
      assert.deepEqual(owner.reflector.position.toArray(),[0,.92,.026]);
      const maximum = worldVertexDifference(owner,f.world);
      const sphere = owner.reflector.geometry.boundingSphere;
      if (sphere) assert.ok(Math.abs(sphere.center.y) < 1e-7);
      const target = owner.reflector.getRenderTarget();
      assert.deepEqual([target.width,target.height,target.samples,target.texture.type],[512,512,0,THREE.HalfFloatType]);
      return {maximumWorldVertexDifference:maximum};
    } finally { f.dispose(); }
  });
}

check('yaw 90 degree floor reflector uses the same world plane and reflected camera', () => {
  const f = fixture();
  try {
    const owner = f.add('floor','floor',{position:[1,0,-2],yaw:Math.PI/2});
    f.camera.position.set(4,.92,-2);
    f.camera.lookAt(1,.92,-2);
    f.camera.updateMatrixWorld(true);
    assert.equal(f.update(1,0).activeId,'floor');
    const planePoint = owner.reflector.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0,0,1).transformDirection(owner.reflector.matrixWorld);
    const expected = f.camera.position.clone().addScaledVector(normal,-2*f.camera.position.clone().sub(planePoint).dot(normal));
    const actual = owner.reflector.getReflectionCamera(f.camera).position;
    assert.ok(actual.distanceTo(expected) < 1e-7);
    assert.equal(f.renderer.calls,1);
    return {worldPlane:planePoint.toArray(),normal:normal.toArray(),reflectionCamera:actual.toArray()};
  } finally { f.dispose(); }
});

check('wall and floor share one stable selection, token and 30Hz admission', () => {
  const f = fixture();
  try {
    const wall = f.add('wall','b-wall');
    const floor = f.add('floor','a-floor');
    assert.equal(f.update(1,0).activeId,'a-floor');
    assert.equal(floor.active,true);
    assert.equal(wall.active,false);
    assert.equal(f.update(1,100).updated,false);
    assert.equal(f.update(2,10).updated,false);
    assert.equal(f.update(3,34).updated,true);
    assert.equal(f.renderer.calls,2);
    assert.equal(f.owners.filter(owner => owner.active).length,1);
    assert.equal(f.controller.snapshot().lastReflection.calls,7);
    assert.equal(f.controller.snapshot().lastReflection.triangles,12);
  } finally { f.dispose(); }
});

check('switching mixed installation type consumes the same existing frame budget', () => {
  const f = fixture();
  try {
    const wall = f.add('wall','a-wall');
    const floor = f.add('floor','b-floor');
    assert.equal(f.update(1,0).activeId,'a-wall');
    const previousTarget = wall.reflector.getRenderTarget();
    let released = 0;
    previousTarget.addEventListener('dispose',() => released++);
    wall.surface.parent.visible = false;
    const pending = f.update(1,100);
    assert.equal(pending.reason,'host-budget-awaiting-fresh');
    assert.equal(wall.active,false);
    assert.equal(floor.active,false);
    assert.equal(released,1);
    assert.equal(f.update(2,10).updated,false);
    assert.equal(f.update(3,34).activeId,'b-floor');
    assert.equal(f.owners.filter(owner => owner.active).length,1);
    assert.equal(f.renderer.calls,2);
  } finally { f.dispose(); }
});

check('hidden floor releases its target and re-entry produces a new fresh pass', () => {
  const f = fixture();
  try {
    const owner = f.add('floor','floor');
    f.update(1,0);
    const previous = owner.reflector.getRenderTarget();
    let released = 0;
    previous.addEventListener('dispose',() => released++);
    owner.surface.parent.visible = false;
    assert.equal(f.update(2,34).reason,'no-visible-mirror');
    assert.equal(owner.active,false);
    assert.equal(owner.fresh,false);
    assert.equal(released,1);
    assert.equal(f.renderer.calls,1);
    owner.surface.parent.visible = true;
    assert.equal(f.update(3,68).updated,true);
    assert.notEqual(owner.reflector.getRenderTarget(),previous);
    assert.equal(owner.fresh,true);
    assert.equal(f.renderer.calls,2);
  } finally { f.dispose(); }
});

check('back-facing and off-frustum floor mirrors allocate no target', () => {
  const f = fixture();
  try {
    const owner = f.add('floor','floor',{yaw:Math.PI});
    assert.equal(f.update(1,0).reason,'no-visible-mirror');
    owner.surface.parent.rotation.y = 0;
    owner.surface.parent.position.x = 100;
    assert.equal(f.update(2,34).reason,'no-visible-mirror');
    assert.equal(owner.snapshot().created,0);
  } finally { f.dispose(); }
});

check('mixed surfaces are excluded together and their original visibility is restored', () => {
  const f = fixture();
  try {
    const floor = f.add('floor','a-floor');
    const wall = f.add('wall','b-wall');
    f.renderer.onRender = () => {
      assert.equal(floor.surface.visible,false);
      assert.equal(floor.reflector.visible,false);
      assert.equal(wall.surface.visible,false);
      const calls = f.renderer.calls;
      floor.reflector.onBeforeRender(f.renderer,f.world,f.camera);
      assert.equal(f.renderer.calls,calls);
    };
    f.update(1,0);
    assert.equal(floor.reflector.visible,true);
    assert.equal(wall.surface.visible,true);
  } finally { f.dispose(); }
});

check('floor candidate preflight and discard retain the old wall target with peak two', () => {
  const f = fixture();
  try {
    const wall = f.add('wall','old-wall');
    f.update(1,0,[wall]);
    const previous = wall.reflector.getRenderTarget();
    wall.surface.parent.visible = false;
    const floor = f.add('floor','candidate-floor');
    assert.equal(f.preflight([floor],1,0).updated,true);
    assert.equal(wall.reflector.getRenderTarget(),previous);
    assert.equal(mirrorResourceSnapshot().live,2);
    let released = 0;
    floor.reflector.getRenderTarget().addEventListener('dispose',() => released++);
    floor.dispose(); floor.dispose();
    floor.surface.parent.removeFromParent();
    assert.equal(released,1);
    assert.equal(mirrorResourceSnapshot().live,1);
    wall.surface.parent.visible = true;
    assert.equal(wall.reflector.getRenderTarget(),previous);
    assert.equal(f.controller.snapshot().preflightPasses,1);
  } finally { f.dispose(); }
});

check('failed floor shader preflight releases candidate and preserves old wall owner', () => {
  const f = fixture();
  try {
    const wall = f.add('wall','old-wall');
    f.update(1,0,[wall]);
    const previous = wall.reflector.getRenderTarget();
    wall.surface.parent.visible = false;
    const floor = f.add('floor','candidate-floor');
    f.renderer.failShader = true;
    assert.throws(() => f.preflight([floor],2,34),error => error.code === 'mirror-shader-failed');
    assert.equal(floor.active,false);
    assert.equal(floor.fresh,false);
    assert.equal(wall.reflector.getRenderTarget(),previous);
    assert.equal(mirrorResourceSnapshot().live,1);
  } finally { f.dispose(); }
});

check('discarded floor owner is ignored and cannot be activated again', () => {
  const f = fixture();
  try {
    const floor = f.add('floor','a-floor');
    const wall = f.add('wall','b-wall');
    floor.dispose();
    assert.throws(() => floor.activate(),error => error.code === 'mirror-binding-disposed');
    assert.equal(f.update(1,0).activeId,wall.id);
    assert.equal(floor.snapshot().created,0);
  } finally { f.dispose(); }
});

for (const [kind,position] of [
  ['floor',[0,0,.026]], ['floor',[0,.92,.027]], ['floor',[0,NaN,.026]],
  ['wall',[0,.92,.026]], ['wall',[0,0,0]],
]) {
  check(`${kind} rejects incompatible fixed plane ${JSON.stringify(position)} before target allocation`, () => {
    const f = fixture();
    try {
      const definition = resource(kind,'bad');
      definition.mirrorSurface.position = position;
      assert.throws(() => validateMirrorResource(definition,fail),error => error.code === 'invalid-mirror-contract');
      const before = mirrorResourceSnapshot().created;
      assert.throws(() => f.add(kind,'bad',{definition}),error => error.code === 'invalid-mirror-binding');
      assert.equal(mirrorResourceSnapshot().created,before);
    } finally { f.dispose(); }
  });
}

for (const [name,position] of [
  ['missing',undefined], ['null',null], ['string','0,0.92,0.026'],
  ['object',{x:0,y:.92,z:.026}], ['typed array',new Float32Array([0,.92,.026])],
]) {
  check(`floor rejects ${name} plane with the domain error before allocation`, () => {
    const f = fixture();
    try {
      const definition = resource('floor','bad');
      definition.mirrorSurface.position = position;
      const before = mirrorResourceSnapshot().created;
      assert.throws(() => validateMirrorResource(definition,fail),error => error.code === 'invalid-mirror-contract');
      assert.throws(() => f.add('floor','bad',{definition}),error => error.code === 'invalid-mirror-binding');
      assert.equal(mirrorResourceSnapshot().created,before);
    } finally { f.dispose(); }
  });
}

check('old wall rebasing, plane and reflected camera remain unchanged', () => {
  const f = fixture();
  try {
    const wall = f.add('wall','wall');
    f.camera.position.set(0,0,3); f.camera.lookAt(0,0,0); f.camera.updateMatrixWorld(true);
    f.update(1,0);
    assert.deepEqual(wall.planePosition,[0,0,.026]);
    assert.deepEqual(wall.reflector.position.toArray(),[0,0,.026]);
    worldVertexDifference(wall,f.world);
    assert.ok(Math.abs(wall.reflector.getReflectionCamera(f.camera).position.z - (.052-3)) < 1e-7);
    assert.equal(wall.snapshot().samples,0);
  } finally { f.dispose(); }
});

check('unknown floor renderer exception restores public state and requires host rebuild', () => {
  const f = fixture();
  try {
    const floor = f.add('floor','floor');
    const before = f.renderer.snapshot();
    f.renderer.onRender = () => {throw new Error('injected floor prepass failure');};
    assert.throws(() => f.update(1,0),error => error.code === 'mirror-renderer-reset-required');
    assert.deepEqual(f.renderer.snapshot(),before);
    assert.equal(floor.active,false);
    assert.equal(f.controller.snapshot().inPass,false);
  } finally { f.dispose(); }
});

const resources = mirrorResourceSnapshot();
checks.push({name:'all floor and wall target objects released',status:resources.live === 0 ? 'passed' : 'failed',resources});
const sourceFiles = ['prototype/src/company/mirror-render.js','prototype/src/company/mirror-data.js',
  'prototype/src/company/appearance-contract.js','prototype/node_modules/three/examples/jsm/objects/Reflector.js'];
const sourceHashes = {};
for (const filename of sourceFiles) {
  const bytes = await fs.readFile(new URL(`../../${filename}`,import.meta.url));
  sourceHashes[filename] = Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
}
const report = {
  status:checks.every(result => result.status === 'passed') ? 'passed' : 'failed',
  checks, sourceHashes,
  limits:[
    'CPU uses the actual locked Three Reflector and a limited renderer substitute. No browser, GPU pixels or real shader compilation was exercised.',
    'The fixture face is synthetic. Real floor mirror GLB geometry, support/contact, installation, persistence, cutaway and scene transactions require their own evidence.',
    'Bad-plane checks cover the fixed data contract and binding position. Loaded vertex coplanarity belongs to the separate mirror geometry validator.',
    'Target counts measure objects and dispose events. Public state restoration does not prove recovery of Three private render stacks or ordinary-computer performance.',
  ],
};
await fs.writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (report.status !== 'passed') process.exitCode = 1;
