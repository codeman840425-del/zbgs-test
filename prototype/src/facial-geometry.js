import * as THREE from 'three';
import {FACIAL_GEOMETRY_PROFILES} from './facial-geometry-profiles.js';
import {facialGeometryCapability,facialSampleResource,resolveFacialGeometrySelection} from './facial-geometry-selection.js';
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
function normalNeighborhood(indices, vertices) {
  // Keep original triangle order and every face incident to an output vertex.
  // Filtering only triangles with moved vertices would omit unchanged faces
  // which still contribute to the normals at the boundary of the edit.
  const selected=[];
  for(let i=0;i<indices.length;i+=3)
    if(vertices.has(indices[i])||vertices.has(indices[i+1])||vertices.has(indices[i+2]))
      selected.push(indices[i],indices[i+1],indices[i+2]);
  return selected;
}
function normals(position, indices, precise = false, vertices) {
  const result = precise ? new Float64Array(position.length) : new Float32Array(position.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { result[v] += nx; result[v + 1] += ny; result[v + 2] += nz; }
  }
  for (const vertex of vertices) {
    const i=vertex*3;
    const length = Math.hypot(result[i], result[i + 1], result[i + 2]);
    if (length > 1e-20) { result[i] /= length; result[i + 1] /= length; result[i + 2] /= length; }
  }
  return result;
}

/** Source-authored mouth-width recipe. Each value derives from immutable
 * originals. Existing VRM expressions, bones and material references are kept. */
