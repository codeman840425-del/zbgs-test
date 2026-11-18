import {validateCableRouteGeometry} from './cable-route-geometry.js';
import {validateCablePortGeometry} from './cable-port-geometry.js';
import * as THREE from 'three';
import {screenMaterials} from './screen-state.js';
import {validateWindowGeometry} from './window-geometry.js';
import {validateWindowResource} from './window-data.js';
import {validateWindowCoverResource,validateWindowCoverGeometry} from './window-cover-data.js';
import {validateBackdropResource,validateBackdropGeometry} from './backdrop-roll.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CompanyError} from './document.js';
import {validateSupportResource} from './support-data.js';
import {validateSupportGeometry} from './support-geometry.js';
import {validateMovingResource} from './moving-parts.js';
import {validateMovingPartGeometry,validateExteriorDoorLeafGeometry} from './moving-part-geometry.js';
import {validateSlidingPartGeometry} from './sliding-part-geometry.js';
import {validateWallAmbientResource,validateWallAmbientGeometry} from './wall-ambient.js';
import {validateDeskLampResource,validateDeskLampGeometry} from './desk-lamp.js';
import {validateClockResource} from './clock-display.js';
import {validateClockGeometry} from './clock-geometry.js';
import {validateInformationResource} from './information-display.js';
import {validateInformationGeometry} from './information-geometry.js';
import {validateMirrorResource} from './mirror-data.js';
import {validateVanityResource} from './vanity-data.js';
import {validateVanityGeometry} from './vanity-geometry.js';
import {validateMakeupMirrorGeometry} from './makeup-mirror-geometry.js';
import {validateMakeupStorageGeometry} from './makeup-storage-geometry.js';
import {validateMakeupDrawerGeometry} from './makeup-drawer-geometry.js';
import {isCameraMountResource} from './camera-mount-data.js';
import {validateCameraMountGeometry} from './camera-mount-geometry.js';
import {validateMakeupWallMirrorGeometry} from './makeup-wall-mirror-geometry.js';
import {validateSideTableGeometry} from './side-table-geometry.js';
import {isTexturedRoundTable,validateTexturedRoundTable} from './textured-table-geometry.js';
import {validateSideTableLifeItemsGeometry} from './side-table-life-items-geometry.js';
import {validateCeilingAcousticGeometry} from './ceiling-acoustic-geometry.js';
import {validateWallShelfGeometry} from './wall-shelf-geometry.js';
import {validateMirrorGeometry} from './mirror-geometry.js';
import {trackTexture,trackTextures} from './image-ownership.js';

const compressionExtensions = new Set([
  'KHR_draco_mesh_compression', 'EXT_meshopt_compression',
  'KHR_meshopt_compression', 'KHR_texture_basisu',
]);
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const error = (code, path, message) => new CompanyError(code, path, message);

