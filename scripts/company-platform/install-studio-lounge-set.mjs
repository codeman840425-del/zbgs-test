import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {catalogMaps, CompanyError, composeTransform} from '../../prototype/src/company/document.js';
import {listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {resolveWorkstationLook,workstationLookOperations} from '../../prototype/src/company/workstation-looks.js';

const sameRef = (a, b) => a?.id === b?.id && a?.version === b?.version;
const sameTransform = (a, b) => Math.abs(a.yaw - b.yaw) < 1e-8 &&
  a.position.every((value, index) => Math.abs(value - b.position[index]) < 1e-8);
const transform = (position, yaw = 0) => ({position, yaw});
function requireValue(ok, field, message) {
  if (!ok) throw new CompanyError('invalid-studio-lounge-set', field, message);
}
function fields(object, required, optional, field) {
  requireValue(object && typeof object === 'object' && !Array.isArray(object) &&
    required.every(name => Object.hasOwn(object, name)) &&
    Object.keys(object).every(name => required.includes(name) || optional.includes(name)),
    field, 'Expected fields: ' + required.join(', ') + (optional.length ? '; optional: ' + optional.join(', ') : ''));
}
function reference(value, field) {
  fields(value, ['id','version'], [], field);
  requireValue(typeof value.id === 'string' && value.id.length && Number.isSafeInteger(value.version) && value.version > 0,
    field, 'Specify an asset ID and a positive integer version');
}
function vector(value, field) {
  requireValue(Array.isArray(value) && value.length === 3 && value.every(Number.isFinite), field, 'Expected three finite coordinates in metres');
}

export async function loadStudioLoungeRecipe(pin) {
  fields(pin, ['id','version','sha256'], [], 'studioLoungeSet.recipe');
  requireValue(typeof pin.id === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(pin.id) &&
    Number.isSafeInteger(pin.version) && pin.version > 0 && /^[0-9a-f]{64}$/.test(pin.sha256),
    'studioLoungeSet.recipe', 'Specify the recipe ID, positive version and SHA-256');
  const filename = pin.id + '.v' + pin.version + '.json';
  const source = 'scripts/company-platform/studio-lounge-sets/' + filename;
  let bytes;
  try { bytes = await fs.readFile(new URL('./studio-lounge-sets/' + filename, import.meta.url)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new CompanyError('missing-studio-lounge-recipe', source, 'Install the exact JSON recipe in studio-lounge-sets');
  }
  requireValue(createHash('sha256').update(bytes).digest('hex') === pin.sha256, source, 'Recipe bytes differ from the requested SHA-256');
  let recipe;
  try { recipe = JSON.parse(bytes.toString('utf8')); }
  catch { throw new CompanyError('invalid-studio-lounge-set', source, 'Recipe must contain valid UTF-8 JSON'); }
  requireValue(sameRef(recipe,pin), source, 'Recipe ID/version differs from its reference');
  return {recipe, source};
}

export function studioLoungeOperations(document, binding, recipe, {catalog,templates}) {
  const field = 'studioLoungeSet';
  fields(binding,['recipe','live','station','waiting','sofa','shelfWall','tableYaw'],['reuse'],field);
  fields(binding.shelfWall,['edge','along'],[],field+'.shelfWall');
  const reuse = binding.reuse ?? {};
  fields(reuse,[],['table','cup','secondaryMonitor'],field+'.reuse');
  for (const [name,id] of Object.entries(reuse))
    requireValue(typeof id === 'string' && id.length,field+'.reuse.'+name,'Specify the existing facility instance ID');
  requireValue(!reuse.cup || reuse.table,field+'.reuse.cup','An existing cup requires its existing table');
  requireValue(['north','south','west','east'].includes(binding.shelfWall.edge) &&
    Number.isFinite(binding.shelfWall.along) && Number.isFinite(binding.tableYaw),field,'Specify a wall, a finite along-wall offset and a table yaw in radians');
  fields(recipe,['id','version','stationTemplate','stationLook','monitors','shelf','waiting'],[],'recipe');
  reference(recipe.stationTemplate,'recipe.stationTemplate');
  const stationLook = resolveWorkstationLook(recipe.stationLook);
  fields(recipe.monitors,['resource','primary','secondary','yaw','on'],[],'recipe.monitors');
  vector(recipe.monitors.primary,'recipe.monitors.primary');
  vector(recipe.monitors.secondary,'recipe.monitors.secondary');
  requireValue(Number.isFinite(recipe.monitors.yaw) && typeof recipe.monitors.on === 'boolean','recipe.monitors','Specify the screen yaw and initial state for new screens');
  fields(recipe.shelf,['resource','elevation','items'],[],'recipe.shelf');
  requireValue(Number.isFinite(recipe.shelf.elevation) && Array.isArray(recipe.shelf.items) && recipe.shelf.items.length >= 2,'recipe.shelf','Specify a shelf elevation and at least two shelf decorations');
  fields(recipe.waiting,['sofa','table','offsetInSofa','cup'],[],'recipe.waiting');
  fields(recipe.waiting.cup,['resource','surface','position'],[],'recipe.waiting.cup');
  vector(recipe.waiting.offsetInSofa,'recipe.waiting.offsetInSofa');
  vector(recipe.waiting.cup.position,'recipe.waiting.cup.position');
  const {resources} = catalogMaps(catalog,templates);
  const resourceOf = ref => resources.get(ref?.id+'@'+ref?.version);
  function asset(ref,role,location) {
    reference(ref,location);
    requireValue(resourceOf(ref)?.mountRole === role,location,'Expected a registered '+role+' model');
  }
  asset(recipe.monitors.resource,'monitor','recipe.monitors.resource');
  asset(recipe.shelf.resource,'wall-shelf','recipe.shelf.resource');
  asset(recipe.waiting.sofa,'sofa','recipe.waiting.sofa');
  asset(recipe.waiting.table,'side-table','recipe.waiting.table');
  asset(recipe.waiting.cup.resource,'side-table-life-items','recipe.waiting.cup.resource');
  const nodes = new Map(document.nodes.map(node => [node.id,node]));
  const live = nodes.get(binding.live), waiting = nodes.get(binding.waiting);
  const station = nodes.get(binding.station), sofa = nodes.get(binding.sofa);
  requireValue(live?.kind === 'room' && live.purpose === 'streaming',field+'.live','Expected a streaming room');
  requireValue(waiting?.kind === 'room' && waiting.purpose === 'rest' && waiting.parentId === live.parentId,
    field+'.waiting','Expected a separate rest room on the same floor');
  requireValue(station?.kind === 'workstation' && station.parentId === live.id && sameRef(station.template,recipe.stationTemplate),
    field+'.station','Expected the pinned workstation template in the selected streaming room');
  requireValue(sofa?.parentId === waiting.id && resourceOf(sofa.resource)?.usePoints?.length === 2 &&
    resourceOf(sofa.resource)?.mountRole === 'sofa',field+'.sofa','Expected an existing two-place sofa in the selected rest room');
  const members = document.nodes.filter(node => node.stationId === station.id);
  const desk = members.find(node => node.partKey === 'desk');
  const primary = members.find(node => node.partKey === 'monitor');
  requireValue(desk && primary && primary.parentId === desk.id,station.id,'The workstation must have a desk and a primary display mounted on that desk');

  // The matched pair supplies its own display model. All other station slots use the existing versioned look.
  const operations = workstationLookOperations(document,station.id,stationLook,catalog,templates)
    .filter(operation => operation.id !== primary.id);
  function replace(node,ref) {
    if (!sameRef(node.resource,ref)) operations.push({type:'replace-resource',id:node.id,resource:ref});
  }
  function move(node,next) {
    if (!sameTransform(node.transform,next)) operations.push({type:'move',id:node.id,transform:next});
  }
  function add(id,parentId,resource,placement,surfaceId,state) {
    requireValue(!nodes.has(id),id,'An existing object already has this installation ID');
    const operation = {type:'add-facility',id,parentId,resource,transform:placement};
    if (surfaceId !== undefined) operation.attachment = {surfaceId};
    if (state !== undefined) operation.state = state;
    operations.push(operation);
  }
  function existing(id,parentId,role,surfaceId) {
    const node = nodes.get(id);
    requireValue(node?.parentId === parentId && resourceOf(node.resource)?.mountRole === role &&
      node.attachment?.surfaceId === surfaceId,id,'The named existing item has the wrong parent, role or support surface');
    return node;
  }
  replace(primary,recipe.monitors.resource);
  move(primary,transform(recipe.monitors.primary,recipe.monitors.yaw));
  const secondaryId = reuse.secondaryMonitor ?? desk.id+'/secondary-monitor';
  for (const node of document.nodes.filter(node => node.parentId === desk.id && resourceOf(node.resource)?.mountRole === 'monitor'))
    requireValue(node.id === primary.id || node.id === reuse.secondaryMonitor,node.id,'Bind the existing secondary screen explicitly to reuse it');
  const secondaryPosition = transform(recipe.monitors.secondary,recipe.monitors.yaw);
  if (reuse.secondaryMonitor) {
    requireValue(secondaryId !== primary.id,secondaryId,'The workstation needs two distinct displays');
    const node = existing(secondaryId,desk.id,'monitor',undefined);
    replace(node,recipe.monitors.resource);
    move(node,secondaryPosition);
  } else add(secondaryId,desk.id,recipe.monitors.resource,secondaryPosition,undefined,{on:recipe.monitors.on});

  const edge = binding.shelfWall.edge;
  const wall = listPlacementTargets(document,catalog,recipe.shelf.resource,live.id,{templates}).find(target => target.edge === edge);
  requireValue(wall,live.id,'No wall shelf target found on the '+edge+' wall');
  const shelfId = live.id+'/wall-shelf', mount = [...wall.position];
  mount[1] = recipe.shelf.elevation;
  mount[edge === 'north' || edge === 'south' ? 0 : 2] = binding.shelfWall.along;
  add(shelfId,live.id,recipe.shelf.resource,transform(mount,wall.yaw));
  const slots = new Set(), levels = new Set();
  for (const [index,item] of recipe.shelf.items.entries()) {
    const location = 'recipe.shelf.items['+index+']';
    fields(item,['slot','surface','position','resource'],[],location);
    requireValue(typeof item.slot === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(item.slot) &&
      !slots.has(item.slot) && typeof item.surface === 'string' && item.surface.length,location,'Expected a distinct slot and named support surface');
    reference(item.resource,location+'.resource');
    requireValue(resourceOf(item.resource)?.mount === 'support-surface',location,'The shelf item needs a supported tabletop mounting specification');
    vector(item.position,location+'.position');
    slots.add(item.slot); levels.add(item.surface);
    add(shelfId+'/'+item.slot,shelfId,item.resource,transform(item.position),item.surface);
  }
  requireValue(levels.size >= 2,'recipe.shelf.items','Use at least two physical shelf levels');
  replace(sofa,recipe.waiting.sofa);
  const tableId = reuse.table ?? waiting.id+'/cup-table';
  const cupId = reuse.cup ?? waiting.id+'/cup';
  if (reuse.table) replace(existing(tableId,waiting.id,'side-table',undefined),recipe.waiting.table);
  else {
    const besideSofa = composeTransform(sofa.transform,transform(recipe.waiting.offsetInSofa));
    add(tableId,waiting.id,recipe.waiting.table,transform(besideSofa.position,binding.tableYaw));
  }
  const cup = recipe.waiting.cup;
  requireValue(typeof cup.surface === 'string' && cup.surface.length,'recipe.waiting.cup.surface','Specify the cup support surface');
  if (reuse.cup) replace(existing(cupId,tableId,'side-table-life-items',cup.surface),cup.resource);
  else add(cupId,tableId,cup.resource,transform(cup.position),cup.surface);
  return {operations,secondaryId};
}
