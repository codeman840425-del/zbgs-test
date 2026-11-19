import {floorPortalSides} from './exterior-entrance-data.js';

// Room-local inward normals for the resource's x=0 and z=0 mounting faces.
// Local +X/+Z always extend into the room. Link and floor rotations are parent transforms.
const corners = {
  'north-west': {x:-1, z:-1, yaw:0, xFace:'west', zFace:'north'},
  'north-east': {x: 1, z:-1, yaw:-Math.PI/2, xFace:'north', zFace:'east'},
  'south-east': {x: 1, z: 1, yaw:Math.PI, xFace:'east', zFace:'south'},
  'south-west': {x:-1, z: 1, yaw:Math.PI/2, xFace:'south', zFace:'west'},
};
export const CORNER_NAMES = Object.freeze(Object.keys(corners));
const wallThickness = .10, wallHeight = 2.8, fitTolerance = .001, overlapTolerance = 1e-7;

function defaultFail(code,path,message,details) {
  throw Object.assign(new Error(code+' at '+path+': '+message),{code,path,details});
}

export function cornerAbsorberTransform(region,corner,bottom,fail=defaultFail) {
  const bounds=region?.bounds;
  if (!['room','area'].includes(region?.kind) || ![bounds?.width,bounds?.depth].every(v=>Number.isFinite(v) && v>2*wallThickness))
    fail('invalid-corner-fit',region?.id,'Choose a room or public area with two interior wall faces');
  if (typeof corner!=='string' || !Object.hasOwn(corners,corner)) fail('invalid-corner-attachment',region.id,'Choose a named room-local corner');
  if (!Number.isFinite(bottom)) fail('invalid-corner-fit',region.id,'Specify a finite room-local installation bottom');
  const side=corners[corner];
  return {position:[side.x*(bounds.width/2-wallThickness),bottom,side.z*(bounds.depth/2-wallThickness)],yaw:side.yaw};
}

const usableRange=(range,limit)=>Array.isArray(range) && range.length===2 && range.every(Number.isFinite)
  && 0<=range[0] && range[0]<range[1] && range[1]<=limit+overlapTolerance;

// Room-wall coordinates use the same signed along-wall offset as floorPortalSides and windowOpenings.
function bearingFor(plane,resource,fail,location) {
  const declared=resource.cornerMount?.bearings?.[plane],mount=resource.mounting;
  const length=plane==='x'?mount.depth:mount.width;
  if (!usableRange(declared?.along,length) || !usableRange(declared?.y,mount.height))
    fail('invalid-corner-bearing',location,'Declare a finite rectangular contact on each mounting plane inside the resource envelope',{plane});
  return declared;
}

function wallBearing(plane,resource,corner,transform,fail) {
  const declared=bearingFor(plane,resource,fail,resource.id);
  const edge=plane==='x'?corner.xFace:corner.zFace;
  const axis=edge==='north'||edge==='south'?0:2;
  const inward=axis===0?-corner.x:-corner.z;
  const [left,right]=declared.along,[low,high]=declared.y;
  return {plane,edge,offset:transform.position[axis]+inward*(left+right)/2,width:right-left,
    bottom:transform.position[1]+low,height:high-low};
}

function coversBearing(opening,b) {
  return opening.edge===b.edge && Math.abs(opening.offset-b.offset)<(opening.width+b.width)/2-overlapTolerance &&
    opening.bottom<b.bottom+b.height-overlapTolerance && opening.bottom+opening.height>b.bottom+overlapTolerance;
}