function describe(resource) {
  const path = `resources.${resource?.id || '?'}`;
  if (!resource || typeof resource.id !== 'string' || !identityPattern.test(resource.id) ||
      !Number.isSafeInteger(resource.version) || resource.version < 1)
    throw error('invalid-asset-resource', path, 'Expected stable resource id and positive version');
  validateWallAmbientResource(resource,(code,location,message)=>{throw error(code,location,message);},path);
  validateDeskLampResource(resource,(code,location,message)=>{throw error(code,location,message);},path);
  validateWindowResource(resource,(code,location,message)=>{throw error(code,location,message);});
  validateWindowCoverResource(resource,(code,location,message)=>{throw error(code,location,message);},path);
  validateBackdropResource(resource,(code,location,message)=>{throw error(code,location,message);},path);
  validateSupportResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  validateMovingResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  validateClockResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  validateInformationResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  validateMirrorResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  validateVanityResource(resource, (code, location, message) => { throw error(code, location, message); }, path);
  const asset = resource.asset;
  if (!asset || asset.format !== 'glb' || typeof asset.url !== 'string' || !asset.url.trim() ||
      !/^[a-fA-F0-9]{64}$/.test(asset.sha256 || '') || !Number.isSafeInteger(asset.bytes) || asset.bytes < 20)
    throw error('invalid-asset', `${path}.asset`, 'Expected glb URL, SHA256 and positive GLB byte length');
  if (resource.coordinates?.units !== 'metres' || resource.coordinates.up !== '+Y' || resource.coordinates.forward !== '+Z')
    throw error('unsupported-asset-coordinates', `${path}.coordinates`, 'Expected metres, +Y up and +Z forward');
  const targets = [];
  if (resource.usePoints !== undefined && !Array.isArray(resource.usePoints))
    throw error('invalid-contact-node', `${path}.usePoints`, 'Expected an array of contact definitions');
  for (const point of resource.usePoints || []) {
    for (const field of ['seatNodeId', 'backNodeId']) {
      if (!point || typeof point[field] !== 'string' || !point[field])
        throw error('invalid-contact-node', `${path}.usePoints.${point?.id}.${field}`, 'Expected a named contact mesh');
      targets.push(point[field]);
    }
  }
  const footprint = resource.footprint?.blocking ? structuredClone(resource.footprint) : null;
  if (footprint && (!Array.isArray(footprint.center) || footprint.center.length !== 2 ||
      !footprint.center.every(Number.isFinite) || !Array.isArray(footprint.halfSize) ||
      footprint.halfSize.length !== 2 || !footprint.halfSize.every(value => Number.isFinite(value) && value > 0)))
    throw error('invalid-asset-footprint', `${path}.footprint`, 'Blocking assets require finite center[2] and positive halfSize[2]');
  return {path, resource: structuredClone(resource), footprint, mounting: resource.mounting?structuredClone(resource.mounting):null, mount:resource.mount, targets: [...new Set(targets)], asset: {...asset, sha256: asset.sha256.toLowerCase()},
    key: JSON.stringify([resource.id, resource.version, asset.url, asset.sha256.toLowerCase(), asset.bytes])};
}

function inspectGlb(bytes, path) {
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength)
    throw error('invalid-glb', path, 'Expected a complete GLB version 2 container');
  let json, offset = 12, binaryChunks = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw error('invalid-glb', path, 'Truncated chunk header');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > bytes.byteLength) throw error('invalid-glb', path, 'Invalid chunk length');
    if (type === 0x4e4f534a) {
      if (json || offset !== 12) throw error('invalid-glb', path, 'JSON must be the first and only JSON chunk');
      try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, offset + 8, length))); }
      catch (cause) { throw error('invalid-glb-json', path, cause.message); }
    }
    if (type === 0x004e4942) binaryChunks++;
    offset += length + 8;
  }
  if (!json || json.asset?.version !== '2.0' || binaryChunks > 1)
    throw error('invalid-glb', path, 'Expected glTF 2.0 JSON with at most one embedded binary chunk');
  if (json.animations?.length || json.skins?.length || json.nodes?.some(node => node.skin !== undefined))
    throw error('unsupported-asset-rig', path, 'Company assets must be static, without skins or animations');
  for (const [kind, definitions] of [['buffers', json.buffers || []], ['images', json.images || []]]) {
    for (const [index, definition] of definitions.entries()) {
      if (definition.uri !== undefined || (kind === 'images' && !Number.isInteger(definition.bufferView)))
        throw error('external-asset-uri', `${path}.${kind}[${index}]`, 'Use GLB BIN buffers and bufferView images');
    }
  }
  function inspect(value, location) {
    if (!value || typeof value !== 'object') return;
    for (const name of Object.keys(value.extensions || {})) if (compressionExtensions.has(name))
      throw error('unsupported-asset-compression', location, `No decoder is configured for ${name}`);
    for (const name of value.extensionsUsed || []) if (compressionExtensions.has(name))
      throw error('unsupported-asset-compression', location, `No decoder is configured for ${name}`);
    for (const name of value.extensionsRequired || []) if (compressionExtensions.has(name))
      throw error('unsupported-asset-compression', location, `No decoder is configured for ${name}`);
    for (const [key, child] of Object.entries(value)) inspect(child, `${location}.${key}`);
  }
  inspect(json, path);
  for (const [index, node] of (json.nodes || []).entries()) {
    for (const field of ['matrix', 'translation', 'rotation', 'scale']) if (node[field] &&
        (!Array.isArray(node[field]) || !node[field].every(Number.isFinite)))
      throw error('invalid-asset-transform', `${path}.nodes[${index}].${field}`, 'Node transforms must be finite');
  }
  return json;
}

