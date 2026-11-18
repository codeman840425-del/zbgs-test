import {floorPortalSides} from './exterior-entrance-data.js';
import {CompanyError, deriveCompany} from './document.js';
import {deriveCableConnections} from './cable-data.js';

const quarterTurns = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const EPS = 1e-8;
const templatesFallback = {id: 'company-templates', version: 1, templates: []};
const copy = value => structuredClone(value);
const refKey = ref => `${ref?.id}@${ref?.version}`;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function resourceFrom(catalog, resource) {
  if (!catalog?.resources) throw new CompanyError('invalid-catalog', 'catalog.resources', 'Facility placement requires a resource catalog');
  const ref = resource?.id && resource?.version !== undefined ? resource : null;
  const found = catalog.resources.find(candidate => refKey(candidate) === refKey(ref || resource));
  if (!found) throw new CompanyError('missing-resource-version', 'resource', refKey(ref || resource));
  return found;
}

function templatesFor(options) { return options?.templates || templatesFallback; }

function derivedFor(document, catalog, options) {
  return deriveCompany(document, catalog, templatesFor(options));
}

function regionFor(derived, regionId) {
  const region = derived.nodes.get(regionId);
  if (!['room', 'area'].includes(region?.kind)) throw new CompanyError('invalid-placement-region', regionId, 'Placement requires an existing room or public area');
  return region;
}

function floorFor(derived, regionId) {
  const floorId = derived.floorIds.get(regionId);
  const floor = derived.nodes.get(floorId);
  if (!floor) throw new CompanyError('missing-placement-floor', regionId, 'Placement region has no containing floor');
  return floor;
}

function mounting(resource) {
  return object(resource.mounting) ? resource.mounting : null;
}

function wallPosition(region, edge, m, along = 0) {
  const horizontal = edge === 'north' || edge === 'south';
  const normal = (edge === 'north' || edge === 'west' ? -1 : 1) * ((horizontal ? region.bounds.depth : region.bounds.width) / 2 - .1);
  const position = horizontal ? [along, 0, normal] : [normal, 0, along];
  position[1] = m?.origin === 'center' ? 1.4 : 0;
  const yaw = {north: 0, west: Math.PI / 2, south: Math.PI, east: Math.PI * 1.5}[edge];
  return {position, yaw};
}

function portalEntries(floor, regionId, edge) {
  return floorPortalSides(floor)
    .filter(portal => portal?.regionId === regionId && portal.edge === edge);
}

function target(id, parentId, label, position, yaw, mode, extra = {}) {
  return {id, parentId, label, position: [...position], yaw, mode, ...extra};
}

function fitsSurface(resource, surface, yaw = 0) {
  const m = mounting(resource);
  if (!m || !surface) return false;
  const swapped = Math.abs(Math.sin(yaw)) > .5;
  const halfX = (swapped ? m.depth : m.width) / 2;
  const halfZ = (swapped ? m.width : m.depth) / 2;
  return halfX <= surface.halfSize[0] + EPS && halfZ <= surface.halfSize[1] + EPS &&
    m.height <= surface.clearanceHeight + EPS;
}

function surfaceYaw(resource, surface) {
  if (fitsSurface(resource, surface, 0)) return 0;
  if (fitsSurface(resource, surface, Math.PI / 2)) return Math.PI / 2;
  return null;
}

function surfaceLabel(parentResource, surfaceId) {
  if (parentResource.mountRole === 'vanity-table') return '台面';
  return {lower: '下层板', middle: '中层板', top: '上层板', drawer: '抽屉承载面'}[surfaceId] || surfaceId;
}

function hostSupports(resource, parentResource, surfaceId) {
  if (!parentResource?.supportSurfaces?.some(surface => surface.id === surfaceId)) return false;
  const role = resource.mountRole;
  if (role === 'makeup-mirror') return parentResource.mountRole === 'vanity-table' && surfaceId === 'top';
  if (role === 'makeup-storage') return parentResource.mountRole === 'vanity-table' && surfaceId === 'top';
  if (role === 'makeup-storage-content') return parentResource.mountRole === 'makeup-storage' && ['top', 'drawer'].includes(surfaceId);
  if (role === 'makeup-storage-drawer') return parentResource.mountRole === 'makeup-drawer-host' && surfaceId === 'drawer';
  return true;
}

