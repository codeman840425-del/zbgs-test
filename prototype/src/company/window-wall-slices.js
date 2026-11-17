const EPSILON = 1e-9;
const EDGES = new Set(['north', 'south', 'west', 'east']);

class WindowWallSliceError extends Error {
  constructor(code, path, message, details = {}) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'WindowWallSliceError';
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

const fail = (code, path, message, details) => { throw new WindowWallSliceError(code, path, message, details); };
const finite = value => Number.isFinite(value);
const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(finite);
const clone = value => structuredClone(value);

function checkWall(wall) {
  if (!wall || typeof wall !== 'object' || Array.isArray(wall)) fail('invalid-wall', 'wall', 'Expected a wall description object');
  for (const field of ['id', 'floorId', 'regionId', 'edge']) if (typeof wall[field] !== 'string' || !wall[field])
    fail('invalid-wall', `wall.${field}`, 'Expected a nonempty wall identity field');
  if (!EDGES.has(wall.edge)) fail('invalid-wall-edge', 'wall.edge', `Unsupported wall edge ${wall.edge}`);
  if (!finiteArray(wall.position, 3) || !finiteArray(wall.size, 3) || !finiteArray(wall.center, 3) || !finiteArray(wall.halfSize, 2))
    fail('invalid-wall-geometry', 'wall', 'position/size/center must be finite 3-vectors and halfSize a finite XZ 2-vector');
  if (wall.size.some(value => value <= 0) || wall.halfSize.some(value => value <= 0))
    fail('invalid-wall-geometry', 'wall.size', 'Wall dimensions and world halfSize must be positive');
  const horizontal = wall.edge === 'north' || wall.edge === 'south';
  const span = horizontal ? wall.size[0] : wall.size[2];
  const thickness = horizontal ? wall.size[2] : wall.size[0];
  if (!(span > EPSILON) || !(thickness > EPSILON) || !(wall.size[1] > EPSILON))
    fail('invalid-wall-geometry', 'wall.size', 'Wall span, height and thickness must be positive');
  return { horizontal, span, thickness, height: wall.size[1], floorBottom: wall.position[1] - wall.size[1] / 2 };
}

function checkTransform(worldTransform) {
  const transform = worldTransform ?? { position: [0, 0, 0], yaw: 0 };
  if (!transform || !finiteArray(transform.position, 3) || !finite(transform.yaw))
    fail('invalid-world-transform', 'worldTransform', 'Expected finite position[3] and yaw');
  return transform;
}

function checkOpenings(openings, wall, geometry) {
  if (openings === undefined) return [];
  if (!Array.isArray(openings)) fail('invalid-openings', 'openings', 'Expected an array of wall openings');
  const ids = new Set();
  const wallAlongCenter = geometry.horizontal ? wall.position[0] : wall.position[2];
  const result = openings.map((opening, index) => {
    const path = `openings[${index}]`;
    if (!opening || typeof opening !== 'object' || Array.isArray(opening)) fail('invalid-opening', path, 'Expected an opening object');
    for (const field of ['id', 'regionId', 'edge']) if (typeof opening[field] !== 'string' || !opening[field])
      fail('invalid-opening', `${path}.${field}`, 'Expected a nonempty opening identity field');
    if (ids.has(opening.id)) fail('duplicate-opening-id', `${path}.id`, 'Opening IDs must be unique on a wall');
    ids.add(opening.id);
    if (opening.regionId !== wall.regionId || opening.edge !== wall.edge)
      fail('opening-wall-mismatch', path, 'Opening must belong to this wall region and edge');
    for (const field of ['offset', 'bottom', 'width', 'height']) if (!finite(opening[field]))
      fail('invalid-opening', `${path}.${field}`, 'Opening dimensions and offsets must be finite');
    if (!(opening.width > EPSILON) || !(opening.height > EPSILON)) fail('invalid-opening-size', path, 'Opening width and height must be positive');
    // Architecture offsets are relative to the room edge. A described wall
    // can be one segment of that edge, so translate into this segment's frame.
    const alongCenter = opening.offset - wallAlongCenter;
    const alongMin = alongCenter - opening.width / 2;
    const alongMax = alongCenter + opening.width / 2;
    const yMin = opening.bottom;
    const yMax = opening.bottom + opening.height;
    if (alongMin < -geometry.span / 2 - EPSILON || alongMax > geometry.span / 2 + EPSILON)
      fail('opening-outside-wall', `${path}.offset`, 'Opening interval extends beyond the wall span');
    if (yMin < -EPSILON || yMax > geometry.height + EPSILON)
      fail('opening-outside-wall', path, 'Opening vertical interval extends beyond the wall height');
    return { ...opening, alongMin: Math.max(-geometry.span / 2, alongMin), alongMax: Math.min(geometry.span / 2, alongMax),
      yMin: Math.max(0, yMin), yMax: Math.min(geometry.height, yMax) };
  });
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    const a = result[i], b = result[j];
    if (a.alongMin < b.alongMax - EPSILON && a.alongMax > b.alongMin + EPSILON &&
        a.yMin < b.yMax - EPSILON && a.yMax > b.yMin + EPSILON)
      fail('overlapping-openings', `openings[${j}]`, `Opening overlaps openings[${i}]`, { otherId: a.id });
  }
  return result;
}

