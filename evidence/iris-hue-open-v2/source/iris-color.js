// Changes authored pigment hue only. The source's spatial saturation/value
// detail and alpha survive; weight zero is an exact protection boundary.
export const IRIS_COLOR_OPERATION = 'hsv-hue-preserve-sv-v2';
function hue(r, g, b, max, span) {
  if (!span) return 0;
  const sector = max === r ? (g - b) / span : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return ((sector / 6) % 1 + 1) % 1;
}
export function recolorIrisPixels(source, output, indices, weights, hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const target = hue(...rgb, Math.max(...rgb), Math.max(...rgb) - Math.min(...rgb));
  for (let j = 0; j < indices.length; j++) {
    const i = indices[j], weight = weights[j];
    if (weight <= 0) continue;
    const r = source[i], g = source[i + 1], b = source[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), span = max - min;
    if (!span) { output[i] = r; output[i + 1] = g; output[i + 2] = b; continue; }
    const from = hue(r, g, b, max, span);
    const delta = ((target - from + 1.5) % 1) - .5;
    const h = (((from + delta * weight) % 1 + 1) % 1) * 6;
    const x = span * (1 - Math.abs(h % 2 - 1));
    let rr, gg, bb;
    if (h < 1) [rr, gg, bb] = [span, x, 0];
    else if (h < 2) [rr, gg, bb] = [x, span, 0];
    else if (h < 3) [rr, gg, bb] = [0, span, x];
    else if (h < 4) [rr, gg, bb] = [0, x, span];
    else if (h < 5) [rr, gg, bb] = [x, 0, span];
    else [rr, gg, bb] = [span, 0, x];
    output[i] = Math.round(rr + min); output[i + 1] = Math.round(gg + min); output[i + 2] = Math.round(bb + min);
  }
}
