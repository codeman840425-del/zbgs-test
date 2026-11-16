import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {validateHatManifest,validateHatFit,validateHatHairCatalog,validateHatHairManifest,assertHatHairSelection,validateHatSourceDocument} from './hat-accessory-contract.js';

const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const require = (condition, message) => { if (!condition) throw Error(message); };
const vector = (values, size) => Array.isArray(values) && values.length === size && values.every(Number.isFinite);

/** Per-actor rigid raw-head attachments. Default paired-ear behavior is retained. */
export function createRigidAccessoryLayer({ vrm, avatarSha256,
  kind = 'paired-ear', manifestUrl = kind==='hat' ? '/assets/m2-hat-hair-v1/manifest.json' : '/assets/m2-paired-ear-accessory-v1/manifest.json',
  manifestSha256, getHairState }) {
  require(kind==='paired-ear'||kind==='hat','Unsupported rigid accessory contract');
  require(manifestSha256===undefined || (typeof manifestSha256==='string' && /^[a-f0-9]{64}$/.test(manifestSha256)),'Invalid rigid accessory manifest SHA');
  const head = vrm?.humanoid?.getRawBoneNode('head');
  const base = new URL(manifestUrl, globalThis.location?.href ?? 'http://localhost/');
  const resource = file => {
    require(typeof file === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file), 'Unsafe rigid accessory resource path');
    return new URL(file, base);
  };
  async function bytes(url) {
    const response = await fetch(url, { cache: 'no-store' });
    require(response.ok, `Rigid accessory HTTP ${response.status}: ${url}`);
    return response.arrayBuffer();
  }
  let manifest = null, fit = null, styleLoading = null, hatHairEntry = null;
  let bodyMode = 'dressed';
  async function loadStyle() {
    if (fit) return true;
    if (styleLoading) return styleLoading;
    styleLoading = (async () => {
      require(head?.isBone && vrm.scene?.getObjectById(head.id) === head, 'Rigid accessory requires the actual raw head bone');
      require(typeof avatarSha256 === 'string' && /^[a-f0-9]{64}$/.test(avatarSha256), 'Rigid accessory requires an exact body SHA');
      const manifestBytes = await bytes(base);
      if (disposed || desired === 'none') return null;
      if(manifestSha256!==undefined)require(await hash(manifestBytes)===manifestSha256,'Rigid accessory manifest integrity mismatch');
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if(kind==='hat') {
        const normalized = validateHatManifest(manifest,base);
        const fitBytes = await bytes(resource(normalized.fit.file));
        if(disposed || desired==='none')return null;
        require(await hash(fitBytes)===normalized.fit.sha256,'Hat fit integrity mismatch');
        const fit = validateHatFit(JSON.parse(new TextDecoder().decode(fitBytes)),normalized,avatarSha256,head);
        const entry = validateHatHairCatalog(fit,avatarSha256);
        const hairManifestBytes = await bytes(new URL(entry.manifestUrl,base));
        if(disposed || desired==='none')return null;
        require(await hash(hairManifestBytes)===entry.manifestSha256,'Hat hair manifest integrity mismatch');
        validateHatHairManifest(JSON.parse(new TextDecoder().decode(hairManifestBytes)),fit,entry,avatarSha256);
        return {manifest:normalized,fit,hairEntry:entry};
      }
      require(manifest.schema === 'zbgs-paired-rigid-accessory-style-v1' && manifest.version === 1 &&
        typeof manifest.styleId === 'string' && manifest.styleId && typeof manifest.pairId === 'string' && manifest.pairId &&
        manifest.physics === 'rigid-head-attachment' && manifest.asset?.units === 'metres' &&
        manifest.asset.localOutwardAxis === '+Z' && manifest.asset.localUpAxis === '+Y' &&
        /^[a-f0-9]{64}$/.test(manifest.asset.sha256) && Number.isSafeInteger(manifest.asset.bytes) && manifest.asset.bytes > 0,
      'Unsupported rigid accessory style');
      require(Array.isArray(manifest.instances) && manifest.instances.length === 2 &&
        manifest.instances.every(instance => typeof instance.id === 'string' && instance.id) &&
        new Set(manifest.instances.map(instance => instance.id)).size === 2 &&
        ['left', 'right'].every(side => manifest.instances.filter(instance => instance.side === side &&
          instance.socket === `ear.${side}` && instance.styleId === manifest.styleId && instance.pairId === manifest.pairId).length === 1),
      'Invalid paired rigid accessory instances');
      const fits = manifest.fits?.filter(fit => fit.baseAvatarSha256 === avatarSha256);
      require(fits?.length === 1, 'Rigid accessory has no exact fit for this body');
      const fitRef = fits[0], fitBytes = await bytes(resource(fitRef.file));
      if (disposed || desired === 'none') return null;
      require(await hash(fitBytes) === fitRef.sha256, 'Rigid accessory fit integrity mismatch');
      const fit = JSON.parse(new TextDecoder().decode(fitBytes));
      require(fit.schema === 'zbgs-paired-rigid-accessory-fit-v1' && fit.version === 1 && fit.fitId === fitRef.fitId &&
        fit.styleId === manifest.styleId && fit.pairId === manifest.pairId && fit.baseAvatarSha256 === avatarSha256 &&
        fit.assetSha256 === manifest.asset.sha256 && Array.isArray(fit.mounts) && fit.mounts.length === 2,
      'Rigid accessory fit identity mismatch');
      for (const instance of manifest.instances) {
        const mounts = fit.mounts.filter(mount => mount.instanceId === instance.id);
        require(mounts.length === 1, 'Rigid accessory mount is missing or duplicated');
        const mount = mounts[0];
        require(mount.side === instance.side && mount.socket === instance.socket && mount.bone === 'head' &&
          mount.rawBoneName === head.name && mount.space === 'raw-head-bind-local' && vector(mount.position, 3) &&
          vector(mount.quaternion, 4) && Math.abs(Math.hypot(...mount.quaternion) - 1) < 1e-6 &&
          vector(mount.scale, 3) && mount.scale.every(value => value === 1), 'Unsupported rigid accessory mount transform');
      }
      return { manifest, fit };
    })().then(prepared => {
      if (!prepared) return false;
      manifest = prepared.manifest; fit = prepared.fit; hatHairEntry = prepared.hairEntry ?? null;
      return true;
    });
    try { return await styleLoading; } finally { styleLoading = null; }
  }
  let disposed = false, revision = 0, selection = 'none', desired = 'none';
  let status = 'ready', error = null, active = null, template = null, loading = null;
  const candidates = new Set(), releasedGroups = new WeakSet();
  const cleanupErrors = [];
  const release = object => { try { object.dispose(); } catch (failure) { cleanupErrors.push(String(failure.message ?? failure)); } };
  function releaseInstances(group) {
    if (!group || releasedGroups.has(group)) return;
    releasedGroups.add(group);
    const materials = new Set();
    group.traverse(node => {
      if (node.isMesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    try { group.removeFromParent(); } catch (failure) { cleanupErrors.push(String(failure.message ?? failure)); }
    for (const material of materials) release(material);
  }
  function releaseSource(scene) {
    const geometries = new Set(), materials = new Set();
    scene.traverse(node => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    for (const geometry of geometries) release(geometry);
    for (const material of materials) release(material);
    scene.clear();
  }
  async function loadTemplate() {
    if (template) return template;
    if (loading) return loading;
    loading = (async () => {
      const buffer = await bytes(resource(manifest.asset.file));
      require(buffer.byteLength === manifest.asset.bytes && await hash(buffer) === manifest.asset.sha256,
        'Rigid accessory asset integrity mismatch');
      // This source contract has no remote buffers, textures, skins or animations.
      const view = new DataView(buffer);
      require(buffer.byteLength >= 20 && view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 &&
        view.getUint32(8, true) === buffer.byteLength && view.getUint32(16, true) === 0x4e4f534a, 'Invalid rigid accessory GLB');
      const jsonLength = view.getUint32(12, true);
      require(20 + jsonLength <= buffer.byteLength, 'Truncated rigid accessory JSON');
      const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
      if(kind==='hat')validateHatSourceDocument(doc);
      else require(!doc.images?.length && !doc.textures?.length && !doc.skins?.length && !doc.animations?.length &&
        doc.buffers?.every(buffer => !buffer.uri) && doc.nodes?.length === 1 && doc.nodes[0].mesh === 0 &&
        !['matrix', 'translation', 'rotation', 'scale', 'extensions'].some(key => Object.hasOwn(doc.nodes[0], key)),
      'Unsupported rigid accessory dependencies or source transform');
      const gltf = await new GLTFLoader().parseAsync(buffer, new URL('.', base).href);
      try {
        const meshes = [];
        gltf.scene.traverse(node => { if (node.isMesh) meshes.push(node); });
        require(meshes.length===(kind==='hat'?2:1) && meshes.every(mesh=>!mesh.isSkinnedMesh &&
          !Array.isArray(mesh.material) && !Object.keys(mesh.geometry.morphAttributes).length),
          'Rigid accessory source mesh contract mismatch');
        if(kind==='hat') {
          require(meshes[0].material===meshes[1].material,'Hat meshes must share one source material');
          for(const mesh of meshes) {
            require(mesh.position.equals(new THREE.Vector3()) && mesh.quaternion.equals(new THREE.Quaternion()) &&
              mesh.scale.equals(new THREE.Vector3(1,1,1)) && Object.values(mesh.material).every(v=>!v?.isTexture),
              'Unsupported hat source transform or texture');
            for(const attribute of Object.values(mesh.geometry.attributes))require(attribute.array.every(Number.isFinite),'Nonfinite hat source attributes');
          }
        }
        if (disposed || desired === 'none') { releaseSource(gltf.scene); return null; }
        template = { scene: gltf.scene, meshes, geometryCount:new Set(meshes.map(mesh=>mesh.geometry)).size };
        return template;
      } catch (failure) { releaseSource(gltf.scene); throw failure; }
    })();
    try { return await loading; } finally { loading = null; }
  }
  function assertCurrentHatHair() {
    if(kind!=='hat')return;
    require(typeof getHairState==='function','Hat requires a synchronous current hair state provider');
    assertHatHairSelection(getHairState(),fit,hatHairEntry);
  }
  function getState() {
    return { schema: 'zbgs-rigid-accessory-layer-state-v1', kind, bodyMode, effectiveSelection:bodyMode==='base'?'none':selection, styleId: manifest?.styleId ?? null, pairId: manifest?.pairId ?? null,
      fitId: fit?.fitId ?? null, avatarSha256, assetSha256: manifest?.asset.sha256 ?? null, selection,
      requested: status === 'loading' ? desired : null, status, error, disposed,
      instances: selection === 'none' ? [] : manifest.instances.filter(instance => selection === 'pair' || selection === instance.side)
        .map(instance => ({ id: instance.id, side: instance.side, socket: instance.socket })),
      cachedGeometries: template?.geometryCount ?? 0, hairDependency:fit?.hairDependency ? {...fit.hairDependency} : null, manifestSha256:manifestSha256 ?? null, cleanupErrors: [...cleanupErrors] };
  }
  return {
    async setSelection(value) {
      require((kind==='hat'?['none','single']:['none','left','right','pair']).includes(value), 'Unsupported rigid accessory selection');
      require(!disposed, 'Rigid accessory layer is disposed');
      const ticket = ++revision;
      const current = () => !disposed && ticket === revision;
      desired = value; error = null;
      if (value === 'none') {
        const previous = active;
        active = null; selection = 'none'; status = 'ready';
        releaseInstances(previous);
        if (!current()) return { applied: false, reason: 'cancelled' };
        return { applied: true, state: getState() };
      }
      status = 'loading';
      let prepared = null;
      try {
        let ready = await loadStyle();
        if (!ready && !disposed && ticket === revision) ready = await loadStyle();
        if (disposed || ticket !== revision || !ready) return { applied: false, reason: 'cancelled' };
        assertCurrentHatHair();
        let source = await loadTemplate();
        if (!source && !disposed && ticket === revision) source = await loadTemplate();
        if (disposed || ticket !== revision || !source) return { applied: false, reason: 'cancelled' };
        assertCurrentHatHair();
        prepared = new THREE.Group(); prepared.name = `RigidAccessory:${manifest.pairId ?? manifest.styleId}`;
        prepared.visible = false; candidates.add(prepared);
        for (const instance of manifest.instances.filter(instance => value === 'pair' || value === instance.side)) {
          if (!current()) return { applied: false, reason: 'cancelled' };
          const mount = fit.mounts.find(mount => mount.instanceId === instance.id);
          const clonedMaterials = new Map();
          for(const original of source.meshes) {
            const mesh = original.clone(false);
            if (!current()) return { applied: false, reason: 'cancelled' };
            let material = clonedMaterials.get(original.material);
            if(!material) {
              material = original.material.clone();
              if (!current()) { release(material); return { applied: false, reason: 'cancelled' }; }
              clonedMaterials.set(original.material,material);
            }
            mesh.material = material;
            mesh.name = source.meshes.length===1 ? instance.id : `${instance.id}:${original.name}`;
            mesh.position.fromArray(mount.position); mesh.quaternion.fromArray(mount.quaternion); mesh.scale.fromArray(mount.scale);
            mesh.userData = { rigidAccessoryId: instance.id, side: instance.side, socket: instance.socket, styleId: manifest.styleId };
            prepared.add(mesh);
          }
        }
        if (!current()) return { applied: false, reason: 'cancelled' };
        head.add(prepared);
        if (!current()) return { applied: false, reason: 'cancelled' };
        assertCurrentHatHair();
        if (!current()) return { applied: false, reason: 'cancelled' };
        const previous = active;
        candidates.delete(prepared); prepared.visible = bodyMode!=='base';
        active = prepared; prepared = null; selection = value; status = 'ready';
        releaseInstances(previous);
        if (!current()) return { applied: false, reason: 'cancelled' };
        return { applied: true, state: getState() };
      } catch (failure) {
        if (disposed || ticket !== revision) return { applied: false, reason: 'cancelled' };
        status = 'error'; error = String(failure.message ?? failure);
        throw failure;
      } finally {
        if (prepared) { candidates.delete(prepared); releaseInstances(prepared); }
      }
    },
    getState,
    assertHairSelection(descriptor) {
      if(kind==='hat' && selection!=='none' && !disposed)assertHatHairSelection(descriptor,fit,hatHairEntry);
    },
    setBodyMode(mode) {
      require(mode==='base'||mode==='dressed','Unsupported rigid accessory body mode');
      if(disposed)return {applied:false,reason:'disposed'};
      bodyMode=mode;if(active)active.visible=mode!=='base';
      return {applied:true};
    },
    dispose() {
      if (disposed) return;
      disposed = true; revision++; desired = 'none'; selection = 'none'; status = 'disposed';
      const previous = active, source = template, preparing = [...candidates];
      active = null; template = null; candidates.clear();
      releaseInstances(previous);
      for (const group of preparing) releaseInstances(group);
      if (source) releaseSource(source.scene);
    },
  };
}
