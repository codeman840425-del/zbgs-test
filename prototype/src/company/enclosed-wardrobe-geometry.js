import {Box3, Matrix4, Ray, Triangle, Vector3} from 'three';
import {HANGING_ENVELOPE, HOOK_CROWN_ALLOWANCE} from './garment-rack-data.js';

const TOLERANCE = .001;
const TRANSFORM_TOLERANCE = 1e-6;
const RAIL_TOLERANCE = .0006;
const AREA_TOLERANCE = 1e-10;
const SIDES = ['left', 'right'];

const materials = mesh => [mesh.material].flat();
const descendant = (node, parent) => {
  for (let owner = node.parent; owner; owner = owner.parent) if (owner === parent) return true;
  return false;
};
const near = (actual, expected, tolerance = TOLERANCE) => Math.abs(actual - expected) <= tolerance;

function unrotatedUnitScale(node) {
  const {x, y, z, w} = node.quaternion;
  return [x, y, z].every(v => near(v, 0, TRANSFORM_TOLERANCE)) && near(Math.abs(w), 1, TRANSFORM_TOLERANCE) &&
    node.scale.toArray().every(v => near(v, 1, TRANSFORM_TOLERANCE));
}

function visible(node) {
  for (let current = node; current; current = current.parent) if (!current.visible) return false;
  return !node.isMesh || materials(node).some(material => material?.visible && material.opacity > 0);
}

function geometryFor(mesh, inverseScene, reject) {
  const positions = mesh.geometry?.getAttribute('position');
  const indices = mesh.geometry?.getIndex();
  const count = indices?.count ?? positions?.count;
  if (!positions || !count || count % 3 || mesh.isSkinnedMesh || mesh.isInstancedMesh ||
      mesh.geometry.morphAttributes.position?.length)
    reject('wardrobe-triangles', mesh.name, 'Expected finite, static triangle geometry');
  const transform = new Matrix4().multiplyMatrices(inverseScene, mesh.matrixWorld);
  const points = Array.from({length: positions.count}, (_, i) => new Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform));
  const triangles = [];
  const bounds = new Box3();
  for (let i = 0; i < count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map(k => points[indices ? indices.getX(k) : k]);
    if (![a, b, c].every(point => point?.toArray().every(Number.isFinite)))
      reject('wardrobe-triangles', mesh.name, 'Triangle indices must reference finite vertices');
    const face = new Triangle(a, b, c);
    if (face.getArea() <= AREA_TOLERANCE) continue;
    triangles.push(face);
    bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  if (!triangles.length) reject('wardrobe-triangles', mesh.name, 'This part must have positive-area triangles');
  return {mesh, triangles, bounds};
}

function minSweptDepth(x, z, angle) {
  // A point follows z(theta) = z cos(theta) - x sin(theta). Its only
  // interior extrema satisfy theta = atan2(-x, z) modulo pi.
  const lo = Math.min(0, angle), hi = Math.max(0, angle), extremum = Math.atan2(-x, z);
  const depth = theta => z * Math.cos(theta) - x * Math.sin(theta);
  let minimum = Math.min(z, depth(angle));
  for (const theta of [extremum - Math.PI, extremum, extremum + Math.PI]) {
    if (theta > lo && theta < hi) minimum = Math.min(minimum, depth(theta));
  }
  return minimum;
}

const ray = new Ray(), hit = new Vector3();
function nearestTriangle(triangles, origin, direction) {
  ray.set(origin, direction);
  let nearest = Infinity;
  for (const {a, b, c} of triangles) {
    if (ray.intersectTriangle(a, b, c, false, hit)) nearest = Math.min(nearest, origin.distanceTo(hit));
  }
  return nearest;
}

function validateRail(rail, profile, reject) {
  const {radius, centerY, slots} = profile;
  const [left, right] = slots.map(slot => slot.position[0]);
  const vertices = rail.triangles.flatMap(({a, b, c}) => [a, b, c]);
  if (vertices.some(p => Math.hypot(p.y - centerY, p.z) > radius + RAIL_TOLERANCE))
    reject('invalid-garment-rail', 'garment-rail', 'Visible rail triangles must fit the declared X-axis cylinder');
  for (let i = 0; i <= 8; i++) {
    const x = left + (right - left) * i / 8;
    for (const [y, z] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]]) {
      const distance = nearestTriangle(rail.triangles, new Vector3(x, centerY + .04 * y, .04 * z), new Vector3(0, -y, -z));
      if (!near(.04 - distance, radius, RAIL_TOLERANCE))
        reject('invalid-garment-rail', 'garment-rail', 'The physical rail must extend through both slots at the declared radius');
    }
  }
}

