import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

const noop = () => {};
const FRAME_INTERVAL_MS = 1000 / 30;
const RENDER_PROFILES = Object.freeze({
  'single-512-v1': Object.freeze({size:512,samples:0}),
  'detail-1024-v1': Object.freeze({size:1024,samples:0}),
  'detail-1024-msaa4-v1': Object.freeze({size:1024,samples:4}),
});
const targetStatistics = {created:0, disposed:0, live:0, peak:0};
const failure = (code, path, message, cause) => Object.assign(new Error(message, cause ? {cause} : undefined), {code, path});

/** Counts target objects and dispose events, not allocated GPU bytes. */
export function mirrorResourceSnapshot() { return {...targetStatistics}; }

export function validateMirrorRenderProfile(profile) {
  if(typeof profile!=='string'||!Object.hasOwn(RENDER_PROFILES,profile))
    throw failure('invalid-mirror-render-profile','mirror','Use a supported explicit host reflection quality profile');
  return profile;
}

/** Explicit host display policy; legacy callers keep the original resource default. */
export function selectMirrorRenderProfile(renderer) {
  const gl=renderer.getContext();
  if(gl.isContextLost())throw failure('mirror-context-lost','mirror','The host WebGL context is lost');
  const renderable=renderer.extensions.has('EXT_color_buffer_float')||renderer.extensions.has('EXT_color_buffer_half_float');
  const textureLimit=renderer.capabilities.maxTextureSize,bufferLimit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const limit=Math.min(textureLimit,bufferLimit);
  if(!renderable||!Number.isFinite(limit)||limit<512)
    throw failure('mirror-device-limit','mirror','The host must support renderable HalfFloat color and a 512-square color/depth target');
  if(limit<1024)return 'single-512-v1';
  const color=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
  const depth=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES);
  return renderer.capabilities.maxSamples>=4&&Array.from(color||[]).includes(4)&&Array.from(depth||[]).includes(4)
    ?'detail-1024-msaa4-v1':'detail-1024-v1';
}

