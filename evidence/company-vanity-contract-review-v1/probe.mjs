import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createCompany,deriveCompany,prepareCompanyChange,serializeCompany,restoreCompany,pointInTransform} from '../../prototype/src/company/document.js';
import {VANITY_CLEARANCE} from '../../prototype/src/company/vanity-data.js';
import {describeArchitecture} from '../../prototype/src/company/architecture.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';

const root=new URL('../../',import.meta.url);
const files=['docs/COMPANY-VANITY-TABLE-CONTRACT-v1.txt','prototype/src/company/vanity-data.js','prototype/src/company/document.js','prototype/src/company/asset-library.js','scripts/company-platform/build-library.mjs','scripts/company-platform/library-inputs.json','prototype/src/company/library-catalog.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await fs.readFile(new URL(p,root))).digest('hex')])));
const beforeHashes=await hashes();
const catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root),'utf8'));
const templates={templates:[]};
const context={catalog,templates};
const table={id:'review-vanity',version:1,category:'decor',mountRole:'vanity-table',mount:'floor-surface',asset:{format:'glb',url:'/company-assets/review-placeholder.glb',sha256:'0'.repeat(64),bytes:20},coordinates:{units:'metres',up:'+Y',forward:'+Z'},mounting:{origin:'bottom',width:1.1,height:.78,depth:.5},footprint:{center:[0,0],halfSize:[.55,.25],blocking:true},supportSurfaces:[{id:'top',center:[.02,0],topY:.78,halfSize:[.40,.22],clearanceHeight:.65}],supportNodes:{top:'vanity-top'},clearance:structuredClone(VANITY_CLEARANCE),usePoints:[],stateDefaults:{}};
catalog.resources.push(table);
const ref={id:table.id,version:1};
const seatRef={id:'vanity-chair-side-entry',version:1};
const change=(doc,ops)=>prepareCompanyChange(doc,ops,context);
const derive=doc=>deriveCompany(doc,catalog,templates);
const serial=doc=>serializeCompany(doc,catalog,templates);
const base=(size=8)=>createCompany({id:'review-company',width:size,depth:size},catalog);
const room='review-company/room-1',floor='review-company/floor-1';
const add=(id,resource,position,yaw=0,parentId=room)=>({type:'add-facility',id,parentId,resource,transform:{position,yaw}});
const pair=(doc=base(),position=[0,0,0],yaw=0)=>change(doc,[add('vanity',ref,position,yaw),add('seat',seatRef,pointInTransform({position,yaw},[.02,0,.55]),yaw+Math.PI)]).document;
const checks=[];
function check(name,run){try{checks.push({name,status:'passed',observed:run()});}catch(e){checks.push({name,status:'failed',error:{message:e.message,code:e.code}});}}
function rejects(doc,ops,codes){const before=serial(doc);let error;try{change(doc,ops);}catch(e){error=e;}assert(error,'Illegal change was accepted');assert(codes.includes(error.code),`${error.code} was not one of ${codes}`);assert.equal(serial(doc),before);return{code:error.code,originalPreserved:true};}