function collect(value, owned) {
  if (!value) return;
  if (Array.isArray(value)) { for (const item of value) collect(item, owned); return; }
  if (value.isObject3D) {
    value.traverse(node => { collect(node.geometry, owned); collect(node.material, owned); });
  } else if (value.isBufferGeometry) owned.geometries.add(value);
  else if (value.isMaterial) {
    owned.materials.add(value);
    for (const property of Object.values(value)) if (property?.isTexture) owned.textures.add(property);
  } else if (value.isTexture) owned.textures.add(value);
}
function ownedResources() { return {geometries: new Set(), materials: new Set(), textures: new Set()}; }
function release(owned) {
  // Register before the first dispose event. Parser cleanup and retainOnly can
  // discover the same texture more than once, so registration is idempotent.
  trackTextures(owned.textures);
  for (const texture of owned.textures) texture.dispose();
  for (const material of owned.materials) material.dispose();
  for (const geometry of owned.geometries) geometry.dispose();
}
function releasePack(pack) {
  const owned = ownedResources(); collect(pack.scenes, owned); release(owned);
}
function trackPack(pack) {
  const owned = ownedResources(); collect(pack?.scenes, owned); trackTextures(owned.textures);
}

// Failed GLTF parsing can leave fulfilled dependencies outside the returned scene.
// The pinned Three loader exposes these dependency promises on its parser cache.
async function releaseFailedParser(parser, json, pack) {
  if (!parser) return;
  const visited = new Set(), owned = ownedResources();
  collect(pack?.scenes, owned);
  let pending;
  do {
    pending = [];
    for (const [type, definitions] of [['scene', json.scenes], ['node', json.nodes],
      ['mesh', json.meshes], ['material', json.materials], ['texture', json.textures]]) {
      for (let index = 0; index < (definitions?.length || 0); index++) {
        const dependency = parser.cache.get(`${type}:${index}`);
        if (dependency && !visited.has(dependency)) { visited.add(dependency); pending.push(dependency); }
      }
    }
    for (const entry of Object.values(parser.primitiveCache)) if (entry.promise && !visited.has(entry.promise)) {
      visited.add(entry.promise); pending.push(entry.promise);
    }
    for (const result of await Promise.allSettled(pending)) if (result.status === 'fulfilled') collect(result.value, owned);
  } while (pending.length);
  release(owned);
}

