const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isFinite(value) && value > 0;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const installs = new Map([
  ['desk-edge-clamp', 'desk.edge'],
  ['floor-surface', 'room.floor'],
  ['wall', 'room.wall'],
]);

export function validateCameraMountResource(resource, fail, path = resource?.id || 'resource') {
  if (resource?.mountRole !== 'camera-mount' && resource?.productionBranch !== 'camera-mount') return;
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
      !Array.isArray(footprint.halfSize) || footprint.halfSize.length !== 2 || !footprint.halfSize.every(positive))
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
