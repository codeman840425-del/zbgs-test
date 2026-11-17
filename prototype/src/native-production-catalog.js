import catalog from './native-production-catalog.json' with {type:'json'};

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,100}$/.test(value);
const local = value => typeof value === 'string' && /^\/assets\/[a-z0-9/_.-]+$/.test(value) && !value.split('/').some(x => x === '..' || x === '.');

// Generated data is compiled with the fixed build. Importing a new package adds
// data, never branches to a different character controller or weakens load pins.
export function compileNativeProductionCatalog(input, existing = {}) {
  if (input?.schema !== 'native-production-catalog-v1' || !Array.isArray(input.entries)) throw Error('Invalid native production catalog');
  const profiles = {}, choices = {female:[], male:[]}, shas = new Set(), ids = new Set();
  for (const row of input.entries) {
    const p = row?.profile;
    if (!id(row?.bodyType) || !row.bodyType.startsWith('native-') || Object.hasOwn(existing, row.bodyType) || Object.hasOwn(profiles, row.bodyType)) throw Error('Duplicate or invalid production body type');
    if (!Object.hasOwn(choices, row.group) || !p || p.id !== row.bodyType || !id(p.id) || ids.has(p.id) || Object.values(existing).some(x => x.id === p.id)) throw Error('Invalid production profile identity');
    if (!hash(p.sha256) || shas.has(p.sha256) || Object.values(existing).some(x => x.sha256 === p.sha256) || !local(p.url) || !p.url.endsWith('.vrm') || !local(p.manifestUrl)) throw Error('Invalid production body resource');
    if (!hash(row.sourceExportSha256) || !hash(row.recipeSha256) || !Number.isFinite(p.sourceFloorY)) throw Error('Missing production source or measured floor');
    if (!local(p.bodyTextureCoverage?.url) || !hash(p.bodyTextureCoverage?.sha256)) throw Error('Missing production body coverage');
    if (p.baseBodyDisplay !== 'source-with-hair' || typeof p.label !== 'string' || !p.label || typeof p.fitStatus !== 'string') throw Error('Missing production candidate scope');
    if (!p.ids || Object.keys(p.ids).sort().join(',') !== 'shoes,shorts,top' || !Object.values(p.ids).every(id) || new Set(Object.values(p.ids)).size !== 3) throw Error('Invalid production three-piece equipment');
    const outfit = p.defaultOutfit;
    if (outfit?.index !== 0 || outfit.role !== 'shorts' || outfit.bottomRole !== 'shorts' || outfit.equipmentRoles?.join(',') !== 'top,shorts,shoes') throw Error('Invalid production initial outfit');
    profiles[row.bodyType] = structuredClone(p);
    choices[row.group].push({id:row.bodyType, label:p.label});
    shas.add(p.sha256); ids.add(p.id);
  }
  return {profiles, choices};
}

export function nativeProductionCatalog(existing = {}) {
  return compileNativeProductionCatalog(catalog, existing);
}

export function isNativeProductionBody(sha256) {
  return catalog.entries.some(row => row.profile.sha256 === sha256);
}
