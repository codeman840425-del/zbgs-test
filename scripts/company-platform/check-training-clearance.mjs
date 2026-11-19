import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import defaultCatalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import defaultTemplates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {CompanyError, deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {inspectCompanyConnections} from '../../prototype/src/company/space.js';
import {WALL_HEIGHT} from '../../prototype/src/company/wall-visibility.js';

const publicRoot = fileURLToPath(new URL('../../prototype/public/', import.meta.url));
const fitEpsilon = 1e-7;
const contactTolerance = .001;
const rectFields = ['minX','maxX','minZ','maxZ','clearHeight'];
const portalEdges = {
  north: {across:['minX','maxX'], toward:'minZ', inward:'maxZ', axis:'z', sign:-1},
  south: {across:['minX','maxX'], toward:'maxZ', inward:'minZ', axis:'z', sign:1},
  west: {across:['minZ','maxZ'], toward:'minX', inward:'maxX', axis:'x', sign:-1},
  east: {across:['minZ','maxZ'], toward:'maxX', inward:'minX', axis:'x', sign:1},
};
const fail = (code, location, message, details) => {throw new CompanyError(code, location, message, details);};

function exactFields(value, fields, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value,key)))
    fail('invalid-training-clearance', location, `Expected fields ${fields.join(', ')}`);
}

function validateRectangle(rect, region, room, extraFields = []) {
  const location = `trainingClearance.${region}`;
  exactFields(rect, [...rectFields, ...extraFields], location);
  if (!rectFields.every(field => Number.isFinite(rect[field])) ||
      Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ, rect.clearHeight) <= 2 * contactTolerance)
    fail('invalid-training-clearance', location, 'Expected finite bounds with positive width, depth and height above the contact tolerance');
  if (rect.minX < -room.bounds.width/2 - fitEpsilon || rect.maxX > room.bounds.width/2 + fitEpsilon ||
      rect.minZ < -room.bounds.depth/2 - fitEpsilon || rect.maxZ > room.bounds.depth/2 + fitEpsilon ||
      rect.clearHeight > WALL_HEIGHT + fitEpsilon)
    fail('training-clearance-outside-room', location, 'The requested clearance volume must fit within the room', {roomId:room.id, region});
}

function matchPortal(layout, requested, room, floor) {
  const {activity,entry} = requested;
  const connection = floor.connections.find(candidate => candidate.id === entry.portalId);
  const portal = [connection?.from, connection?.to, ...floor.exteriorEntrances.filter(candidate => candidate.id === entry.portalId)]
    .find(candidate => candidate?.regionId === room.id);
  const details = {roomId:room.id, region:'entry', portalId:entry.portalId};
  if (!portal || !layout.checkedPortals.some(side => side.regionId === room.id && side.connectionId === entry.portalId))
    fail('training-clearance-portal-missing', 'trainingClearance.entry.portalId', 'Choose a validated doorway on the selected room', details);
  const edge = portalEdges[portal.edge];
  const [lo,hi] = edge.across;
  const threshold = portal.local.center[edge.axis === 'x' ? 0 : 2];
  if (Math.abs(entry[edge.toward] - threshold) > fitEpsilon || entry[lo] < portal.offset - portal.width/2 - fitEpsilon ||
      entry[hi] > portal.offset + portal.width/2 + fitEpsilon || entry.clearHeight > (portal.height ?? WALL_HEIGHT) + fitEpsilon)
    fail('training-clearance-portal-fit', 'trainingClearance.entry', 'The end of the entrance rectangle must lie on the actual doorway and fit its opening', details);
  const overlapX = Math.min(activity.maxX,entry.maxX) - Math.max(activity.minX,entry.minX);
  const overlapZ = Math.min(activity.maxZ,entry.maxZ) - Math.max(activity.minZ,entry.minZ);
  const joinedByArea = Math.min(overlapX,overlapZ) > 2 * contactTolerance;
  const joinedByEdge = Math.abs(activity[edge.toward] - entry[edge.inward]) <= fitEpsilon &&
    activity[lo] <= entry[lo] + fitEpsilon && activity[hi] >= entry[hi] - fitEpsilon;
  if (!joinedByArea && !joinedByEdge)
    fail('training-clearance-disconnected', 'trainingClearance.entry', 'The entrance rectangle must join the activity rectangle by area or across its full inward edge', details);
  return {portal:{id:entry.portalId, edge:portal.edge, center:[...portal.local.center], width:portal.width,
    height:portal.height ?? WALL_HEIGHT, kind:connection ? 'internal' : 'exterior'}, joinedByEdge};
}

function clearanceBox(rect, portal, joinedByEdge) {
  const min = new THREE.Vector3(rect.minX + contactTolerance, contactTolerance, rect.minZ + contactTolerance);
  const max = new THREE.Vector3(rect.maxX - contactTolerance, rect.clearHeight - contactTolerance, rect.maxZ - contactTolerance);
  // Keep the threshold plane inside the scan, including a coplanar closed leaf.
  if (portal) {
    const {axis, sign, toward, inward} = portalEdges[portal.edge];
    const outer = sign < 0 ? min : max;
    const inner = sign < 0 ? max : min;
    outer[axis] = rect[toward] + sign * fitEpsilon;
    if (joinedByEdge) inner[axis] = rect[inward] - sign * fitEpsilon;
  }
  return new THREE.Box3(min,max);
}

