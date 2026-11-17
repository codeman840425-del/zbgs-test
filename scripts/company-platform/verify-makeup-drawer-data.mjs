import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {inspectCompanyPlacement,inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';
import {validateMovingResource,movingFootprint} from '../../prototype/src/company/moving-parts.js';
import {validateMakeupStorageResource} from '../../prototype/src/company/makeup-storage-data.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {MAKEUP_DRAWER_HOST_PROFILE,MAKEUP_DRAWER_HOST_PARTS,MAKEUP_DRAWER_HOST_SURFACES,MAKEUP_DRAWER_PAYLOAD_SURFACES,MAKEUP_DRAWER_IDS,validateMakeupDrawerResource} from '../../prototype/src/company/makeup-drawer-data.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-drawer-data-v1');await fs.mkdir(output,{recursive:true});
const checks=[],clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
async function check(name,action){try{checks.push({name,status:'passed',detail:await action()});}catch(error){checks.push({name,status:'failed',code:error.code,error:error.stack});}}
const coordinates={units:'metres',up:'+Y',forward:'+Z',origin:'Bottom centre',scale:'Identity only'},asset={format:'glb',url:'/synthetic-only.glb',sha256:'0'.repeat(64),bytes:20};
const host={id:'makeup-drawer-host',version:1,category:'dynamic',mountRole:'makeup-drawer-host',movingProfile:MAKEUP_DRAWER_HOST_PROFILE,coordinates,asset,
  mounting:{origin:'bottom',width:.9,height:.78,depth:.55},footprint:{center:[0,0],halfSize:[.45,.275],blocking:true},usePoints:[],
  stateDefaults:{openFraction:0},stateSchema:{openFraction:{type:'number',min:0,max:1}},stateSemantics:{openFraction:'sliding-drawer-opening-fraction'},
  movingParts:clone(MAKEUP_DRAWER_HOST_PARTS),partNodes:{drawer:'cabinet-drawer-slide'},partPanels:{drawer:'drawer-front'},
  partTrays:{drawer:{bottom:'drawer-bottom',left:'drawer-left',right:'drawer-right',back:'drawer-back'}},supportSurfaces:clone(MAKEUP_DRAWER_HOST_SURFACES),supportNodes:{top:'cabinet-top',drawer:'drawer-bottom'},supportMotion:{drawer:'drawer'}};
const payloads=MAKEUP_DRAWER_IDS.map(id=>({id,version:1,category:'decor',mountRole:'makeup-storage-drawer',productionBranch:'makeup-storage-drawer',coordinates,asset,
  mount:'support-surface',mounting:{origin:'bottom',width:.45,height:.18,depth:.25},footprint:{center:[0,0],halfSize:[.225,.125],blocking:false},usePoints:[],stateDefaults:{},
  supportSurfaces:clone(MAKEUP_DRAWER_PAYLOAD_SURFACES),supportNodes:{top:'storage-roof'}}));
const content=JSON.parse(await fs.readFile('prototype/public/company-assets/makeup-storage-v1/content-compact/v1/resource.json','utf8'));
const topWitness={...clone(content),id:'synthetic-top-witness',mountRole:'tabletop-ornament'};
const blocker={id:'synthetic-blocker',version:1,category:'decor',footprint:{center:[0,0],halfSize:[.04,.04],blocking:true},usePoints:[],stateDefaults:{}};
const use={id:'synthetic-use',version:1,category:'interactive',usePoints:[{id:'spot',position:[0,0,0],approach:[1,0,0],exit:[1,0,0],capacity:1}],stateDefaults:{}};
const hostSkin={...clone(host),id:'new-makeup-host-skin',version:2};
const catalog={id:'makeup-drawer-data-fixture',version:1,resources:[host,hostSkin,...payloads,content,topWitness,blocker,use]},templates={templates:[]},options={catalog,templates};
const ref=r=>({id:r.id,version:r.version}),state=value=>({type:'set-state',id:'host',state:{openFraction:value}});
const add=(id,parentId,resource,position,surfaceId,yaw=0)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw},...(surfaceId?{attachment:{surfaceId}}:{})});
function change(document,operations,extra={}){return prepareCompanyChange(document,operations,{...options,...extra}).document;}
function input(){const document=createCompany({id:'drawer-fixture',width:10,depth:8},catalog);return change(document,[add('host',document.nodes[1].id,host,[0,0,-1]),
  add('payload','host',payloads[0],[0,.455,.03125],'drawer'),add('content','payload',content,[0,.01,-.045],'top'),add('top','host',topWitness,[0,.78,0],'top')]);}
