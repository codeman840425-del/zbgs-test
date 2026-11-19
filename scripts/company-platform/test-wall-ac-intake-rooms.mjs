import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3, Raycaster, Scene, Triangle, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import roomFixtures from './batch-inputs/floor-air-rooms.json' with {type:'json'};
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [directory, glb, adapterReceipt, ...extra] = process.argv.slice(2);
assert(directory && glb && adapterReceipt && !extra.length,
  'Usage: node scripts/company-platform/test-wall-ac-intake-rooms.mjs NEW_OUTPUT_DIR CLOSED_GLB ADAPTER_REPORT');
const output = path.resolve(directory);
await checkManagedOutput(output, root, {allowDelivery:false});
await fs.mkdir(output);

const ref = {id:'wall-ac-split-pilot',version:1};
const outputFile = name => path.join(output, name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const vec = (x, y, z) => new Vector3(x, y, z);
const up = vec(0, 1, 0);
const epsilon = 1e-5;
const round = value => Number(value.toFixed(8)) || 0;
const tuple = vector => vector.toArray().map(round);
const report = {
  status:'running',
  registration:'Candidate catalog overlay only. The asset is not registered in the production catalog.',
  rendering:'Live company authoring/asset loader/Three scene exercised in Node with the repository image decoder shim.',
  rooms:[], rejections:[], restores:[],
};
let stage = 'source pins';
const active = [];

function rewriteGlb(bytes, update) {
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8'));
  update(document);
  const json = Buffer.from(JSON.stringify(document));
  const padding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
  const bin = bytes.subarray(jsonEnd);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(json.length + padding.length, 12);
  header.writeUInt32LE(header.length + json.length + padding.length + bin.length, 8);
  return Buffer.concat([header, json, padding, bin]);
}

function translateInZ(node, distance) {
  assert(node && !node.matrix, 'Expected the adapter to export the requested TRS node');
  const [x, y, z] = node.translation ?? [0, 0, 0];
  node.translation = [x, y, z + distance];
}

function createStorage(initialEntries = []) {
  const items = new Map(initialEntries);
  return {
    items,
    getItem:key => items.get(key) ?? null,
    setItem:(key, text) => items.set(key, text),
  };
}

function createLibrary(models) {
  const publicRoot = path.join(root, 'prototype', 'public');
  const requests = [];
  const library = createCompanyAssetLibrary({fetchImpl:async url => {
    requests.push(url);
    if (models.has(url)) return new Response(models.get(url));
    const file = path.resolve(publicRoot, url.replace(/^\//, ''));
    assert(file.startsWith(publicRoot + path.sep), 'Asset path escapes the public root');
    return new Response(await fs.readFile(file));
  }});
  return {library, requests};
}

async function open(document, overlay, models, storage) {
  const {library, requests} = createLibrary(models);
  try {
    const author = await createCompanyAuthoring(new Scene(), document, {
      catalog:overlay, templates, assetLibrary:library, storage, mirrorPreflight:() => {},
    });
    const context = {author, library, requests};
    active.push(context);
    return context;
  } catch (error) {
    library.dispose();
    throw error;
  }
}

function sceneObject(session, name) {
  const object = session.scene.root.getObjectByName(name);
  assert(object, 'Missing rendered object ' + name);
  return object;
}

function existingRoomState(session, roomId) {
  const snapshot = session.snapshot();
  return {
    workstations:session.document.nodes.filter(node => node.id.startsWith(roomId + '/station-')),
    points:snapshot.points,
    navigation:snapshot.navigation,
  };
}

function eachTriangle(mesh, matrix, visit) {
  const index = mesh.geometry.getIndex();
  const count = index?.count ?? mesh.geometry.getAttribute('position').count;
  const triangle = new Triangle(vec(), vec(), vec());
  for (let i = 0; i < count; i += 3) {
    for (const [offset, corner] of [triangle.a, triangle.b, triangle.c].entries()) {
      mesh.getVertexPosition(index ? index.getX(i + offset) : i + offset, corner).applyMatrix4(matrix);
    }
    visit(triangle);
  }
}

function checkWallContact(session, room, modelId, floorYaw, mounted, envelope) {
  session.scene.root.updateMatrixWorld(true);
  const model = sceneObject(session, modelId);
  const mount = model.getObjectByName('wall-ac-mount');
  assert(mount?.isMesh, 'The mounting plate must be a real mesh');
  const normal = model.getWorldDirection(vec());
  const expected = vec(0, 0, 1).applyAxisAngle(up, floorYaw + room.transform.yaw + mounted.yaw);
  assert(normal.distanceTo(expected) < epsilon, 'The GLB +Z axis must inherit the rotated room transform');
  const origin = model.getWorldPosition(vec());
  assert(Math.abs(origin.y - 2.24) < epsilon, 'Wall anchor height must be 2.24m');
  const walls = session.scene.walls.filter(wall => wall.userData.roomId === room.id && wall.userData.edge === 'north');
  assert(walls.length);
  const toLocal = model.matrixWorld.clone().invert().multiply(mount.matrixWorld);
  const box = new Box3(), triangles = [];
  eachTriangle(mount, toLocal, triangle => {
    [triangle.a, triangle.b, triangle.c].forEach(point => box.expandByPoint(point));
    triangles.push(triangle.clone());
  });
  assert(Math.abs(box.min.z) < epsilon, 'Real mount back plane must be at local z=0');
  let area = 0;
  const contactSamples = [];
  for (const triangle of triangles) {
    if (![triangle.a, triangle.b, triangle.c].every(point => Math.abs(point.z - box.min.z) < epsilon)) continue;
    const center = model.localToWorld(triangle.getMidpoint(vec()));
    const hit = new Raycaster(center.clone().addScaledVector(normal, .04), normal.clone().negate(), 0, .10)
      .intersectObjects(walls, false)[0];
    assert(hit?.point.distanceTo(center) < epsilon, 'The real plate triangle must meet the physical wall inner face');
    area += triangle.getArea();
    contactSamples.push({mesh:hit.object.name, wallPoint:tuple(hit.point), mountPoint:tuple(center)});
  }
  assert(area > .05, 'Expected a substantial planar wall contact patch');
  const worldToModel = model.matrixWorld.clone().invert();
  const localBounds = new Box3();
  model.traverseVisible(mesh => {
    if (mesh.isMesh) eachTriangle(mesh, worldToModel.clone().multiply(mesh.matrixWorld), triangle => {
      [triangle.a, triangle.b, triangle.c].forEach(point => localBounds.expandByPoint(point));
    });
  });
  assert(localBounds.min.x >= -envelope.width / 2 - epsilon && localBounds.max.x <= envelope.width / 2 + epsilon);
  assert(localBounds.min.y >= -envelope.height / 2 - epsilon && localBounds.max.y <= envelope.height / 2 + epsilon);
  assert(localBounds.min.z >= -epsilon && localBounds.max.z <= envelope.depth + epsilon);
  return {
    anchor:tuple(origin), worldForward:tuple(normal), mountLocalBackZ:round(box.min.z),
    mountedContactAreaSquareMetres:round(area), contactSamples,
    localBounds:{min:tuple(localBounds.min),max:tuple(localBounds.max)},
  };
}

function inspectVisualState(session, modelId, state, angles) {
  const object = sceneObject(session, modelId);
  const meshes = [];
  object.traverseVisible(mesh => { if (mesh.isMesh) meshes.push(mesh); });
  const louver = object.getObjectByName('wall-ac-louver');
  const status = object.getObjectByName('wall-ac-status');
  const back = object.getObjectByName('wall-ac-outlet-back');
  assert(louver && meshes.length >= 5 && status?.isMesh && back?.isMesh);
  assert(meshes.includes(status), 'The status indicator must be visible on the actual instance');
  const expected = state.on ? angles.modeRadians[state.mode - 1] : angles.closedRadians;
  assert(Math.abs(louver.rotation.x - expected) < epsilon, 'Public state must set the actual GLB louver rotation');
  const material = status.material;
  assert(material.emissive?.isColor && Number.isFinite(material.emissiveIntensity));
  assert.equal(material.emissiveIntensity > 0, state.on);
  if (!state.on) assert.equal(material.emissiveIntensity, 0);
  if (state.on) assert.notEqual(material.emissive.getHex(), 0);

  const normal = object.getWorldDirection(vec());
  const center = new Box3().setFromObject(back, true).getCenter(vec());
  const hit = new Raycaster(center.clone().addScaledVector(normal, .26), normal.clone().negate(), 0, .4)
    .intersectObjects(meshes, false)[0];
  assert(hit, 'The real mounted assembly must intersect its physical outlet ray');
  if (state.on) assert.equal(hit.object, back, 'An open outlet must expose the real recessed back');
  else {
    let ancestor = hit.object;
    while (ancestor && ancestor !== louver) ancestor = ancestor.parent;
    assert.equal(ancestor, louver, 'The actual closed flap must block the recessed outlet');
  }
  return {
    state, louverRotationX:round(louver.rotation.x),
    indicator:{color:material.color.getHexString(),emissive:material.emissive.getHexString(),intensity:material.emissiveIntensity},
    outletRay:{firstMesh:hit.object.name,point:tuple(hit.point)},
  };
}

async function reject(session, operation, expectedCode, modelId) {
  const priorScene = session.scene.root;
  const priorObject = sceneObject(session, modelId);
  const priorExport = await session.export();
  const saved = session.readSavedText(session.document.id);
  await assert.rejects(session.apply([operation]), error => {
    assert.equal(error.code, expectedCode, error.message);
    report.rejections.push({company:session.document.id, operation, code:error.code, path:error.path, savedSha256:sha256(saved)});
    return true;
  });
  assert.equal(session.scene.root, priorScene, 'Rejected transaction replaced the scene');
  assert.equal(sceneObject(session, modelId), priorObject, 'Rejected transaction replaced the actual fixture');
  assert.equal(await session.export(), priorExport, 'Rejected transaction changed the document');
  assert.equal(session.readSavedText(session.document.id), saved, 'Rejected transaction changed persisted bytes');
}

try {
  const originalFolder = path.join(root, 'assets-source','company-wall-hvac-v1','original');
  const source = JSON.parse(await fs.readFile(path.join(originalFolder, 'source.json')));
  const original = await fs.readFile(path.join(originalFolder, source.originalFile));
  const glbBytes = await fs.readFile(glb);
  const adapterBytes = await fs.readFile(adapterReceipt);
  const adapter = JSON.parse(adapterBytes);
  const exported = adapter.files[path.basename(glb)];
  assert.equal(sha256(original), source.sha256);
  assert.equal(source.sha256, adapter.sourceSHA256);
  assert.equal(sha256(glbBytes), exported.sha256);
  assert.equal(glbBytes.length, exported.bytes);
  const {closedRotationX:closedRadians, openRotationX:openRadians} = adapter.hinge;
  assert(Number.isFinite(closedRadians) && Number.isFinite(openRadians) && closedRadians < openRadians);
  const angles = {
    louver:'wall-ac-louver', status:'wall-ac-status', closedRadians,
    modeRadians:[.80, .68, 1].map(fraction => closedRadians + (openRadians - closedRadians) * fraction),
  };
  const resource = {
    ...ref, displayName:'壁挂分体空调试样', mountRole:'wall-hvac', productionBranch:'hvac', category:'dynamic',
    parent:'room.wall', mount:'wall', mounting:{origin:'center',width:1,height:.35,depth:.22},
    coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Wall contact centre; back plane z=0; front +Z'},
    usePoints:[], stateDefaults:{on:false,mode:1}, stateSchema:{on:{type:'boolean'},mode:{type:'integer',min:1,max:3}},
    stateSemantics:{on:'wall-hvac-enabled-v1',mode:'wall-hvac-mode-v1'}, wallHvac:angles,
    asset:{format:'glb',url:'/qa/wall-ac-split-pilot-closed.glb',sha256:exported.sha256,bytes:exported.bytes},
  };
  const corrupt = Buffer.from(glbBytes);
  corrupt.writeUInt32LE(0, 0);
  const floated = rewriteGlb(glbBytes, document => {
    const roots = document.scenes[document.scene ?? 0].nodes;
    assert(roots.length > 0, 'Expected the adapter to export a default scene');
    for (const index of roots) translateInZ(document.nodes[index], .004);
  });
  assert(exported.mountedBounds.max[2] + .004 < resource.mounting.depth, 'Floating negative must still fit generic depth');
  const outletShift = .101;
  const occluded = rewriteGlb(glbBytes, document => {
    const roots = document.scenes[document.scene ?? 0].nodes;
    const back = roots.map(index => document.nodes[index]).find(node => node.name === 'wall-ac-outlet-back');
    assert(back && !back.scale && !back.rotation, 'Expected an unrotated outlet back mesh at the scene root');
    const backDepth = Math.max(...document.meshes[back.mesh].primitives.map(
      part => document.accessors[part.attributes.POSITION].max[2],
    )) + (back.translation?.[2] ?? 0) + outletShift;
    assert(backDepth > exported.mountedBounds.max[2] && backDepth < resource.mounting.depth,
      'Bad back plate must move ahead of the face while staying within the fixed envelope');
    translateInZ(back, outletShift);
  });
  const variant = (version, tag, bytes) => ({
    ...resource, version,
    asset:{...resource.asset,url:'/qa/wall-ac-' + tag + '.glb',sha256:sha256(bytes),bytes:bytes.length},
  });
  const corruptAsset = variant(2, 'corrupt', corrupt);
  const floatingAsset = variant(3, 'floating', floated);
  const occludedAsset = variant(4, 'bad-outlet', occluded);
  assert(!catalog.resources.some(entry => entry.id === ref.id), 'Real catalog already registers the candidate; update the test scope');
  const overlay = {...catalog,resources:[...catalog.resources,resource,corruptAsset,floatingAsset,occludedAsset]};
  const models = new Map([
    [resource.asset.url, glbBytes], [corruptAsset.asset.url, corrupt],
    [floatingAsset.asset.url, floated], [occludedAsset.asset.url, occluded],
  ]);
  report.source = {originalSha256:source.sha256, exportSha256:exported.sha256, adapterReportSha256:sha256(adapterBytes), angles};
  report.badOutlet = {node:'wall-ac-outlet-back', movedForwardMetres:outletShift, sha256:occludedAsset.asset.sha256};
  installNodeImageDecodeShim();
  const storage = createStorage();
  const rooms = [];

  for (const [index, fixture] of roomFixtures.items.entries()) {
    const id = index === 0 ? 'wall-ac-home' : 'wall-ac-rental';
    stage = id + ' installation and defaults';
    const input = {...fixture.input,id,name:index === 0 ? '民房 · 壁挂空调' : '旋转出租屋 · 壁挂空调'};
    const document = createCompanyScaleV2(input, catalog, templates);
    const room = document.nodes.find(node => node.id === id + '/ground/live');
    const floorId = id + '/ground';
    const modelId = room.id + '/wall-ac';
    const floorYaw = index === 0 ? 0 : Math.PI / 2;
    const {author:session, requests} = await open(document, overlay, models, storage);
    if (floorYaw) await session.apply([{type:'move',id:floorId,transform:{position:[0,0,0],yaw:floorYaw}}]);
    const unchanged = existingRoomState(session, room.id);
    assert(unchanged.workstations.length > 0 && unchanged.points.length > 0);
    const mounted = {position:[0,2.24,-room.bounds.depth / 2 + .1],yaw:0};
    const installation = {type:'add-facility',id:modelId,parentId:room.id,resource:ref,transform:mounted};
    await session.apply([installation]);
    assert(requests.includes(resource.asset.url), 'Fixture installation must fetch the real adapted GLB');
    assert.deepEqual(existingRoomState(session, room.id), unchanged, 'High wall installation changes workstation or floor navigation');
    const support = checkWallContact(session, room, modelId, floorYaw, mounted, resource.mounting);
    const defaults = inspectVisualState(session, modelId, resource.stateDefaults, angles);
    const evidence = {id,room:room.id,input,installation,floorYaw,support,defaults,states:[],
      unchangedWorkstationNodes:unchanged.workstations.length, unchangedFloorObstacles:unchanged.navigation.length,
      unchangedUsePoints:unchanged.points.length};
    report.rooms.push(evidence);
    rooms.push({id,document,room,modelId,session,unchanged,mounted,floorYaw,evidence});
  }

  for (const context of rooms) {
    const {id, room, modelId, session, unchanged, mounted, floorYaw, evidence} = context;
    stage = id + ' public state and other room isolation';
    const other = rooms.find(value => value !== context);
    const otherScene = other.session.scene.root;
    const otherBytes = await other.session.export();
    const set = async (patch, expected) => {
      await session.apply([{type:'set-state',id:modelId,state:patch}]);
      assert.deepEqual(session.document.nodes.find(node => node.id === modelId).state,expected);
      assert.deepEqual(existingRoomState(session, room.id), unchanged);
      assert.equal(other.session.scene.root, otherScene);
      assert.equal(await other.session.export(), otherBytes);
      const result = inspectVisualState(session, modelId, expected, angles);
      checkWallContact(session,room,modelId,floorYaw,mounted,resource.mounting);
      evidence.states.push(result);
      return result;
    };
    const modes = [];
    for (const mode of [1,2,3]) modes.push(await set(mode === 1 ? {on:true,mode} : {mode}, {on:true,mode}));
    assert.equal(new Set(modes.map(readout => readout.louverRotationX)).size, 3);
    assert.equal(new Set(modes.map(readout => readout.indicator.emissive)).size, 3);
    await set({on:false},{on:false,mode:3});
    await set({on:true},{on:true,mode:3});
    const savedMode = context === rooms[0] ? {on:false,mode:3} : {on:true,mode:2};
    await set(savedMode,savedMode);
    await session.save();
    context.savedMode = savedMode;
    context.saved = session.readSavedText(id);
    const entry = [...storage.items].find(([,value]) => value === context.saved);
    assert(entry, 'The public save must write actual serialized bytes');
    context.storageKey = entry[0];
    evidence.savedSha256 = sha256(context.saved);

    stage = id + ' failed changes preserve installed model and save';
    for (const patch of [{on:'false'},{mode:0},{mode:4},{mode:1.5},{mode:'2'}])
      await reject(session, {type:'set-state',id:modelId,state:patch}, 'invalid-device-state', modelId);
    const move = position => ({type:'move',id:modelId,transform:{...mounted,position}});
    await reject(session, move([0,2.24,mounted.position[2] + .03]), 'invalid-wall-fit', modelId);
    await reject(session, move([room.bounds.width / 2,2.24,mounted.position[2]]), 'invalid-wall-fit', modelId);
    await reject(session, move([0,2.76,mounted.position[2]]), 'invalid-wall-fit', modelId);
    await reject(session, move([0,2.10,mounted.position[2]]), 'wall-hvac-too-low', modelId);
    if (context === rooms[0]) {
      const replace = version => ({type:'replace-resource',id:modelId,resource:{...ref,version}});
      await reject(session,replace(2),'invalid-glb',modelId);
      await reject(session,replace(3),'wall-hvac-mount-gap',modelId);
      await reject(session,replace(4),'wall-hvac-outlet-occluded',modelId);
    }
    await fs.writeFile(outputFile(id + '-save.json'), context.saved, {flag:'wx'});
  }

  for (const value of active.splice(0)) {
    value.author.dispose();
    value.library.dispose();
  }
  const coldEntries = await Promise.all(rooms.map(async context => [
    context.storageKey, await fs.readFile(outputFile(context.id + '-save.json'), 'utf8'),
  ]));
  const coldStorage = createStorage(coldEntries);
  assert.equal(coldStorage.items.size, rooms.length);
  for (const context of rooms) {
    const {id,document,modelId,room,floorYaw,mounted,savedMode,saved} = context;
    stage = id + ' persisted byte cold read';
    const {author:session, requests} = await open(document, overlay, models, coldStorage);
    assert.equal(session.scene.root.getObjectByName(modelId), undefined);
    await session.restore(id);
    const decoded = await decodeCompanySave(saved, overlay, templates);
    assert.deepEqual(session.document, decoded);
    assert.equal(await session.export(), saved);
    assert.equal(session.readSavedText(id), saved);
    assert.equal(requests.filter(url => url === resource.asset.url).length, 1);
    report.restores.push({id,savedSha256:sha256(saved), visual:inspectVisualState(session,modelId,savedMode,angles),
      support:checkWallContact(session,room,modelId,floorYaw,mounted,resource.mounting)});
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = {stage,code:error.code,path:error.path,message:error.message,stack:error.stack};
  process.exitCode = 1;
} finally {
  for (const value of active) {
    value.author.dispose();
    value.library.dispose();
  }
  await fs.writeFile(outputFile('report.json'), JSON.stringify(report,null,2) + '\n', {flag:'wx'});
  console.log(JSON.stringify({status:report.status, rooms:report.rooms.length, rejections:report.rejections.length,
    restores:report.restores.length, output:outputFile('report.json'), error:report.error}));
}