/** Owns only the dynamic replacement. The imported mesh stays owned by the scene. */
export function createMirrorBinding(resource, parts, id = resource?.id, renderProfile = 'single-512-v1') {
  if (!resource?.mirrorSurface && !resource?.mirrorNodes) return null;
  validateMirrorRenderProfile(renderProfile);
  let quality=RENDER_PROFILES[renderProfile];
  const surface = parts?.get(resource.mirrorNodes?.face);
  const position = Array.isArray(resource.mirrorSurface?.position) ? [...resource.mirrorSurface.position] : undefined;
  const expectedPosition=resource.mountRole==='floor-mirror'?[0,.92,.026]:[0,0,.026];
  if (resource.mirrorSurface?.schema !== 'planar-mirror-v1' || resource.mirrorSurface?.profile !== 'single-512-v1' ||
      !Array.isArray(position) || position.length !== 3 || position.some((value,index) => value !== expectedPosition[index]) ||
      !surface?.isMesh || !surface.parent || !surface.geometry?.getAttribute('position')?.count ||
      surface.position.lengthSq() > 1e-12 || surface.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
      surface.scale.distanceToSquared(new THREE.Vector3(1,1,1)) > 1e-12)
    throw failure('invalid-mirror-binding', id, 'Mirror binding requires the validated identity mesh and fixed plane contract');

  let reflector = null, updateReflection = null, disposed = false, fresh = false;
  const originalVisible = surface.visible, originalMarker = surface.userData.companyMirrorSurface;
  const statistics = {created:0, disposed:0, updates:0};
  surface.userData.companyMirrorSurface = true;
  const binding = {
    id, surface,
    get planePosition(){return [...position];},
    get reflector() { return reflector; },
    get disposed() { return disposed; },
    get fresh() { return fresh; },
    get active() { return reflector !== null; },
    setRenderProfile(profile) {
      if(disposed)throw failure('mirror-binding-disposed',id,'This mirror instance was disposed');
      if(reflector)throw failure('mirror-quality-active',id,'Deactivate the target before changing host quality');
      validateMirrorRenderProfile(profile);
      renderProfile=profile;quality=RENDER_PROFILES[profile];
    },
    activate() {
      if (disposed) throw failure('mirror-binding-disposed', id, 'This mirror instance was disposed');
      if (reflector) return reflector;
      const geometry = surface.geometry.clone();
      let constructed = null;
      try {
        geometry.translate(-position[0], -position[1], -position[2]);
        reflector = new Reflector(geometry, {textureWidth:quality.size, textureHeight:quality.size, multisample:quality.samples, clipBias:.003});
        constructed = reflector;
        reflector.name = `Reflection:${id}`;
        reflector.position.fromArray(position);
        reflector.userData.companyMirrorSurface = true;
        updateReflection = reflector.onBeforeRender;
        reflector.onBeforeRender = noop;
        const target = reflector.getRenderTarget();
        targetStatistics.created++; targetStatistics.live++;
        targetStatistics.peak = Math.max(targetStatistics.peak, targetStatistics.live);
        statistics.created++;
        let released = false;
        target.addEventListener('dispose', () => {
          if (released) return;
          released = true;
          statistics.disposed++; targetStatistics.disposed++; targetStatistics.live--;
        });
        surface.parent.add(reflector);
        if (disposed || reflector !== constructed)
          throw failure('mirror-binding-disposed', id, 'The mirror was disposed while its replacement was being attached');
        surface.visible = false;
        return reflector;
      } catch (cause) {
        if (reflector === constructed && reflector) binding.deactivate();
        else if (!constructed) geometry.dispose();
        surface.visible = originalVisible;
        if (cause.code === 'mirror-binding-disposed') throw cause;
        throw failure('mirror-bind-failed', id, 'Failed to create the instance reflection target', cause);
      }
    },
    render(renderer, world, camera) {
      if (!reflector || !updateReflection || disposed) throw failure('mirror-not-active', id, 'Activate this mirror before updating it');
      reflector.updateWorldMatrix(true, false);
      updateReflection.call(reflector, renderer, world, camera);
      fresh = true; statistics.updates++;
    },
    deactivate() {
      if (!reflector) return;
      const previous = reflector;
      reflector = null; updateReflection = null; fresh = false;
      previous.onBeforeRender = noop;
      previous.removeFromParent();
      previous.dispose();
      previous.geometry.dispose();
      surface.visible = originalVisible;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      binding.deactivate();
      if (originalMarker === undefined) delete surface.userData.companyMirrorSurface;
      else surface.userData.companyMirrorSurface = originalMarker;
    },
    snapshot() {
      return {id, ownerId:id, active:reflector !== null, fresh, disposed, ...statistics,
        live:reflector ? 1 : 0, renderProfile, width:quality.size, height:quality.size, type:THREE.HalfFloatType, samples:quality.samples};
    },
  };
  return binding;
}

function eligible(binding, camera, frustum) {
  if (binding.disposed) return false;
  const mesh = binding.reflector || binding.surface;
  for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
  mesh.updateWorldMatrix(true, false);
  const point = mesh.parent.localToWorld(new THREE.Vector3(...binding.planePosition));
  const normal = new THREE.Vector3(0,0,1).transformDirection(mesh.parent.matrixWorld);
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  return cameraPosition.sub(point).dot(normal) > 1e-7 && frustum.intersectsObject(mesh);
}

function choose(bindings, world, camera) {
  if (!Array.isArray(bindings) || !world?.isObject3D || !camera?.isCamera)
    throw failure('invalid-mirror-host', 'mirror', 'Expected bindings, the host world and its camera');
  world.updateMatrixWorld(true); camera.updateWorldMatrix(true, false);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return [...bindings].filter(Boolean).sort((a,b) => String(a.id).localeCompare(String(b.id)))
    .find(binding => eligible(binding, camera, frustum)) || null;
}

function captureRenderer(renderer) {
  const target = renderer.getRenderTarget();
  const context = renderer.getContext();
  // r187 rounds setScissor() but floors canvas restoration in setRenderTarget().
  // A bound target's configured rectangle/test may also differ from live GL.
  const scissor = new THREE.Vector4().fromArray(context.getParameter(context.SCISSOR_BOX));
  return {target, face:renderer.getActiveCubeFace(), mip:renderer.getActiveMipmapLevel(),
    viewport:renderer.getCurrentViewport(new THREE.Vector4()), scissor,
    scissorTest:context.getParameter(context.SCISSOR_TEST),
    xr:renderer.xr.enabled, shadow:renderer.shadowMap.autoUpdate};
}

