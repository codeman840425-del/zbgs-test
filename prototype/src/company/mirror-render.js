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
  const surface = parts?.get(resource.mirrorNodes?.face);
  const position = Array.isArray(resource.mirrorSurface?.position) ? [...resource.mirrorSurface.position] : undefined;
  const expectedPosition=resource.mountRole==='floor-mirror'?[0,.92,.026]:[0,0,.026];
  if (resource.mirrorSurface?.schema !== 'planar-mirror-v1' || resource.mirrorSurface?.profile !== 'single-512-v1' ||
      !Array.isArray(position) || position.length !== 3 || position.some((value,index) => value !== expectedPosition[index]) ||
      !surface?.isMesh || !surface.parent || !surface.geometry?.getAttribute('position')?.count ||
      surface.position.lengthSq() > 1e-12 || surface.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
      surface.scale.distanceToSquared(new THREE.Vector3(1,1,1)) > 1e-12)
    throw failure('invalid-mirror-binding', id, 'Mirror binding requires the validated identity mesh and fixed plane contract');

  return createPlaneBinding(surface, id, renderProfile, {position, yaw:0, ownerId:id, panelId:null, requiredFaces:1});
}

function identityTransform(object) {
  return object.position.lengthSq() <= 1e-12 && object.quaternion.angleTo(new THREE.Quaternion()) <= 1e-6 &&
    object.scale.distanceToSquared(new THREE.Vector3(1,1,1)) <= 1e-12;
}

function exactKeys(value, keys) {
  return value && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}

/** Validate all faces before marking meshes or allocating any reflection target. */
export function createMirrorBindings(resource, parts, id = resource?.id, renderProfile = 'single-512-v1') {
  if (resource?.mirrorSurface?.schema !== 'makeup-mirror-v1') {
    const binding = createMirrorBinding(resource, parts, id, renderProfile);
    return binding ? [binding] : [];
  }
  validateMirrorRenderProfile(renderProfile);
  const invalid = message => failure('invalid-mirror-binding',id,message);
  const contract = resource.mirrorSurface, panels = resource.mirrorPanels;
  if (!exactKeys(contract,['schema','profile','maxFaces']) || contract.profile !== 'single-512-v1' || contract.maxFaces !== 3 ||
      !Array.isArray(panels) || ![1,3].includes(panels.length) || resource.mountRole !== 'makeup-mirror')
    throw invalid('Makeup mirrors require the common three-face contract and one or three baked panels');
  const expectedIds = panels.length === 3 ? ['center','left','right'] : ['center'];
  const namedParts = [...(parts?.values() || [])], surfaces = new Set(), names = new Set();
  let assetRoot=namedParts[0];
  for (const part of namedParts) {
    const ancestors=new Set();
    for (let node=part;node;node=node.parent) ancestors.add(node);
    while (assetRoot && !ancestors.has(assetRoot)) assetRoot=assetRoot.parent;
  }
  if (!assetRoot?.isObject3D) throw invalid('Mirror parts must belong to one imported asset hierarchy');
  const validated = panels.map(panel => {
    if (!exactKeys(panel,['id','node','backNode','position','yaw','polygons']) || !expectedIds.includes(panel.id) ||
        panel.node !== `makeup-face-${panel.id}` || panel.backNode !== `makeup-back-${panel.id}` ||
        names.has(panel.id)) throw invalid('Each makeup panel requires a unique stable face and its own named back');
    names.add(panel.id);
    const position = panel.id === 'left' ? [-.14,.365,0] : panel.id === 'right' ? [.14,.365,0] : [0,.365,0];
    const yaw = panel.id === 'left' ? Math.PI/6 : panel.id === 'right' ? -Math.PI/6 : 0;
    const surface = parts?.get(panel.node), back = parts?.get(panel.backNode);
    if (!Array.isArray(panel.position) || panel.position.length !== 3 || panel.position.some((v,i) => v !== position[i]) || panel.yaw !== yaw ||
        !surface?.isMesh || !surface.parent || !back?.isMesh || back === surface || surfaces.has(surface))
      throw invalid('Makeup reflection panels require their exact plane pose and distinct real face/back meshes');
    surfaces.add(surface);
    for (const mesh of [surface,back]) for (let node = mesh; node; node = node.parent) {
      if (!identityTransform(node)) throw invalid('Makeup mesh coordinates and asset ancestors must be baked without node transforms');
      if (node===assetRoot) break;
    }
    validatePanelGeometry(surface.geometry,panel,invalid);
    return {surface, position, yaw, ownerId:id, panelId:panel.id, requiredFaces:panels.length};
  });
  return validated.map(plane => createPlaneBinding(plane.surface,`${id}#${plane.panelId}`,renderProfile,plane));
}

