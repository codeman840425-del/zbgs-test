import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import baseCatalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,deriveCompany,prepareCompanyChange,serializeCompany} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';

const catalog=structuredClone(baseCatalog);
const finishNode=()=>({id:'finish-surface',type:'mesh',geometry:{type:'BoxGeometry',parameters:[1,1,.01]},material:{type:'MeshStandardMaterial',color:'#ffffff'}});
const finishResource=(id,allowed)=>({id,version:1,kind:'surface-finish',mountRole:'surface-finish',coordinates:{units:'metres',up:'+Y',forward:'+Z'},finish:{allowedSurfaces:[allowed],materialNode:'finish-surface',tileMeters:[1,1]},materialSlots:{finish:['finish-surface']},stateDefaults:{},asset:{format:'glb',url:`/${id}.glb`,sha256:`${id}-sha`},node:finishNode()});
catalog.resources.push(finishResource('surface-wall-a','wall'),finishResource('surface-floor-a','floor'),finishResource('surface-wall-b','wall'));
const context={catalog,templates};
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});}
function baseDocument(){return createCompany({},catalog);}
function withFinish(document,finishes){const next=structuredClone(document);next.nodes.find(n=>n.kind==='room').finishes=finishes;return next;}

await check('Derivation resolves selected floor and wall finishes with stable shape and defaults',async()=>{
  const d=deriveCompany(withFinish(baseDocument(),{floor:{resource:{id:'surface-floor-a',version:1},tileMeters:[.1,4],quarterTurns:3},north:{resource:{id:'surface-wall-a',version:1}}}),catalog,templates);
  assert.deepEqual(d.surfaceFinishes.map(f=>[f.id,f.surface,f.tileMeters,f.quarterTurns]),[
    ['company-demo/room-1#finish:floor','floor',[.1,4],3],['company-demo/room-1#finish:north','north',[1,1],0]]);
  assert.equal(d.surfaceFinishes[0].floorId,'company-demo/floor-1');
  assert.equal(d.surfaceFinishes[0].resource.kind,'surface-finish');
});

await check('Set, replace and clear surface finishes preserve facilities and use points',async()=>{
  const original=prepareCompanyChange(baseDocument(),[{type:'add-workstation',id:'station-1',parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[0,0,0],yaw:0}}],context).document;
  const before=deriveCompany(original,catalog,templates);
  const changed=prepareCompanyChange(original,[{type:'set-surface-finish',id:'company-demo/room-1',surface:'north',finish:{resource:{id:'surface-wall-a',version:1}}}],{...context,isUsePointBusy:()=>true});
  assert.equal(changed.document.revision,2);
  assert.deepEqual(changed.derived.usePoints.map(p=>p.id),before.usePoints.map(p=>p.id));
  assert.deepEqual(changed.derived.facilities.map(f=>f.id),before.facilities.map(f=>f.id));
  const cleared=prepareCompanyChange(changed.document,[{type:'set-surface-finish',id:'company-demo/room-1',surface:'north',finish:null}],context);
  assert.equal(cleared.document.nodes.find(n=>n.kind==='room').finishes,undefined);
});

await check('Invalid owner, key, resource type, surface compatibility, scale and rotation are rejected',async()=>{
  const cases=[
    () => deriveCompany({...baseDocument(),nodes:[...baseDocument().nodes.map(n=>n.kind==='floor'?{...n,finishes:{floor:{resource:{id:'surface-floor-a',version:1}}}}:n)]},catalog,templates),
    () => prepareCompanyChange(baseDocument(),[{type:'set-surface-finish',id:'company-demo/room-1',surface:'ceiling',finish:{resource:{id:'surface-wall-a',version:1}}}],context),
    () => prepareCompanyChange(baseDocument(),[{type:'set-surface-finish',id:'company-demo/room-1',surface:'floor',finish:{resource:{id:'desk',version:1}}}],context),
    () => prepareCompanyChange(baseDocument(),[{type:'set-surface-finish',id:'company-demo/room-1',surface:'floor',finish:{resource:{id:'surface-wall-a',version:1}}}],context),
    () => prepareCompanyChange(baseDocument(),[{type:'set-surface-finish',id:'company-demo/room-1',surface:'floor',finish:{resource:{id:'surface-floor-a',version:1},tileMeters:[4.1,1]}}],context),
    () => prepareCompanyChange(baseDocument(),[{type:'set-surface-finish',id:'company-demo/room-1',surface:'floor',finish:{resource:{id:'surface-floor-a',version:1},quarterTurns:4}}],context),
  ];
  for(const run of cases)assert.throws(run);
});

await check('Surface resources cannot be installed as facilities',async()=>{
  assert.throws(()=>prepareCompanyChange(baseDocument(),[{type:'add-facility',id:'bad-finish',parentId:'company-demo/room-1',resource:{id:'surface-floor-a',version:1},transform:{position:[0,0,0],yaw:0}}],context),e=>e.code==='surface-finish-as-facility');
});

await check('Save pins all selected finish resources and rejects content changes while old documents remain byte-stable',async()=>{
  const old=baseDocument(),oldBytes=serializeCompany(old,catalog,templates),saved=await encodeCompanySave(old,catalog,templates);
  assert.deepEqual(JSON.parse(saved).dependencies.resources.map(r=>r.id),[]);
  const doc=withFinish(old,{floor:{resource:{id:'surface-floor-a',version:1}},north:{resource:{id:'surface-wall-a',version:1}}});
  const text=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(JSON.parse(text).dependencies.resources.map(r=>r.id),['surface-floor-a','surface-wall-a']);
  const changed=structuredClone(catalog);changed.resources.find(r=>r.id==='surface-floor-a').finish.tileMeters[0]=2;
  await assert.rejects(()=>decodeCompanySave(text,changed,templates),e=>e.code==='dependency-content-mismatch');
  assert.equal(serializeCompany(old,catalog,templates),oldBytes);
});

await check('Authoring preloads and retains only the current floor finish resources',async()=>{
  const doc=withFinish(baseDocument(),{floor:{resource:{id:'surface-floor-a',version:1}},north:{resource:{id:'surface-wall-a',version:1}}});
  const preloaded=[],retained=[];
  const assetLibrary={preload:async resources=>preloaded.push(...resources.map(r=>r.id)),retainOnly:resources=>retained.push(...resources.map(r=>r.id)),instantiate:resource=>{const texture=new THREE.Texture({width:1,height:1});const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({map:texture}));const root=new THREE.Group();root.add(mesh);return {root,nodes:new Map([['finish-surface',mesh]])};}};
  const authoring=await createCompanyAuthoring(new THREE.Scene(),doc,{...context,storage:{getItem:()=>null,setItem:()=>{}},assetLibrary});
  assert(preloaded.includes('surface-floor-a')&&preloaded.includes('surface-wall-a'));
  await authoring.setView({floorId:'company-demo/floor-1'});
  assert(retained.includes('surface-floor-a')&&retained.includes('surface-wall-a'));
  authoring.dispose();
});

const out=new URL('../../evidence/company-surface-data-v1/',import.meta.url);await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['Data and CPU authoring checks only. Browser shutdown, actual GLB texture provenance and rendered continuity remain render/evidence responsibilities.']},null,2)+'\n');
console.log(`${checks.length} surface data checks passed`);