export function createFacialGeometry({ vrm, avatarSha256, prepareRender, renderCompaction }) {
  let prepared = null, preparation = null, disposed = false, generation = 0;
  const admission=FACIAL_GEOMETRY_PROFILES[avatarSha256];
  const geometryCapability=facialGeometryCapability(avatarSha256);
  const mouthAdmission=admission?.mouth;
  const browAvailable=!!admission?.brow,noseAvailable=!!admission?.nose,eyeAvailable=!!admission?.eye;
  let mouthWidth = 0, wanted = 0, loading = false, error = null, available = !!mouthAdmission;
  let browSample = 'none', wantedBrow = 'none', browPrepared = null;
  let noseSample = 'none', wantedNose = 'none', nosePrepared = null;
  let eyeSample = 'none', wantedEye = 'none', eyePrepared = null;
  let owned = new Map(), currentMouth = null;
  let visibleMouth = null, visibleMouthJob = null;
  const domainCache = {brow:new Map(),nose:new Map(),eye:new Map()};
  const domainJobs = {brow:new Map(),nose:new Map(),eye:new Map()};
  const pendingUpdates = new Set();
  function domainConfig(domain,sample) {
    const source=facialSampleResource(avatarSha256,domain,sample);
    return source?{...source,recipeSha:source.recipeSha256,mouthSha:source.mouthRecipeSha256}:null;
  }
  function samplesFor(domain,enabled){return enabled?[...geometryCapability[domain+'Samples']]:['none'];}
  async function verifyCompleteSource(recipe){
    const original=prepared.recipe;
    if(recipe.baseAvatarSha256!==avatarSha256||recipe.basePositionSha256!==original.basePositionSha256||recipe.positionCount!==original.positionCount||
       !Array.isArray(recipe.primitiveIdentities)||recipe.primitiveIdentities.length!==original.primitiveIdentities.length)throw Error('新增五官算子共底身份不匹配');
    for(const identity of original.primitiveIdentities){
      const candidate=recipe.primitiveIdentities.find(p=>p.primitiveIndex===identity.primitiveIndex);
      if(!candidate||['materialName','indexSha256','positionSha256','uvSha256','targetCount'].some(k=>candidate[k]!==identity[k]))throw Error('新增五官源primitive身份不匹配');
      for(const record of prepared.records.filter(r=>r.identity.primitiveIndex===identity.primitiveIndex))
        if(await digest(packed(record.geometry.getAttribute('normal')))!==candidate.normalSha256||candidate.normalSha256!==recipe.baseNormalSha256)throw Error('新增五官原法线身份不匹配');
    }
    if(!Array.isArray(recipe.sourceMorphPositionSha256)||recipe.sourceMorphPositionSha256.length!==prepared.first.morphs.length)throw Error('新增五官表情身份缺失');
    for(let i=0;i<prepared.first.morphs.length;i++)if(await digest(prepared.first.morphs[i])!==recipe.sourceMorphPositionSha256[i])throw Error('新增五官表情身份不匹配');
  }
  async function prepareVisibleMouth(){
    if(visibleMouth)return visibleMouth;
    if(visibleMouthJob)return visibleMouthJob;
    visibleMouthJob=(async()=>{
      await prepare();const config=mouthAdmission.visible;
      if(!config)throw Error('此身体尚无大幅嘴宽样件');
      const response=await fetch(config.baseURL+'recipe-manifest.json');if(!response.ok)throw Error('大幅嘴宽清单加载失败');
      const manifest=await response.json(),entries=manifest.recipes?.filter(e=>e.baseAvatarSha256===avatarSha256);
      if(manifest.schema!=='character-face-geometry-recipes-v1'||entries?.length!==1)throw Error('大幅嘴宽清单身份不匹配');
      const entry=entries[0];if(entry.sha256!==config.recipeSha256||!/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)||JSON.stringify(entry.supportedValues)!==JSON.stringify(config.supportedValues))throw Error('大幅嘴宽配方登记不匹配');
      const fetched=await fetch(config.baseURL+entry.file);if(!fetched.ok)throw Error('大幅嘴宽配方加载失败');
      const bytes=await fetched.arrayBuffer();if(await digest(bytes)!==entry.sha256)throw Error('大幅嘴宽配方校验失败');
      const recipe=JSON.parse(new TextDecoder().decode(bytes));
      if(recipe.schema!=='character-face-geometry-recipe-v1'||recipe.id!==entry.id||recipe.parameter!=='mouthWidth'||recipe.sourceAxis!=='glTF mesh-local X'||recipe.sourceSpace!=='glTF mesh-local metres'||
         JSON.stringify(recipe.range)!==JSON.stringify(config.range)||JSON.stringify(recipe.supportedValues)!==JSON.stringify(config.supportedValues)||!Number.isFinite(recipe.centerX)||
         !Array.isArray(recipe.weights)||recipe.weights.length!==prepared.recipe.positionCount||!recipe.weights.every(w=>Number.isFinite(w)&&w>=0&&w<=1))throw Error('大幅嘴宽坐标或端点不兼容');
      await verifyCompleteSource(recipe);
      const affected=new Set();for(let i=0;i<prepared.fullIndices.length;i+=3){const tri=prepared.fullIndices.slice(i,i+3);if(tri.some(v=>recipe.weights[v]>0))tri.forEach(v=>affected.add(v));}
      if(recipe.normalNeighborhoodVertices?.length!==affected.size||new Set(recipe.normalNeighborhoodVertices).size!==affected.size||recipe.normalNeighborhoodVertices.some(i=>!affected.has(i)))throw Error('大幅嘴宽法线邻域不匹配');
      if(disposed)throw Error('人物已卸载');
      visibleMouth={recipe,entry,affected,preciseNormals:true};return visibleMouth;
    })().finally(()=>{visibleMouthJob=null;});
    return visibleMouthJob;
  }

  async function prepare() {
    if (prepared) return prepared;
    if (preparation) return preparation;
    preparation = (async () => {
      const response = await fetch(mouthAdmission.baseURL+'recipe-manifest.json');
      if (!response.ok) throw Error(`五官几何清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-geometry-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知五官几何清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) { available = false; throw Error('当前身体尚无嘴宽几何适配'); }
      const entry = entries[0];
      if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('五官配方身份无效');
      if(mouthAdmission.recipeSha256 && entry.sha256!==mouthAdmission.recipeSha256)throw Error('嘴宽配方登记身份不匹配');
      const fetched = await fetch(mouthAdmission.baseURL + entry.file);
      if (!fetched.ok) throw Error(`五官几何配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('五官几何配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes));
      if (recipe.schema !== 'character-face-geometry-recipe-v1' || recipe.id !== entry.id ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.parameter !== 'mouthWidth' ||
          recipe.sourceAxis !== 'glTF mesh-local X' || recipe.range?.[0] !== mouthAdmission.range[0] || recipe.range?.[1] !== mouthAdmission.range[1] ||
          (mouthAdmission.supportedValues && (JSON.stringify(recipe.supportedValues)!==JSON.stringify(mouthAdmission.supportedValues)||JSON.stringify(entry.supportedValues)!==JSON.stringify(mouthAdmission.supportedValues))) ||
          !Number.isFinite(recipe.centerX) || !Number.isInteger(recipe.positionCount) || recipe.positionCount < 3 ||
          !Array.isArray(recipe.weights) || recipe.weights.length !== recipe.positionCount ||
          !recipe.weights.every(w => Number.isFinite(w) && w >= 0 && w <= 1) ||
          !Array.isArray(recipe.primitiveIdentities) || !recipe.primitiveIdentities.length)
        throw Error('五官几何配方坐标或范围不兼容');
      // Only this preparation transaction reuses immutable source snapshots.
      // VRM expressions change influences, not source attributes. External array,
      // layout or version mutation during preparation is not supported.
      const snapshots = new WeakMap(), validations = new WeakMap();
      const snapshot = attribute => {
        let values = snapshots.get(attribute);
        if (!values) { values = packed(attribute); snapshots.set(attribute, values); validations.set(values, {}); }
        return values;
      };
      const snapshotDigest = values => {
        const result = validations.get(values);
        return result.digest ??= digest(values);
      };
      const snapshotFinite = values => {
        const result = validations.get(values);
        return result.finite ??= values.every(Number.isFinite);
      };
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
        const sourceFor = mesh => renderCompaction?.sourceFor(mesh);
        for(const mesh of meshes){const record=sourceFor(mesh);if(record&&mesh.geometry!==record.renderGeometry)throw Error('五官绘制网格被其他操作替换');}
        const geometries = new Set(meshes.map(mesh => sourceFor(mesh)?.sourceGeometry || mesh.geometry));
        for (const geometry of geometries) {
          if (!geometry.morphTargetsRelative || geometry.getAttribute('position')?.count !== recipe.positionCount ||
              geometry.getAttribute('position')?.itemSize !== 3 || geometry.getAttribute('normal')?.itemSize !== 3 ||
              geometry.getAttribute('normal')?.count !== recipe.positionCount ||
              geometry.morphAttributes.position?.length !== identity.targetCount)
            throw Error('五官源网格/表情格式不匹配');
          const position = snapshot(geometry.getAttribute('position')), index = snapshot(geometry.index), uv = snapshot(geometry.getAttribute('uv'));
          if (!(position instanceof Float32Array) || index.length % 3 || index.some(i => i >= recipe.positionCount) ||
              await snapshotDigest(position) !== identity.positionSha256 || await snapshotDigest(position) !== recipe.basePositionSha256 ||
              await snapshotDigest(index) !== identity.indexSha256 || await snapshotDigest(uv) !== identity.uvSha256)
            throw Error('五官源属性身份不匹配：' + identity.materialName);
          const morphs = geometry.morphAttributes.position.map(attribute => {
            if (attribute.count !== recipe.positionCount || attribute.itemSize !== 3) throw Error('口型顶点数不匹配');
            const values = snapshot(attribute);
            if (!snapshotFinite(values)) throw Error('口型数据非有限');
            return values;
          });
          if(mouthAdmission.verifySourceIdentity){
            if(await snapshotDigest(snapshot(geometry.getAttribute('normal')))!==identity.normalSha256 || identity.normalSha256!==recipe.baseNormalSha256)throw Error('派生嘴宽原法线身份不匹配');
            if(recipe.sourceMorphPositionSha256?.length!==morphs.length)throw Error('派生嘴宽表情身份缺失');
            for(let i=0;i<morphs.length;i++)if(await snapshotDigest(morphs[i])!==recipe.sourceMorphPositionSha256[i])throw Error('派生嘴宽表情身份不匹配');
          }
          const matching=meshes.filter(mesh => (sourceFor(mesh)?.sourceGeometry || mesh.geometry) === geometry);
          const renderGeometry=sourceFor(matching[0])?.renderGeometry || geometry;
          records.push({ geometry, sourceGeometry:geometry, renderGeometry, meshes:matching, identity, position, index, morphs });
        }
      }
      const originals = new Set(records.map(r => r.geometry));
      if (originals.size !== records.length) throw Error('不同五官primitive共用不兼容索引');
      const first = records[0], fullIndices = [], seen = new Set();
      for (const record of records) {
        // Outlines may have separate geometry objects. Count each actual source
        // primitive once for the full-face normal calculation.
        if (!seen.has(record.identity.primitiveIndex)) { seen.add(record.identity.primitiveIndex); fullIndices.push(...record.index); }
        if (record.morphs.length !== first.morphs.length || record.morphs.some((values, j) => values !== first.morphs[j] && values.some((v, i) => v !== first.morphs[j][i])))
          throw Error('五官primitive表情缓冲不一致');
      }
      const affected = new Set();
      for (let i = 0; i < fullIndices.length; i += 3) {
        const tri = fullIndices.slice(i, i + 3);
        if (tri.some(v => recipe.weights[v] > 0)) tri.forEach(v => affected.add(v));
      }
      if(mouthAdmission.verifySourceIdentity && (recipe.normalNeighborhoodVertices?.length!==affected.size || recipe.normalNeighborhoodVertices.some(i=>!affected.has(i))))throw Error('派生嘴宽法线邻域不匹配');
      if (disposed) throw Error('人物已卸载');
      prepared = { recipe, entry, records, fullIndices, affected, first, preciseNormals:mouthAdmission.preciseNormals }; available = true;
      return prepared;
    })().finally(() => { preparation = null; });
    return preparation;
  }

  async function prepareBrow(sample) {
    if(domainCache.brow.has(sample))return domainCache.brow.get(sample);
    if(domainJobs.brow.has(sample))return domainJobs.brow.get(sample);
    const job = (async () => {
      await prepare();const config=domainConfig('brow',sample);if(!config)throw Error('未知五官样件');
      // The raw brow recipe has no per-shape hashes; its pinned companion
      // mouth operator verifies the identical immutable source morphs/normals.
      if(config.visible)await prepareVisibleMouth();
      const response = await fetch(config.baseURL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`眉位配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-brow-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知眉位清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无眉位样件适配');
      const entry = entries[0];
      if(config.recipeSha&&entry.sha256!==config.recipeSha)throw Error('新增五官配方登记身份不匹配');
      if (entry.sampleId !== config.sampleId || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('眉位配方身份无效');
      const fetched = await fetch(config.baseURL + entry.file);
      if (!fetched.ok) throw Error(`眉位配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('眉位配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-brow-translation-recipe-v1' || recipe.id !== entry.id ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || (config.visible?recipe.sourceSpace !== 'glTF mesh-local metres':recipe.coordinateSpace !== 'glTF-mesh-local-metres') ||
          (!config.visible&&(recipe.sampleId !== config.sampleId || recipe.sourceRecipeSha256 !== entry.sourceRecipeSha256)) ||
          recipe.testedCombinedEndpoint?.length !== 2 || recipe.testedCombinedEndpoint.some(v => v !== config.endpoint) ||
          recipe.mouthRecipe?.sha256 !== config.mouthSha || !Array.isArray(recipe.primitiveIdentities) ||
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
      const data={recipe,entry,endpoint:config.endpoint};domainCache.brow.set(sample,data);return data;
    })().finally(()=>{domainJobs.brow.delete(sample);});
    domainJobs.brow.set(sample,job);return job;
  }

  async function prepareNose(sample) {
    if(domainCache.nose.has(sample))return domainCache.nose.get(sample);
    if(domainJobs.nose.has(sample))return domainJobs.nose.get(sample);
    const job = (async () => {
      await prepare();const config=domainConfig('nose',sample);if(!config)throw Error('未知五官样件');
      const response = await fetch(config.baseURL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`鼻部配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-nose-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知鼻部清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无鼻部样件适配');
      const entry = entries[0];
      if(config.recipeSha&&entry.sha256!==config.recipeSha)throw Error('新增五官配方登记身份不匹配');
      if (entry.sampleId !== config.sampleId || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('鼻部配方身份无效');
      const fetched = await fetch(config.baseURL + entry.file);
      if (!fetched.ok) throw Error(`鼻部配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('鼻部配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-geometry-displacement-recipe-v1' || recipe.id !== entry.id ||
          recipe.sampleId !== config.sampleId || recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || recipe.sourceSpace !== 'glTF mesh-local metres' ||
          recipe.fixedEndpoint !== config.endpoint || recipe.mouthRecipeSha256 !== config.mouthSha ||
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
        if (!Array.isArray(t) || t.length !== 3 || !t.every(Number.isFinite) || t[0] !== 0 || t[1] !== 0 || Math.abs(t[2] + config.endpoint*w) > 1e-12 || (w > 0 && original.weights[i] !== 0)) throw Error('鼻部位移超出已制作端点');
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
      const data={recipe,entry,changed,affected,preciseNormals:config.visible};domainCache.nose.set(sample,data);return data;
    })().finally(()=>{domainJobs.nose.delete(sample);});
    domainJobs.nose.set(sample,job);return job;
  }


  async function prepareEye(sample) {
    if(domainCache.eye.has(sample))return domainCache.eye.get(sample);
    if(domainJobs.eye.has(sample))return domainJobs.eye.get(sample);
    const job = (async () => {
      await prepare();const config=domainConfig('eye',sample);if(!config)throw Error('未知五官样件');
      const response = await fetch(config.baseURL + 'recipe-manifest.json');
      if (!response.ok) throw Error(`眼部配方清单加载失败 (${response.status})`);
      const manifest = await response.json();
      if (manifest.schema !== 'character-face-eye-recipes-v1' || !Array.isArray(manifest.recipes)) throw Error('未知眼部清单');
      const entries = manifest.recipes.filter(entry => entry.baseAvatarSha256 === avatarSha256);
      if (entries.length !== 1) throw Error('当前身体尚无眼裂样件适配');
      const entry = entries[0];
      if(config.recipeSha&&entry.sha256!==config.recipeSha)throw Error('新增五官配方登记身份不匹配');
      if (entry.sampleId !== config.sampleId || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^[a-zA-Z0-9_.-]+\.json$/.test(entry.file)) throw Error('眼部配方身份无效');
      const fetched = await fetch(config.baseURL + entry.file);
      if (!fetched.ok) throw Error(`眼部配方加载失败 (${fetched.status})`);
      const bytes = await fetched.arrayBuffer();
      if (await digest(bytes) !== entry.sha256) throw Error('眼部配方校验失败');
      const recipe = JSON.parse(new TextDecoder().decode(bytes)), original = prepared.recipe;
      if (recipe.schema !== 'character-face-geometry-affine-recipe-v1' || recipe.id !== entry.id ||
          recipe.sampleId !== config.sampleId || recipe.parameter !== 'eyeApertureWidthFactor' || recipe.default !== 1 || recipe.fixedEndpoint !== config.endpoint ||
          recipe.baseAvatarSha256 !== avatarSha256 || recipe.basePositionSha256 !== original.basePositionSha256 ||
          recipe.positionCount !== original.positionCount || recipe.sourceSpace !== 'glTF mesh-local metres' ||
          recipe.existingRecipeIdentities?.mouth?.sha256 !== config.mouthSha ||
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
        if (scale < 1 || scale > config.endpoint || Math.abs(center) > .2 || (scale === 1 && center !== 0)) throw Error('眼部仿射超出唯一端点');
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
      const data={recipe,entry,changed,affected,preciseNormals:config.visible};domainCache.eye.set(sample,data);return data;
    })().finally(()=>{domainJobs.eye.delete(sample);});
    domainJobs.eye.set(sample,job);return job;
  }

  function restore() {
    for (const record of prepared?.records || []) for (const mesh of record.meshes)
      if (mesh.geometry === owned.get(record.geometry)) mesh.geometry = record.renderGeometry;
    for (const geometry of owned.values()) geometry.dispose();
    owned.clear(); mouthWidth = 0; browSample = 'none'; noseSample = 'none'; eyeSample = 'none';
  }

  async function apply(value, brow, nose, eye, request, selected) {
    const {records,fullIndices,first}=prepared;
    const {mouth:mouthData,brow:browPrepared,nose:nosePrepared,eye:eyePrepared}=selected;
    const {recipe}=mouthData;
    const affected = new Set(value !== 0 ? mouthData.affected : []);
    if((nose!=='none'&&[...nosePrepared.changed].some(i=>recipe.weights[i]>0))||
       (brow!=='none'&&browPrepared.recipe.browVertices.some(i=>recipe.weights[i]>0)))throw Error('嘴部与其他参数位置域不兼容');
    if (nose !== 'none') for (const i of nosePrepared.affected) affected.add(i);
    if (eye !== 'none') {
      if ((value!==0&&[...eyePrepared.affected].some(i=>mouthData.affected.has(i))) || (nose !== 'none' && [...eyePrepared.affected].some(i=>nosePrepared.affected.has(i))) ||
          (brow !== 'none' && browPrepared.recipe.browVertices.some(i=>eyePrepared.affected.has(i)))) throw Error('眼部与其他参数域不兼容');
      for (const i of eyePrepared.affected) affected.add(i);
    }
    // Select by actual referenced vertices, never material names. Unreferenced
    // full-face buffer components may differ without changing a primitive.
    const touched = new Set(affected);
    if(value !== 0) recipe.weights.forEach((weight,i)=>{if(weight>0)touched.add(i);});
    if(brow !== 'none') for(const i of browPrepared.recipe.browVertices)touched.add(i);
    if(nose !== 'none') for(const i of nosePrepared.changed)touched.add(i);
    if(eye !== 'none') for(const i of eyePrepared.changed)touched.add(i);
    const activeRecords = records.filter(record=>record.index.some(i=>touched.has(i)));
    const recomputeNormals = affected.size > 0;
    for (const record of records) for (const mesh of record.meshes)
      if (mesh.geometry !== record.renderGeometry && mesh.geometry !== owned.get(record.geometry)) throw Error('五官网格被其他操作替换');
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
    const preciseNormals=eye !== 'none'||(value!==0&&mouthData.preciseNormals)||(nose!=='none'&&nosePrepared.preciseNormals);
    const normalIndices = recomputeNormals ? normalNeighborhood(fullIndices, affected) : null;
    const baseNormals = recomputeNormals ? normals(position, normalIndices, preciseNormals, affected) : null;
    const targetNormals = recomputeNormals ? morphs.map(values => {
      // Eye and jaw-mouth sources evaluate shape triangles on Float64 absolute
      // shapes; rounding base+delta to Float32 first changes their normals.
      const absolute = preciseNormals ? Float64Array.from(position,(v,i)=>v+values[i]) : position.map((v,i)=>v+values[i]);
      return normals(absolute, normalIndices, preciseNormals, affected);
    }) : null;
    if (brow !== 'none') {
      const {heightVectors,spacingVectors,browVertices} = browPrepared.recipe;
      for (const i of browVertices) for (let c = 0; c < 3; c++)
        position[i*3+c] += browPrepared.endpoint * (heightVectors[i][c] + spacingVectors[i][c]);
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
      for (const record of activeRecords) {
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
        if(renderCompaction){next.delete(record.geometry);next.set(record.geometry,renderCompaction.compactEdited(record.geometry,geometry));}
      }
      if(prepareRender && activeRecords.length)await prepareRender(activeRecords.flatMap(record=>record.meshes.map(mesh=>({mesh,geometry:next.get(record.geometry)}))));
      if(disposed||request!==generation){for(const geometry of next.values())geometry.dispose();return false;}
    } catch (e) { for (const geometry of next.values()) geometry.dispose(); throw e; }
    return next;
  }

  async function prepareUpdate(input = {}, {trackIntent=false}={}) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    const value = input.reset ? 0 : input.mouthWidth ?? (trackIntent?wanted:mouthWidth);
    const brow = input.reset ? 'none' : input.browSample ?? (trackIntent?wantedBrow:browSample);
    const nose = input.reset ? 'none' : input.noseSample ?? (trackIntent?wantedNose:noseSample);
    const eye = input.reset ? 'none' : input.eyeSample ?? (trackIntent?wantedEye:eyeSample);
    let selection;
    try{
      selection=resolveFacialGeometrySelection(avatarSha256,{mouthWidth:value,browSample:brow,noseSample:nose,eyeSample:eye,
        recipeSha256:input.expectedRecipeSha256,browRecipeSha256:input.expectedBrowRecipeSha256,
        noseRecipeSha256:input.expectedNoseRecipeSha256,eyeRecipeSha256:input.expectedEyeRecipeSha256});
    }catch(error){return{applied:false,reason:error.message,field:error.field,code:error.code};}
    if(trackIntent){wanted = value; wantedBrow = brow; wantedNose = nose; wantedEye = eye;}
    const request = ++generation; error = null;
    try {
      const selected={mouth:prepared,brow:null,nose:null,eye:null};
      if (value !== 0 || brow !== 'none' || nose !== 'none' || eye !== 'none') {
        if (!available) throw Error('当前身体尚无嘴宽几何适配');
        loading = true; await prepare();
        selected.mouth=selection.mouthSource.visible?await prepareVisibleMouth():prepared;
        if (value !== 0 && input.expectedRecipeSha256 != null && input.expectedRecipeSha256 !== selected.mouth.entry.sha256)
          throw Error('保存配方的五官几何版本不匹配');
      }
      if (brow !== 'none') {
        selected.brow=await prepareBrow(brow);
        if (input.expectedBrowRecipeSha256 != null && input.expectedBrowRecipeSha256 !== selected.brow.entry.sha256) throw Error('保存配方的眉位版本不匹配');
      }
      if (nose !== 'none') {
        selected.nose=await prepareNose(nose);
        if (input.expectedNoseRecipeSha256 != null && input.expectedNoseRecipeSha256 !== selected.nose.entry.sha256) throw Error('保存配方的鼻部版本不匹配');
      }
      if (eye !== 'none') {
        selected.eye=await prepareEye(eye);
        if (input.expectedEyeRecipeSha256 != null && input.expectedEyeRecipeSha256 !== selected.eye.entry.sha256) throw Error('保存配方的眼部版本不匹配');
      }
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      const reset=value===0&&brow==='none'&&nose==='none'&&eye==='none';
      const changed=value!==mouthWidth||brow!==browSample||nose!==noseSample||eye!==eyeSample;
      const next=!reset&&changed?await apply(value,brow,nose,eye,request,selected):null;
      if(next===false||disposed||request!==generation){
        for(const geometry of next?.values?.()||[])geometry.dispose();
        return{applied:false,cancelled:true};
      }
      const nextOwned=reset?new Map():next,previousOwned=owned;
      let live=true,committed=false,cleaned=false;
      const update={
        isCurrent:()=>live&&!disposed&&request===generation,
        commit(){
          if(!update.isCurrent())throw Error('五官准备已过期');
          // Only prepared geometry pointers and final selection change here.
          if(nextOwned){
            for(const record of prepared?.records||[])for(const mesh of record.meshes)mesh.geometry=nextOwned.get(record.geometry)||record.renderGeometry;
            owned=nextOwned;
          }
          mouthWidth=value;browSample=brow;noseSample=nose;eyeSample=eye;
          wanted=value;wantedBrow=brow;wantedNose=nose;wantedEye=eye;
          currentMouth=selected.mouth;browPrepared=selected.brow;nosePrepared=selected.nose;eyePrepared=selected.eye;
          loading=false;live=false;committed=true;pendingUpdates.delete(update);
          return{applied:true};
        },
        dispose(){
          if(cleaned)return;cleaned=true;live=false;pendingUpdates.delete(update);
          const released=committed?(nextOwned?previousOwned:null):nextOwned;
          let failure;
          for(const geometry of released?.values()||[])try{geometry.dispose();}catch(error){failure??=error;}
          if(!committed&&request===generation){loading=false;wanted=mouthWidth;wantedBrow=browSample;wantedNose=noseSample;wantedEye=eyeSample;}
          if(failure)throw failure;
        },
      };
      pendingUpdates.add(update);return update;
    } catch (e) {
      if (disposed || request !== generation) return { applied: false, cancelled: true };
      error = e.message; loading = false; wanted = mouthWidth; wantedBrow = browSample; wantedNose = noseSample; wantedEye = eyeSample;
      return { applied: false, reason: error };
    }
  }
  async function set(input={}){
    const update=await prepareUpdate(input,{trackIntent:true});
    if(!update.commit)return update;
    try{return update.isCurrent()?update.commit():{applied:false,cancelled:true};}
    finally{update.dispose();}
  }

  return {
    set, prepareUpdate,
    getState: () => ({ mouthWidth, requestedMouthWidth: wanted, available, loading, error, revision:generation,
      mouthRange:mouthAdmission?[...mouthAdmission.range]:null,mouthSupportedValues:mouthAdmission?.supportedValues?[...mouthAdmission.supportedValues]:null,
      mouthEndpointValues:[...geometryCapability.mouthEndpointValues],browSamples:samplesFor('brow',browAvailable),noseSamples:samplesFor('nose',noseAvailable),eyeSamples:samplesFor('eye',eyeAvailable),
      browSample, requestedBrowSample: wantedBrow, browAvailable,
      browRecipeId: browPrepared?.entry.id || null, browRecipeSha256: browPrepared?.entry.sha256 || null,
      noseSample, requestedNoseSample: wantedNose, noseAvailable,
      noseRecipeId: nosePrepared?.entry.id || null, noseRecipeSha256: nosePrepared?.entry.sha256 || null,
      eyeSample, requestedEyeSample: wantedEye, eyeAvailable,
      eyeRecipeId: eyePrepared?.entry.id || null, eyeRecipeSha256: eyePrepared?.entry.sha256 || null,
      recipeId: currentMouth?.entry.id || prepared?.entry.id || null, recipeSha256: currentMouth?.entry.sha256 || prepared?.entry.sha256 || null, baseAvatarSha256: avatarSha256, facialGeometryLoading: loading,
      facialGeometryError: error, facialGeometryAvailable: available, facialGeometryCloneCount: owned.size,
      geometryIdentity: { baseAvatarSha256: avatarSha256, recipeSha256: currentMouth?.entry.sha256 || prepared?.entry.sha256 || null, mouthWidth, browSample, browRecipeSha256: browPrepared?.entry.sha256 || null, noseSample, noseRecipeSha256:nosePrepared?.entry.sha256||null, eyeSample, eyeRecipeSha256:eyePrepared?.entry.sha256||null } }),
    dispose() { disposed = true; generation++;for(const update of pendingUpdates)update.dispose(); loading = false; wanted = 0; wantedBrow = 'none'; wantedNose = 'none'; wantedEye = 'none'; restore(); },
  };
}
