// Authored overlays use encoded sRGB source-over RGB. Original alpha is fixed.
// This is a texture operation, not lighting, geometry or expression evaluation.
export function composeSurfacePixels(base, layers) {
  if (!(base instanceof Uint8ClampedArray) || base.length % 4) throw Error('Invalid surface base pixels');
  const result = new Uint8ClampedArray(base);
  for (const {pixels, opacity} of layers) {
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== base.length ||
        !Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw Error('Invalid surface overlay');
    for (let i = 0; i < result.length; i += 4) {
      const weight = pixels[i + 3] / 255 * opacity;
      if (!weight) continue;
      for (let c = 0; c < 3; c++) result[i + c] = Math.round(result[i + c] * (1 - weight) + pixels[i + c] * weight);
    }
  }
  return result;
}

export function validateSurfaceSelection(input) {
  if (!Array.isArray(input) || input.length > 8) throw Error('Surface selection must be a bounded array');
  const result = Array.from(input, item => {
    if (!item || Object.keys(item).some(key => !['id', 'opacity'].includes(key)) ||
        typeof item.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(item.id) ||
        !Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1) throw Error('Invalid surface layer selection');
    return {id:item.id, opacity:item.opacity};
  });
  if (new Set(result.map(x => x.id)).size !== result.length) throw Error('Duplicate surface layer');
  return result;
}
