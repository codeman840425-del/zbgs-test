import {Box3, MathUtils, Raycaster, Vector3} from 'three';

// Cameras in authored rooms use +Z. The Three.js viewer looks down -Z.
export function installedCameraPose(group, spec) {
  if (!group || spec?.forward !== '+Z' || !spec.lensNode) return;
  let lens;
  group.traverse(object => {
    if (object.isMesh && (object.userData.name === spec.lensNode || object.name === spec.lensNode)) lens = object;
  });
  if (!lens) return;
  group.updateWorldMatrix(true, true);
  const forward = new Vector3(0, 0, 1).transformDirection(group.matrixWorld);
  const bounds = new Box3().setFromObject(lens, true);
  const start = bounds.getCenter(new Vector3()).addScaledVector(forward, bounds.getSize(new Vector3()).length() + .001);
  const hit = new Raycaster(start, forward.clone().negate()).intersectObject(lens, false)[0];
  if (hit) return {position:hit.point, forward};
}

// The seat-center check allows 36° on either side. Include the chair edges in the viewer.
export function framingFov(aspect) {
  const tangent = Math.max(Math.tan(MathUtils.degToRad(22)), Math.tan(MathUtils.degToRad(41)) / aspect);
  return MathUtils.radToDeg(2 * Math.atan(tangent));
}
