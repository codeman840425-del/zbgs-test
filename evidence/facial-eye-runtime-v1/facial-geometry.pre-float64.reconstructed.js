import * as THREE from 'three';

const MANIFEST_URL = '/assets/face-parameters-v1/recipe-manifest.json';
const BROW_BASE_URL = '/assets/face-brow-parameters-v1/';
const BROW_SAMPLE = 'height1-spacing1-v1';
const NOSE_BASE_URL = '/assets/face-nose-parameters-v1/';
const NOSE_SAMPLE = 'tip-forward05-v1';
const EYE_BASE_URL = '/assets/face-eye-sample-v1/';
const EYE_SAMPLE = 'aperture-width101-v1';
const ADMITTED_BASES = new Set([
  '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
  '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
]);
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const materialName = material => material?.name?.replace(/ \(Outline\)$/, '');
function packed(attribute) {
  if (!attribute || attribute.normalized) throw Error('五官属性格式不兼容');
  const ArrayType = attribute.isInterleavedBufferAttribute ? attribute.data.array.constructor : attribute.array.constructor;
  const result = new ArrayType(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i++)
    for (let c = 0; c < attribute.itemSize; c++) result[i * attribute.itemSize + c] = attribute.getComponent(i, c);
  return result;
}
function normals(position, indices) {
  const result = new Float32Array(position.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { result[v] += nx; result[v + 1] += ny; result[v + 2] += nz; }
  }
  for (let i = 0; i < result.length; i += 3) {
    const length = Math.hypot(result[i], result[i + 1], result[i + 2]);
    if (length > 1e-20) { result[i] /= length; result[i + 1] /= length; result[i + 2] /= length; }
  }
  return result;
}

/** Source-authored mouth-width recipe. Each value derives from immutable
 * originals. Existing VRM expressions, bones and material references are kept. */
