import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {installedCameraPose,framingFov} from '../../prototype/src/company/camera-view.js';
import {CompanyError} from '../../prototype/src/company/document.js';
import {scanRoomMeshes} from './check-training-clearance.mjs';

const aspect = 16/9;
// Match the production preview's camera clipping distances.
const near = .05, far = 300;
const contactTolerance = 1e-6, projectedAreaTolerance = 1e-10;
const vector = (x,y,z) => new THREE.Vector3(x,y,z);
const coordinates = p => p.toArray().map(n=>Number.isFinite(n) ? Number(n.toFixed(7)) || 0 : null);
const pair = value => Array.isArray(value) && value.length===2 && value.every(Number.isFinite);
const fail = (code,location,message,details) => {throw new CompanyError(code,location,message,details);};

function frameCorners(rule,activity,roomId) {
  const location = roomId+'.trainingClearance.shot';
  const frame = rule?.frame, {start,end,bottom,top} = frame ?? {};
  if (typeof rule?.cameraId!=='string' || !rule.cameraId.trim() || !pair(start) || !pair(end) ||
      !Number.isFinite(bottom) || !Number.isFinite(top) || top-bottom<=contactTolerance || bottom<0 ||
      Math.hypot(end[0]-start[0],end[1]-start[1])<=contactTolerance)
    fail('invalid-dance-shot',location,'Provide an installed camera ID and a room-local shot line with measurable length and height.');
  if (Object.keys(rule).sort().join(',')!=='backdropId,cameraId,frame' || typeof rule.backdropId!=='string' || !rule.backdropId.trim() ||
      Object.keys(frame).sort().join(',')!=='bottom,end,start,top')
    fail('invalid-dance-shot',location,'Specify installed cameraId, backdropId and a frame with start, end, bottom and top.');
  if (!activity || ![activity.minX,activity.maxX,activity.minZ,activity.maxZ,activity.clearHeight].every(Number.isFinite) ||
      top>activity.clearHeight+contactTolerance || [start,end].some(([x,z])=>x<activity.minX-contactTolerance ||
        x>activity.maxX+contactTolerance || z<activity.minZ-contactTolerance || z>activity.maxZ+contactTolerance))
    fail('invalid-dance-shot',location+'.frame','The full shot rectangle must stay in the validated activity volume.',{frame,activity});
  return [vector(start[0],bottom,start[1]),vector(end[0],bottom,end[1]),vector(end[0],top,end[1]),vector(start[0],top,start[1])];
}

function projectionFor(scene,facility,worldToRoom,roomId) {
  const group = scene.root.getObjectByName(facility.id), spec = facility.resource.camera;
  const pose = installedCameraPose(group,spec);
  if (!pose)
    fail('dance-shot-camera',facility.id,'The installed camera needs a physical forward lens surface.',{roomId,lensNode:spec?.lensNode});
  const lens = pose.position.clone().applyMatrix4(worldToRoom), forward = pose.forward.clone().transformDirection(worldToRoom);
  const camera = new THREE.PerspectiveCamera(framingFov(aspect),aspect,near,far);
  camera.position.copy(lens);
  camera.up.transformDirection(worldToRoom);
  camera.lookAt(lens.clone().add(forward));
  camera.updateMatrixWorld(true);
  return {camera,lens,forward,lensNode:spec.lensNode};
}

function viewVolume(corners,lens,forward,id) {
  const middle = corners[0].clone().lerp(corners[2],.5);
  const endPlane = new THREE.Plane().setFromCoplanarPoints(corners[0],corners[1],corners[2]);
  const distance = endPlane.distanceToPoint(lens);
  if (Math.abs(distance)<=contactTolerance)
    fail('dance-shot-out-of-frame',id,'The shot rectangle is edge-on to the camera and spans no visible frame area.');
  if (distance<0) endPlane.negate();
  // Mere contact at the subject plane is outside the occlusion volume.
  endPlane.constant -= contactTolerance;
  const planes = corners.map((point,index)=>{
    const plane = new THREE.Plane().setFromCoplanarPoints(lens,point,corners[(index+1)%corners.length]);
    return plane.distanceToPoint(middle)<0 ? plane.negate() : plane;
  });
  const nearPoint = lens.clone().addScaledVector(forward,near);
  return [...planes,endPlane,new THREE.Plane().setFromNormalAndCoplanarPoint(forward,nearPoint)];
}