function validateDoor(side, part, pivot, panel, hardware, inserts, moving, boxFront, reject) {
  const inward = side === 'left' ? 1 : -1;
  const angle = -inward * Math.PI / 2;
  const axis = new Vector3().fromArray(part.pivot);
  const min = new Vector3().fromArray(part.bounds.min);
  const max = new Vector3().fromArray(part.bounds.max);
  const envelope = new Box3(min.add(axis), max.add(axis)).expandByScalar(TOLERANCE);

  for (const shape of moving) {
    // At a fixed angle, every triangle's min Z occurs at one of its vertices.
    for (const {a, b, c} of shape.triangles) {
      for (const p of [a, b, c]) {
        if (axis.z + minSweptDepth(p.x - axis.x, p.z - axis.z, angle) <= boxFront + TOLERANCE)
          reject('blocked-garment-slot', shape.mesh.name, 'A moving door triangle enters the hanging depth during the quarter turn');
      }
    }
    if (!envelope.containsBox(shape.bounds))
      reject('moving-part-bounds', shape.mesh.name, 'Door geometry exceeds its declared pivot-local envelope');
  }

  const panelBounds = panel.reduce((box, shape) => box.union(shape.bounds), new Box3());
  const panelReach = (inward > 0 ? panelBounds.max.x - axis.x : axis.x - panelBounds.min.x);
  const hingeSide = inward > 0 ? panelBounds.min.x : panelBounds.max.x;
  if (panelReach < .44 || Math.abs(hingeSide - axis.x) > .02 ||
      Math.abs(panelBounds.min.y - axis.y) > .02 || panelBounds.max.y - axis.y < 1.60 ||
      panelBounds.max.z - panelBounds.min.z < .004)
    reject('wardrobe-panel-shape', pivot.name, 'Each leaf needs a full-height, physical door panel spanning its hinged opening');
  const face = [...panel, ...inserts].flatMap(shape => shape.triangles);
  const depth = new Vector3(0, 0, -1);
  for (const height of [.20, .55, 1.1, 1.45]) {
    for (const width of [.075, .23, .39]) {
      const origin = new Vector3(axis.x + inward * width, axis.y + height, axis.z + .04);
      if (nearestTriangle(face, origin, depth) > .065)
        reject('wardrobe-panel-shape', pivot.name, 'Front rays must meet actual panel, inset or glass triangles across the closed leaf');
    }
  }
  const handle = hardware.handle.reduce((box, shape) => box.union(shape.bounds), new Box3());
  const hinges = hardware.hinges.reduce((box, shape) => box.union(shape.bounds), new Box3());
  const handleCenter = handle.getCenter(new Vector3());
  if (inward * (handleCenter.x - axis.x) < .25 || handle.max.z < axis.z + .012)
    reject('wardrobe-hardware-shape', `${pivot.name}.handle`, 'The visible handle must project from the outer face near the free edge');
  if (Math.max(Math.abs(hinges.min.x - axis.x), Math.abs(hinges.max.x - axis.x)) > .04 ||
      hinges.max.y - hinges.min.y < .65)
    reject('wardrobe-hardware-shape', `${pivot.name}.hinges`, 'Visible hinge hardware must follow the actual outer axis at two heights');
}

