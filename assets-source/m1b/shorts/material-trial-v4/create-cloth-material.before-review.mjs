// Isolated editable material experiment; uses the ORIGINAL map alpha unchanged.
// No body/UV/weights/garment geometry changes. Not a production-approved asset.
export function createClothMaterial(original, settings = {}) {
  const material = original.clone();
  const cloth = settings.linearColor || [0.025, 0.032, 0.055];
  const fabricStart = settings.fabricStart || [0.17, 0.21];
  material.name = original.name + '_source_alpha_toon_cloth_candidate';
  material.userData.clothCandidate = { cloth, fabricStart, alphaSource: 'unchanged original map' };
  material.customProgramCacheKey = () => 'm1b-shorts-cloth-trial-v4:' + JSON.stringify({cloth, fabricStart});
  material.onBeforeCompile = shader => {
    if (!shader.vertexShader.includes('#include <defaultnormal_vertex>') ||
        !shader.fragmentShader.includes('#include <map_fragment>')) throw Error('Unsupported cloth shader source');
    shader.uniforms.clothBase = { value: cloth };
    shader.vertexShader = 'varying vec3 vClothWorldNormal;\n' + shader.vertexShader.replace(
      '#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvClothWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);');
    shader.fragmentShader = 'varying vec3 vClothWorldNormal;\nuniform vec3 clothBase;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        // Keep waistband, pocket stitching and vertical seams from source.
        float fabric = smoothstep(${fabricStart[0].toFixed(5)}, ${fabricStart[1].toFixed(5)}, vMapUv.y);
        float seamDistance = min(abs(vMapUv.x - 0.25), abs(vMapUv.x - 0.75));
        float seam = 1.0 - smoothstep(0.0015, 0.006, seamDistance);
        float light = dot(normalize(vClothWorldNormal), normalize(vec3(-0.45, 0.85, 0.35)));
        float band = 0.72 + 0.28 * smoothstep(-0.1, 0.6, light);
        diffuseColor.rgb = mix(diffuseColor.rgb, clothBase * band, fabric * (1.0 - seam));
        // diffuseColor.a, alphaTest and clipping intentionally untouched.
      #endif
    `);
  };
  material.needsUpdate = true;
  return material;
}
