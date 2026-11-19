import {Box3, Matrix4, Vector3} from 'three';
import {isPortableDeskDevice} from './support-data.js';

// Installation checks also run for saved rooms on floors outside the current view.
export function installationGeometryFacilities(derived) {
  const floors = new Set(), desks = new Set(), carts = new Set();
  for(const point of derived.usePoints??[]) if(point.kind==='standing-vocal') floors.add(point.floorId);
  for (const item of derived.facilities) {
    if (['ceiling', 'parent-device-endpoints', 'wall-opening'].includes(item.resource.mount)) floors.add(item.floorId);
    if (item.resource.mounting?.reserveDesktopArea) desks.add(item.node.parentId);
    if (item.node.attachment?.surfaceId && isPortableDeskDevice(item.resource)) carts.add(item.node.parentId);
  }
  return derived.facilities.filter(item => floors.has(item.floorId) || desks.has(item.node.parentId) ||
    carts.has(item.id) || carts.has(item.node.parentId) || item.resource.garmentRail || item.resource.mount === 'garment-rail');
}

// Measure the installed model in its shelf coordinates, including hidden floors.
export function validateCartPayloadGeometry(facilities, fail) {
  const bounds = new Box3(), point = new Vector3(), transform = new Matrix4(), inverse = new Matrix4();
  for (const device of facilities.values()) {
    const shelfId = device.node.attachment?.surfaceId;
    if (!shelfId || !isPortableDeskDevice(device.resource)) continue;
    const cart = facilities.get(device.node.parentId);
    const shelf = cart?.resource.supportSurfaces?.find(s => s.id === shelfId);
    if (!shelf) return fail('missing-support-surface',device.id,'Missing installed cart shelf');
    inverse.copy(cart.root.matrixWorld).invert();
    bounds.makeEmpty();
    device.visual.traverse(mesh => {
      if (!mesh.isMesh) return;
      const vertices = mesh.geometry.getAttribute('position');
      transform.multiplyMatrices(inverse,mesh.matrixWorld);
      for (let i=0; i<vertices.count; i++)
        bounds.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(transform));
    });
    const [x,z] = shelf.center, [halfX,halfZ] = shelf.halfSize, tolerance = .001;
    if (bounds.isEmpty() || Math.abs(bounds.min.y-shelf.topY)>tolerance ||
        bounds.max.y>shelf.topY+shelf.clearanceHeight+tolerance ||
        bounds.min.x<x-halfX-tolerance || bounds.max.x>x+halfX+tolerance ||
        bounds.min.z<z-halfZ-tolerance || bounds.max.z>z+halfZ+tolerance)
      fail('invalid-cart-device-contact',device.id,'The actual device must rest on the shelf and fit its clear space');
  }
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
