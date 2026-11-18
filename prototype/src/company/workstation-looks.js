import workstationLooks from './workstation-looks.json' with {type: 'json'};
import {catalogMaps, CompanyError, deriveCompany, prepareCompanyChange} from './document.js';

export {workstationLooks};

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(value);
const exactFields = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const isRef = ref => exactFields(ref, ['id', 'version']) && identifier(ref.id) && Number.isSafeInteger(ref.version) && ref.version > 0;
const refKey = ref => `${ref.id}@${ref.version}`;

function invalidLook(path, message) {
  throw new CompanyError('invalid-workstation-look', path, message);
}

export function resolveWorkstationLook(ref) {
  const recipe = isRef(ref) && workstationLooks.find(look => look.id === ref.id && look.version === ref.version);
  if (!recipe) throw new CompanyError('missing-workstation-look', 'recipe', 'Specify an existing workstation look ID and exact version');
  return recipe;
}

/** Return one validated replacement batch. Apply it together with the caller's revision and occupancy guards. */
export function workstationLookOperations(document, stationId, recipe, catalog, templates) {
  if (!exactFields(recipe, ['id', 'version', 'displayName', 'templates', 'parts']) || !identifier(recipe.id) ||
      !Number.isSafeInteger(recipe.version) || recipe.version < 1 || typeof recipe.displayName !== 'string' || !recipe.displayName.trim() ||
      !Array.isArray(recipe.templates) || !recipe.templates.length || !Array.isArray(recipe.parts) || !recipe.parts.length)
    invalidLook('recipe', 'Expected a versioned workstation look with a name, template references and parts');

  const allowedTemplates = new Set();
  for (const ref of recipe.templates) {
    if (!isRef(ref) || allowedTemplates.has(refKey(ref)))
      invalidLook('recipe.templates', 'Expected distinct exact template references');
    allowedTemplates.add(refKey(ref));
  }
  const parts = new Map();
  for (const [index, part] of recipe.parts.entries()) {
    if (!exactFields(part, ['key', 'parentKey', 'role', 'resource']) || !identifier(part.key) ||
        (part.parentKey !== null && !identifier(part.parentKey)) || !identifier(part.role) || !isRef(part.resource) || parts.has(part.key))
      invalidLook(`recipe.parts[${index}]`, 'Expected a distinct part key, parent key or null, role, and exact resource reference');
    parts.set(part.key, part);
  }

  if (!Array.isArray(document?.nodes)) throw new CompanyError('invalid-nodes', 'document.nodes', 'Expected an array');
  const station = document.nodes.find(node => node?.id === stationId);
  if (station?.kind !== 'workstation') throw new CompanyError('invalid-operation', 'stationId', `${stationId} must identify an existing workstation`);
  const {resources, combinations} = catalogMaps(catalog, templates);
  if (!isRef(station.template) || !combinations.has(refKey(station.template)))
    throw new CompanyError('missing-template-version', stationId, 'Load the exact template for the workstation');
  const templateId = refKey(station.template);
  if (!allowedTemplates.has(templateId))
    throw new CompanyError('incompatible-workstation-look', `${stationId}.template`, `${recipe.id} does not target ${templateId}`);
  const template = combinations.get(templateId);
  if (parts.size !== template.parts.length)
    invalidLook('recipe.parts', 'Every template part requires exactly one replacement');

  const members = new Map(document.nodes.filter(node => node.stationId === stationId).map(node => [node.partKey, node]));
  const operations = [];
  for (const slot of template.parts) {
    const path = `recipe.parts.${slot.key}`;
    const part = parts.get(slot.key), reference = resources.get(refKey(slot.resource));
    if (!reference) throw new CompanyError('missing-resource-version', `${stationId}.${slot.key}`, refKey(slot.resource));
    const role = slot.requiredRole || reference.mountRole || reference.id;
    if (!part || part.parentKey !== (slot.parentKey ?? null) || part.role !== role)
      throw new CompanyError('incompatible-workstation-look', path, `Expected ${role} under ${slot.parentKey ?? 'workstation'}`);
    const member = members.get(slot.key);
    if (member?.kind !== 'facility')
      throw new CompanyError('missing-template-part', stationId, slot.key);
    if (part.resource.id !== member.resource?.id || part.resource.version !== member.resource?.version)
      operations.push({type: 'replace-resource', id: member.id, resource: {...part.resource}});
  }

  // Run the existing document transaction against a private candidate so a late incompatible replacement rejects the whole recipe.
  if (operations.length) prepareCompanyChange(document, operations, {catalog, templates});
  else deriveCompany(document, catalog, templates);
  return operations;
}
