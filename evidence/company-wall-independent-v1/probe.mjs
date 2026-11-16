import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalogSource from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany,serializeCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';

const checks=[];
const failures=[];
const root=new URL('../../',import.meta.url);
const digest=async path=>createHash('sha256').update(await fs.readFile(new URL(path,root))).digest('hex');
const clone=value=>structuredClone(value);
function customWallResource(id='qa-wall-decor'){
  return {
    id,version:1,category:'decor',mountRole:'wall-decor',mount:'wall',
    coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Wall centre; back plane z=0; +Z inward'},
    mounting:{width:.4,height:.4,depth:.05,origin:'center'},usePoints:[],stateDefaults:{},
    materialSlots:{finish:['qa-wall-mesh']},
    node:{id:'qa-wall-root',type:'mesh',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],geometry:{type:'BoxGeometry',parameters:[.4,.4,.05]},material:{color:'#9e7860',roughness:.8},castShadow:false,receiveShadow:true}
  };
}
function twoRoomDocument(catalog){
  const document=createCompany({id:'wall-probe',width:9,depth:7},catalog);
  document.scale='rental-home';
  document.nodes[0].connections=[{id:'wall-probe/portal',from:{regionId:'wall-probe/room-1',edge:'east',offset:0,width:1.4},to:{regionId:'wall-probe/room-2',edge:'west',offset:0,width:1.4}}];
  document.nodes[1].transform={position:[-1.5,0,0],yaw:0};
  document.nodes[1].bounds={width:3,depth:7};
  document.nodes.push({id:'wall-probe/room-2',kind:'room',parentId:'wall-probe/floor-1',name:'第二房间',purpose:'streaming',bounds:{width:3,depth:7},transform:{position:[1.5,0,0],yaw:0}});
  document.nodes.push({id:'wall-probe/chair',kind:'facility',parentId:'wall-probe/room-1',resource:{id:'chair',version:1},transform:{position:[0,0,0],yaw:0},state:{}});
  document.nodes.push({id:'wall-probe/wall-outside',kind:'facility',parentId:'wall-probe/room-1',resource:{id:'qa-wall-decor',version:1},transform:{position:[0,1.4,-3.4],yaw:0},state:{}});
  document.nodes.push({id:'wall-probe/wall-shared',kind:'facility',parentId:'wall-probe/room-1',resource:{id:'qa-wall-decor',version:1},transform:{position:[1.4,1.4,1],yaw:3*Math.PI/2},state:{}});
  return document;
}
function navigationShape(scene){return scene.navigation().obstacles.map(({object,...rest})=>rest);}
function wallRows(scene){return scene.wallPresentation().walls;}
function run(name,fn){return Promise.resolve().then(fn).then(observed=>{checks.push({name,status:'passed',observed});return observed;}).catch(error=>{const info={code:error?.code,path:error?.path,message:error?.message||String(error)};failures.push({name,error:info});checks.push({name,status:'failed',error:info});return null;});}
async function expectReject(name,fn,code){try{await fn();failures.push({name,error:{expectedCode:code,actual:'accepted'}});checks.push({name,status:'failed',expectedCode:code,actual:'accepted'});}catch(error){if(error?.code!==code){failures.push({name,error:{expectedCode:code,actual:error?.code,message:error?.message}});checks.push({name,status:'failed',expectedCode:code,actual:error?.code});}else checks.push({name,status:'rejected',code,message:error.message});}}

const catalog=clone(catalogSource);catalog.resources.push(customWallResource());
const document=twoRoomDocument(catalog),world=new THREE.Group();
const scene=createCompanyScene(world,document,{catalog,templates,maxRealtimeLights:2});
const floorId='wall-probe/floor-1',roomId='wall-probe/room-1',chairId='wall-probe/chair#seat';

await run('Normal high walls and shared wall duplicate faces remain physical and grouped',()=>{
  const rows=wallRows(scene),shared=rows.filter(row=>row.edge==='east'||row.edge==='west');
  assert(rows.length>0);assert(rows.every(row=>row.height===2.8));
  const sharedMounted=shared.filter(row=>row.mounted.some(item=>item.id==='wall-probe/wall-shared'));
  assert.equal(sharedMounted.length,2,'Both duplicate shared-wall faces should expose the same mounted group');
  assert.equal(new Set(sharedMounted.flatMap(row=>row.mounted.map(item=>item.id))).size,1);
  return {walls:rows.length,sharedFaces:shared.length,sharedMounted:sharedMounted.length,height:[...new Set(rows.map(row=>row.height))]};
});

const beforeWall={document:JSON.stringify(scene.document),navigation:JSON.stringify(navigationShape(scene)),points:JSON.stringify(scene.describeUsePoints()),view:scene.view};
await run('Full wall view keeps document, navigation and use points unchanged',()=>{
  const presentation=scene.setWallView({mode:'full',cameraPosition:[0,2,5]});
  assert.equal(JSON.stringify(scene.document),beforeWall.document);assert.equal(JSON.stringify(navigationShape(scene)),beforeWall.navigation);assert.equal(JSON.stringify(scene.describeUsePoints()),beforeWall.points);
  assert(presentation.walls.every(row=>row.height===2.8));
  return {mode:presentation.mode,effectiveMode:presentation.effectiveMode,visible:presentation.walls.filter(row=>row.visible).length};
});

