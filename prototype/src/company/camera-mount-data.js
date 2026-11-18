const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isFinite(value) && value > 0;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const installs = new Map([
  ['desk-edge-clamp', 'desk.edge'],
  ['floor-surface', 'room.floor'],
  ['wall', 'room.wall'],
]);

export function validateCameraMountResource(resource, fail, path = resource?.id || 'resource') {
  if (resource?.mount !== 'desk-edge-clamp' && resource?.mountRole !== 'camera-mount' && resource?.productionBranch !== 'camera-mount') return;
  if (resource.mountRole !== 'camera-mount' || resource.productionBranch !== 'camera-mount' || !installs.has(resource.mount))
    fail('invalid-camera-mount-contract', path, 'Camera mounts require a supported mount role, production branch and install adapter');
  if (resource.parent !== installs.get(resource.mount))
    fail('invalid-camera-mount-contract', `${path}.parent`, 'Camera mount parent must match its install adapter');
  const m = resource.mounting;
  if (!object(m) || m.origin !== 'parent anchor plane centre' || m.envelopeUnits !== 'metres' ||
      ![m.width, m.height, m.depth].every(positive) || m.width > .8 || m.height > 1.8 || m.depth > .8)
    fail('invalid-camera-mount-contract', `${path}.mounting`, 'Camera mount envelope must be positive and within the declared 0.8 by 1.8 by 0.8 metre contract');
  const footprint = resource.footprint;
  if (!object(footprint) || footprint.blocking !== true || footprint.clearanceRequired !== true ||
      !Array.isArray(footprint.center) || footprint.center.length !== 2 || !footprint.center.every(Number.isFinite) ||
      !Array.isArray(footprint.halfSize) || footprint.halfSize.length !== 2 || !footprint.halfSize.every(positive) ||
      footprint.center.some(v => v !== 0) || footprint.halfSize[0] !== m.width / 2 || footprint.halfSize[1] !== m.depth / 2)
    fail('invalid-camera-mount-contract', `${path}.footprint`, 'Camera mounts require a blocking clearance footprint');
  if (!Array.isArray(resource.usePoints) || resource.usePoints.length !== 0)
    fail('invalid-camera-mount-contract', `${path}.usePoints`, 'Camera mounts do not declare actor use points');
  const details = resource.mountDetails;
  if (!object(details) || !['anchorNode', 'cradleNode', 'clearanceNode', 'clearance'].every(key => typeof details[key] === 'string' && ID.test(details[key])))
    fail('invalid-camera-mount-contract', `${path}.mountDetails`, 'Camera mounts require named anchor, cradle and clearance nodes');
  if (!object(resource.stateDefaults) || resource.stateDefaults.mounted !== true ||
      !object(resource.stateSchema) || resource.stateSchema.mounted?.type !== 'boolean')
    fail('invalid-camera-mount-contract', `${path}.stateSchema`, 'Camera mounts require a boolean mounted state');
}

export function isCameraMountResource(resource) {
  return resource?.mountRole === 'camera-mount' || resource?.productionBranch === 'camera-mount';
}

// Both v1 jaws have centre Z=-.02 and depth .055. The inside face must
// touch the desk rim while the upper plate extends onto its top.
const JAW_FACE_Z = -.02 + .055 / 2;
const CONTACT_TOLERANCE = .001;

export function cameraDeskEdgePlacement(surface, yaw = 0) {
  const turn = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  const normalAxis = turn % 2 === 0 ? 2 : 0, alongAxis = 2 - normalAxis;
  const sign = turn < 2 ? -1 : 1;
  const position = [0, surface.topY, 0];
  position[normalAxis] = sign * (surface.halfSize[normalAxis / 2] + JAW_FACE_Z);
  return {position, yaw, alongAxis, normalAxis};
}

export function validateCameraDeskContact(node, resource, parent, parentResource, fail) {
  const surface = parentResource?.surface;
  if (parent?.kind !== 'facility' || parentResource?.mountRole !== 'desk' || !surface)
    fail('missing-mount-surface', node.id, 'A desk-edge camera mount requires a desk parent with a declared surface');
  const edge = cameraDeskEdgePlacement(surface, node.transform.yaw);
  const p = node.transform.position;
  if (Math.abs(p[1] - surface.topY) > CONTACT_TOLERANCE ||
      Math.abs(p[edge.normalAxis] - edge.position[edge.normalAxis]) > CONTACT_TOLERANCE ||
      Math.abs(p[edge.alongAxis]) + resource.mounting.width / 2 > surface.halfSize[edge.alongAxis / 2] + CONTACT_TOLERANCE)
    fail('invalid-camera-mount-fit', node.id, 'Seat the clamp jaw on the desk rim facing inward, with its complete width on the edge');
}

export function sharesCameraDeskContact(a, b) {
  const attached = (child, parent) => child.resource.mount === 'desk-edge-clamp' &&
    child.resource.mountRole === 'camera-mount' && parent.resource.mountRole === 'desk' && child.node.parentId === parent.id;
  return attached(a, b) || attached(b, a);
}

export function wallEnvelopeBottom(resource, height) {
  const centered = resource.mounting.origin === 'center' ||
    (resource.mount === 'wall' && resource.mountRole === 'camera-mount');
  return centered ? height - resource.mounting.height / 2 : height;
}

// The wall is the backing plane. Only the room-facing half of the nominal
// symmetric clearance is occupiable, including the v1 boom and camera cradle.
export function cameraWallFootprint(resource) {
  const fp = resource.footprint, halfDepth = fp.halfSize[1] / 2;
  return {...fp, center: [0, halfDepth], halfSize: [fp.halfSize[0], halfDepth]};
}