function targetForSupport(parent, parentResource, resource, surface) {
  const yaw = hostSupports(resource, parentResource, surface.id) ? surfaceYaw(resource, surface) : null;
  if (yaw === null) return null;
  return target(`${parent.id}:surface:${surface.id}`, parent.id, `${parent.name || parent.id} · ${surfaceLabel(parentResource, surface.id)}`, [surface.center[0], surface.topY, surface.center[1]], yaw, 'support-surface', {
    attachment: {surfaceId: surface.id}, lockedAxes: ['y'], note: '位置受承载面和净空约束，旋转后仍须保持完整包络适配',
  });
}

function deskTarget(parent, parentResource, resource) {
  const surface = parentResource.surface;
  if (!surface) return null;
  const m = mounting(resource);
  const yaw = m ? surfaceYaw(resource, {center: [0, 0], halfSize: surface.halfSize, topY: surface.topY, clearanceHeight: .96}) : 0;
  if (yaw === null) return null;
  return target(`${parent.id}:desktop`, parent.id, `${parent.name || parent.id} · 台面`, [0, surface.topY, 0], yaw, 'desk-surface', {
    lockedAxes: ['y'], note: '沿桌面移动，Y 固定在桌面承载高度',
  });
}

function cameraMountTargets(region, derived, resource) {
  const m = mounting(resource), result = [];
  if (!m) return result;
  if (resource.mount === 'desk-edge-clamp') {
    for (const parent of derived.facilities.filter(entry => entry.roomId === region.id && parentResourceIsDesk(entry.resource))) {
      const surface = parent.resource.surface, halfX = m.width / 2, halfZ = m.depth / 2;
      if (halfX > surface.halfSize[0] + EPS || halfZ > surface.halfSize[1] + EPS) continue;
      result.push(target(`${parent.id}:camera-mount`, parent.id, `${parent.node.name || parent.id} · 桌边相机挂载`, [0, surface.topY, -surface.halfSize[1] + halfZ], 0, 'desk-edge-clamp', {
        lockedAxes: ['y'], note: '桌夹随桌子移动，Y 固定在桌面；X/Z 与朝向须保持完整包络在桌面边界内',
      }));
    }
  } else if (resource.mount === 'floor-surface') {
    const value = floorTarget(region, resource); if (value) result.push(value);
  } else if (resource.mount === 'wall') {
    for (const edge of ['north', 'west', 'south', 'east']) {
      const {position, yaw} = wallPosition(region, edge, {...m, origin: 'center'}, 0);
      position[1] = 1.4;
      result.push(target(`${region.id}:camera-wall:${edge}`, region.id, `${region.name || region.id} · 相机墙臂`, position, yaw, 'wall', {
        lockedAxes: [(edge === 'north' || edge === 'south') ? 'z' : 'x', 'yaw'], note: '墙臂法向和朝向固定，Y 可调整且需保持安装包络在墙内', edge,
      }));
    }
  }
  return result;
}

function wallTargets(region, floor, resource) {
  const m = mounting(resource);
  if (!m || !Number.isFinite(m.width) || !Number.isFinite(m.height)) return [];
  const result = [];
  for (const edge of ['north', 'west', 'south', 'east']) {
    const horizontal = edge === 'north' || edge === 'south';
    const span = horizontal ? region.bounds.width : region.bounds.depth;
    if (m.width > span - .2 + EPS || m.height > 2.8 + EPS) continue;
    const portal = portalEntries(floor, region.id, edge);
    const low = -span / 2 + .1 + m.width / 2, high = span / 2 - .1 - m.width / 2;
    const blocked = value => portal.some(entry => Math.abs(entry.offset - value) < (entry.width + m.width) / 2 - EPS);
    const candidates = [0, ...portal.flatMap(entry => [entry.offset - (entry.width + m.width) / 2 - .01, entry.offset + (entry.width + m.width) / 2 + .01])].filter(value => value >= low - EPS && value <= high + EPS && !blocked(value));
    const along = candidates[0];
    if (along === undefined) continue;
    const {position, yaw} = wallPosition(region, edge, m, along);
    const directionLabel = {north: '北墙', west: '西墙', south: '南墙', east: '东墙'}[edge];
    result.push(target(`${region.id}:wall:${edge}`, region.id, `${region.name || region.id} · ${directionLabel}`, position, yaw, 'wall', {
      lockedAxes: [horizontal ? 'z' : 'x', 'yaw'], note: '沿墙面移动，法向坐标和朝向固定，完整包络须留在墙内', edge,
    }));
  }
  return result;
}