// A triangle only obstructs the shot if clipping it against this rectangular pyramid
// leaves positive projected area. No finite grid of target rays is needed.
function clipPolygon(points,plane) {
  const clipped = [];
  let before = points.at(-1), beforeDistance = plane.distanceToPoint(before);
  for (const point of points) {
    const distance = plane.distanceToPoint(point);
    if ((distance>=0)!==(beforeDistance>=0))
      clipped.push(before.clone().lerp(point,beforeDistance/(beforeDistance-distance)));
    if (distance>=0) clipped.push(point);
    before = point;
    beforeDistance = distance;
  }
  return clipped;
}

function projectedArea(points,camera) {
  const clip = points.map(point=>point.clone().project(camera));
  const start = clip[0];
  let sum = 0;
  for (let i=1;i+1<clip.length;i++) {
    const a = clip[i], b = clip[i+1];
    sum += (a.x-start.x)*(b.y-start.y)-(a.y-start.y)*(b.x-start.x);
  }
  return Math.abs(sum)/2;
}

function missesVolume(box,planes) {
  return planes.some(({normal,constant})=>
    normal.x*(normal.x<0?box.min.x:box.max.x)+normal.y*(normal.y<0?box.min.y:box.max.y)+
    normal.z*(normal.z<0?box.min.z:box.max.z)+constant < -contactTolerance);
}

function visibleRanges(mesh) {
  const visible = material => material?.visible && (!material.transparent || material.opacity>0);
  const {drawRange,groups,index,attributes} = mesh.geometry;
  const count = index?.count ?? attributes.position.count;
  const end = Math.min(count,drawRange.start+drawRange.count);
  if (!Array.isArray(mesh.material)) return visible(mesh.material) ? [[drawRange.start,end]] : [];
  return groups.filter(group=>visible(mesh.material[group.materialIndex])).map(group=>
    [Math.max(drawRange.start,group.start),Math.min(end,group.start+group.count)]);
}

function findOcclusion({scene,room,facilities,planes,camera,cameraId,lensNode}) {
  const triangles = [vector(),vector(),vector()];
  let candidateMeshes = 0, testedTriangles = 0;
  const {checkedMeshes} = scanRoomMeshes(scene,room,facilities,[],[],(mesh,owner,matrix,bounds)=>{
    const part = mesh.userData.name || mesh.name || mesh.type;
    if ((owner?.id===cameraId && part===lensNode) || missesVolume(bounds,planes)) return;
    const ranges = visibleRanges(mesh), {index} = mesh.geometry;
    if (!ranges.length) return;
    candidateMeshes++;
    for (const [start,end] of ranges) for (let offset=start;offset+2<end;offset+=3) {
      for (const [i,vertex] of triangles.entries()) mesh.getVertexPosition(index ? index.getX(offset+i) : offset+i,vertex).applyMatrix4(matrix);
      testedTriangles++;
      let polygon = triangles;
      for (const plane of planes) {
        polygon = clipPolygon(polygon,plane);
        if (polygon.length<3) break;
      }
      if (polygon.length<3) continue;
      const area = projectedArea(polygon,camera);
      if (area<=projectedAreaTolerance) continue;
      const hit = polygon.reduce((sum,point)=>sum.add(point),vector()).multiplyScalar(1/polygon.length);
      const blocker = {instanceId:owner?.id ?? mesh.name,mesh:part,triangle:Math.floor(offset/3),
        point:coordinates(hit),ndc:coordinates(hit.clone().project(camera)),projectedAreaNdc:area};
      fail('dance-shot-occluded',blocker.instanceId,'Foreground geometry intersects the view of the protected dance shot.',{cameraId,roomId:room.id,blocker});
    }
  });
  return {checkedMeshes,candidateMeshes,testedTriangles};
}

