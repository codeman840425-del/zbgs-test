import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMirrorBinding,createMirrorController} from '../../prototype/src/company/mirror-render.js';

const world = new THREE.Scene();
const root = new THREE.Group(); world.add(root);
const surface = new THREE.Mesh(new THREE.PlaneGeometry(.68,1.68).translate(0,0,.026),new THREE.MeshStandardMaterial());
surface.name = 'mirror-surface'; root.add(surface);
const resource = {id:'probe-wall',mountRole:'mirror',mirrorSurface:{schema:'planar-mirror-v1',profile:'single-512-v1',position:[0,0,.026]},mirrorNodes:{face:surface.name}};
const owner = createMirrorBinding(resource,new Map([[surface.name,surface]]),resource.id,'detail-1024-msaa4-v1');
const controller = createMirrorController();
const camera = new THREE.PerspectiveCamera(45,1,.05,100);camera.position.set(0,0,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const viewport = new THREE.Vector4(0,0,640,480),scissor = viewport.clone();
let target = null,scissorTest = false,error = 0,statusQueries = 0,errorQueries = 0,renderCalls = 0;
const gl = {
  SCISSOR_BOX:0x0c10,SCISSOR_TEST:0x0c11,SAMPLES:0x80a9,FRAMEBUFFER:0x8d40,FRAMEBUFFER_COMPLETE:0x8cd5,FRAMEBUFFER_INCOMPLETE_ATTACHMENT:0x8cd6,
  INVALID_FRAMEBUFFER_OPERATION:0x0506,isContextLost:() => false,
  getParameter(value) {
    if (value === this.SAMPLES) return target?.samples || 0;
    return value === this.SCISSOR_BOX ? Int32Array.from(scissor.toArray()) : scissorTest;
  },
  checkFramebufferStatus() {statusQueries++;return this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;},
  getError() {errorQueries++;const saved = error;error = 0;return saved;},
};
const renderer = {
  xr:{enabled:false},shadowMap:{autoUpdate:true},autoClear:true,debug:{checkShaderErrors:true,onShaderError:null},
  properties:{get:() => ({currentProgram:{getUniforms:() => ({})}})},compile() {},
  state:{buffers:{depth:{setMask() {}}},viewport:value => viewport.copy(value),scissor:value => scissor.copy(value),setScissorTest:value => {scissorTest=value;}},
  getContext:() => gl,getRenderTarget:() => target,getActiveCubeFace:() => 0,getActiveMipmapLevel:() => 0,getCurrentViewport:result => result.copy(viewport),
  setRenderTarget(value) {target = value;},
  render() {renderCalls++;error = gl.INVALID_FRAMEBUFFER_OPERATION;},
};
let result,observedError;
try {result = controller.preflight([owner],renderer,world,camera,{frameId:1,timeMs:0});}
catch (caught) {observedError = {code:caught.code,message:caught.message};}
const report = {
  scope:'CPU substitute with actual Reflector and an explicitly incomplete framebuffer. No GPU allocation or image proof.',
  mirrorRenderSha256:createHash('sha256').update(await fs.readFile(new URL('../../prototype/src/company/mirror-render.js',import.meta.url))).digest('hex'),
  condition:{framebufferStatus:gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT,renderReturnsNormally:true,renderSetsGlError:gl.INVALID_FRAMEBUFFER_OPERATION},
  result,error:observedError,owner:owner.snapshot(),statusQueries,errorQueries,renderCalls,pendingGlError:error,
  incorrectlyAccepted:!observedError && result?.updated === true && owner.fresh,
};
controller.dispose();owner.dispose();surface.geometry.dispose();surface.material.dispose();
const output = new URL(process.argv[2] || 'implementation-probe-report.json',import.meta.url);
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
