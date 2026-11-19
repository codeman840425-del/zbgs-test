import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalogDefault from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templatesDefault from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {CompanyError,deriveCompany,relativeTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {describeCompanyUsePoint} from '../../prototype/src/company/use-point-data.js';
import {hasVocalSlot} from '../../prototype/src/company/vocal-use.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {overlapsObstacle} from '../../prototype/src/company/wardrobe-footprints.js';
import {scanRoomMeshes} from './check-training-clearance.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkRoomDoorAccess,clearanceQuery} from './public-door-access.mjs';

const defaultRoot = fileURLToPath(new URL('../../',import.meta.url));
const roles = {mic:'floor-vocal-microphone',score:'floor-score-stand',camera:'camera-static'};
const radius = .25, height = 1.90, margin = .001;
const p = (...coords) => new T.Vector3(...coords);
const vec = coords => p(...coords);
const tuple = value => value.toArray().map(x=>Number(x.toFixed(7)) || 0);
const degrees = (a,b) => T.MathUtils.radToDeg(a.angleTo(b));
const fail = (code,location,message,details) => {throw new CompanyError(code,location,message,details);};
const token = value => typeof value === 'string' && value.trim().length > 0;
const coords = (value,n) => Array.isArray(value) && value.length === n && value.every(Number.isFinite);
const labels = object => Object.keys(object || {}).sort().join(',');
const component = object => object.userData.name || object.name || object.type;
const boxDescription = box => ({min:tuple(box.min),max:tuple(box.max)});

function validateRule(rule) {
  const {performer} = rule ?? {};
  if (!['performer,portalId,regionId,roles','heightProfiles,performer,portalId,regionId,roles'].includes(labels(rule)) || !token(rule.regionId) || !token(rule.portalId) ||
      labels(rule.roles) !== 'camera,mic,score' || !Object.values(rule.roles).every(token) || new Set(Object.values(rule.roles)).size !== 3)
    fail('invalid-singing-rule','singingRooms','Specify a room, a connected entrance, and three distinct installed roles.');
  if (hasVocalSlot(performer)) return; // installedVocalSlots checks the complete facility-local contract.
  if (labels(performer) !== 'eye,mouth,position,yaw' || !coords(performer.position,2) || !Number.isFinite(performer.yaw) ||
      ![performer.mouth,performer.eye].every(value=>coords(value,3) && Math.hypot(value[0],value[2]) <= radius && value[1] > 0 && value[1] < height) ||
      performer.eye[1] <= performer.mouth[1])
    fail('invalid-singing-performer',rule.regionId,'Provide room-local standing position and yaw, and separate mouth and eye references inside the standing volume.');
}

function installedMembers(derived,rule,room) {
  const result = {};
  for (const [role,type] of Object.entries(roles)) {
    const id = rule.roles[role], installed = derived.facilities.find(item=>item.id===id);
    if (installed?.roomId !== room.id || installed?.resource.mountRole !== type)
      fail('singing-wrong-member',id,`Expected an installed ${type} in the singing room.`,{role,roomId:room.id,actualRoomId:installed?.roomId??null});
    if (role === 'camera') {
      const host = derived.facilities.find(item=>item.id===installed.node.parentId);
      if (installed.resource.mount !== 'desk-surface' || host?.resource.mountRole !== 'desk' || host.roomId !== room.id || !host.resource.surface)
        fail('singing-wrong-mount',id,'The camera requires an actual desk mount in the same room.');
    } else if (installed.resource.mount !== 'floor-surface' || installed.node.parentId !== room.id) {
      fail('singing-wrong-mount',id,'Place the tripod on the floor of the selected room.');
    }
    result[role] = installed;
  }
  return result;
}

function standingReserve(rule,room) {
  const {performer} = rule;
  const [x,z] = performer.position, rotate = new T.Matrix4().makeRotationY(performer.yaw).setPosition(x,0,z);
  // The standing square has the same clearance as the connected approach. Yaw only rotates the face references.
  const box = new T.Box3(p(x-radius,0,z-radius),p(x+radius,height,z+radius));
  if (box.min.x < -room.bounds.width/2 || box.max.x > room.bounds.width/2 ||
      box.min.z < -room.bounds.depth/2 || box.max.z > room.bounds.depth/2)
    fail('singing-reserve-outside',room.id,'The complete standing clearance must fit in the selected room.',boxDescription(box));
  return {box,protectedBox:box.clone().expandByScalar(-margin), mouth:vec(performer.mouth).applyMatrix4(rotate),
    eye:vec(performer.eye).applyMatrix4(rotate), facing:p(0,0,1).transformDirection(rotate)};
}

function scanScene(scene,derived,facilities,room,floorId,protectedBox) {
  const records = [], failures = [];
  const {worldToRoom,checkedMeshes} = scanRoomMeshes(scene,room,facilities,[{name:'performer',box:protectedBox}],failures,
    (object,owner,transform,bounds)=>records.push({object,id:owner?.id??object.name,matrix:transform.clone(),bounds:bounds.clone()}));
  for (const obstacle of derived.obstacles.filter(item=>item.floorId===floorId && item.resource.mount!=='portal-door')) {
    const corners = obstacle.corners.map(position=>vec(position).applyMatrix4(worldToRoom));
    const bounds = new T.Box3().setFromPoints(corners), perimeter = obstacle.polygon ? corners : [corners[0],corners[1],corners[3],corners[2]];
    const xz = value => [value.x,value.z];
    if (overlapsObstacle({min:xz(bounds.min),max:xz(bounds.max),polygon:perimeter.map(xz)},
      {min:xz(protectedBox.min),max:xz(protectedBox.max)})) failures.push({region:'performer',componentId:obstacle.id,kind:'blocking-footprint'});
  }
  if (failures.length) fail('singing-clearance-obstructed',failures[0].componentId,'An installed object enters the reserved standing volume.',{roomId:room.id,failures});
  return {records,worldToRoom,checkedMeshes};
}

function vertices(record) {
  record.points ??= Array.from({length:record.object.geometry.attributes.position.count},(_,i)=>
    record.object.getVertexPosition(i,p()).applyMatrix4(record.matrix));
  return record.points;
}

export function triangles(record) {
  if (record.faces) return record.faces;
  const points = vertices(record), geometry = record.object.geometry, index = geometry.index;
  const vertex = i=>points[index ? index.getX(i) : i], start = geometry.drawRange.start;
  const end = Math.min(index?.count ?? points.length,start+geometry.drawRange.count);
  record.faces = [];
  for (let i = start; i + 2 < end; i += 3) record.faces.push(new T.Triangle(vertex(i),vertex(i+1),vertex(i+2)));
  return record.faces;
}

function center(record) { return new T.Box3().setFromPoints(vertices(record)).getCenter(p()); }

export function rayHit(records,from,to) {
  const direction = to.clone().sub(from), max = direction.length() + 1e-6;
  if (max <= 1e-6) return null;
  const segment = new T.Box3().setFromPoints([from,to]).expandByScalar(1e-6);
  const ray = new T.Ray(from,direction.normalize()), point = p();
  let first;
  for (const record of records) {
    if (!segment.intersectsBox(record.bounds) || !ray.intersectsBox(record.bounds)) continue;
    for (const face of triangles(record)) {
      if (!ray.intersectTriangle(face.a,face.b,face.c,false,point)) continue;
      const distance = from.distanceTo(point);
      if (distance > 1e-5 && distance <= max && (!first || distance < first.distance))
        first = {record,distance,point:point.clone(),normal:face.getNormal(p())};
    }
  }
  return first ?? null;
}

function memberPart(records,member,nodeName) {
  const hits = records.filter(record=>record.id===member.id && component(record.object)===nodeName);
  if (!token(nodeName) || hits.length!==1 || !triangles(hits[0]).some(triangle=>triangle.getArea()>1e-10))
    fail('singing-mesh-binding',member.id,'Expected a uniquely named physical component.',{node:nodeName??null,count:hits.length});
  return hits[0];
}

function tripod(records,member) {
  const floorMesh = memberPart(records,member,'singing-tripod');
  const points = vertices(floorMesh), minimum = points.reduce((low,point)=>Math.min(low,point.y),Infinity);
  const groups = [];
  for (const point of points.filter(v=>Math.abs(v.y)<=margin+1e-7)) {
    const neighbor = groups.find(group=>group[0].distanceToSquared(point)<.10**2);
    if (neighbor) neighbor.push(point);
    else groups.push([point]);
  }
  if (Math.abs(minimum)>margin || groups.length!==3)
    fail('singing-tripod-contact',member.id,'The actual stand must have three separated floor-contact regions.',{minimum,clusters:groups.length});
  return {mesh:'singing-tripod',floorY:minimum,feet:groups.map(group=>boxDescription(new T.Box3().setFromPoints(group)))};
}

function cameraSupport(records,member) {
  const parts = records.filter(record=>record.id===member.id);
  const desk = records.filter(record=>record.id===member.node.parentId);
  const baseY = parts.reduce((low,record)=>Math.min(low,record.bounds.min.y),Infinity);
  let contactArea = 0;
  const supportingMeshes = new Set();
  for (const part of parts) for (const face of triangles(part)) {
    const area = face.getArea();
    if (area<1e-8 || face.getNormal(p()).y>-.98 || [face.a,face.b,face.c].some(point=>Math.abs(point.y-baseY)>margin)) continue;
    const point = face.getMidpoint(p()), offset = p(0,.05,0);
    const contact = rayHit(desk,point.clone().add(offset),point.clone().sub(offset));
    if (!contact || Math.abs(contact.point.y-point.y)>margin || contact.normal.y<.98)
      fail('singing-camera-unsupported',member.id,'The actual camera base must meet an upward-facing desk surface.',
        {deskId:member.node.parentId,base:tuple(point),deskSurface:contact&&tuple(contact.point)});
    contactArea += area;
    supportingMeshes.add(component(contact.record.object));
  }
  if (!contactArea) fail('singing-camera-unsupported',member.id,'The camera needs a physical underside of nonzero area.');
  return {deskId:member.node.parentId,baseY,contactArea,deskMeshes:[...supportingMeshes].sort()};
}

function joinPoint(from,to) {
  const around = to.bounds.clone().expandByScalar(margin), near = p();
  for (const tri of triangles(from)) for (const [start,end] of [[tri.a,tri.b],[tri.b,tri.c],[tri.c,tri.a]]) {
    if (!new T.Box3().setFromPoints([start,end]).intersectsBox(around)) continue;
    const crossing = rayHit([to],start,end);
    if (crossing) return crossing.point;
    if (!around.containsPoint(start)) continue;
    if (triangles(to).some(face=>face.closestPointToPoint(start,near).distanceToSquared(start)<=margin**2)) return start;
  }
  return null;
}

function measureMic(records,member,reference) {
  const {microphone} = member.resource;
  const names = [microphone?.pickupNode,'singing-mic-collar','singing-mic-handle','singing-mic-clip'];
  if (microphone?.pickupFit) names.push('boom-tip-joint','boom-inner-slider');
  names.push('singing-boom');
  const pieces = names.map(name=>memberPart(records,member,name));
  const [pickup,,handle] = pieces, joins = {};
  for (let i=1;i<pieces.length;i++) {
    const at = joinPoint(pieces[i-1],pieces[i]) ?? joinPoint(pieces[i],pieces[i-1]);
    if (!at) fail('singing-mic-detached',member.id,'Installed microphone hardware parts do not physically meet.',{from:names[i-1],to:names[i]});
    joins[names[i-1]+' / '+names[i]] = tuple(at);
  }
  const toward = center(pickup).sub(center(handle)).normalize(), axis = p();
  for (const face of triangles(handle)) {
    const normal = face.getNormal(p());
    if (normal.dot(toward)<-.998) axis.sub(normal);
  }
  if (!axis.lengthSq()) fail('singing-mic-axis',member.id,'The handle needs a physical rear cap defining its pickup axis.');
  axis.normalize();
  const hit = rayHit(records,reference.mouth,center(pickup));
  if (hit?.record!==pickup) fail('singing-mic-occluded',hit?.record.id??member.id,'The actual microphone pickup must be the first hit from the mouth reference.',{pickup:names[0],blocker:hit&&component(hit.record.object)});
  const incidence = degrees(axis,reference.mouth.clone().sub(hit.point));
  const face = hit.point.clone().sub(reference.mouth).setY(0), facing = degrees(reference.facing,face);
  if (hit.distance<.06 || hit.distance>.26 || incidence>35 || facing>45)
    fail('singing-mic-position',member.id,'The microphone must be 0.06–0.26 m from the mouth reference, in front and close to the pickup axis.',{distance:hit.distance,incidence,facing});
  return {node:names[0],surface:tuple(hit.point),axis:tuple(axis),distanceMetres:hit.distance,incidenceDegrees:incidence,facingDegrees:facing,joins};
}

// Locate thin, modelled staff strokes where a vertical column crosses their real triangles.
// Also test the paper between strokes and flat pages with texture-only printing.
export function scoreRowsAt(x,box,faces) {
  const height = box.max.y-box.min.y;
  const spans = [];
  for (const {a,b,c} of faces) {
    if (Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y) > .01*height ||
        x < Math.min(a.x,b.x,c.x) || x > Math.max(a.x,b.x,c.x)) continue;
    const ys = [];
    for (const [start,end] of [[a,b],[b,c],[c,a]]) {
      if (start.x===end.x || (start.x>x)===(end.x>x)) continue;
      ys.push(T.MathUtils.lerp(start.y,end.y,(x-start.x)/(end.x-start.x)));
    }
    if (ys.length<2) continue;
    const low = (Math.min(...ys)-box.min.y)/height, high = (Math.max(...ys)-box.min.y)/height;
    if (low>=.05 && high<=.95) spans.push([low,high]);
  }
  const merged = [];
  for (const [low,high] of spans.sort((a,b)=>a[0]-b[0])) {
    const previous = merged.at(-1);
    if (previous && low<=previous[1]+1e-7) previous[1]=Math.max(previous[1],high);
    else merged.push([low,high]);
  }
  return [
    ...merged.map(([low,high])=>({v:(low+high)/2,feature:'relief'})),
    ...[.05,.25,.5,.75,.95].map(v=>({v,feature:'page'})),
  ];
}