export function validateEnclosedWardrobeGeometry(scene, resource, fail) {
  if (resource?.movingProfile !== 'enclosed-wardrobe-v1') return;
  const reject = (code, target, message) => fail(code, `${resource.id}.${target}`, message);
  if (!scene?.isObject3D) reject('invalid-moving-part-scene', 'scene', 'Expected a loaded wardrobe scene');
  scene.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(scene.matrixWorld).invert();
  const names = new Map();
  const geometry = new Map();
  scene.traverse(node => {
    const name = node.userData?.name || node.name;
    if (name) names.set(name, [...(names.get(name) ?? []), node]);
    if (node.isMesh && visible(node)) geometry.set(node, geometryFor(node, inverse, reject));
  });

  function binding(name, optional = false) {
    const matches = names.get(name) ?? [];
    if (!matches.length && optional) return null;
    if (matches.length !== 1 || !visible(matches[0]))
      reject('wardrobe-node', name, 'Expected one unique visible authored node for this wardrobe component');
    return matches[0];
  }
  function components(node) {
    const shapes = [];
    node.traverse(mesh => { if (geometry.has(mesh)) shapes.push(geometry.get(mesh)); });
    if (!shapes.length) reject('wardrobe-node', node.name, 'This node must contain visible physical triangles');
    return shapes;
  }

  const pivots = SIDES.map(side => binding(resource.partNodes[side]));
  if (pivots[0].parent !== pivots[1].parent)
    reject('moving-part-parent-transform', 'partNodes', 'The two door axes must share a fixed parent');
  for (let parent = pivots[0].parent; parent && parent !== scene; parent = parent.parent) {
    if (parent.isMesh || parent.position.length() > TRANSFORM_TOLERANCE || !unrotatedUnitScale(parent))
      reject('moving-part-parent-transform', parent.name, 'Door parent wrappers must be untransformed groups');
  }

  const {slots} = resource.garmentRail;
  const {width, height, depth} = HANGING_ENVELOPE;
  const spaces = slots.map(({id, position: [x, y, z]}) => ({id, box: new Box3(
    new Vector3(x - width / 2, y - height, z - depth / 2),
    new Vector3(x + width / 2, y + HOOK_CROWN_ALLOWANCE, z + depth / 2))}));
  const boxFront = Math.max(...spaces.map(({box}) => box.max.z));
  const movingMeshes = new Set();
  const glazed = SIDES.map(side => binding(`wardrobe-${side}-glass`, true));
  const requiresGlass = resource.id === 'enclosed-wardrobe-glass' || resource.provenance?.sourceDesign === 'glazed-frame';
  if (Boolean(glazed[0]) !== Boolean(glazed[1]) || (requiresGlass && !glazed[0]))
    reject('wardrobe-glass', 'partPanels', 'A glazed wardrobe must have a separate glass component on both leaves');

  for (const [index, side] of SIDES.entries()) {
    const part = resource.movingParts.find(part => part.id === side);
    const pivot = pivots[index];
    if (pivot.isMesh || !unrotatedUnitScale(pivot) || !pivot.position.toArray().every((v, i) => near(v, part.pivot[i])))
      reject('invalid-moving-part-pivot', pivot.name, 'Expected the declared closed axis with unit scale and no baked rotation');
    const panel = binding(resource.partPanels[side]);
    const handle = binding(`wardrobe-${side}-handle`), hinges = binding(`wardrobe-${side}-hinges`);
    const inset = binding(`wardrobe-${side}-inset`, true), glass = glazed[index];
    for (const component of [panel, handle, hinges, inset, glass].filter(Boolean)) {
      if (!descendant(component, pivot))
        reject('moving-part-panel-parent', component.name, 'The panel and its hardware or glazing must belong to the correct axis');
    }
    const panelShapes = components(panel).filter(({mesh}) => ![inset, glass].some(insert => insert && (mesh === insert || descendant(mesh, insert))));
    const handleShapes = components(handle), hingeShapes = components(hinges);
    const insertShapes = [inset, glass].filter(Boolean).flatMap(components);
    for (const shape of [...panelShapes, ...handleShapes, ...hingeShapes]) {
      if (materials(shape.mesh).some(material => material.transparent || material.transmission > 0))
        reject('wardrobe-glass', shape.mesh.name, 'Frames and hardware must keep opaque materials');
    }
    if (glass && components(glass).some(({mesh}) => materials(mesh).some(material =>
      !material.visible || !material.transparent || !(material.opacity > 0 && material.opacity < 1))))
      reject('wardrobe-glass', glass.name, 'Glass must use visible semi-transparent blend material on the actual mesh');
    const moving = components(pivot);
    validateDoor(side, part, pivot, panelShapes, {handle: handleShapes, hinges: hingeShapes}, insertShapes, moving, boxFront, reject);
    for (const {mesh} of moving) movingMeshes.add(mesh);
  }

  const railNode = binding('garment-rail');
  const rail = components(railNode);
  if (rail.length !== 1 || movingMeshes.has(rail[0].mesh))
    reject('invalid-garment-rail', 'garment-rail', 'The rail must be a separate fixed mesh, independent of both doors');
  validateRail(rail[0], resource.garmentRail, reject);
  for (const shape of geometry.values()) {
    if (shape === rail[0] || movingMeshes.has(shape.mesh)) continue;
    for (const {box, id} of spaces) {
      if (box.intersectsBox(shape.bounds) && shape.triangles.some(face => box.intersectsTriangle(face)))
        reject('blocked-garment-slot', id, `Fixed wardrobe triangles occupy the hanging envelope (${shape.mesh.name})`);
    }
  }
}
