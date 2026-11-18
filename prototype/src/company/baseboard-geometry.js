import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { validateBaseboardProfile } from './baseboard-profile.js';

const HEIGHT = .12;
const DEPTH = .02;
const EPS = 1e-8;

// Traverse the perimeter in the same direction as the structural wall UVs.
// Each normal points into the room.
const EDGES = [
  { edge: 'north', axis: 0, sign: 1, normalAxis: 2, inward: 1, span: 'width' },
  { edge: 'east', axis: 2, sign: 1, normalAxis: 0, inward: -1, span: 'depth' },
  { edge: 'south', axis: 0, sign: -1, normalAxis: 2, inward: -1, span: 'width' },
  { edge: 'west', axis: 2, sign: -1, normalAxis: 0, inward: 1, span: 'depth' },
];
const FRAME_EDGES = ['north', 'west', 'south', 'east'];
const frameEdge = yaw => FRAME_EDGES[((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4];

function mergeWallFoot(slices) {
  const runs = [];
  for (const slice of slices.sort((a, b) => a.from - b.from || a.to - b.to)) {
    const previous = runs.at(-1);
    if (previous && previous.physicalBoundary === slice.physicalBoundary && slice.from <= previous.to + EPS) {
      previous.to = Math.max(previous.to, slice.to);
    } else runs.push({ ...slice });
  }
  return runs;
}

function subtractFrame(run, from, to, depth) {
  if (run.to <= from + EPS || run.from >= to - EPS) return [run];
  const pieces = [];
  if (run.from < from - EPS) pieces.push({ ...run, to: from, endFrameDepth: depth });
  if (run.to > to + EPS) pieces.push({ ...run, from: to, startFrameDepth: depth });
  return pieces;
}

function describeSide(region, walls, frames, axes) {
  const { edge, axis, sign, normalAxis, inward, span } = axes;
  const half = region.bounds[span] / 2;
  const u = coordinate => half + sign * coordinate;
  const foot = walls.filter(wall => wall.edge === edge);
  const normal = foot.length ? foot[0].position[normalAxis] + inward * foot[0].size[normalAxis] / 2 : null;
  const slices = foot.map(wall => {
    const center = u(wall.position[axis]), length = wall.size[axis];
    return { physicalBoundary: wall.sourceWallId || wall.id, from: center - length / 2, to: center + length / 2 };
  });
  let runs = mergeWallFoot(slices);
  for (const frame of frames.filter(frame => frameEdge(frame.node.transform.yaw) === edge)) {
    const { width, depth } = frame.resource.mounting;
    const center = u(frame.node.transform.position[axis]), halfWidth = width / 2;
    runs = runs.flatMap(run => subtractFrame(run, center - halfWidth, center + halfWidth, depth));
  }
  return { ...axes, half, normal, u, runs };
}

function pointOnSide(side, distance) {
  const point = [0, 0, 0];
  point[side.axis] = side.sign * (distance - side.half);
  point[side.normalAxis] = side.normal;
  return point;
}

function joinPosition(first, second) {
  if (first.normal === null || second.normal === null) return null;
  const end = first.u(second.normal), start = second.u(first.normal);
  const before = first.runs.find(run => run.from < end - EPS && run.to >= end - EPS);
  const after = second.runs.find(run => run.from <= start + EPS && run.to > start + EPS);
  if (!before || !after) return null;
  const shortBefore = end - before.from <= DEPTH + EPS;
  const shortAfter = after.to - start <= DEPTH + EPS;
  // A tiny piece cannot contain a full 45° cut. Omit it and square-cap the
  // other side beyond the profile depth or the neighbouring frame projection.
  return {
    end: shortBefore ? before.from : end - (shortAfter ? Math.max(DEPTH, after.endFrameDepth ?? 0) : 0),
    start: shortAfter ? after.to : start + (shortBefore ? Math.max(DEPTH, before.startFrameDepth ?? 0) : 0),
    mitre: !shortBefore && !shortAfter,
  };
}

/** Room-local runs on the actual floor-contact portion of each physical wall. */
export function describeBaseboardRuns(region, physicalWalls, facilities) {
  const walls = physicalWalls.filter(wall => wall.regionId === region.id &&
    Math.abs(wall.position[1] - wall.size[1] / 2) <= EPS && wall.position[1] + wall.size[1] / 2 >= HEIGHT - EPS);
  const frames = facilities.filter(facility => facility.roomId === region.id && facility.resource.mount === 'portal');
  const sides = EDGES.map(edge => describeSide(region, walls, frames, edge));
  const corners = sides.map((side, index) => joinPosition(side, sides[(index + 1) % sides.length]));
  return sides.flatMap((side, index) => {
    const previousCorner = corners[(index + sides.length - 1) % sides.length];
    const nextCorner = corners[index];
    const segments = [];
    const counts = new Map();
    for (const interval of side.runs) {
      const uStart = Math.max(interval.from, previousCorner?.start ?? interval.from);
      const uEnd = Math.min(interval.to, nextCorner?.end ?? interval.to);
      if (uEnd - uStart <= EPS) continue;
      const { physicalBoundary } = interval;
      const number = counts.get(physicalBoundary) ?? 0;
      counts.set(physicalBoundary, number + 1);
      segments.push({
        id: physicalBoundary + '/baseboard-' + number, edge: side.edge, physicalBoundary,
        start: pointOnSide(side, uStart), end: pointOnSide(side, uEnd), uStart, uEnd,
        mitreStart: Boolean(previousCorner?.mitre && Math.abs(uStart - previousCorner.start) <= EPS),
        mitreEnd: Boolean(nextCorner?.mitre && Math.abs(uEnd - nextCorner.end) <= EPS),
      });
    }
    return segments;
  });
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function prepareProfile(profile) {
  validateBaseboardProfile(profile, 'baseboard.profile', (_code, path, message) => {
    throw new RangeError(path + ': ' + message);
  });
  const ring = profile.map(point => [...point]);
  const size = ring.length;
  if (ShapeUtils.isClockWise(ring.map(([d, h]) => new Vector2(d, h)))) ring.splice(1, size - 1, ...ring.slice(1).reverse());
  // Earcut eliminates collinear points on the caps. Use the same outline for the sides.
  return ring.filter((point, index) => cross(ring[(index + size - 1) % size], point, ring[(index + 1) % size]) !== 0);
}

/** Closed room-local mesh with 45° corner terminations and metre-based UVs. */
export function createBaseboardGeometry(run, profile) {
  const ring = prepareProfile(profile);
  const [x, y, z] = run.start;
  const dx = run.end[0] - x, dz = run.end[2] - z, length = Math.hypot(dx, dz);
  const depth = Math.max(...ring.map(point => point[0]));
  if (!(length > depth * (Number(run.mitreStart) + Number(run.mitreEnd)) + EPS)) {
    throw new RangeError('Baseboard run is too short for its corner terminations');
  }
  const tx = dx / length, tz = dz / length;
  const positions = [], uv = [];
  const emit = (point, along, texture) => {
    const [d, h] = point;
    positions.push(x + tx * along - tz * d, y + h, z + tz * along + tx * d);
    uv.push(...texture);
  };
  const start = point => run.mitreStart ? point[0] : 0;
  const end = point => length - (run.mitreEnd ? point[0] : 0);
  const side = (point, along, perimeter) => emit(point, along, [run.uStart + along, perimeter]);
  let v = 0;
  for (const [index, a] of ring.entries()) {
    const b = ring[(index + 1) % ring.length];
    const nextV = v + Math.hypot(b[0] - a[0], b[1] - a[1]);
    side(a, start(a), v);
    side(a, end(a), v);
    side(b, end(b), nextV);
    side(a, start(a), v);
    side(b, end(b), nextV);
    side(b, start(b), nextV);
    v = nextV;
  }
  const triangles = ShapeUtils.triangulateShape(ring.map(([d, h]) => new Vector2(d, h)), []);
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(index => ring[index]);
    const forward = cross(a, b, c) > 0 ? [a, b, c] : [a, c, b];
    for (const point of forward) emit(point, start(point), point);
    for (const point of [...forward].reverse()) emit(point, end(point), point);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
