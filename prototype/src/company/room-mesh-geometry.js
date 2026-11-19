import * as T from 'three';
import {CompanyError} from './document.js';

const p=()=>new T.Vector3();

export function vertices(record) {
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

export function scanRoomMeshes(scene, room, facilities, regions, failures, onMesh) {
  const roomGroup = scene.root.getObjectByName(room.id);
  const worldToRoom = roomGroup.matrixWorld.clone().invert();
  const facilityGroups = new Map(facilities.map(facility => [scene.root.getObjectByName(facility.id), facility]));
  const walls = new Set(scene.walls);
  const transform = new T.Matrix4(), bounds = new T.Box3(), triangle = new T.Triangle();
  let checkedMeshes = 0;
  function visit(object, owner, ceiling = false) {
    const facility = facilityGroups.get(object);
    if (facility) {
      owner = facility;
      ceiling = facility.resource.mount === 'ceiling';
    }
    // Ceiling wrappers are hidden in the full-floor view. Geometry beneath them
    // still occupies the published room, even when the editor hides the ceiling.
    if (!object.visible && !(facility && ceiling)) return;
    if (object.isMesh && (owner || walls.has(object))) {
      const part = object.userData.name || object.name || object.type;
      const componentId = owner?.id ?? object.name;
      if (object.isInstancedMesh || object.isSkinnedMesh || object.isBatchedMesh || object.morphTargetInfluences?.some(weight => weight !== 0))
        throw new CompanyError('unsupported-training-clearance-mesh', componentId, 'Clearance requires individual rigid triangle meshes', {roomId:room.id, part});
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');
      transform.multiplyMatrices(worldToRoom,object.matrixWorld);
      bounds.setFromBufferAttribute(positions).applyMatrix4(transform);
      onMesh?.(object, owner, transform, bounds);
      const pending = regions.filter(({box}) => box.intersectsBox(bounds));
      checkedMeshes++;
      const index = geometry.getIndex();
      const start = geometry.drawRange.start;
      const end = Math.min(index?.count ?? positions.count, start + geometry.drawRange.count);
      const hit = (region, kind) => failures.push({region,kind,componentId,part, ...(owner && {resourceId:owner.resource.id})});
      if (walls.has(object)) {
        for (const {name} of pending) hit(name,'structural-wall');
      } else {
        for (let offset = start; pending.length && offset + 2 < end; offset += 3) {
          for (const [step,vertex] of [triangle.a,triangle.b,triangle.c].entries()) {
            object.getVertexPosition(index ? index.getX(offset + step) : offset + step,vertex).applyMatrix4(transform);
          }
          for (let candidate = pending.length - 1; candidate >= 0; candidate--) {
            if (!pending[candidate].box.intersectsTriangle(triangle)) continue;
            hit(pending[candidate].name,'mesh-surface');
            pending.splice(candidate,1);
          }
        }
      }
    }
    for (const child of object.children) visit(child,owner,ceiling);
  }
  visit(scene.root,null);
  return {worldToRoom, checkedMeshes};
}