function near(actual,expected){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-8,`${actual} != ${expected}`);}

// Synthetic scene graph verifies loading/state/ownership paths only. A production
// GLB loader or real geometry gate is deliberately not claimed by this fixture.
function libraryFixture(){const control={beforePreload:null,missingPivot:false};return{control,async preload(resources){await control.beforePreload?.(resources);},retainOnly(){},instantiate(resource){
  const root=new THREE.Group(),nodes=new Map();root.name=`Synthetic ${resource.id}`;
  const mesh=(name,parent=root)=>{const value=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),new THREE.MeshStandardMaterial());value.name=name;parent.add(value);nodes.set(name,value);};
  if(resource.movingProfile===MAKEUP_DRAWER_HOST_PROFILE){mesh('cabinet-top');const pivot=new THREE.Group();pivot.name='cabinet-drawer-slide';root.add(pivot);if(!control.missingPivot)nodes.set(pivot.name,pivot);for(const name of ['drawer-front','drawer-bottom','drawer-left','drawer-right','drawer-back'])mesh(name,pivot);}
  else mesh(resource.mountRole==='makeup-storage-drawer'?'storage-roof':'compact');return{root,nodes};
}};}
function fixture(document=input()){const world=new THREE.Scene(),library=libraryFixture(),scene=createCompanyScene(world,document,{...options,assetLibrary:library});return{scene,world,library,
  apply(operations){let handle;try{handle=scene.prepareChange(operations);scene.commit(handle);}finally{if(handle)scene.discard(handle);}},dispose(){scene.dispose();}};}
function agree(scene){const derived=deriveCompany(scene.document,catalog,templates);for(const f of derived.facilities)near(scene.root.getObjectByName(f.id).getWorldPosition(new THREE.Vector3()).toArray(),f.world.position);return derived;}

