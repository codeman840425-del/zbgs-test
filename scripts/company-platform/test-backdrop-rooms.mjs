import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Box3, Group, Raycaster, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import rooms from './batch-inputs/backdrop-rooms.json' with {type:'json'};
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {appearanceCandidates, createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {createCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {createAuthoringRunDirectory,runCompanyBatch} from './batch.mjs';

const looks = appearanceCandidates(catalog, 'background-fabric');
const fixedIds = ['green','blue','print','sheer'].map(kind => 'backdrop-fabric-' + kind);
assert(fixedIds.every(id => looks.some(look => look.id === id && look.version === 1)));
assert.equal(new Set(looks.map(resource => resource.asset.sha256)).size, looks.length);
const ref = ({id,version}) => ({id,version});
const options = {catalog, templates};
for (const [index, look] of looks.entries()) {
  assert(compareFacilityFunction(looks[0],look).compatible);
  const sample = createAppearanceSample('background-fabric',index,catalog,templates);
  assert.deepEqual(sample.document.nodes.find(n => n.id === sample.target).resource,ref(look));
  inspectCompanyPlacement(sample.document,catalog,templates);
}
const wrongTravel = structuredClone(looks[0]);
wrongTravel.backdropRoll.travel += .4;
assert.equal(compareFacilityFunction(looks[0],wrongTravel).compatible,false);

installNodeImageDecodeShim();
const library = createCompanyAssetLibrary({fetchImpl:async url => {
  const bytes = await fs.readFile(new URL('../../prototype/public' + url,import.meta.url));
  return {ok:true,arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset + bytes.byteLength)};
}});
const savedItems = new Map();
const storage = {getItem:id => savedItems.get(id) ?? null, setItem:(id,text) => savedItems.set(id,text)};
const open = doc => createCompanyAuthoring(new Group(), doc, {...options,assetLibrary:library,storage});
const move = (id,x,z,yaw) => ({type:'move',id,transform:{position:[x,0,z],yaw}});

function obstacle(session, id) {
  const entry = session.scene.navigation().obstacles.find(obstacle => obstacle.instanceId === id);
  assert(entry && entry.object === session.scene.root.getObjectByName(id));
  assert.deepEqual(entry.footprint, {center:[0,0],halfSize:[1.05,.15],blocking:true});
  return {x:entry.x,z:entry.z,hw:entry.hw,hd:entry.hd};
}

function checkCameraLine(session, room, sheet, seat, deployment) {
  const camera = session.scene.root.getObjectByName(room+'/station-1/camera');
  const lens = camera.getObjectByName('camera-lens');
  const eye = new Box3().setFromObject(lens).getCenter(new Vector3());
  const axis = camera.getWorldDirection(new Vector3());
  const ray = new Raycaster(eye,axis,.01,5);
  const subject = new Vector3(...seat.position.world);
  subject.y = eye.y;
  assert(ray.ray.distanceToPoint(subject) < .01, 'Camera axis must pass through the seat in plan');
  const hit = sheet.visible && ray.intersectObject(sheet,false)[0];
  if (deployment === 0) {
    assert(!hit, 'Retracted cloth should clear the camera line');
  } else {
    assert(hit && hit.distance > eye.distanceTo(subject) + .5, 'Visible cloth must be behind the seat');
  }
}

async function rejected(session, op, code, expectedPath) {
  const before = session.document;
  const saved = session.readSavedText(before.id);
  await assert.rejects(session.apply([op]), error => {
    assert.equal(error.code,code);
    if (expectedPath) assert.equal(error.path,expectedPath);
    return true;
  });
  assert.deepEqual(session.document,before);
  assert.equal(session.readSavedText(before.id),saved);
}

const checkedRooms = [];
const scratch = await createAuthoringRunDirectory('backdrop');
try {
  const batch = await runCompanyBatch(rooms,{outputDirectory:scratch});
  assert(batch.ok,JSON.stringify(batch.results));
  for (const item of rooms.items) {
    const initial = JSON.parse(await fs.readFile(path.join(scratch,item.key,'layout.json'),'utf8'));
    const room = item.key+'/ground/live', id = room+'/backdrop';
    const original = initial.nodes.find(node => node.id === id);
    const session = await open(initial);
    let saved;
    try {
      const footprint = obstacle(session,id);
      const expectedWideAxis = item.input.scale === 'small-home' ? 'hd' : 'hw';
      assert(footprint[expectedWideAxis] > 1.05);
      for (const look of looks) {
        await session.apply([{type:'replace-resource',id,resource:ref(look)}]);
        const current = session.document.nodes.find(node => node.id === id);
        assert.deepEqual(current.transform,original.transform);
        assert.equal(current.parentId,room);
        for (const deployment of [0,.5,1]) {
          await session.apply([{type:'set-state',id,state:{deployment}}]);
          assert.deepEqual(obstacle(session,id),footprint);
          const placement = inspectCompanyPlacement(session.document,catalog,templates);
          assert(placement.checkedPortals.length && placement.checkedPortals.every(p => p.connected));
          const seat = placement.checkedPoints.find(p => p.facilityId === room+'/station-1/chair');
          assert(seat.approachConnected && seat.exitConnected);
          const sheet = session.scene.root.getObjectByName(id).getObjectByName('fabric-sheet');
          checkCameraLine(session,room,sheet,seat,deployment);
        }
      }
      await session.apply([{type:'set-state',id,state:{deployment:0}}]);
      await session.save();
      saved = session.readSavedText(item.key);
      await rejected(session,{type:'set-state',id,state:{deployment:1.2}},'invalid-device-state');
      await rejected(session,move(id,3.5,0,0),'invalid-floor-fit',id);
      if (item.input.scale === 'rental-home') {
        await rejected(session,move(id,1.95,0,-Math.PI/2),'blocked-portal',item.key+'/ground/portal-stream-living');
      }
      checkedRooms.push({room,looks:looks.map(ref),worldObstacle:footprint,checkedStates:[0,.5,1]});
    } finally { session.dispose(); }
    const reopened = await open(initial);
    try {
      await reopened.restore(item.key);
      const restored = reopened.document.nodes.find(node => node.id === id);
      assert.equal(restored.state.deployment,0);
      assert.deepEqual(restored.transform,original.transform);
      assert.deepEqual(restored.resource,ref(looks.at(-1)));
      assert.equal(await reopened.export(),saved);
    } finally { reopened.dispose(); }
  }

  // Isolate the seat's approach from desks and lights so its independent clearance is exercised.
  const empty = createCompany({id:'backdrop-seat-check',width:6,depth:6},catalog);
  const region = empty.nodes[1].id;
  const add = (id,resource,x,z,yaw) => ({
    type:'add-facility',id,parentId:region,resource,transform:{position:[x,0,z],yaw},
  });
  const initial = prepareCompanyChange(empty,[
    add('seat',{id:'chair-ladder',version:1},0,0,0),
    add('backdrop',ref(looks[0]),-2.4,0,Math.PI/2),
  ],options).document;
  const session = await open(initial);
  try {
    const seat = inspectCompanyPlacement(initial,catalog,templates).checkedPoints.find(p => p.facilityId === 'seat');
    const [x,,z] = seat.approach.local;
    for (const deployment of [0,1]) {
      await session.apply([{type:'set-state',id:'backdrop',state:{deployment}}]);
      await session.save();
      await rejected(session,move('backdrop',x,z,0),'blocked-use-space',seat.id+'.approach');
    }
  } finally { session.dispose(); }
} finally {
  library.dispose();
  const resolved = await fs.realpath(scratch);
  assert.equal(resolved,path.resolve(scratch));
  assert.equal(path.basename(path.dirname(resolved)),'backdrop');
  assert(path.basename(resolved).startsWith('run-'));
  await fs.rm(resolved,{recursive:true});
}
console.log(JSON.stringify({status:'passed',rooms:checkedRooms,seatApproachProtectedAt:[0,1]},null,2));