function portalTargets(region, floor, resource) {
  const m = mounting(resource);
  if (!m || m.origin !== 'bottom' || !Number.isFinite(m.apertureWidth)) return [];
  const result = [];
  for (const edge of ['north', 'west', 'south', 'east']) for (const entry of portalEntries(floor, region.id, edge)) {
    if (Math.abs(entry.width - m.apertureWidth) > EPS || entry.height!==undefined&&Math.abs(entry.height-m.apertureHeight)>EPS) continue;
    const {position, yaw} = wallPosition(region, edge, m, entry.offset);
    const directionLabel = {north: '北侧', west: '西侧', south: '南侧', east: '东侧'}[edge];
    result.push(target(`${region.id}:portal:${entry.id || edge}:${edge}:${entry.offset}`, region.id, `${region.name || region.id} · ${directionLabel}门洞`, position, yaw, 'portal', {
      lockedAxes: ['x', 'y', 'z', 'yaw'], note: '只能使用已有真实门洞，位置和朝向固定', edge, portalId: entry.id,
    }));
  }
  return result;
}

function exteriorDoorTargets(region, floor, resource) {
  const m=mounting(resource);
  if(!m||m.origin!=='bottom'||!Number.isFinite(m.apertureWidth)||!Number.isFinite(m.apertureHeight))return [];
  const result=[];
  for(const edge of ['north','west','south','east'])for(const entry of portalEntries(floor,region.id,edge)){
    if(entry.height===undefined||Math.abs(entry.width-m.apertureWidth)>EPS||Math.abs(entry.height-m.apertureHeight)>EPS)continue;
    const {position,yaw}=wallPosition(region,edge,m,entry.offset),label={north:'北侧',west:'西侧',south:'南侧',east:'东侧'}[edge];
    result.push(target(`${region.id}:exterior-door:${entry.id}`,region.id,`${region.name||region.id} · ${label}外部门洞`,position,yaw,'portal-door',{
      lockedAxes:['x','y','z','yaw'],note:'外部门扇只能安装到真实外部入口；位置和朝向固定，开合状态单独保存',edge,portalId:entry.id,
    }));
  }
  return result;
}

function informationTargets(region, derived, resource) {
  const result = [];
  for (const facility of derived.facilities.filter(entry => entry.roomId === region.id && entry.resource.informationSurface)) {
    const slot = facility.resource.informationSurface;
    const content = resource.informationContent;
    if (!content || content.schema !== slot.schema || content.width !== slot.width || content.height !== slot.height) continue;
    result.push(target(`${facility.id}:information-surface`, facility.id, `${facility.node.name || facility.id} · 信息槽`, slot.position, 0, 'information-surface', {
      lockedAxes: ['x', 'y', 'z', 'yaw'], note: '信息内容固定填入宿主槽位，移动或转向请操作宿主看板',
    }));
  }
  return result;
}

function windowCoverTargets(region, derived, resource) {
  if (resource.mount !== 'window-cover') return [];
  const occupied=new Set(derived.facilities.filter(entry => entry.resource.mount==='window-cover'&&entry.node.attachment?.windowId).map(entry=>entry.node.attachment.windowId));
  return derived.facilities.filter(entry => entry.roomId === region.id && entry.resource.windowSystem && !occupied.has(entry.id)).map(window => target(
    `${window.id}:window-cover`, window.id, `${window.node.name || window.id} · 窗内覆盖`, [0, 0, .13], 0, 'window-cover', {
      attachment: {windowId: window.id}, lockedAxes: ['x', 'y', 'z', 'yaw'],
      note: '覆盖件绑定真实窗体，位置和朝向随窗体固定；开合状态单独保存。'
    }));
}

function floorTarget(region, resource) {
  const m = mounting(resource);
  if (!m || m.origin !== 'bottom') return null;
  if (m.width > region.bounds.width - .2 + EPS || m.depth > region.bounds.depth - .2 + EPS) return null;
  return target(`${region.id}:floor`, region.id, `${region.name || region.id} · 地面`, [0, 0, 0], 0, 'floor-surface', {
    lockedAxes: ['y'], note: '地面安装，Y 固定在楼层面，X/Z 和四向朝向可编辑',
  });
}

