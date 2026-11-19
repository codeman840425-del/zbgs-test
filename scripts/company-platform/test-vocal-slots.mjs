import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {runCompanyBatch} from './batch.mjs';
import {checkSingingRooms} from './check-singing-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const [directory,...extra]=process.argv.slice(2);
if(!directory || extra.length) throw Error('Usage: node scripts/company-platform/test-vocal-slots.mjs NEW_OUTPUT');
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=fileURLToPath(new URL('./batch-inputs/vocal-use-rooms.json',import.meta.url));
const out=path.resolve(directory), published=path.join(out,'published'), movedOut=path.join(out,'moved');
const options={catalog,templates,root};
const studio='singing-studio', rental='singing-rental', keys=[studio,rental];
const pickup='singing-mic-pickup';
const files=['input.json','layout.json','save.json','report.json'];
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=async (name,value)=>{
  const filename=path.join(out,name);
  await fs.writeFile(filename,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  return filename;
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ruleOf=document=>document.singingRooms[0];
const nodeOf=(document,id)=>document.nodes.find(node=>node.id===id);
const batchFor=(key,document,operations=[])=>({schema:'company-batch',version:1,items:[{key,document,operations}]});
const move=(id,position,yaw)=>({type:'move',id,transform:{position,yaw}});
const rounded=vector=>vector.map(value=>Number(value.toFixed(7)) || 0);

function transformed([x,y,z],{position:[px,py,pz],yaw}) {
  const sine=Math.sin(yaw), cosine=Math.cos(yaw);
  return [px+cosine*x+sine*z,py+y,pz-sine*x+cosine*z];
}

function assertVector(actual,expected,label) {
  assert.deepEqual(rounded(actual),rounded(expected),label);
}

async function pins(directory,rooms) {
  const hashes={};
  for(const key of rooms) for(const file of files) {
    const relative=key+'/'+file;
    hashes[relative]=sha256(await fs.readFile(path.join(directory,relative)));
  }
  return hashes;
}

async function coldRoom(directory,key) {
  const folder=path.join(directory,key);
  const bytes=await fs.readFile(path.join(folder,'save.json'),'utf8');
  const doc=await decodeCompanySave(bytes,catalog,templates);
  assert.deepEqual(doc,await readJson(path.join(folder,'layout.json')));
  const published=await readJson(path.join(folder,'report.json'));
  const measured=await checkSingingRooms(doc,options);
  assert.deepEqual(measured,published.checks.singingRooms);
  const mic=nodeOf(doc,ruleOf(doc).roles.mic).resource;
  const asset=published.assetDependencies.find(row=>row.id===mic.id&&row.version===mic.version);
  assert(asset,pickup);
  assert.equal(sha256(await fs.readFile(path.join(root,asset.path))),asset.sha256);
  return {doc,measured:measured[0],sha256:sha256(bytes),asset};
}

async function withScene(document,floorId,visit,extraResources=[]) {
  const derived=deriveCompany(document,catalog,templates);
  const resources=[...derived.facilities,...derived.surfaceFinishes].map(item=>item.resource)
    .concat(extraResources.map(ref=>catalog.resources.find(resource=>resource.id===ref.id&&resource.version===ref.version)));
  let result;
  await preflightLibraryAssets({root,resources,validate:async assetLibrary=>{
    const scene=createCompanyScene(new THREE.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary,mirrorPreflight:()=>{}});
    try {result=await visit(scene);}
    finally {scene.dispose();}
  }});
  return result;
}

function observeSlot(scene,document,measured) {
  const rule=ruleOf(document), mic=nodeOf(document,rule.roles.mic), id=mic.id+'#vocal';
  const floor=nodeOf(document,measured.floorId), room=nodeOf(document,rule.regionId);
  const toWorld=vector=>transformed(transformed(transformed(vector,mic.transform),room.transform),floor.transform);
  const yaw=floor.transform.yaw+room.transform.yaw+mic.transform.yaw;
  const spec=rule.performer;
  assert.equal(spec.coordinateSpace,'facility');
  assert.equal(spec.slotId,'vocal');
  assert.equal(spec.yaw,Math.PI);
  assert.deepEqual(spec.position,[0,0,.77]);
  assert.deepEqual(spec.approach,[0,0,1.12]);
  assert.deepEqual(spec.exit,[0,0,1.12]);
  const descriptor=scene.describeUsePoint(id);
  assert(descriptor,id);
  assert.equal(descriptor.kind,'standing-vocal');
  assert.equal(descriptor.slotId,'vocal');
  assert.equal(descriptor.id,id);
  assert.equal(descriptor.facilityId,mic.id);
  assert.equal(descriptor.roomId,room.id);
  assert.equal(descriptor.floorId,floor.id);
  assert.equal(descriptor.companyId,document.id);
  assert.equal(descriptor.revision,document.revision);
  assert.equal(descriptor.capacity,1);
  assert.deepEqual(descriptor.clearance,{width:.50,depth:.50,height:1.90});
  assert.deepEqual(descriptor.resource,mic.resource);
  assert(!Object.hasOwn(descriptor,'seatHeight'));
  assert.deepEqual(descriptor.contact,{pickupNodeId:pickup});
  assert.deepEqual(descriptor.performerReferences,{coordinateSpace:'use-point',mouth:spec.mouth,eye:spec.eye});
  assert.deepEqual(descriptor.transformChain,[floor,room,mic].map(({id,parentId,transform})=>({id,parentId,transform})));
  const viaChain=descriptor.transformChain.reduceRight((point,link)=>transformed(point,link.transform),spec.position);
  assertVector(viaChain,descriptor.transform.position,'independent transformChain multiplication');
  assert.deepEqual(descriptor.missingFields,[]);
  const {coordinateSpace,position,approach,exit}=spec;
  assert.deepEqual(descriptor.local,{coordinateSpace,position,yaw:spec.yaw,approach,exit});
  assertVector(descriptor.transform.position,toWorld(position),'standing target');
  assertVector(descriptor.approachPosition,toWorld(approach),'approach target');
  assertVector(descriptor.exitPosition,toWorld(exit),'exit target');
  assertVector(descriptor.facilityTransform.position,toWorld([0,0,0]),'microphone origin');
  assertVector([descriptor.transform.yaw,descriptor.facilityTransform.yaw],[yaw+spec.yaw,yaw],'inherited yaw');
  assert.deepEqual(scene.describeUsePoints({floorId:floor.id}).filter(point=>point.kind==='standing-vocal'),[descriptor]);
  assert.deepEqual(measured.usePoint,descriptor);
  for(const [route,local] of [[measured.access,position],[measured.approach,approach],[measured.exit,exit]]) {
    assert.equal(route.portalId,rule.portalId);
    const [x,,z]=transformed(local,mic.transform);
    assertVector(route.inside.at(-1),[x,z],'physical route ends at the declared target');
  }
  const {anchor,pickupMesh}=scene.resolveUsePoint(id);
  assert(anchor?.isObject3D);
  assert(pickupMesh?.isMesh);
  assert.equal(pickupMesh.name,pickup);
  assert(pickupMesh.geometry.getAttribute('position').count>=3);
  assertVector(anchor.getWorldPosition(new THREE.Vector3()).toArray(),toWorld(position),'actual anchor');
  const mouth=toWorld(transformed(spec.mouth,{position,yaw:spec.yaw}));
  const surface=transformed(transformed(measured.microphone.surface,room.transform),floor.transform);
  const direction=new THREE.Vector3().fromArray(surface).sub(new THREE.Vector3().fromArray(mouth)).normalize();
  const hit=new THREE.Raycaster(new THREE.Vector3().fromArray(mouth),direction,0,.30).intersectObject(pickupMesh,false)[0];
  assert.equal(hit?.object,pickupMesh,'mouth ray must hit the real pickup geometry');
  assert(hit.point.distanceTo(new THREE.Vector3().fromArray(surface))<1e-6,'pickup surface');
  return {descriptor,pickup:{node:pickup,worldHit:rounded(hit.point.toArray()),mouthDistance:hit.distance}};
}

function publicBatch(input,output,only,expectedExit) {
  const script=fileURLToPath(new URL('./batch.mjs',import.meta.url));
  const command=spawnSync(process.execPath,[script,input,output,'--only',only],{encoding:'utf8',windowsHide:true});
  if(command.error) throw command.error;
  assert.equal(command.status,expectedExit,command.stderr+command.stdout);
  return JSON.parse(command.stdout);
}

const source=await readJson(fixture);
assert.deepEqual(source.items.map(item=>item.key).sort(),[...keys].sort());
await fs.mkdir(out);
const receipt=await runCompanyBatch(source,{outputDirectory:published});
await writeJson('batch-result.json',receipt);
assert(receipt.ok,JSON.stringify(receipt));
assert(receipt.results.every(row=>row.status==='created'));
const publishedPins=await pins(published,keys);
const loaded=new Map();
const rooms=[];
for(const key of keys) {
  const room=await coldRoom(published,key);
  loaded.set(key,room);
  const point=await withScene(room.doc,room.measured.floorId,scene=>observeSlot(scene,room.doc,room.measured));
  rooms.push({key,saveSha256:room.sha256,micAsset:room.asset,...point});
}
assert.notEqual(rooms[0].descriptor.id,rooms[1].descriptor.id);

const base=loaded.get(studio);
const studioRule=ruleOf(base.doc), micId=studioRule.roles.mic;
const stageOps=base.doc.nodes.filter(node=>node.kind==='facility'&&node.parentId===studioRule.regionId)
  .map(({id,transform:{position:[x,y,z],yaw}})=>move(id,[z+.05,y,-x+.05],yaw+Math.PI/2));
assert.deepEqual(stageOps.find(op=>op.id===micId).transform,{position:[.05,0,.05],yaw:Math.PI/2});
const basePoint=rooms[0].descriptor;
const busy={isUsePointBusy:id=>id===basePoint.id};
const floorOp=move(base.measured.floorId,[3.125,0,-6.25],Math.PI/2);
const panelOp={type:'add-facility',id:studioRule.regionId+'/approach-obstruction',parentId:studioRule.regionId,
  resource:{id:'background-grid-panel',version:1},transform:{position:[0,0,1.25],yaw:0}};
const preserved=await withScene(base.doc,base.measured.floorId,scene=>{
  const before=scene.save(), mesh=scene.resolveUsePoint(basePoint.id).pickupMesh;
  const expected={code:'facility-busy',path:micId};
  assert.throws(()=>scene.prepareChange(stageOps,busy),expected);
  assert.throws(()=>scene.prepareChange([floorOp],busy),expected);
  const candidate=scene.prepareChange(stageOps);
  try {assert.throws(()=>scene.commit(candidate,busy),expected);}
  finally {scene.discard(candidate);}
  assert.throws(()=>scene.prepareChange([panelOp]),error=>error.code==='vocal-use-path-blocked'&&
    error.path===basePoint.id&&error.details?.blockedBy===panelOp.id);
  assert.equal(scene.save(),before);
  assert.deepEqual(scene.describeUsePoint(basePoint.id),basePoint);
  assert.equal(scene.resolveUsePoint(basePoint.id).pickupMesh,mesh);
  scene.commit(scene.prepareChange(stageOps));
  const idleMoved=scene.describeUsePoint(basePoint.id);
  assert.notEqual(scene.resolveUsePoint(basePoint.id).pickupMesh,mesh);
  return {rejectedAt:['direct-prepare','ancestor-prepare','commit-after-prepare'],code:expected.code,id:basePoint.id,idleMoved,
    sceneCollision:{code:'vocal-use-path-blocked',blockedBy:panelOp.id}};
},[panelOp.resource]);

const moveInput=await writeJson('moved-input.json',batchFor(studio,base.doc,stageOps));
const moveReceipt=publicBatch(moveInput,movedOut,studio,0);
await writeJson('moved-batch-result.json',moveReceipt);
assert.deepEqual(moveReceipt.results.map(row=>row.status),['created']);
const moved=await coldRoom(movedOut,studio);
assert.equal(moved.doc.revision,base.doc.revision+1);
assert.deepEqual(ruleOf(moved.doc),ruleOf(base.doc));
assert.deepEqual(nodeOf(moved.doc,ruleOf(moved.doc).roles.camera),nodeOf(base.doc,ruleOf(base.doc).roles.camera));
const after=await withScene(moved.doc,moved.measured.floorId,scene=>observeSlot(scene,moved.doc,moved.measured));
assert.equal(after.descriptor.id,basePoint.id);
assert.deepEqual(after.descriptor.local,basePoint.local);
assert.notDeepEqual(after.descriptor.transform,basePoint.transform);
assert.deepEqual(after.descriptor,preserved.idleMoved);
assertVector(after.descriptor.transform.position,[.82,0,.05],'same moved microphone, resolved against its new pose');
assert(Math.abs(after.pickup.mouthDistance-rooms[0].pickup.mouthDistance)<1e-6);

const inheritedResult=await runCompanyBatch(batchFor(rental,loaded.get(rental).doc,[
  {...floorOp,id:loaded.get(rental).measured.floorId},
]),{outputDirectory:path.join(out,'floor-turn')});
assert(inheritedResult.ok,JSON.stringify(inheritedResult));
const inherited=await coldRoom(path.join(out,'floor-turn'),rental);
const inheritedPoint=await withScene(inherited.doc,inherited.measured.floorId,
  scene=>observeSlot(scene,inherited.doc,inherited.measured));
assert.equal(inheritedPoint.descriptor.id,rooms[1].descriptor.id);
assert.deepEqual(inheritedPoint.descriptor.local,rooms[1].descriptor.local);
assertVector(inheritedPoint.descriptor.transform.position,transformed(rooms[1].descriptor.transform.position,floorOp.transform),'inherited floor transform');
assert(Math.abs(inheritedPoint.pickup.mouthDistance-rooms[1].pickup.mouthDistance)<1e-6);

const negativeCases=[];
async function reject(name,input,output,code,errorPath) {
  const source=await writeJson(name+'.json',input);
  const before=await pins(output,output===published?keys:[studio]);
  const failure=publicBatch(source,output,studio,1);
  await writeJson(name+'-result.json',failure);
  const [row]=failure.results;
  assert.equal(row.status,'failed',name);
  assert.equal(row.code,code,JSON.stringify(row));
  if(errorPath) assert.equal(row.path,errorPath,JSON.stringify(row));
  assert.deepEqual(await pins(output,output===published?keys:[studio]),before);
  assert.deepEqual((await fs.readdir(output)).sort(),output===published?[...keys].sort():[studio]);
  negativeCases.push({name,...row,preservedFiles:Object.keys(before).length});
  return row;
}

await reject('direct-footprint-collision',batchFor(studio,base.doc,[stageOps.find(op=>op.id===micId)]),published,'overlapping-facilities',micId);
const blockedApproach=await reject('actual-panel-blocks-approach-and-exit',batchFor(studio,base.doc,[panelOp]),
  published,'vocal-use-path-blocked',basePoint.id);
assert.equal(blockedApproach.details.blockedBy,panelOp.id);
const stale=structuredClone(moved.doc);
const oldLocal=ruleOf(stale).performer;
// Express the previous world stance in the moved microphone frame. A consumer
// must resolve the current slot instead of carrying these world coordinates.
oldLocal.position=[-.72,0,-.05];
oldLocal.yaw=Math.PI/2;
const staleResult=await reject('stale-standing-position',batchFor(studio,stale),movedOut,'vocal-use-path-blocked',basePoint.id);
assert.deepEqual(staleResult.details,{segment:'approach',blockedBy:micId});

const legacySource=await readJson(fileURLToPath(new URL('./batch-inputs/singing-rooms.json',import.meta.url)));
const legacyOut=path.join(out,'legacy');
const legacyReceipt=await runCompanyBatch(legacySource,{only:rental,outputDirectory:legacyOut});
assert(legacyReceipt.ok,JSON.stringify(legacyReceipt));
const legacy=await coldRoom(legacyOut,rental);
const legacySeat=deriveCompany(legacy.doc,catalog,templates).usePoints.find(point=>point.seatHeight>0);
assert(legacySeat,'Expected the rental workroom’s real chair');
const offscreen=structuredClone(loaded.get(rental).doc);
const otherFloor=rental+'/upper', otherRoom=otherFloor+'/rest';
offscreen.scale='building';
delete offscreen.spaceProfile;
offscreen.nodes.push(
  {id:otherFloor,kind:'floor',parentId:rental,transform:{position:[0,0,0],yaw:0},connections:[]},
  {id:otherRoom,kind:'room',purpose:'rest',parentId:otherFloor,bounds:{width:4,depth:4},transform:{position:[0,0,0],yaw:0}},
);
const coldOffscreen=await decodeCompanySave(await encodeCompanySave(offscreen,catalog,templates),catalog,templates);
const hidden=await withScene(coldOffscreen,otherFloor,async scene=>{
  const seat=scene.describeUsePoint(legacySeat.id), vocal=scene.describeUsePoint(rooms[1].descriptor.id);
  assert.deepEqual(vocal,rooms[1].descriptor);
  assert.equal(scene.resolveUsePoint(vocal.id),null);
  assert.equal(scene.resolveUsePoint(seat.id),null);
  assert(seat.seatHeight>0);
  assert(seat.contact.seatNodeId && seat.contact.backNodeId);
  assert(!Object.hasOwn(seat,'slotId'));
  await assert.rejects(scene.retainUsePointContact(vocal.id),{code:'unsupported-seat-contact',path:vocal.id});
  const retained=await scene.retainUsePointContact(seat.id);
  try {
    assert(retained.seat?.isMesh);
    assert(retained.back?.isMesh);
  } finally {scene.releaseUsePointContact(retained);}
  scene.setView({mode:'floor',floorId:seat.floorId});
  assert(scene.resolveUsePoint(seat.id).chairSeat?.isMesh);
  assert.deepEqual(scene.describeUsePoint(seat.id),seat);
  assert.deepEqual(scene.describeUsePoint(vocal.id),vocal);
  return {visibleFloorInitially:otherFloor,seat,vocal};
});
const legacyControl=await withScene(legacy.doc,legacy.measured.floorId,scene=>{
  assert.equal(scene.describeUsePoint(rooms[1].descriptor.id),null);
  assert.equal(scene.resolveUsePoint(rooms[1].descriptor.id),null);
  assert.deepEqual(scene.describeUsePoint(legacySeat.id),hidden.seat);
  assert(scene.resolveUsePoint(legacySeat.id).chairBack?.isMesh);
  return {saveSha256:legacy.sha256,seat:legacySeat.id,noImplicitVocalSlot:true};
});

assert.deepEqual(await pins(published,keys),publishedPins);
const report=await writeJson('report.json',{status:'passed',rooms,publishedPins,busy:preserved,negativeCases,
  moved:{saveSha256:moved.sha256,...after},inherited:{saveSha256:inherited.sha256,...inheritedPoint},hidden,legacy:legacyControl});
console.log(JSON.stringify({status:'passed',report,published,moved:movedOut,negativeCases:negativeCases.map(row=>row.code)}));