// Check what the audience sees through the dancer's centre and on either side at chest height.
// Cast against the complete installed floor so a wall or some other fixture can win the first hit.
function checkBackdrop({scene,room,facilities,worldToRoom,lens,corners,backdropId}) {
  const member = facilities.find(item => item.id === backdropId);
  if (member?.roomId !== room.id || member.resource.mountRole !== 'background-panel')
    fail('dance-shot-backdrop',backdropId,'Select a background panel installed in this dance room.',{roomId:room.id});
  const roomToWorld = worldToRoom.clone().invert();
  const eye = lens.clone().applyMatrix4(roomToWorld);
  const rays = [.4,.5,.6].map(u => {
    const aim = corners[0].clone().lerp(corners[1],u).lerp(corners[3].clone().lerp(corners[2],u),.65).applyMatrix4(roomToWorld);
    const delta = aim.sub(eye), start = delta.length() + contactTolerance;
    return {u,raycaster:new THREE.Raycaster(eye,delta.normalize(),start,far),first:null};
  });
  scanRoomMeshes(scene,room,facilities,[],[],(mesh,owner) => {
    for (const sample of rays) {
      const hit = sample.raycaster.intersectObject(mesh,false).find(h => {
        const material = Array.isArray(mesh.material) ? mesh.material[h.face.materialIndex] : mesh.material;
        return material?.visible && (!material.transparent || material.opacity > 0);
      });
      if (hit && (!sample.first || hit.distance < sample.first.distance))
        sample.first = {instanceId:owner?.id ?? mesh.name,mesh:mesh.userData.name || mesh.name,
          point:coordinates(hit.point.clone().applyMatrix4(worldToRoom)),distance:hit.distance};
    }
  });
  const samples = rays.map(({u,first})=>({u,v:.65,first}));
  if (samples[1].first?.instanceId !== backdropId || samples.filter(s=>s.first?.instanceId===backdropId).length < 2)
    fail('dance-shot-backdrop',backdropId,'The designated backdrop must be visible behind the centre and one side of the shot.',{samples});
  return {id:backdropId,samples};
}

export function checkDanceShot({scene,room,facilities,worldToRoom,rule,activity}) {
  const corners = frameCorners(rule,activity,room.id);
  const {cameraId,frame} = rule, facility = facilities.find(item=>item.id===cameraId);
  if (facility?.roomId!==room.id || facility.resource?.mountRole!=='camera-static')
    fail('dance-shot-camera',cameraId,'Select a real camera installed in this dance room.',{roomId:room.id,actualRoomId:facility?.roomId??null});
  const {camera,lens,forward,lensNode} = projectionFor(scene,facility,worldToRoom,room.id);
  const ndc = corners.map(point=>point.clone().project(camera));
  for (const [index,point] of ndc.entries()) {
    if (point.toArray().some(axis=>!Number.isFinite(axis) || Math.abs(axis)>1+contactTolerance) ||
        corners[index].clone().sub(lens).dot(forward)<near-contactTolerance)
      fail('dance-shot-out-of-frame',cameraId,'The entire shot rectangle must fit within the installed camera’s 16:9 frame.',
        {roomId:room.id,corner:index,point:coordinates(corners[index]),ndc:coordinates(point),lens:coordinates(lens),forward:coordinates(forward)});
  }
  const planes = viewVolume(corners,lens,forward,cameraId);
  const occlusion = findOcclusion({scene,room,facilities,planes,camera,cameraId,lensNode});
  const backdrop = checkBackdrop({scene,room,facilities,worldToRoom,lens,corners,backdropId:rule.backdropId});
  return {ok:true,roomId:room.id,cameraId,lensNode,lens:coordinates(lens),forward:coordinates(forward),backdrop,
    frame:{start:[...frame.start],end:[...frame.end],bottom:frame.bottom,top:frame.top},
    projection:{aspect:'16:9',verticalFovDegrees:camera.fov,nearClipMetres:near,farClipMetres:far,cornersNdc:ndc.map(coordinates)},
    occlusion:{method:'continuous-triangle-clip',contactToleranceMetres:contactTolerance,...occlusion},
    scope:'Continuous room-local shot rectangle. Visible rigid meshes are conservative occluders; texture transparency is not sampled.'};
}
