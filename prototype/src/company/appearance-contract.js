// Functional data only. Mesh bindings, materials and descriptive text are display data.
const descriptions = new Set(['limits', 'limitations', 'description', 'notes', 'name', 'label']);
const textOnly = value => typeof value === 'string' || Array.isArray(value) && value.every(item => typeof item === 'string');
function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
  return value === 0 ? 0 : value;
}

/** Describe fixed resource function without mutating or retaining its input objects. */
export function describeFacilityFunction(resource) {
  const usePoints = (resource.usePoints || []).map(point => {
    const fields = Object.entries(point).filter(([field, value]) =>
      !['seatNodeId', 'backNodeId'].includes(field) && !(descriptions.has(field) && textOnly(value)));
    return normalized({yaw: 0, ...Object.fromEntries(fields)});
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const stateFields = Object.fromEntries(Object.keys(resource.stateDefaults || {}).sort().map(field => [field, typeof resource.stateDefaults[field]]));
  const footprint = resource.footprint?.blocking ? normalized(resource.footprint) : null;
  const surface = resource.surface ? normalized(resource.surface) : null;
  const supportSurfaces = resource.supportSurfaces ? normalized([...resource.supportSurfaces].sort((a,b) => a.id.localeCompare(b.id))) : null;
  const movingParts = resource.movingParts ? normalized([...resource.movingParts].sort((a,b) => a.id.localeCompare(b.id))) : null;
  const mount = resource.mount ?? null;
  const capacity = normalized(resource.capacity ?? null), clearance = normalized(resource.clearance ?? null);
  const decorative = resource.category === 'decor' && !usePoints.length && !footprint && !surface && !supportSurfaces && !mount && !Object.keys(stateFields).length && capacity === null && clearance === null;
  return {
    category: resource.category ?? null,
    mountRole: decorative ? null : resource.mountRole || resource.id,
    coordinates: {units: resource.coordinates?.units ?? 'metres', up: resource.coordinates?.up ?? '+Y', forward: resource.coordinates?.forward ?? '+Z'},
    mount, mounting:normalized(resource.mounting??null), surface, supportSurfaces, movingParts, footprint, usePoints,
    capacity, clearance,
    state: {fields: stateFields, schema: normalized(resource.stateSchema ?? null), semantics: normalized(resource.stateSemantics ?? null)},
  };
}

/** Return functional differences as resource-relative field paths. No error class dependency. */
export function compareFacilityFunction(source, replacement) {
  const before = describeFacilityFunction(source), after = describeFacilityFunction(replacement), differences = [];
  function compare(a, b, field) {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) differences.push({field: `${field}.length`, from: a.length, to: b.length});
      for (let index = 0; index < Math.max(a.length, b.length); index++) compare(a[index], b[index], `${field}[${index}]`);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) compare(a[key], b[key], field ? `${field}.${key}` : key);
      return;
    }
    differences.push({field, from: a, to: b});
  }
  compare(before, after, '');
  return {compatible: differences.length === 0, differences};
}