await check('exact host and four payload functions admit independently of appearance ID and positive version',()=>{
  for(const resource of [host,hostSkin,...payloads]){validateMakeupDrawerResource(resource,fail);validateSupportResource(resource,fail);validateMovingResource(resource,fail);}
  assert(compareFacilityFunction(host,hostSkin).compatible);for(const p of payloads)assert(compareFacilityFunction(payloads[0],p).compatible);
  const another={...clone(payloads[0]),id:'future-drawer-style',version:2};validateMakeupStorageResource(another,fail);assert(compareFacilityFunction(payloads[0],another).compatible);
  const changed=clone(another);changed.mounting.height=.2;assert.throws(()=>validateMovingResource(changed,fail),e=>e.code==='invalid-makeup-drawer-payload');
  return{host:ref(hostSkin),payload:ref(another)};
});
await check('two-level descendants move once through every quarter-turn host while top remains static',()=>{
  const f=fixture();try{const rest=clone(f.scene.document.nodes.filter(n=>['payload','content','top'].includes(n.id)));
    for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const fraction of [0,.5,1,.37,0]){
      f.apply([{type:'move',id:'host',transform:{position:[.3,0,-1],yaw}},state(fraction)]);const d=agree(f.scene);
      near(d.localTransforms.get('payload').position,[0,.455,.03125+.32*fraction]);near(d.localTransforms.get('content').position,[0,.01,-.045]);near(d.localTransforms.get('top').position,[0,.78,0]);
      const parent=d.worlds.get('host'),expected=[parent.position[0]+Math.sin(yaw)*(-.01375+.32*fraction),.465,parent.position[2]+Math.cos(yaw)*(-.01375+.32*fraction)];near(d.worlds.get('content').position,expected);
      assert(Math.abs(f.scene.root.getObjectByName('host').getObjectByName('cabinet-drawer-slide').position.z-.32*fraction)<1e-10);
      assert.deepEqual(f.scene.document.nodes.filter(n=>['payload','content','top'].includes(n.id)),rest);
    }return{parentTurns:4,fractions:[0,.5,1,.37,0],contentOffsetAppliedOnce:true};
  }finally{f.dispose();}
});
await check('strict profile survives motion admission without resource mutation or loss of moving child state',()=>{
  const before=change(input(),[state(1)]),after=change(before,[state(.19)]),catalogBefore=JSON.stringify(catalog),documentBefore=JSON.stringify(after),d=deriveCompany(after,catalog,templates);
  const placement=inspectCompanyMotionSweep(before,after,catalog,templates);assert(placement.rooms.length);assert.equal(JSON.stringify(catalog),catalogBefore);assert.equal(JSON.stringify(after),documentBefore);
  assert.equal(d.facilities.find(f=>f.id==='host').state.openFraction,.19);near(d.localTransforms.get('payload').position,[0,.455,.03125+.32*.19]);
  assert(d.facilities.some(f=>f.id==='content'));validateMovingResource(d.facilities.find(f=>f.id==='host').resource,fail);
  return{resourceId:host.id,unchangedResourceAndDocument:true,descendants:d.facilities.map(f=>f.id),fraction:.19};
});
await check('all payload appearance replacements preserve IDs, attachments, rest and nondefault host state through recovery',async()=>{
  const f=fixture(change(input(),[state(.63)]));try{const descendants=clone(f.scene.document.nodes.filter(n=>['payload','content'].includes(n.id)));
    for(const p of payloads){f.apply([{type:'replace-resource',id:'payload',resource:ref(p)}]);const node=f.scene.document.nodes.find(n=>n.id==='payload');assert.deepEqual(node.transform,descendants[0].transform);assert.equal(node.parentId,'host');
      assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='content'),descendants[1]);const saved=f.scene.save();f.scene.restore(saved);assert.equal(f.scene.save(),saved);agree(f.scene);
      const envelope=await encodeCompanySave(f.scene.document,catalog,templates);assert.deepEqual(await decodeCompanySave(envelope,catalog,templates),f.scene.document);
    }f.apply([{type:'replace-resource',id:'host',resource:ref(hostSkin)}]);assert.equal(f.scene.document.nodes.find(n=>n.id==='host').state.openFraction,.63);agree(f.scene);
    return{payloadAppearances:4,hostReplacement:ref(hostSkin),fraction:.63};
  }finally{f.dispose();}
});
await check('copy host and copy payload to another room preserve rest, independent states and distinct child IDs',()=>{
  let document=change(input(),[state(.58),{type:'copy-facility',id:'host',newId:'host-copy',transform:{position:[3,0,-1],yaw:Math.PI/2}}]);
  const copiedPayload=document.nodes.find(n=>n.parentId==='host-copy'&&n.resource.id===payloads[0].id),copiedContent=document.nodes.find(n=>n.parentId===copiedPayload.id);
  near(copiedPayload.transform.position,[0,.455,.03125]);near(copiedContent.transform.position,[0,.01,-.045]);assert.equal(document.nodes.find(n=>n.id==='host-copy').state.openFraction,.58);
  document.scale='rental-home';document=change(document,[{type:'add-room',id:'room-two',parentId:'drawer-fixture/floor-1',bounds:{width:10,depth:8},transform:{position:[12,0,0],yaw:0}},
    add('host-two','room-two',host,[0,0,-1],undefined,Math.PI),{type:'copy-facility',id:'payload',newId:'payload-two',parentId:'host-two'},state(.2)]);
  const d=deriveCompany(document,catalog,templates);assert.equal(d.roomIds.get('payload-two'),'room-two');assert.equal(d.facilities.find(f=>f.id==='host-two').state.openFraction,0);assert.equal(d.facilities.find(f=>f.id==='host-copy').state.openFraction,.58);
  assert.equal(new Set(document.nodes.map(n=>n.id)).size,document.nodes.length);assert.deepEqual(restoreCompany(serializeCompany(document,catalog,templates),catalog,templates),document);
  return{copiedPayload:copiedPayload.id,copiedContent:copiedContent.id,secondRoom:'room-two'};
});
await check('closing sweep rejects other blockers and front use-space despite a valid closed endpoint',()=>{
  const open=change(input(),[state(1)]),bytes=JSON.stringify(open);
  assert.throws(()=>change(open,[state(0),add('blocker','drawer-fixture/room-1',blocker,[0,0,-.5])]),e=>e.code==='blocked-moving-part');assert.equal(JSON.stringify(open),bytes);
  const endpoint=change(open,[state(0),add('use','drawer-fixture/room-1',use,[0,0,-.28])]);inspectCompanyPlacement(endpoint,catalog,templates);
  assert.throws(()=>inspectCompanyMotionSweep(open,endpoint,catalog,templates),e=>e.code==='blocked-use-space');
  const f=fixture(open);try{const saved=f.scene.save(),root=f.scene.root;assert.throws(()=>f.apply([state(0),add('use','drawer-fixture/room-1',use,[0,0,-.28])]),e=>e.code==='blocked-use-space');assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);}finally{f.dispose();}
  return{blockerRejected:true,endpointUseSpaceValid:true,sweptUseSpaceRejected:true};
});
await check('standalone sweep admission checks the real 0.10m wall inset on both front axes',()=>{
  const results=[];
  for(const [yaw,position] of [[0,[0,0,3.4]],[Math.PI/2,[4.4,0,0]]]){
    const before=change(input(),[{type:'move',id:'host',transform:{position,yaw}}]),after=clone(before);after.nodes.find(n=>n.id==='host').state.openFraction=1;
    const obstacle=deriveCompany(after,catalog,templates).obstacles.find(o=>o.id==='host');
    assert(obstacle.max[0]<=5+1e-8&&obstacle.max[1]<=4+1e-8);
    assert.throws(()=>inspectCompanyMotionSweep(before,after,catalog,templates),e=>e.code==='outside-room');
    results.push({yaw,max:obstacle.max,wallInset:.1});
  }
  return{insideRegionBoundsButInsideWallThickness:results};
});
await check('ground/wall restrictions and illegal parent, support, fit or state preserve the live scene and save bytes',()=>{
  const f=fixture();try{const saved=f.scene.save(),root=f.scene.root,codes=[];
    const cases=[[{type:'move',id:'host',transform:{position:[0,.1,-1],yaw:0}}],
      [{type:'attach-surface',id:'payload',parentId:'host',surfaceId:'top',transform:{position:[0,.78,0],yaw:0}}],
      [{type:'attach-surface',id:'content',parentId:'host',surfaceId:'drawer',transform:{position:[0,.455,.03125],yaw:0}}],
      [{type:'move',id:'payload',transform:{position:[.2,.455,.03125],yaw:0}}],
      [{type:'move',id:'content',transform:{position:[0,.011,-.045],yaw:0}}],
      [{type:'copy-facility',id:'payload',newId:'overlap'}],
      ...[-1,1.01,NaN,Infinity,'1'].map(v=>[state(v)]),
      [{type:'set-state',id:'payload',state:{openFraction:.5}}]];
    for(const operations of cases){assert.throws(()=>f.apply(operations),e=>{codes.push(e.code);return Boolean(e.code);});assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);}
    const parentBad=f.scene.document;parentBad.nodes.find(n=>n.id==='host').parentId='payload';assert.throws(()=>deriveCompany(parentBad,catalog,templates),e=>['parent-cycle','invalid-makeup-drawer-host-parent'].includes(e.code));
    const nearWall=change(input(),[{type:'move',id:'host',transform:{position:[0,0,3.6],yaw:0}}]);assert.throws(()=>change(nearWall,[state(1)]),e=>['outside-room','blocked-moving-part'].includes(e.code));
    return{cases:cases.length,codes};
  }finally{f.dispose();}
});
await check('parent adapters reject host assemblies and wrong support roles without relying on overlap errors',()=>{
  const assembly=input();assembly.nodes.push({id:'container',kind:'assembly',parentId:'drawer-fixture/room-1',transform:{position:[0,0,0],yaw:0}});assembly.nodes.find(n=>n.id==='host').parentId='container';
  assert.throws(()=>deriveCompany(assembly,catalog,templates),e=>e.code==='invalid-makeup-drawer-host-parent');
  const wrongPayloadSurface=input();wrongPayloadSurface.nodes=wrongPayloadSurface.nodes.filter(n=>n.id!=='top');const payload=wrongPayloadSurface.nodes.find(n=>n.id==='payload');payload.attachment.surfaceId='top';payload.transform.position=[0,.78,0];
  assert.throws(()=>deriveCompany(wrongPayloadSurface,catalog,templates),e=>e.code==='invalid-makeup-drawer-payload-parent');
  const compactOnHost=input();compactOnHost.nodes=compactOnHost.nodes.filter(n=>n.id!=='payload');const compact=compactOnHost.nodes.find(n=>n.id==='content');compact.parentId='host';compact.attachment.surfaceId='drawer';compact.transform.position=[0,.455,.03125];
  assert.throws(()=>deriveCompany(compactOnHost,catalog,templates),e=>e.code==='invalid-makeup-storage-parent');
  let area=input();area=change(area,[{type:'add-area',id:'public-area',parentId:'drawer-fixture/floor-1',bounds:{width:10,depth:8},transform:{position:[12,0,0],yaw:0}}]);area.nodes.find(n=>n.id==='host').parentId='public-area';
  assert.equal(deriveCompany(area,catalog,templates).roomIds.get('host'),'public-area');
  return{directAreaAllowed:true,assemblyHostRejected:true,wrongPayloadFaceRejected:true,directCompactRejected:true};
});
await check('bad profiles, known identity repurposing and changed functional mappings reject before model use',()=>{
  const changes=[r=>r.supportMotion.drawer='missing',r=>r.supportMotion.top='drawer',r=>r.supportNodes.drawer='cabinet-top',r=>r.movingParts[0].translationRange[1]=.09,
    r=>r.movingParts[0].bounds.max[1]=1.12,r=>r.mount='floor-surface',r=>r.footprint.blocking=false,r=>r.supportSurfaces[1].clearanceHeight=.3,r=>r.movingProfile='other',r=>r.partNodes.drawer='missing',r=>r.stateSemantics.openFraction='other'];
  for(const mutate of changes){const bad=clone(host);mutate(bad);assert.throws(()=>validateMovingResource(bad,fail),e=>Boolean(e.code));assert(!compareFacilityFunction(host,bad).compatible||bad.partNodes.drawer==='missing'||bad.supportNodes.drawer==='cabinet-top');}
  for(const mutate of [r=>r.movingParts=[],r=>r.supportMotion={top:'drawer'},r=>r.mounting.height=.25,r=>r.supportSurfaces[0].topY=.1,r=>r.stateDefaults.openFraction=0]){const bad=clone(payloads[0]);mutate(bad);assert.throws(()=>validateMovingResource(bad,fail),e=>Boolean(e.code));}
  const oldIdentity={...clone(host),id:'makeup-storage-tray'};assert.throws(()=>validateMakeupStorageResource(oldIdentity,fail),e=>e.code==='invalid-makeup-storage-contract');
  return{badHosts:changes.length,badPayloads:5,oldIdentityRepurposingRejected:true};
});
await check('busy descendant guards stop parent opening and preserve the original use-point contract',()=>{
  // A synthetic logical use point tests the existing lease guard only. This is
  // not an asserted usable seat or character contact inside the new payload.
  const document=change(input(),[add('logical-child','payload',use,[0,0,0])]),before=JSON.stringify(document);let queried;
  assert.throws(()=>change(document,[state(.5)],{isUsePointBusy:id=>{queried=id;return id==='logical-child#spot';}}),e=>e.code==='facility-busy');
  assert.equal(queried,'logical-child#spot');assert.equal(JSON.stringify(document),before);assert.equal(document.nodes.find(n=>n.id==='logical-child').resource.id,use.id);
  return{guardedUsePoint:queried,hostUsePoints:host.usePoints};
});
await check('rest snapshots and resource pins survive repeated opening and dependency mismatches reject',async()=>{
  let document=input();for(let i=0;i<30;i++){document=change(document,[state((i%7)/6)]);document=restoreCompany(serializeCompany(document,catalog,templates),catalog,templates);}
  near(document.nodes.find(n=>n.id==='payload').transform.position,[0,.455,.03125]);near(document.nodes.find(n=>n.id==='content').transform.position,[0,.01,-.045]);
  const text=await encodeCompanySave(document,catalog,templates),changed=clone(catalog);changed.resources.find(r=>r.id===host.id).notes='changed pinned metadata';
  await assert.rejects(()=>decodeCompanySave(text,changed,templates),e=>e.code==='dependency-content-mismatch');assert.deepEqual(await decodeCompanySave(text,catalog,templates),document);
  return{recoveryIterations:30,payloadRest:[0,.455,.03125],compactRest:[0,.01,-.045]};
});
await check('missing actual pivot and superseded prepared candidates cannot replace the old scene',()=>{
  const f=fixture();try{const saved=f.scene.save(),root=f.scene.root;f.library.control.missingPivot=true;
    assert.throws(()=>f.apply([state(.5)]),e=>e.code==='missing-moving-part');assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);f.library.control.missingPivot=false;
    const handle=f.scene.prepareChange([state(.2)]);f.apply([state(.8)]);const newer=f.scene.root;
    assert.throws(()=>f.scene.commit(handle),e=>e.code==='revision-conflict');f.scene.discard(handle);assert.equal(f.scene.root,newer);agree(f.scene);
    return{missingPivotRejected:true,staleCandidateRejected:true};
  }finally{f.dispose();}
});
await check('async load failure and late failure preserve newer two-level scene and stored bytes',async()=>{
  const library=libraryFixture(),memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},world=new THREE.Scene();
  const author=await createCompanyAuthoring(world,input(),{...options,assetLibrary:library,storage});
  try{await author.save();const saved=[...memory.values()][0],root=author.scene.root;
    library.control.beforePreload=async()=>{throw Object.assign(Error('Synthetic missing source'),{code:'synthetic-source-failure'});};
    await assert.rejects(()=>author.apply([state(.5)]),e=>e.code==='synthetic-source-failure');assert.equal(author.scene.root,root);assert.equal([...memory.values()][0],saved);
    let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});let count=0;
    library.control.beforePreload=async()=>{if(++count===1){entered();await new Promise(resolve=>{release=resolve;});throw Object.assign(Error('Synthetic late failure'),{code:'synthetic-late-failure'});}};
    const late=author.apply([state(.24)]).catch(error=>error);await waiting;await author.apply([state(.79)]);await author.save();const finalRoot=author.scene.root,finalBytes=[...memory.values()][0];release();
    assert.equal((await late).code,'synthetic-late-failure');assert.equal(author.scene.root,finalRoot);assert.equal([...memory.values()][0],finalBytes);assert.equal(author.document.nodes.find(n=>n.id==='host').state.openFraction,.79);agree(author.scene);
    return{initialFailurePreservedSave:true,lateFailurePreservedNewerScene:true,fraction:.79};
  }finally{author.dispose();}
});

const sourceHashes={};for(const filename of ['docs/COMPANY-MAKEUP-DRAWER-CONTRACT-v1.txt','prototype/src/company/makeup-drawer-data.js','prototype/src/company/makeup-storage-data.js','prototype/src/company/document.js','prototype/src/company/placement.js','prototype/src/company/support-data.js','prototype/src/company/moving-parts.js','scripts/company-platform/verify-makeup-drawer-data.mjs'])sourceHashes[filename]=hash(await fs.readFile(filename));
const report={status:checks.every(c=>c.status==='passed')?'passed':'failed',checks,sourceHashes,
  limits:['Data/schema, conservative swept placement, scene graph and transaction/persistence checks use synthetic host and payload instances. Actual production GLB geometry, support/contact/cavity checks and GPU/browser rendering are separate evidence.',
    'The original compact resource descriptor is reused unchanged. A synthetic logical use point tests the existing busy descendant guard only and does not establish an actor interaction.',
    'No service, GPU, browser closed-process recovery, ordinary-computer performance or character action was exercised.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