// A loaded GLB pack is immutable; instances receive private meshes.
const checkedBackdropPacks = new WeakSet();
function validateResource(pack, description) {
  pack.scene.updateMatrixWorld(true);
  if (description.resource.display?.screen !== undefined) {
    screenMaterials(description.resource, name => {
      const matches = [];
      pack.scene.traverse(node => {
        if ((node.userData.name || node.name) === name) matches.push(node);
      });
      return matches.length === 1 ? matches[0] : null;
    }, description.path);
  }
  validateWindowGeometry(pack.scene,description.resource,(code,path,message)=>{throw error(code,path,message);});
  validateWindowCoverGeometry(pack.scene,description.resource,(code,path,message)=>{throw error(code,path,message);});
  if (description.resource.backdropRoll && !checkedBackdropPacks.has(pack)) {
    validateBackdropGeometry(pack.scene,description.resource,(code,path,message)=>{throw error(code,path,message);});
    checkedBackdropPacks.add(pack);
  }
  validateCableRouteGeometry(pack.scene, description.resource, (code,path,message)=>{throw error(code,path,message);});
  if(description.resource.cablePorts)validateCablePortGeometry(pack.scene, description.resource, (code,path,message)=>{throw error(code,path,message);});
  validateWallAmbientGeometry(pack.scene,description.resource,(code,path,message)=>{throw error(code,path,message);});
  validateDeskLampGeometry(pack.scene,description.resource,(code,path,message)=>{throw error(code,path,message);});
  validateClockGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateInformationGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateMakeupMirrorGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateMakeupStorageGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateMakeupDrawerGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateMakeupWallMirrorGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  const tableGeometry = isTexturedRoundTable(description.resource) ? validateTexturedRoundTable : validateSideTableGeometry;
  tableGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateSideTableLifeItemsGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateCeilingAcousticGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateWallShelfGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateMirrorGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateSupportGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateCameraMountGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  validateVanityGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  const movingGeometry=description.resource.movingProfile==='exterior-door-leaf-v1'?validateExteriorDoorLeafGeometry:
    description.resource.movingParts?.[0]?.kind==='slide'?validateSlidingPartGeometry:validateMovingPartGeometry;
  if(!['supported-slide-v1','makeup-drawer-host-v1'].includes(description.resource.movingProfile))
    movingGeometry(pack.scene, description.resource, (code, location, message) => { throw error(code, location, message); });
  for (const target of description.targets) {
    const definitions = (pack.json.nodes || []).filter(node => node.name === target);
    const matches = [];
    pack.scene.traverse(node => { if (node.name === target) matches.push(node); });
    if (definitions.length !== 1 || matches.length !== 1 || !matches[0].isMesh)
      throw error('missing-contact-mesh', `${description.path}.${target}`, 'Contact name must uniquely resolve to an actual mesh');
  }
  if (description.footprint) {
    const box = new THREE.Box3().setFromObject(pack.scene);
    const {center, halfSize} = description.footprint;
    for (const [index, axis] of ['x', 'z'].entries()) if (
      box.min[axis] < center[index] - halfSize[index] - 0.001 ||
      box.max[axis] > center[index] + halfSize[index] + 0.001)
      throw error('asset-footprint-mismatch', `${description.path}.footprint`, 'Declared blocking footprint must enclose the default scene XZ bounds within 1mm');
  }
  if(description.mounting) {
    const s=description.mounting,b=new THREE.Box3().setFromObject(pack.scene),cameraMount=isCameraMountResource(description.resource),wall=!cameraMount&&['wall','wall-opening','portal','portal-door','information-surface','window-cover'].includes(description.mount);
    const lo=description.mount==='ceiling'&&s.origin==='top'?-s.height:wall&&s.origin==='center'?-s.height/2:cameraMount?-.25:0;
    if(![s.width,s.height,s.depth].every(v=>Number.isFinite(v)&&v>0)||
      b.min.x < -s.width/2-.001||b.max.x > s.width/2+.001||b.min.y<lo-.001||b.max.y>lo+s.height+.001||
      b.min.z<(wall?0:-s.depth/2)-.001||b.max.z>(wall?s.depth:s.depth/2)+.001)
      throw error('asset-mount-envelope-mismatch',description.path,'Actual model exceeds its fixed installation envelope');
    if(description.mount==='portal') {
      // Sample the actual imported triangles across the required clear opening.
      for(const x of [-.49,-.25,0,.25,.49].map(v=>v*s.apertureWidth))for(const y of [.01,.25,.5,.75,.99].map(v=>v*s.apertureHeight)) {
        if(new THREE.Raycaster(new THREE.Vector3(x,y,s.depth+1),new THREE.Vector3(0,0,-1)).intersectObject(pack.scene,true).length)
          throw error('asset-blocks-portal',description.path,'Display geometry crosses the declared open doorway');
      }
    }
  }
}