function restoreRenderer(renderer, saved) {
  renderer.xr.enabled = saved.xr;
  renderer.shadowMap.autoUpdate = saved.shadow;
  renderer.setRenderTarget(saved.target, saved.face, saved.mip);
  // These snapshots are already in device pixels. setViewport/setScissor would
  // multiply them by DPR again when returning to the canvas.
  renderer.state.viewport(saved.viewport);
  renderer.state.scissor(saved.scissor);
  renderer.state.setScissorTest(saved.scissorTest);
}

/** Explicit host prepass. Reflector callbacks remain inert during main rendering. */
export function createMirrorController() {
  let active = null, inPass = false, disposed = false;
  let lastFrameId, lastTimeMs = -Infinity;
  const statistics = {reflectionPasses:0, preflightPasses:0, shaderChecks:0, failures:0, skipped:0};

  function reflect(binding, bindings, renderer, world, camera, preflight) {
    const context=renderer.getContext();
    if (context.isContextLost()) throw failure('mirror-context-lost', binding.id, 'The host WebGL context is lost');
    if(context.getError()!==0)throw failure('mirror-host-gl-error',binding.id,'The host has a pending WebGL error before the reflection pass');
    const saved = captureRenderer(renderer), visibility = new Map();
    const oldRender = renderer.render, oldShaderError = renderer.debug.onShaderError;
    const oldCheckShaderErrors = renderer.debug.checkShaderErrors;
    let enteredRenderer = false, enteredCompile = false, shaderError = false;
    const reflector = binding.reflector, forceUpdate = reflector.forceUpdate;
    // Include current and candidate roots if both exist during handoff.
    world.traverse(object => { if (object.userData.companyMirrorSurface) visibility.set(object, object.visible); });
    for (const owner of bindings.filter(Boolean)) {
      visibility.set(owner.surface, owner.surface.visible);
      if (owner.reflector) visibility.set(owner.reflector, owner.reflector.visible);
    }
    inPass = true;
    try {
      renderer.debug.onShaderError = () => { shaderError = true; };
      renderer.debug.checkShaderErrors = true;
      if (!binding.fresh) {
        if (!renderer.compile || !renderer.properties?.get)
          throw failure('mirror-host-compile-required', binding.id, 'The mirror host must expose the locked r187 shader compilation interface');
        // r187 compile() links the program but does not call onFirstUse().
        // getUniforms() forces that first-use link diagnostic without a draw,
        // an extra scene or a third target. This is deliberately r187-specific.
        enteredCompile = true;
        renderer.compile(reflector, camera, world);
        enteredCompile = false;
        const program = renderer.properties.get(reflector.material).currentProgram;
        if (!program?.getUniforms)
          throw failure('mirror-shader-program-missing', binding.id, 'The mirror shader program was not prepared by the locked renderer');
        program.getUniforms();
        statistics.shaderChecks++;
        if (shaderError) throw failure('mirror-shader-failed', binding.id, 'The mirror surface shader failed its first-use link check');
      }
      for (const object of visibility.keys()) if (object !== binding.reflector) object.visible = false;
      renderer.render = function (...args) {
        const status=context.checkFramebufferStatus(context.FRAMEBUFFER),samples=context.getParameter(context.SAMPLES),glError=context.getError();
        if(status!==context.FRAMEBUFFER_COMPLETE||samples!==reflector.getRenderTarget().samples||glError!==0)
          throw failure('mirror-target-failed',binding.id,`Reflection framebuffer is invalid (status ${status}, samples ${samples}, GL error ${glError})`);
        enteredRenderer = true;
        if (preflight) statistics.preflightPasses++;
        else statistics.reflectionPasses++;
        const info=renderer.info, before=info?{calls:info.render.calls,triangles:info.render.triangles}:null;
        const started=performance.now();let completed=false;
        try {
          const result=oldRender.apply(this,args),glError=context.getError();
          if(glError!==0)throw failure('mirror-target-failed',binding.id,`Reflection drawing returned WebGL error ${glError}`);
          completed=true;return result;
        }
        finally {
          if(info)statistics.lastReflection={preflight,completed,cpuSubmissionMs:performance.now()-started,
            calls:info.render.calls-(info.autoReset?0:before.calls),triangles:info.render.triangles-(info.autoReset?0:before.triangles)};
        }
      };
      binding.render(renderer, world, camera);
      if (shaderError) throw failure('mirror-shader-failed', binding.id, 'The mirror prepass reported a shader compilation failure');
      if (renderer.getContext().isContextLost()) throw failure('mirror-context-lost', binding.id, 'The WebGL context was lost during mirror rendering');
      if (!enteredRenderer) throw failure('mirror-no-fresh-pass', binding.id, 'The mirror did not produce its required fresh prepass');
    } catch (cause) {
      statistics.failures++;
      if (['mirror-shader-failed','mirror-context-lost','mirror-no-fresh-pass','mirror-host-compile-required','mirror-shader-program-missing','mirror-target-failed'].includes(cause.code)) throw cause;
      const requiresReset = enteredRenderer || enteredCompile;
      throw failure(requiresReset ? 'mirror-renderer-reset-required' : 'mirror-reflection-failed', binding.id,
        requiresReset ? 'Reflection rendering or shader preparation threw. End this frame and rebuild the host renderer before drawing again.' : 'The reflection prepass failed before entering renderer.render', cause);
    } finally {
      renderer.render = oldRender;
      renderer.debug.onShaderError = oldShaderError;
      renderer.debug.checkShaderErrors = oldCheckShaderErrors;
      reflector.forceUpdate = forceUpdate;
      try { restoreRenderer(renderer, saved); }
      finally {
        for (const [object, visible] of visibility) object.visible = visible;
        inPass = false;
      }
    }
  }

  function checkHost(frameId, timeMs) {
    if (disposed) throw failure('mirror-controller-disposed', 'mirror', 'The mirror controller was disposed');
    if (frameId === undefined || !Number.isFinite(timeMs))
      throw failure('invalid-mirror-frame', 'mirror', 'Provide a host frameId and finite timeMs');
  }

  const controller = {
    update(bindings, renderer, world, camera, {frameId, timeMs, preflight = false} = {}) {
      if (preflight) return controller.preflight(bindings, renderer, world, camera, {frameId, timeMs});
      checkHost(frameId, timeMs);
      if (inPass) return {updated:false, activeId:active?.id || null, reason:'reflection-pass-guard'};
      const selected = choose(bindings, world, camera);
      if (active && active !== selected) active.deactivate();
      active = selected;
      for (const binding of bindings.filter(Boolean)) if (binding !== selected) binding.deactivate();
      if (!selected) { statistics.skipped++; return {updated:false, activeId:null, reason:'no-visible-mirror', stats:controller.snapshot()}; }
      if (frameId === lastFrameId || timeMs - lastTimeMs < FRAME_INTERVAL_MS - 1e-7) {
        statistics.skipped++;
        return {updated:false, activeId:selected.active ? selected.id : null, reason:selected.fresh ? 'host-budget' : 'host-budget-awaiting-fresh', fresh:selected.fresh, stats:controller.snapshot()};
      }
      // A failed attempt also consumes this host admission, preventing retries
      // within the same frame from exceeding the configured pass budget.
      lastFrameId = frameId; lastTimeMs = timeMs;
      try {
        selected.activate(); reflect(selected, bindings, renderer, world, camera, false);
      } catch (cause) { selected.deactivate(); active = null; throw cause; }
      return {updated:true, activeId:selected.id, fresh:true, stats:controller.snapshot()};
    },
    preflight(bindings, renderer, world, camera, {frameId, timeMs} = {}) {
      checkHost(frameId, timeMs);
      if (inPass) throw failure('mirror-preflight-reentrant', 'mirror', 'A mirror preflight cannot run within another reflection pass');
      const selected = choose(bindings, world, camera);
      // A transaction preflight never deactivates the old scene's active owner.
      for (const binding of bindings.filter(Boolean)) if (binding !== selected) binding.deactivate();
      if (!selected) return {updated:false, activeId:null, reason:'no-visible-mirror', stats:controller.snapshot()};
      try {
        selected.activate(); reflect(selected, bindings, renderer, world, camera, true);
      } catch (cause) { selected.deactivate(); throw cause; }
      return {updated:true, activeId:selected.id, fresh:true, stats:controller.snapshot()};
    },
    snapshot() {
      return {...statistics, activeId:active?.active ? active.id : null, inPass,
        resources:mirrorResourceSnapshot(), hostFrameId:lastFrameId ?? null, hostTimeMs:Number.isFinite(lastTimeMs) ? lastTimeMs : null};
    },
    dispose() {
      if (disposed) return;
      disposed = true; active?.deactivate(); active = null;
    },
  };
  return controller;
}