function ceilingTarget(region, resource) {
  const m = mounting(resource);
  if (!m || m.origin !== 'top') return null;
  if (m.width > region.bounds.width - .2 + EPS || m.depth > region.bounds.depth - .2 + EPS) return null;
  return target(`${region.id}:ceiling`, region.id, `${region.name || region.id} · 顶面`, [0, 2.8, 0], 0, 'ceiling', {
    lockedAxes: ['y'], note: '顶面安装，Y 固定在 2.8m 顶面',
  });
}

function groundTarget(region, resource) {
  if (resource.mount !== undefined && resource.mount !== null) return null;
  if (resource.mountRole === 'makeup-drawer-host' || resource.footprint?.blocking || resource.category === 'decor')
    return target(`${region.id}:ground`, region.id, `${region.name || region.id} · 地面`, [0, 0, 0], 0, 'ground', {
      lockedAxes: ['y'], note: '落地设施，Y 固定在楼层面',
    });
  return null;
}

function cableTargets(region,derived,resource){
  const devices=derived.facilities.filter(f=>f.roomId===region.id&&f.resource.cablePorts),result=[];
  for(let i=0;i<devices.length;i++)for(let j=i+1;j<devices.length;j++){
    const a=devices[i],b=devices[j];if(a.node.parentId!==b.node.parentId)continue;
    for(const portA of a.resource.cablePorts)for(const portB of b.resource.cablePorts){
      if(portA.connector!==portB.connector)continue;
      const cableLink={a:{deviceId:a.id,portId:portA.id},b:{deviceId:b.id,portId:portB.id}};
      const id=`${a.id}:cable:${portA.id}:${b.id}:${portB.id}`,node={id,parentId:a.node.parentId,transform:{position:[0,0,0],yaw:0},cableLink};
      try{deriveCableConnections({...derived,facilities:[...derived.facilities,{id,node,resource,state:{connected:true}}]},(code,path,message)=>{throw new CompanyError(code,path,message);});}
      catch(error){if(error instanceof CompanyError)continue;throw error;}
      result.push(target(id,node.parentId,`${a.resource.displayName||a.id} · ${portA.id} ↔ ${b.resource.displayName||b.id} · ${portB.id}`,[0,0,0],0,'parent-device-endpoints',{
        cableLink,lockedAxes:['x','y','z','yaw'],note:'连接两个空闲视觉端点；线缆随所属桌子定位，移动或复制请选所属桌子。',
      }));
    }
  }
  return result;
}

/** Return installation targets that are valid candidates for one room or area. */
export function listPlacementTargets(document, catalog, resource, regionId, options = {}) {
  const selected = resourceFrom(catalog, resource);
  const derived = derivedFor(document, catalog, options);
  const region = regionFor(derived, regionId), floor = floorFor(derived, regionId);
  const result = [];
  if (selected.mount === 'parent-device-endpoints') result.push(...cableTargets(region,derived,selected));
  else if (['wall','wall-opening'].includes(selected.mount)) result.push(...wallTargets(region, floor, selected));
  else if (selected.mount === 'portal') result.push(...portalTargets(region, floor, selected));
  else if (selected.mount === 'portal-door') result.push(...exteriorDoorTargets(region, floor, selected));
  else if (selected.mount === 'floor-surface') { const value = floorTarget(region, selected); if (value) result.push(value); }
  else if (selected.mount === 'ceiling') { const value = ceilingTarget(region, selected); if (value) result.push(value); }
  else if (selected.mount === 'desk-edge-clamp' || selected.mountRole === 'camera-mount') result.push(...cameraMountTargets(region, derived, selected));
  else if (selected.mount === 'desk-surface') {
    for (const parent of derived.facilities.filter(entry => entry.roomId === region.id && parentResourceIsDesk(entry.resource))) {
      const value = deskTarget(parent.node, parent.resource, selected); if (value) result.push(value);
    }
  } else if (selected.mount === 'support-surface') {
    for (const parent of derived.facilities.filter(entry => entry.roomId === region.id && Array.isArray(entry.resource.supportSurfaces)))
      for (const surface of parent.resource.supportSurfaces) { const value = targetForSupport(parent.node, parent.resource, selected, surface); if (value) result.push(value); }
  } else if (selected.mount === 'information-surface') result.push(...informationTargets(region, derived, selected));
  else if (selected.mount === 'window-cover') result.push(...windowCoverTargets(region, derived, selected));
  else { const value = groundTarget(region, selected); if (value) result.push(value); }
  return result;
}