function validatePanelGeometry(geometry, panel, invalid) {
  const positions = geometry?.getAttribute('position'), polygons = panel.polygons;
  if (!positions?.count || !Array.isArray(polygons) || !polygons.length)
    throw invalid('A reflection panel requires real planar geometry and convex CCW contour polygons');
  let contourArea = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v))))
      throw invalid('Panel contours must contain finite two-dimensional vertices');
    let twiceArea = 0;
    for (let i=0;i<polygon.length;i++) {
      const a=polygon[i], b=polygon[(i+1)%polygon.length];
      twiceArea += a[0]*b[1]-b[0]*a[1];
      for (const point of polygon)
        if ((b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]) < -1e-9)
          throw invalid('Panel contours must be convex and counterclockwise');
    }
    if (twiceArea <= 1e-10) throw invalid('Panel contours must have positive area');
    contourArea += twiceArea/2;
  }
  const local = [], rotation = new THREE.Matrix4().makeRotationY(-panel.yaw);
  for (let i=0;i<positions.count;i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions,i).sub(new THREE.Vector3(...panel.position)).applyMatrix4(rotation);
    if (![point.x,point.y,point.z].every(Number.isFinite) || Math.abs(point.z)>1e-6 ||
        !polygons.some(polygon => polygon.every((a,j) => {
          const b=polygon[(j+1)%polygon.length];
          return (b[0]-a[0])*(point.y-a[1])-(b[1]-a[1])*(point.x-a[0]) >= -1e-7;
        }))) throw invalid('Mirror vertices must lie on and inside the declared actual plane contour');
    local.push(point);
  }
  const index=geometry.index, count=index ? index.count : positions.count;
  if (count%3) throw invalid('Mirror geometry must contain complete triangles');
  let area=0;
  for (let i=0;i<count;i+=3) {
    const [a,b,c]=[0,1,2].map(offset => local[index ? index.getX(i+offset) : i+offset]);
    if (!a || !b || !c) throw invalid('Mirror triangle references an absent vertex');
    const signedArea=((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
    if (signedArea <= 1e-12) throw invalid('Mirror triangles must face the declared positive plane normal');
    area+=signedArea;
  }
  if (Math.abs(area-contourArea)>1e-6) throw invalid('Mirror triangle area must match its declared contour');
}

/** Owns only the dynamic replacement, never the imported mesh or geometry. */
function createPlaneBinding(surface, id, renderProfile, {position, yaw, ownerId, panelId, requiredFaces}) {
  let quality=RENDER_PROFILES[renderProfile];

  let reflector = null, updateReflection = null, disposed = false, fresh = false;
  const originalVisible = surface.visible, originalMarker = surface.userData.companyMirrorSurface;
  const statistics = {created:0, disposed:0, updates:0};
  surface.userData.companyMirrorSurface = true;
  const binding = {
    id, ownerId, panelId, requiredFaces, surface,
    get planePosition(){return [...position];},
    get planeYaw(){return yaw;},
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
        geometry.rotateY(-yaw);
        reflector = new Reflector(geometry, {textureWidth:quality.size, textureHeight:quality.size, multisample:quality.samples, clipBias:.003});
        constructed = reflector;
        reflector.name = `Reflection:${id}`;
        reflector.position.fromArray(position);
        reflector.rotation.y = yaw;
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
      try { previous.removeFromParent(); }
      finally {
        try { previous.dispose(); }
        finally { previous.geometry.dispose(); surface.visible = originalVisible; }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      binding.deactivate();
      if (originalMarker === undefined) delete surface.userData.companyMirrorSurface;
      else surface.userData.companyMirrorSurface = originalMarker;
    },
    snapshot() {
      return {id, ownerId, panelId, requiredFaces, planePosition:[...position], planeYaw:yaw, active:reflector !== null, fresh, disposed, ...statistics,
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
  const normal = new THREE.Vector3(Math.sin(binding.planeYaw),0,Math.cos(binding.planeYaw)).transformDirection(mesh.parent.matrixWorld);
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  return cameraPosition.sub(point).dot(normal) > 1e-7 && frustum.intersectsObject(mesh);
}

function choose(bindings, world, camera, maxFacesPerMirror) {
  if (!Array.isArray(bindings) || !world?.isObject3D || !camera?.isCamera)
    throw failure('invalid-mirror-host', 'mirror', 'Expected bindings, the host world and its camera');
  world.updateMatrixWorld(true); camera.updateWorldMatrix(true, false);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const groups = new Map();
  for (const binding of bindings.filter(Boolean)) {
    const ownerId=binding.ownerId;
    if (!groups.has(ownerId)) groups.set(ownerId,{id:ownerId,bindings:[],visible:[]});
    groups.get(ownerId).bindings.push(binding);
  }
  const ordered=[...groups.values()].sort((a,b) => String(a.id).localeCompare(String(b.id)));
  for (const group of ordered) {
    const required=group.bindings[0].requiredFaces;
    if (group.bindings.length !== required || group.bindings.some(b => b.requiredFaces !== required) || new Set(group.bindings.map(b=>b.id)).size !== required)
      throw failure('mirror-incomplete-group',group.id,'Provide every unique face of a mirror owner together');
    if (required > maxFacesPerMirror)
      throw failure('mirror-face-budget-exceeded',group.id,`Mirror requires ${required} faces but this host admits ${maxFacesPerMirror}`);
    group.bindings.sort((a,b) => String(a.id).localeCompare(String(b.id)));
    group.visible=group.bindings.filter(binding => eligible(binding,camera,frustum));
  }
  return ordered.find(group=>group.visible.length) || null;
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
export function createMirrorController({maxFacesPerMirror=1}={}) {
  if (![1,2,3].includes(maxFacesPerMirror))
    throw failure('invalid-mirror-face-budget','mirror','The host reflection face budget must be an integer from one to three');
  let active = null, candidate = null, renderingGroup = null, inPass = false, operationRunning = false, disposed = false;
  let lastFrameId, lastTimeMs = -Infinity;
  const statistics = {reflectionPasses:0, preflightPasses:0, shaderChecks:0, failures:0, skipped:0,
    groupUpdates:0, preflightGroupUpdates:0, lastAdmissionFacePasses:0};

  const sameGroup = (a,b) => a && b && a.bindings.length === b.bindings.length && a.bindings.every((binding,i)=>binding===b.bindings[i]);
  function release(group) {
    let firstError;
    for (const binding of group?.bindings || []) {
      try { binding.deactivate(); }
      catch (cause) { firstError ??= cause; }
    }
    if (firstError) throw firstError;
  }
  function groupFresh(group) { return Boolean(group?.visible.length && group.visible.every(binding=>binding.active&&binding.fresh)); }
  function activeFaces(group) { return (group?.bindings || []).filter(binding=>binding.active); }
  function result(group, updated, reason) {
    const faces=activeFaces(group);
    return {updated,activeId:faces.length ? group.id : null,ownerId:faces.length ? group.id : null,
      activeFaceIds:faces.map(binding=>binding.id),faceCount:faces.length,fresh:groupFresh(group),
      ...(reason ? {reason} : {}),stats:controller.snapshot()};
  }

  function renderGroup(group,bindings,renderer,world,camera,preflight) {
    renderingGroup=group;
    try {
      for (const binding of group.bindings) if (!group.visible.includes(binding)) binding.deactivate();
      if (disposed) throw failure('mirror-controller-disposed','mirror','The mirror controller was disposed during reflection preparation');
      // Allocate the whole visible candidate before drawing. Disposal callbacks
      // can run while attaching a child, so check the group after each step.
      for (const binding of group.visible) {
        binding.activate();
        if (disposed || group.bindings.some(face=>face.disposed))
          throw failure('mirror-binding-disposed',binding.id,'The mirror owner was disposed during reflection preparation');
      }
      for (const binding of group.visible) {
        reflect(binding,bindings,renderer,world,camera,preflight);
        if (disposed || group.bindings.some(face=>face.disposed || (group.visible.includes(face)&&!face.active)))
          throw failure('mirror-binding-disposed',binding.id,'The mirror owner was disposed during its reflection pass');
      }
      if (preflight) statistics.preflightGroupUpdates++;
      else statistics.groupUpdates++;
    } catch (cause) { release(group); throw cause; }
    finally { renderingGroup=null; }
  }

  function reflect(binding, bindings, renderer, world, camera, preflight) {
    const context=renderer.getContext();
    if (context.isContextLost()) throw failure('mirror-context-lost', binding.id, 'The host WebGL context is lost');
    if(context.getError()!==0)throw failure('mirror-host-gl-error',binding.id,'The host has a pending WebGL error before the reflection pass');
    const saved = captureRenderer(renderer), visibility = new Map(), surfaceOwners = new Map();
    const oldRender = renderer.render, oldShaderError = renderer.debug.onShaderError;
    const oldCheckShaderErrors = renderer.debug.checkShaderErrors;
    let enteredRenderer = false, enteredCompile = false, shaderError = false;
    const reflector = binding.reflector, forceUpdate = reflector.forceUpdate;
    // Include current and candidate roots if both exist during handoff.
    world.traverse(object => { if (object.userData.companyMirrorSurface) visibility.set(object, object.visible); });
    for (const owner of new Set([...bindings.filter(Boolean),...(active?.bindings||[]),...(candidate?.bindings||[])])) {
      visibility.set(owner.surface, owner.surface.visible);
      surfaceOwners.set(owner.surface,{owner,active:owner.active});
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
        else { statistics.reflectionPasses++; statistics.lastAdmissionFacePasses++; }
        const info=renderer.info, before=info?{calls:info.render.calls,triangles:info.render.triangles}:null;
        const started=performance.now();let completed=false;
        try {
          const result=oldRender.apply(this,args),glError=context.getError();
          if(glError!==0)throw failure('mirror-target-failed',binding.id,`Reflection drawing returned WebGL error ${glError}`);
          completed=true;return result;
        }
        finally {
          if(info)statistics.lastReflection={ownerId:binding.ownerId,faceId:binding.id,preflight,completed,cpuSubmissionMs:performance.now()-started,
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
      catch (cause) {
        throw failure('mirror-renderer-reset-required',binding.id,'Restoring the host renderer failed. Rebuild the renderer before drawing again.',cause);
      }
      finally {
        for (const [object, visible] of visibility) {
          const entry=surfaceOwners.get(object);
          // Dispose/deactivate already restored the imported face. An older
          // hidden snapshot must not overwrite that lifecycle transition.
          if (entry && (entry.owner.disposed || (entry.active&&!entry.owner.active))) continue;
          object.visible = visible;
        }
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
      if (inPass || operationRunning) return result(active,false,'reflection-pass-guard');
      checkHost(frameId, timeMs);
      // Object3D removal/disposal callbacks can call the host again. Hold the
      // guard through selection, release, admission and drawing as one operation.
      operationRunning=true;
      try {
        const selected = choose(bindings, world, camera,maxFacesPerMirror);
        if (active && !sameGroup(active,selected)) release(active);
        if (candidate && !sameGroup(candidate,selected)) release(candidate);
        checkHost(frameId,timeMs);
        candidate=null;
        active = selected;
        for (const binding of bindings.filter(Boolean)) if (!selected?.visible.includes(binding)) binding.deactivate();
        checkHost(frameId,timeMs);
        if (!selected) { statistics.skipped++; return result(null,false,'no-visible-mirror'); }
        if (frameId === lastFrameId || timeMs - lastTimeMs < FRAME_INTERVAL_MS - 1e-7) {
          statistics.skipped++;
          return result(selected,false,groupFresh(selected) ? 'host-budget' : 'host-budget-awaiting-fresh');
        }
        // A failed attempt consumes admission and cannot retry within this frame.
        lastFrameId = frameId; lastTimeMs = timeMs;
        statistics.lastAdmissionFacePasses=0;
        try {
          renderGroup(selected,bindings,renderer,world,camera,false);
        } catch (cause) { active = null; throw cause; }
        return result(selected,true);
      } finally { operationRunning=false; }
    },
    preflight(bindings, renderer, world, camera, {frameId, timeMs} = {}) {
      if (inPass || operationRunning) throw failure('mirror-preflight-reentrant', 'mirror', 'A mirror preflight cannot run within another reflection pass');
      checkHost(frameId, timeMs);
      operationRunning=true;
      try {
        // A successful install may precede the first host update. Retain its
        // warmed owner until scene commit/discard disposes the corresponding faces.
        if (!activeFaces(active).length && activeFaces(candidate).length) { active=candidate; candidate=null; }
        const selected = choose(bindings, world, camera,maxFacesPerMirror);
        if (candidate && !sameGroup(candidate,selected) && !sameGroup(candidate,active)) release(candidate);
        checkHost(frameId,timeMs);
        candidate=selected;
        for (const binding of bindings.filter(Boolean)) if (!selected?.visible.includes(binding) && !active?.bindings.includes(binding)) binding.deactivate();
        checkHost(frameId,timeMs);
        if (!selected) return result(null,false,'no-visible-mirror');
        try {
          renderGroup(selected,bindings,renderer,world,camera,true);
        } catch (cause) { candidate=null; throw cause; }
        return result(selected,true);
      } finally { operationRunning=false; }
    },
    snapshot() {
      const faces=activeFaces(active),candidateFaces=activeFaces(candidate).filter(binding=>!faces.includes(binding));
      return {...statistics, activeId:faces.length ? active.id : null, activeOwnerId:faces.length ? active.id : null,
        activeFaceIds:faces.map(binding=>binding.id),activeFaceCount:faces.length,
        candidateOwnerId:candidateFaces.length ? candidate.id : null,candidateFaceCount:candidateFaces.length,
        maxFacesPerMirror, maxLiveTargets:maxFacesPerMirror, maxHandoffTargets:maxFacesPerMirror*2, inPass,
        resources:mirrorResourceSnapshot(), hostFrameId:lastFrameId ?? null, hostTimeMs:Number.isFinite(lastTimeMs) ? lastTimeMs : null};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const wasRunning=operationRunning;
      operationRunning=true;
      const bindings=[...new Set([...(active?.bindings||[]),...(candidate?.bindings||[]),...(renderingGroup?.bindings||[])])];
      active=null; candidate=null;
      try { release({bindings}); }
      finally { operationRunning=wasRunning; }
    },
  };
  return controller;
}