await run('Cutaway hides only the camera-occluding wall groups and preserves full wall height',()=>{
  const beforeDocument=JSON.stringify(scene.document),beforeNavigation=JSON.stringify(navigationShape(scene));
  const presentation=scene.setWallView({mode:'cutaway',cameraPosition:[-1.5,2,5]});
  const hidden=presentation.walls.filter(row=>!row.visible),visible=presentation.walls.filter(row=>row.visible);
  assert(hidden.length>0);assert(presentation.effectiveMode==='cutaway');assert(presentation.walls.every(row=>row.height===2.8));
  assert.equal(JSON.stringify(scene.document),beforeDocument);assert.equal(JSON.stringify(navigationShape(scene)),beforeNavigation);
  return {hidden:hidden.map(row=>row.id),visibleCount:visible.length,effectiveMode:presentation.effectiveMode,wallHeights:[...new Set(presentation.walls.map(row=>row.height))]};
});

await expectReject('Reject nonfinite wall-view camera',()=>scene.setWallView({mode:'cutaway',cameraPosition:[NaN,2,5]}),'invalid-wall-camera');
await run('Cutaway with no camera falls back to full presentation without document mutation',()=>{
  const fresh=createCompanyScene(new THREE.Group(),document,{catalog,templates,maxRealtimeLights:2});
  const before=JSON.stringify(fresh.document),presentation=fresh.setWallView({mode:'cutaway'});
  assert.equal(presentation.effectiveMode,'full');assert.equal(JSON.stringify(fresh.document),before);fresh.dispose();
  return {effectiveMode:presentation.effectiveMode,targets:presentation.targets.length};
});

const contact=await scene.retainUsePointContact(chairId);
await run('Contact handle survives wall-view changes and unrelated candidate commit',()=>{
  const beforeContact=contact.source;
  scene.setWallView({mode:'cutaway',cameraPosition:[-1.5,2,5]});
  const handleSeat=contact.seat.name,handleBack=contact.back.name;
  const candidate=scene.prepareChange([{type:'add-facility',id:'wall-probe/wall-candidate',parentId:roomId,resource:{id:'qa-wall-decor',version:1},transform:{position:[0,1.4,3.4],yaw:Math.PI},state:{}}]);
  scene.commit(candidate);
  assert.equal(contact.seat.name,handleSeat);assert.equal(contact.back.name,handleBack);assert.deepEqual(contact.source,beforeContact);
  assert.equal(scene.wallPresentation().effectiveMode,'cutaway');
  return {contactUsePoint:contact.usePointId,seat:handleSeat,back:handleBack,wallMode:scene.wallPresentation().effectiveMode,revision:scene.revision};
});

await expectReject('Reject restore while contact resources are retained',async()=>{
  const replacement=createCompany({id:'wall-probe',width:9,depth:7},catalog);await scene.restore(serializeCompany(replacement,catalog,templates));
},'facility-busy');
contact.release();

await run('Restore with an invalid old roomId falls back to floor view',async()=>{
  scene.setView({mode:'room',floorId,roomId});
  const replacement=createCompany({id:'wall-probe',width:9,depth:7},catalog),replacementRoom=replacement.nodes.find(node=>node.kind==='room');replacementRoom.id='wall-probe/replacement-room';
  const snapshot=await scene.restore(serializeCompany(replacement,catalog,templates));
  assert.equal(snapshot.view.mode,'floor');assert.equal(snapshot.view.roomId,null);assert.equal(snapshot.view.floorId,floorId);return {view:snapshot.view,documentId:snapshot.document.id};
});

const report={
  status:failures.length?'failed':'passed',
  configuration:{difficulty:'complex',model:'gpt-6.1-sol',reasoning_effort:'high',reason:'CPU review of wall visibility, presentation transactions, shared-wall grouping and contact isolation.',configurationEvidence:'Parent-confirmed existing configuration. Hook interception was not independently verified.'},
  sourceHashes:{
    'prototype/src/company/wall-visibility.js':await digest('prototype/src/company/wall-visibility.js'),
    'prototype/src/company/render.js':await digest('prototype/src/company/render.js'),
    'prototype/src/company/contact-resources.js':await digest('prototype/src/company/contact-resources.js'),
    'prototype/src/company/document.js':await digest('prototype/src/company/document.js')
  },
  checks,
  findings:[
    'Wall cutaway is presentation-only. setWallView changes wall visibility and mounted visual visibility while document, derived navigation obstacles, use-point descriptions and wall height remain unchanged.',
    'Duplicate wall faces near a shared room boundary are grouped by floor, axis, normal gap <= 0.21m and overlapping interval. Mounted wall resources inherit the same wall group, so hiding one shared plane hides both duplicate faces and their bound wall items.',
    'prepareChange builds a candidate with the current wall view. commit rechecks the authoring transaction and install carries the latest wall view forward, so a wall-view change between prepare and commit does not reset the cutaway.',
    'Contact resources are retained independently. An active contact blocks full document restore, while unrelated candidate commits and wall-view changes leave the retained seat/back handle valid.',
    'restore checks whether the prior roomId still belongs to the restored floor. If the room disappeared, it falls back to floor mode and clears roomId while retaining the valid floorId.'
  ],
  limitations:[
    'This is a CPU/module check. It does not claim browser rendering, GPU performance or visual acceptance.',
    'The shared-wall test uses procedural wall decor to avoid loading external GLB assets. Asset-library import and contact GLB paths remain separate tests.',
    'The implementation intentionally blocks restore while any contact handle is retained. This is resource protection, not automatic reattachment to a new room.'
  ]
};
await fs.mkdir(new URL('./',import.meta.url),{recursive:true});
await fs.writeFile(new URL('report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,failures:failures.length}));
if(failures.length)process.exitCode=1;
