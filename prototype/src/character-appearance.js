import {readAccessoryTransactionContext,assertAccessoryTransactionCommit} from './accessory-transaction-context.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFacialPalette, EYE_COLORS, LIP_COLORS } from './facial-palette.js';
import { HAIRSTYLES } from './hairstyle-catalog.js';
import { NO_HAIR_BODIES } from './no-hair-bodies.js';
import { hairFitIdentity, validateHairSelection, validateHairFitData, prepareHairRegionColorway, verifyRegionPrimitive } from './hair-fit-contract.js';
import { createHairSpring, validateHairSkin, validateHairEnvironmentColliders } from './hair-spring.js';
import { assertAppearanceColorSelection } from './appearance-color-policy.js';
import {fittedHeadAppearance} from './fitted-head-appearance.js';
import {nativePaletteContract} from './native-palette-catalog.js';
import {createNativeEyebrowPalette} from './native-eyebrow-palette.js';
import { loadNativeHairAttachment } from './native-hair-attachment.js';
import {nativeSkinToneContract} from './native-skin-tone-contract.js';
import {nativeLipColorContract} from './native-lip-color-contract.js';
import {createNativeSkinTone} from './native-skin-tone.js';
import {createNeutralHairTextures, neutralHairImageKeys} from './neutral-hair-textures.js';

export const HAIR_COLORS = { original: null, black: '#343139', brown: '#805039', blonde: '#dab77a' };
// Presets inspected under the actual room's warm key light and ACES exposure.
export const SKIN_TONES = { original: null, warm: '#ddc5b4', deep: '#81685b' };
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/** Per-instance appearance only. No skeleton, geometry, motion or skin weights
 * are changed by tinting. Replacements require an exact body admission. */