function localToWorld(local, transform) {
  const [x, y, z] = local, [tx, ty, tz] = transform.position;
  const c = Math.cos(transform.yaw), s = Math.sin(transform.yaw);
  return [tx + c * x + s * z, ty + y, tz - s * x + c * z];
}

function worldHalfSize(size, horizontal, yaw) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const along = horizontal ? size[0] : size[2];
  const thickness = horizontal ? size[2] : size[0];
  return [c * along / 2 + s * thickness / 2, s * along / 2 + c * thickness / 2];
}

function numberPart(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  const text = Object.is(rounded, -0) ? '0' : String(rounded);
  return text.replace('-', 'm').replace('.', 'p');
}

function makeId(wallId, horizontal, xMin, xMax, yMin, yMax) {
  const axis = horizontal ? 'x' : 'z';
  return `${wallId}/slice-${axis}${numberPart(xMin)}-${numberPart(xMax)}-y${numberPart(yMin)}-${numberPart(yMax)}`;
}

function sameInterval(a, b) {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

/**
 * Cut a rectangular wall into physical rectangular pieces around window/door
 * openings. `position` and `size` stay in the architecture local frame. The
 * returned `center` and `halfSize` are in world coordinates using the optional
 * third argument `{position, yaw}`. Navigation keeps the source wall separately.
 */
export function cutWallForWindows(wall, openings = [], worldTransform) {
  const geometry = checkWall(wall);
  const transform = checkTransform(worldTransform);
  const checked = checkOpenings(openings, wall, geometry);
  if (!checked.length) return clone(wall);

  const xBounds = [...new Set([-geometry.span / 2, geometry.span / 2, ...checked.flatMap(o => [o.alongMin, o.alongMax])])]
    .sort((a, b) => a - b);
  const yBounds = [...new Set([0, geometry.height, ...checked.flatMap(o => [o.yMin, o.yMax])])]
    .sort((a, b) => a - b);
  const cells = [];
  for (let xi = 0; xi < xBounds.length - 1; xi++) for (let yi = 0; yi < yBounds.length - 1; yi++) {
    const xMin = xBounds[xi], xMax = xBounds[xi + 1], yMin = yBounds[yi], yMax = yBounds[yi + 1];
    if (xMax - xMin <= EPSILON || yMax - yMin <= EPSILON) continue;
    const x = (xMin + xMax) / 2, y = (yMin + yMax) / 2;
    if (checked.some(opening => x > opening.alongMin + EPSILON && x < opening.alongMax - EPSILON &&
        y > opening.yMin + EPSILON && y < opening.yMax - EPSILON)) continue;
    cells.push({ xMin, xMax, yMin, yMax });
  }

  // Merge adjacent cells with the same vertical interval into maximal slices.
  const merged = [];
  for (const cell of cells.sort((a, b) => a.xMin - b.xMin || a.yMin - b.yMin)) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.xMax - cell.xMin) <= EPSILON && sameInterval([previous.yMin, previous.yMax], [cell.yMin, cell.yMax])) previous.xMax = cell.xMax;
    else merged.push({ ...cell });
  }
  return merged.map(({ xMin, xMax, yMin, yMax }) => {
    const alongCenter = (xMin + xMax) / 2;
    const localY = geometry.floorBottom + (yMin + yMax) / 2;
    const localPosition = geometry.horizontal
      ? [wall.position[0] + alongCenter, localY, wall.position[2]]
      : [wall.position[0], localY, wall.position[2] + alongCenter];
    const size = geometry.horizontal
      ? [xMax - xMin, yMax - yMin, geometry.thickness]
      : [geometry.thickness, yMax - yMin, xMax - xMin];
    const center = localToWorld(localPosition, transform);
    return {
      ...clone(wall),
      id: makeId(wall.id, geometry.horizontal, xMin, xMax, yMin, yMax),
      sourceWallId: wall.id,
      position: localPosition,
      size,
      center,
      halfSize: worldHalfSize(size, geometry.horizontal, transform.yaw),
    };
  });
}

export { WindowWallSliceError };

