import path from 'node:path';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import { CompanyError, deriveCompany } from '../../prototype/src/company/document.js';
import { isGlassPartitionSightPane } from '../../prototype/src/company/glass-partition.js';
import { createCompanyScene } from '../../prototype/src/company/render.js';
import { rayHit, scanRoomMeshes, vertices } from '../../prototype/src/company/room-mesh-geometry.js';
import { preflightLibraryAssets } from './preflight-library-assets.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const xyz = point => point.toArray().map(n => Number(n.toFixed(6)));
const part = record => record.object.userData.name || record.object.name;

function requireFit(ok, id, message, details = {}) {
  if (!ok) throw new CompanyError('invalid-studio-lounge-set', id, message, details);
}

export async function withStudioFloor(document, { catalog, templates, roomId }, examine) {
  const derived = deriveCompany(document, catalog, templates);
  const floorId = derived.floorIds.get(roomId);
  requireFit(floorId, roomId, 'Expected a room on a loaded floor.');
  const facilities = derived.facilities.filter(f => f.floorId === floorId);
  const resources = [...facilities, ...derived.surfaceFinishes.filter(f => f.floorId === floorId)].map(f => f.resource);
  let result;
  await preflightLibraryAssets({ root, resources, validate: assetLibrary => {
    const scene = createCompanyScene(new T.Scene(), document, { catalog, templates, visibleFloorId: floorId, assetLibrary, mirrorPreflight: () => {} });
    try {
      scene.root.updateMatrixWorld(true);
      const records = [];
      const { worldToRoom } = scanRoomMeshes(scene, derived.nodes.get(roomId), facilities, [], [], (object, owner, matrix, bounds) => {
        records.push({ id: owner?.id ?? object.name, object, matrix: matrix.clone(), bounds: bounds.clone() });
      });
      const matrix = id => worldToRoom.clone().multiply(scene.root.getObjectByName(id).matrixWorld);
      const owned = id => records.filter(r => r.id === id);
      const facility = id => facilities.find(f => f.id === id);
      result = examine({ scene, derived, records, owned, facility, matrix });
    } finally {
      scene.dispose();
    }
  }});
  return result;
}

// The measured base rather than the child origin determines support. Five sampled
// directions include the perimeter and every selected point comes from an actual vertex.
export function measureRestingBase(context, childId, parentId, surfacePart) {
  const { owned } = context;
  const support = owned(parentId).filter(r => !surfacePart || part(r) === surfacePart);
  const points = owned(childId).flatMap(vertices);
  requireFit(support.length && points.length, childId, 'Missing physical load or bearing mesh.');
  const baseY = points.reduce((y, p) => Math.min(y, p.y), Infinity);
  const bottom = points.filter(p => p.y <= baseY + 0.0001);
  const extrema = [[1,1],[1,-1],[-1,1],[-1,-1],[0,0]].map(([x,z]) =>
    bottom.reduce((a,b) => a.x*x+a.z*z >= b.x*x+b.z*z ? a : b));
  const unique = [...new Map(extrema.map(p => [xyz(p).join(','), p])).values()];
  requireFit(unique.length >= 3, childId, 'Base requires three measured bearing points.');
  return unique.map(p => {
    const hit = rayHit(support, p.clone().add(v(0,.012,0)), p.clone().sub(v(0,.012,0)));
    const gap = hit && Math.abs(hit.point.y - p.y);
    requireFit(hit && gap <= .001 && hit.normal.y > .99, childId, 'Physical base misses the supporting top.', { parentId, surfacePart, point: xyz(p), gap, hit: hit && part(hit.record) });
    return { part: part(hit.record), point: xyz(p), gapM: gap };
  });
}

