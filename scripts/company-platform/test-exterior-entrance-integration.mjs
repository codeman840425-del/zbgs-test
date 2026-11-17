import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import examples from '../../prototype/src/company/examples/c2-scale-v2.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {describeArchitecture} from '../../prototype/src/company/architecture.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {planEntranceAndFrame} from '../../prototype/src/company/entrance-authoring.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';

const report={checks:[],scope:'Company data, topology and persistence integration, not actual model or character evidence'};
const check=async(name,fn)=>{report.checks.push({name,observed:await fn(),passed:true});};
const apply=(doc,ops)=>prepareCompanyChange(doc,ops,{catalog,templates}).document;
const frames=catalog.resources.filter(r=>r.productionBranch==='door-frame');assert.equal(frames.length,4);
const current=examples.smallHome;
await check('New small home has one actual exterior doorway and a 0.6 metre wall header',()=>{
 const d=deriveCompany(current,catalog,templates);assert.equal(d.exteriorEntrances.size,1);const e=[...d.exteriorEntrances.values()][0],a=describeArchitecture(current,catalog,templates),header=a.walls.find(w=>w.openingId===e.id);
 assert(header);assert(Math.abs(header.size[1]-.6)<1e-8);assert(Math.abs(header.position[1]-header.size[1]/2-2.2)<1e-8);assert(!a.navigationWalls.some(w=>w.id===header.id));assert.equal(inspectCompanyPlacement(current,catalog,templates).checkedPortals.length,1);
 return{entrance:e,header};
});
let upgraded,frameId;
await check('Old document remains unchanged until explicit atomic entry and frame installation',()=>{
 const old=structuredClone(current);for(const floor of old.nodes.filter(n=>n.kind==='floor'))delete floor.exteriorEntrances;const before=JSON.stringify(old),room=old.nodes.find(n=>n.kind==='room');
 assert.equal(listPlacementTargets(old,catalog,frames[0],room.id,{templates}).length,0);
 const plan=planEntranceAndFrame(old,catalog,templates,frames[0],room.id);assert(plan);upgraded=apply(old,plan.operations);frameId=plan.frameId;
 assert.equal(JSON.stringify(old),before);assert.equal(upgraded.id,old.id);assert.equal(upgraded.nodes.length,old.nodes.length+1);inspectCompanyPlacement(upgraded,catalog,templates);
 return{operations:plan.operations,frameId};
});
await check('Four frame appearances retain identity and match explicit aperture height and width',()=>{
 const original=upgraded.nodes.find(n=>n.id===frameId);for(const r of frames){const next=apply(upgraded,[{type:'replace-resource',id:frameId,resource:{id:r.id,version:r.version}}]);assert.deepEqual(next.nodes.find(n=>n.id===frameId).transform,original.transform);inspectCompanyPlacement(next,catalog,templates);}
 const floor=upgraded.nodes.find(n=>n.kind==='floor'),entrances=structuredClone(floor.exteriorEntrances);entrances[0].height=2.4;
 assert.throws(()=>apply(upgraded,[{type:'set-exterior-entrances',id:floor.id,entrances}]),e=>e.code==='invalid-portal-fit');
 assert.throws(()=>apply(upgraded,[{type:'set-exterior-entrances',id:floor.id,entrances:[]}]),e=>e.code==='invalid-portal-fit');
 return frames.map(r=>r.id);
});
await check('Second rotated room uses transformed doorway geometry and a real reachable interior',()=>{
 const rotated=structuredClone(upgraded),room=rotated.nodes.find(n=>n.kind==='room');room.transform.yaw=Math.PI/2;
 const d=deriveCompany(rotated,catalog,templates),e=[...d.exteriorEntrances.values()][0];assert(Math.abs(e.world.normal[0]-1)<1e-8);assert(Math.abs(e.world.normal[2])<1e-8);inspectCompanyPlacement(rotated,catalog,templates);return e.world;
});
await check('Doorway ownership, window conflicts, duplicate frames and busy floor changes reject',()=>{
 const room=upgraded.nodes.find(n=>n.kind==='room'),floor=upgraded.nodes.find(n=>n.kind==='floor'),frame=upgraded.nodes.find(n=>n.id===frameId),before=JSON.stringify(upgraded);
 assert.throws(()=>apply(upgraded,[{type:'add-facility',id:'duplicate-frame',parentId:room.id,resource:frame.resource,transform:frame.transform}]),e=>e.code==='duplicate-door-frame');
 assert.throws(()=>apply(upgraded,[{type:'add-facility',id:'window-over-entry',parentId:room.id,resource:{id:'window-opening-square-basic',version:1},transform:{position:[-1.2,1.4,1.9],yaw:Math.PI}}]),e=>e.code==='wall-display-over-portal');
 assert.throws(()=>prepareCompanyChange(upgraded,[{type:'set-exterior-entrances',id:floor.id,entrances:floor.exteriorEntrances}],{catalog,templates,isUsePointBusy:()=>true}),e=>e.code==='facility-busy');
 assert.equal(JSON.stringify(upgraded),before);return{rejected:['duplicate-door-frame','wall-display-over-portal','facility-busy']};
});
await check('Adjacent aperture intrusion and misplaced owner fail without altering valid input',()=>{
 const changed=structuredClone(upgraded),floor=changed.nodes.find(n=>n.kind==='floor'),room=changed.nodes.find(n=>n.kind==='room');
 floor.exteriorEntrances.push({...floor.exteriorEntrances[0],id:'adjacent-entry',offset:.2});
 assert.throws(()=>deriveCompany(changed,catalog,templates),e=>e.code==='portal-frame-overlap');
 const wrongOwner=structuredClone(current);wrongOwner.nodes.find(n=>n.kind==='room').exteriorEntrances=[];
 assert.throws(()=>deriveCompany(wrongOwner,catalog,templates),e=>e.code==='invalid-exterior-entrance-owner');
 return{rejected:['portal-frame-overlap','invalid-exterior-entrance-owner']};
});
await check('Legacy interior duplicate frames can restore and remove; new duplicate edits reject',async()=>{
 const d=structuredClone(examples.rental),room=d.nodes.find(n=>n.kind==='room'),target=listPlacementTargets(d,catalog,frames[0],room.id,{templates})[0];
 const transform={position:target.position,yaw:target.yaw};
 const single=apply(d,[{type:'add-facility',id:'legacy-frame-a',parentId:room.id,resource:{id:frames[0].id,version:1},transform}]);
 const legacy=structuredClone(single);legacy.nodes.push({...structuredClone(legacy.nodes.find(n=>n.id==='legacy-frame-a')),id:'legacy-frame-b'});
 assert.deepEqual(await decodeCompanySave(await encodeCompanySave(legacy,catalog,templates),catalog,templates),legacy);
 assert.equal(apply(legacy,[{type:'remove',id:'legacy-frame-b'}]).nodes.length,single.nodes.length);
 assert.throws(()=>apply(single,[{type:'add-facility',id:'new-duplicate',parentId:room.id,resource:{id:frames[1].id,version:1},transform}]),e=>e.code==='duplicate-door-frame');
 return{legacyRestores:true,newDuplicateRejected:true};
});
await check('Complete save and decode retain explicit openings and pinned frame resource',async()=>{const saved=await encodeCompanySave(upgraded,catalog,templates),decoded=await decodeCompanySave(saved,catalog,templates);assert.deepEqual(decoded,upgraded);return{document:decoded.id,resource:decoded.nodes.find(n=>n.id===frameId).resource};});
report.status='passed';await fs.mkdir('evidence/company-exterior-entrance-integration-v1',{recursive:true});await fs.writeFile('evidence/company-exterior-entrance-integration-v1/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length}));
