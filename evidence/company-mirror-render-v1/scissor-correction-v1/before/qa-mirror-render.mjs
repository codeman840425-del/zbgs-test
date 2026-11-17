import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createMirrorBinding,createMirrorController,mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';

const out = new URL('../../evidence/company-mirror-render-v1/', import.meta.url);
await fs.mkdir(out, {recursive:true});
const checks = [];
function check(name, action) {
  try { action(); checks.push({name, status:'passed'}); }
  catch (error) { checks.push({name, status:'failed', error:error.stack}); }
}
const resource = {id:'cpu-mirror', mirrorSurface:{schema:'planar-mirror-v1',profile:'single-512-v1',position:[0,0,.026]},mirrorNodes:{face:'mirror-surface'}};
function fixture() {
  const world = new THREE.Scene(), root = new THREE.Group(); world.add(root);
  const camera = new THREE.PerspectiveCamera(45,1,.05,100); camera.position.set(0,0,3); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  const owners = [];
  function add(id, x = 0) {
    const group = new THREE.Group(); group.position.x = x; root.add(group);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.68,1.68).translate(0,0,.026),new THREE.MeshStandardMaterial({color:0x777777}));
    face.name = 'mirror-surface'; group.add(face);
    const owner = createMirrorBinding(resource,new Map([[face.name,face]]),id); owners.push(owner);
    return owner;
  }
  const renderer = fakeRenderer(), controller = createMirrorController();
  return {world,root,camera,renderer,controller,add,owners,dispose() {
    controller.dispose(); for (const owner of owners) { owner.dispose(); owner.surface.geometry.dispose(); owner.surface.material.dispose(); }
  }};
}
function fakeRenderer() {
  let target = new THREE.WebGLRenderTarget(16,16), face = 2, mip = 1;
  target.viewport.set(2,3,12,11); target.scissor.set(1,2,10,9); target.scissorTest = true;
  let viewport = target.viewport.clone(), scissor = target.scissor.clone(), scissorTest = target.scissorTest;
  const context = {isContextLost:() => false};
  const materialPrograms = new Map();
  const renderer = {
    xr:{enabled:true},shadowMap:{autoUpdate:true},autoClear:false,
    debug:{onShaderError:null,checkShaderErrors:false}, calls:0, inspect:null,inspectCompile:null,
    properties:{get:material => materialPrograms.get(material)},
    compile(object,camera,world) { materialPrograms.set(object.material,{currentProgram:{getUniforms:() => {renderer.inspectCompile?.(object,camera,world);return {};}}});return new Set([object.material]); },
    state:{buffers:{depth:{setMask() {}}},viewport(value) {viewport.copy(value);},scissor(value) {scissor.copy(value);},setScissorTest(value) {scissorTest=value;}},
    getRenderTarget:() => target,getActiveCubeFace:() => face,getActiveMipmapLevel:() => mip,
    getCurrentViewport:result => result.copy(viewport),getScissor:result => result.set(3,4,20,21),getScissorTest:() => false,getPixelRatio:() => 1.5,
    getContext:() => context,
    setRenderTarget(value, cube = 0, level = 0) { target=value; face=cube; mip=level; viewport.copy(value ? value.viewport : new THREE.Vector4(0,0,90,90));scissor.copy(value ? value.scissor : new THREE.Vector4(3,4,20,21).multiplyScalar(1.5).floor());scissorTest=value ? value.scissorTest : false; },
    clear() {},
    render(world,camera) { this.calls++; this.inspect?.(world,camera); },
    stateSnapshot() { return {target,face,mip,viewport:viewport.toArray(),scissor:scissor.toArray(),scissorTest,xr:this.xr.enabled,shadow:this.shadowMap.autoUpdate}; },
  };
  return renderer;
}
function frame(f, frameId, timeMs, bindings=f.owners) { return f.controller.update(bindings,f.renderer,f.world,f.camera,{frameId,timeMs}); }

