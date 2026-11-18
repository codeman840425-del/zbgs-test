import * as THREE from 'three';
import {validateNativeSkinToneManifest} from './native-skin-tone-contract.js';
import {validateNativeLipColorManifest} from './native-lip-color-contract.js';

const check = (ok, message) => { if (!ok) throw Error(`原生肤色：${message}`); };
const decodeOptions = {premultiplyAlpha:'none', colorSpaceConversion:'none', imageOrientation:'none'};

function pixels(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently:true});
  check(context, '无法读取遮罩像素');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function assertAlpha(original, image, part) {
  check(original.width === part.width && original.height === part.height &&
    image.width === part.width && image.height === part.height, '贴图尺寸不一致');
  const source = pixels(original), authored = pixels(image);
  for (let offset = 3; offset < source.length; offset += 4)
    check(source[offset] === authored[offset], '原生肤色的透明度与原遮罩不一致');
}

function discoverHeadMaterials(vrm, part) {
  const materials = new Set();
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of [].concat(mesh.material ?? [])) {
      if (material?.name === part.materialName || material?.name === part.materialName + ' (Outline)')
        materials.add(material);
    }
  });
  check(materials.size > 0 && materials.size <= 2 && [...materials].filter(m => !m.isOutline).length === 1,
    '面部肤色材质数量不匹配');
  const blended = part.alphaMode === 'BLEND';
  return [...materials].map(material => {
    check(material.isMToonMaterial && typeof material.update === 'function' && material.transparent === blended &&
      material.alphaTest === (blended ? 0 : 0.5) && material.opacity === 1 &&
      material.side === (material.isOutline ? THREE.BackSide : THREE.DoubleSide), '面部MToon合成设置不匹配');
    const map = material.map, shadeMap = material.shadeMultiplyTexture;
    for (const texture of [map, shadeMap])
      check(texture?.isTexture && texture.image?.width === part.width && texture.image?.height === part.height &&
        texture.flipY === false && texture.colorSpace === THREE.SRGBColorSpace &&
        texture.wrapS === THREE.RepeatWrapping && texture.wrapT === THREE.RepeatWrapping &&
        texture.minFilter === THREE.LinearFilter && texture.magFilter === THREE.LinearFilter &&
        texture.generateMipmaps === false && texture.channel === 0 && texture.offset.x === 0 &&
        texture.offset.y === 0 && texture.repeat.x === 1 && texture.repeat.y === 1 && texture.rotation === 0,
      '面部采样或UV不匹配');
    return {material, map, shadeMap};
  });
}