async function validateTextures(pack, parser, failures, path) {
  for (let index = 0; index < (pack.json.textures?.length || 0); index++) {
    const dependency = parser.cache.get(`texture:${index}`);
    if (dependency && !(await dependency)?.isTexture)
      throw error('asset-texture-load-failed', `${path}.textures[${index}]`, 'A required texture failed to load');
  }
  if (failures.length) throw error('asset-texture-load-failed', path, 'An embedded image failed to decode or load');
  pack.scene.traverse(node => {
    if (!node.isMesh) return;
    for (const material of node.material ? [node.material].flat() : []) {
      for (const texture of Object.values(material).filter(value => value?.isTexture)) {
        if (!(texture.image?.width > 0) || !(texture.image?.height > 0))
          throw error('asset-texture-load-failed', path, 'A required texture has no decoded image dimensions');
        const attribute = node.geometry.getAttribute(texture.channel ? `uv${texture.channel}` : 'uv');
        if (!attribute || attribute.count !== node.geometry.getAttribute('position')?.count)
          throw error('missing-asset-uv', path, 'A textured mesh requires matching UV coordinates for its texture channel');
        for (let index = 0; index < attribute.count; index++) if (
          ![attribute.getX(index), attribute.getY(index)].every(Number.isFinite))
          throw error('invalid-asset-uv', path, 'Texture coordinates must be finite');
      }
    }
  });
}

function cloneInstance(pack) {
  const geometries = new Map(), materials = new Map(), textures = new Map(), owned = ownedResources();
  function textureCopy(texture) {
    if (!textures.has(texture)) {
      const next = texture.clone(), image = texture.image;
      // Pixel arrays can be copied synchronously. Browser decoded image pixels
      // remain shared read-only; Texture and Source state are instance-owned.
      next.source = new THREE.TextureSource(image?.data && ArrayBuffer.isView(image.data)
        ? {...image, data: image.data.slice()} : image);
      trackTexture(next);
      textures.set(texture, next); owned.textures.add(next);
    }
    return textures.get(texture);
  }
  try {
    pack.scene.traverse(node => {
      if (node.geometry && !geometries.has(node.geometry)) {
        const next = node.geometry.clone(); geometries.set(node.geometry, next); owned.geometries.add(next);
      }
      for (const material of node.material ? [node.material].flat() : []) if (!materials.has(material)) {
        const next = material.clone(); owned.materials.add(next);
        for (const [key, value] of Object.entries(material)) if (value?.isTexture) next[key] = textureCopy(value);
        materials.set(material, next);
      }
    });
    const root = pack.scene.clone(true), nodes = new Map();
    root.traverse(node => {
      if (node.geometry) node.geometry = geometries.get(node.geometry);
      if (node.material) node.material = Array.isArray(node.material)
        ? node.material.map(material => materials.get(material)) : materials.get(node.material);
      if (node.name) nodes.set(node.name, node);
    });
    // GLTFLoader sanitizes animation binding names (for example decimal points).
    // Resource slots refer to authored glTF node names retained in userData.name.
    root.traverse(node=>{if(typeof node.userData?.name==='string'&&node.userData.name)nodes.set(node.userData.name,node);});
    return {root, nodes};
  } catch (cause) { release(owned); throw cause; }
}