check('binding is lazy and non-mirror resources are unchanged', () => {
  const f=fixture(); try { const before=mirrorResourceSnapshot();const owner=f.add('a');assert.equal(owner.reflector,null);assert.equal(mirrorResourceSnapshot().created,before.created);assert.equal(createMirrorBinding({},new Map(),'none'),null); } finally {f.dispose();}
});
check('fixed plane is rebased without changing world vertices', () => {
  const f=fixture();try {const owner=f.add('a');owner.surface.parent.rotation.y=Math.PI/2;const before=owner.surface.geometry.getAttribute('position');owner.activate();f.world.updateMatrixWorld(true);const after=owner.reflector.geometry.getAttribute('position');for(let i=0;i<before.count;i++){const a=new THREE.Vector3().fromBufferAttribute(before,i).applyMatrix4(owner.surface.matrixWorld);const b=new THREE.Vector3().fromBufferAttribute(after,i).applyMatrix4(owner.reflector.matrixWorld);assert.ok(a.distanceTo(b)<1e-7);assert.ok(Math.abs(after.getZ(i))<1e-7);}assert.equal(owner.reflector.getRenderTarget().samples,0);assert.equal(owner.reflector.getRenderTarget().width,512);assert.equal(owner.reflector.getRenderTarget().texture.type,THREE.HalfFloatType);}finally{f.dispose();}
});
check('stable selection and host token / 30Hz budget', () => {
  const f=fixture();try {const b=f.add('b',.2),a=f.add('a',-.2);assert.equal(frame(f,1,0).activeId,'a');assert.equal(b.active,false);assert.equal(frame(f,1,100).updated,false);assert.equal(frame(f,2,10).updated,false);assert.equal(frame(f,3,34).updated,true);assert.equal(f.renderer.calls,2);assert.equal(a.snapshot().updates,2);}finally{f.dispose();}
});
check('hidden, behind-camera and off-frustum owners have no target', () => {
  const f=fixture();try {const owner=f.add('a');assert.equal(frame(f,1,0).updated,true);owner.surface.parent.visible=false;assert.equal(frame(f,2,34).reason,'no-visible-mirror');assert.equal(owner.active,false);owner.surface.parent.visible=true;owner.surface.parent.position.x=100;assert.equal(frame(f,3,68).updated,false);owner.surface.parent.position.x=0;owner.surface.parent.rotation.y=Math.PI;assert.equal(frame(f,4,102).updated,false);assert.equal(f.renderer.calls,1);}finally{f.dispose();}
});
check('all reflection surfaces are hidden and callbacks stay inert during prepass', () => {
  const f=fixture();try {const a=f.add('a'),b=f.add('b',.2);b.surface.visible=false;f.renderer.inspect=()=>{assert.equal(a.surface.visible,false);assert.equal(a.reflector.visible,false);assert.equal(b.surface.visible,false);const before=f.renderer.calls;a.reflector.onBeforeRender(f.renderer,f.world,f.camera);assert.equal(f.renderer.calls,before);assert.equal(frame(f,99,99).reason,'reflection-pass-guard');};assert.equal(frame(f,1,0).updated,true);assert.equal(b.surface.visible,false);assert.equal(a.reflector.visible,true);}finally{f.dispose();}
});
check('successful prepass restores renderer target/face/mip/XR/shadow/viewport/scissor', () => {
  const f=fixture();try {f.add('a');const saved=f.renderer.stateSnapshot(),render=f.renderer.render,shader=f.renderer.debug.onShaderError;frame(f,1,0);assert.deepEqual(f.renderer.stateSnapshot(),saved);assert.equal(f.renderer.render,render);assert.equal(f.renderer.debug.onShaderError,shader);}finally{f.dispose();}
});
check('canvas DPR 1.5 viewport and scissor restore in device pixels', () => {
  const f=fixture();try {f.add('a');f.renderer.setRenderTarget(null);const saved=f.renderer.stateSnapshot();frame(f,1,0);assert.deepEqual(f.renderer.stateSnapshot(),saved);}finally{f.dispose();}
});
check('unknown renderer exception restores public state and requires renderer rebuild', () => {
  const f=fixture();try {const a=f.add('a'),b=f.add('b',.2);b.surface.visible=false;const saved=f.renderer.stateSnapshot(),render=f.renderer.render;f.renderer.inspect=()=>{throw new Error('injected render fault');};assert.throws(()=>frame(f,1,0),e=>e.code==='mirror-renderer-reset-required');assert.deepEqual(f.renderer.stateSnapshot(),saved);assert.equal(f.renderer.render,render);assert.equal(a.active,false);assert.equal(a.surface.visible,true);assert.equal(b.surface.visible,false);assert.equal(f.controller.snapshot().inPass,false);}finally{f.dispose();}
});
check('shader diagnostic rejects only after render returned and releases candidate', () => {
  const f=fixture();try {const owner=f.add('a');let returned=false;f.renderer.inspect=()=>{f.renderer.debug.onShaderError();returned=true;};assert.throws(()=>f.controller.preflight(f.owners,f.renderer,f.world,f.camera,{frameId:1,timeMs:0}),e=>e.code==='mirror-shader-failed');assert.equal(returned,true);assert.equal(owner.active,false);assert.equal(owner.fresh,false);}finally{f.dispose();}
});
check('mirror surface shader is checked without an additional draw', () => {
  const f=fixture();try {const owner=f.add('a');let checked=false;f.renderer.inspectCompile=object=>{assert.equal(object,owner.reflector);checked=true;f.renderer.debug.onShaderError();};assert.throws(()=>f.controller.preflight(f.owners,f.renderer,f.world,f.camera,{frameId:1,timeMs:0}),e=>e.code==='mirror-shader-failed');assert.equal(checked,true);assert.equal(f.renderer.calls,0);assert.equal(owner.active,false);assert.equal(f.renderer.debug.checkShaderErrors,false);}finally{f.dispose();}
});
check('exception within renderer.compile requires renderer rebuild', () => {
  const f=fixture();try {const owner=f.add('a');const saved=f.renderer.stateSnapshot();f.renderer.compile=()=>{throw new Error('injected compile callback fault');};assert.throws(()=>frame(f,1,0),e=>e.code==='mirror-renderer-reset-required');assert.deepEqual(f.renderer.stateSnapshot(),saved);assert.equal(owner.active,false);}finally{f.dispose();}
});
check('context loss before render does not claim a fresh pass', () => {
  const f=fixture();try {const owner=f.add('a');f.renderer.getContext().isContextLost=()=>true;assert.throws(()=>frame(f,1,0),e=>e.code==='mirror-context-lost');assert.equal(owner.active,false);assert.equal(f.renderer.calls,0);}finally{f.dispose();}
});
check('candidate preflight preserves old owner target and separates counters', () => {
  const f=fixture();try {const old=f.add('old');frame(f,1,0,[old]);const target=old.reflector.getRenderTarget();old.surface.parent.visible=false;const candidate=f.add('candidate');const pre=f.controller.preflight([candidate],f.renderer,f.world,f.camera,{frameId:1,timeMs:0});assert.equal(pre.updated,true);assert.equal(old.reflector.getRenderTarget(),target);assert.equal(candidate.fresh,true);assert.equal(f.controller.snapshot().reflectionPasses,1);assert.equal(f.controller.snapshot().preflightPasses,1);assert.ok(mirrorResourceSnapshot().live>=2);}finally{f.dispose();}
});
check('failed candidate preflight leaves old target alive', () => {
  const f=fixture();try {const old=f.add('old');frame(f,1,0,[old]);const target=old.reflector.getRenderTarget();old.surface.parent.visible=false;const candidate=f.add('candidate');f.renderer.inspect=()=>{f.renderer.debug.onShaderError();};assert.throws(()=>f.controller.preflight([candidate],f.renderer,f.world,f.camera,{frameId:2,timeMs:34}),e=>e.code==='mirror-shader-failed');assert.equal(old.reflector.getRenderTarget(),target);assert.equal(candidate.active,false);}finally{f.dispose();}
});
check('target/material/geometry disposal is once and reactivation allocates fresh', () => {
  const f=fixture();try {const owner=f.add('a');frame(f,1,0);const first=owner.reflector;let targets=0,materials=0,geometries=0;first.getRenderTarget().addEventListener('dispose',()=>targets++);first.material.addEventListener('dispose',()=>materials++);first.geometry.addEventListener('dispose',()=>geometries++);owner.deactivate();owner.deactivate();assert.deepEqual([targets,materials,geometries],[1,1,1]);assert.equal(owner.fresh,false);frame(f,2,34);assert.notEqual(owner.reflector,first);owner.dispose();owner.dispose();assert.equal(owner.snapshot().created,2);assert.equal(owner.snapshot().disposed,2);assert.equal(owner.surface.parent.children.includes(first),false);}finally{f.dispose();}
});
check('newly visible mirror waits for admission before target allocation', () => {
  const f=fixture();try {const old=f.add('old'),next=f.add('next');next.surface.parent.visible=false;frame(f,1,0);old.surface.parent.visible=false;next.surface.parent.visible=true;const pending=frame(f,2,10);assert.equal(pending.reason,'host-budget-awaiting-fresh');assert.equal(pending.fresh,false);assert.equal(next.active,false);assert.equal(old.active,false);assert.equal(frame(f,3,34).updated,true);assert.equal(next.fresh,true);}finally{f.dispose();}
});
check('disposal during child attachment cannot resurrect the owner or double dispose', () => {
  const f=fixture();try {const owner=f.add('a');let targets=0,materials=0,geometries=0;owner.surface.parent.addEventListener('childadded',event=>{if(event.child.isReflector){event.child.getRenderTarget().addEventListener('dispose',()=>targets++);event.child.material.addEventListener('dispose',()=>materials++);event.child.geometry.addEventListener('dispose',()=>geometries++);owner.dispose();}});assert.throws(()=>owner.activate(),e=>e.code==='mirror-binding-disposed');assert.equal(owner.active,false);assert.equal(owner.surface.visible,true);assert.deepEqual([targets,materials,geometries],[1,1,1]);}finally{f.dispose();}
});
check('invalid mirror binding rejects without allocating a target', () => {
  const f=fixture();try {const owner=f.add('a');const before=mirrorResourceSnapshot();assert.throws(()=>createMirrorBinding({...resource,mirrorSurface:{...resource.mirrorSurface,position:[0,0,0]}},new Map([['mirror-surface',owner.surface]]),'bad'),e=>e.code==='invalid-mirror-binding');assert.equal(mirrorResourceSnapshot().created,before.created);}finally{f.dispose();}
});

const resources=mirrorResourceSnapshot();
checks.push({name:'all owned reflection target objects released',status:resources.live===0?'passed':'failed',resources});
const report={status:checks.every(check=>check.status==='passed')?'passed':'failed',checks,
  limits:['CPU uses the actual locked Three Reflector with a renderer substitute. No WebGL pixels, shader compilation, private-render-stack recovery, browser close/reopen or ordinary-computer performance was verified.','Preflight is a separately counted transaction validation phase. Target counters describe target objects and dispose events, not GPU bytes.']};
await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.status!=='passed')process.exitCode=1;
