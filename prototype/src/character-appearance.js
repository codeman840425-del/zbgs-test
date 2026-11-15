import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFacialPalette, EYE_COLORS, LIP_COLORS } from './facial-palette.js';
import { HAIRSTYLES } from './hairstyle-catalog.js';
import { NO_HAIR_BODIES } from './no-hair-bodies.js';

export const HAIR_COLORS = { original: null, black: '#343139', brown: '#805039', blonde: '#dab77a' };
// Presets inspected under the actual room's warm key light and ACES exposure.
export const SKIN_TONES = { original: null, warm: '#ddc5b4', deep: '#81685b' };
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/** Per-instance appearance only. No skeleton, geometry, motion or skin weights
 * are changed by tinting. Replacements require an exact body admission. */
export function createCharacterAppearance({ vrm, avatarSha256 }) {
  const facialPalette = createFacialPalette({vrm, avatarSha256});
  const admittedStyles = HAIRSTYLES.filter(entry => entry.compatibleBodies.includes(avatarSha256));
  const skin = new Set(), hair = new Set(), hairMeshes = [];
  let mixedHairMesh = false;
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const materials = materialsOf(mesh);
    if (materials.some(m => /_HAIR/.test(m.name)) && !materials.every(m => /_HAIR/.test(m.name))) mixedHairMesh = true;
    for (const m of materials) {
      if (/_(Body|Face)_\d+_SKIN/.test(m.name)) skin.add(m);
      if (/_HAIR|_FaceBrow_/.test(m.name)) hair.add(m);
    }
    if (materials.length && materials.every(m => /_HAIR/.test(m.name))) hairMeshes.push({ mesh, visible: mesh.visible });
  });
  const noHairAdmission = NO_HAIR_BODIES.find(entry => entry.sha256 === avatarSha256);
  const canHideHair = Boolean(noHairAdmission && hairMeshes.length && !mixedHairMesh);
  let bodyMode = 'dressed';
  const originals = new Map([...skin, ...hair].map(m => [m, {
    color: m.color?.clone(), shade: m.shadeColorFactor?.clone(), map: m.map, shadeMap: m.shadeMultiplyTexture,
  }]));
  const grayTextures = new Map();
  let hairStyle = 'original', hairColor = 'original', skinTone = 'original';
  let replacement = null, generation = 0, revision = 0, disposed = false, loading = false, error = null;
  const replacements = new Map(), replacementPromises = new Map();

  // Mode changes visibility, never the user's selected style. Loading a cached
  // replacement while in base mode must not make it visible.
  function applyHairVisibility() {
    const effectiveStyle = bodyMode === 'base' ? 'none' : hairStyle;
    hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = effectiveStyle === 'original' && visible; });
    for (const [id, value] of replacements) value.scene.visible = effectiveStyle === id;
  }
  function setBodyMode(mode) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    if (mode !== 'base' && mode !== 'dressed') return { applied: false, reason: '未知人体模式' };
    if (mode === 'base' && !canHideHair) return { applied: false, reason: '当前身体无发基础尚未准入或缺少独立头发网格' };
    bodyMode = mode; applyHairVisibility();
    return { applied: true };
  }
  function neutralTexture(texture) {
    if (!texture) return null;
    if (grayTextures.has(texture)) return grayTextures.get(texture);
    const image = texture.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      // Retain authored value detail and alpha without multiplying brown by cyan.
      const value = Math.max(data.data[i], data.data[i + 1], data.data[i + 2]);
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
    }
    context.putImageData(data, 0, 0);
    const result = texture.clone();
    // Texture.clone shares Source; detach it before replacing pixels so restore
    // and other materials retain the original image data.
    result.source = new THREE.Source(canvas); result.needsUpdate = true;
    grayTextures.set(texture, result);
    return result;
  }
  function tintHair(m, base) {
    if (!base.color) return;
    const tint = HAIR_COLORS[hairColor];
    m.map = tint ? neutralTexture(base.map) : base.map;
    if ('shadeMultiplyTexture' in m) m.shadeMultiplyTexture = tint ? neutralTexture(base.shadeMap) : base.shadeMap;
    m.color.copy(base.color);
    if (tint) m.color.set(tint);
    if (base.shade) {
      m.shadeColorFactor.copy(base.shade);
      if (tint) m.shadeColorFactor.set(tint).multiplyScalar(Math.max(base.shade.r, base.shade.g, base.shade.b));
    }
    m.needsUpdate = true;
  }
  function applyColors() {
    for (const m of hair) tintHair(m, originals.get(m));
    for (const value of replacements.values()) value.scene.traverse(mesh => {
      if (mesh.isMesh) for (const m of materialsOf(mesh)) tintHair(m, value.materialBase.get(m));
    });
    for (const m of skin) {
      const base = originals.get(m), tint = SKIN_TONES[skinTone];
      if (base.color) { m.color.copy(base.color); if (tint) m.color.multiply(new THREE.Color(tint)); }
      if (base.shade) { m.shadeColorFactor.copy(base.shade); if (tint) m.shadeColorFactor.multiply(new THREE.Color(tint)); }
    }
  }
  function releaseReplacement(value) {
    if (!value) return;
    value.scene.removeFromParent();
    value.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); materialsOf(mesh).forEach(m => m.dispose()); } });
  }
  async function loadReplacement(entry) {
    const response = await fetch(entry.manifestUrl);
    if (!response.ok) throw new Error(`发型清单加载失败 (${response.status})`);
    const manifest = await response.json();
    if (manifest.schema !== 'character-hairstyle-v1' || manifest.id !== entry.id ||
        manifest.mount !== 'head' || manifest.headLocal !== true || !manifest.compatibleBodies.includes(avatarSha256))
      throw new Error('发型与当前身体未通过兼容检查');
    const asset = await fetch(manifest.url);
    if (!asset.ok) throw new Error(`发型资源加载失败 (${asset.status})`);
    const bytes = await asset.arrayBuffer();
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (sha !== manifest.sha256) throw new Error('发型资源身份不一致');
    const source = [...hair].filter(m => m.name === manifest.sourceMaterial);
    if (!source.length || !hairMeshes.length) throw new Error('原发型材质/独立网格缺失');
    const gltf = await new GLTFLoader().parseAsync(bytes, manifest.url.slice(0, manifest.url.lastIndexOf('/') + 1));
    const materialBase = new Map(), oldMaterials = new Set();
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      materialsOf(mesh).forEach(m => oldMaterials.add(m));
      // This export has one surface. Reuse the original MToon surface and its
      // outline draw group; do not substitute a different lighting model.
      const cloned = source.map(m => { const c = m.clone(); materialBase.set(c, originals.get(m)); return c; });
      mesh.material = cloned.length === 1 ? cloned[0] : cloned;
      mesh.geometry.clearGroups();
      cloned.forEach((m, i) => mesh.geometry.addGroup(0, mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count, i));
      mesh.castShadow = true; mesh.frustumCulled = false;
      mesh.userData.assetRole = 'hair';
    });
    const textures = new Set();
    for (const m of oldMaterials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
    textures.forEach(t => t.dispose());
    return { scene: gltf.scene, materialBase, sha256: sha };
  }
  async function set(input = {}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const desiredStyle = input.reset ? 'original' : input.hairStyle ?? hairStyle;
    const desiredColor = input.reset ? 'original' : input.hairColor ?? hairColor;
    const desiredSkin = input.reset ? 'original' : input.skinTone ?? skinTone;
    if (!(desiredColor in HAIR_COLORS) || !(desiredSkin in SKIN_TONES)) return { applied: false, reason: '未知颜色预设' };
    if ((input.eyeColor !== undefined && !(input.eyeColor in EYE_COLORS)) || (input.lipColor !== undefined && !(input.lipColor in LIP_COLORS)))
      return {applied:false,reason:'未知瞳色或唇色'};
    if (desiredStyle !== 'original' && !(desiredStyle === 'none' && canHideHair) && !admittedStyles.some(entry => entry.id === desiredStyle))
      return { applied: false, reason: '该发型尚未适配当前身体；请使用可选款式' };
    // Commit independent color intent before awaiting any asset. An older reset
    // must never resume later and overwrite a newer hair/skin selection.
    revision++; hairColor = desiredColor; skinTone = desiredSkin; applyColors();
    const jobs = [];
    if (input.eyeColor !== undefined || input.lipColor !== undefined || input.reset) jobs.push(facialPalette.set(input));
    if (input.hairStyle !== undefined || input.reset) jobs.push(setStyle(desiredStyle));
    const results = await Promise.all(jobs);
    return results.find(result => !result.applied) || {applied:true};
  }
  async function setStyle(desiredStyle) {
    const request = ++generation;
    error = null;
    if (desiredStyle === 'original' || desiredStyle === 'none') {
      hairStyle = desiredStyle; replacement = null; loading = false;
      applyHairVisibility();
      return { applied: true };
    }
    loading = true;
    try {
      if (!replacements.has(desiredStyle)) {
        if (!replacementPromises.has(desiredStyle)) replacementPromises.set(desiredStyle, loadReplacement(admittedStyles.find(entry => entry.id === desiredStyle)).then(value => {
          if (disposed) { releaseReplacement(value); return null; }
          replacements.set(desiredStyle, value); value.scene.visible = false;
          vrm.humanoid.getRawBoneNode('head').add(value.scene);
          return value;
        }).finally(() => { replacementPromises.delete(desiredStyle); }));
        await replacementPromises.get(desiredStyle);
      }
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      replacement = replacements.get(desiredStyle);
      hairStyle = desiredStyle; loading = false;
      applyColors(); applyHairVisibility();
      return { applied: true };
    } catch (e) {
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      if (request === generation) { error = e.message; loading = false; }
      return { applied: false, reason: e.message };
    }
  }
  return {
    set, setBodyMode,
    getState: () => ({ hairStyle, hairColor, skinTone, loading, error, bodyMode, revision,
      effectiveHairStyle: bodyMode === 'base' ? 'none' : hairStyle,
      noHairAdmission: canHideHair ? { ...noHairAdmission } : null, ...facialPalette.getState(),
      availableStyles: ['original', ...(canHideHair ? ['none'] : []), ...admittedStyles.map(entry => entry.id)],
      styleOptions: [{id:'original',label:'原发型'}, ...(canHideHair ? [{id:'none',label:'无发（保留眉睫毛）'}] : []), ...admittedStyles.map(({id,label}) => ({id,label}))],
      skinMaterialCount: skin.size, hairMaterialCount: hair.size, neutralTextureCount: grayTextures.size,
      replacementSHA256: replacement?.sha256 ?? null }),
    dispose() {
      disposed = true; generation++;
      facialPalette.dispose();
      replacements.forEach(releaseReplacement); replacements.clear(); replacement = null;
      for (const [m, base] of originals) {
        if (base.color) m.color.copy(base.color);
        if (base.shade) m.shadeColorFactor.copy(base.shade);
        m.map = base.map;
        if ('shadeMultiplyTexture' in m) m.shadeMultiplyTexture = base.shadeMap;
      }
      hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = visible; });
      grayTextures.forEach(t => t.dispose()); grayTextures.clear();
    },
  };
}