/** Validate against the architectural apertures already derived for this floor. Does not mutate persisted placement data. */
export function validateCornerAbsorberPlacement({node,resource,region,floor,windowOpenings},fail=defaultFail) {
  if (node?.kind!=='facility' || resource?.mount!=='wall-corner' || !region || node.parentId!==region.id ||
      floor?.kind!=='floor' || region.parentId!==floor.id)
    fail('invalid-corner-attachment',node?.id,'The wall-corner fixture belongs directly to a room or area on this floor');
  const corner=node.attachment?.corner,mount=resource.mounting,actual=node.transform;
  if (typeof corner!=='string' || !Object.hasOwn(corners,corner) || Object.keys(node.attachment).length!==1)
    fail('invalid-corner-attachment',node.id,'Use attachment.corner to bind both wall faces of one named corner');
  if (![mount?.width,mount?.depth,mount?.height].every(v=>Number.isFinite(v) && v>0) ||
      !Array.isArray(actual?.position) || actual.position.length!==3 || !actual.position.every(Number.isFinite) || !Number.isFinite(actual.yaw))
    fail('invalid-corner-fit',node.id,'Use a finite bottom, room-local transform and positive installation envelope');
  const bottom=actual.position[1],transform=cornerAbsorberTransform(region,corner,bottom,fail);
  const swapped=corner==='north-east'||corner==='south-west';
  if (actual.position.some((n,i)=>Math.abs(n-transform.position[i])>fitTolerance) ||
      Math.abs(Math.sin((actual.yaw-transform.yaw)/2))>1e-6 ||
      bottom < -fitTolerance || bottom+mount.height>wallHeight+fitTolerance ||
      (swapped?mount.depth:mount.width)>region.bounds.width-2*wallThickness+fitTolerance ||
      (swapped?mount.width:mount.depth)>region.bounds.depth-2*wallThickness+fitTolerance)
    fail('invalid-corner-fit',node.id,'Align both backs with the interior wall intersection and keep the fixture within the room',{corner,expected:transform});
  const bearings=['x','z'].map(plane=>wallBearing(plane,resource,corners[corner],actual,fail));
  const holes=[];
  for (const side of floorPortalSides(floor)) {
    if (side.regionId!==region.id) continue;
    // A shared connection cuts the full wall. Only explicit exterior entrances have a physical header.
    const exterior=floor.exteriorEntrances?.includes(side);
    const id=exterior?side.id:floor.connections.find(connection=>connection.from===side || connection.to===side)?.id;
    holes.push({edge:side.edge,offset:side.offset,width:side.width,bottom:0,height:exterior?side.height:wallHeight,id,kind:'portal'});
  }
  // Both local sides of a shared window are available even if the frame is owned by the adjacent room.
  // Closing the sash changes the glass; it does not add load-bearing wall behind the rail.
  const openings=typeof windowOpenings?.values==='function'?windowOpenings.values():windowOpenings;
  for (const opening of openings) {
    if (opening.floorId!==floor.id) continue;
    for (const side of opening.regions) if (side.regionId===region.id) holes.push({...side,id:opening.id,kind:'window'});
  }
  for (const b of bearings) {
    const hole=holes.find(opening=>coversBearing(opening,b));
    if (hole) fail('corner-bearing-over-opening',node.id,'A bearing rectangle overlaps a door or window opening',
      {corner,edge:b.edge,plane:b.plane,openingId:hole.id,kind:hole.kind,bearing:b});
  }
  return {corner,transform,bearings};
}

const role = 'corner-absorber';
const constructions = new Set(['triangular','column','segmented','upholstered']);
const halfExtentPair = pair=>Array.isArray(pair) && pair.length===2 && pair.every(v=>v===.175);
const plainEmpty = value=>value!==null && typeof value==='object' && !Array.isArray(value) && !Object.keys(value).length;

export function validateCornerAbsorberResource(card,fail=defaultFail,location=card.id) {
  if (card.mountRole!==role && card.productionBranch!==role && card.acoustic?.purpose!==role &&
      card.mount!=='wall-corner' && card.cornerMount===undefined) return;
  const mount=card.mounting,foot=card.footprint,axes=card.coordinates,bearings=card.cornerMount?.bearings;
  if (card.mountRole!==role || card.productionBranch!==role || card.mount!=='wall-corner' || card.parent!=='room.wall.corner' ||
      card.category!=='decor' || card.asset?.format!=='glb' ||
      mount?.origin!=='inside-corner-bottom' || mount.width!==.35 || mount.height!==2.2 || mount.depth!==.35 ||
      axes?.units!=='metres' || axes.up!=='+Y' || axes.forward!=='+Z' ||
      foot?.blocking!==true || foot.polygon!==undefined || !halfExtentPair(foot.center) || !halfExtentPair(foot.halfSize) ||
      card.acoustic?.purpose!==role || card.acoustic.configuration!=='static' || !constructions.has(card.acoustic.construction) ||
      !Array.isArray(card.usePoints) || card.usePoints.length || !plainEmpty(card.stateDefaults) ||
      !plainEmpty(card.stateSchema??{}) || !plainEmpty(card.stateSemantics??{}) ||
      ['surface','supportSurfaces','movingParts','supportMotion','movingProfile','capacity'].some(key=>card[key]!=null))
    fail('invalid-corner-absorber',location,'Expected a static two-wall corner absorber with its installed origin, envelope and blocking footprint');
  if (!bearings || Object.keys(bearings).sort().join(',')!=='x,z')
    fail('invalid-corner-bearing',location,'Declare one rectangular bearing on each of the x=0 and z=0 planes');
  for (const plane of ['x','z']) bearingFor(plane,card,fail,location);
}
