// Isolated injection for the fixed801 experiment. No production avatar code changes.
const materialOwners = new WeakMap();
const fields = ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter',
  'anisotropy', 'flipY', 'premultiplyAlpha', 'unpackAlignment', 'matrixAutoUpdate'];
const vectors = ['offset', 'repeat', 'center', 'matrix'];
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const now = () => globalThis.performance?.now() ?? Date.now();
const errorText = error => error instanceof Error ? error.message : String(error);

async function digest(bytes) {
  const value = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function textureSnapshot(texture) {
  if (!texture) return null;
  return {
    uuid: texture.uuid, compressed: Boolean(texture.isCompressedTexture), format: texture.format,
    colorSpace: texture.colorSpace, width: texture.image?.width, height: texture.image?.height,
    minFilter: texture.minFilter, magFilter: texture.magFilter,
    wrapS: texture.wrapS, wrapT: texture.wrapT, flipY: texture.flipY,
    premultiplyAlpha: texture.premultiplyAlpha, generateMipmaps: texture.generateMipmaps,
    mipLevels: texture.mipmaps?.length ?? 0,
    transcodedMipDataBytes: texture.mipmaps?.reduce((sum, mip) => sum + (mip.data?.byteLength ?? 0), 0) ?? 0,
    canvas: typeof texture.image?.getContext === 'function',
  };
}

export async function importPilotDependencies({ threeModuleUrl, ktx2LoaderModuleUrl }) {
  const [THREE, { KTX2Loader }] = await Promise.all([
    import(threeModuleUrl), import(ktx2LoaderModuleUrl),
  ]);
  if (String(THREE.REVISION) !== '187') throw Error('Pilot requires Three revision187');
  return { THREE, KTX2Loader };
}

export function createKtxPilotAdapter({
  THREE, KTX2Loader, renderer, vrm, bodyType, avatarSha256, appearance,
  sourceManifest, sourceBaseUrl, transcoderPath, decoderManifest,
  fetchImpl = globalThis.fetch.bind(globalThis),
}) {
  if (String(THREE.REVISION) !== '187') throw Error('Pilot requires Three revision187');
  if (!['male', 'female'].includes(bodyType)) throw Error('Unknown pilot bodyType');
  if (sourceManifest.schema !== 'm2-ktx-pilot-source-v1') throw Error('Invalid pilot source manifest');
  if (decoderManifest.threeVersion !== '0.187.0') throw Error('Decoder package version mismatch');
  const samples = sourceManifest.samples.filter(sample => sample.gender === bodyType);
  if (samples.length !== 2 || samples.some(sample => sample.sourceModelSha256 !== avatarSha256))
    throw Error('Pilot body source identity mismatch');
  const owner = {};
  const records = [];
  const seen = new Set();
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of materialsOf(mesh)) {
      if (seen.has(material)) continue;
      const name = material.name.replace(/ \(Outline\)$/, '');
      const sample = samples.find(value => value.materialUses.some(use => use.name === name));
      if (!sample) continue;
      seen.add(material);
      if (materialOwners.has(material)) throw Error('Material is already owned by another pilot instance');
      if (!material.map || material.map.isCompressedTexture || material.map.flipY !== false)
        throw Error('Pilot requires the original uncompressed glTF texture');
      const original = { map: material.map, shade: material.shadeMultiplyTexture };
      for (const texture of [original.map, original.shade].filter(Boolean)) {
        if (texture.image?.width !== sample.width || texture.image?.height !== sample.height)
          throw Error('Source texture dimensions do not match the pinned sample');
        if (texture.colorSpace !== THREE.SRGBColorSpace || texture.premultiplyAlpha)
          throw Error('Source color/alpha semantics differ from the pinned sample');
      }
      records.push({ material, sample, original });
    }
  });
  if (samples.some(sample => !records.some(record => record.sample.id === sample.id)))
    throw Error('A target material is missing from this avatar instance');
  for (const record of records) materialOwners.set(record.material, owner);
  const requests = [], events = [], preparedTextures = new Set(), variants = new Map();
  const decoderBlobs = new Map();
  const releasedGpuTextures = new Set();
  let loader = null, loaderInitialized = false, pending = null, prepared = false, disposed = false, revision = 0;
  let lastFailure = null, canvasFallbackCount = 0;

  function event(type, extra = {}) {
    events.push({ type, atMs: now(), ...extra });
  }

  async function pinnedFetch(url, expectedSha, role) {
    const started = now();
    const response = await fetchImpl(url);
    const request = { url, role, status: response.status, ok: response.ok };
    requests.push(request);
    if (!response.ok) throw Error(`${role} HTTP${response.status}`);
    const bytes = await response.arrayBuffer();
    request.bytes = bytes.byteLength;
    request.sha256 = await digest(bytes);
    request.elapsedMs = now() - started;
    if (request.sha256 !== expectedSha) throw Error(`${role} SHA mismatch`);
    return bytes;
  }

  function variantFor(original, encoded) {
    if (variants.has(original)) return variants.get(original);
    const texture = encoded.clone();
    for (const field of fields) texture[field] = original[field];
    for (const field of vectors) texture[field].copy(original[field]);
    texture.colorSpace = original.colorSpace;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    variants.set(original, texture);
    preparedTextures.add(texture);
    return texture;
  }

  function mode(record, slot) {
    const texture = slot === 'map' ? record.material.map : record.material.shadeMultiplyTexture;
    const original = slot === 'map' ? record.original.map : record.original.shade;
    if (texture === original) return 'png';
    if (texture && preparedTextures.has(texture)) return 'ktx';
    return typeof texture?.image?.getContext === 'function' ? 'canvas' : 'external';
  }

  function reactivate(texture) {
    if (texture && releasedGpuTextures.delete(texture)) texture.needsUpdate = true;
    return texture;
  }

  function liveTextureReferences() {
    const references = new Map(), visitedMaterials = new Set(), visitedUniforms = new Set();
    function add(texture, path) {
      if (!references.has(texture)) references.set(texture, []);
      references.get(texture).push(path);
    }
    function inspectUniform(value, path) {
      if (!value || typeof value !== 'object') return;
      if (value.isTexture) { add(value, path); return; }
      if (visitedUniforms.has(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
      visitedUniforms.add(value);
      for (const [name, child] of Object.entries(value)) inspectUniform(child, path + '.' + name);
    }
    function inspectMaterial(material, path) {
      if (!material || visitedMaterials.has(material)) return;
      visitedMaterials.add(material);
      for (const [name, value] of Object.entries(material)) {
        if (value?.isTexture) add(value, path + '.' + name);
      }
      inspectUniform(material.uniforms, path + '.uniforms');
    }
    let root = vrm.scene;
    const parents = new Set([root]);
    while (root.parent) {
      root = root.parent;
      if (parents.has(root)) throw Error('Cyclic parent graph prevents safe texture scan');
      parents.add(root);
    }
    root.traverse(node => {
      const path = node.name || node.uuid;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material, index) => inspectMaterial(material, path + '.material.' + index));
      for (const name of ['customDepthMaterial', 'customDistanceMaterial', 'overrideMaterial'])
        inspectMaterial(node[name], path + '.' + name);
      for (const name of ['background', 'environment']) {
        if (node[name]?.isTexture) add(node[name], path + '.' + name);
      }
    });
    return references;
  }

  function releaseInactiveGpu() {
    const candidates = new Map();
    for (const record of records) {
      candidates.set(record.original.map, 'original-png');
      if (record.original.shade) candidates.set(record.original.shade, 'original-png');
    }
    for (const texture of preparedTextures) candidates.set(texture, 'ktx');
    const report = {
      applied: false, scanScope: 'Current VRM and its attached ancestor scene',
      candidates: [...candidates].map(([texture, kind]) => ({ uuid: texture.uuid, kind })),
      retained: [], released: [], failures: [],
      materialModes: records.map(record => ({ name: record.material.name,
        mapMode: mode(record, 'map'), shadeMode: mode(record, 'shade') })),
      measurementLimit: 'Released means Texture.dispose was requested. CPU image/mip data is retained. Actual GPU allocations require browser verification.',
    };
    if (disposed || !prepared || pending) {
      report.reason = disposed ? 'Pilot disposed' : pending ? 'Pilot preparation is in progress' : 'Pilot is not prepared';
      event('release-inactive-gpu', report);
      return report;
    }
    for (const [texture, kind] of candidates) {
      const entry = { uuid: texture.uuid, kind };
      try {
        // Scan immediately before each disposal. A prior dispose listener may
        // have rebound another candidate during this synchronous operation.
        const references = liveTextureReferences();
        const direct = references.get(texture);
        if (direct) {
          releasedGpuTextures.delete(texture);
          report.retained.push({ ...entry, reason: 'Referenced by a current material or scene', references: direct });
          continue;
        }
        const aliases = [...references].filter(([live]) => texture.source && live.source === texture.source);
        if (aliases.length) {
          report.retained.push({ ...entry, reason: 'A current texture shares this Source',
            aliases: aliases.map(([live, paths]) => ({ uuid: live.uuid, references: paths })) });
          continue;
        }
        if (releasedGpuTextures.has(texture)) {
          report.retained.push({ ...entry, reason: 'Already released since last observed activation' });
          continue;
        }
        releasedGpuTextures.add(texture);
        texture.dispose();
        report.released.push({ ...entry, reason: 'No current material, uniform or scene reference',
          cpuImageRetained: Boolean(texture.image), cpuMipDataRetained: Boolean(texture.mipmaps?.length) });
      } catch (error) {
        report.failures.push({ ...entry, reason: errorText(error) });
      }
    }
    report.applied = report.failures.length === 0;
    event('release-inactive-gpu', report);
    return report;
  }

  function snapshot() {
    return {
      schema: 'm2-ktx-pilot-runtime-v1', experimentOnly: true, bodyType, avatarSha256,
      prepared, disposed, revision, lastFailure, canvasFallbackCount,
      threeRevision: String(THREE.REVISION), decoderManifest,
      appearanceState: appearance?.getState?.() ?? null,
      materials: records.map(record => ({
        name: record.material.name, sampleId: record.sample.id,
        mapMode: mode(record, 'map'), shadeMode: mode(record, 'shade'),
        map: textureSnapshot(record.material.map), shade: textureSnapshot(record.material.shadeMultiplyTexture),
        originalMapRetainedForCanvas: textureSnapshot(record.original.map),
        originalMapShadeSameObject: record.original.map === record.original.shade,
      })),
      requests: requests.map(request => ({ ...request })), events: events.map(value => ({ ...value })),
      resourceTiming: requests.flatMap(request => (globalThis.performance?.getEntriesByName?.(request.url) ?? [])
        .map(entry => ({ url: request.url, name: entry.name, transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
          duration: entry.duration }))),
      measurementLimit: 'Transcoded mip data bytes describe CPU upload data. Original PNG and Canvas sources are retained. GPU residency and visual acceptance require browser checks.',
    };
  }

  async function prepare() {
    if (disposed) return { prepared: false, reason: 'Pilot disposed' };
    if (prepared) return { prepared: true, cached: true };
    if (pending) return pending;
    const generation = revision;
    pending = (async () => {
      const decoded = [];
      try {
        const manager = new THREE.LoadingManager();
        // Verify the exact JS/WASM bytes before KTX2Loader creates its worker.
        // FileLoader consumes these verified blobs, avoiding a second network copy.
        const dependencies = await Promise.allSettled(decoderManifest.files.map(async descriptor => {
          const url = new URL(descriptor.name, transcoderPath).href;
          const bytes = await pinnedFetch(url, descriptor.sha256, 'decoder-' + descriptor.name);
          return { url, blobUrl: URL.createObjectURL(new Blob([bytes], { type: descriptor.mimeType })) };
        }));
        for (const result of dependencies) {
          if (result.status === 'fulfilled') decoderBlobs.set(result.value.url, result.value.blobUrl);
        }
        const failedDependency = dependencies.find(result => result.status === 'rejected');
        if (failedDependency) throw failedDependency.reason;
        if (disposed || generation !== revision) throw Error('Pilot preparation cancelled');
        manager.setURLModifier(url => {
          const absolute = new URL(url, transcoderPath).href;
          const redirected = decoderBlobs.get(absolute);
          if (!redirected) throw Error('Unpinned decoder request ' + absolute);
          event('decoder-consume-verified-blob', { url: absolute });
          return redirected;
        });
        loader = new KTX2Loader(manager).setTranscoderPath(transcoderPath).setWorkerLimit(1);
        loader.detectSupport(renderer);
        const initStarted = now();
        const initialization = loader.init();
        loaderInitialized = true;
        await initialization;
        event('decoder-init', { elapsedMs: now() - initStarted });
        const results = await Promise.allSettled(samples.map(async sample => {
          const url = new URL(sample.encoded.path, sourceBaseUrl).href;
          const bytes = await pinnedFetch(url, sample.encoded.sha256, sample.id);
          const started = now();
          const texture = await new Promise((resolve, reject) => loader.parse(bytes, resolve, reject));
          decoded.push(texture);
          event('transcode', { sampleId: sample.id, elapsedMs: now() - started,
            texture: textureSnapshot(texture) });
          if (texture.image?.width !== sample.width || texture.image?.height !== sample.height ||
              texture.colorSpace !== THREE.SRGBColorSpace || texture.premultiplyAlpha)
            throw Error('Decoded KTX dimensions/color/alpha mismatch');
          return { sampleId: sample.id, texture };
        }));
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        if (disposed || generation !== revision) throw Error('Pilot preparation cancelled');
        const byId = new Map(results.map(result => [result.value.sampleId, result.value.texture]));
        for (const record of records) {
          variantFor(record.original.map, byId.get(record.sample.id));
          if (record.original.shade) variantFor(record.original.shade, byId.get(record.sample.id));
        }
        prepared = true; lastFailure = null;
        event('prepare-complete');
        return { prepared: true };
      } catch (error) {
        lastFailure = errorText(error);
        event('prepare-failed', { reason: lastFailure });
        for (const texture of preparedTextures) texture.dispose();
        preparedTextures.clear(); variants.clear();
        return { prepared: false, reason: lastFailure, cancelled: disposed || generation !== revision };
      } finally {
        decoded.forEach(texture => texture.dispose());
        if (loaderInitialized) loader.dispose();
        loader = null; loaderInitialized = false;
        for (const url of decoderBlobs.values()) URL.revokeObjectURL(url);
        decoderBlobs.clear(); pending = null;
      }
    })();
    return pending;
  }

  function applyOriginalKtx({ appearanceState = appearance?.getState?.(), bodyOnly = false } = {}) {
    if (disposed || !prepared) return { applied: false, reason: disposed ? 'Pilot disposed' : 'Pilot is not prepared' };
    if (!bodyOnly && (!appearanceState || appearanceState.hairColor !== 'original' || appearanceState.hairStyle !== 'original'))
      return { applied: false, reason: 'Original hair style and color are required for the hair KTX view' };
    for (const record of records) {
      if (bodyOnly && record.sample.imageIndex === 9) continue;
      record.material.map = reactivate(variants.get(record.original.map));
      if (record.original.shade) record.material.shadeMultiplyTexture = reactivate(variants.get(record.original.shade));
      record.material.needsUpdate = true;
    }
    revision++; event('apply-ktx', { bodyOnly });
    return { applied: true, bodyOnly };
  }

  function restorePng() {
    if (disposed) return { applied: false, reason: 'Pilot disposed' };
    for (const record of records) {
      record.material.map = reactivate(record.original.map);
      if ('shadeMultiplyTexture' in record.material) record.material.shadeMultiplyTexture = reactivate(record.original.shade);
      record.material.needsUpdate = true;
    }
    revision++; event('restore-png');
    return { applied: true };
  }

  async function withCanvasAppearance(operation) {
    if (typeof operation !== 'function') throw Error('Expected an existing appearance operation');
    if (disposed) return { applied: false, reason: 'Pilot disposed' };
    // Remove only this experiment's compressed bindings. An earlier successful
    // appearance operation may already own Canvas maps; resetting those to the
    // original PNG before a rejected request would desynchronise visible color
    // from the unchanged appearance state. The appearance module owns its own
    // transactional changes; never roll its newer bindings back here.
    for (const record of records) {
      let changed = false;
      if (mode(record, 'map') === 'ktx') {
        record.material.map = reactivate(record.original.map); changed = true;
      }
      if (mode(record, 'shade') === 'ktx') {
        record.material.shadeMultiplyTexture = reactivate(record.original.shade); changed = true;
      }
      if (changed) record.material.needsUpdate = true;
    }
    revision++; event('canvas-fallback'); canvasFallbackCount++;
    const generation = revision;
    try {
      const result = await operation();
      if (disposed || revision !== generation) return { applied: false, cancelled: true, reason: 'Pilot changed during appearance operation' };
      event('canvas-appearance', { applied: result?.applied === true });
      return { ...result, pilotFallback: 'original-png-or-existing-canvas',
        pilotMaterialModes: records.map(record => ({ name: record.material.name, mapMode: mode(record, 'map') })) };
    } catch (error) {
      if (disposed || revision !== generation) return { applied: false, cancelled: true, reason: 'Pilot changed during appearance operation' };
      lastFailure = errorText(error);
      event('canvas-appearance-failed', { reason: lastFailure });
      return { applied: false, reason: lastFailure, pilotFallback: 'original-png-or-existing-canvas' };
    }
  }

  function dispose() {
    if (disposed) return;
    // Remove every experiment-owned reference before releasing compressed textures.
    for (const record of records) {
      if (mode(record, 'map') === 'ktx') record.material.map = reactivate(record.original.map);
      if (mode(record, 'shade') === 'ktx') record.material.shadeMultiplyTexture = reactivate(record.original.shade);
      record.material.needsUpdate = true;
      if (materialOwners.get(record.material) === owner) materialOwners.delete(record.material);
    }
    disposed = true; prepared = false; revision++;
    preparedTextures.forEach(texture => { if (!releasedGpuTextures.has(texture)) texture.dispose(); });
    preparedTextures.clear(); variants.clear();
    releasedGpuTextures.clear();
    event('dispose');
  }

  return { prepare, applyOriginalKtx, restorePng, withCanvasAppearance, releaseInactiveGpu, dispose, snapshot };
}
