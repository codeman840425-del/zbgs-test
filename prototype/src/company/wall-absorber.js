import {BackSide, Box3, DoubleSide, Vector3} from 'three';

const role = 'wall-absorber-panel';
const dimensions = {width: .6, height: 1.2, depth: .08};
const tolerance = .001;

export function validateWallAbsorberResource(resource, fail, path = resource.id) {
  if (resource.mountRole !== role && resource.productionBranch !== role) return;
  const mount = resource.mounting;
  if (resource.mountRole !== role || resource.productionBranch !== role || resource.mount !== 'wall' ||
      resource.category !== 'decor' || resource.asset?.format !== 'glb' || mount?.origin !== 'center' ||
      !Object.entries(dimensions).every(([key, metres]) => mount[key] === metres) ||
      resource.footprint?.blocking || resource.usePoints?.length || Object.keys(resource.stateDefaults ?? {}).length)
    fail('invalid-wall-absorber-contract', path, 'Expected a static 0.60 × 1.20 × 0.08 m acoustic panel anchored by its back centre');
}

// DCC exporters choose their own part names. Inspect the rendered triangles in installation coordinates.
export function validateWallAbsorberGeometry(root, resource, fail, path = resource.id) {
  if (resource.mountRole !== role) return;
  const bounds = new Box3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
  const ab = new Vector3(), ac = new Vector3(), normal = new Vector3();
  let contactArea = 0, sideArea = 0, frontArea = 0;
  root.updateWorldMatrix(true, true);
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
    const {index, attributes, groups, drawRange} = mesh.geometry;
    const count = index?.count ?? attributes.position.count;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const draws = Array.isArray(mesh.material) ? groups : [{start: 0, count, materialIndex: 0}];
    const winding = mesh.matrixWorld.determinant() < 0 ? -1 : 1;
    function vertex(i, target) {
      return mesh.getVertexPosition(index ? index.getX(i) : i, target).applyMatrix4(mesh.matrixWorld);
    }
    for (const draw of draws) {
      const mat = materials[draw.materialIndex];
      if (!mat?.visible || mat.opacity <= 0) continue;
      const end = Math.min(count, draw.start + draw.count, drawRange.start + drawRange.count);
      for (let i = Math.max(draw.start, drawRange.start); i + 2 < end; i += 3) {
        vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
        normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).multiplyScalar(.5);
        if (normal.lengthSq() < 1e-20) continue;
        bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
        const low = Math.min(a.z, b.z, c.z), high = Math.max(a.z, b.z, c.z);
        if (low >= -tolerance && high <= tolerance) contactArea += Math.abs(normal.z);
        if (high - low > tolerance) sideArea += Math.hypot(normal.x, normal.y);
        if (low > tolerance) {
          const facing = normal.z * winding * (mat.side === BackSide ? -1 : 1);
          frontArea += mat.side === DoubleSide ? Math.abs(facing) : Math.max(0, facing);
        }
      }
    }
  });
  const {min, max} = bounds;
  if (bounds.isEmpty() || min.z < -tolerance || max.z > dimensions.depth + tolerance ||
      Math.max(Math.abs(min.x), Math.abs(max.x)) > dimensions.width / 2 + tolerance ||
      Math.max(Math.abs(min.y), Math.abs(max.y)) > dimensions.height / 2 + tolerance)
    fail('wall-absorber-envelope', path, 'Visible panel geometry must fit the stated wall installation');
  if (contactArea < .0001) fail('wall-absorber-back-contact', path, 'No measurable bearing face touches the wall');
  if (max.z < .01 || sideArea < .0001 || frontArea < .0001)
    fail('wall-absorber-relief', path, 'Expected a room-facing panel with physical thickness and edge geometry');
  return {contactArea, sideArea, frontArea, depth: max.z};
}