export function createLocalRoomAssetLibrary() {
  globalThis.self ??= globalThis;
  // Geometry is decoded by GLTFLoader. Supply image dimensions in Node without raster or GPU rendering.
  globalThis.createImageBitmap ??= async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const png = bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47;
    return {width:png ? bytes.readUInt32BE(16) : 1, height:png ? bytes.readUInt32BE(20) : 1, close(){}};
  };
  return createCompanyAssetLibrary({fetchImpl:async url => {
    const file = path.resolve(publicRoot, `.${url}`);
    if (!url.startsWith('/company-assets/') || !file.startsWith(path.join(publicRoot,'company-assets') + path.sep))
      fail('invalid-training-asset-path', url, 'Expected a local company asset');
    const bytes = await fs.readFile(file);
    return {ok:true, arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  }});
}

export function scanRoomMeshes(scene, room, facilities, regions, failures, onMesh) {
  const roomGroup = scene.root.getObjectByName(room.id);
  const worldToRoom = roomGroup.matrixWorld.clone().invert();
  const facilityGroups = new Map(facilities.map(facility => [scene.root.getObjectByName(facility.id), facility]));
  const walls = new Set(scene.walls);
  const transform = new THREE.Matrix4(), bounds = new THREE.Box3(), triangle = new THREE.Triangle();
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
        fail('unsupported-training-clearance-mesh', componentId, 'Clearance requires individual rigid triangle meshes', {roomId:room.id, part});
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

export async function checkTrainingClearance(document, constraint, {catalog = defaultCatalog, templates = defaultTemplates} = {}) {
  exactFields(constraint,['roomId','activity','entry'],'trainingClearance');
  const derived = deriveCompany(document,catalog,templates);
  const room = derived.nodes.get(constraint.roomId);
  if (room?.kind !== 'room') fail('training-clearance-room-missing', 'trainingClearance.roomId', 'Choose a room in this layout');
  validateRectangle(constraint.activity,'activity',room);
  validateRectangle(constraint.entry,'entry',room,['portalId']);
  const placement = inspectCompanyPlacement(document,catalog,templates);
  const floorId = derived.floorIds.get(room.id);
  const floor = inspectCompanyConnections(document,catalog,templates).floors.find(candidate => candidate.floorId === floorId);
  const {portal,joinedByEdge} = matchPortal(placement,constraint,room,floor);
  const regions = [
    {name:'activity',box:clearanceBox(constraint.activity)},
    {name:'entry',box:clearanceBox(constraint.entry,portal,joinedByEdge)},
  ];
  const facilities = derived.facilities.filter(facility => facility.floorId === floorId);
  const library = createLocalRoomAssetLibrary();
  let scene;
  try {
    const finishes = derived.surfaceFinishes.filter(finish => finish.floorId === floorId);
    await library.preload([...facilities,...finishes].map(item => item.resource));
    scene = createCompanyScene(new THREE.Scene(), document, {catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    const failures = [];
    const {worldToRoom,checkedMeshes} = scanRoomMeshes(scene,room,facilities,regions,failures);
    const corner = new THREE.Vector3();
    for (const obstacle of derived.obstacles.filter(item => item.floorId === floorId && item.resource.mount !== 'portal-door')) {
      const corners = obstacle.corners.map(point => corner.fromArray(point).applyMatrix4(worldToRoom).toArray());
      const minX = Math.min(...corners.map(point => point[0])), maxX = Math.max(...corners.map(point => point[0]));
      const minZ = Math.min(...corners.map(point => point[2])), maxZ = Math.max(...corners.map(point => point[2]));
      for (const {name,box} of regions) {
        if (minX < box.max.x && maxX > box.min.x && minZ < box.max.z && maxZ > box.min.z)
          failures.push({region:name,kind:'blocking-footprint',componentId:obstacle.id,resourceId:obstacle.resource.id});
      }
    }
    failures.sort((a,b) => a.region.localeCompare(b.region) || a.componentId.localeCompare(b.componentId) || a.kind.localeCompare(b.kind));
    if (failures.length) {
      const first = failures[0];
      fail('training-clearance-obstructed', first.componentId, `Clearance intrusion in ${first.region} of ${room.id}`, {roomId:room.id,portalId:portal.id,failures});
    }
    return {ok:true, roomId:room.id, floorId, portal, activity:{...constraint.activity}, entry:{...constraint.entry},
      checkedFacilities:facilities.length, checkedMeshes, contactToleranceMetres:contactTolerance,
      scope:'Static room-local clearance against structure, blocking footprints, and actual mesh surfaces at the installed facility states.',
      limitations:['Enclosed volumes of non-blocking meshes are sampled at their triangle surfaces only.',
        'Motion sweeps, character fit, texture opacity and GPU rendering require separate verification.']};
  } finally {
    scene?.dispose();
    library.dispose();
  }
}

async function main() {
  const [layoutFile,constraintFile,...extra] = process.argv.slice(2);
  if (!layoutFile || !constraintFile || extra.length)
    fail('training-clearance-usage', 'arguments', 'Usage: node scripts/company-platform/check-training-clearance.mjs LAYOUT.json CLEARANCE.json');
  const read = async file => JSON.parse(await fs.readFile(file,'utf8'));
  const [document,constraint] = await Promise.all([read(layoutFile),read(constraintFile)]);
  console.log(JSON.stringify(await checkTrainingClearance(document,constraint),null,2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.log(JSON.stringify({ok:false,code:error.code || 'training-clearance-input',path:error.path,message:error.message,details:error.details},null,2));
  process.exitCode = 1;
});
