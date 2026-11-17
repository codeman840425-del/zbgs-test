import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,deriveCompany,prepareCompanyChange,composeTransform,serializeCompany,restoreCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {SIDE_TABLE_PROFILE,SIDE_TABLE_IDS,SIDE_TABLE_MOUNTING,SIDE_TABLE_SUPPORT_SURFACES,validateSideTableResource} from '../../prototype/src/company/side-table-data.js';

const output=path.resolve(process.argv[2]||'evidence/company-side-table-data-v1');await fs.mkdir(output,{recursive:true});
const checks=[],clone=value=>structuredClone(value),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
async function check(name,action){try{checks.push({name,status:'passed',detail:await action()});}catch(error){checks.push({name,status:'failed',code:error.code,error:error.stack});}}
const sources=JSON.parse(await fs.readFile('prototype/src/company/library-catalog.json','utf8'));
const vase=sources.resources.find(r=>r.id==='tabletop-ornament-vase'&&r.version===1);assert(vase,'Use the existing registered supported vase witness');
const tables=SIDE_TABLE_IDS.map(id=>({id,version:1,displayName:id,category:'decor',mountRole:'side-table',productionBranch:'side-table',mount:'floor-surface',
  mounting:clone(SIDE_TABLE_MOUNTING),coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Bottom centre',scale:'Identity only'},
  asset:{format:'glb',url:'/synthetic-side-table-only.glb',sha256:'0'.repeat(64),bytes:20},footprint:{center:[0,0],halfSize:[.4,.275],blocking:true},
  usePoints:[],stateDefaults:{},supportSurfaces:clone(SIDE_TABLE_SUPPORT_SURFACES),supportNodes:{top:'side-table-top'}}));
const future={...clone(tables[0]),id:'side-table-future-style',version:2};future.asset.sha256='1'.repeat(64);
const catalog={id:'side-table-data-fixture',version:1,resources:[...tables,future,vase]},templates={templates:[]},options={catalog,templates};
const ref=r=>({id:r.id,version:r.version});
const add=(id,parentId,resource,position,surfaceId,yaw=0)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw},...(surfaceId?{attachment:{surfaceId}}:{})});
const change=(document,operations)=>prepareCompanyChange(document,operations,options).document;
function input(){const document=createCompany({id:'side-table-data',width:7,depth:5.25},catalog);return change(document,[add('table',document.nodes[1].id,tables[0],[0,0,-.5]),add('vase','table',vase,[0,.5,0],'top')]);}
function near(actual,expected){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-8,`${actual} != ${expected}`);}

// These synthetic meshes exercise existing scene loading and transactions. They
// do not stand in for Kenney source adaptation or real production geometry gates.
function libraryFixture(){const control={beforePreload:null,instantiateFailure:false};return{control,async preload(resources){await control.beforePreload?.(resources);},retainOnly(){},instantiate(resource){
  if(control.instantiateFailure&&resource.mountRole==='side-table')throw Object.assign(Error('Synthetic instance failure'),{code:'synthetic-instance-failure'});
  const root=new THREE.Group(),nodes=new Map();root.name='Synthetic instance';
  const table=resource.mountRole==='side-table',geometry=table?new THREE.BoxGeometry(.3,.04,.22).translate(0,.48,0):new THREE.BoxGeometry(resource.mounting.width,resource.mounting.height,resource.mounting.depth).translate(0,resource.mounting.height/2,0);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.name=table?'side-table-top':'vase';root.add(mesh);nodes.set(mesh.name,mesh);return{root,nodes};
}};}
function fixture(document=input()){const library=libraryFixture(),world=new THREE.Scene(),scene=createCompanyScene(world,document,{...options,assetLibrary:library});return{library,world,scene,
  apply(operations){let handle;try{handle=scene.prepareChange(operations);scene.commit(handle);}finally{if(handle)scene.discard(handle);}},dispose(){scene.dispose();}};}
