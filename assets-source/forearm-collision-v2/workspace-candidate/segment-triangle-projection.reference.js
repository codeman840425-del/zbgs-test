/** Clip a whole segment against a triangle in the plane perpendicular to
 * clearance direction. Returns the segment interval over the triangle.
 * Point samples missed narrow skirt edges between consecutive samples. */
export function projectedSegmentInterval(su, sv, eu, ev, t) {
  const [au, av, bu, bv, cu, cv] = t;
  const denominator = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
  if (Math.abs(denominator) < 1e-12) return null;
  const bary = (u, v) => {
    const a = ((bv - cv) * (u - cu) + (cu - bu) * (v - cv)) / denominator;
    const b = ((cv - av) * (u - cu) + (au - cu) * (v - cv)) / denominator;
    return [a, b, 1 - a - b];
  };
  const start = bary(su, sv), end = bary(eu, ev);
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const delta = end[k] - start[k];
    if (Math.abs(delta) < 1e-12) { if (start[k] < -1e-9) return null; }
    else if (delta > 0) lo = Math.max(lo, -start[k] / delta);
    else hi = Math.min(hi, -start[k] / delta);
  }
  if (lo > hi + 1e-9) return null;
  return { lo: Math.max(0, lo), hi: Math.min(1, hi), start, end };
}
