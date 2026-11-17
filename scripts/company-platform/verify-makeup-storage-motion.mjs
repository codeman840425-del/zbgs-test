import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany,composeTransform} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {compareFacilityFunction,describeFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateSupportAttachments,validateSupportResource} from '../../prototype/src/company/support-data.js';
import {movingFootprint,validateMovingResource} from '../../prototype/src/company/moving-parts.js';
import {inspectCompanyMotionSweep,inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {MAKEUP_STORAGE_IDS,MAKEUP_STORAGE_PROFILE,MAKEUP_STORAGE_MOUNTING,MAKEUP_STORAGE_PARTS,MAKEUP_STORAGE_SURFACES,MAKEUP_STORAGE_CONTENT_ID,validateMakeupStorageResource} from '../../prototype/src/company/makeup-storage-data.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-storage-motion-v1');
await fs.mkdir(output,{recursive:true});
const checks=[],hash=bytes=>createHash('sha256').update(bytes).digest('hex'),clone=value=>structuredClone(value);
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
async function check(name,action) {
  try {checks.push({name,status:'passed',detail:await action()});}
  catch(error){checks.push({name,status:'failed',error:error.stack,code:error.code});}
}
const coordinates={units:'metres',up:'+Y',forward:'+Z',origin:'Bottom centre',scale:'Identity only'};
const asset={format:'glb',url:'/cpu-synthetic.glb',bytes:20,sha256:'0'.repeat(64)};
const table=JSON.parse(await fs.readFile('prototype/public/company-assets/vanity-table-v1/plain/v1/resource.json','utf8'));
const storages=MAKEUP_STORAGE_IDS.map(id=>({id,version:1,category:'dynamic',mountRole:'makeup-storage',productionBranch:'makeup-storage',
  mount:'support-surface',mounting:clone(MAKEUP_STORAGE_MOUNTING),coordinates:clone(coordinates),asset:clone(asset),
  footprint:{center:[0,0],halfSize:[.225,.125],blocking:false},usePoints:[],stateDefaults:{openFraction:0},
  stateSchema:{openFraction:{type:'number',min:0,max:1}},stateSemantics:{openFraction:'sliding-drawer-opening-fraction'},
  movingProfile:MAKEUP_STORAGE_PROFILE,movingParts:clone(MAKEUP_STORAGE_PARTS),partNodes:{drawer:'storage-drawer-slide'},partPanels:{drawer:'storage-drawer-front'},
  partTrays:{drawer:{bottom:'storage-drawer-bottom',left:'storage-drawer-left',right:'storage-drawer-right',back:'storage-drawer-back'}},
  supportSurfaces:clone(MAKEUP_STORAGE_SURFACES),supportNodes:{top:'storage-roof',drawer:'storage-drawer-bottom'},supportMotion:{drawer:'drawer'}}));
const content={id:MAKEUP_STORAGE_CONTENT_ID,version:1,category:'decor',mountRole:'makeup-storage-content',mount:'support-surface',
  mounting:{origin:'bottom',width:.024,height:.035,depth:.024},coordinates:clone(coordinates),asset:clone(asset),
  footprint:{center:[0,0],halfSize:[.012,.012],blocking:false},usePoints:[],stateDefaults:{}};
const ornament={...clone(content),id:'cpu-ornament',mountRole:'tabletop-ornament'};
const catalog={id:'cpu-storage-motion',version:1,resources:[table,...storages,content,ornament]},templates={templates:[]},options={catalog,templates};
const ref=resource=>({id:resource.id,version:resource.version}),state=value=>({type:'set-state',id:'storage',state:{openFraction:value}});
const add=(id,parentId,resource,position,surfaceId,yaw=0)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw},...(surfaceId?{attachment:{surfaceId}}:{})});
function input() {
  const document=createCompany({id:'storage-cpu',width:10,depth:8},catalog);
  return prepareCompanyChange(document,[add('table',document.nodes[1].id,table,[0,0,-1]),
    add('storage','table',storages[0],[.02,.78,.075],'top'),add('drawer-content','storage',content,[0,.022,-.005],'drawer'),
    add('top-content','storage',content,[0,.1,-.045],'top')],options).document;
}
function apply(document,operations,extra={}) {return prepareCompanyChange(document,operations,{...options,...extra}).document;}
const near=(a,b)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert(Math.abs(a[i]-b[i])<1e-9,`${a} != ${b}`);};