export function createFacialGeometry({ vrm, avatarSha256, prepareRender }) {
  let prepared = null, preparation = null, disposed = false, generation = 0;
  let mouthWidth = 0, wanted = 0, loading = false, error = null, available = ADMITTED_BASES.has(avatarSha256);
  let browSample = 'none', wantedBrow = 'none', browPrepared = null, browPreparation = null;
  let noseSample = 'none', wantedNose = 'none', nosePrepared = null, nosePreparation = null;
  let eyeSample = 'none', wantedEye = 'none', eyePrepared = null, eyePreparation = null;
  let owned = new Map();

  async function prepare() {
    if (prepared) return prepared;
    if (preparation) return preparation;
    preparation = (async () => {
      const response = await fetch(MANIFEST_URL);
      if (!response.ok) throw Error(`五官几何清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-geometry-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知五官几何清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) { available = false; throw Error('当前身体尚无嘴宽几何适配'); }
      const entry = entries[0];
      if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('五官配方身份无效');
      const fetched = await fetch('/assets/face-parameters-v1/' + entry.file);
      if (!fetched.ok) throw Error(`五官几何配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('五官几何配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes));
      if (recipe.schema !== 'character-face-geometry-recipe-v1' || recipe.id !== entry.id ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.parameter !== 'mouthWidth' ||
          recipe.sourceAxis !== 'glTF mesh-local X' || recipe.range?.[0] !== -.04 || recipe.range?.[1] !== .04 ||
          !Number.isFinite(recipe.centerX) || !Number.isInteger(recipe.positionCount) || recipe.positionCount < 3 ||
          !Array.isArray(recipe.weights) || recipe.weights.length !== recipe.positionCount ||
          !recipe.weights.every(w => Number.isFinite(w) && w >= 0 && w <= 1) ||
          !Array.isArray(recipe.primitiveIdentities) || !recipe.primitiveIdentities.length)
        throw Error('五官几何配方坐标或范围不兼容');
      const records = [], identities = recipe.primitiveIdentities, names = new Set();
      for (const identity of identities) {
        if (names.has(identity.materialName)) throw Error('重复五官部件');
        names.add(identity.materialName);
        const meshes = [];
        vrm.scene.traverse(mesh => {
          if (!mesh.isMesh) return;
          const materials = materialsOf(mesh);
          if (materials.some(m => materialName(m) === identity.materialName)) {
            if (!materials.every(m => materialName(m) === identity.materialName)) throw Error('不支持混合五官primitive');
            meshes.push(mesh);
          }
        });
        if (!meshes.length) throw Error('五官源部件缺失：' + identity.materialName);
        const geometries = new Set(meshes.map(mesh => mesh.geometry));
        for (const geometry of geometries) {
          if (!geometry.morphTargetsRelative || geometry.getAttribute('position')?.count !== recipe.positionCount ||
              geometry.getAttribute('position')?.itemSize !== 3 || geometry.getAttribute('normal')?.itemSize !== 3 ||
              geometry.getAttribute('normal')?.count !== recipe.positionCount ||
              geometry.morphAttributes.position?.length !== identity.targetCount)
            throw Error('五官源网格/表情格式不匹配');
          const position = packed(geometry.getAttribute('position')), index = packed(geometry.index), uv = packed(geometry.getAttribute('uv'));
          if (!(position instanceof Float32Array) || index.length % 3 || index.some(i => i >= recipe.positionCount) ||
              await digest(position) !== identity.positionSha256 || await digest(position) !== recipe.basePositionSha256 ||
              await digest(index) !== identity.indexSha256 || await digest(uv) !== identity.uvSha256)
            throw Error('五官源属性身份不匹配：' + identity.materialName);
          const morphs = geometry.morphAttributes.position.map(attribute => {
            if (attribute.count !== recipe.positionCount || attribute.itemSize !== 3) throw Error('口型顶点数不匹配');
            const values = packed(attribute);
            if (!values.every(Number.isFinite)) throw Error('口型数据非有限');
            return values;
          });
          records.push({ geometry, meshes: meshes.filter(mesh => mesh.geometry === geometry), identity, position, index, morphs });
        }
      }
      const originals = new Set(records.map(r => r.geometry));
      if (originals.size !== records.length) throw Error('不同五官primitive共用不兼容索引');
      const first = records[0], fullIndices = [], seen = new Set();
      for (const record of records) {
        // Outlines may have separate geometry objects. Count each actual source
        // primitive once for the full-face normal calculation.
        if (!seen.has(record.identity.primitiveIndex)) { seen.add(record.identity.primitiveIndex); fullIndices.push(...record.index); }
        if (record.morphs.length !== first.morphs.length || record.morphs.some((values, j) => values.some((v, i) => v !== first.morphs[j][i])))
          throw Error('五官primitive表情缓冲不一致');
      }
      const affected = new Set();
      for (let i = 0; i < fullIndices.length; i += 3) {
        const tri = fullIndices.slice(i, i + 3);
        if (tri.some(v => recipe.weights[v] > 0)) tri.forEach(v => affected.add(v));
      }
      if (disposed) throw Error('人物已卸载');
      prepared = { recipe, entry, records, fullIndices, affected, first }; available = true;
      return prepared;
    })().finally(() => { preparation = null; });
    return preparation;
  }

  async function prepareBrow() {
    if (browPrepared) return browPrepared;
    if (browPreparation) return browPreparation;
    browPreparation = (async () => {
      await prepare();
      const response = await fetch(BROW_BASE_URL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`眉位配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-brow-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知眉位清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无眉位样件适配');
      const entry = entries[0];
      if (entry.sampleId !== BROW_SAMPLE || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('眉位配方身份无效');
      const fetched = await fetch(BROW_BASE_URL + entry.file);
      if (!fetched.ok) throw Error(`眉位配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('眉位配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-brow-translation-recipe-v1' || recipe.id !== entry.id ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || recipe.coordinateSpace !== 'glTF-mesh-local-metres' ||
          recipe.sampleId !== BROW_SAMPLE || recipe.sourceRecipeSha256 !== entry.sourceRecipeSha256 ||
          recipe.testedCombinedEndpoint?.length !== 2 || recipe.testedCombinedEndpoint.some(v => v !== .001) ||
          recipe.mouthRecipe?.sha256 !== prepared.entry.sha256 || !Array.isArray(recipe.primitiveIdentities) ||
          recipe.primitiveIdentities.length !== original.primitiveIdentities.length)
        throw Error('眉位配方坐标或共底身份不匹配');
      for (const identity of original.primitiveIdentities) {
        const candidate = recipe.primitiveIdentities.find(p => p.primitiveIndex === identity.primitiveIndex);
        if (!candidate || ['materialName','indexSha256','positionSha256','uvSha256','targetCount'].some(k => candidate[k] !== identity[k]))
          throw Error('眉位源primitive身份不匹配');
      }
      const ids = new Set(recipe.browVertices);
      if (!Array.isArray(recipe.browVertices) || ids.size !== 110 || ids.size !== recipe.browVertices.length ||
          [...ids].some(i => !Number.isInteger(i) || i < 0 || i >= original.positionCount)) throw Error('眉位选择集不匹配');
      for (const field of ['heightVectors','spacingVectors'])
        if (!Array.isArray(recipe[field]) || recipe[field].length !== original.positionCount ||
            recipe[field].some(v => !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite))) throw Error('眉位向量无效');
      const browRecord = prepared.records.find(r => r.identity.materialName.includes('_FaceBrow_'));
      if (!browRecord || new Set(browRecord.index).size !== ids.size || [...browRecord.index].some(i => !ids.has(i))) throw Error('眉位选择集不属于实际眉片');
      for (let i = 0; i < original.positionCount; i++) {
        const h = recipe.heightVectors[i], s = recipe.spacingVectors[i], selected = ids.has(i);
        if (selected ? (original.weights[i] !== 0 || h[0] !== 0 || h[1] !== 1 || h[2] !== 0 || Math.abs(s[0]) !== 1 || s[1] !== 0 || s[2] !== 0) : [...h,...s].some(v => v !== 0))
          throw Error('眉位平移超出已验区域');
      }
      // Constant translation per triangle preserves source shading, including
      // authored expression normals; it must not drag skin or eye vertices.
      for (let i = 0; i < browRecord.index.length; i += 3) {
        const [a,b,c] = browRecord.index.slice(i,i+3);
        if (recipe.spacingVectors[a][0] !== recipe.spacingVectors[b][0] || recipe.spacingVectors[a][0] !== recipe.spacingVectors[c][0]) throw Error('眉片跨侧平移不兼容');
      }
      if (disposed) throw Error('人物已卸载');
      browPrepared = { recipe, entry }; return browPrepared;
    })().finally(() => { browPreparation = null; });
    return browPreparation;
  }

  async function prepareNose() {
    if (nosePrepared) return nosePrepared;
    if (nosePreparation) return nosePreparation;
    nosePreparation = (async () => {
      await prepare();
      const response = await fetch(NOSE_BASE_URL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`鼻部配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-nose-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知鼻部清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无鼻部样件适配');
      const entry = entries[0];
      if (entry.sampleId !== NOSE_SAMPLE || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('鼻部配方身份无效');
      const fetched = await fetch(NOSE_BASE_URL + entry.file);
      if (!fetched.ok) throw Error(`鼻部配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('鼻部配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-geometry-displacement-recipe-v1' || recipe.id !== entry.id ||
          recipe.sampleId !== NOSE_SAMPLE || recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || recipe.sourceSpace !== 'glTF mesh-local metres' ||
          recipe.fixedEndpoint !== .0005 || recipe.mouthRecipeSha256 !== prepared.entry.sha256 ||
          !Array.isArray(recipe.primitiveIdentities) || recipe.primitiveIdentities.length !== original.primitiveIdentities.length ||
          !Array.isArray(recipe.sourceMorphPositionSha256) || recipe.sourceMorphPositionSha256.length !== prepared.first.morphs.length ||
          !Array.isArray(recipe.expressionNames) || new Set(recipe.expressionNames).size !== prepared.first.morphs.length)
        throw Error('鼻部配方坐标或共底身份不匹配');
      for (const identity of original.primitiveIdentities) {
        const candidate = recipe.primitiveIdentities.find(p => p.primitiveIndex === identity.primitiveIndex);
        if (!candidate || ['materialName','indexSha256','positionSha256','uvSha256','targetCount'].some(k => candidate[k] !== identity[k])) throw Error('鼻部源primitive身份不匹配');
        for (const record of prepared.records.filter(r => r.identity.primitiveIndex === identity.primitiveIndex))
          if (await digest(packed(record.geometry.getAttribute('normal'))) !== candidate.normalSha256 || candidate.normalSha256 !== recipe.baseNormalSha256) throw Error('鼻部原法线身份不匹配');
      }
      for (let i = 0; i < prepared.first.morphs.length; i++)
        if (await digest(prepared.first.morphs[i]) !== recipe.sourceMorphPositionSha256[i]) throw Error('鼻部表情原数据身份不匹配');
      if (!Array.isArray(recipe.weights) || recipe.weights.length !== original.positionCount ||
          !recipe.weights.every(w => Number.isFinite(w) && w >= 0 && w <= 1) ||
          !Array.isArray(recipe.translationVectors) || recipe.translationVectors.length !== original.positionCount)
        throw Error('鼻部位移向量无效');
      const changed = new Set();
      for (let i = 0; i < original.positionCount; i++) {
        const t = recipe.translationVectors[i], w = recipe.weights[i];
        if (!Array.isArray(t) || t.length !== 3 || !t.every(Number.isFinite) || t[0] !== 0 || t[1] !== 0 || Math.abs(t[2] + .0005*w) > 1e-12 || (w > 0 && original.weights[i] !== 0)) throw Error('鼻部位移超出已制作端点');
        if (w > 0) changed.add(i);
      }
      const equalsSet = (list, set) => Array.isArray(list) && list.length === set.size && new Set(list).size === set.size && list.every(i => set.has(i));
      if (!changed.size || !equalsSet(recipe.changedVertices, changed)) throw Error('鼻部选择集不匹配');
      const skin = prepared.records.find(r => r.identity.materialName.endsWith('_Face_00_SKIN'));
      const skinVertices = new Set(skin?.index || []);
      if ([...changed].some(i => !skinVertices.has(i))) throw Error('鼻部选择集超出实际面部皮肤');
      const protectedVertices = new Set(Array.from({length:original.positionCount},(_,i)=>i).filter(i=>!changed.has(i)));
      if (!equalsSet(recipe.protectedVertices, protectedVertices)) throw Error('鼻部保护区不匹配');
      const affected = new Set();
      for (let i = 0; i < prepared.fullIndices.length; i += 3) {
        const tri = prepared.fullIndices.slice(i,i+3);
        if (tri.some(v => changed.has(v))) tri.forEach(v=>affected.add(v));
      }
      if (!equalsSet(recipe.normalNeighborhoodVertices, affected)) throw Error('鼻部法线邻域不匹配');
      if (disposed) throw Error('人物已卸载');
      nosePrepared = { recipe, entry, changed, affected }; return nosePrepared;
    })().finally(() => { nosePreparation = null; });
    return nosePreparation;
  }


  async function prepareEye() {
    if (eyePrepared) return eyePrepared;
    if (eyePreparation) return eyePreparation;
    eyePreparation = (async () => {
      await prepare();
      const response = await fetch(EYE_BASE_URL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`眼部配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-eye-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知眼部清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无眼裂样件适配');
      const entry = entries[0];
      if (entry.sampleId !== EYE_SAMPLE || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('眼部配方身份无效');
      const fetched = await fetch(EYE_BASE_URL + entry.file);
      if (!fetched.ok) throw Error(`眼部配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('眼部配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-geometry-affine-recipe-v1' || recipe.id !== entry.id ||
          recipe.sampleId !== EYE_SAMPLE || recipe.parameter !== 'eyeApertureWidthFactor' || recipe.default !== 1 || recipe.fixedEndpoint !== 1.01 ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || recipe.sourceSpace !== 'glTF mesh-local metres' ||
          recipe.existingRecipeIdentities?.mouth?.sha256 !== prepared.entry.sha256 ||
          !Array.isArray(recipe.primitiveIdentities) || recipe.primitiveIdentities.length !== original.primitiveIdentities.length ||
          !Array.isArray(recipe.sourceMorphPositionSha256) || recipe.sourceMorphPositionSha256.length !== prepared.first.morphs.length ||
          !Array.isArray(recipe.expressionNames) || new Set(recipe.expressionNames).size !== prepared.first.morphs.length)
        throw Error('眼部配方坐标或共底身份不匹配');
      for (const identity of original.primitiveIdentities) {
        const candidate = recipe.primitiveIdentities.find(p => p.primitiveIndex === identity.primitiveIndex);
        if (!candidate || ['materialName','indexSha256','positionSha256','uvSha256','targetCount'].some(k => candidate[k] !== identity[k])) throw Error('眼部源primitive身份不匹配');
        for (const record of prepared.records.filter(r => r.identity.primitiveIndex === identity.primitiveIndex))
          if (await digest(packed(record.geometry.getAttribute('normal'))) !== candidate.normalSha256 || candidate.normalSha256 !== recipe.baseNormalSha256) throw Error('眼部原法线身份不匹配');
      }
      for (let i = 0; i < prepared.first.morphs.length; i++)
        if (await digest(prepared.first.morphs[i]) !== recipe.sourceMorphPositionSha256[i]) throw Error('眼部表情原数据身份不匹配');
      for (const field of ['xScale','centerX'])
        if (!Array.isArray(recipe[field]) || recipe[field].length !== original.positionCount || !recipe[field].every(Number.isFinite)) throw Error('眼部仿射数据无效');
      const changed = new Set(), allowed = new Set(), protectedParts = new Set();
      for (const record of prepared.records) {
        const permitted = /_(Face_00_SKIN|EyeWhite_00_EYE|FaceEyeline_00_FACE|FaceEyelash_00_FACE)$/.test(record.identity.materialName);
        for (const i of record.index) (permitted ? allowed : protectedParts).add(i);
      }
      for (let i = 0; i < original.positionCount; i++) {
        const scale = recipe.xScale[i], center = recipe.centerX[i];
        if (scale < 1 || scale > 1.01 || Math.abs(center) > .2 || (scale === 1 && center !== 0)) throw Error('眼部仿射超出唯一端点');
        if (scale !== 1) {
          if (!allowed.has(i) || protectedParts.has(i) || original.weights[i] !== 0) throw Error('眼部选择集侵犯保护区域');
          changed.add(i);
        }
      }
      const equalsSet = (list, set) => Array.isArray(list) && list.length === set.size && new Set(list).size === set.size && list.every(i => set.has(i));
      if (!changed.size || !equalsSet(recipe.selectedVertices, changed)) throw Error('眼部选择集不匹配');
      const protectedVertices = new Set(Array.from({length:original.positionCount},(_,i)=>i).filter(i=>!changed.has(i)));
      if (!equalsSet(recipe.protectedVertices, protectedVertices)) throw Error('眼部保护区不匹配');
      const affected = new Set();
      for (let i = 0; i < prepared.fullIndices.length; i += 3) {
        const tri = prepared.fullIndices.slice(i,i+3);
        if (tri.some(v => changed.has(v))) tri.forEach(v=>affected.add(v));
      }
      if (!equalsSet(recipe.normalNeighborhoodVertices, affected) || [...affected].some(i => protectedParts.has(i) || prepared.affected.has(i))) throw Error('眼部法线邻域或保护不匹配');
      if (!Array.isArray(recipe.skinWhitePairs) || recipe.skinWhitePairs.length !== 48) throw Error('眼部接缝映射缺失');
      for (const pair of recipe.skinWhitePairs) {
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some(i=>!changed.has(i))) throw Error('眼部接缝映射无效');
        const [a,b] = pair;
        if (recipe.xScale[a] !== recipe.xScale[b] || recipe.centerX[a] !== recipe.centerX[b] ||
            [0,1,2].some(c=>Math.abs(prepared.first.position[a*3+c]-prepared.first.position[b*3+c])>1e-6)) throw Error('眼部接缝仿射不连续');
      }
      if (disposed) throw Error('人物已卸载');
      eyePrepared = { recipe, entry, changed, affected }; return eyePrepared;
    })().finally(() => { eyePreparation = null; });
    return eyePreparation;
  }

  function restore() {
    for (const record of prepared?.records || []) for (const mesh of record.meshes)
      if (mesh.geometry === owned.get(record.geometry)) mesh.geometry = record.geometry;
    for (const geometry of owned.values()) geometry.dispose();
    owned.clear(); mouthWidth = 0; browSample = 'none'; noseSample = 'none'; eyeSample = 'none';
  }

  async function apply(value, brow, nose, eye, request) {
    const { recipe, records, fullIndices, first } = prepared;
    const affected = new Set(value !== 0 ? prepared.affected : []);
    if (nose !== 'none') for (const i of nosePrepared.affected) affected.add(i);
    if (eye !== 'none') {
      if ((nose !== 'none' && [...eyePrepared.affected].some(i=>nosePrepared.affected.has(i))) ||
          (brow !== 'none' && browPrepared.recipe.browVertices.some(i=>eyePrepared.affected.has(i)))) throw Error('眼部与其他参数域不兼容');
      for (const i of eyePrepared.affected) affected.add(i);
    }
    const recomputeNormals = affected.size > 0;
    for (const record of records) for (const mesh of record.meshes)
      if (mesh.geometry !== record.geometry && mesh.geometry !== owned.get(record.geometry)) throw Error('五官网格被其他操作替换');
    const position = first.position.slice(), morphs = first.morphs.map(values => values.slice());
    for (let i = 0; i < recipe.positionCount; i++) {
      const scale = 1 + value * recipe.weights[i];
      if (scale === 1) continue; // Keep protected source components bit-exact.
      position[i * 3] = recipe.centerX + (first.position[i * 3] - recipe.centerX) * scale;
      for (const values of morphs) values[i * 3] *= scale;
    }
    if (nose !== 'none') for (const i of nosePrepared.changed) for (let c = 0; c < 3; c++)
      position[i*3+c] += nosePrepared.recipe.translationVectors[i][c];
    if (eye !== 'none') for (const i of eyePrepared.changed) {
      const {xScale,centerX} = eyePrepared.recipe;
      position[i*3] = centerX[i] + (first.position[i*3] - centerX[i]) * xScale[i];
      for (const values of morphs) values[i*3] *= xScale[i];
    }
    const baseNormals = recomputeNormals ? normals(position, fullIndices) : null;
    const targetNormals = recomputeNormals ? morphs.map(values => {
      const absolute = position.map((v, i) => v + values[i]);
      return normals(absolute, fullIndices);
    }) : null;
    if (brow !== 'none') {
      const {heightVectors,spacingVectors,browVertices} = browPrepared.recipe;
      for (const i of browVertices) for (let c = 0; c < 3; c++)
        position[i*3+c] += .001 * (heightVectors[i][c] + spacingVectors[i][c]);
    }
    // All admitted primitives share these full-face POSITION buffers. Reuse
    // actor-owned attributes; do not recompute identical normal sets/bounds per
    // material primitive or create subarray/iterators inside every component.
    const positionAttribute=new THREE.BufferAttribute(position,3);
    const morphAttributes=morphs.map(values=>new THREE.BufferAttribute(values,3));
    const normalSets=new Map();
    const next = new Map();
    let bounds=null;
    try {
      for (const record of records) {
        const geometry = record.geometry.clone(); next.set(record.geometry, geometry);
        geometry.setAttribute('position',positionAttribute);
        geometry.morphAttributes.position=morphAttributes;
        const normalKey=record.geometry.morphAttributes.normal ? record.geometry : record.geometry.getAttribute('normal');
        let normalSet=normalSets.get(normalKey);
        if(!normalSet && recomputeNormals){
          const n=packed(record.geometry.getAttribute('normal'));
          for(const i of affected){const k=i*3;if(baseNormals[k]||baseNormals[k+1]||baseNormals[k+2]){n[k]=baseNormals[k];n[k+1]=baseNormals[k+1];n[k+2]=baseNormals[k+2];}}
          const targets=targetNormals.map((absolute,j)=>{
            const original=record.geometry.morphAttributes.normal?.[j],delta=original?packed(original):new Float32Array(n.length);
            for(const i of affected){const k=i*3,valid=absolute[k]||absolute[k+1]||absolute[k+2];for(let c=0;c<3;c++)delta[k+c]=valid?absolute[k+c]-n[k+c]:0;}
            return new THREE.BufferAttribute(delta,3);
          });
          normalSet={base:new THREE.BufferAttribute(n,3),targets};normalSets.set(normalKey,normalSet);
        }
        if(normalSet){geometry.setAttribute('normal',normalSet.base);geometry.morphAttributes.normal=normalSet.targets;}
        if(!bounds){geometry.computeBoundingBox();geometry.computeBoundingSphere();bounds={box:geometry.boundingBox,sphere:geometry.boundingSphere};}
        else{geometry.boundingBox=bounds.box.clone();geometry.boundingSphere=bounds.sphere.clone();}
      }
      if(prepareRender)await prepareRender(records.flatMap(record=>record.meshes.map(mesh=>({mesh,geometry:next.get(record.geometry)}))));
      if(disposed||request!==generation){for(const geometry of next.values())geometry.dispose();return false;}
    } catch (e) { for (const geometry of next.values()) geometry.dispose(); throw e; }
    // No await and no change to meshes/morphTargetInfluences: VRM expression
    // bindings continue to target the same actor and the same morph indices.
    for (const record of records) for (const mesh of record.meshes) mesh.geometry = next.get(record.geometry);
    for (const geometry of owned.values()) geometry.dispose();
    owned = next; mouthWidth = value;browSample = brow;noseSample = nose;eyeSample = eye;return true;
  }

  async function set(input = {}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const value = input.reset ? 0 : input.mouthWidth ?? wanted;
    const brow = input.reset ? 'none' : input.browSample ?? wantedBrow;
    const nose = input.reset ? 'none' : input.noseSample ?? wantedNose;
    const eye = input.reset ? 'none' : input.eyeSample ?? wantedEye;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -.04 || value > .04)
      return { applied: false, reason: '嘴宽范围为 -0.04 到 0.04' };
    if (brow !== 'none' && brow !== BROW_SAMPLE) return { applied: false, reason: '眉位仅支持原位或 +1 毫米组合样件' };
    if (nose !== 'none' && nose !== NOSE_SAMPLE) return { applied: false, reason: '鼻部仅支持原位或鼻尖突出 0.5 毫米样件' };
    if (eye !== 'none' && eye !== EYE_SAMPLE) return { applied: false, reason: '眼部仅支持原位或眼裂宽 +1% 样件' };
    wanted = value; wantedBrow = brow; wantedNose = nose; wantedEye = eye; const request = ++generation; error = null;
    try {
      if (value !== 0 || brow !== 'none' || nose !== 'none' || eye !== 'none') {
        if (!available) throw Error('当前身体尚无嘴宽几何适配');
        loading = true; await prepare();
        if (value !== 0 && input.expectedRecipeSha256 != null && input.expectedRecipeSha256 !== prepared.entry.sha256)
          throw Error('保存配方的五官几何版本不匹配');
      }
      if (brow !== 'none') {
        await prepareBrow();
        if (input.expectedBrowRecipeSha256 != null && input.expectedBrowRecipeSha256 !== browPrepared.entry.sha256) throw Error('保存配方的眉位版本不匹配');
      }
      if (nose !== 'none') {
        await prepareNose();
        if (input.expectedNoseRecipeSha256 != null && input.expectedNoseRecipeSha256 !== nosePrepared.entry.sha256) throw Error('保存配方的鼻部版本不匹配');
      }
      if (eye !== 'none') {
        await prepareEye();
        if (input.expectedEyeRecipeSha256 != null && input.expectedEyeRecipeSha256 !== eyePrepared.entry.sha256) throw Error('保存配方的眼部版本不匹配');
      }
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      if (value === 0 && brow === 'none' && nose === 'none' && eye === 'none') restore(); else if ((value !== mouthWidth || brow !== browSample || nose !== noseSample || eye !== eyeSample) && !await apply(value,brow,nose,eye,request))return{applied:false,cancelled:true};
      loading = false; return { applied: true };
    } catch (e) {
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      error = e.message; loading = false; wanted = mouthWidth; wantedBrow = browSample; wantedNose = noseSample; wantedEye = eyeSample;
      return { applied: false, reason: error };
    }
  }

  return {
    set,
    getState: () => ({ mouthWidth, requestedMouthWidth: wanted, available, loading, error, revision:generation,
      browSample, requestedBrowSample: wantedBrow, browAvailable: available,
      browRecipeId: browPrepared?.entry.id || null, browRecipeSha256: browPrepared?.entry.sha256 || null,
      noseSample, requestedNoseSample: wantedNose, noseAvailable: available,
      noseRecipeId: nosePrepared?.entry.id || null, noseRecipeSha256: nosePrepared?.entry.sha256 || null,
      eyeSample, requestedEyeSample: wantedEye, eyeAvailable: available,
      eyeRecipeId: eyePrepared?.entry.id || null, eyeRecipeSha256: eyePrepared?.entry.sha256 || null,
      recipeId: prepared?.entry.id || null, recipeSha256: prepared?.entry.sha256 || null, baseAvatarSha256: avatarSha256, facialGeometryLoading: loading,
      facialGeometryError: error, facialGeometryAvailable: available, facialGeometryCloneCount: owned.size,
      geometryIdentity: { baseAvatarSha256: avatarSha256, recipeSha256: prepared?.entry.sha256 || null, mouthWidth, browSample, browRecipeSha256: browPrepared?.entry.sha256 || null, noseSample, noseRecipeSha256:nosePrepared?.entry.sha256||null, eyeSample, eyeRecipeSha256:eyePrepared?.entry.sha256||null } }),
    dispose() { disposed = true; generation++; loading = false; wanted = 0; wantedBrow = 'none'; wantedNose = 'none'; wantedEye = 'none'; restore(); },
  };
}
