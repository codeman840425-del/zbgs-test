// Isolated editable material experiment; uses the ORIGINAL map alpha unchanged.
// No body/UV/weights/garment geometry changes. Not a production-approved asset.
export function createClothMaterial(original, settings = {}) {
  // Actual current shorts use KHR_materials_unlit -> MeshBasicMaterial.
  // Keep this bounded to that shader; do not silently drop custom source hooks.
  if (!original?.isMeshBasicMaterial || Object.hasOwn(original, 'onBeforeCompile')) {
    throw Error('Cloth trial requires an unpatched MeshBasicMaterial');
  }
  const copyValues = (values, length, name) => {
    if (!Array.isArray(values) || values.length !== length ||
        !values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw Error('Invalid cloth ' + name);
    }
    return Object.freeze([...values]);
  };
  const cloth = copyValues(settings.linearColor ?? [0.025, 0.032, 0.055], 3, 'linearColor');
  const fabricStart = copyValues(settings.fabricStart ?? [0.17, 0.21], 2, 'fabricStart');
  if (fabricStart[0] >= fabricStart[1]) throw Error('fabricStart requires increasing UV bounds');
  const material = original.clone();
  material.name = original.name + '_source_alpha_toon_cloth_candidate';
  material.userData.clothCandidate = Object.freeze({ cloth, fabricStart, alphaSource: 'unchanged original map', shaderScope: 'Three 0.187 MeshBasicMaterial; SkinnedMesh' });
  const programKey = 'm1b-shorts-cloth-trial-v4-review1:' + JSON.stringify({cloth, fabricStart});
  material.customProgramCacheKey = () => programKey;
  material.onBeforeCompile = shader => {
    if (!shader.vertexShader.includes('#include <defaultnormal_vertex>') ||
        !shader.fragmentShader.includes('#include <map_fragment>')) throw Error('Unsupported cloth shader source');
    shader.uniforms.clothBase = { value: cloth };
    shader.vertexShader = 'varying vec3 vClothWorldNormal;\n' + shader.vertexShader.replace(
      '#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvClothWorldNormal = transformNormalByInverseViewMatrix(transformedNormal, viewMatrix);');
    shader.fragmentShader = 'varying vec3 vClothWorldNormal;\nuniform vec3 clothBase;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        // UV-band/stripe retention only; not semantic recognition of every pocket/seam.
        float fabric = smoothstep(${fabricStart[0].toFixed(5)}, ${fabricStart[1].toFixed(5)}, vMapUv.y);
        float seamDistance = min(abs(vMapUv.x - 0.25), abs(vMapUv.x - 0.75));
        float seam = 1.0 - smoothstep(0.0015, 0.006, seamDistance);
        vec3 clothNormal = normalize(vClothWorldNormal);
        #ifdef DOUBLE_SIDED
          clothNormal *= gl_FrontFacing ? 1.0 : -1.0;
        #endif
        float light = dot(clothNormal, normalize(vec3(-0.45, 0.85, 0.35)));
        float band = 0.72 + 0.28 * smoothstep(-0.1, 0.6, light);
        diffuseColor.rgb = mix(diffuseColor.rgb, clothBase * band, fabric * (1.0 - seam));
        // diffuseColor.a, alphaTest and clipping intentionally untouched.
      #endif
    `);
  };
  material.needsUpdate = true;
  return material;
}