export function createNativeSkinTone({vrm, contract, coverage, lipContract}) {
  check(coverage, '缺少原生身体遮罩');
  const baseURL = new URL(contract.url, globalThis.location?.href ?? 'http://localhost/');
  const original = {face:null, eyeline:null, body:null};
  let current = original, disposed = false, revision = 0;
  const regions = new Map(), cache = new Map(), loaded = new Set();
  const cleanupErrors = [];

  async function read(descriptor, parent = baseURL) {
    const url = new URL(descriptor.url, parent);
    check(url.origin === baseURL.origin, '贴图资源来源不匹配');
    const response = await fetch(url.href);
    check(response.ok, `资源加载失败 (${response.status})`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    check(digest === descriptor.sha256, '资源字节身份不匹配');
    check(!disposed, '人物已卸载');
    return bytes;
  }

  function cached(key, create) {
    if (!cache.has(key)) {
      const pending = Promise.resolve().then(create).catch(error => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  function cleanup(value) {
    for (const texture of value.textures) {
      try { texture.dispose(); } catch (error) { cleanupErrors.push(String(error)); }
    }
    for (const image of value.images) {
      try { image.close(); } catch (error) { cleanupErrors.push(String(error)); }
    }
  }

  async function loadTextures(assets, prepare) {
    const value = {textures:new Set(), images:new Set()};
    async function decode({descriptor, parent}) {
      const image = await createImageBitmap(new Blob([await read(descriptor, parent)], {type:'image/png'}), decodeOptions);
      value.images.add(image);
      return image;
    }
    function clones(originals, image) {
      const textures = new Map();
      for (const original of originals) {
        const texture = original.clone();
        value.textures.add(texture);
        texture.source = new THREE.TextureSource(image); texture.needsUpdate = true;
        textures.set(original, texture);
      }
      return textures;
    }
    try {
      const decodedImages = await Promise.allSettled(assets.map(decode));
      check(!disposed, '人物已卸载');
      const images = decodedImages.map(decoded => {
        if (decoded.status === 'rejected') throw decoded.reason;
        return decoded.value;
      });
      const result = prepare(images, clones);
      loaded.add(value);
      return result;
    } catch (error) { cleanup(value); throw error; }
  }

  function headSources(role, part) {
    if (!regions.has(role)) regions.set(role, {part, records:discoverHeadMaterials(vrm, part)});
    const {part:originalPart, records} = regions.get(role);
    check(['materialName', 'width', 'height', 'alphaMode', 'alphaCutoff'].every(field => part[field] === originalPart[field]),
      '面部贴图不共用同一材质');
    return new Set(records.flatMap(({map, shadeMap}) => [map, shadeMap]));
  }

  function validateAlpha(part, sources, image) {
    for (const source of new Set([...sources].map(texture => texture.image))) assertAlpha(source, image, part);
  }

  function faceMaps(part, descriptor, parent) {
    return cached('face:' + descriptor.sha256, () => loadTextures([{descriptor, parent}], ([image], clones) => {
      const sources = headSources('face', part);
      validateAlpha(part, sources, image);
      return clones(sources, image);
    }));
  }

  function warmTextures({eyeline, body}) {
    return cached('warm-eyeline-and-body', () => loadTextures(
      [eyeline.authored, body.authored, body.coveredAuthored].map(descriptor => ({descriptor})),
      ([eyelineImage, bodyImage, coveredImage], clones) => {
        const eyelineSources = headSources('eyeline', eyeline);
        const bodySources = coverage.skinToneSources(body, contract.coverage.manifestSha256);
        validateAlpha(eyeline, eyelineSources, eyelineImage);
        validateAlpha(body, bodySources.keys(), bodyImage);
        validateAlpha(body, bodySources.values(), coveredImage);
        return {
          eyeline:clones(eyelineSources, eyelineImage),
          body:{base:clones(bodySources.keys(), bodyImage), covered:clones(bodySources.keys(), coveredImage)},
        };
      }));
  }

  const currentMap = (map, selected) => selected ? selected.get(map) : map;
  function actualHeadMatchesCurrent() {
    return [...regions].every(([role, {records}]) => records.every(({material, map, shadeMap}) =>
      material.map === currentMap(map, current[role]) &&
      material.shadeMultiplyTexture === currentMap(shadeMap, current[role])));
  }
  function putHeadMaps(material, record, maps) {
    material.map = currentMap(record.map, maps);
    material.shadeMultiplyTexture = currentMap(record.shadeMap, maps);
    material.needsUpdate = true;
  }
  function setHead(changes, target, restoring = false) {
    for (const {record, role} of changes) {
      putHeadMaps(record.material, record, target[role]);
      if (!restoring) {
        record.material.update(0);
        continue;
      }
      try { record.material.update(0); } catch (error) { cleanupErrors.push(String(error)); }
    }
  }
  const headChanges = (before, next) => [...regions].flatMap(([role, {records}]) =>
    before[role] === next[role] ? [] : records.map(record => ({role, record})));

  async function prepareUpdate(toneId, lipId = 'original') {
    if (disposed) return {cancelled:true};
    const ticket = ++revision;
    const loadManifest = async descriptor => JSON.parse(new TextDecoder().decode(await read(descriptor)));
    const warm = toneId === 'original' ? null : validateNativeSkinToneManifest(
      await cached('skin-manifest', () => loadManifest(contract)), contract, toneId);
    let facePart = warm?.face, selectedFace = warm?.face.authored, parent;
    if (lipId !== 'original') {
      const style = lipContract?.variants[lipId];
      check(style, '未登记原生唇妆');
      const lip = validateNativeLipColorManifest(await cached('lip-manifest:' + style.sha256, () => loadManifest(style)),
        style, toneId, lipId, warm);
      facePart = lip.face; selectedFace = lip.selected.authored; parent = new URL(style.url, baseURL);
    }
    if (disposed || ticket !== revision) return {cancelled:true};
    const environment = warm ? await warmTextures(warm) : original;
    if (disposed || ticket !== revision) return {cancelled:true};
    const next = {face:selectedFace ? await faceMaps(facePart, selectedFace, parent) : null,
      eyeline:environment.eyeline, body:environment.body};
    if (disposed || ticket !== revision) return {cancelled:true};
    const before = current, changes = headChanges(before, next);
    check(actualHeadMatchesCurrent(), '面部材质已在外部改变');
    for (const {record, role} of changes) {
      const material = record.material.clone();
      try { putHeadMaps(material, record, next[role]); material.update(0); }
      finally { material.dispose(); }
    }
    const body = before.body === next.body ? null : coverage.prepareSkinTone(next.body);
    let live = true, committed = false;
    const update = {
      isCurrent:() => live && !disposed && ticket === revision && actualHeadMatchesCurrent() && (!body || body.isCurrent()),
      commit() {
        check(update.isCurrent(), '原生脸部或肤色准备已过期');
        try {
          setHead(changes, next);
          body?.commit();
          current = next;
          committed = true; live = false;
        } catch (error) { setHead(changes, before, true); throw error; }
      },
      rollback() {
        if (!committed || disposed || ticket !== revision) return;
        try { body?.rollback(); }
        finally { setHead(changes, before, true); current = before; committed = false; }
      },
      dispose() { live = false; body?.dispose(); },
    };
    return update;
  }

  return {
    prepareUpdate,
    getState:() => ({textureCount:[...loaded].reduce((sum, value) => sum + value.textures.size, 0), cleanupErrors:[...cleanupErrors]}),
    dispose() {
      if (disposed) return;
      disposed = true; revision++;
      if (current.body) {
        let update;
        try { update = coverage.prepareSkinTone(null); update.commit(); }
        catch (error) { cleanupErrors.push(String(error)); }
        finally { update?.dispose(); }
      }
      setHead(headChanges(current, original), original, true);
      for (const value of loaded) cleanup(value);
      loaded.clear(); cache.clear(); regions.clear(); current = original;
    },
  };
}
