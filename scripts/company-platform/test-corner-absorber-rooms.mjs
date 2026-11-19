import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {checkSingingRooms} from './check-singing-room.mjs';
import {checkProductShowcases} from './check-showcase-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [target,...extra]=process.argv.slice(2);
assert(target&&!extra.length,'node scripts/company-platform/test-corner-absorber-rooms.mjs NEW_OUTPUT_DIRECTORY');
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(target);
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const batch=JSON.parse(await fs.readFile(new URL('./batch-inputs/corner-absorber-rooms.json',import.meta.url)));
const rooms=path.join(out,'rooms'),hash=b=>createHash('sha256').update(b).digest('hex');
const family=catalog.resources.filter(r=>r.mountRole==='corner-absorber'&&r.version===1);
const find=(doc,id)=>doc.nodes.find(n=>n.id===id);
const ref=id=>({id,version:1});
const report={status:'running',rooms:[],scope:'Dual architectural bearings, room authoring, use-space access and fixed reference camera checks.'};
async function pins(){
  const result={};
  for(const item of batch.items)for(const name of ['input.json','layout.json','save.json','report.json']){
    result[item.key+'/'+name]=hash(await fs.readFile(path.join(rooms,item.key,name)));
  }
  return result;
}
function contacts(session,id){
  session.scene.root.updateWorldMatrix(true,true);
  const doc=session.document,node=find(doc,id),object=session.scene.root.getObjectByName(id),visual=object.children[0];
  const region=session.scene.root.getObjectByName(node.parentId);
  const derived=deriveCompany(doc,catalog,templates),binding=derived.cornerMounts.get(id);
  const card=family.find(r=>r.id===node.resource.id),parts=[];
  visual.traverseVisible(mesh=>{if(mesh.isMesh)parts.push(mesh.userData.name||mesh.name);});
  assert(parts.length && card?.asset.sha256);
  const hits=[];
  for(const b of binding.bearings){
    const {along,y}=card.cornerMount.bearings[b.plane],localNormal=b.plane==='x'?new T.Vector3(1,0,0):new T.Vector3(0,0,1);
    const inward=localNormal.transformDirection(object.matrixWorld),wallMeshes=session.scene.walls.filter(m=>m.userData.roomId===region.name&&m.userData.edge===b.edge);
    for(const h of [.05,.5,.95])for(const t of [.1,.9]){
      const height=y[0]+(y[1]-y[0])*h,length=along[0]+(along[1]-along[0])*t;
      const point=object.localToWorld(b.plane==='x'?new T.Vector3(0,height,length):new T.Vector3(length,height,0));
      const railRay=new T.Raycaster(point.clone().addScaledVector(inward,-.015),inward,0,.03);
      const wallRay=new T.Raycaster(point.clone().addScaledVector(inward,.03),inward.clone().negate(),0,.06);
      const rail=railRay.intersectObject(visual,true)[0],wall=wallRay.intersectObjects(wallMeshes,false)[0];
      assert(rail&&wall && rail.point.distanceTo(point)<.001 && wall.point.distanceTo(point)<.001,'Missing physical bearing on '+id+' '+b.edge);
      hits.push({plane:b.plane,edge:b.edge,rail:rail.object.name,wall:wall.object.name,gapM:Math.round(rail.point.distanceTo(wall.point)*1e6)/1e6});
    }
  }
  const nav=session.scene.navigation().obstacles.find(o=>o.instanceId===id);
  assert(nav&&nav.object===object);assert.deepEqual(nav.footprint,card.footprint);
  return {id,parentId:node.parentId,resource:node.resource,modelSha256:card.asset.sha256,attachment:node.attachment,transform:node.transform,parts,hits};
}
async function check(item){
  const studio=item.key==='corner-studio',outcome={key:item.key,edits:[]};
  report.rooms.push(outcome);
  const folder=path.join(rooms,item.key),layout=JSON.parse(await fs.readFile(path.join(folder,'layout.json'),'utf8'));
  const stored=await fs.readFile(path.join(folder,'save.json'),'utf8'),doc=await decodeCompanySave(stored,catalog,templates);
  assert.deepEqual(doc,layout);outcome.initialSaveSha256=hash(stored);
  const checks=JSON.parse(await fs.readFile(path.join(folder,'report.json'),'utf8')).checks;
  const key=studio?'singingRooms':'productShowcases',inspect=studio?checkSingingRooms:checkProductShowcases;
  const optics=await inspect(doc);assert.deepEqual(optics,checks[key]);outcome.originalUse=optics;
  assert(checks.placement.checkedPoints.length&&checks.placement.checkedPoints.every(p=>p.approachConnected&&p.exitConnected));
  assert(checks.placement.checkedPortals.length && checks.placement.checkedPortals.every(p=>p.connected));
  outcome.usePoints=checks.placement.checkedPoints.map(p=>p.id);
  const room=item.key+'/ground/live',id=room+'/corner-absorber',copy=id+'-copy',other=studio?'north-east':'south-west';
  const initial=studio?'south-west':'north-east',spare=studio?'south-east':'north-west',bad=studio?'north-west':'south-east';
  const holeId=studio?item.key+'/ground/west-service-exit':room+'/south-window';
  const attach=(id,corner,bottom)=>({type:'attach-corner',id,parentId:room,corner,bottom});
  const d=deriveCompany(doc,catalog,templates),resources=[...family,...d.facilities.map(f=>f.resource),...d.surfaceFinishes.map(f=>f.resource)];
  const snapshots=new Map(),storage={getItem:k=>snapshots.get(k)??null,setItem:(k,value)=>snapshots.set(k,value)};
  await preflightLibraryAssets({root,resources,validate:async assetLibrary=>{
    const open=()=>createCompanyAuthoring(new T.Scene(),doc,{catalog,templates,assetLibrary,storage,mirrorPreflight:()=>{}});
    const session=await open();
    let saved,expected;
    try{
      outcome.initial=contacts(session,id);assert.equal(outcome.initial.attachment.corner,initial);
      for(const card of family){
        await session.apply([{type:'replace-resource',id,resource:ref(card.id)}]);
        const after=contacts(session,id);assert.deepEqual(after.attachment,outcome.initial.attachment);assert.deepEqual(after.transform,outcome.initial.transform);
        outcome.edits.push(after);
      }
      await session.apply([{type:'replace-resource',id,resource:outcome.initial.resource},attach(id,other,.3)]);
      outcome.moved=contacts(session,id);assert.equal(outcome.moved.attachment.corner,other);assert.equal(outcome.moved.transform.position[1],.3);
      await session.apply([{type:'copy-facility',id,newId:copy},attach(copy,spare,.2)]);
      outcome.copy=contacts(session,copy);assert.equal(outcome.copy.attachment.corner,spare);
      assert.deepEqual(outcome.copy.resource,outcome.moved.resource);
      await session.save();saved=session.readSavedText(doc.id);expected=session.document;
      const originalRoot=session.scene.root;
      await assert.rejects(()=>session.apply([attach(id,bad,.3)]),e=>{
        assert.equal(e.code,'corner-bearing-over-opening');assert.equal(e.path,id);
        assert.equal(e.details.openingId,holeId);assert.equal(e.details.kind,studio?'portal':'window');
        outcome.rejected={code:e.code,path:e.path,details:e.details};return true;
      });
      assert.equal(session.scene.root,originalRoot);assert.deepEqual(session.document,expected);assert.equal(session.readSavedText(doc.id),saved);
      // A different editor action can remove support too. Moving the window towards the other rail must preserve the same save.
      if(!studio){
        const win=find(doc,holeId);
        await assert.rejects(()=>session.apply([{type:'move',id:holeId,transform:{...win.transform,position:[-1.35,1.65,1.9]}}]),e=>{
          assert.equal(e.code,'corner-bearing-over-opening');assert.equal(e.details.openingId,holeId);
          outcome.reverseWindow={code:e.code,absorber:e.path,openingId:e.details.openingId};return true;
        });
        assert.deepEqual(session.document,expected);assert.equal(session.readSavedText(doc.id),saved);
      }
      assert.deepEqual((await inspect(session.document)).map(r=>r.ok),[true]);
    }finally{session.dispose();}
    const reopened=await open();
    try{
      await reopened.restore(doc.id);assert.deepEqual(reopened.document,expected);assert.equal(await reopened.export(),saved);
      assert.deepEqual(contacts(reopened,id),outcome.moved);assert.deepEqual(contacts(reopened,copy),outcome.copy);
      outcome.editedSaveSha256=hash(saved);await fs.writeFile(path.join(out,item.key+'.edited.save.json'),saved,{flag:'wx'});
    }finally{reopened.dispose();}
  }});
}
try{
  assert.equal(family.length,4);assert.equal(new Set(family.map(r=>r.asset.sha256)).size,4);
  const first=await runCompanyBatch(batch,{outputDirectory:rooms});assert(first.ok,JSON.stringify(first.results));
  const before=await pins();
  for(const item of batch.items)await check(item);
  const retry=await runCompanyBatch(batch,{outputDirectory:rooms});assert(retry.ok&&retry.results.every(r=>r.status==='idempotent'));
  assert.deepEqual(await pins(),before);report.pins=before;report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:report.status,rooms:report.rooms.length,output:out}));