export async function checkStudioLoungeDesk(document, { catalog, templates, stationId, secondaryId }) {
  const station = document.nodes.find(n => n.id === stationId && n.kind === 'workstation');
  requireFit(station, stationId, 'Expected a designated streaming station.');
  const roomId = station.parentId;
  return withStudioFloor(document, {catalog, templates, roomId}, context => {
    const {derived, owned, matrix, facility, records} = context;
    const sightRecords = records.filter(({object}) => !isGlassPartitionSightPane(object));
    const members = document.nodes.filter(n => n.stationId === stationId);
    const deskId = members.find(n => n.partKey === 'desk')?.id;
    const chairId = members.find(n => n.partKey === 'chair')?.id;
    const mainId = members.find(n => n.partKey === 'monitor')?.id;
    requireFit(deskId && chairId && mainId && secondaryId && mainId !== secondaryId, stationId, 'Missing distinct station monitor, second monitor, desk or chair.');
    const seat = derived.usePoints.find(p => p.facilityId === chairId);
    requireFit(seat?.seatHeight && seat.position, chairId, 'Missing physical seat reference.');
    // Same two observed near/far endpoints per seated body as meeting-room.js.
    const eyeProbes = [[.007,.671,.099],[.008,.674,.117],[.008,.708,.117],[.009,.713,.136]].map(offset =>
      v(...seat.position).add(v(0,seat.seatHeight,0)).add(v(...offset)).applyMatrix4(matrix(chairId)));
    const deskRight = v(1,0,0).transformDirection(matrix(deskId));
    const spans = [];
    const monitors = [mainId, secondaryId].map(id => {
      const card = facility(id)?.resource, node = derived.nodes.get(id);
      requireFit(node?.parentId === deskId && card?.mountRole === 'monitor' && card.asset?.format === 'glb', id, 'Each actual monitor must mount on this same desk.');
      const screenNames = card.display?.screen?.nodes ?? [];
      const screens = owned(id).filter(r => screenNames.includes(part(r)));
      const powered = node.state?.on ?? card.stateDefaults?.on;
      requireFit(screens.length && typeof powered === 'boolean', id, 'Expected a physical GLB screen and a defined power state.');
      const local = matrix(id), inverse = local.clone().invert();
      const box = new T.Box3().setFromPoints(screens.flatMap(vertices).map(p => p.clone().applyMatrix4(inverse)));
      const size = box.getSize(v()), center = box.getCenter(v());
      requireFit(size.x > 0 && size.y > 0, id, 'Screen needs measurable width and height.');
      const front = v(0,0,1).transformDirection(local);
      const targets = [[0,0],[-.45,-.45],[-.45,.45],[.45,-.45],[.45,.45]].map(([x,y]) =>
        v(center.x+x*size.x,center.y+y*size.y,box.max.z).applyMatrix4(local));
      const views = eyeProbes.map(eye => {
        const angle = T.MathUtils.radToDeg(front.angleTo(eye.clone().sub(targets[0])));
        requireFit(angle < 90, id, 'Seat sees the reverse of the monitor.', {eye:xyz(eye), angle});
        const hits = targets.map(target => {
          const hit = rayHit(sightRecords,eye,target.clone().addScaledVector(front,-.025));
          requireFit(hit && screens.includes(hit.record) && hit.normal.dot(front) > .5, id, 'Monitor face occluded from the station seat.', {eye:xyz(eye), target:xyz(target), blocker:hit?.record.id, part:hit && part(hit.record)});
          return part(hit.record);
        });
        return { angleDegrees: angle, distanceM: eye.distanceTo(targets[0]), hits };
      });
      const range = owned(id).flatMap(vertices).reduce(([min,max],p) => [Math.min(min,p.dot(deskRight)),Math.max(max,p.dot(deskRight))], [Infinity,-Infinity]);
      spans.push(range);
      return { id, resource:node.resource, assetSha256:card.asset.sha256, powered, screenSizeM:[size.x,size.y], screens:screenNames, views, bearing:measureRestingBase(context,id,deskId) };
    });
    const separationM = Math.max(spans[0][0]-spans[1][1],spans[1][0]-spans[0][1]);
    requireFit(separationM > 0, stationId, 'Side-by-side monitor meshes need a distinct left/right interval on this desk.', {spans, separationM});
    return {stationId, deskId, chairId, eyeProbes:eyeProbes.map(xyz), monitors, separationM};
  });
}