check('side-entry adapter preserves old chair geometry, material slots and original use points',()=>{
  const source=catalog.resources.find(r=>r.id==='chair'&&r.version===1),adapter=catalog.resources.find(r=>r.id===seatRef.id&&r.version===1);
  assert.deepEqual(source.usePoints[0].approach,[0,0,.6]);assert.deepEqual(source.usePoints[0].exit,[0,0,.65]);
  assert.deepEqual(adapter.node,source.node);assert.deepEqual(adapter.materialSlots,source.materialSlots);
  assert.equal(createHash('sha256').update(JSON.stringify(source)).digest('hex'),adapter.provenance.functionalAdapter.source.sha256);
  return{sourceIdentity:'chair@1',adapterIdentity:'vanity-chair-side-entry@1',sameGeometry:true,sourceDigestVerified:true};
});
check('empty table and correctly paired chair derive and serialize/restore',()=>{
  const empty=change(base(),[add('vanity',ref,[0,0,0])]).document;assert.equal(derive(empty).vanityClearances[0].seatId,null);
  const doc=pair();assert.equal(derive(doc).vanityClearances[0].seatId,'seat');assert.deepEqual(restoreCompany(serial(doc),catalog,templates),doc);return{emptyAllowed:true,pairAllowed:true};
});
check('wrong chair position rejects atomically',()=>rejects(pair(),[{type:'move',id:'seat',transform:{position:[.04,0,.55],yaw:Math.PI}}],['blocked-vanity-clearance','unpaired-vanity-seat']));
check('wrong chair facing rejects atomically',()=>rejects(pair(),[{type:'move',id:'seat',transform:{position:[.02,0,.55],yaw:0}}],['blocked-vanity-clearance','unpaired-vanity-seat']));
check('orphan side-entry chair rejects',()=>rejects(base(),[add('seat',seatRef,[0,0,0])],['unpaired-vanity-seat']));
check('chair cannot be attached to table and implicitly follow a table-only move',()=>{
  const original=base(),before=serial(original);let attached;
  try{attached=change(original,[add('vanity',ref,[0,0,0]),add('seat',seatRef,[.02,0,.55],Math.PI,'vanity')]);}catch(error){assert(['invalid-vanity-seat-parent','unpaired-vanity-seat','invalid-vanity-seat'].includes(error.code),error.code);assert.equal(serial(original),before);return{rejected:true,code:error.code,originalPreserved:true};}
  const moved=change(attached.document,[{type:'move',id:'vanity',transform:{position:[1,0,0],yaw:Math.PI/2}}]);
  writeFileSync(new URL('attached-chair-accepted.company.json',import.meta.url),serial(moved.document));
  assert.fail(`Table-parented chair was accepted and automatically followed a table-only move to ${JSON.stringify(moved.derived.worlds.get('seat'))}`);
});
check('second matching chair rejects',()=>rejects(pair(),[add('seat-2',seatRef,[.02,0,.55],Math.PI)],['overlapping-facilities','duplicate-vanity-seat']));
check('ordinary chair cannot substitute adapter identity',()=>rejects(pair(),[{type:'replace-resource',id:'seat',resource:{id:'chair',version:1}}],['incompatible-replacement']));
check('table-only move rejects and combined quarter turn succeeds atomically',()=>{
  const doc=pair();const rejected=rejects(doc,[{type:'move',id:'vanity',transform:{position:[1,0,0],yaw:Math.PI/2}}],['blocked-vanity-clearance','unpaired-vanity-seat']);
  const transform={position:[1,0,0],yaw:Math.PI/2};const next=change(doc,[{type:'move',id:'vanity',transform},{type:'move',id:'seat',transform:{position:pointInTransform(transform,[.02,0,.55]),yaw:transform.yaw+Math.PI}}]);
  assert.equal(next.derived.vanityClearances[0].seatId,'seat');assert.equal(doc.revision,1);assert.equal(next.document.revision,2);return{rejected,combinedPairAllowed:true};
});
check('front reserve outside own room rejects',()=>rejects(base(6),[add('vanity',ref,[0,0,1.51])],['outside-vanity-clearance']));
check('third-party same-floor blocking facility rejects',()=>rejects(pair(),[add('plant',{id:'plant',version:1},[.8,0,1])],['blocked-vanity-clearance']));
check('rotated room and table compose matching chair correctly',()=>{
  const doc=base();doc.nodes.find(n=>n.id===room).transform={position:[2,0,-1],yaw:Math.PI/2};const next=pair(doc,[0,0,0],Math.PI/2);assert.equal(derive(next).vanityClearances[0].seatId,'seat');return{roomYaw:Math.PI/2,tableLocalYaw:Math.PI/2,pairVerified:true};
});
check('same-floor facility from another room cannot intrude into reserve',()=>{
  const doc=pair();doc.scale='rental-home';doc.nodes.push({id:'other-room',kind:'room',purpose:'work',parentId:floor,transform:{position:[0,0,0],yaw:0},bounds:{width:8,depth:8}});
  // Overlapping room fixture deliberately isolates the floor-wide obstacle rule.
  return rejects(doc,[add('other-room-plant',{id:'plant',version:1},[.8,0,1],0,'other-room')],['blocked-vanity-clearance']);
});
check('same coordinates on another floor do not block reserve',()=>{
  const doc=pair();doc.scale='building';doc.nodes.push({id:'floor-2',kind:'floor',parentId:doc.id,transform:{position:[0,0,0],yaw:0}},{id:'room-2',kind:'room',purpose:'work',parentId:'floor-2',transform:{position:[0,0,0],yaw:0},bounds:{width:8,depth:8}});
  const result=change(doc,[add('other-floor-plant',{id:'plant',version:1},[.8,0,1],0,'room-2')]);assert.equal(result.derived.vanityClearances[0].seatId,'seat');return{otherFloorIgnored:true};
});
check('complete side-entry pair passes existing conservative placement',()=>{
  const result=inspectCompanyPlacement(pair(),catalog,templates);assert.equal(result.checkedPoints.length,1);return{checkedPoints:result.checkedPoints.map(p=>p.id),staticPlacementPassed:true};
});
check('front reserve must exclude actual solid wall strip',()=>{
  const original=base(6),originalBytes=serial(original);let doc;
  try{doc=pair(original,[0,0,1.49]);}catch(error){assert.equal(error.code,'outside-vanity-clearance');assert.equal(serial(original),originalBytes);return{rejected:true,code:error.code,originalPreserved:true};}
  const derived=derive(doc),architecture=describeArchitecture(doc,catalog,templates),reserve=derived.vanityClearances[0].reserve;
  const placement=inspectCompanyPlacement(doc,catalog,templates);
  const collisions=architecture.walls.filter(w=>{const min=[w.center[0]-w.halfSize[0],w.center[2]-w.halfSize[1]],max=[w.center[0]+w.halfSize[0],w.center[2]+w.halfSize[1]];return reserve.min.every((v,i)=>v<max[i]-1e-8&&reserve.max[i]>min[i]+1e-8);});
  if(collisions.length){writeFileSync(new URL('wall-strip-accepted.company.json',import.meta.url),serial(doc));}
  assert.equal(collisions.length,0,`derive, placement and architecture accepted reserve ${JSON.stringify(reserve)} intersecting physical walls ${collisions.map(w=>w.id).join(',')}`);
  return{reserve,collisions};
});
const afterHashes=await hashes();
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const output={scope:'CPU contract and placement only. review-vanity is an explicit data fixture with placeholder asset. No geometry, browser, actor or C3 claim.',command:'node evidence/company-vanity-contract-review-v1/probe.mjs',createdAt:new Date().toISOString(),beforeHashes,afterHashes,sourceChangedDuringRun:JSON.stringify(beforeHashes)!==JSON.stringify(afterHashes),checks,passed:checks.filter(c=>c.status==='passed').length,failed:checks.filter(c=>c.status==='failed').length};
await fs.writeFile(new URL(`report-${runId}.json`,import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
process.exitCode=output.failed?1:0;