function measureScore(scene,records,worldToRoom,member,reference) {
  const page = memberPart(records,member,member.resource.musicStand?.pageNode);
  const stand = scene.root.getObjectByName(member.id), scoreToRoom = worldToRoom.clone().multiply(stand.matrixWorld);
  const roomToScore = scoreToRoom.clone().invert(), points = vertices(page).map(point=>point.clone().applyMatrix4(roomToScore));
  const box = new T.Box3().setFromPoints(points);
  if (box.max.x-box.min.x<.20 || box.max.y-box.min.y<.10) fail('singing-score-pages',member.id,'The actual score needs two readable page panels.');
  const localFaces = triangles(page).map(face=>new T.Triangle(...[face.a,face.b,face.c].map(point=>point.clone().applyMatrix4(roomToScore))));
  function readAt(index,u,v,feature) {
    const side = index?'right':'left', sample = {u,v:Number(v.toFixed(7)),feature};
    const sheetPoint = p(T.MathUtils.lerp(box.min.x,box.max.x,(index+u)/2),T.MathUtils.lerp(box.min.y,box.max.y,v),box.min.z-.16);
    const facePoint = sheetPoint.clone(); facePoint.z = box.max.z+.16;
    const target = rayHit([page],facePoint.applyMatrix4(scoreToRoom),sheetPoint.applyMatrix4(scoreToRoom));
    if (!target) fail('singing-score-pages',member.id,'The designated reading area needs a physical page surface.',{page:index+1,side,sample});
    const hit = rayHit(records,reference.eye,target.point);
    if (hit?.record!==page || hit.point.distanceTo(target.point)>.004)
      fail('singing-score-occluded',hit?.record.id??member.id,'A reading sample is hidden from the performer eye.',{
        page:index+1,side,sample,target:tuple(target.point),eye:tuple(reference.eye),blocker:hit&&component(hit.record.object),
        firstHit:hit&&{id:hit.record.id,mesh:component(hit.record.object),point:tuple(hit.point)}});
    return hit;
  }
  return ['left','right'].map((side,index)=>{
    const hit = readAt(index,.5,.5,'center');
    const incidence = degrees(hit.normal,reference.eye.clone().sub(hit.point));
    const glance = degrees(reference.facing,hit.point.clone().sub(reference.eye).setY(0));
    if (incidence>60 || glance>60 || hit.distance<.35 || hit.distance>1.8)
      fail('singing-score-angle',member.id,'Both real pages must face the reader within the geometric reading window.',{page:index+1,incidence,glance,distance:hit.distance});
    let samples=1, reliefSamples=0;
    // Start at the outside ends of the actual staff to give the author a useful first witness.
    const columns=index ? [.92,.75,.5,.25,.08,.95,.05] : [.08,.25,.5,.75,.92,.05,.95];
    for (const u of columns) {
      const x=T.MathUtils.lerp(box.min.x,box.max.x,(index+u)/2);
      for (const {v,feature} of scoreRowsAt(x,box,localFaces)) {
        if (u===.5 && v===.5) continue;
        readAt(index,u,v,feature);
        samples++;
        if (feature==='relief') reliefSamples++;
      }
    }
    return {page:side,mesh:component(page.object),point:tuple(hit.point),incidenceDegrees:incidence,glanceDegrees:glance,distanceMetres:hit.distance,
      visibility:{method:'physical-page-and-stroke-samples',insetFraction:.05,columns,samples,reliefSamples}};
  });
}

