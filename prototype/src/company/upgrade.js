import {CompanyError, deriveCompany, catalogMaps} from './document.js';
import {inspectCompanyPlacement} from './placement.js';
import {compareFacilityFunction} from './appearance-contract.js';

const fail = (code, path, message, details = {}) => { throw new CompanyError(code, path, message, details); };
const refKey = ref => `${ref?.id}@${ref?.version}`;
const instanceFields = new Set(['id', 'kind', 'stationId', 'partKey', 'parentId', 'resource', 'transform', 'state', 'appearance']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const parentKey = part => part.parentKey ?? null;

function partsMap(template, resources, path) {
  if (!Array.isArray(template.parts)) fail('invalid-upgrade-template', path, 'Expected template parts');
  const parts = new Map();
  for (const part of template.parts) {
    if (!part || typeof part.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(part.key) || parts.has(part.key))
      fail('invalid-upgrade-template', path, 'Template part keys must be distinct stable identifiers');
    if (!resources.has(refKey(part.resource))) fail('missing-resource-version', `${path}.${part.key}.resource`, refKey(part.resource));
    parts.set(part.key, part);
  }
  for (const part of parts.values()) {
    const seen = new Set([part.key]);
    let ancestor = parentKey(part);
    while (ancestor !== null) {
      if (!parts.has(ancestor)) fail('invalid-upgrade-template', `${path}.${part.key}.parentKey`, `Missing parent part ${ancestor}`);
      if (seen.has(ancestor)) fail('parent-cycle', `${path}.${part.key}.parentKey`, 'Template attachment graph contains a cycle');
      seen.add(ancestor); ancestor = parentKey(parts.get(ancestor));
    }
  }
  return parts;
}

function localOverrides(member, part, resources) {
  const overrides = [];
  for (const field of ['transform', 'resource']) if (!same(member[field], part[field])) overrides.push({field, value: member[field]});
  const reference = resources.get(refKey(part.resource));
  const actual = resources.get(refKey(member.resource));
  const defaults = {...reference.stateDefaults, ...part.state};
  const effective = {...actual.stateDefaults, ...member.state};
  for (const field of new Set([...Object.keys(defaults), ...Object.keys(effective)])) {
    const explicit = Object.hasOwn(member.state || {}, field) &&
      (!Object.hasOwn(part.state || {}, field) || !same(member.state[field], part.state[field]));
    if (explicit || !same(effective[field], defaults[field])) overrides.push({field: `state.${field}`, value: effective[field]});
  }
  if (member.appearance !== undefined) overrides.push({field: 'appearance', value: member.appearance});
  for (const field of Object.keys(member)) if (!instanceFields.has(field)) overrides.push({field, value: member[field]});
  return overrides;
}

function compatibleResource(actual, expected, part, path, existing, overrides) {
  const expectedRole = part.requiredRole || expected.mountRole || expected.id;
  if ((actual.mountRole || actual.id) !== expectedRole)
    fail('template-upgrade-conflict', `${path}.resource.mountRole`, 'Matching part keys must retain the target role');
  const compatibility = compareFacilityFunction(actual, expected);
  if (!compatibility.compatible)
    fail('template-upgrade-conflict', `${path}.resource.${compatibility.differences[0].field}`,
      'Template resource migration must preserve the fixed functional contract', {differences: compatibility.differences});
  if (existing) {
    const selected = overrides.some(o => o.field === 'resource') ? actual : expected;
    const stateOverrides = Object.fromEntries(overrides.filter(o => o.field.startsWith('state.')).map(o => [o.field.slice(6), o.value]));
    const currentState = {...actual.stateDefaults, ...existing.state};
    const projectedState = {...selected.stateDefaults, ...part.state, ...stateOverrides};
    const changedField = [...new Set([...Object.keys(currentState), ...Object.keys(projectedState)])].sort().find(field => !same(currentState[field], projectedState[field]));
    if (changedField !== undefined)
      fail('template-upgrade-conflict', `${path}.state.${changedField}`, 'Target defaults would change the existing effective device state; retain that state explicitly before retrying');
  }
}

function descendants(nodes, id) {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) if (found.has(node.parentId) && !found.has(node.id)) { found.add(node.id); changed = true; }
  }
  return found;
}

