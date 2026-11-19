import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {earStyleResource} from './accessory-recipe.js';
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
  const styleSlot=(url,pin)=>({base:new URL(url,globalThis.location?.href ?? 'http://localhost/'),pin,
    manifest:null,fit:null,hairEntry:null,template:null,styleLoading:null,loading:null});
  const defaultStyle=styleSlot(manifestUrl,manifestSha256), styles=new Map([[manifestUrl,defaultStyle]]);
  let activeStyle=defaultStyle, requestedStyle=defaultStyle;
  function selectedStyle(options){
    if(!Object.hasOwn(options,'styleId') && !Object.hasOwn(options,'version'))return defaultStyle;
    require(typeof options.styleId==='string' && Number.isSafeInteger(options.version),'Expected ear styleId and version');
    const expected=earStyleResource(avatarSha256,options.styleId,options.version);
    let style=styles.get(expected.manifestUrl);
    if(!style){
      style=styleSlot(expected.manifestUrl,expected.manifestSha256);styles.set(expected.manifestUrl,style);
    }
    require(style.pin===undefined || style.pin===expected.manifestSha256,'Ear style manifest pin mismatch');
    style.pin=expected.manifestSha256;style.expected=expected;
    return style;
  }
  const wanted=style=>!disposed && desired!=='none' && requestedStyle===style;
  const resource = (file,base) => {
    require(typeof file === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file), 'Unsafe rigid accessory resource path');
    return new URL(file, base);
  };
  async function bytes(url) {
    const response = await fetch(url, { cache: 'no-store' });
    require(response.ok, `Rigid accessory HTTP ${response.status}: ${url}`);
    return response.arrayBuffer();
  }
  let bodyMode = 'dressed';
  async function loadStyle(style) {
    if (style.fit) return true;
    if (style.styleLoading) return style.styleLoading;
    const {base}=style;
    style.styleLoading = (async () => {
      require(head?.isBone && vrm.scene?.getObjectById(head.id) === head, 'Rigid accessory requires the actual raw head bone');
      require(typeof avatarSha256 === 'string' && /^[a-f0-9]{64}$/.test(avatarSha256), 'Rigid accessory requires an exact body SHA');
      const manifestBytes = await bytes(base);
      if (!wanted(style)) return null;
      if(style.pin!==undefined)require(await hash(manifestBytes)===style.pin,'Rigid accessory manifest integrity mismatch');
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if(kind==='hat') {
        const normalized = validateHatManifest(manifest,base);
        const fitBytes = await bytes(resource(normalized.fit.file,base));
        if(!wanted(style))return null;
        require(await hash(fitBytes)===normalized.fit.sha256,'Hat fit integrity mismatch');
        const fit = validateHatFit(JSON.parse(new TextDecoder().decode(fitBytes)),normalized,avatarSha256,head);
        const entry = validateHatHairCatalog(fit,avatarSha256);
        const hairManifestBytes = await bytes(new URL(entry.manifestUrl,base));
        if(!wanted(style))return null;
        require(await hash(hairManifestBytes)===entry.manifestSha256,'Hat hair manifest integrity mismatch');
        validateHatHairManifest(JSON.parse(new TextDecoder().decode(hairManifestBytes)),fit,entry,avatarSha256);
        return {manifest:normalized,fit,hairEntry:entry};
      }
      require(manifest.schema === 'zbgs-paired-rigid-accessory-style-v1' && manifest.version === (style.expected?.version??1) &&
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
      const fitRef = fits[0], expected=style.expected;
      if(expected)require(expected.styleId===manifest.styleId && expected.version===manifest.version &&
        expected.assetSha256===manifest.asset.sha256 && expected.fitId===fitRef.fitId && expected.fitSha256===fitRef.sha256,
        'Ear style catalog does not match the selected manifest');
      const fitBytes = await bytes(resource(fitRef.file,base));
      if (!wanted(style)) return null;
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
      style.manifest = prepared.manifest; style.fit = prepared.fit; style.hairEntry = prepared.hairEntry ?? null;
      return true;
    });
    try { return await style.styleLoading; } finally { style.styleLoading = null; }
  }
  let disposed = false, revision = 0, selection = 'none', desired = 'none';
  let status = 'ready', error = null, active = null;
  const candidates = new Set(), releasedGroups = new WeakSet();
  const pendingUpdates = new Set(), committedUpdates = new Set();
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
  async function loadTemplate(style) {
    if (style.template) return style.template;
    if (style.loading) return style.loading;
    const {manifest,base}=style;
    style.loading = (async () => {
      const buffer = await bytes(resource(manifest.asset.file,base));
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
        const supportedCount=kind==='hat' ? meshes.length>=1 && meshes.length<=8 : meshes.length===1;
        require(supportedCount && meshes.every(mesh=>!mesh.isSkinnedMesh &&
          !Array.isArray(mesh.material) && !Object.keys(mesh.geometry.morphAttributes).length),
          'Rigid accessory source mesh contract mismatch');
        if(kind==='hat') {
          for(const mesh of meshes) {
            require(mesh.position.equals(new THREE.Vector3()) && mesh.quaternion.equals(new THREE.Quaternion()) &&
              mesh.scale.equals(new THREE.Vector3(1,1,1)) && Object.values(mesh.material).every(v=>!v?.isTexture),
              'Unsupported hat source transform or texture');
            for(const attribute of Object.values(mesh.geometry.attributes))require(attribute.array.every(Number.isFinite),'Nonfinite hat source attributes');
          }
        }
        if (!wanted(style)) { releaseSource(gltf.scene); return null; }
        style.template = { scene: gltf.scene, meshes, geometryCount:new Set(meshes.map(mesh=>mesh.geometry)).size };
        return style.template;
      } catch (failure) { releaseSource(gltf.scene); throw failure; }
    })();
    try { return await style.loading; } finally { style.loading = null; }
  }
  function assertCurrentHatHair() {
    if(kind!=='hat')return;
    require(typeof getHairState==='function','Hat requires a synchronous current hair state provider');
    assertHatHairSelection(getHairState(),defaultStyle.fit,defaultStyle.hairEntry);
  }
  function getState() {
    const {manifest,fit,template,pin}=activeStyle;
    return { schema: 'zbgs-rigid-accessory-layer-state-v1', kind, bodyMode, effectiveSelection:bodyMode==='base'?'none':selection, styleId: manifest?.styleId ?? null, pairId: manifest?.pairId ?? null,
      version:manifest?.version??null, fitId: fit?.fitId ?? null, avatarSha256, assetSha256: manifest?.asset.sha256 ?? null, selection,
      requested: status === 'loading' || status === 'prepared' ? desired : null, status, error, disposed, revision,
      instances: selection === 'none' ? [] : manifest.instances.filter(instance => selection === 'pair' || selection === instance.side)
        .map(instance => ({ id: instance.id, side: instance.side, socket: instance.socket })),
      cachedGeometries: template?.geometryCount ?? 0, hairDependency:fit?.hairDependency ? {...fit.hairDependency} : null, manifestSha256:pin ?? null, cleanupErrors: [...cleanupErrors] };
  }
  const cancelled = () => ({applied:false,cancelled:true,reason:'cancelled'});
  function markFailure(failure,ticket) {
    if(!disposed && ticket===revision){status='error';error=String(failure.message??failure);}
  }
  function assertTargetHair(value,hairState) {
    if(kind!=='hat' || value==='none')return;
    if(hairState===undefined)assertCurrentHatHair();
    else assertHatHairSelection(hairState,defaultStyle.fit,defaultStyle.hairEntry);
  }
  function preparedUpdate(value,ticket,candidate,hairState,style) {
    let live=true,committed=false,cleaned=false,previous=null;
    const previousSelection=selection,previousError=error,previousStyle=activeStyle;
    const current=()=>live && !disposed && ticket===revision;
    const update={
      revision:ticket,
      isCurrent:current,
      validateCommit(){
        require(current(),'Rigid accessory preparation expired');
        assertTargetHair(value,hairState);
      },
      commit(){
        try {
          update.validateCommit();
          // Final-combination preflight can use a descriptor snapshot. The
          // synchronous commit always checks the actual current hair and face.
          if(value!=='none')assertCurrentHatHair();
          if(candidate)head.add(candidate);
          require(current(),'Rigid accessory preparation expired');
          if(value!=='none')assertCurrentHatHair();
          require(current(),'Rigid accessory preparation expired');
          previous=active;
          if(previous)previous.visible=false;
          active=candidate;activeStyle=style;selection=value;desired=value;status='ready';
          if(candidate){candidates.delete(candidate);candidate.visible=bodyMode!=='base';}
          live=false;committed=true;pendingUpdates.delete(update);committedUpdates.add(update);
          return {applied:true,state:getState()};
        }catch(failure){markFailure(failure,ticket);update.dispose();throw failure;}
      },
      rollback(){
        if(!committed||cleaned)return;
        if(candidate)candidate.visible=false;
        active=previous;activeStyle=previousStyle;selection=previousSelection;desired=previousSelection;error=previousError;status='ready';
        if(previous)previous.visible=bodyMode!=='base';
        previous=null;committed=false;committedUpdates.delete(update);
      },
      dispose(){
        if(cleaned)return;
        cleaned=true;live=false;pendingUpdates.delete(update);committedUpdates.delete(update);
        if(committed)releaseInstances(previous);
        else {
          candidates.delete(candidate);releaseInstances(candidate);
          if(!disposed && ticket===revision){desired=selection;if(status!=='error')status='ready';}
        }
      },
    };
    pendingUpdates.add(update);status='prepared';
    return update;
  }
  function beginUpdate(value,options={}) {
    require((kind==='hat'?['none','single']:['none','left','right','pair']).includes(value),'Unsupported rigid accessory selection');
    require(!disposed,'Rigid accessory layer is disposed');
    const optionKeys=kind==='paired-ear' && value!=='none'?['styleId','version']:['hairState'];
    require(options && typeof options==='object' && !Array.isArray(options) &&
      Object.keys(options).every(key=>optionKeys.includes(key)),'Unsupported rigid accessory preparation options');
    const style=value==='none'?activeStyle:selectedStyle(options);
    let hairState;
    if(Object.hasOwn(options,'hairState')){
      require(options.hairState && typeof options.hairState==='object' && !Array.isArray(options.hairState),
        'Final hair state must be a data snapshot');
      hairState=structuredClone(options.hairState);
    }
    const ticket=++revision,current=()=>!disposed && ticket===revision;
    desired=value;requestedStyle=style;error=null;status='loading';
    // Superseding a ready preparation releases only its hidden candidate.
    // Successfully committed updates retain their old resources until dispose.
    for(const update of [...pendingUpdates])update.dispose();
    if(!current())return cancelled();
    if(value==='none')return preparedUpdate(value,ticket,null,hairState,style);
    return (async()=>{
      let candidate=null;
      try {
        let ready=await loadStyle(style);
        if(!ready && current())ready=await loadStyle(style);
        if(!current() || !ready)return cancelled();
        assertTargetHair(value,hairState);
        let source=await loadTemplate(style);
        if(!source && current())source=await loadTemplate(style);
        if(!current() || !source)return cancelled();
        assertTargetHair(value,hairState);
        const {manifest,fit}=style;
        candidate=new THREE.Group();candidate.name=`RigidAccessory:${manifest.pairId??manifest.styleId}`;
        candidate.visible=false;candidates.add(candidate);
        for(const instance of manifest.instances.filter(instance=>value==='pair'||value===instance.side)){
          if(!current())return cancelled();
          const mount=fit.mounts.find(mount=>mount.instanceId===instance.id),clonedMaterials=new Map();
          for(const original of source.meshes){
            const mesh=original.clone(false);
            if(!current())return cancelled();
            let material=clonedMaterials.get(original.material);
            if(!material){
              material=original.material.clone();
              if(!current()){release(material);return cancelled();}
              clonedMaterials.set(original.material,material);
            }
            mesh.material=material;
            mesh.name=source.meshes.length===1?instance.id:`${instance.id}:${original.name}`;
            mesh.position.fromArray(mount.position);mesh.quaternion.fromArray(mount.quaternion);mesh.scale.fromArray(mount.scale);
            mesh.userData={rigidAccessoryId:instance.id,side:instance.side,socket:instance.socket,styleId:manifest.styleId};
            candidate.add(mesh);
          }
        }
        if(!current())return cancelled();
        const update=preparedUpdate(value,ticket,candidate,hairState,style);candidate=null;
        return update;
      }catch(failure){
        if(!current())return cancelled();
        markFailure(failure,ticket);throw failure;
      }finally{if(candidate){candidates.delete(candidate);releaseInstances(candidate);}}
    })();
  }
  async function setSelection(value,options) {
    const job=beginUpdate(value,options),ticket=revision;
    let update,result;
    try {
      // Preserve the existing synchronous removal/cancellation path for none.
      update=value==='none'?job:await job;
      if(!update.commit)return {applied:false,reason:'cancelled'};
      result=update.commit();
    }catch(failure){
      if(disposed || ticket!==revision)return {applied:false,reason:'cancelled'};
      markFailure(failure,ticket);throw failure;
    }finally{update?.dispose?.();}
    if(disposed || ticket!==revision)return {applied:false,reason:'cancelled'};
    return {...result,state:getState()};
  }
  return {
    setSelection,
    async prepareUpdate(value,options){return beginUpdate(value,options);},
    getState,
    assertHairSelection(descriptor) {
      if(kind==='hat' && selection!=='none' && !disposed)assertHatHairSelection(descriptor,defaultStyle.fit,defaultStyle.hairEntry);
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
      const previous = active, preparing = [...candidates];
      active = null; candidates.clear();
      for(const update of [...pendingUpdates,...committedUpdates])update.dispose();
      releaseInstances(previous);
      for (const group of preparing) releaseInstances(group);
      for(const style of styles.values())if(style.template){releaseSource(style.template.scene);style.template=null;}
      styles.clear();
    },
  };
}