// A scene-graph fixture only. It deliberately does not implement or claim the
// production GLB geometry gate, fixed/slide contact, cavity or content fitting.
function assetFixture() {
  const control={missingPivot:false,beforePreload:null};
  return {control,async preload(resources){await control.beforePreload?.(resources);},retainOnly(){},instantiate(resource){
    const root=new THREE.Group(),nodes=new Map();root.name=`CPU fixture ${resource.id}`;
    function mesh(name,parent=root) {const part=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),new THREE.MeshStandardMaterial());part.name=name;parent.add(part);nodes.set(name,part);return part;}
    if(resource.mountRole==='makeup-storage') {
      mesh('storage-roof');const pivot=new THREE.Group();pivot.name='storage-drawer-slide';root.add(pivot);
      if(!control.missingPivot)nodes.set(pivot.name,pivot);
      for(const name of ['storage-drawer-front','storage-drawer-bottom','storage-drawer-left','storage-drawer-right','storage-drawer-back'])mesh(name,pivot);
    }else mesh(resource.mountRole==='vanity-table'?'vanity-top':'compact');
    return {root,nodes};
  }};
}
function sceneFixture(document=input()) {
  const library=assetFixture(),world=new THREE.Scene(),scene=createCompanyScene(world,document,{...options,assetLibrary:library});
  const change=operations=>{let handle;try{handle=scene.prepareChange(operations);scene.commit(handle);}finally{if(handle)scene.discard(handle);}};
  return {scene,library,world,change,dispose(){scene.dispose();}};
}
function assertWorlds(scene) {
  const derived=deriveCompany(scene.document,catalog,templates);
  for(const facility of derived.facilities)near(scene.root.getObjectByName(facility.id).getWorldPosition(new THREE.Vector3()).toArray(),facility.world.position);
  return derived;
}

