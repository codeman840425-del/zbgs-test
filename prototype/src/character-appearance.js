import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFacialPalette, EYE_COLORS, LIP_COLORS } from './facial-palette.js';
import { HAIRSTYLES } from './hairstyle-catalog.js';
import { NO_HAIR_BODIES } from './no-hair-bodies.js';
import { hairFitIdentity, validateHairSelection, validateHairFitData } from './hair-fit-contract.js';
import { createHairSpring, validateHairSkin, validateHairEnvironmentColliders } from './hair-spring.js';

export const HAIR_COLORS = { original: null, black: '#343139', brown: '#805039', blonde: '#dab77a' };
// Presets inspected under the actual room's warm key light and ACES exposure.
export const SKIN_TONES = { original: null, warm: '#ddc5b4', deep: '#81685b' };
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/** Per-instance appearance only. No skeleton, geometry, motion or skin weights
 * are changed by tinting. Replacements require an exact body admission. */
export function createCharacterAppearance({ vrm, avatarSha256, validateHairChange }) {
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
  const pendingUpdates = new Set();
  let pendingStyleRequest=0, environmentColliders=[];
  function setEnvironmentColliders(proxies) {
    if(disposed)return;
    if(!Array.isArray(proxies))throw Error('环境碰撞列表无效');
    const same=proxies.length===environmentColliders.length && environmentColliders.every((proxy,i)=>proxy===proxies[i]);
    if(!same)environmentColliders=validateHairEnvironmentColliders(proxies).slice();
    for(const value of replacements.values()){
      if(disposed)break;
      value.dynamics?.setEnvironmentColliders(environmentColliders);
    }
  }

  // Mode changes visibility, never the user's selected style. Loading a cached
  // replacement while in base mode must not make it visible.
  function applyHairVisibility() {
    const effectiveStyle = bodyMode === 'base' ? 'none' : hairStyle;
    hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = effectiveStyle === 'original' && visible; });
    for (const [id, value] of replacements) {
      const visible=effectiveStyle===id;
      if(visible&&!value.scene.visible)value.dynamics?.reset();
      value.scene.visible=visible;
    }
  }
  function setBodyMode(mode) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    if (mode !== 'base' && mode !== 'dressed') return { applied: false, reason: '未知人体模式' };
    if (mode === 'base' && !canHideHair) return { applied: false, reason: '当前身体无发基础尚未准入或缺少独立头发网格' };
    if(bodyMode!==mode)revision++;
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
    value.dynamics?.dispose();
    value.scene.removeFromParent();
    const skeletons=new Set();value.scene.traverse(mesh=>{if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});
    skeletons.forEach(skeleton=>skeleton.dispose());
    value.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); materialsOf(mesh).forEach(m => m.dispose()); } });
  }
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  async function pinnedJson(url, sha256) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`发型数据加载失败 (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (await digest(bytes) !== sha256) throw Error('发型数据版本不一致');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function loadReplacement(entry) {
    const manifest = await pinnedJson(entry.manifestUrl,entry.manifestSha256);
    if (manifest.schema !== 'character-hairstyle-v1' || manifest.id !== entry.id ||
        manifest.mount !== 'head' || manifest.headLocal !== true || !['rigid','vrm-spring'].includes(manifest.physics) ||
        manifest.sha256 !== entry.assetSha256 || manifest.sourceMaterial !== entry.sourceMaterial ||
        !manifest.compatibleBodies.includes(avatarSha256))
      throw new Error('发型与当前身体未通过兼容检查');
    let attachment = null, rawBone = null, fit = null;
    if (entry.fit) {
      if (!manifest.fit || Object.keys(entry.fit).some(k=>manifest.fit[k]!==entry.fit[k])) throw Error('发型清单适配版本不一致');
      fit = await pinnedJson(entry.fit.url,entry.fit.sha256);
      attachment = validateHairFitData(fit,entry,avatarSha256,manifest); rawBone = fit.rawBone;
    } else if (manifest.fit || !entry.legacyImplicitFit || manifest.physics!=='rigid') throw Error('发型缺少已登记适配');
    const head = vrm.humanoid.getRawBoneNode('head');
    if (!head || (rawBone && head.name !== rawBone)) throw Error('人物头部挂点缺失或与适配不一致');
    const asset = await fetch(manifest.url);
    if (!asset.ok) throw new Error(`发型资源加载失败 (${asset.status})`);
    const bytes = await asset.arrayBuffer();
    const sha = await digest(bytes);
    if (sha !== manifest.sha256) throw new Error('发型资源身份不一致');
    const isSourceMaterial = m => m.name === manifest.sourceMaterial || (m.name === manifest.sourceMaterial + ' (Outline)' && m.isOutline === true);
    const source = [...hair].filter(isSourceMaterial);
    if (!source.length || !hairMeshes.length || mixedHairMesh || hairMeshes.some(({mesh})=>materialsOf(mesh).some(m=>!isSourceMaterial(m)))) throw new Error('原发型材质/独立网格缺失或隐藏范围不匹配');
    const gltf = await new GLTFLoader().parseAsync(bytes, manifest.url.slice(0, manifest.url.lastIndexOf('/') + 1));
    const meshes = []; gltf.scene.traverse(node=>{if(node.isMesh)meshes.push(node);});
    const materialBase=new Map(), importedMaterials=new Set(meshes.flatMap(materialsOf));
    const importedTextures=new Set();
    for(const m of importedMaterials)for(const value of Object.values(m))if(value?.isTexture)importedTextures.add(value);
    const releaseImported=()=>{importedMaterials.forEach(m=>m.dispose());importedTextures.forEach(t=>t.dispose());};
    try {
      if(manifest.physics==='vrm-spring')validateHairSkin(gltf.scene,meshes);
      else if(meshes.length!==1||meshes[0].isSkinnedMesh)throw Error('刚性发型应为单个独立网格');
      if(meshes.some(m=>Object.keys(m.geometry.morphAttributes).length)||gltf.animations.length||
        !gltf.scene.position.equals(new THREE.Vector3()) || !gltf.scene.quaternion.equals(new THREE.Quaternion()) || !gltf.scene.scale.equals(new THREE.Vector3(1,1,1)))throw Error('发型包含未登记的变形或场景变换');
      if (attachment) {
        gltf.scene.position.fromArray(attachment.position); gltf.scene.quaternion.fromArray(attachment.quaternion); gltf.scene.scale.fromArray(attachment.scale);
        gltf.scene.updateMatrix();
      }
      for(const mesh of meshes){
        // Track each clone before the next one is attempted. A later outline
        // clone can fail before any of these materials are assigned to mesh.
        const cloned=source.map(m=>{const c=m.clone();materialBase.set(c,originals.get(m));return c;});
        mesh.material=cloned.length===1?cloned[0]:cloned;
        mesh.geometry.clearGroups();
        cloned.forEach((m,i)=>mesh.geometry.addGroup(0,mesh.geometry.index?.count??mesh.geometry.attributes.position.count,i));
        mesh.castShadow=true;mesh.frustumCulled=false;mesh.userData.assetRole='hair';
      }
    } catch(error) {
      new Set(meshes.map(m=>m.geometry)).forEach(g=>g.dispose());
      new Set(meshes.filter(m=>m.isSkinnedMesh).map(m=>m.skeleton)).forEach(s=>s.dispose());
      materialBase.forEach((_,m)=>m.dispose());releaseImported();throw error;
    }
    releaseImported();
    return {scene:gltf.scene,materialBase,sha256:sha,hairFit:hairFitIdentity(entry),springConfig:fit?.dynamics??null};
  }

  // Equipped headwear can depend on exact hair geometry. Recheck immediately
  // before either commit path: a hat may have equipped while decoding waited.
  function assertHairChange(style) {
    const entry = validateHairSelection(avatarSha256, style);
    validateHairChange?.({ hairStyle: style, replacementSHA256: entry?.assetSha256 ?? null,
      hairFit: entry ? hairFitIdentity(entry) : null });
  }
  async function prepareUpdate(input = {}, {trackIntent=false}={}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const desiredStyle = input.reset ? 'original' : input.hairStyle ?? hairStyle;
    const desiredColor = input.reset ? 'original' : input.hairColor ?? hairColor;
    const desiredSkin = input.reset ? 'original' : input.skinTone ?? skinTone;
    if (!(desiredColor in HAIR_COLORS) || !(desiredSkin in SKIN_TONES)) return { applied: false, reason: '未知颜色预设' };
    if ((input.eyeColor !== undefined && !(input.eyeColor in EYE_COLORS)) || (input.lipColor !== undefined && !(input.lipColor in LIP_COLORS)))
      return {applied:false,reason:'未知瞳色或唇色'};
    if (desiredStyle !== 'original' && !(desiredStyle === 'none' && canHideHair) && !admittedStyles.some(entry => entry.id === desiredStyle))
      return { applied: false, reason: '该发型尚未适配当前身体；请使用可选款式' };
    try { validateHairSelection(avatarSha256,desiredStyle,input); assertHairChange(desiredStyle); }
    catch(e) { return {applied:false,reason:e.message}; }
    const requestRevision = ++revision;
    const changeStyle=!trackIntent||input.reset||input.hairStyle!==undefined;
    const styleRequest=changeStyle?++generation:generation;
    if(changeStyle)pendingStyleRequest=0;
    // Standalone hair/color controls retain their independent intents. A whole
    // recipe never lends its staged hair selection to a newer color request.
    const applyStyleIntent=()=>{
      if(!trackIntent||!changeStyle||disposed||styleRequest!==generation)return;
      assertHairChange(desiredStyle);
      hairStyle=desiredStyle;replacement=replacements.get(desiredStyle)||null;
      applyColors();applyHairVisibility();
    };
    error=null;loading=true;
    let paletteUpdate=null;
    try {
      if (!['original','none'].includes(desiredStyle)&&!replacements.has(desiredStyle)) {
        if (!replacementPromises.has(desiredStyle)) replacementPromises.set(desiredStyle, loadReplacement(admittedStyles.find(entry => entry.id === desiredStyle)).then(value => {
          if (disposed) { releaseReplacement(value); return null; }
          try {
            value.scene.visible = false;vrm.humanoid.getRawBoneNode('head').add(value.scene);
            if(disposed){releaseReplacement(value);return null;}
            if(value.springConfig)value.dynamics=createHairSpring({vrm,scene:value.scene,config:value.springConfig,environmentColliders});
            value.dynamics?.reset();
            if(disposed){releaseReplacement(value);return null;}
            replacements.set(desiredStyle,value);
          }catch(error){releaseReplacement(value);throw error;}
          return value;
        }).finally(() => { replacementPromises.delete(desiredStyle); }));
        if(trackIntent)pendingStyleRequest=styleRequest;
        try{await replacementPromises.get(desiredStyle);}
        finally{if(pendingStyleRequest===styleRequest)pendingStyleRequest=0;}
      }
      if(disposed||revision!==requestRevision){applyStyleIntent();return{applied:false,cancelled:true};}
      // Mask decoding and texture creation happen before any selected material
      // or visible hair changes. Cached variants never rewrite a live texture.
      paletteUpdate=await facialPalette.prepareUpdate(input,{trackIntent});
      if(!paletteUpdate.commit){loading=false;return paletteUpdate;}
      if(disposed||revision!==requestRevision){paletteUpdate.dispose();applyStyleIntent();return{applied:false,cancelled:true};}
      if(desiredColor!=='original'){
        for(const material of hair){const base=originals.get(material);neutralTexture(base.map);neutralTexture(base.shadeMap);}
        for(const value of replacements.values())for(const base of value.materialBase.values()){neutralTexture(base.map);neutralTexture(base.shadeMap);}
      }
      let live=true;
      const update={
        isCurrent:()=>live&&!disposed&&revision===requestRevision&&paletteUpdate.isCurrent(),
        applyStyleIntent,
          validateCommit(){
          if(!update.isCurrent())throw Error('外观准备已过期');
          if(changeStyle)assertHairChange(desiredStyle);
          },
          commit(){
            update.validateCommit();
          paletteUpdate.commit();
          if(changeStyle){hairStyle=desiredStyle;replacement=replacements.get(desiredStyle)||null;}
          hairColor=desiredColor;skinTone=desiredSkin;applyColors();applyHairVisibility();
          loading=false;live=false;pendingUpdates.delete(update);return{applied:true};
        },
        dispose(){
          if(!live)return;live=false;pendingUpdates.delete(update);paletteUpdate.dispose();
          if(revision===requestRevision)loading=false;
        },
      };
      pendingUpdates.add(update);return update;
    } catch (e) {
      paletteUpdate?.dispose();
      if (disposed || revision !== requestRevision) return { applied: false, cancelled: true };
      error = e.message; loading = false;
      return { applied: false, reason: e.message };
    } finally {
      if(revision===requestRevision&&!pendingUpdates.size)loading=false;
    }
  }
  async function set(input={}){
    const update=await prepareUpdate(input,{trackIntent:true});
    if(!update.commit)return update;
    try{
      if(update.isCurrent())return update.commit();
      update.applyStyleIntent();return{applied:false,cancelled:true};
    }
    finally{update.dispose();}
  }
  return {
    set, prepareUpdate, setBodyMode, setEnvironmentColliders,
    updateDynamics:(dt,enabled=true)=>{if(replacement?.scene.visible)replacement.dynamics?.update(dt,enabled);},
    resetDynamics:()=>{for(const value of replacements.values())value.dynamics?.reset();},
    getState: () => ({ hairStyle, hairColor, skinTone, loading:loading||pendingStyleRequest!==0, error, bodyMode, revision,
      effectiveHairStyle: bodyMode === 'base' ? 'none' : hairStyle,
      noHairAdmission: canHideHair ? { ...noHairAdmission } : null, ...facialPalette.getState(),
      availableStyles: ['original', ...(canHideHair ? ['none'] : []), ...admittedStyles.map(entry => entry.id)],
      styleOptions: [{id:'original',label:'原发型'}, ...(canHideHair ? [{id:'none',label:'无发（保留眉睫毛）'}] : []), ...admittedStyles.map(({id,label}) => ({id,label}))],
      skinMaterialCount: skin.size, hairMaterialCount: hair.size, neutralTextureCount: grayTextures.size,
      hairFit: replacement ? { ...replacement.hairFit } : null, replacementSHA256: replacement?.sha256 ?? null,
      hairDynamics:replacement?.dynamics?.getState()??null }),
    dispose() {
      if(disposed)return;
      disposed = true; generation++;revision++;loading=false;pendingStyleRequest=0;environmentColliders=[];
      for(const update of pendingUpdates)update.dispose();
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