function agree(scene){const derived=deriveCompany(scene.document,catalog,templates);for(const facility of derived.facilities)near(scene.root.getObjectByName(facility.id).getWorldPosition(new THREE.Vector3()).toArray(),facility.world.position);return derived;}

await check('four static variants and a new identity/version share the original support function',()=>{
  for(const resource of [...tables,future]){validateSideTableResource(resource,fail);validateSupportResource(resource,fail);assert(compareFacilityFunction(tables[0],resource).compatible);}
  const changed=clone(future);changed.supportSurfaces[0].clearanceHeight=.36;assert(!compareFacilityFunction(tables[0],changed).compatible);assert.throws(()=>validateSupportResource(changed,fail),e=>e.code==='invalid-side-table-contract');
  return{profile:SIDE_TABLE_PROFILE,firstBatch:tables.map(ref),future:ref(future),dynamicFieldsAdded:false};
});
await check('unknown fields, altered support mappings and unnecessary dynamic mechanisms reject',()=>{
  const changes=[r=>r.mountRole='desk',r=>r.productionBranch='desk',r=>r.category='dynamic',r=>r.mount='support-surface',r=>r.mounting.width=.65,
    r=>r.footprint.halfSize[1]=.25,r=>r.footprint.blocking=false,r=>r.supportSurfaces[0].topY=.51,r=>r.supportSurfaces[0].center[0]=.01,
    r=>r.supportSurfaces[0].halfSize[0]=.16,r=>r.supportSurfaces[0].clearanceHeight=.4,r=>r.supportSurfaces.push(clone(r.supportSurfaces[0])),
    r=>r.supportNodes.top='small-table-top',r=>r.stateDefaults.openFraction=0,r=>r.stateSchema={},r=>r.stateSemantics={},r=>r.movingParts=[],
    r=>r.movingProfile='static-side-table',r=>r.supportMotion={},r=>r.light={},r=>r.usePoints=[{id:'seat'}],r=>r.unknown=true,r=>r.asset.extra=1,r=>r.version=0];
  for(const mutate of changes){const bad=clone(tables[0]);mutate(bad);assert.throws(()=>validateSupportResource(bad,fail),e=>e.code==='invalid-side-table-contract');}
  const renamed=clone(future);renamed.mountRole='other';assert.throws(()=>validateSideTableResource(renamed,fail),e=>e.code==='invalid-side-table-contract');
  return{rejectedDefinitions:changes.length+1};
});
await check('every parent quarter turn and child yaw agree between static derived and rendered transforms',()=>{
  const f=fixture();try{for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
      const transform={position:[1,0,.3],yaw},local={position:[.03,.5,-.02],yaw:Math.PI/2};
      f.apply([{type:'move',id:'table',transform},{type:'move',id:'vase',transform:local}]);const derived=agree(f.scene);
      near(derived.worlds.get('vase').position,composeTransform(transform,local).position);assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='vase').transform,local);
    }return{parentQuarterTurns:4,childYaw:Math.PI/2,restPosition:[.03,.5,-.02]};
  }finally{f.dispose();}
});
await check('four appearances and explicit resource version preserve child identity through serialize and pinned recovery',async()=>{
  const f=fixture();try{const child=clone(f.scene.document.nodes.find(n=>n.id==='vase'));
    for(const resource of [...tables,future]){f.apply([{type:'replace-resource',id:'table',resource:ref(resource)}]);assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='vase'),child);
      assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='table').state,{});const text=f.scene.save();f.scene.restore(text);assert.equal(f.scene.save(),text);agree(f.scene);
      const envelope=await encodeCompanySave(f.scene.document,catalog,templates);assert.deepEqual(await decodeCompanySave(envelope,catalog,templates),f.scene.document);
    }return{appearances:4,futureVersion:2,childId:child.id};
  }finally{f.dispose();}
});
await check('copy-facility creates independent table/child IDs while preserving attachment, resource and local coordinates',()=>{
  const f=fixture();try{const originalChild=clone(f.scene.document.nodes.find(n=>n.id==='vase'));
    f.apply([{type:'copy-facility',id:'table',newId:'table-copy',transform:{position:[1.4,0,.3],yaw:Math.PI/2}}]);
    const copied=f.scene.document.nodes.find(n=>n.parentId==='table-copy');assert(copied);assert.notEqual(copied.id,'vase');assert.deepEqual(copied.attachment,originalChild.attachment);assert.deepEqual(copied.transform,originalChild.transform);assert.deepEqual(copied.resource,originalChild.resource);agree(f.scene);
    f.apply([{type:'move',id:'table-copy',transform:{position:[-1.4,0,.3],yaw:Math.PI}}]);assert.deepEqual(f.scene.document.nodes.find(n=>n.id==='vase'),originalChild);
    const text=f.scene.save();f.scene.restore(text);assert.equal(f.scene.save(),text);assert.equal(new Set(f.scene.document.nodes.map(n=>n.id)).size,f.scene.document.nodes.length);
    return{tableCopy:'table-copy',childCopy:copied.id,sourceChildUnchanged:true};
  }finally{f.dispose();}
});
await check('surface position/height/rotation, overlap, state, missing resource and duplicate copy failures preserve live and stored document bytes',()=>{
  const f=fixture();try{const saved=f.scene.save(),root=f.scene.root,codes=[];
    const cases=[[{type:'move',id:'vase',transform:{position:[.08,.5,0],yaw:0}}],[{type:'move',id:'vase',transform:{position:[0,.501,0],yaw:0}}],
      [{type:'move',id:'vase',transform:{position:[.03,.5,.04],yaw:Math.PI/2}}],
      [{type:'attach-surface',id:'vase',parentId:'table',surfaceId:'missing',transform:{position:[0,.5,0],yaw:0}}],
      [add('overlap-child','table',vase,[0,.5,0],'top')],[{type:'copy-facility',id:'table',newId:'overlap-table',transform:{position:[.4,0,-.5],yaw:0}}],
      [{type:'move',id:'table',transform:{position:[0,.01,-.5],yaw:0}}],[{type:'move',id:'table',transform:{position:[3.2,0,0],yaw:0}}],
      [{type:'set-state',id:'table',state:{openFraction:0}}],[{type:'replace-resource',id:'table',resource:{id:tables[0].id,version:99}}],
      [{type:'copy-facility',id:'table',newId:'table'}]];
    for(const operations of cases){assert.throws(()=>f.apply(operations),error=>{codes.push(error.code);return Boolean(error.code);});assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);}
    return{cases:cases.length,codes};
  }finally{f.dispose();}
});
await check('wrong structural parent and overheight supported item reject through unchanged generic admission',()=>{
  const parentBad=input();parentBad.nodes.push({id:'group',kind:'assembly',parentId:'side-table-data/room-1',transform:{position:[0,0,0],yaw:0}});parentBad.nodes.find(n=>n.id==='table').parentId='group';
  assert.throws(()=>deriveCompany(parentBad,catalog,templates),e=>e.code==='missing-mount-region');
  const tallCatalog=clone(catalog);tallCatalog.resources.find(r=>r.id===vase.id&&r.version===vase.version).mounting.height=.36;
  assert.throws(()=>deriveCompany(input(),tallCatalog,templates),e=>e.code==='invalid-support-fit');
  return{parentMustBeDirectRoomOrArea:true,clearanceHeight:.35,attemptedHeight:.36};
});
await check('instance construction failure and stale prepare/commit candidates retain the previous live scene',()=>{
  const f=fixture();try{const root=f.scene.root,saved=f.scene.save();f.library.control.instantiateFailure=true;
    assert.throws(()=>f.apply([{type:'replace-resource',id:'table',resource:ref(tables[1])}]),e=>e.code==='synthetic-instance-failure');assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);f.library.control.instantiateFailure=false;
    const handle=f.scene.prepareChange([{type:'replace-resource',id:'table',resource:ref(tables[2])}]);f.apply([{type:'replace-resource',id:'table',resource:ref(tables[3])}]);const newer=f.scene.root;
    assert.throws(()=>f.scene.commit(handle),e=>e.code==='revision-conflict');f.scene.discard(handle);assert.equal(f.scene.root,newer);agree(f.scene);
    return{instanceFailurePreservedRoot:true,staleCandidateRejected:true};
  }finally{f.dispose();}
});
await check('dependency pins reject changed definitions while a complete same-input restore preserves the static subtree',async()=>{
  const document=input(),text=await encodeCompanySave(document,catalog,templates),changed=clone(catalog);changed.resources.find(r=>r.id===tables[0].id).notes='Changed external recipe metadata';
  await assert.rejects(()=>decodeCompanySave(text,changed,templates),e=>e.code==='dependency-content-mismatch');assert.deepEqual(await decodeCompanySave(text,catalog,templates),document);
  assert.deepEqual(restoreCompany(serializeCompany(document,catalog,templates),catalog,templates),document);return{dependencyMismatchRejected:true,staticState:{}};
});
await check('async preload and late failures preserve the newer external-resource identity, scene and persisted save',async()=>{
  const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},library=libraryFixture(),author=await createCompanyAuthoring(new THREE.Scene(),input(),{...options,assetLibrary:library,storage});
  try{await author.save();const saved=[...memory.values()][0],root=author.scene.root;library.control.beforePreload=async()=>{throw Object.assign(Error('Synthetic source unavailable'),{code:'synthetic-load-failure'});};
    await assert.rejects(()=>author.apply([{type:'replace-resource',id:'table',resource:ref(tables[1])}]),e=>e.code==='synthetic-load-failure');assert.equal(author.scene.root,root);assert.equal([...memory.values()][0],saved);
    let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});let count=0;
    library.control.beforePreload=async()=>{if(++count===1){entered();await new Promise(resolve=>{release=resolve;});throw Object.assign(Error('Synthetic late source failure'),{code:'synthetic-late-load-failure'});}};
    const late=author.apply([{type:'replace-resource',id:'table',resource:ref(tables[1])}]).catch(error=>error);await waiting;await author.apply([{type:'replace-resource',id:'table',resource:ref(tables[3])}]);await author.save();const finalRoot=author.scene.root,finalBytes=[...memory.values()][0];release();
    assert.equal((await late).code,'synthetic-late-load-failure');assert.equal(author.scene.root,finalRoot);assert.equal([...memory.values()][0],finalBytes);assert.equal(author.document.nodes.find(n=>n.id==='table').resource.id,tables[3].id);agree(author.scene);
    return{initialFailurePreservedSave:true,lateFailurePreservedNewerIdentity:tables[3].id};
  }finally{author.dispose();}
});

const sourceHashes={};for(const filename of ['docs/COMPANY-SIDE-TABLE-CONTRACT-v1.txt','prototype/src/company/side-table-data.js','prototype/src/company/support-data.js','scripts/company-platform/test-side-table-data.mjs'])sourceHashes[filename]=hash(await fs.readFile(filename));
const report={status:checks.every(check=>check.status==='passed')?'passed':'failed',checks,sourceHashes,
  limits:['Synthetic table meshes exercise existing data, scene, subtree and transaction/persistence paths. They do not verify Kenney source preservation, circular adaptation, nested-table contact or actual production GLB geometry.',
    'The existing registered vase resource descriptor is reused, with a synthetic scene instance here. Source/real GLB readback and external-license/provenance delivery require separate production evidence.',
    'No browser, GPU, process restart, ordinary-computer performance or character-use acceptance was exercised.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
