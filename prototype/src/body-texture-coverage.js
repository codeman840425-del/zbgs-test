import * as THREE from 'three';
import {BODY_TEXTURE_COVERAGE_ADMISSIONS} from './body-texture-coverage-admissions.js';

// Only separately admitted and profile-pinned native pixel contracts are loaded.
// It owns map references only: no geometry, RGB tint, alphaTest or shader changes.
const owners = new WeakMap();
const check = (value, message) => { if (!value) throw Error(`Body texture coverage: ${message}`); };
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

export async function createBodyTextureCoverage({body, avatarSha256, entries, descriptor}) {
  if (!descriptor) return null;
  check(BODY_TEXTURE_COVERAGE_ADMISSIONS.some(item => item.avatarSha256 === avatarSha256), 'unsupported avatar identity');
  check(Array.isArray(body) && body.length === 1, 'expected one exact Body primitive');
  check(Array.isArray(entries) && entries.length > 0, 'missing equipment catalog');
  check(typeof descriptor.url === 'string' && /^[a-f0-9]{64}$/.test(descriptor.sha256), 'invalid descriptor');
  const admission = BODY_TEXTURE_COVERAGE_ADMISSIONS.find(item =>
    item.avatarSha256 === avatarSha256 && item.manifestSha256 === descriptor.sha256);
  check(admission, 'unadmitted manifest for avatar');
  const baseURL = new URL(descriptor.url, globalThis.location?.href ?? 'http://localhost/');
  const read = async (url, expected) => {
    const response = await fetch(url);
    check(response.ok, `resource HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    check(await digest(bytes) === expected, 'resource identity mismatch');
    return bytes;
  };
  const manifestBytes = await read(baseURL.href, descriptor.sha256);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  check(manifest.schema === 'native-body-texture-coverage-v1' && manifest.avatarSha256 === avatarSha256,
    'manifest/target identity mismatch');
  check(manifest.basePngSha256 === admission.basePngSha256 && manifest.covered?.sha256 === admission.maskedPngSha256 &&
    manifest.rgbPreserved === true && manifest.width === 2048 && manifest.height === 2048 &&
    manifest.alphaTest === 0.5, 'unverified native pixel contract');
  check(typeof manifest.materialName === 'string' && manifest.materialName.length > 0, 'missing Body material');
  const rules = new Map();
  check(Array.isArray(manifest.equipment) && manifest.equipment.length > 0, 'missing equipment rules');
  for (const rule of manifest.equipment) {
    check(typeof rule.id === 'string' && !rules.has(rule.id) && /^[a-f0-9]{64}$/.test(rule.sha256) &&
      ['top', 'bottom', 'shoes'].includes(rule.slot) &&
      rule.covered === (rule.slot === 'top') && typeof rule.required === 'boolean', 'invalid equipment rule');
    rules.set(rule.id, rule);
  }
  // Independent socks keep the original mask and its signed identity.
  for (const rule of admission.optionalUncoveredEquipment ?? []) {
    check(rule.slot === 'socks' && rule.covered === false && rule.required === false && !rules.has(rule.id),
      'invalid extra uncovered equipment');
    rules.set(rule.id, rule);
  }
  const catalog = new Map();
  for (const entry of entries) {
    const rule = rules.get(entry.id);
    check(rule && !catalog.has(entry.id) && entry.compatibleAvatarSha256 === avatarSha256 &&
      entry.sha256 === rule.sha256 && entry.slot === rule.slot, 'unknown or incompatible equipment');
    catalog.set(entry.id, rule);
  }
  for (const rule of rules.values()) check(!rule.required || catalog.has(rule.id), 'required equipment missing');
  const records = [...new Set(materialsOf(body[0]))].map(material => {
    check(material?.isMToonMaterial === true && typeof material.update === 'function' &&
      [manifest.materialName, manifest.materialName + ' (Outline)'].includes(material.name), 'Body MToon material mismatch');
    check(!owners.has(material), 'Body material already owned');
    const map = material.map, shadeMap = material.shadeMultiplyTexture;
    for (const source of [map, shadeMap]) check(source?.isTexture &&
      source.image?.width === manifest.width && source.image?.height === manifest.height &&
      source.flipY === false && source.colorSpace === THREE.SRGBColorSpace &&
      source.wrapS === THREE.RepeatWrapping && source.wrapT === THREE.RepeatWrapping &&
      source.minFilter === THREE.LinearFilter && source.magFilter === THREE.LinearFilter &&
      source.generateMipmaps === false && source.channel === 0 &&
      source.offset.x === 0 && source.offset.y === 0 && source.repeat.x === 1 && source.repeat.y === 1 && source.rotation === 0,
    'original texture sampler mismatch');
    check(material.alphaTest === manifest.alphaTest && material.transparent === false, 'original alpha contract mismatch');
    return {material, map, shadeMap};
  });
  check(records.length >= 1 && records.length <= 2 && records.some(r => !r.material.isOutline), 'missing Body surface');
  const token = {};
  records.forEach(r => owners.set(r.material, token));
  const textures = new Map();
  let bitmap = null, disposed = false, covered = false, activeIds = [], revision = 0;
  let skinMaps = null, skinRevision = 0;
  const pending = new Set(), cleanupErrors = [];
  const selectedMap = (map, useCovered, variant) => variant
    ? (useCovered ? variant.covered : variant.base).get(map)
    : useCovered ? textures.get(map) : map;
  const expectedMap = (record, key = 'map') => selectedMap(record[key], covered, skinMaps);
  const assertLiveState = () => {
    check(!disposed, 'owner disposed');
    for (const record of records) check(owners.get(record.material) === token &&
      record.material.map === expectedMap(record) && record.material.shadeMultiplyTexture === expectedMap(record, 'shadeMap') &&
      record.material.alphaTest === manifest.alphaTest && record.material.transparent === false,
    'Body material changed outside its owner');
  };
  const cleanup = () => {
    for (const texture of textures.values()) {
      try { texture.dispose(); } catch (error) { cleanupErrors.push(String(error)); }
    }
    textures.clear();
    try { bitmap?.close(); } catch (error) { cleanupErrors.push(String(error)); }
    bitmap = null;
    records.forEach(r => { if (owners.get(r.material) === token) owners.delete(r.material); });
  };
  // Clone only for a staging update(0): all work that may fail happens before
  // publishing map references. No source or live material is disposed here.
  const assignMaps = (material, record, useCovered, variant) => {
    material.map = selectedMap(record.map, useCovered, variant);
    material.shadeMultiplyTexture = selectedMap(record.shadeMap, useCovered, variant);
  };
  const stageMaterials = (useCovered, variant = skinMaps) => {
    const staged = [];
    try {
      for (const record of records) {
        const material = record.material.clone(); staged.push(material);
        assignMaps(material, record, useCovered, variant);
        check(material.map?.isTexture && material.shadeMultiplyTexture?.isTexture, 'missing staged Body maps');
        material.update(0);
      }
    } finally { staged.forEach(material => material.dispose()); }
  };
  try {
    const pngURL = new URL(manifest.covered.url, baseURL);
    check(pngURL.origin === baseURL.origin, 'cross-origin texture resource');
    const bytes = await read(pngURL.href, manifest.covered.sha256);
    // Same no-premultiply/no-colour-conversion decode policy as ImageBitmapLoader.
    bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}),
      {premultiplyAlpha:'none', colorSpaceConversion:'none', imageOrientation:'none'});
    check(bitmap.width === manifest.width && bitmap.height === manifest.height, 'decoded texture size mismatch');
    for (const map of new Set(records.flatMap(record => [record.map, record.shadeMap]))) {
      const texture = map.clone();
      texture.source = new THREE.TextureSource(bitmap); texture.needsUpdate = true;
      textures.set(map, texture);
    }
    assertLiveState(); stageMaterials(true); stageMaterials(false);
  } catch (error) { cleanup(); throw error; }

  function applyMaps(useCovered, variant) {
    assertLiveState();
    const previous = records.map(record => [record.material.map, record.material.shadeMultiplyTexture]);
    try {
      for (const record of records) {
        assignMaps(record.material, record, useCovered, variant);
        record.material.needsUpdate = true;
        record.material.update(0);
      }
    } catch (error) {
      records.forEach((record, index) => {
        [record.material.map, record.material.shadeMultiplyTexture] = previous[index];
        record.material.needsUpdate = true;
        try { record.material.update(0); } catch (restoreError) { cleanupErrors.push(String(restoreError)); }
      });
      throw error;
    }
  }

  function isLive() {
    try { assertLiveState(); return true; } catch { return false; }
  }

  function prepareSkinTone(nextMaps) {
    assertLiveState();
    stageMaterials(false, nextMaps);
    stageMaterials(true, nextMaps);
    const ticket = ++skinRevision;
    let live = true, committed = false, previousMaps;
    const update = {
      isCurrent: () => live && ticket === skinRevision && isLive(),
      commit() {
        check(update.isCurrent(), 'prepared skin tone superseded or disposed');
        previousMaps = skinMaps;
        applyMaps(covered, nextMaps);
        skinMaps = nextMaps;
        live = false; committed = true; pending.delete(update);
      },
      rollback() {
        if (!committed || disposed || ticket !== skinRevision) return;
        applyMaps(covered, previousMaps);
        skinMaps = previousMaps;
        committed = false;
      },
      dispose() { live = false; pending.delete(update); },
    };
    pending.add(update);
    return update;
  }

  function prepareEquipmentSet(ids) {
    assertLiveState();
    check(Array.isArray(ids) && new Set(ids).size === ids.length, 'duplicate/invalid equipment set');
    const selectedIds = [...ids];
    const slots = new Set();
    const selected = selectedIds.map(id => {
      const rule = catalog.get(id);
      check(rule && !slots.has(rule.slot), 'unknown equipment or conflicting slot');
      slots.add(rule.slot); return rule;
    });
    const nextCovered = selected.some(rule => rule.covered);
    stageMaterials(nextCovered);
    const ticket = ++revision;
    let live = true, committed = false, rolledBack = false;
    const previousCovered = covered, previousActiveIds = activeIds.slice();
    const update = {
      isCurrent: () => live && ticket === revision && isLive(),
      commit() {
        check(update.isCurrent(), 'prepared update superseded or disposed');
        // Appearance and outfit may be staged together. Both states of every
        // prepared tone have been validated by the same material owner.
        try { applyMaps(nextCovered, skinMaps); }
        catch (error) { live = false; pending.delete(update); throw error; }
        covered = nextCovered; activeIds = [...selectedIds]; committed = true; live = false; pending.delete(update);
      },
      rollback() {
        if (!committed || rolledBack) return;
        applyMaps(previousCovered, skinMaps);
        covered = previousCovered; activeIds = previousActiveIds; revision++; rolledBack = true;
      },
      dispose() { live = false; pending.delete(update); },
    };
    pending.add(update); return update;
  }
  return {
    prepareEquipmentSet, prepareSkinTone,
    skinToneSources(part, manifestSha256) {
      assertLiveState();
      check(manifestSha256 === descriptor.sha256 && part.materialName === manifest.materialName &&
        part.width === manifest.width && part.height === manifest.height, 'skin tone Body/coverage mismatch');
      return new Map(textures);
    },
    getInfo: () => ({schema:manifest.schema, avatarSha256, covered, activeIds:[...activeIds],
      maskedPngSha256:admission.maskedPngSha256, ownedTextures:textures.size, materialCount:records.length,
      pendingUpdates:pending.size, disposed, cleanupErrors:[...cleanupErrors],
      scope:'Pinned native Body RGBA states; geometry/contact surfaces unchanged'}),
    dispose() {
      if (disposed) return;
      disposed = true; revision++;
      for (const update of [...pending]) update.dispose();
      for (const record of records) {
        record.material.map = record.map; record.material.shadeMultiplyTexture = record.shadeMap;
        record.material.needsUpdate = true;
        try { record.material.update(0); } catch (error) { cleanupErrors.push(String(error)); }
      }
      covered = false; activeIds = []; skinMaps = null; cleanup();
    },
  };
}
