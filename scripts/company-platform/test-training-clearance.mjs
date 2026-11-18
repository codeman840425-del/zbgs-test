import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import batch from './batch-inputs/dance-training-rooms.json' with {type:'json'};
import {createCompany,pointInTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {checkTrainingClearance} from './check-training-clearance.mjs';

function sample(item) {
  const base = createCompanyScaleV2(item.input,catalog,templates);
  const {document} = prepareCompanyChange(base,item.operations,{catalog,templates});
  return {document,constraint:item.trainingClearance};
}

function rotateFloorLayout(document, floorId) {
  const rotated = structuredClone(document);
  const turn = {position:[3,0,-4],yaw:Math.PI/2};
  for (const node of rotated.nodes.filter(item => item.parentId === floorId)) {
    node.transform.position = pointInTransform(turn,node.transform.position);
    node.transform.yaw += turn.yaw;
  }
  return rotated;
}

async function assertMeshBlock(document,constraint,componentId,region,options) {
  await assert.rejects(() => checkTrainingClearance(document,constraint,options), error => {
    assert.equal(error.code,'training-clearance-obstructed');
    const failure = error.details.failures.find(item => item.componentId === componentId && item.region === region);
    assert.equal(failure?.kind,'mesh-surface');
    assert(failure.part);
    return true;
  });
}

const [rental,upperFloor] = batch.items.map(sample);
const {document,constraint} = rental;
const room = document.nodes.find(node => node.id === constraint.roomId);
const backgroundId = `${room.id}/background`;
const floorId = room.parentId;

for (const [index,value] of [rental,upperFloor].entries()) {
  const before = JSON.stringify(value);
  const result = await checkTrainingClearance(value.document,value.constraint);
  assert.equal(result.ok,true);
  assert.equal(result.floorId,value.document.nodes.find(node => node.id === value.constraint.roomId).parentId);
  assert.equal(result.portal.edge,['west','south'][index]);
  assert(result.checkedMeshes > 0);
  assert.equal(JSON.stringify(value),before);
}

const rotated = rotateFloorLayout(document,floorId);
assert.equal(rotated.nodes.find(node => node.id === room.id).transform.yaw,Math.PI/2);
assert.deepEqual((await checkTrainingClearance(rotated,constraint)).portal.center,[-2.25,0,0]);

for (const [region,transform] of [
  ['activity',{position:[0,0,0],yaw:0}],
  ['entry',{position:[-1.8,0,0],yaw:Math.PI/2}],
]) {
  for (const original of [document,rotated]) {
    const blocked = structuredClone(original);
    const background = blocked.nodes.find(node => node.id === backgroundId);
    background.transform = transform;
    assert.equal(catalog.resources.find(resource => resource.id === background.resource.id).footprint.blocking,false);
    inspectCompanyPlacement(blocked,catalog,templates);
    await assertMeshBlock(blocked,constraint,backgroundId,region);
  }
}

for (const [code,adjust] of [
  ['training-clearance-portal-missing',value => {value.entry.portalId = `${floorId}/made-up-opening`;}],
  ['training-clearance-portal-missing',value => {value.entry.portalId = `${floorId}/portal-stream-living`;}],
  ['training-clearance-portal-fit',value => {value.entry.minX += .1;}],
  ['training-clearance-portal-fit',value => {value.entry.maxZ = .8;}],
  ['training-clearance-disconnected',value => {value.entry.maxX = -1.5;}],
  ['training-clearance-outside-room',value => {value.activity.maxX = 2.35;}],
  ['training-clearance-outside-room',value => {value.activity.clearHeight = 2.9;}],
]) {
  const invalid = structuredClone(constraint);
  adjust(invalid);
  await assert.rejects(() => checkTrainingClearance(document,invalid),{code});
}

const wall = structuredClone(constraint);
wall.activity.minZ = -2;
await assert.rejects(() => checkTrainingClearance(document,wall), error => {
  assert.equal(error.code,'training-clearance-obstructed');
  assert(error.details.failures.some(failure => failure.kind === 'structural-wall' && failure.region === 'activity'));
  return true;
});

const edgeOnly = structuredClone(constraint);
edgeOnly.entry.maxX = edgeOnly.activity.minX;
assert.equal((await checkTrainingClearance(document,edgeOnly)).ok,true);

const overhead = structuredClone(document);
const baffleId = `${room.id}/clearance-test-baffle`;
overhead.nodes.push({kind:'facility',id:baffleId,parentId:room.id,resource:{id:'ceiling-acoustic-cloud',version:1},
  transform:{position:[0,2.8,0],yaw:0}});
assert.equal((await checkTrainingClearance(overhead,constraint)).ok,true);
await assertMeshBlock(overhead,{...constraint,activity:{...constraint.activity,clearHeight:2.76}},baffleId,'activity');

const exteriorLayout = createCompany({id:'clearance-exterior-fixture',width:6,depth:6},catalog);
const exteriorFloor = exteriorLayout.nodes.find(node => node.kind === 'floor');
const exteriorRoom = exteriorLayout.nodes.find(node => node.kind === 'room');
const exteriorId = `${exteriorFloor.id}/entrance`;
const exteriorConstraint = {roomId:exteriorRoom.id,activity:{minX:-1,maxX:1,minZ:-1,maxZ:1,clearHeight:2.2},
  entry:{portalId:exteriorId,minX:-.5,maxX:.5,minZ:.9,maxZ:3,clearHeight:2.2}};
await assert.rejects(() => checkTrainingClearance(exteriorLayout,exteriorConstraint),{code:'training-clearance-portal-missing'});
exteriorFloor.exteriorEntrances = [{id:exteriorId,regionId:exteriorRoom.id,edge:'south',offset:0,width:1.4,height:2.2}];
const leaf = {kind:'facility',id:`${exteriorRoom.id}/leaf`,parentId:exteriorRoom.id,resource:{id:'exterior-door-leaf-plain',version:1},
  transform:{position:[0,0,2.9],yaw:Math.PI},state:{openFraction:0}};
exteriorLayout.nodes.push(leaf);
await assertMeshBlock(exteriorLayout,exteriorConstraint,leaf.id,'entry');
leaf.state.openFraction = 1;
assert.equal((await checkTrainingClearance(exteriorLayout,exteriorConstraint)).portal.kind,'exterior');
await assert.rejects(() => checkTrainingClearance(exteriorLayout,
  {...exteriorConstraint,entry:{...exteriorConstraint.entry,clearHeight:2.25}}),{code:'training-clearance-portal-fit'});

// The plane's broad-phase bounds overlap the activity rectangle. The actual plane initially misses it.
const planeCatalog = structuredClone(catalog);
const planeResource = {id:'clearance-test-plane',version:1,node:{id:'plane-face',type:'mesh',
  geometry:{type:'PlaneGeometry',parameters:[1.36,1.8]}, material:{color:'#ffffff'},
  position:[0,1,0],rotation:[0,Math.PI/4,0],scale:[1,1,1]}};
planeCatalog.resources.push(planeResource);
const planeLayout = structuredClone(document);
const fixtureId = `${room.id}/clearance-test-plane`;
const plane = {kind:'facility',id:fixtureId,parentId:room.id,resource:{id:planeResource.id,version:1},
  transform:{position:[1.37,0,1.5],yaw:0}};
planeLayout.nodes.push(plane);
assert.equal((await checkTrainingClearance(planeLayout,constraint,{catalog:planeCatalog})).ok,true);
plane.transform.position = [0,0,0];
await assertMeshBlock(planeLayout,constraint,fixtureId,'activity',{catalog:planeCatalog});
plane.transform.position = [edgeOnly.entry.maxX,0,0];
planeResource.node.rotation[1] = Math.PI/2;
await assertMeshBlock(planeLayout,edgeOnly,fixtureId,'entry',{catalog:planeCatalog});
plane.transform.position = [2.6,0,0];
await assert.rejects(() => checkTrainingClearance(planeLayout,constraint,{catalog:planeCatalog}),{code:'visual-outside-room',path:fixtureId});

const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'company-training-clearance-'));
try {
  const checker = fileURLToPath(new URL('./check-training-clearance.mjs',import.meta.url));
  const layoutPath = path.join(temporary,'layout.json');
  const constraintPath = path.join(temporary,'constraint.json');
  const bytes = JSON.stringify(document);
  await fs.writeFile(layoutPath,bytes);
  await fs.writeFile(constraintPath,JSON.stringify(constraint));
  const run = () => promisify(execFile)(process.execPath,[checker,layoutPath,constraintPath],{cwd:temporary});
  assert.equal(JSON.parse((await run()).stdout).ok,true);
  await fs.writeFile(constraintPath,JSON.stringify({...constraint,entry:{...constraint.entry,portalId:'made-up'}}));
  await assert.rejects(run,error => {
    assert.equal(error.code,1);
    assert.equal(JSON.parse(error.stdout).code,'training-clearance-portal-missing');
    return true;
  });
  assert.equal(await fs.readFile(layoutPath,'utf8'),bytes);
} finally {
  await fs.rm(temporary,{recursive:true,force:true});
}

console.log('Training clearance passed for two real layouts, transformed rooms, physical obstructions, portal fit, planes, and the read-only CLI.');