function upgradeFailure(error, stationId, members) {
  if (!(error instanceof CompanyError)) throw error;
  const member = [...members.values()].sort((a, b) => b.id.length - a.id.length).find(node =>
    error.path === node.id || error.path.startsWith(`${node.id}.`) || error.path.startsWith(`${node.id}#`));
  let path = `${stationId}.placement`;
  if (member) {
    let field = error.path.slice(member.id.length).replace(/^[.#]/, '');
    if (!field) field = {
      'missing-mount-surface': 'parentKey', 'invalid-part-attachment': 'parentKey',
      'incompatible-template-part': 'resource', 'missing-resource-version': 'resource',
      'duplicate-use-point': 'resource.usePoints',
    }[error.code] || 'transform';
    path = `${stationId}.parts.${member.partKey}.${field}`;
  }
  fail('template-upgrade-conflict', path, `Candidate rejected by ${error.code}: ${error.message}`,
    {cause: {code: error.code, path: error.path, details: error.details}});
}

/** Pure explicit migration. Caller loads resources and publishes the returned candidate. */
export function prepareTemplateUpgrade(document, stationId, targetRef, {catalog, templates, isUsePointBusy = () => false} = {}) {
  const before = deriveCompany(document, catalog, templates);
  const station = before.nodes.get(stationId);
  if (station?.kind !== 'workstation') fail('invalid-operation', stationId, 'Template upgrade expects a workstation');
  if (!targetRef || typeof targetRef.id !== 'string' || !Number.isInteger(targetRef.version) || targetRef.version < 1)
    fail('missing-template-version', `${stationId}.template`, 'Specify an exact target template ID and version');
  const {resources, combinations} = catalogMaps(catalog, templates);
  const sourceTemplate = combinations.get(refKey(station.template));
  const targetTemplate = combinations.get(refKey(targetRef));
  if (!targetTemplate) fail('missing-template-version', `${stationId}.template`, refKey(targetRef));
  const sourceParts = partsMap(sourceTemplate, resources, `${stationId}.source.parts`);
  const targetParts = partsMap(targetTemplate, resources, `${stationId}.parts`);
  const related = descendants(document.nodes, stationId);
  for (const point of before.usePoints) if (related.has(point.facilityId) && isUsePointBusy(point.id))
    fail('facility-busy', point.id, 'Reserved, occupied or exiting use point prevents template upgrade');

  const currentMembers = new Map(document.nodes.filter(n => n.stationId === stationId).map(n => [n.partKey, n]));
  const memberIds = new Set([...currentMembers.values()].map(n => n.id));
  const removed = new Set(), changes = [], retainedOverrides = [];
  for (const [partKey, member] of currentMembers) if (!targetParts.has(partKey)) {
    const path = `${stationId}.parts.${partKey}`;
    const overrides = localOverrides(member, sourceParts.get(partKey), resources);
    if (overrides.length) fail('template-upgrade-conflict', `${path}.${overrides[0].field}`, 'Removing this part would discard a local override');
    const subtree = descendants(document.nodes, member.id);
    const customChild = document.nodes.find(node => subtree.has(node.id) && !memberIds.has(node.id));
    if (customChild) fail('template-upgrade-conflict', `${path}.children`, 'Removing this part would discard a custom child dependency', {childId: customChild.id});
    removed.add(member.id);
    changes.push({type: 'removed-part', partKey, instanceId: member.id});
  }

  const candidate = structuredClone(document);
  const candidateStation = candidate.nodes.find(n => n.id === stationId);
  const allocated = new Set([document.id, ...document.nodes.map(n => n.id)]);
  const nextMembers = new Map();
  for (const [partKey, part] of targetParts) {
    const existing = currentMembers.get(partKey);
    let member;
    if (existing) {
      member = structuredClone(existing);
      const sourcePart = sourceParts.get(partKey);
      const overrides = localOverrides(existing, sourcePart, resources);
      const path = `${stationId}.parts.${partKey}`;
      if (parentKey(sourcePart) !== parentKey(part) && overrides.some(o => o.field === 'transform'))
        fail('template-upgrade-conflict', `${path}.transform`, 'The parentKey changed while a relative transform override exists; specify the new placement explicitly',
          {sourceParentKey: parentKey(sourcePart), targetParentKey: parentKey(part)});
      const expected = resources.get(refKey(part.resource));
      compatibleResource(resources.get(refKey(existing.resource)), expected, part, path, existing, overrides);
      member.resource = structuredClone(overrides.some(o => o.field === 'resource') ? existing.resource : part.resource);
      compatibleResource(resources.get(refKey(member.resource)), expected, part, path);
      member.transform = structuredClone(overrides.some(o => o.field === 'transform') ? existing.transform : part.transform);
      const stateOverrides = overrides.filter(o => o.field.startsWith('state.')).map(o => [o.field.slice(6), structuredClone(o.value)]);
      member.state = {...structuredClone(part.state || {}), ...Object.fromEntries(stateOverrides)};
      for (const override of overrides) {
        retainedOverrides.push({partKey, instanceId: existing.id, field: override.field, value: structuredClone(override.value)});
      }
    } else {
      const base = `${stationId}/${partKey}`;
      let id = base, serial = 0;
      while (allocated.has(id)) id = `${base}-${++serial}`;
      allocated.add(id);
      member = {id, kind: 'facility', stationId, partKey, resource: structuredClone(part.resource), transform: structuredClone(part.transform), state: structuredClone(part.state || {})};
      changes.push({type: 'added-part', partKey, instanceId: id});
    }
    nextMembers.set(partKey, member);
  }
  for (const [partKey, member] of nextMembers) {
    const part = targetParts.get(partKey);
    member.parentId = parentKey(part) === null ? stationId : nextMembers.get(part.parentKey).id;
    const previous = currentMembers.get(partKey);
    if (previous) for (const field of ['parentId', 'resource', 'transform', 'state']) if (!same(previous[field], member[field]))
      changes.push({type: 'updated-part', partKey, instanceId: member.id, field, from: structuredClone(previous[field]), to: structuredClone(member[field])});
  }
  candidate.nodes = candidate.nodes.filter(n => !removed.has(n.id)).map(n => n.stationId === stationId ? nextMembers.get(n.partKey) : n);
  for (const [partKey, member] of nextMembers) if (!currentMembers.has(partKey)) candidate.nodes.push(member);
  candidateStation.template = {id: targetRef.id, version: targetRef.version};
  changes.unshift({type: 'template', instanceId: stationId, from: structuredClone(station.template), to: structuredClone(candidateStation.template)});
  candidate.revision++;
  try {
    deriveCompany(candidate, catalog, templates);
    inspectCompanyPlacement(candidate, catalog, templates);
  } catch (error) { upgradeFailure(error, stationId, nextMembers); }
  return {document: candidate, changes, retainedOverrides};
}
