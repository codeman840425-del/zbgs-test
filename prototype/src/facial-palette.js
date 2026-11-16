import * as THREE from 'three';
import {FACIAL_PALETTE_MANIFEST_URL,FACIAL_PALETTE_MANIFEST_SHA256} from './facial-palette-contract.js';
const IRIS_COLOR_OPERATION = 'neutral-iris-multiply-v3';

export const EYE_COLORS = { original: null, brown: '#916138', blue: '#507fa9', green: '#5e8b60', violet: '#8b63a6' };
export const LIP_COLORS = { original: null, rose: '#bf7482', coral: '#cc8773', mauve: '#a66b87' };
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');

/** Masked, per-instance texture variants. Iris pupil and lip-exterior pixels
 * are authored protection regions, not a whole-material color multiplier. */
export function createFacialPalette({ vrm, avatarSha256 }) {
  let parts = null, preparation = null, disposed = false, generation = 0;
  let eyeColor = 'original', lipColor = 'original', wantedEye = eyeColor, wantedLip = lipColor;
  let loading = false, error = null;
  const pendingUpdates = new Set();
  async function prepare() {
    if (parts) return parts;
    if (preparation) return preparation;
    preparation = (async () => {
      const response = await fetch(FACIAL_PALETTE_MANIFEST_URL);
      if (!response.ok) throw new Error(`五官配色清单加载失败 (${response.status})`);
      const manifestBytes = await response.arrayBuffer();
      if (await digest(manifestBytes) !== FACIAL_PALETTE_MANIFEST_SHA256) throw new Error('五官配色清单版本不匹配');
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (manifest.schema !== 'character-facial-palette-v1') throw new Error('未知五官配色格式');
      const variant = manifest.variants.find(v => v.avatarSha256 === avatarSha256);
      if (!variant) throw new Error('当前身体尚无五官配色适配');
      const result = {};
      for (const name of ['iris', 'lips']) {
        const descriptor = variant.parts[name];
        if (name === 'iris' && descriptor.colorOperation !== IRIS_COLOR_OPERATION) throw new Error('虹膜配色算法版本不兼容');
        if (descriptor.maskChannel !== 'r' || descriptor.imageYEqualsUVv !== true || descriptor.preserveAlpha !== true)
          throw new Error('配色遮罩坐标不兼容');
        const materials = new Set();
        vrm.scene.traverse(mesh => {
          if (!mesh.isMesh) return;
          for (const m of materialsOf(mesh))
            if (m.name === descriptor.materialName || m.name === descriptor.materialName + ' (Outline)') materials.add(m);
        });
        if (!materials.size) throw new Error('配色部件材质缺失：' + name);
        const fetched = await fetch(descriptor.maskUrl);
        if (!fetched.ok) throw new Error(`配色遮罩加载失败 (${fetched.status})`);
        const bytes = await fetched.arrayBuffer();
        if (await digest(bytes) !== descriptor.maskSha256) throw new Error('配色遮罩身份不一致：' + name);
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const [width, height] = descriptor.mapSize;
        if (bitmap.width !== width || bitmap.height !== height) { bitmap.close(); throw new Error('配色遮罩尺寸不匹配'); }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0); bitmap.close();
        const data = context.getImageData(0, 0, width, height).data, indices = [], weights = [];
        for (let i = 0; i < data.length; i += 4) if (data[i]) { indices.push(i); weights.push(data[i] / 255); }
        if (!indices.length) throw new Error('配色遮罩为空：' + name);
        const records = [...materials].map(m => {
          if (!m.map || m.map.flipY !== false || m.map.image.width !== width || m.map.image.height !== height)
            throw new Error('配色原图坐标/尺寸不匹配：' + name);
          return { material: m, map: m.map, shadeMap: m.shadeMultiplyTexture };
        });
        let neutral = null;
        if (name === 'iris') {
          if (descriptor.neutralChannel !== 'r' || descriptor.neutralMultiplierReference !== 192 ||
              JSON.stringify(descriptor.neutralMapSize) !== JSON.stringify(descriptor.mapSize)) throw new Error('虹膜明暗底图格式不兼容');
          const response = await fetch(descriptor.neutralMapUrl);
          if (!response.ok) throw new Error(`虹膜明暗底图加载失败 (${response.status})`);
          const bytes = await response.arrayBuffer();
          if (await digest(bytes) !== descriptor.neutralMapSha256) throw new Error('虹膜明暗底图身份不一致');
          const bitmap = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
          if (bitmap.width !== width || bitmap.height !== height) { bitmap.close(); throw new Error('虹膜明暗底图尺寸不匹配'); }
          context.clearRect(0,0,width,height);context.drawImage(bitmap,0,0);bitmap.close();
          const pixels=context.getImageData(0,0,width,height).data;
          neutral=Uint8Array.from(indices,i=>pixels[i]);
        }
        result[name] = { records, width, height, indices, weights, neutral, variants: new Map(), last: 'original', descriptor };
      }
      if (disposed) throw new Error('人物已卸载');
      parts = result; return parts;
    })().finally(() => { preparation = null; });
    return preparation;
  }
  function variantTexture(part, source, hex) {
    if (!source) return null;
    let colors = part.variants.get(source);
    if (!colors) { colors = new Map(); part.variants.set(source, colors); }
    let item = colors.get(hex);
    if (!item) {
      if (source.image.width !== part.width || source.image.height !== part.height) throw new Error('配色阴影图尺寸不匹配');
      const canvas = document.createElement('canvas'); canvas.width = part.width; canvas.height = part.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source.image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const texture = source.clone(); texture.source = new THREE.Source(canvas);
      item = { texture, context, pixels, original: new Uint8ClampedArray(pixels.data), color: null };
      colors.set(hex, item);
    }
    if (item.color !== hex) {
      const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
      const { original, pixels } = item;
      for (let j = 0; j < part.indices.length; j++) {
        const i = part.indices[j], weight = part.weights[j];
        const value = part.neutral ? part.neutral[j] / part.descriptor.neutralMultiplierReference
          : Math.max(original[i], original[i + 1], original[i + 2]) / 255;
        for (let channel = 0; channel < 3; channel++)
          pixels.data[i + channel] = Math.round(original[i + channel] * (1 - weight) + rgb[channel] * value * weight);
        // Alpha, protected pixels, pupil, eye white, highlights and mouth cavity
        // retain their source bytes. No face geometry or expression is changed.
      }
      item.context.putImageData(pixels, 0, 0); item.texture.needsUpdate = true; item.color = hex;
    }
    return item.texture;
  }
  function preparePart(name, selection, presets) {
    const part = parts?.[name];
    if (!part || part.last === selection) return [];
    return part.records.map(record=>({record,
      map:selection==='original'?record.map:variantTexture(part,record.map,presets[selection]),
      shadeMap:selection==='original'?record.shadeMap:variantTexture(part,record.shadeMap,presets[selection]),
    }));
  }
  function applyPart(name, selection, assignments) {
    const part=parts?.[name];
    if(!part)return;
    for (const {record,map,shadeMap} of assignments) {
      record.material.map = map;
      if ('shadeMultiplyTexture' in record.material)
        record.material.shadeMultiplyTexture = shadeMap;
      record.material.needsUpdate = true;
    }
    part.last = selection;
  }
  async function prepareUpdate(input, {trackIntent=false}={}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const nextEye = input.reset ? 'original' : input.eyeColor ?? (trackIntent?wantedEye:eyeColor);
    const nextLip = input.reset ? 'original' : input.lipColor ?? (trackIntent?wantedLip:lipColor);
    if (!(nextEye in EYE_COLORS) || !(nextLip in LIP_COLORS)) return { applied: false, reason: '未知瞳色或唇色' };
    if(trackIntent){wantedEye = nextEye; wantedLip = nextLip;}
    const request = ++generation; error = null;
    try {
      if (nextEye !== 'original' || nextLip !== 'original') { loading = true; await prepare(); }
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      const iris=preparePart('iris',nextEye,EYE_COLORS),lips=preparePart('lips',nextLip,LIP_COLORS);
      let live=true;
      const update={
        isCurrent:()=>live&&!disposed&&request===generation,
        commit(){
          if(!update.isCurrent())throw Error('五官配色准备已过期');
          applyPart('iris',nextEye,iris);applyPart('lips',nextLip,lips);
          eyeColor=nextEye;lipColor=nextLip;wantedEye=nextEye;wantedLip=nextLip;loading=false;live=false;pendingUpdates.delete(update);
          return{applied:true};
        },
        dispose(){
          if(!live)return;live=false;pendingUpdates.delete(update);
          if(request===generation){loading=false;wantedEye=eyeColor;wantedLip=lipColor;}
        },
      };
      pendingUpdates.add(update);return update;
    } catch (e) {
      if(disposed||request!==generation)return{applied:false,cancelled:true};
      if (request === generation) { error = e.message; loading = false; wantedEye = eyeColor; wantedLip = lipColor; }
      return { applied: false, reason: e.message };
    }
  }
  async function set(input){
    const update=await prepareUpdate(input,{trackIntent:true});
    if(!update.commit)return update;
    try{return update.isCurrent()?update.commit():{applied:false,cancelled:true};}
    finally{update.dispose();}
  }
  return {
    set, prepareUpdate,
    getState: () => ({ eyeColor, lipColor, facialPaletteLoading: loading, facialPaletteError: error,
      facialTextureCount: parts ? Object.values(parts).reduce((n, p) => n + [...p.variants.values()].reduce((count,colors)=>count+colors.size,0), 0) : 0,
      facialMaskIdentity: parts ? Object.fromEntries(Object.entries(parts).map(([key, p]) => [key, p.descriptor.maskSha256])) : null }),
    dispose() {
      disposed = true; generation++;
      for(const update of pendingUpdates)update.dispose();
      for (const part of Object.values(parts || {})) {
        for (const record of part.records) {
          record.material.map = record.map;
          if ('shadeMultiplyTexture' in record.material) record.material.shadeMultiplyTexture = record.shadeMap;
        }
        part.variants.forEach(colors => colors.forEach(v=>v.texture.dispose())); part.variants.clear();
      }
    },
  };
}