await check('four fixed storage profiles and compact contracts admit while legacy signatures gain no new fields',()=>{
  for(const resource of [...storages,content]){validateMakeupStorageResource(resource,fail);validateSupportResource(resource,fail);validateMovingResource(resource,fail);}
  for(const resource of storages)assert(compareFacilityFunction(storages[0],resource).compatible);
  const legacy=describeFacilityFunction(table);assert(!Object.hasOwn(legacy,'supportMotion'));assert(!Object.hasOwn(legacy,'movingProfile'));
  const functionFields=describeFacilityFunction(storages[0]);assert.deepEqual(functionFields.supportMotion,{drawer:'drawer'});assert.equal(functionFields.movingProfile,MAKEUP_STORAGE_PROFILE);
  for(const change of [r=>delete r.supportMotion,r=>r.supportMotion.drawer='unknown',r=>r.movingProfile='grounded-slide']){
    const other=clone(storages[0]);change(other);assert(!compareFacilityFunction(storages[0],other).compatible);
  }
  return {legacySignatureSha256:hash(JSON.stringify(legacy)),newFunctionalFields:['supportMotion','movingProfile']};
});
await check('same functional profile admits new appearance identities and explicit positive resource versions',()=>{
  const nextStorage={...clone(storages[0]),id:'makeup-storage-new-skin',version:2},nextContent={...clone(content),id:'makeup-storage-content-new-skin',version:2};
  for(const resource of [nextStorage,nextContent]){validateMakeupStorageResource(resource,fail);validateMovingResource(resource,fail);}
  assert(compareFacilityFunction(storages[0],nextStorage).compatible);assert(compareFacilityFunction(content,nextContent).compatible);
  const extended={...catalog,resources:[...catalog.resources,nextStorage,nextContent]},before=input();
  const result=prepareCompanyChange(before,[state(.42),{type:'replace-resource',id:'storage',resource:ref(nextStorage)},{type:'replace-resource',id:'drawer-content',resource:ref(nextContent)}],{catalog:extended,templates}).document;
  assert.deepEqual(result.nodes.find(n=>n.id==='drawer-content').transform,before.nodes.find(n=>n.id==='drawer-content').transform);
  assert.deepEqual(restoreCompany(serializeCompany(result,extended,templates),extended,templates),result);
  const changed=clone(nextStorage);changed.movingParts[0].translationRange[1]=.1;assert.throws(()=>validateMakeupStorageResource(changed,fail),e=>e.code==='invalid-makeup-storage-contract');
  return {storage:ref(nextStorage),content:ref(nextContent),functionalDifferenceRejected:true};
});
await check('derive and render share rest-based child translation for endpoint and nonendpoint states',()=>{
  const f=sceneFixture();try{
    const rest=clone(f.scene.document.nodes.find(n=>n.id==='drawer-content').transform),positions=[];
    for(const fraction of [0,.5,1,.37,0,.81,1,0]){
      f.change([state(fraction)]);const derived=assertWorlds(f.scene),root=f.scene.root.getObjectByName('storage');
      near(derived.localTransforms.get('drawer-content').position,[0,.022,-.005+.09*fraction]);
      near(derived.localTransforms.get('top-content').position,[0,.1,-.045]);
      assert(Math.abs(root.getObjectByName('storage-drawer-slide').position.z-.09*fraction)<1e-12);
      assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='drawer-content').transform,rest);positions.push(derived.worlds.get('drawer-content').position);
    }
    return {fractions:[0,.5,1,.37,0,.81,1,0],worldPositions:positions};
  }finally{f.dispose();}
});
await check('full storage reserve creates no floor obstacle and supported opening skips ground motion proxies',()=>{
  const document=input(),before=deriveCompany(document,catalog,templates),next=apply(document,[state(1)]),after=deriveCompany(next,catalog,templates);
  assert.deepEqual(before.obstacles.map(o=>o.id),['table']);assert.deepEqual(after.obstacles.map(o=>o.id),['table']);
  assert.equal(movingFootprint(storages[0],{openFraction:0},{openFraction:1}).blocking,false);
  assert.equal(inspectCompanyMotionSweep(document,next,catalog,templates),null);inspectCompanyPlacement(next,catalog,templates);
  return {groundObstacles:after.obstacles.map(o=>o.id),reservedMounting:storages[0].mounting};
});
await check('parent turns and translations rotate drawer displacement and preserve top rest coordinates',()=>{
  const f=sceneFixture();try{
    const tableTransform={position:[1,0,-1],yaw:Math.PI/2};f.change([{type:'move',id:'table',transform:tableTransform},state(1)]);
    const derived=assertWorlds(f.scene),storageWorld=composeTransform(tableTransform,{position:[.02,.78,.075],yaw:0});
    near(derived.worlds.get('drawer-content').position,composeTransform(storageWorld,{position:[0,.022,.085],yaw:0}).position);
    near(f.scene.root.getObjectByName('storage').getObjectByName('storage-drawer-bottom').getWorldPosition(new THREE.Vector3()).toArray(),composeTransform(storageWorld,{position:[0,0,.09],yaw:0}).position);
    near(derived.localTransforms.get('top-content').position,[0,.1,-.045]);
    return {world:derived.worlds.get('drawer-content'),top:derived.worlds.get('top-content')};
  }finally{f.dispose();}
});
await check('all quarter-turn parents and child yaw agree between derived and rendered world transforms',()=>{
  const f=sceneFixture();try{
    for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const fraction of [0,.43,1]){
      f.change([{type:'move',id:'table',transform:{position:[.5,0,-1],yaw}},
        {type:'move',id:'drawer-content',transform:{position:[0,.022,-.005],yaw:Math.PI/2}},state(fraction)]);
      const derived=assertWorlds(f.scene),actual=f.scene.root.getObjectByName('drawer-content').getWorldQuaternion(new THREE.Quaternion()),expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,derived.worlds.get('drawer-content').yaw,0));
      assert(actual.angleTo(expected)<1e-7);near(derived.localTransforms.get('drawer-content').position,[0,.022,-.005+fraction*.09]);
    }
    return {parentQuarterTurns:4,posesPerTurn:3,childYaw:Math.PI/2};
  }finally{f.dispose();}
});
await check('repeated state changes, serialized recovery and every compatible appearance retain rest transforms and child identity',async()=>{
  const f=sceneFixture();try{
    const children=clone(f.scene.document.nodes.filter(n=>n.parentId==='storage'));
    for(const resource of storages){
      f.change([state(.63),{type:'replace-resource',id:'storage',resource:ref(resource)}]);
      assert.deepEqual(f.scene.document.nodes.filter(n=>n.parentId==='storage'),children);
      const text=f.scene.save();f.scene.restore(text);assert.equal(f.scene.save(),text);assertWorlds(f.scene);
      const envelope=await encodeCompanySave(f.scene.document,catalog,templates),restored=await decodeCompanySave(envelope,catalog,templates);
      assert.deepEqual(restored,f.scene.document);
    }
    let document=f.scene.document;
    for(let i=0;i<40;i++){document=apply(document,[state((i%5)/4)]);document=restoreCompany(serializeCompany(document,catalog,templates),catalog,templates);}
    assert.deepEqual(document.nodes.filter(n=>n.parentId==='storage'),children);
    return {appearanceCount:storages.length,recoveryIterations:40,childIds:children.map(n=>n.id)};
  }finally{f.dispose();}
});
await check('facility subtree copy and two-room ownership preserve independent drawer state and rest attachment identity',()=>{
  let document=input();document.scale='rental-home';document=apply(document,[{type:'add-room',id:'room-two',parentId:'storage-cpu/floor-1',bounds:{width:10,depth:8},transform:{position:[12,0,0],yaw:0}},
    add('table-two','room-two',table,[0,0,-1],undefined,Math.PI/2),state(.72),
    {type:'copy-facility',id:'storage',newId:'storage-copy',parentId:'table-two'}]);
  const copiedStorage=document.nodes.find(n=>n.id==='storage-copy'),copiedContents=document.nodes.filter(n=>n.parentId===copiedStorage.id);
  assert.equal(copiedContents.length,2);assert.equal(copiedStorage.state.openFraction,.72);assert(copiedContents.some(n=>n.attachment.surfaceId==='drawer'));
  document=apply(document,[state(.21)]);const derived=deriveCompany(document,catalog,templates);
  assert.equal(derived.roomIds.get(copiedStorage.id),'room-two');assert.equal(derived.roomIds.get('storage'),'storage-cpu/room-1');
  assert.equal(derived.facilities.find(f=>f.id==='storage').state.openFraction,.21);assert.equal(derived.facilities.find(f=>f.id===copiedStorage.id).state.openFraction,.72);
  const drawerCopy=copiedContents.find(n=>n.attachment.surfaceId==='drawer');near(drawerCopy.transform.position,[0,.022,-.005]);
  const originalBytes=serializeCompany(document,catalog,templates);
  assert.throws(()=>apply(document,[{type:'copy-facility',id:'storage',newId:'overlapping-copy'}]),e=>e.code==='overlapping-supported-props');
  assert.throws(()=>apply(document,[{type:'copy-facility',id:'storage',newId:'bad-parent-copy',parentId:'room-two'}]),e=>e.code==='invalid-support-attachment');
  assert.equal(serializeCompany(document,catalog,templates),originalBytes);
  assert.deepEqual(restoreCompany(serializeCompany(document,catalog,templates),catalog,templates),document);
  return {copy:copiedStorage.id,contentIds:copiedContents.map(n=>n.id),rooms:[derived.roomIds.get('storage'),derived.roomIds.get(copiedStorage.id)]};
});
await check('illegal rest fit, child storage yaw, direct parent, overlap and state changes preserve scene root and saved bytes',()=>{
  const f=sceneFixture();try{
    const saved=f.scene.save(),root=f.scene.root,errors=[];
    const operations=[
      [{type:'move',id:'storage',transform:{position:[.02,.78,.075],yaw:Math.PI/2}}],
      [{type:'move',id:'drawer-content',transform:{position:[0,.022,.01],yaw:0}}],
      [{type:'move',id:'drawer-content',transform:{position:[0,.023,-.005],yaw:0}}],
      [{type:'attach-surface',id:'drawer-content',parentId:'table',surfaceId:'top',transform:{position:[.3,.78,0],yaw:0}}],
      [{type:'attach-surface',id:'storage',parentId:'storage-cpu/room-1',surfaceId:'top',transform:{position:[0,.78,0],yaw:0}}],
      [{type:'attach-surface',id:'drawer-content',parentId:'storage',surfaceId:'unknown',transform:{position:[0,.022,-.005],yaw:0}}],
      [add('overlap','storage',content,[0,.022,-.005],'drawer')],
      [add('table-overlap','table',ornament,[.02,.78,.075],'top')],
      ...[-.01,1.01,NaN,Infinity,'1',null].map(value=>[state(value)]),
      [{type:'set-state',id:'storage',state:{other:1}}],
    ];
    for(const operationsOfCase of operations){assert.throws(()=>f.change(operationsOfCase),error=>{assert(error.code);errors.push(error.code);return true;});assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);}
    return {cases:operations.length,codes:errors};
  }finally{f.dispose();}
});
await check('copy-facility defaults to the same direct parent and rejects duplicate IDs, cycles and compound failure atomically',()=>{
  const f=sceneFixture();try{
    f.change([{type:'copy-facility',id:'drawer-content',newId:'extra-compact',transform:{position:[.05,.022,-.005],yaw:0}},state(.6)]);
    const copy=f.scene.document.nodes.find(n=>n.id==='extra-compact');assert.equal(copy.parentId,'storage');assert.deepEqual(copy.attachment,{surfaceId:'drawer'});near(copy.transform.position,[.05,.022,-.005]);assertWorlds(f.scene);
    const saved=f.scene.save(),root=f.scene.root;
    for(const operations of [[{type:'copy-facility',id:'drawer-content',newId:'extra-compact'}],
      [{type:'copy-facility',id:'storage',newId:'storage-cycle',parentId:'storage-cycle/extra-1'}],
      [{type:'copy-facility',id:'drawer-content',newId:'will-not-publish',transform:{position:[-.05,.022,-.005],yaw:0}},state(2)]]){
      assert.throws(()=>f.change(operations),e=>Boolean(e.code));assert.equal(f.scene.save(),saved);assert.equal(f.scene.root,root);
    }
    return {copyId:copy.id,parentId:copy.parentId,atomicRejections:3};
  }finally{f.dispose();}
});
await check('invalid contract aliases, mappings and overheight compact inputs reject before any scene allocation',()=>{
  const mutators=[r=>r.supportMotion.drawer='missing',r=>r.supportMotion.top='drawer',r=>r.supportMotion={missing:'drawer'},
    r=>r.supportNodes.drawer='storage-roof',r=>r.partNodes.drawer='missing',r=>r.partTrays.drawer.bottom='storage-roof',
    r=>r.movingParts[0].translationRange[1]=.32,r=>r.movingProfile='legacy',r=>delete r.movingProfile,
    r=>r.movingParts[0].kind='hinge',r=>r.footprint.blocking=true,r=>r.mounting.depth=.16,
    r=>r.supportSurfaces[1].clearanceHeight=.05,r=>r.stateSemantics.openFraction='other',r=>r.version=0,r=>r.mountRole='other'];
  for(const mutate of mutators){const resource=clone(storages[0]);mutate(resource);assert.throws(()=>validateMovingResource(resource,fail),e=>Boolean(e.code));}
  const tooTall=clone(catalog);tooTall.resources.find(r=>r.id===content.id).mounting.height=.041;assert.throws(()=>deriveCompany(input(),tooTall,templates),e=>e.code==='invalid-makeup-storage-content');
  const genericTooTall=clone(catalog);genericTooTall.resources.find(r=>r.id===ornament.id).mounting.height=.041;const withGeneric=input();withGeneric.nodes.find(n=>n.id==='drawer-content').resource=ref(ornament);
  assert.throws(()=>deriveCompany(withGeneric,genericTooTall,templates),e=>e.code==='invalid-support-fit');
  const legacy=clone(ornament);legacy.supportMotion={drawer:'drawer'};assert.throws(()=>validateSupportResource(legacy,fail),e=>e.code==='invalid-supported-motion');
  return {malformedStorageContracts:mutators.length,overheightCompactRejected:true};
});
await check('continuous support collision kernel catches only an interior crossing of different motion surfaces',()=>{
  // Deliberately co-planar synthetic surfaces exercise the interval kernel. This
  // resource is rejected by the actual fixed storage contract below.
  const resource=clone(storages[0]);delete resource.mount;resource.supportSurfaces[0].topY=.022;resource.supportSurfaces[0].center=[0,.045];
  const parent={id:'parent',kind:'facility',resource:ref(resource),state:{openFraction:0}},a={id:'moving',kind:'facility',parentId:'parent',resource:ref(content),attachment:{surfaceId:'drawer'},transform:{position:[0,.022,-.005],yaw:0}},
    b={id:'fixed',kind:'facility',parentId:'parent',resource:ref(content),attachment:{surfaceId:'top'},transform:{position:[0,.022,.045],yaw:0}};
  const resources=new Map([[`${resource.id}@1`,resource],[`${content.id}@1`,content]]),nodes=new Map([parent,a,b].map(n=>[n.id,n]));
  assert(a.transform.position[2]+.012<b.transform.position[2]-.012);assert(a.transform.position[2]+.09-.012>b.transform.position[2]+.012);
  assert.throws(()=>validateSupportAttachments(nodes,resources,fail),e=>e.code==='overlapping-supported-props');
  assert.throws(()=>validateMakeupStorageResource(resource,fail),e=>e.code==='invalid-makeup-storage-contract');
  return {endpointBoxesDisjoint:true,interiorSweepRejected:true,syntheticContractNotAdmitted:true};
});
await check('children on one moving surface retain their relative placement and are not compared as independent sweeps',()=>{
  const resource=clone(storages[0]);delete resource.mount;resource.supportSurfaces[1].center=[0,-.02];resource.supportSurfaces[1].halfSize[1]=.08;
  const parent={id:'parent',kind:'facility',resource:ref(resource)},children=[-.06,.02].map((z,index)=>({id:`child-${index}`,kind:'facility',parentId:'parent',resource:ref(content),attachment:{surfaceId:'drawer'},transform:{position:[0,.022,z],yaw:0}}));
  const nodes=new Map([parent,...children].map(n=>[n.id,n])),resources=new Map([[`${resource.id}@1`,resource],[`${content.id}@1`,content]]);
  assert.equal(validateSupportAttachments(nodes,resources,fail).length,2);
  assert.throws(()=>validateMakeupStorageResource(resource,fail),e=>e.code==='invalid-makeup-storage-contract');
  return {sharedMotion:true,syntheticContractNotAdmitted:true};
});
await check('missing render pivot and stale scene candidate reject without changing the live root or saved document',()=>{
  const f=sceneFixture();try{
    const saved=f.scene.save(),root=f.scene.root;f.library.control.missingPivot=true;
    assert.throws(()=>f.change([state(.6)]),e=>e.code==='missing-moving-part');assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);f.library.control.missingPivot=false;
    const handle=f.scene.prepareChange([state(.3)]);f.change([state(.7)]);const current=f.scene.root;
    assert.throws(()=>f.scene.commit(handle),e=>e.code==='revision-conflict');f.scene.discard(handle);assert.equal(f.scene.root,current);assertWorlds(f.scene);
    return {missingPivotPreservesRoot:true,staleCandidatePreservesNewerScene:true};
  }finally{f.dispose();}
});
await check('pinned save dependencies detect changed motion content while keeping persisted rest coordinates',async()=>{
  const document=apply(input(),[state(.53)]),text=await encodeCompanySave(document,catalog,templates),parsed=JSON.parse(text);
  near(parsed.document.nodes.find(n=>n.id==='drawer-content').transform.position,[0,.022,-.005]);
  const changed=clone(catalog);changed.resources.find(r=>r.id===storages[0].id).notes='different pinned definition';
  await assert.rejects(()=>decodeCompanySave(text,changed,templates),e=>e.code==='dependency-content-mismatch');
  assert.deepEqual(await decodeCompanySave(text,catalog,templates),document);
  return {rest:[0,.022,-.005],fraction:.53,dependencyMismatchRejected:true};
});
await check('async preparation failures and late failures preserve current scene and stored save bytes',async()=>{
  const library=assetFixture(),memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},world=new THREE.Scene();
  const author=await createCompanyAuthoring(world,input(),{...options,storage,assetLibrary:library});
  try{
    await author.save();const originalBytes=[...memory.values()][0],root=author.scene.root;
    library.control.beforePreload=async()=>{throw Object.assign(Error('Injected load failure'),{code:'synthetic-load-failure'});};
    await assert.rejects(()=>author.apply([state(.4)]),e=>e.code==='synthetic-load-failure');assert.equal(author.scene.root,root);assert.equal([...memory.values()][0],originalBytes);
    let finish,entered;const waiting=new Promise(resolve=>{entered=resolve;});let calls=0;
    library.control.beforePreload=async()=>{if(++calls===1){entered();await new Promise(resolve=>{finish=resolve;});throw Object.assign(Error('Injected late failure'),{code:'synthetic-late-failure'});}};
    const earlier=author.apply([state(.33)]);const handledEarlier=earlier.catch(error=>error);await waiting;
    await author.apply([state(.84)]);await author.save();const finalRoot=author.scene.root,finalBytes=[...memory.values()][0];finish();
    const earlierError=await handledEarlier;assert.equal(earlierError.code,'synthetic-late-failure');assert.equal(author.scene.root,finalRoot);assert.equal([...memory.values()][0],finalBytes);assert.equal(author.document.nodes.find(n=>n.id==='storage').state.openFraction,.84);assertWorlds(author.scene);
    return {initialFailurePreservedStoredBytes:true,lateFailurePreservedNewerScene:true,fraction:.84};
  }finally{author.dispose();}
});

const sourceHashes={};
for(const filename of ['prototype/src/company/makeup-storage-data.js','prototype/src/company/moving-parts.js','prototype/src/company/support-data.js','prototype/src/company/document.js','prototype/src/company/render.js','prototype/src/company/placement.js','prototype/src/company/appearance-contract.js','scripts/company-platform/verify-makeup-storage-motion.mjs'])sourceHashes[filename]=hash(await fs.readFile(filename));
const report={status:checks.every(c=>c.status==='passed')?'passed':'failed',checks,sourceHashes,
  limits:['Data, rest/effective transform, scene graph and transaction/persistence checks use synthetic mesh instances, not production GLBs or a production geometry gate. No mesh contact/cavity/accessibility acceptance is claimed.',
    'The two direct support collision kernel fixtures intentionally change fixed surfaces and are rejected by the admitted storage resource contract. They verify continuous relative motion only.',
    'No browser, GPU, closed-process recovery, ordinary-computer performance or character interaction was exercised. These require separate runtime evidence.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
