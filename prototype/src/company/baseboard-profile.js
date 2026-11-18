// Cross section in metres, measured from the wall and the finished floor.
function orientation(a, b, c) {
  const lhs = (b[0] - a[0]) * (c[1] - a[1]);
  const rhs = (b[1] - a[1]) * (c[0] - a[0]);
  const error = 4 * Number.EPSILON * (Math.abs(lhs) + Math.abs(rhs));
  return Math.abs(lhs - rhs) <= error ? 0 : Math.sign(lhs - rhs);
}

function withinSegmentBounds(a, b, p) {
  return p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

function intersects(a, b, c, d) {
  const abc = orientation(a, b, c), abd = orientation(a, b, d);
  const cda = orientation(c, d, a), cdb = orientation(c, d, b);
  return (abc === 0 && withinSegmentBounds(a, b, c)) || (abd === 0 && withinSegmentBounds(a, b, d)) ||
    (cda === 0 && withinSegmentBounds(c, d, a)) || (cdb === 0 && withinSegmentBounds(c, d, b)) ||
    (abc * abd < 0 && cda * cdb < 0);
}

export function validateBaseboardProfile(points, path, fail) {
  const reject = message => fail('invalid-surface-resource', path, message);
  if (!Array.isArray(points) || points.length < 3)
    reject('A baseboard profile requires at least three ordered [depth, height] vertices');
  const seen = new Set();
  let reachesTop = false;
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
        point[0] < 0 || point[0] > .02 || point[1] < 0 || point[1] > .12)
      reject('Baseboard vertices must be within 0–0.02 m depth and 0–0.12 m height');
    const key = point.join(',');
    if (seen.has(key)) reject('Baseboard vertices must be distinct, including the closing vertex');
    seen.add(key);
    if (point[1] === .12) reachesTop = true;
  }
  let floorContact = false, wallContact = false;
  for (const [i, a] of points.entries()) {
    const next = (i + 1) % points.length;
    const b = points[next], previous = points[(i + points.length - 1) % points.length];
    if (a[0] === 0 && b[0] === 0) wallContact = true;
    if (a[1] === 0 && b[1] === 0) floorContact = true;
    // Consecutive edges may continue along a straight line, but cannot double back.
    if (orientation(previous, a, b) === 0 && !withinSegmentBounds(previous, b, a))
      reject('Adjacent baseboard edges overlap');
    for (let j = i + 2; j < points.length; j++) {
      const end = (j + 1) % points.length;
      if (end !== i && intersects(a, b, points[j], points[end]))
        reject('Nonadjacent baseboard profile edges must not cross or touch');
    }
  }
  if (!reachesTop || !floorContact || !wallContact)
    reject('A 0.12 m high baseboard requires both a wall contact edge and a floor contact edge');
}
