// This function is serialized by Playwright. Keep browser helpers inside it.
async function collectNativeSurfaceRuntimeMaterials({sampleBodyAlpha = false} = {}) {
  const debug = window.__debug;
  const avatar = debug?.avatar?.();
  const renderer = debug?.renderer;
  if (!debug?.ready || !avatar?.root || !avatar.vrm?.scene || !renderer?.info) {
    throw new Error('The workbench actor and Three renderer must be ready for surface inspection');
  }

  const equipment = avatar.getOutfitInfo().equipment;
  const bodyMode = avatar.getDebugState().mode;
  const camera = debug.cameraObject?.();
  const roleByEquipmentId = new Map(Object.entries(equipment.items).map(([role, item]) => [item.id, role]));
  const visibleEquipment = Object.entries(equipment.items).filter(([, item]) => item.visible)
    .map(([role, item]) => ({role, id:item.id}));
  const materialRoles = [
    ['body', /_Body_\d+_SKIN/], ['faceSkin', /_Face_\d+_SKIN/], ['mouth', /_FaceMouth_/],
    ['iris', /_EyeIris_/], ['eyeHighlight', /_EyeHighlight_/], ['eyeWhite', /_EyeWhite_/],
    ['brow', /_FaceBrow_/], ['eyelash', /_FaceEyelash_/], ['eyeline', /_FaceEyeline_/],
    ['hairBack', /_HairBack_/], ['hair', /_HAIR/],
  ];
  const sideNames = ['front', 'back', 'double'];
  const materialRows = new Map();
  const textureRows = new Map();
  const images = new Map();
  const allocations = new Map();
  const webglHandles = new Set();
  const bodyMeshes = new Set();
  let bodyMaterial;

  function meshEquipment(mesh) {
    for (let node = mesh; node && node !== avatar.root; node = node.parent) {
      if (node.name.startsWith('Equipment:')) return node.name.slice('Equipment:'.length);
    }
    return null;
  }

  function pixelDimensions(image) {
    const width = image?.naturalWidth || image?.videoWidth || image?.width;
    const height = image?.naturalHeight || image?.videoHeight || image?.height;
    return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
      ? {width, height} : {width:null, height:null};
  }

  function rgba8Estimate(width, height, texture) {
    if (!width || !height || texture.isCubeTexture || texture.isData3DTexture || texture.isDataArrayTexture ||
        texture.isCompressedArrayTexture || texture.isRenderTargetTexture || texture.isVideoTexture ||
        (renderer.capabilities?.maxTextureSize && Math.max(width, height) > renderer.capabilities.maxTextureSize)) {
      return {levels:null, baseBytes:null, withMipmapsBytes:null};
    }
    const explicitMips = texture.mipmaps || [];
    const levels = texture.generateMipmaps ? Math.floor(Math.log2(Math.max(width, height))) + 1 : explicitMips.length || 1;
    let withMipmapsBytes = 0;
    for (let level = 0; level < levels; level++) {
      const mipWidth = explicitMips[level]?.width ?? Math.max(1, Math.floor(width / 2 ** level));
      const mipHeight = explicitMips[level]?.height ?? Math.max(1, Math.floor(height / 2 ** level));
      withMipmapsBytes += mipWidth * mipHeight * 4;
    }
    return {levels, baseBytes:width * height * 4, withMipmapsBytes};
  }

  function inspectTexture(texture) {
    if (textureRows.has(texture)) return textureRows.get(texture).uuid;
    const {source, image} = texture;
    const {width, height} = pixelDimensions(image);
    const hasDimensions = width !== null && height !== null;
    if (image && !images.has(image)) {
      images.set(image, {id:images.size + 1, rgba8BaseBytes:hasDimensions ? width * height * 4 : null});
    }

    // Match Three r187 WebGLTextures.getTextureCacheKey. Source identity alone
    // undercounts a clone that shares pixels but uploads with different settings.
    const uploadKey = [texture.wrapS, texture.wrapT, texture.wrapR || 0, texture.magFilter,
      texture.minFilter, texture.anisotropy, texture.internalFormat, texture.format, texture.type,
      texture.generateMipmaps, texture.mipmapsAutoUpdate, texture.premultiplyAlpha, texture.flipY,
      texture.unpackAlignment, texture.colorSpace].join();
    const allocationKey = `${source?.uuid ?? texture.uuid}/${uploadKey}`;
    const estimate = rgba8Estimate(width, height, texture);
    const rgba8Format = !texture.isCompressedTexture && texture.format === 1023 && texture.type === 1009 &&
      [null, 'RGBA8', 'SRGB8_ALPHA8'].includes(texture.internalFormat);
    let allocation = allocations.get(allocationKey);
    if (!allocation) {
      allocation = {id:allocations.size + 1, ...estimate, rgba8Format, textureUuids:[]};
      allocations.set(allocationKey, allocation);
    }
    allocation.textureUuids.push(texture.uuid);

    const properties = renderer.properties;
    const webglTexture = properties?.has(texture) ? properties.get(texture).__webglTexture : null;
    if (webglTexture) webglHandles.add(webglTexture);
    textureRows.set(texture, {
      uuid:texture.uuid,
      sourceUuid:source?.uuid ?? null,
      imageId:images.get(image)?.id ?? null,
      allocationId:allocation.id,
      name:texture.name,
      width,
      height,
      colorSpace:texture.colorSpace,
      format:texture.format,
      type:texture.type,
      internalFormat:texture.internalFormat,
      compressed:!!texture.isCompressedTexture,
      channel:texture.channel,
      flipY:texture.flipY,
      wrapS:texture.wrapS,
      wrapT:texture.wrapT,
      minFilter:texture.minFilter,
      magFilter:texture.magFilter,
      generateMipmaps:texture.generateMipmaps,
      offset:texture.offset?.toArray() ?? null,
      repeat:texture.repeat?.toArray() ?? null,
      rotation:texture.rotation,
      hasWebGLTexture:!!webglTexture,
      rgba8Estimate:estimate,
    });
    return texture.uuid;
  }

  function inspectMaterial(mesh, material, group, count, equipmentId) {
    const name = material.name;
    const outline = material.isOutline === true;
    const role = roleByEquipmentId.get(equipmentId) ?? materialRoles.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other';
    const key = `${role}/${material.uuid}`;
    let row = materialRows.get(key);
    if (!row) {
      const maps = {};
      for (const [slot, texture] of Object.entries(material)) {
        if (texture?.isTexture) maps[slot] = inspectTexture(texture);
      }
      for (const [slot, uniform] of Object.entries(material.uniforms ?? {})) {
        if (uniform?.value?.isTexture) maps[slot] = inspectTexture(uniform.value);
      }
      const alphaTest = material.alphaTest;
      row = {
        role, name, uuid:material.uuid, outline, equipmentId,
        sourceName:outline ? name.replace(/ \(Outline\)$/, '') : name,
        type:material.isMToonMaterial ? 'MToonMaterial' : material.type,
        visible:material.visible,
        transparent:material.transparent,
        opacity:material.opacity,
        alphaMode:material.transparent ? 'BLEND' : alphaTest > 0 ? 'MASK' : 'OPAQUE',
        alphaTest,
        depthWrite:material.depthWrite,
        depthTest:material.depthTest,
        depthFunc:material.depthFunc,
        colorWrite:material.colorWrite,
        side:material.side,
        sideName:sideNames[material.side] ?? null,
        maps,
        draws:[],
      };
      materialRows.set(key, row);
    }
    row.draws.push({meshName:mesh.name, meshUuid:mesh.uuid, geometryUuid:mesh.geometry.uuid,
      groupMaterialIndex:group?.materialIndex ?? null, drawCount:count, renderOrder:mesh.renderOrder});
    if (role === 'body') {
      bodyMeshes.add(mesh);
      if (!outline) bodyMaterial = material;
    }
  }

  // Mirror the mesh visibility, camera-layer and draw range checks that select
  // material groups. Frame occlusion, alpha rejection and frustum effects vary by pose.
  avatar.root.traverseVisible(mesh => {
    if (!mesh.isMesh || (camera && !mesh.layers.test(camera.layers))) return;
    const {geometry, material} = mesh;
    const indexCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    const drawStart = Math.max(0, geometry.drawRange.start);
    const drawEnd = Math.min(indexCount, geometry.drawRange.start + geometry.drawRange.count);
    if (drawEnd <= drawStart) return;
    const equipmentId = meshEquipment(mesh);
    if (Array.isArray(material)) {
      for (const group of geometry.groups) {
        const entry = material[group.materialIndex];
        const count = Math.min(drawEnd, group.start + group.count) - Math.max(drawStart, group.start);
        if (entry?.visible && count > 0) inspectMaterial(mesh, entry, group, count, equipmentId);
      }
    } else if (material?.visible) {
      inspectMaterial(mesh, material, null, drawEnd - drawStart, equipmentId);
    }
  });

  async function readBodyAlpha(material) {
    const texture = material?.map;
    const image = texture?.image;
    const {width, height} = pixelDimensions(image);
    try {
      if (!texture || width !== 2048 || height !== 2048) throw new Error('Expected the 2048×2048 native Body color map');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext('2d', {willReadFrequently:true});
        if (!context) throw new Error('No Canvas 2D readback context');
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, width, height).data;
        const alpha = new Uint8Array(width * height);
        const cutoff = material.alphaTest;
        let belowCutoff = 0;
        let fullyTransparent = 0;
        let fullyOpaque = 0;
        for (let i = 0; i < alpha.length; i++) {
          const value = rgba[i * 4 + 3];
          alpha[i] = value;
          if (value / 255 < cutoff) belowCutoff++;
          if (value === 0) fullyTransparent++;
          if (value === 255) fullyOpaque++;
        }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', alpha));
        const alphaSha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        return {textureUuid:texture.uuid, width, height, pixelCount:alpha.length, alphaSha256, cutoff, belowCutoff,
          atOrAboveCutoff:alpha.length - belowCutoff, fullyTransparent, fullyOpaque};
      } finally {
        canvas.width = canvas.height = 0;
      }
    } catch (error) {
      return {textureUuid:texture?.uuid ?? null, error:error.message};
    }
  }

  const materialList = [...materialRows.values()].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const allocationList = [...allocations.values()];
  const imageList = [...images.values()];
  const sum = (rows, key) => rows.reduce((bytes, row) => bytes + (row[key] ?? 0), 0);
  const bodyMesh = bodyMeshes.size === 1 ? bodyMeshes.values().next().value : null;
  const textureCoverage = equipment.bodyTextureCoverage;
  const textureDescriptor = avatar.config?.bodyTextureCoverage;
  const rendererReadback = {
    textures:renderer.info.memory.textures,
    geometries:renderer.info.memory.geometries,
    calls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,
    outputColorSpace:renderer.outputColorSpace,
    toneMapping:renderer.toneMapping,
    toneMappingExposure:renderer.toneMappingExposure,
    maxTextureSize:renderer.capabilities?.maxTextureSize ?? null,
    contextLost:renderer.getContext().isContextLost(),
  };
  return {
    schema:'native-surface-runtime-materials-v1',
    build:debug.buildInfo.shortId,
    bodyType:avatar.profile.bodyType,
    bodySha256:avatar.profile.sha256,
    actorUuid:avatar.root.uuid,
    bodyMode,
    coverage:{
      descriptor:textureDescriptor ? {url:textureDescriptor.url, sha256:textureDescriptor.sha256} : null,
      texture:textureCoverage,
      geometry:equipment.bodyCoverage,
      visibleEquipment,
      bodyMeshCount:bodyMeshes.size,
      bodyIndexCount:bodyMesh?.geometry.index?.count ?? null,
      alphaPixels:sampleBodyAlpha ? await readBodyAlpha(bodyMaterial) : null,
    },
    materials:materialList,
    textures:[...textureRows.values()],
    textureEstimate:{
      scope:'Texture bindings on the primary actor meshes with visible ancestry, active geometry groups and matching camera layers. Excludes hidden source clothing, peers, room/environment maps, shadow/depth pass textures, skeletons, morph targets, render targets and driver overhead.',
      imageBasis:'RGBA8 level-zero equivalents per distinct referenced image object. Includes ImageBitmaps and canvases; excludes retained unbound images and internal decode/Canvas overhead. Image IDs are local to this capture.',
      allocationBasis:'RGBA8 equivalents per Three r187 Texture Source and WebGL upload settings. Includes generated or explicit mip levels, independent of current upload residency. Excludes unsupported texture shapes and sizes. Compressed/other formats are RGBA8 equivalents only.',
      webglBasis:'Unique WebGL texture handles assigned to the inspected objects by this renderer at capture. Renderer counters cover the whole Three scene. Neither value gives driver allocation bytes.',
      materialCount:materialList.length,
      boundSlotCount:materialList.reduce((n, row) => n + Object.keys(row.maps).length, 0),
      textureObjectCount:textureRows.size,
      decodedImageCount:images.size,
      decodedImageRgba8Bytes:sum(imageList, 'rgba8BaseBytes'),
      decodedImageUnknownCount:imageList.filter(row => row.rgba8BaseBytes === null).length,
      estimatedAllocationCount:allocations.size,
      allocationRgba8BaseBytes:sum(allocationList, 'baseBytes'),
      allocationRgba8WithMipmapsBytes:sum(allocationList, 'withMipmapsBytes'),
      allocationUnknownCount:allocationList.filter(row => row.withMipmapsBytes === null).length,
      matchingRgba8FormatBytes:sum(allocationList.filter(row => row.rgba8Format), 'withMipmapsBytes'),
      uniqueAssignedWebGLTextureCount:webglHandles.size,
      allocations:allocationList,
    },
    renderer:rendererReadback,
  };
}

module.exports = {collectNativeSurfaceRuntimeMaterials};