function measureCamera(scene,records,worldToRoom,member,reference) {
  if (member.resource.camera?.forward!=='+Z') fail('singing-lens-binding',member.id,'A physical +Z optical convention is required.');
  const lens = memberPart(records,member,member.resource.camera.lensNode), group = scene.root.getObjectByName(member.id);
  const local = worldToRoom.clone().multiply(group.matrixWorld), intoCamera=local.clone().invert();
  const forward = p(0,0,1).transformDirection(local), core = center(lens);
  const front = rayHit([lens],core.clone().addScaledVector(forward,.15),core);
  if (!front) fail('singing-lens-binding',member.id,'The optical centerline must hit the actual lens.');
  const blockers = records.filter(record=>record!==lens);
  const rays = ['mouth','eye'].map(label=>{
    const target = reference[label], hit = rayHit(blockers,front.point,target);
    if (hit) fail('singing-camera-occluded',hit.record.id,'Geometry blocks the lens view of the performer reference.',{reference:label,part:component(hit.record.object)});
    const direction = target.clone().sub(front.point).transformDirection(intoCamera);
    const horizontal = T.MathUtils.radToDeg(Math.atan2(direction.x,direction.z));
    const vertical = T.MathUtils.radToDeg(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)));
    if (Math.abs(horizontal)>35 || Math.abs(vertical)>23)
      fail('singing-camera-off-axis',member.id,'The reference is outside the authored framing window.',{reference:label,horizontal,vertical});
    return {reference:label,target:tuple(target),horizontalDegrees:horizontal,verticalDegrees:vertical};
  });
  return {node:component(lens.object),lens:tuple(front.point),forward:tuple(forward),rays};
}

