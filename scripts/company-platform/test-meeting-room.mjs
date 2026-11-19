import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {meetingRoomFloors,measureMeetingRoomFloor} from '../../prototype/src/company/meeting-room.js';
import {checkMeetingRooms,shouldCheckMeetingRooms} from './check-meeting-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [dir,...extra]=process.argv.slice(2);
assert(dir&&!extra.length,'node test-meeting-room.mjs NEW_MANAGED_DIRECTORY');
const out=path.resolve(dir),published=path.join(out,'published'),root=path.resolve(import.meta.dirname,'../..');
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const batch=JSON.parse(await fs.readFile(new URL('./batch-inputs/public-meeting-rooms.json',import.meta.url)));
const options={catalog,templates},sha=b=>createHash('sha256').update(b).digest('hex');
const change=(doc,ops)=>prepareCompanyChange(doc,ops,options).document;
const move=(id,position,yaw)=>({type:'move',id,transform:{position,yaw}});
const add=(id,parentId,resource,position,yaw=0)=>({type:'add-facility',id,parentId,resource:{id:resource,version:1},transform:{position,yaw}});
const run=(items,outputDirectory)=>runCompanyBatch({schema:'company-batch',version:1,items},{outputDirectory});
const saved=(folder,key)=>fs.readFile(path.join(folder,key,'save.json'),'utf8');
async function pins(){
 const data={};
 for(const row of batch.items)for(const file of ['input.json','layout.json','save.json','report.json']){
   const key=row.key+'/'+file;data[key]=sha(await fs.readFile(path.join(published,key)));
 }
 return data;
}
const report={status:'running',rooms:[],rejections:[],scope:'Static signed seat, eye and knee references in four real company rooms. No meeting actor transitions, peer bodies, speech or live conferencing were simulated.'};
try{
 const initial=await run(batch.items,published);assert(initial.ok,JSON.stringify(initial));
 const immutable=await pins(),docs=[];
 for(const row of batch.items){
   const encoded=await saved(published,row.key),doc=await decodeCompanySave(encoded,catalog,templates);docs.push(doc);
   const checks=await checkMeetingRooms(doc,options),[c]=checks;
   assert.equal(c.visible,true);assert.deepEqual(doc.meetingRooms,row.meetingRooms);
   assert.deepEqual(checks,JSON.parse(await fs.readFile(path.join(published,row.key,'report.json'))).checks.meetingRooms);
   assert(c.ok&&c.seats.length===row.meetingRooms[0].chairs.length&&c.publicApproach.legs.length===0);
   for(const s of c.seats){
     assert(s.contacts.length===5&&s.observations.length===4&&s.observations.every(x=>x.rays.length===5));
     for(const f of ['approach','exit'])assert.equal(c.route[s.slotId+'/'+f].portalId,c.portalId);
   }
   report.rooms.push({key:row.key,saveSha256:sha(encoded),check:c});
 }
 async function reject(label,doc,ops,expected){
   const result=await run([{key:doc.id,document:doc,operations:ops}],published);
   const e=result.results[0];assert.equal(e.status,'failed',label+': '+JSON.stringify(result));
   assert(expected.includes(e.code),label+' '+JSON.stringify(e));assert.deepEqual(await pins(),immutable);
   report.rejections.push({label,code:e.code,path:e.path,details:e.details});
 }
 const [conference,classroom,u,discussion]=docs;
 const cr=conference.meetingRooms[0],dr=discussion.meetingRooms[0];
 const variants=catalog.resources.filter(r=>r.mountRole==='meeting-chair-side-entry'&&r.version===1);
 assert(variants.length>=4);report.sideEntryChairs=[];
 for(const variant of variants){
   const id=cr.chairs[0],modified=change(conference,[{type:'replace-resource',id,resource:{id:variant.id,version:variant.version}}]);
   const encoded=await encodeCompanySave(modified,catalog,templates),cold=await decodeCompanySave(encoded,catalog,templates);
   const [checked]=await checkMeetingRooms(cold,options),seat=checked.seats.find(s=>s.id===id);
   assert.deepEqual(modified.meetingRooms,conference.meetingRooms);assert.equal(seat.contacts.length,5);
   report.sideEntryChairs.push({id:variant.id,sha256:variant.asset.sha256,saveSha256:sha(encoded),slot:seat.slotId,crown:seat.crown,approach:seat.approach,exit:seat.exit});
 }
 const remove=structuredClone(conference);delete remove.meetingRooms;assert(shouldCheckMeetingRooms(remove));
 await reject('stripped meeting binding',remove,[],['meeting-declaration-required']);
 const lone=structuredClone(batch.items[0]);lone.operations=lone.operations.filter(op=>op.type==='add-facility'&&op.id===cr.chairs[0]);delete lone.meetingRooms;
 const single=await run([lone],published);assert.equal(single.results[0].code,'meeting-declaration-required');assert.deepEqual(await pins(),immutable);
 const blank=structuredClone(batch.items[0]);blank.operations=[];delete blank.meetingRooms;
 const empty=await run([blank],path.join(out,'empty'));assert(empty.ok,JSON.stringify(empty));
 const normal=createCompanyScaleV2(blank.input,catalog,templates),other=normal.nodes.find(n=>n.kind==='room');
 const isolated=change(normal,[add(other.id+'/loose-seat',other.id,'meeting-chair-side-entry',[0,0,0])]);
 assert(!shouldCheckMeetingRooms(isolated));assert.deepEqual(await checkMeetingRooms(isolated),[]);
 const mislabeled=structuredClone(u);mislabeled.meetingRooms[0].layout='conference';
 await reject('U opening cannot represent a filled conference tabletop',mislabeled,[],['meeting-layout-shape']);
 const wrongRows=structuredClone(conference);wrongRows.meetingRooms[0].layout='classroom';
 await reject('opposing seats cannot represent two training rows',wrongRows,[],['meeting-layout-shape']);
 const table=cr.tables[0];
 await reject('occupied tabletop or knee/seat reserve',conference,[move(table,[-.48,0,-.5],0)],['overlapping-facilities','blocked-use-space','meeting-seat-clearance','meeting-seat-contact']);
 const board=conference.nodes.find(n=>n.id===cr.boardId);
 await reject('board faces away from every seat',conference,[move(board.id,board.transform.position,board.transform.yaw+Math.PI)],['meeting-board-visibility','meeting-presenter-position']);
 await reject('graphic is removed',conference,[{type:'remove',id:cr.contentId}],['meeting-member']);
 await reject('real second board blocks sightlines',conference,[add(cr.regionId+'/visual-block',cr.regionId,'information-board-floor-notice',[0,0,-1.76])],['meeting-board-visibility']);
 const blockedView=structuredClone(conference);blockedView.meetingRooms[0].presenter=[.74,-1.49];
 await reject('presenter standing box covers printed content',blockedView,[],['meeting-presenter-occludes']);
 await reject('door blocked by physical furniture',conference,[add(cr.regionId+'/entry-block',cr.regionId,'information-board-floor-whiteboard',[3.56,0,0],Math.PI/2)],['blocked-entry','blocked-portal','room-door-unreachable']);
 // Production scale permits the attached area on a public lift-access as well as the lobby.
 const indirect=structuredClone(batch.items[0]);indirect.input.floors[0].publicAreas[0].connect.areaId='lift-access';
 const alternate=path.join(out,'via-lift'),pass=await run([indirect],alternate);assert(pass.ok,JSON.stringify(pass));
 const viaSave=await saved(alternate,indirect.key),via=await decodeCompanySave(viaSave,catalog,templates),[viaCheck]=await checkMeetingRooms(via);
 assert.equal(viaCheck.publicApproach.legs.length,1);
 assert(viaCheck.publicApproach.legs[0].portalId.endsWith('/portal-lobby-lift'));
 const liftId=viaCheck.publicApproach.legs[0].to;
 const block=await run([{key:via.id,document:via,operations:[move(liftId+'/service-sign',[0,0,1.09],0)]}],alternate);
 assert(['blocked-portal','room-door-unreachable'].includes(block.results[0].code),JSON.stringify(block));
 assert.equal(await saved(alternate,indirect.key),viaSave);
 report.twoDoor={pass:viaCheck.publicApproach,inner:viaCheck.route.presenter,saveSha256:sha(viaSave),block:block.results[0]};
 // Inject a diagnostic rigid apron into a physical table model, keeping its registered footprint and nominal top intact.
 const d=deriveCompany(conference,catalog,templates),[group]=meetingRoomFloors(conference,d);
 await preflightLibraryAssets({root,resources:group.resources,validate:library=>{
   const donor=conference.nodes.find(n=>n.id===table);
   const checked={...library,instantiate(resource){
     const instance=library.instantiate(resource);
     if(resource.id===donor.resource.id){
       const apron=new T.Mesh(new T.BoxGeometry(.20,.09,.60),new T.MeshStandardMaterial());apron.name='control-low-apron';
       apron.position.set(-1.07,.56,-.02);instance.root.add(apron);
     }
     return instance;
   }};
   assert.throws(()=>measureMeetingRoomFloor(conference,d,inspectCompanyPlacement(conference,catalog,templates),group,{catalog,templates,assetLibrary:checked}),
     e=>{assert.equal(e.code,'meeting-seat-clearance');assert.equal(e.details.label,'knees');assert.equal(e.details.mesh,'control-low-apron');report.apron={code:e.code,...e.details};return true;});
 }});
 const real=deriveCompany(discussion,catalog,templates),resources=[...real.facilities,...real.surfaceFinishes].map(f=>f.resource);
 await preflightLibraryAssets({root,resources,validate:async library=>{
   const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,val)=>memory.set(k,val)};
   const session=await createCompanyAuthoring(new T.Scene(),discussion,{...options,storage,assetLibrary:library,mirrorPreflight:()=>{}});
   const state=value=>({type:'set-state',id:dr.contentId,state:{visible:value}});
   try{
     await session.save();const baseline=session.readSavedText(discussion.id);
     await session.apply([state(false)]);await session.save();const off=session.readSavedText(discussion.id);
     await session.apply([state(true)]);await session.restore();
     const [offReport]=await checkMeetingRooms(await decodeCompanySave(off,catalog,templates),options);
     assert(!offReport.visible&&offReport.readingState==='validated-in-visible-copy');
     assert.equal(session.document.nodes.find(n=>n.id===dr.contentId).state.visible,false);
     const original=session.document.nodes.find(n=>n.id===dr.boardId).transform;
     const delta=original.position.slice();delta[2]+=.10;
     await session.apply([state(true),move(dr.boardId,delta,original.yaw)]);await session.save();
     const good=session.readSavedText(discussion.id),doc=await decodeCompanySave(good,catalog,templates),[again]=await checkMeetingRooms(doc,options);
     assert(again.visible&&again.board.contentId===dr.contentId);assert.notDeepEqual(again.board.center,offReport.board.center);
     const snapshot=session.document;
     await assert.rejects(session.apply([move(dr.boardId,delta,original.yaw+Math.PI)]),e=>['meeting-presenter-position','meeting-board-visibility'].includes(e.code));
     assert.deepEqual(session.document,snapshot);assert.equal(session.readSavedText(discussion.id),good);await session.restore();assert.deepEqual(session.document,doc);
     report.discussionBoard={initial:sha(baseline),off:sha(off),movedOn:sha(good),hiddenWitness:offReport.readingState,from:offReport.board.center,to:again.board.center};
   }finally{session.dispose();}
 }});
 const repeat=await run(batch.items,published);assert(repeat.ok,JSON.stringify(repeat));assert.deepEqual(await pins(),immutable);
 report.unchanged=immutable;report.repeat=repeat.results.map(r=>({key:r.key,status:r.status}));report.status='passed';
}catch(e){report.status='failed';report.error={code:e.code,message:e.message};throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({output:out,rooms:report.rooms.length,seats:report.rooms.flatMap(r=>r.check.seats).length,rejections:report.rejections.length,status:report.status}));
