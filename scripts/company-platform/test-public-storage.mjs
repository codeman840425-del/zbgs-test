import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {publicStorageFloors,measurePublicStorageFloor} from '../../prototype/src/company/public-storage.js';
import {shouldCheckPublicStorage,checkPublicStorageRooms} from './check-public-storage.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [dir,...extra]=process.argv.slice(2);
assert(dir&&!extra.length,'node test-public-storage.mjs NEW_MANAGED_DIRECTORY');
const out=path.resolve(dir),root=path.resolve(import.meta.dirname,'../..'),published=path.join(out,'published');
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const options={catalog,templates},batch=JSON.parse(await fs.readFile(new URL('./batch-inputs/public-storage-cleaning.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex'),run=items=>runCompanyBatch({...batch,items},{outputDirectory:published});
const save=key=>fs.readFile(path.join(published,key,'save.json'),'utf8');
const change=(d,ops)=>prepareCompanyChange(d,ops,options).document;
const move=(id,position,yaw)=>({type:'move',id,transform:{position,yaw}});
const state=(id,value)=>({type:'set-state',id,state:{openFraction:value}});
async function pins(){
  const values={};
  for(const {key} of batch.items)for(const file of ['input.json','layout.json','save.json','report.json'])
    values[key+'/'+file]=sha(await fs.readFile(path.join(published,key,file)));
  return values;
}
const report={status:'running',rooms:[],rejections:[],scope:'Installed facility geometry, static stock withdrawal and a 0.50 m × 1.90 m passage. No character or cleaning operation.'};
try{
  const initial=await run(batch.items);assert(initial.ok,JSON.stringify(initial));
  const immutable=await pins(),docs=[];
  for(const row of batch.items){
    const encoded=await save(row.key),doc=await decodeCompanySave(encoded,catalog,templates);docs.push(doc);
    const [r]=await checkPublicStorageRooms(doc),batchReport=JSON.parse(await fs.readFile(path.join(published,row.key,'report.json')));
    assert.deepEqual(batchReport.checks.publicStorageRooms,[r]);
    assert.deepEqual(doc.publicStorageRooms,row.publicStorageRooms);
    assert.deepEqual(r.states.map(s=>s.fraction),[0,.5,1]);assert(r.sweep.intervals>2);
    const [closed,half,open]=r.states;
    assert(closed.door.localHit[0]-open.door.localHit[0]>.65&&open.door.localHit[2]-closed.door.localHit[2]>.65);
    assert(half.door.localHit[2]>closed.door.localHit[2]&&half.door.localHit[2]<open.door.localHit[2]);
    for(const s of r.states){
      assert.equal(s.picks.length,2);
      assert(s.picks.every(p=>p.contacts.length===4&&p.withdrawal.travelM>0&&p.loadSize.every(n=>n>0)));
      assert.equal(Object.keys(s.route).length,3);
      assert(Object.values(s.route).every(route=>route.portalId===r.portalId));
    }
    report.rooms.push({key:row.key,saveSha256:sha(encoded),...r});
  }
  assert.equal(report.rooms[0].states[0].publicApproach.legs.length,0);
  assert.equal(report.rooms[1].states[0].publicApproach.legs.length,2);
  async function reject(label,doc,ops,codes){
    const response=await run([{key:doc.id,document:doc,operations:ops}]),e=response.results[0];
    assert.equal(e.status,'failed',label+' '+JSON.stringify(response));assert(codes.includes(e.code),label+' '+JSON.stringify(e));
    assert.deepEqual(await pins(),immutable);report.rejections.push({label,code:e.code,path:e.path,details:e.details});
  }
  const [ground,upper]=docs,gr=ground.publicStorageRooms[0],ur=upper.publicStorageRooms[0];
  const missing=structuredClone(upper);delete missing.publicStorageRooms;
  assert(shouldCheckPublicStorage(missing));await reject('equipped hidden floor without declaration',missing,[],['storage-declaration-required']);
  const wrong=structuredClone(ground);wrong.publicStorageRooms[0].picks[0].surfaceId='lower';
  await reject('wrong shelf for the real load',wrong,[],['storage-pick']);
  const unreachable=structuredClone(ground);unreachable.publicStorageRooms[0].cabinetService=[0,0];
  await reject('unreachable cabinet opening',unreachable,[],['storage-cabinet-service']);
  const rack=upper.nodes.find(n=>n.id===ur.rackId),turn=move(rack.id,rack.transform.position,(rack.transform.yaw+Math.PI)%(2*Math.PI));
  await reject('stock front faces wall',upper,[turn],['storage-pick-blocked','room-door-unreachable']);
  const paths=report.rooms[1].states[0].publicApproach.legs;
  const stair=upper.nodes.find(n=>n.id===paths[0].to),link=paths[1];
  const portal=upper.nodes.find(n=>n.id===ur.regionId).entry;
  await reject('storage entrance obstructed',upper,[move(ur.cartId,portal.position,Math.PI/2)],['blocked-entry','blocked-portal','room-door-unreachable']);
  const localPortal=upper.nodes.find(n=>n.id===stair.id).bounds;
  await reject('intermediate public connection obstructed',upper,[move(stair.id+'/service-sign',[0,0,localPortal.depth/2-.40],0)],
    ['blocked-entry','blocked-portal','room-door-unreachable','storage-entry']);
  report.intermediatePortal=link.portalId;
  const empty=createCompanyScaleV2(batch.items[0].input,catalog,templates);
  assert(!shouldCheckPublicStorage(empty));assert.deepEqual(await checkPublicStorageRooms(empty),[]);
  const ordinary=empty.nodes.find(n=>n.kind==='room'),loose=change(empty,[{type:'add-facility',id:ordinary.id+'/loose-rack',parentId:ordinary.id,
    resource:ground.nodes.find(n=>n.id===gr.rackId).resource,transform:{position:[0,0,0],yaw:0}}]);
  assert(!shouldCheckPublicStorage(loose));assert.deepEqual(await checkPublicStorageRooms(loose),[]);
  // One intentionally inaccurate fixture per geometry control. Metadata, routes and other live GLBs remain unchanged.
  const diagnosticId=gr.cabinetId+'/sample',fixture=change(ground,[{type:'add-facility',id:diagnosticId,parentId:gr.cabinetId,
    resource:{id:'tabletop-open-box-kenney',version:1},attachment:{surfaceId:'top'},transform:{position:[0,1.2,0],yaw:0}}]);
  const physical=deriveCompany(fixture,catalog,templates),[testGroup]=publicStorageFloors(fixture,physical),at=inspectCompanyPlacement(fixture,catalog,templates);
  const cabinet=physical.facilities.find(f=>f.id===gr.cabinetId),stockRack=physical.facilities.find(f=>f.id===gr.rackId);
  report.physicalControls=[];
  await preflightLibraryAssets({root,resources:testGroup.resources,validate:library=>{
    for(const [label,code] of [['door interval only','storage-door-sweep'],['front bar','storage-pick-blocked'],['missing contact','storage-support-contact']]){
      const modified={instantiate(res){
        const asset=library.instantiate(res);
        if(label==='door interval only'&&res.id==='tabletop-open-box-kenney'){
          const p=cabinet.resource.movingParts[0].pivot;
          const marker=new T.Mesh(new T.BoxGeometry(.012,.025,.012),new T.MeshBasicMaterial());
          marker.name='control-blade-at-22.5-degrees';marker.position.set(p[0]+.70*Math.cos(Math.PI/8),-.60,p[2]+.70*Math.sin(Math.PI/8));
          asset.root.add(marker);
        }
        if(res.id===stockRack.resource.id){
          if(label==='front bar'){
            const block=new T.Mesh(new T.BoxGeometry(.50,.45,.012),new T.MeshBasicMaterial());
            block.name='control-front-bar';block.position.set(0,1.275,.165);asset.root.add(block);
          }else if(label==='missing contact'){
            const deck=asset.nodes.get(res.supportNodes.middle);deck.position.y-=.025;
          }
        }
        return asset;
      }};
      assert.throws(()=>measurePublicStorageFloor(fixture,physical,at,testGroup,{...options,assetLibrary:modified}),e=>{
        assert.equal(e.code,code,label+' '+e.message);report.physicalControls.push({label,code:e.code,details:e.details});return true;
      });
    }
  }});
  const full=deriveCompany(upper,catalog,templates),resources=[...full.facilities,...full.surfaceFinishes].map(f=>f.resource);
  await preflightLibraryAssets({root,resources,validate:async library=>{
    const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,val)=>memory.set(k,val)};
    const session=await createCompanyAuthoring(new T.Scene(),upper,{...options,storage,assetLibrary:library,mirrorPreflight:()=>{}});
    try{
      const hidden=upper.nodes.find(n=>n.kind==='floor'&&n.id!==report.rooms[1].floorId);
      await session.setView({floorId:hidden.id});await session.apply([state(ur.cabinetId,1)]);await session.save();
      const good=session.readSavedText(upper.id),before=session.document;
      await assert.rejects(session.apply([turn]),e=>['storage-pick-blocked','room-door-unreachable'].includes(e.code));
      assert.deepEqual(session.document,before);assert.equal(session.readSavedText(upper.id),good);
      await session.apply([state(ur.cabinetId,0)]);await session.restore();
      assert.equal(session.document.nodes.find(n=>n.id===ur.cabinetId).state.openFraction,1);
      assert.deepEqual(session.document.publicStorageRooms,upper.publicStorageRooms);
      report.hiddenFloor={view:hidden.id,checked:report.rooms[1].floorId,retained:sha(good),restoredFraction:1,retainedBinding:true};
    }finally{session.dispose();}
  }});
  const repeat=await run(batch.items);assert(repeat.ok,JSON.stringify(repeat));assert.deepEqual(await pins(),immutable);
  report.unchanged=immutable;report.retry=repeat.results.map(r=>({key:r.key,status:r.status}));report.status='passed';
}catch(e){report.status='failed';report.error={code:e.code,message:e.message};throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({output:out,rooms:report.rooms.length,rejections:report.rejections.length,status:report.status}));