export async function checkSingingRoom(document,rule,{catalog=catalogDefault,templates=templatesDefault,root=defaultRoot}={}) {
  validateRule(rule);
  const derived = deriveCompany(document,catalog,templates), room = derived.nodes.get(rule.regionId);
  if (room?.kind!=='room') fail('singing-room-missing',rule.regionId,'Choose a real singing room.');
  const floorId = derived.floorIds.get(room.id), facilities = derived.facilities.filter(item=>item.floorId===floorId);
  const members = installedMembers(derived,rule,room), placement = inspectCompanyPlacement(document,catalog,templates);
  const floor = inspectCompanyConnections(document,catalog,templates).floors.find(item=>item.floorId===floorId);
  if (!placement.checkedPortals.some(portal=>portal.regionId===room.id && portal.connectionId===rule.portalId))
    fail('singing-portal-missing',rule.portalId,'Select an installed entrance of this room.');
  let performer=rule.performer, slot=null, targets;
  if(hasVocalSlot(performer)) {
    slot=describeCompanyUsePoint(document,derived,members.mic.id+'#'+performer.slotId);
    if(!slot || slot.kind!=='standing-vocal' || !isDeepStrictEqual(document.singingRooms?.find(r=>r.roles?.mic===members.mic.id)?.performer,performer))
      fail('vocal-use-binding-mismatch',members.mic.id,'The check must use the installed facility-local performer declaration');
    const roomWorld=derived.worlds.get(room.id), local=relativeTransform(roomWorld,slot.transform);
    const xz=position=>[position[0],position[2]];
    performer={...performer,position:xz(local.position),yaw:local.yaw};
    targets={performer:performer.position,approach:xz(relativeTransform(roomWorld,{position:slot.approachPosition,yaw:0}).position),
      exit:xz(relativeTransform(roomWorld,{position:slot.exitPosition,yaw:0}).position)};
  } else targets={performer:performer.position};
  const reference = standingReserve({performer},room);
  let report;
  await preflightLibraryAssets({root,resources:[...facilities,...derived.surfaceFinishes.filter(f=>f.floorId===floorId)].map(f=>f.resource),validate:library=>{
    const scene = createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      const {records,worldToRoom,checkedMeshes} = scanScene(scene,derived,facilities,room,floorId,reference.protectedBox);
      const routes = checkRoomDoorAccess({scene,derived,facilities,floor,placement,room,portalId:rule.portalId,targets,radius,height});
      const access = routes.performer;
      for(const route of Object.values(routes)) if(route.portalId!==rule.portalId)
        fail('singing-portal-unreachable',rule.portalId,'The selected entrance must itself reach the performer targets.',{available:route.portalId});
      if(slot) {
        const blocker=clearanceQuery(scene,derived,facilities,room,radius,height);
        for(const name of ['approach','exit']) {
          const blockedBy=blocker(targets[name],targets.performer);
          if(blockedBy) fail('vocal-use-path-blocked',slot.id,'Geometry blocks the final standing clearance.',{segment:name,blockedBy});
        }
      }
      const supports = Object.fromEntries(['mic','score'].map(role=>[role,tripod(records,members[role])]));
      supports.camera = cameraSupport(records,members.camera);
      report = {ok:true,regionId:room.id,floorId,roles:{...rule.roles},portalId:rule.portalId,access,checkedMeshes,
        standing:{bounds:boxDescription(reference.box),width:2*radius,height,mouth:tuple(reference.mouth),eye:tuple(reference.eye)}, supports,
        ...(slot?{usePoint:slot,approach:routes.approach,exit:routes.exit}:{}),
        microphone:measureMic(records,members.mic,reference),score:measureScore(scene,records,worldToRoom,members.score,reference),
        camera:measureCamera(scene,records,worldToRoom,members.camera,reference),
        scope:'Installed geometry and fixed performer references for staging and access.'};
    } finally {scene.dispose();}
  }});
  return report;
}

