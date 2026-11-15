import * as THREE from 'three';

const MANIFEST_URL = '/assets/face-parameters-v1/recipe-manifest.json';
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
export function createFacialGeometry({ vrm, avatarSha256 }) {
  let prepared = null, preparation = null, disposed = false, generation = 0;
  let mouthWidth = 0, wanted = 0, loading = false, error = null, available = ADMITTED_BASES.has(avatarSha256);
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

  function restore() {
    for (const record of prepared?.records || []) for (const mesh of record.meshes)
      if (mesh.geometry === owned.get(record.geometry)) mesh.geometry = record.geometry;
    for (const geometry of owned.values()) geometry.dispose();
    owned.clear(); mouthWidth = 0;
  }

  function apply(value) {
    const { recipe, records, fullIndices, affected, first } = prepared;
    for (const record of records) for (const mesh of record.meshes)
      if (mesh.geometry !== record.geometry && mesh.geometry !== owned.get(record.geometry)) throw Error('五官网格被其他操作替换');
    const position = first.position.slice(), morphs = first.morphs.map(values => values.slice());
    for (let i = 0; i < recipe.positionCount; i++) {
      const scale = 1 + value * recipe.weights[i];
      position[i * 3] = recipe.centerX + (first.position[i * 3] - recipe.centerX) * scale;
      for (const values of morphs) values[i * 3] *= scale;
    }
    const baseNormals = normals(position, fullIndices);
    const targetNormals = morphs.map(values => {
      const absolute = position.map((v, i) => v + values[i]);
      return normals(absolute, fullIndices);
    });
    const next = new Map();
    try {
      for (const record of records) {
        const geometry = record.geometry.clone(); next.set(record.geometry, geometry);
        geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(), 3));
        geometry.morphAttributes.position = morphs.map(values => new THREE.BufferAttribute(values.slice(), 3));
        const n = packed(record.geometry.getAttribute('normal'));
        for (const i of affected) if (Math.hypot(...baseNormals.subarray(i * 3, i * 3 + 3)) > 0)
          n.set(baseNormals.subarray(i * 3, i * 3 + 3), i * 3);
        geometry.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        geometry.morphAttributes.normal = targetNormals.map((absolute, j) => {
          const original = record.geometry.morphAttributes.normal?.[j];
          const delta = original ? packed(original) : new Float32Array(n.length);
          for (const i of affected) for (let c = 0; c < 3; c++)
            delta[i * 3 + c] = Math.hypot(...absolute.subarray(i * 3, i * 3 + 3)) > 0 ? absolute[i * 3 + c] - n[i * 3 + c] : 0;
          return new THREE.BufferAttribute(delta, 3);
        });
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      }
    } catch (e) { for (const geometry of next.values()) geometry.dispose(); throw e; }
    // No await and no change to meshes/morphTargetInfluences: VRM expression
    // bindings continue to target the same actor and the same morph indices.
    for (const record of records) for (const mesh of record.meshes) mesh.geometry = next.get(record.geometry);
    for (const geometry of owned.values()) geometry.dispose();
    owned = next; mouthWidth = value;
  }

  async function set(input = {}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const value = input.reset ? 0 : input.mouthWidth ?? wanted;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -.04 || value > .04)
      return { applied: false, reason: '嘴宽范围为 -0.04 到 0.04' };
    wanted = value; const request = ++generation; error = null;
    try {
      if (value !== 0) {
        if (!available) throw Error('当前身体尚无嘴宽几何适配');
        loading = true; await prepare();
        if (input.expectedRecipeSha256 != null && input.expectedRecipeSha256 !== prepared.entry.sha256)
          throw Error('保存配方的五官几何版本不匹配');
      }
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      if (value === 0) restore(); else if (value !== mouthWidth) apply(value);
      loading = false; return { applied: true };
    } catch (e) {
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      error = e.message; loading = false; wanted = mouthWidth;
      return { applied: false, reason: error };
    }
  }

  return {
    set,
    getState: () => ({ mouthWidth, requestedMouthWidth: wanted, available, loading, error,
      recipeId: prepared?.entry.id || null, recipeSha256: prepared?.entry.sha256 || null, baseAvatarSha256: avatarSha256, facialGeometryLoading: loading,
      facialGeometryError: error, facialGeometryAvailable: available, facialGeometryCloneCount: owned.size,
      geometryIdentity: { baseAvatarSha256: avatarSha256, recipeSha256: prepared?.entry.sha256 || null, mouthWidth } }),
    dispose() { disposed = true; generation++; loading = false; wanted = 0; restore(); },
  };
}
