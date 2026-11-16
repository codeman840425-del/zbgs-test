import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import input from './space-inputs/building-two-floors.json' with {type:'json'};
import {createScaledCompany} from '../../prototype/src/company/space.js';
import {describeArchitecture} from '../../prototype/src/company/architecture.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {encodeCompanySave} from '../../prototype/src/company/persistence.js';

globalThis.ProgressEvent ??= class extends Event {constructor(type,init={}){super(type);Object.assign(this,init);}};
const root=new URL('../../',import.meta.url),out=new URL('evidence/company-c2-view-independent-v1/',root);
const sourceFiles=['prototype/src/company/render.js','prototype/src/company/authoring.js','prototype/src/company/asset-library.js','prototype/src/company/architecture.js','prototype/src/company/space.js'];
async function hashes(){return Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,createHash('sha256').update(await fs.readFile(new URL(name,root))).digest('hex')])));}
const beforeHashes=await hashes(),checks=[];
const document=createScaledCompany(input,catalog,templates),floor1=`${document.id}/floor-1`,floor2=`${document.id}/floor-2`;
const asset1=catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===1),asset2=catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===2);
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function fixture(initialDocument=document){
  const requests=[],gates=new Map(),world=new THREE.Scene();let busy=()=>false;
  const library=createCompanyAssetLibrary({fetchImpl:async(url,{signal}={})=>{
    const request={url,signal};requests.push(request);const gate=gates.get(url);if(gate){gate.started.resolve();await gate.release.promise;if(gate.fail)return {ok:false,status:503};}
    const bytes=await fs.readFile(new URL(`prototype/public${url}`,root));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
  const authoring=await createCompanyAuthoring(world,initialDocument,{catalog,templates,storage:storage(),assetLibrary:library,isUsePointBusy:id=>busy(id)});
  return {authoring,library,world,requests,gates,setBusy:value=>busy=value,gate(url,fail=false){const gate={started:deferred(),release:deferred(),fail};gates.set(url,gate);return gate;},dispose(){authoring.dispose();library.dispose();}};
}
async function check(name,run){try{checks.push({name,passed:true,observed:await run()});}catch(error){checks.push({name,passed:false,error:error.stack});}}
const logicalNavigation=(scene,floorId)=>{const {floors,obstacles,...navigation}=scene.navigation(floorId);return {...navigation,obstacles:obstacles.map(({object,...entry})=>entry)};};

await check('Real GLB floor selection, same-name state isolation and display resource disposal',async()=>{
  const f=await fixture();try{
    assert.deepEqual(f.requests.map(r=>r.url),[asset1.asset.url]);const {scene}=f.authoring,initial=JSON.stringify(f.authoring.document),old=scene.root,geometryDisposals=[];
    old.traverse(node=>{if(node.geometry)node.geometry.addEventListener('dispose',()=>geometryDisposals.push(node.name));});
    const firstScreen=`${floor1}/room-1/station-1/monitor`,secondScreen=`${floor2}/room-1/station-1/monitor`;
    await f.authoring.setView({floorId:floor2});assert.equal(JSON.stringify(f.authoring.document),initial);assert(!old.parent);assert(geometryDisposals.length>0);
    assert.deepEqual(f.library.snapshot(),{cachedAssets:1,loadedAssets:1});assert(scene.listUsePoints().every(point=>point.facilityId.startsWith(floor2)));
    await f.authoring.apply([{type:'set-state',id:secondScreen,state:{on:false}}]);
    await f.authoring.setView({floorId:floor1});assert.equal(scene.document.nodes.find(n=>n.id===firstScreen).state?.on??true,true);assert.equal(scene.document.nodes.find(n=>n.id===secondScreen).state.on,false);
    return {loadedUrls:f.requests.map(r=>r.url),disposedDisplayedGeometries:geometryDisposals.length,sameNameRooms:scene.document.nodes.filter(n=>n.name==='同名房间').length};
  }finally{f.dispose();}
});

await check('Room focus retains actual contact references and invalidates an older prepared handle',async()=>{
  const f=await fixture();try{const {scene}=f.authoring,old=scene.root,point=scene.listUsePoints()[0],saved=scene.save(),physical=describeArchitecture(scene.document,catalog,templates),navigation=logicalNavigation(scene,floor1);
    const handle=scene.prepareChange([{type:'set-state',id:`${floor1}/room-1/station-1/monitor`,state:{on:false}}]);
    await f.authoring.setView({mode:'room',roomId:`${floor1}/room-2`});assert.equal(scene.root,old);assert.equal(scene.resolveUsePoint(point.id).chairSeat,point.chairSeat);assert.equal(scene.save(),saved);assert.deepEqual(logicalNavigation(scene,floor1),navigation);
    assert.throws(()=>scene.commit(handle),e=>e.code==='revision-conflict');scene.discard(handle);
    assert(physical.walls.every(w=>w.size[1]===2.8));assert(scene.walls.every(w=>Math.abs(w.geometry.parameters.height*w.scale.y-.504)<1e-10));
    return {physicalWallHeight:2.8,displayedWallHeight:.504,contactReferencePreserved:true};
  }finally{f.dispose();}
});

await check('Building overview releases GLB cache and retains complete per-floor physical navigation',async()=>{
  const f=await fixture();try{const {scene}=f.authoring,saved=scene.save(),navigation=[floor1,floor2].map(id=>logicalNavigation(scene,id));
    await f.authoring.setView({mode:'building'});assert.equal(scene.save(),saved);assert.deepEqual([floor1,floor2].map(id=>logicalNavigation(scene,id)),navigation);
    assert.equal(scene.snapshot().displayedFacilities,0);assert.equal(scene.listUsePoints().length,0);assert.deepEqual(f.library.snapshot(),{cachedAssets:0,loadedAssets:0});
    let meshes=0;scene.root.traverse(n=>{if(n.isMesh)meshes++;});assert.equal(meshes,0);return {overviewMeshes:meshes,logicalNodes:scene.document.nodes.length,perFloorWallObstacles:navigation.map(n=>n.obstacles.filter(o=>o.kind==='wall').length)};
  }finally{f.dispose();}
});

await check('Overlapping floor views use the latest requested floor and cancel the stale cache entry',async()=>{
  const f=await fixture();try{const gate=f.gate(asset2.asset.url),pending=f.authoring.setView({floorId:floor2}).then(()=>({resolved:true}),e=>({code:e.code}));await gate.started.promise;
    await f.authoring.setView({floorId:floor1,mode:'room',roomId:`${floor1}/room-1`});gate.release.resolve();const stale=await pending;
    assert.equal(stale.code,'asset-load-cancelled');assert.equal(f.authoring.scene.view.floorId,floor1);assert.equal(f.authoring.scene.view.mode,'room');assert.deepEqual(f.library.snapshot(),{cachedAssets:1,loadedAssets:1});
    return {stale,staleFetchAborted:f.requests.at(-1).signal.aborted};
  }finally{f.dispose();}
});

for(const latestOperation of ['edit','load'])await check(`A ${latestOperation} while another floor loads preserves the winning full document`,async()=>{
  const f=await fixture();try{const gate=f.gate(asset2.asset.url),pending=f.authoring.setView({floorId:floor2}).then(()=>({resolved:true}),e=>({code:e.code}));await gate.started.promise;
    if(latestOperation==='edit')await f.authoring.apply([{type:'set-state',id:`${floor1}/room-1/station-1/monitor`,state:{on:false}}]);
    else {const next=structuredClone(document);next.name='Winning replacement';await f.authoring.load(next);}
    const saved=JSON.stringify(f.authoring.document);gate.release.resolve();await pending;assert.equal(JSON.stringify(f.authoring.document),saved);assert.equal(f.authoring.scene.view.floorId,floor1);assert.equal(f.authoring.document.nodes.filter(n=>n.kind==='floor').length,2);assert.deepEqual(f.library.snapshot(),{cachedAssets:1,loadedAssets:1});return {winningDocumentPreserved:true};
  }finally{f.dispose();}
});

await check('Failed next-floor fetch preserves live root and complete document and evicts failed cache',async()=>{
  const f=await fixture();try{const gate=f.gate(asset2.asset.url,true),old=f.authoring.scene.root,saved=JSON.stringify(f.authoring.snapshot()),pending=f.authoring.setView({floorId:floor2});await gate.started.promise;gate.release.resolve();await assert.rejects(pending,e=>e.code==='asset-fetch-failed');assert.equal(f.authoring.scene.root,old);assert.equal(JSON.stringify(f.authoring.snapshot()),saved);assert.deepEqual(f.library.snapshot(),{cachedAssets:1,loadedAssets:1});return {failure:'asset-fetch-failed',currentRootPreserved:true};}finally{f.dispose();}
});

await check('Building overview whole-document restore checks an occupied offscreen contact',async()=>{
  const f=await fixture();try{await f.authoring.setView({mode:'building'});const busyPoint=`${floor2}/room-1/station-1/chair#seat`;f.setBusy(id=>id===busyPoint);const old=f.authoring.scene.root,saved=JSON.stringify(f.authoring.document);await assert.rejects(f.authoring.load(document),e=>e.code==='facility-busy');assert.equal(f.authoring.scene.root,old);assert.equal(JSON.stringify(f.authoring.document),saved);assert.deepEqual(f.library.snapshot(),{cachedAssets:0,loadedAssets:0});return {busyPoint,logicalGuardConsulted:true};}finally{f.dispose();}
});

for(const invalidOperation of ['apply','import','upgrade','restore'])await check(`Rejected ${invalidOperation} superseding a pending floor load releases unneeded resources`,async()=>{
  const f=await fixture();try{const gate=f.gate(asset2.asset.url),pending=f.authoring.setView({floorId:floor2}).then(()=>({resolved:true}),e=>({code:e.code}));await gate.started.promise;
    const run={apply:()=>f.authoring.apply([{type:'unknown-operation'}]),import:()=>f.authoring.import('{'),upgrade:()=>f.authoring.upgrade('missing',{id:'stream-station',version:2}),restore:()=>f.authoring.restore('missing')}[invalidOperation];
    await assert.rejects(run());gate.release.resolve();const stale=await pending;const observed={stale,cache:f.library.snapshot(),view:f.authoring.scene.view};
    assert.deepEqual(observed.cache,{cachedAssets:1,loadedAssets:1},JSON.stringify(observed));return observed;
  }finally{f.dispose();}
});

await check('Stale import finishing dependency verification cannot start orphaned asset loads after a newer floor wins',async()=>{
  const f=await fixture(),originalDigest=crypto.subtle.digest;
  try{
    const older=createScaledCompany({id:'older-document',scale:'single-room',floors:[{rooms:[{purpose:'rest',sofaVersion:1}]}]},catalog,templates);
    const text=await encodeCompanySave(older,catalog,templates),gate=deferred();let intercepted=false;
    crypto.subtle.digest=async function(...args){if(!intercepted){intercepted=true;await gate.promise;}return originalDigest.apply(this,args);};
    const pending=f.authoring.import(text).then(()=>({resolved:true}),e=>({code:e.code}));
    await f.authoring.setView({floorId:floor2});assert.equal(f.library.snapshot().loadedAssets,1);const count=f.requests.length;
    gate.resolve();const result=await pending;assert.equal(result.code,'revision-conflict');assert.equal(f.authoring.document.id,document.id);assert.equal(f.authoring.scene.view.floorId,floor2);
    const observed={result,lateRequests:f.requests.slice(count).map(r=>r.url),cache:f.library.snapshot()};
    assert.deepEqual(observed.cache,{cachedAssets:1,loadedAssets:1},JSON.stringify(observed));return observed;
  }finally{crypto.subtle.digest=originalDigest;f.dispose();}
});

await check('One failed asset cancels a sibling late GLB and disposes its parsed resources',async()=>{
  const custom=createScaledCompany({id:'parallel-failure',scale:'building',floors:[{rooms:[{purpose:'rest',sofaVersion:1}]},{rooms:[{purpose:'rest',sofaVersion:2},{purpose:'rest',sofaVersion:1}]}]},catalog,templates);
  custom.nodes.find(n=>n.id==='parallel-failure/floor-2/room-2/sofa').resource={id:'timber-sofa',version:1};
  const timber=catalog.resources.find(r=>r.id==='timber-sofa'),f=await fixture(custom),originalDispose=THREE.BufferGeometry.prototype.dispose;
  let lateDisposals=0;
  try{
    const failed=f.gate(asset2.asset.url,true),late=f.gate(timber.asset.url),old=f.authoring.scene.root,saved=JSON.stringify(f.authoring.document);
    const pending=f.authoring.setView({floorId:'parallel-failure/floor-2'});await Promise.all([failed.started.promise,late.started.promise]);failed.release.resolve();await assert.rejects(pending,e=>e.code==='asset-fetch-failed');
    const lateRequest=f.requests.find(r=>r.url===timber.asset.url);assert(lateRequest.signal.aborted);assert.equal(f.authoring.scene.root,old);assert.equal(JSON.stringify(f.authoring.document),saved);
    const disposed=deferred();let timeout;
    THREE.BufferGeometry.prototype.dispose=function(){lateDisposals++;disposed.resolve();return originalDispose.call(this);};late.release.resolve();
    try{await Promise.race([disposed.promise,new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('Late parsed resource was not disposed within 2 seconds')),2000);})]);}finally{clearTimeout(timeout);}
    assert(lateDisposals>0);assert.deepEqual(f.library.snapshot(),{cachedAssets:1,loadedAssets:1});return {lateFetchAborted:true,lateParsedGeometryDisposals:lateDisposals,currentDocumentPreserved:true};
  }finally{THREE.BufferGeometry.prototype.dispose=originalDispose;f.dispose();}
});

await fs.mkdir(out,{recursive:true});
const afterHashes=await hashes(),report={status:checks.every(row=>row.passed)?'passed':'failed',generatedAt:new Date().toISOString(),configuration:{requestedModel:'gpt-6.1-sol',requestedReasoningEffort:'high',difficulty:'complex',actualProviderConfiguration:'not independently verified',hostHookInterception:'not independently verified'},beforeHashes,afterHashes,sourcesStable:JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),checks,limits:['CPU actual Three scene construction and GLTFLoader parsing only. No GPU, browser or character integration.', 'Fetch gates intentionally ignore abort to verify late-result cancellation and resource ownership.']};
await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,failures:checks.filter(row=>!row.passed)},null,2));if(report.status!=='passed')process.exitCode=1;
