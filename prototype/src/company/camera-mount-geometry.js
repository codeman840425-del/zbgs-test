import * as THREE from 'three';

const EPS = 1e-3;
const namedMesh = (scene, name) => {
  const matches = [];
  scene.traverse(node => {
    if ((node.name === name || node.userData?.name === name) && node.isMesh) matches.push(node);
  });
  return matches;
};

export function validateCameraMountGeometry(scene, resource, fail) {
  if (resource?.mountRole !== 'camera-mount' && resource?.productionBranch !== 'camera-mount') return {checked: false};
  scene.updateMatrixWorld(true);
  for (const key of ['anchorNode', 'cradleNode', 'clearanceNode']) {
    const name = resource.mountDetails?.[key];
    if (namedMesh(scene, name).length !== 1)
      fail('missing-camera-mount-node', `resource.mountDetails.${key}`, 'Camera mount node must resolve to exactly one mesh');
  }
  const box = new THREE.Box3().setFromObject(scene);
  if (!Number.isFinite(box.min.x) || box.min.x < -.4 - EPS || box.max.x > .4 + EPS ||
      box.min.z < -.4 - EPS || box.max.z > .4 + EPS || box.min.y < -.25 - EPS || box.max.y > 1.55 + EPS)
    fail('camera-mount-envelope-mismatch', 'resource.mounting', 'Camera mount geometry exceeds the parent-anchor envelope');
  return {checked: true, bounds: {min: box.min.toArray(), max: box.max.toArray()}};
}
