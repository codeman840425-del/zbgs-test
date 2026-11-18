import * as THREE from 'three';
import {validateNativeSkinToneManifest} from './native-skin-tone-contract.js';

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

export function createNativeSkinTone({vrm, contract, coverage}) {
  check(coverage, '缺少原生身体遮罩');
  const baseURL = new URL(contract.url, globalThis.location?.href ?? 'http://localhost/');
  let committedMaps = null, ready = null, preparing = null, disposed = false, revision = 0;
  const cleanupErrors = [];

  async function read(descriptor) {
    const url = new URL(descriptor.url, baseURL);
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

  function cleanup(value) {
    for (const texture of value.textures) {
      try { texture.dispose(); } catch (error) { cleanupErrors.push(String(error)); }
    }
    for (const image of value.images) {
      try { image.close(); } catch (error) { cleanupErrors.push(String(error)); }
    }
  }

  async function load(toneId) {
    const value = {textures:new Set(), images:new Set()};
    async function decode(descriptor) {
      const image = await createImageBitmap(new Blob([await read(descriptor)], {type:'image/png'}), decodeOptions);
      value.images.add(image);
      check(!disposed, '人物已卸载');
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
      const json = JSON.parse(new TextDecoder().decode(await read(contract)));
      const {face, eyeline, body} = validateNativeSkinToneManifest(json, contract, toneId);
      const faces = discoverHeadMaterials(vrm, face), eyelines = discoverHeadMaterials(vrm, eyeline);
      const bodySources = coverage.skinToneSources(body, contract.coverage.manifestSha256);
      const faceSources = new Set(faces.flatMap(({map, shadeMap}) => [map, shadeMap]));
      const eyelineSources = new Set(eyelines.flatMap(({map, shadeMap}) => [map, shadeMap]));
      const decodedImages = await Promise.allSettled([face.authored, eyeline.authored, body.authored, body.coveredAuthored].map(decode));
      const [faceImage, eyelineImage, bodyImage, coveredImage] = decodedImages.map(decoded => {
        if (decoded.status === 'rejected') throw decoded.reason;
        return decoded.value;
      });
      for (const [originals, image, part] of [
        [faceSources, faceImage, face], [eyelineSources, eyelineImage, eyeline],
        [bodySources.keys(), bodyImage, body], [bodySources.values(), coveredImage, body],
      ]) {
        for (const original of new Set([...originals].map(texture => texture.image))) assertAlpha(original, image, part);
      }
      value.faces = [...faces, ...eyelines];
      value.faceMaps = new Map([...clones(faceSources, faceImage), ...clones(eyelineSources, eyelineImage)]);
      value.bodyMaps = {
        base:clones(bodySources.keys(), bodyImage),
        covered:clones(bodySources.keys(), coveredImage),
      };
      ready = value;
      return value;
    } catch (error) { cleanup(value); throw error; }
  }

  const correctFaceMaps = value => value.faces.every(({material, map, shadeMap}) =>
    material.map === (committedMaps ? committedMaps.get(map) : map) &&
    material.shadeMultiplyTexture === (committedMaps ? committedMaps.get(shadeMap) : shadeMap));
  function putFaceMaps(material, record, maps) {
    material.map = maps ? maps.get(record.map) : record.map;
    material.shadeMultiplyTexture = maps ? maps.get(record.shadeMap) : record.shadeMap;
    material.needsUpdate = true;
  }
  function restoreFace(value, maps) {
    for (const record of value.faces) {
      putFaceMaps(record.material, record, maps);
      try { record.material.update(0); } catch (error) { cleanupErrors.push(String(error)); }
    }
  }

  async function prepareUpdate(toneId) {
    const ticket = ++revision;
    if (toneId !== 'original' && !ready) {
      preparing ??= load(toneId).finally(() => { preparing = null; });
      await preparing;
    }
    if (disposed || ticket !== revision) return {cancelled:true};
    const value = ready;
    if (!value) return {isCurrent:() => !disposed && revision === ticket, commit(){}, rollback(){}, dispose(){}};
    const isOriginal = toneId === 'original';
    const nextMaps = isOriginal ? null : value.faceMaps;
    check(correctFaceMaps(value), '面部肤色材质已在外部改变');
    for (const record of value.faces) {
      const material = record.material.clone();
      try { putFaceMaps(material, record, nextMaps); material.update(0); }
      finally { material.dispose(); }
    }
    const body = coverage.prepareSkinTone(isOriginal ? null : value.bodyMaps);
    let live = true, committed = false, previousMaps;
    const update = {
      isCurrent:() => live && !disposed && ticket === revision && correctFaceMaps(value) && body.isCurrent(),
      commit() {
        check(update.isCurrent(), '肤色准备已过期');
        previousMaps = committedMaps;
        try {
          for (const record of value.faces) {
            putFaceMaps(record.material, record, nextMaps);
            record.material.update(0);
          }
          body.commit();
          committedMaps = nextMaps;
          committed = true; live = false;
        } catch (error) { restoreFace(value, previousMaps); throw error; }
      },
      rollback() {
        if (!committed || disposed || ticket !== revision) return;
        try { body.rollback(); }
        finally { restoreFace(value, previousMaps); committedMaps = previousMaps; committed = false; }
      },
      dispose() { live = false; body.dispose(); },
    };
    return update;
  }

  return {
    prepareUpdate,
    getState:() => ({textureCount:ready?.textures.size ?? 0, cleanupErrors:[...cleanupErrors]}),
    dispose() {
      if (disposed) return;
      disposed = true; revision++;
      if (!ready) return;
      if (committedMaps) {
        let update;
        try { update = coverage.prepareSkinTone(null); update.commit(); }
        catch (error) { cleanupErrors.push(String(error)); }
        finally { update?.dispose(); }
        restoreFace(ready, null);
      }
      cleanup(ready); ready = null; committedMaps = null;
    },
  };
}
