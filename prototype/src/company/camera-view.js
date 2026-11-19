import {isGlassPartitionSightPane} from './glass-partition.js';
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

// Invoked only on "focus item". Inspect the visible floor at click time;
// orbiting or changing the preview never moves the selected furniture.
export function clearFacilityView(sceneRoot, selected, center, direction, distance, detailName) {
  const obstacles=[];
  function visit(object) {
    if (!object.visible || object===selected) return;
    if (object.isMesh) obstacles.push(object);
    for (const child of object.children) visit(child);
  }
  visit(sceneRoot);
  const detail=detailName && selected.getObjectByName(detailName);
  const targets=[center];
  if (detail?.isMesh) targets.push(new Box3().setFromObject(detail,true).getCenter(new Vector3()));
  const ray=new Raycaster(), up=new Vector3(0,1,0);
  let best;
  for (const angle of [0,.6,-.6,1.1,-1.1]) {
    const view=direction.clone().applyAxisAngle(up,angle);
    const eye=center.clone().addScaledVector(view,distance);
    let clearDistance=distance;
    for (const target of targets) {
      const span=target.clone().sub(eye);
      ray.set(eye,span.clone().normalize());ray.near=.01;ray.far=span.length()-.015;
      for(const hit of ray.intersectObjects(obstacles,false)) {
        const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
        if (!material?.visible || isGlassPartitionSightPane(hit.object) || (material.transparent && material.opacity<.2)) continue;
        clearDistance=Math.min(clearDistance,hit.point.clone().sub(center).dot(view)-.12);
      }
    }
    if (clearDistance===distance) return eye;
    if (!best || clearDistance>best.distance) best={view,distance:clearDistance};
  }
  return center.clone().addScaledVector(best.view, Math.max(.25,best.distance));
}