export async function checkSingingRooms(document,options) {
  const rules = document.singingRooms;
  if (!Array.isArray(rules) || !rules.length) fail('invalid-singing-rooms','document.singingRooms','Expected a nonempty array of singing rooms.');
  const seen = new Set();
  const reports = [];
  for (const rule of rules) {
    validateRule(rule);
    if (seen.has(rule.regionId)) fail('invalid-singing-rooms',rule.regionId,'Only one singing declaration may own a room.');
    seen.add(rule.regionId);
    const report=await checkSingingRoom(document,rule,options);
    if(rule.heightProfiles) {
      const alternate=report.usePoint.heightProfile==='standard'?'low':'standard';
      const next=prepareCompanyChange(document,[{type:'set-vocal-height',id:rule.roles.mic,profile:alternate}],
        {catalog:options?.catalog??catalogDefault,templates:options?.templates??templatesDefault}).document;
      const checked=await checkSingingRoom(next,next.singingRooms.find(r=>r.regionId===rule.regionId),options);
      report.alternateHeight={profile:alternate,resource:checked.usePoint.resource,microphone:checked.microphone,
        score:checked.score,camera:checked.camera};
    }
    reports.push(report);
  }
  return reports;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [layout,rule,...extra] = process.argv.slice(2);
    if (!layout || extra.length) throw Error('Usage: node check-singing-room.mjs LAYOUT.json [RULE.json]');
    const read = async filename=>JSON.parse(await fs.readFile(filename,'utf8'));
    const document = await read(layout);
    console.log(JSON.stringify(rule ? await checkSingingRoom(document,await read(rule)) : await checkSingingRooms(document),null,2));
  } catch (error) {
    console.error(JSON.stringify({ok:false,code:error.code??'singing-input',path:error.path,message:error.message,details:error.details},null,2));
    process.exitCode = 1;
  }
}
