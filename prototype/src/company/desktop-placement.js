import {Box3, Vector3} from 'three';

// Installation checks also run for saved rooms on floors outside the current view.
export function installationGeometryFacilities(derived) {
  const floors = new Set(), desks = new Set();
  for (const item of derived.facilities) {
    if (['ceiling', 'parent-device-endpoints', 'wall-opening'].includes(item.resource.mount)) floors.add(item.floorId);
    if (item.resource.mounting?.reserveDesktopArea) desks.add(item.node.parentId);
  }
  return derived.facilities.filter(item => floors.has(item.floorId) || desks.has(item.node.parentId) ||
    item.resource.garmentRail || item.resource.mount === 'garment-rail');
}

function reservedBox(item) {
  const {width, depth, height} = item.resource.mounting;
  return new Box3(new Vector3(-width/2, 0, -depth/2), new Vector3(width/2, height, depth/2))
    .applyMatrix4(item.root.matrixWorld);
}

function overlaps(a, b) {
  // Touching and export noise at a shared boundary do not consume working space.
  const epsilon = .0001;
  return ['x','y','z'].every(axis => a.max[axis] > b.min[axis]+epsilon && b.max[axis] > a.min[axis]+epsilon);
}

export function validateDesktopReservations(facilities, fail) {
  const reservations = [...facilities.values()].filter(item => item.resource.mounting?.reserveDesktopArea);
  if (!reservations.length) return;
  const meshBox = new Box3();
  for (const item of reservations) {
    const area = reservedBox(item);
    for (const other of facilities.values()) {
      if (other.id === item.id || other.node.parentId !== item.node.parentId) continue;
      const link = other.node.cableLink;
      if (link && [link.a.deviceId,link.b.deviceId].includes(item.id)) continue;
      const reject = () => fail('desktop-area-occupied',item.id,'Reserved desktop area overlaps '+other.id);
      if (other.resource.mounting?.reserveDesktopArea && overlaps(area,reservedBox(other))) reject();
      // Per-mesh bounds let a raised monitor overhang the pad while its foot stays clear.
      other.visual.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (overlaps(area,meshBox)) reject();
      });
    }
  }
}