export function createCompanyAssetLibrary({fetchImpl = globalThis.fetch} = {}) {
  if (typeof fetchImpl !== 'function') throw error('invalid-fetch', 'asset-library', 'Expected a fetch function');
  const entries = new Map();
  let disposed = false;
  function live() { if (disposed) throw error('asset-library-disposed', 'asset-library', 'The asset library was disposed'); }
  async function load(description, entry) {
    let pack, parser, json;
    try {
      const response = await fetchImpl(description.asset.url, {signal: entry.abort.signal});
      if (!response?.ok) throw error('asset-fetch-failed', description.path, `HTTP ${response?.status ?? 'invalid response'}`);
      const bytes = await response.arrayBuffer(); live();
      if (bytes.byteLength !== description.asset.bytes)
        throw error('asset-byte-length-mismatch', description.path, `Expected ${description.asset.bytes}, received ${bytes.byteLength}`);
      const hash = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== description.asset.sha256) throw error('asset-digest-mismatch', description.path, 'GLB SHA256 does not match its pinned resource');
      live(); json = inspectGlb(bytes, description.path);
      const manager = new THREE.LoadingManager();
      const textureFailures = [];
      manager.onError = url => {
        textureFailures.push(url);
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      };
      manager.setURLModifier(url => {
        if (!url.startsWith('blob:')) throw error('external-asset-uri', description.path, 'External loader requests are disabled');
        return url;
      });
      const loader = new GLTFLoader(manager);
      loader.register(value => { parser = value; return {name: 'CompanyAssetOwnership'}; });
      pack = await loader.parseAsync(bytes, ''); pack.json = json; trackPack(pack);
      await validateTextures(pack, parser, textureFailures, description.path);
      let meshes = 0;
      for (const scene of pack.scenes) {
        scene.updateMatrixWorld(true);
        scene.traverse(node => {
          if (!node.matrix.elements.every(Number.isFinite) || !node.matrixWorld.elements.every(Number.isFinite))
            throw error('invalid-asset-transform', description.path, 'Loaded world/local matrix is nonfinite');
          if (node.isSkinnedMesh) throw error('unsupported-asset-rig', description.path, 'Skinned meshes are unsupported');
          if (node.isMesh) {
            const positions = node.geometry.getAttribute('position');
            if (!positions?.count)
              throw error('empty-asset-mesh', description.path, 'Mesh positions must be nonempty and finite');
            for (let index = 0; index < positions.count; index++) if (
              ![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite))
              throw error('empty-asset-mesh', description.path, 'Mesh positions must be nonempty and finite');
          }
        });
      }
      pack.scene?.traverse(node => { if (node.isMesh) meshes++; });
      if (!meshes) throw error('empty-asset', description.path, 'Default scene contains no mesh');
      validateResource(pack, description); live();
      if(entries.get(description.key)!==entry)throw error('asset-load-cancelled',description.path,'The resource is no longer requested by the active view');
      entry.pack = pack; return pack;
    } catch (cause) {
      if (parser) await releaseFailedParser(parser, json, pack); else if (pack) releasePack(pack);
      if (disposed) throw error('asset-library-disposed', description.path, 'Loading completed after library disposal');
      if (cause instanceof CompanyError) throw cause;
      throw error('asset-load-failed', description.path, cause.message || String(cause));
    }
  }
  async function preloadOne(resource) {
    live(); const description = describe(resource);
    let entry = entries.get(description.key);
    if (!entry) {
      entry = {abort: new AbortController()}; entries.set(description.key, entry);
      entry.promise = load(description, entry).catch(cause => {
        if (entries.get(description.key) === entry) entries.delete(description.key);
        throw cause;
      });
    }
    const pack = await entry.promise; live(); validateResource(pack, description);
  }
  return {
    async preload(resources) {
      live(); if (!Array.isArray(resources)) throw error('invalid-resource-list', 'resources', 'Expected an array');
      await Promise.all(resources.filter(resource => Object.hasOwn(resource || {}, 'asset')).map(preloadOne));
    },
    instantiate(resource) {
      live(); const description = describe(resource), pack = entries.get(description.key)?.pack;
      if (!pack) throw error('asset-not-preloaded', description.path, 'Preload this exact resource before instantiation');
      validateResource(pack, description);
      try { return cloneInstance(pack); }
      catch (cause) { throw error('asset-instance-failed', description.path, cause.message || String(cause)); }
    },
    retainOnly(resources) {
      live();const keys=new Set(resources.filter(resource=>Object.hasOwn(resource||{},'asset')).map(resource=>describe(resource).key));
      for(const [key,entry]of entries)if(!keys.has(key)) {
        entries.delete(key);entry.abort.abort();if(entry.pack){releasePack(entry.pack);entry.pack=null;}
      }
    },
    snapshot(){return {cachedAssets:entries.size,loadedAssets:[...entries.values()].filter(entry=>entry.pack).length};},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) { entry.abort.abort(); if (entry.pack) releasePack(entry.pack); }
      entries.clear();
    },
  };
}