export function createCharacterAppearance({ vrm, avatarSha256, renderer, parser, validateHairChange, preserveHairInBaseMode = false, bodyTextureCoverage }) {
  const facialPalette = createFacialPalette({vrm, avatarSha256});
  const skinContract = nativeSkinToneContract(avatarSha256);
  const skinMultipliers = fittedHeadAppearance(avatarSha256)?.colors.skinTone ?? SKIN_TONES;
  const lipContract = nativeLipColorContract(avatarSha256);
  const nativeSkin = skinContract ? createNativeSkinTone({vrm, contract:skinContract, coverage:bodyTextureCoverage, lipContract}) : null;
  const nativeEyebrow = nativePaletteContract(avatarSha256)?.eyebrow
    ? createNativeEyebrowPalette({vrm,avatarSha256,contract:{...nativePaletteContract(avatarSha256).eyebrow,bodySha256:avatarSha256,sourceManifestSha256:nativePaletteContract(avatarSha256).eyebrow.sourceManifestSha256,colors:{eyebrowColor:nativePaletteContract(avatarSha256).colors.eyebrowColor}}})
    : null;
  const admittedStyles = HAIRSTYLES.filter(entry => entry.compatibleBodies.includes(avatarSha256));
  const skin = new Set(), hair = new Set(), hairMeshes = [];
  let mixedHairMesh = false;
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const materials = materialsOf(mesh);
    if (materials.some(m => /_HAIR/.test(m.name)) && !materials.every(m => /_HAIR/.test(m.name))) mixedHairMesh = true;
    for (const m of materials) {
      if (/_(Body|Face)_\d+_SKIN/.test(m.name)) skin.add(m);
      if (/_HAIR/.test(m.name) || (/_FaceBrow_/.test(m.name) && !nativeEyebrow)) hair.add(m);
    }
    if (materials.length && materials.every(m => /_HAIR/.test(m.name))) hairMeshes.push({ mesh, visible: mesh.visible });
  });
  const noHairAdmission = NO_HAIR_BODIES.find(entry => entry.sha256 === avatarSha256);
  const canHideHair = Boolean(noHairAdmission && hairMeshes.length && !mixedHairMesh);
  let bodyMode = 'dressed';
  const tintableSkin = nativeSkin ? [] : [...skin];
  const originals = new Map([...tintableSkin, ...hair].map(m => [m, {
    color: m.color?.clone(), shade: m.shadeColorFactor?.clone(), map: m.map, shadeMap: m.shadeMultiplyTexture,
  }]));
  const grayTextures = createNeutralHairTextures(renderer, neutralHairImageKeys([...hair].map(m => originals.get(m)), parser, avatarSha256));
  let hairStyle = 'original', hairColor = 'original', skinTone = 'original', nativeLipColor = 'original';
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
      value.dynamics?.setEnvironmentColliders?.(environmentColliders);
    }
  }

  // Mode changes visibility, never the user's selected style. Loading a cached
  // replacement while in base mode must not make it visible.
  function applyHairVisibility() {
    const effectiveStyle = bodyMode === 'base' && !preserveHairInBaseMode ? 'none' : hairStyle;
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
    if (mode === 'base' && !preserveHairInBaseMode && !canHideHair) return { applied: false, reason: '当前身体无发基础尚未准入或缺少独立头发网格' };
    if(bodyMode!==mode)revision++;
    bodyMode = mode; applyHairVisibility();
    return { applied: true };
  }
  function tintHair(m, base) {
    if (!base.color) return;
    const tint = HAIR_COLORS[hairColor];
    m.map = tint ? grayTextures.get(base.map) : base.map;
    if ('shadeMultiplyTexture' in m) m.shadeMultiplyTexture = tint ? grayTextures.get(base.shadeMap) : base.shadeMap;
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
    for (const value of replacements.values()) if(!value.native)value.scene.traverse(mesh => {
      if (mesh.isMesh) for (const m of materialsOf(mesh)) tintHair(m, value.materialBase.get(m));
    });
    for (const m of tintableSkin) {
      const base = originals.get(m), tint = skinMultipliers[skinTone];
      if (base.color) { m.color.copy(base.color); if (tint) m.color.multiply(new THREE.Color(tint)); }
      if (base.shade) { m.shadeColorFactor.copy(base.shade); if (tint) m.shadeColorFactor.multiply(new THREE.Color(tint)); }
    }
  }
  function releaseReplacement(value) {
    if (!value) return;
    if(value.native){value.dispose();return;}
    value.dynamics?.dispose();
    value.scene.removeFromParent();
    const skeletons=new Set();value.scene.traverse(mesh=>{if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});
    skeletons.forEach(skeleton=>skeleton.dispose());
    value.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); materialsOf(mesh).forEach(m => m.dispose()); } });
  }
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  async function fetchHairBytes(url) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`发型数据加载失败 (${response.status})`);
    return response.arrayBuffer();
  }
  async function pinnedJson(url, sha256) {
    const bytes = await fetchHairBytes(url);
    if (await digest(bytes) !== sha256) throw Error('发型数据版本不一致');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function loadReplacement(entry) {
    const manifest = await pinnedJson(entry.manifestUrl,entry.manifestSha256);
    if(manifest.schema==='character-hairstyle-v2') {
      if(!entry.fit)throw Error('原生发型缺少独立版型');
      const fit=await pinnedJson(entry.fit.url,entry.fit.sha256);
      validateHairFitData(fit,entry,avatarSha256,manifest);
      const hidden=fit.hideOriginal.materialNames;
      if(!hairMeshes.length||mixedHairMesh||hairMeshes.some(({mesh})=>materialsOf(mesh).some(m=>!hidden.includes(m.name.replace(/ \(Outline\)$/,'')))))
        throw Error('原生发型原网格隐藏范围不匹配');
      const response=await fetch(manifest.url);
      if(!response.ok)throw Error(`发型资源加载失败 (${response.status})`);
      const bytes=await response.arrayBuffer();
      if(await digest(bytes)!==entry.assetSha256)throw Error('原生发型资源身份不一致');
      return loadNativeHairAttachment({vrm,bytes,url:manifest.url,fit,sha256:entry.assetSha256,hairFit:hairFitIdentity(entry)});
    }
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
    } else if (manifest.fit || manifest.regionColorway || !entry.legacyImplicitFit || manifest.physics!=='rigid') throw Error('发型缺少已登记适配');
    const colorway=manifest.regionColorway
      ? await prepareHairRegionColorway(entry,manifest,fit,avatarSha256,fetchHairBytes) : null;
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
      let coloredMesh;
      if(colorway) {
        await verifyRegionPrimitive(colorway,gltf.parser.json,bytes);
        const target=meshes.filter(mesh=>{
          const origin=gltf.parser.associations.get(mesh);
          return origin?.meshes===colorway.regions.mesh && origin.primitives===colorway.regions.primitive;
        });
        if(target.length!==1 || target[0].geometry.getAttribute('position').count!==colorway.regions.vertices ||
           source.some(material=>!material.isMToonMaterial))throw Error('分区发色的实际图元或 MToon 材质不匹配');
        [coloredMesh]=target;
        // Each replacement owns this loader-created geometry, skeleton and material clones.
        coloredMesh.geometry.setAttribute('color',new THREE.BufferAttribute(colorway.colors,3));
      }
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
        if(mesh===coloredMesh)for(const material of cloned){
          material.vertexColors=true;material.ignoreVertexColor=false;material.needsUpdate=true;
        }
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
  function assertHairChange(style, accessoryTransaction) {
    const accessoryContext=accessoryTransaction===undefined?undefined:readAccessoryTransactionContext(accessoryTransaction,avatarSha256,vrm);
    const entry = validateHairSelection(avatarSha256, style);
    validateHairChange?.({ hairStyle: style, replacementSHA256: entry?.assetSha256 ?? null,
      hairFit: entry ? hairFitIdentity(entry) : null }, accessoryContext, accessoryTransaction);
  }
  async function prepareUpdate(input = {}, {trackIntent=false,accessoryTransaction,accessories}={}) {
    if(accessories!==undefined)return{applied:false,reason:'附件组合必须通过整套配方提交'};
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const desiredStyle = input.reset ? 'original' : input.hairStyle ?? hairStyle;
    const desiredColor = input.reset ? 'original' : input.hairColor ?? hairColor;
    const desiredSkin = input.reset ? 'original' : input.skinTone ?? skinTone;
    const desiredNativeLip = input.reset ? 'original' : input.lipColor ?? nativeLipColor;
    const desiredEyebrow = input.reset ? 'original' : input.eyebrowColor ?? nativeEyebrow?.getState().eyebrowColor ?? 'original';
    if (!Object.hasOwn(HAIR_COLORS,desiredColor) || !Object.hasOwn(skinContract?.colors ?? skinMultipliers,desiredSkin))
      return { applied: false, reason: '未知颜色预设' };
    if ((input.eyeColor !== undefined && !Object.hasOwn(EYE_COLORS,input.eyeColor)) ||
        (input.lipColor !== undefined && !Object.hasOwn(lipContract?.colors ?? LIP_COLORS,input.lipColor)))
      return {applied:false,reason:'未知瞳色或唇色'};
    try { assertAppearanceColorSelection(avatarSha256,input.reset ? {} : {...input,hairColor:desiredColor,skinTone:desiredSkin,eyebrowColor:desiredEyebrow}); }
    catch(e) { return {applied:false,reason:e.message}; }
    if (desiredStyle !== 'original' && !(desiredStyle === 'none' && canHideHair) && !admittedStyles.some(entry => entry.id === desiredStyle))
      return { applied: false, reason: '该发型尚未适配当前身体；请使用可选款式' };
    try { validateHairSelection(avatarSha256,desiredStyle,input); assertHairChange(desiredStyle,accessoryTransaction); }
    catch(e) { return {applied:false,reason:e.message}; }
    const requestRevision = ++revision;
    const changeStyle=!trackIntent||input.reset||input.hairStyle!==undefined;
    const styleRequest=changeStyle?++generation:generation;
    if(changeStyle)pendingStyleRequest=0;
    // Standalone hair/color controls retain their independent intents. A whole
    // recipe never lends its staged hair selection to a newer color request.
    const applyStyleIntent=()=>{
      if(!trackIntent||!changeStyle||disposed||styleRequest!==generation)return;
      assertAccessoryTransactionCommit(accessoryTransaction,vrm);
      assertHairChange(desiredStyle,accessoryTransaction);
      hairStyle=desiredStyle;replacement=replacements.get(desiredStyle)||null;
      applyColors();applyHairVisibility();
    };
    error=null;loading=true;
    let paletteUpdate=null, eyebrowUpdate=null, skinUpdate=null;
    try {
      if (!['original','none'].includes(desiredStyle)&&!replacements.has(desiredStyle)) {
        if (!replacementPromises.has(desiredStyle)) replacementPromises.set(desiredStyle, loadReplacement(admittedStyles.find(entry => entry.id === desiredStyle)).then(value => {
          if (disposed) { releaseReplacement(value); return null; }
          try {
            value.scene.visible = false;
            if(value.native)value.attach();
            else vrm.humanoid.getRawBoneNode('head').add(value.scene);
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
      paletteUpdate=await facialPalette.prepareUpdate(lipContract?{...input,lipColor:'original'}:input,{trackIntent});
      if(!paletteUpdate.commit){loading=false;return paletteUpdate;}
      eyebrowUpdate=nativeEyebrow?await nativeEyebrow.prepareUpdate({eyebrowColor:desiredEyebrow},{trackIntent}):null;
      if(eyebrowUpdate&&!eyebrowUpdate.commit){paletteUpdate.dispose();loading=false;return eyebrowUpdate;}
      if(!disposed&&revision===requestRevision&&nativeSkin)skinUpdate=await nativeSkin.prepareUpdate(desiredSkin,lipContract?desiredNativeLip:'original');
      if(disposed||revision!==requestRevision||skinUpdate?.cancelled){paletteUpdate.dispose();eyebrowUpdate?.dispose();skinUpdate?.dispose?.();applyStyleIntent();return{applied:false,cancelled:true};}
      if(desiredColor!=='original'){
        for(const material of hair){const base=originals.get(material);grayTextures.get(base.map);grayTextures.get(base.shadeMap);}
        for(const value of replacements.values())for(const base of value.materialBase.values()){grayTextures.get(base.map);grayTextures.get(base.shadeMap);}
      }
      const previous={hairStyle,hairColor,skinTone,nativeLipColor,replacement,materials:new Map()};
      const remember=material=>{if(!previous.materials.has(material))previous.materials.set(material,{map:material.map,shadeMap:material.shadeMultiplyTexture,color:material.color?.clone(),shade:material.shadeColorFactor?.clone()});};
      for(const material of [...originals.keys()])remember(material);
      for(const value of replacements.values())for(const material of value.materialBase.keys())remember(material);
      const restoreAppearance=()=>{for(const [material,state] of previous.materials){material.map=state.map;if('shadeMultiplyTexture' in material)material.shadeMultiplyTexture=state.shadeMap;if(state.color&&material.color)material.color.copy(state.color);if(state.shade&&material.shadeColorFactor)material.shadeColorFactor.copy(state.shade);material.needsUpdate=true;}hairStyle=previous.hairStyle;hairColor=previous.hairColor;skinTone=previous.skinTone;nativeLipColor=previous.nativeLipColor;replacement=previous.replacement;applyHairVisibility();};
      let live=true,committed=false,rolledBack=false,cleaned=false;
      const update={
        isCurrent:()=>live&&!disposed&&revision===requestRevision&&paletteUpdate.isCurrent()&&(!eyebrowUpdate||eyebrowUpdate.isCurrent())&&(!skinUpdate||skinUpdate.isCurrent()),
        applyStyleIntent,
          validateCommit(){
          if(!update.isCurrent())throw Error('外观准备已过期');
          if(eyebrowUpdate&&!eyebrowUpdate.isCurrent())throw Error('眉色准备已过期');
          if(changeStyle)assertHairChange(desiredStyle,accessoryTransaction);
          },
          commit(){
            assertAccessoryTransactionCommit(accessoryTransaction,vrm);
            update.validateCommit();
          try {
            eyebrowUpdate?.commit(); paletteUpdate.commit(); skinUpdate?.commit();
            if(changeStyle){hairStyle=desiredStyle;replacement=replacements.get(desiredStyle)||null;}
            hairColor=desiredColor;skinTone=desiredSkin;
            if(lipContract)nativeLipColor=desiredNativeLip;
            applyColors();applyHairVisibility();
            loading=false;live=false;committed=true;pendingUpdates.delete(update);return{applied:true};
          } catch(error) {
            try { skinUpdate?.rollback(); }
            finally { eyebrowUpdate?.rollback?.(); paletteUpdate.rollback?.(); restoreAppearance(); }
            throw error;
          }
        },
        rollback(){
          if(!committed||disposed||rolledBack)return{applied:false};
          try { skinUpdate?.rollback(); }
          finally { eyebrowUpdate?.rollback?.();paletteUpdate.rollback?.();restoreAppearance();committed=false;rolledBack=true;pendingUpdates.delete(update);loading=false; }
          return{applied:true};
        },
        dispose(){
          if(cleaned)return;cleaned=true;live=false;pendingUpdates.delete(update);
          try{paletteUpdate.dispose();}finally{try{eyebrowUpdate?.dispose();}finally{skinUpdate?.dispose();}}
          if(revision===requestRevision)loading=false;
        },
      };
      pendingUpdates.add(update);return update;
    } catch (e) {
      paletteUpdate?.dispose();eyebrowUpdate?.dispose();skinUpdate?.dispose?.();
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
    getState: () => ({ hairStyle, hairColor, skinTone, eyebrowColor:nativeEyebrow?.getState().eyebrowColor??'original', eyebrowLoading:nativeEyebrow?.getState().nativeEyebrowLoading??false, eyebrowError:nativeEyebrow?.getState().nativeEyebrowError??null, eyebrowTextureCount:nativeEyebrow?.getState().nativeEyebrowTextureCount??0, loading:loading||pendingStyleRequest!==0, error, bodyMode, revision,
      effectiveHairStyle: bodyMode === 'base' && !preserveHairInBaseMode ? 'none' : hairStyle,
      noHairAdmission: canHideHair ? { ...noHairAdmission } : null, ...facialPalette.getState(),
      availableStyles: ['original', ...(canHideHair ? ['none'] : []), ...admittedStyles.map(entry => entry.id)],
      styleOptions: [{id:'original',label:'原发型'}, ...(canHideHair ? [{id:'none',label:'无发（保留眉睫毛）'}] : []), ...admittedStyles.map(({id,label}) => ({id,label}))],
      skinMaterialCount: skin.size, hairMaterialCount: hair.size, neutralTextureCount: grayTextures.size,
      ...(nativeSkin ? {nativeSkinTone:nativeSkin.getState()} : {}),
      ...(lipContract ? {lipColor:nativeLipColor} : {}),
      hairFit: replacement ? { ...replacement.hairFit } : null, replacementSHA256: replacement?.sha256 ?? null,
      hairDynamics:replacement?.dynamics?.getState()??null }),
    dispose() {
      if(disposed)return;
      disposed = true; generation++;revision++;loading=false;pendingStyleRequest=0;environmentColliders=[];
      for(const update of pendingUpdates)update.dispose();
      facialPalette.dispose();nativeEyebrow?.dispose();nativeSkin?.dispose();
      replacements.forEach(releaseReplacement); replacements.clear(); replacement = null;
      for (const [m, base] of originals) {
        if (base.color) m.color.copy(base.color);
        if (base.shade) m.shadeColorFactor.copy(base.shade);
        m.map = base.map;
        if ('shadeMultiplyTexture' in m) m.shadeMultiplyTexture = base.shadeMap;
      }
      hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = visible; });
      grayTextures.dispose();
    },
  };
}