function parentResourceIsDesk(resource) { return resource?.mountRole === 'desk' && resource?.surface; }

function stableId(document, resource, regionId) {
  const stem = `${regionId}/${resource.id}`.replace(/[^A-Za-z0-9_.:/-]/g, '-');
  const used = new Set([document.id, ...document.nodes.map(node => node.id)]);
  if (!used.has(stem)) return stem;
  for (let serial = 2; ; serial++) { const candidate = `${stem}-${serial}`; if (!used.has(candidate)) return candidate; }
}

/** Build one add-facility operation from a previously listed installation target. */
export function createFacilityPlacement(document, catalog, resource, targetId, options = {}, regionId, context = {}) {
  const selected = resourceFrom(catalog, resource);
  if (!regionId) throw new CompanyError('invalid-placement-region', 'regionId', 'Placement requires a room or public area');
  const targets = listPlacementTargets(document, catalog, selected, regionId, context);
  const selectedTarget = targets.find(candidate => candidate.id === targetId);
  if (!selectedTarget) throw new CompanyError('no-placement-target', targetId, 'Target is unavailable for this resource and room');
  const id = stableId(document, selected, regionId);
  const transform = {position: [...selectedTarget.position], yaw: options.yaw === undefined ? selectedTarget.yaw : options.yaw};
  const position = options.x === undefined && options.z === undefined && options.height === undefined ? transform.position : [options.x ?? transform.position[0], options.height ?? transform.position[1], options.z ?? transform.position[2]];
  if (!position.every(Number.isFinite) || !Number.isFinite(transform.yaw) || !quarterTurns.some(value => Math.abs(transform.yaw - value) < EPS))
    throw new CompanyError('invalid-placement-transform', 'operation.transform', 'Position must be finite and yaw must be a quarter turn');
  const operation = {type: 'add-facility', id, parentId: selectedTarget.parentId, resource: {id: selected.id, version: selected.version}, transform: {position, yaw: transform.yaw}};
  if (selectedTarget.attachment) operation.attachment = copy(selectedTarget.attachment);
  if (selectedTarget.cableLink) {operation.cableLink=copy(selectedTarget.cableLink);operation.transform={position:[0,0,0],yaw:0};}
  return {operation, id};
}

export function getFacilityEditConstraints(node, resource) {
  const selected = resource || node?.resource || {};
  const mount = selected.mount;
  if (mount === 'parent-device-endpoints') return {lockedAxes:['x','y','z','yaw'],note:'连接线由设备接口确定位置；移动或复制请选所属桌子。'};
  if (['wall','wall-opening'].includes(mount)) {
    const yaw = node?.transform?.yaw ?? 0;
    const horizontal = Math.abs(Math.sin(yaw)) < .5;
    return {lockedAxes: [horizontal ? 'z' : 'x', 'yaw'], note: '沿墙移动，法向坐标和朝向固定'};
  }
  if (mount === 'portal') return {lockedAxes: ['x', 'y', 'z', 'yaw'], note: '门洞位置和朝向固定，只能更换真实门洞目标'};
  if (mount === 'portal-door') return {lockedAxes: ['x', 'y', 'z', 'yaw'], note: '外部门扇绑定真实外部门洞，位置和朝向固定；开合状态单独保存'};
  if (mount === 'window-cover') return {lockedAxes: ['x', 'y', 'z', 'yaw'], note: '窗体覆盖绑定真实窗户，位置和朝向固定；开合状态单独保存'};
  if (mount === 'information-surface') return {lockedAxes: ['x', 'y', 'z', 'yaw'], note: '信息内容固定在宿主槽位，移动或转向请操作宿主'};
  if (mount === 'ceiling') return {lockedAxes: ['y'], note: '顶面 Y 固定在 2.8m'};
  if (mount === 'support-surface') return {lockedAxes: ['y'], note: '承载面 Y 固定，X/Z 与朝向须满足完整包络'};
  if (mount === 'desk-surface') return {lockedAxes: ['y'], note: '桌面 Y 固定，X/Z 与朝向须满足桌面边界'};
  return {lockedAxes: ['y'], note: '地面 Y 固定，X/Z 与四向朝向可编辑'};
}

export function deriveEditControls(node, resource) { return getFacilityEditConstraints(node, resource); }

