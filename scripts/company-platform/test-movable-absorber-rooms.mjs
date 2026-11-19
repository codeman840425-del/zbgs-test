import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany} from '../../prototype/src/company/document.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';
import {checkProductShowcases} from './check-showcase-room.mjs';
import {checkSingingRooms} from './check-singing-room.mjs';

const [target,...extra]=process.argv.slice(2);
assert(target && !extra.length,'node scripts/company-platform/test-movable-absorber-rooms.mjs NEW_OUTPUT_DIRECTORY');
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(target),roomsDir=path.join(out,'rooms');
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.mkdir(out);
const source=new URL('./batch-inputs/movable-absorber-rooms.json',import.meta.url);
const recipe=JSON.parse(await fs.readFile(source,'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const quarter=Math.PI/2,vector=(x,y,z)=>new T.Vector3(x,y,z);
const round=x=>Math.round(x*1e6)/1e6,tuple=v=>v.toArray().map(round);
const pose=(x,z,yaw=0)=>({position:[x,0,z],yaw});
const move=(id,x,z,yaw=0)=>({type:'move',id,transform:pose(x,z,yaw)});
const ref=id=>({id,version:1}),ids=['folding','casters','double-sided','curved'].map(name=>'absorber-'+name);
const cards=ids.map(id=>catalog.resources.find(r=>r.id===id&&r.version===1));
const report={scope:'C1 static geometry, saved authoring, portal reservations and authored studio/showcase optical checks. No character simulation, acoustic or wheel dynamics.',rooms:[],models:[],rejected:[]};
const findNode=(doc,id)=>doc.nodes.find(n=>n.id===id);
const batch=(data,only)=>runCompanyBatch(data,{outputDirectory:roomsDir,only});
const file=(key,name)=>path.join(roomsDir,key,name);
async function pins(){
  const values={};
  for(const {key} of recipe.items) for(const name of ['input.json','layout.json','save.json','report.json']){
    values[key+'/'+name]=sha(await fs.readFile(file(key,name)));
  }
  return values;
}

function model(session,id){
  const node=findNode(session.document,id),room=session.scene.root.getObjectByName(node.parentId);
  session.scene.root.updateWorldMatrix(true,true);
  const instance=session.scene.root.getObjectByName(id),visual=instance.children[0];
  const floor=room.getObjectByName('Floor:'+room.name);
  assert(floor?.isMesh,'Missing room floor mesh');
  const inverse=instance.matrixWorld.clone().invert(),local=new T.Box3(),contacts=new Map(),parts=[],triangles=[];
  visual.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,matrix=inverse.clone().multiply(mesh.matrixWorld);
    const name=mesh.userData.name||mesh.name,positions=g.attributes.position;
    const vertices=Array.from({length:positions.count},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(matrix));
    const bounds=new T.Box3();
    for(const p of vertices){
      local.expandByPoint(p);bounds.expandByPoint(p);
      if(Math.abs(p.y)<=.001){
        const key=name+'/'+tuple(p).join(',');
        if(!contacts.has(key))contacts.set(key,{part:name,point:p});
      }
    }
    parts.push({name,triangles:(g.index?.count??positions.count)/3,min:tuple(bounds.min),max:tuple(bounds.max)});
    for(let i=0;i<(g.index?.count??positions.count);i+=3){
      triangles.push({name,triangle:new T.Triangle(...[i,i+1,i+2].map(j=>vertices[g.index?g.index.getX(j):j]))});
    }
  });
  const size=tuple(local.getSize(new T.Vector3()));
  assert(size.every((v,i)=>Math.abs(v-[1.2,1.8,.38][i])<=.001));
  assert(contacts.size>=3);
  const ground=[...contacts.values()].map(({part,point})=>{
    const world=point.clone().applyMatrix4(instance.matrixWorld);
    const hit=new T.Raycaster(world.clone().add(vector(0,.2,0)),vector(0,-1,0),0,.25).intersectObject(floor,false)[0];
    assert(hit && Math.abs(hit.point.y-world.y)<=.001,'Unsupported floor contact '+part);
    return {part,screen:tuple(point),ground:tuple(room.worldToLocal(hit.point.clone())),gapM:round(world.y-hit.point.y)};
  });
  const nav=session.scene.navigation().obstacles.find(o=>o.instanceId===id);
  assert(nav && nav.object===instance);
  assert.deepEqual(nav.footprint.halfSize,[.6,.19]);
  const bounds=new T.Box3().setFromObject(visual,true);
  const obstacle=deriveCompany(session.document,catalog,templates).obstacles.find(o=>o.id===id);
  for(const [i,axis] of ['x','z'].entries()){
    const half=axis==='x'?'hw':'hd';
    assert(Math.abs(bounds.min[axis]-obstacle.min[i])<=.001&&Math.abs(bounds.max[axis]-obstacle.max[i])<=.001);
    assert(Math.abs(nav[axis]-(obstacle.min[i]+obstacle.max[i])/2)<=.001);
    assert(Math.abs(nav[half]-(obstacle.max[i]-obstacle.min[i])/2-.22)<=.001);
  }
  return {evidence:{id,resource:node.resource,parentId:node.parentId,transform:node.transform,size,parts,ground,
    worldBounds:[tuple(bounds.min),tuple(bounds.max)],navigation:{x:nav.x,z:nav.z,halfWidth:nav.hw,halfDepth:nav.hd}},triangles};
}

async function reject(session,label,op,code){
  const before=session.snapshot(),scene=session.scene.root,saved=session.readSavedText(session.document.id);
  assert(saved,'Save a valid state before the negative edit');
  await assert.rejects(()=>session.apply([op]),e=>{
    assert.equal(e.code,code,e.message);
    report.rejected.push({room:session.document.id,label,op,code:e.code,path:e.path,savedSha256:sha(saved)});
    return true;
  });
  assert.deepEqual(session.snapshot(),before);
  assert.equal(session.scene.root,scene);
  assert.equal(session.readSavedText(session.document.id),saved);
}
async function author(document,run){
  const d=deriveCompany(document,catalog,templates);
  const resources=[...cards,...d.facilities.map(f=>f.resource),...d.surfaceFinishes.map(f=>f.resource)];
  await preflightLibraryAssets({root,resources,validate:async assetLibrary=>{
    const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const open=()=>createCompanyAuthoring(new T.Scene(),document,{catalog,templates,assetLibrary,storage,mirrorPreflight:()=>{}});
    const session=await open();
    let expected;
    try{await run(session);await session.save();expected=session.document;}
    finally{session.dispose();}
    const reopened=await open();
    try{
      await reopened.restore(document.id);
      assert.deepEqual(reopened.document,expected);
      assert.equal(await reopened.export(),reopened.readSavedText(document.id));
      const save=reopened.readSavedText(document.id);
      await fs.writeFile(path.join(out,document.id+'-edited.save.json'),save,{flag:'wx'});
      const models=[];
      for(const node of expected.nodes.filter(n=>ids.includes(n.resource?.id))){
        const floorId=deriveCompany(expected,catalog,templates).floorIds.get(node.id);
        await reopened.setView({floorId});
        models.push(model(reopened,node.id).evidence);
      }
      report.coldRestore??={};
      report.coldRestore[document.id]={saveSha256:sha(save),models};
    }finally{reopened.dispose();}
  }});
}

// An actual support triangle must enter the reserved square while the elevated screen clears it.
function measureNarrowEntry(doc,id,actual){
  const entry=findNode(doc,findNode(doc,id).parentId).entry.position,proposed=pose(-.38,1.97);
  const x=entry[0]-proposed.position[0],z=entry[2]-proposed.position[2],r=.25;
  const zone=low=>new T.Box3(vector(x-r,low,z-r),vector(x+r,1.81,z+r));
  const low=zone(0),high=zone(.45);
  const lowHits=actual.triangles.filter(t=>low.intersectsTriangle(t.triangle));
  assert(lowHits.length && !actual.triangles.some(t=>high.intersectsTriangle(t.triangle)));
  const body=actual.triangles.flatMap(t=>[t.triangle.a,t.triangle.b,t.triangle.c]).filter(v=>v.y>=.45);
  return {entry,proposed,staticHalfWidth:r,occupiedParts:[...new Set(lowHits.map(h=>h.name))],
    supportTriangles:lowHits.length,bodyClearanceToEntrySquareM:round(z-r-Math.max(...body.map(p=>p.z)))};
}
async function checkRoom(item){
  const text=await fs.readFile(file(item.key,'save.json'),'utf8'),doc=await decodeCompanySave(text,catalog,templates);
  const receipt=JSON.parse(await fs.readFile(file(item.key,'report.json'),'utf8')).checks,studio=!!item.singingRooms;
  const id=item.operations.find(op=>op.id.endsWith('/screen')).id,room=findNode(doc,id).parentId,copy=id+'-copy';
  const purpose=studio?'singingRooms':'productShowcases',inspect=studio?checkSingingRooms:checkProductShowcases;
  assert.deepEqual(await inspect(doc),receipt[purpose]);
  assert(receipt[purpose].length);
  const placement=inspectCompanyPlacement(doc,catalog,templates);
  const portals=placement.checkedPortals.filter(p=>p.regionId===room);
  assert(portals.length && portals.every(p=>p.connected));
  assert(placement.checkedPoints.every(p=>p.approachConnected&&p.exitConnected));
  await author(doc,async session=>{
    const initial=model(session,id).evidence;
    report.rooms.push({key:item.key,saveSha256:sha(text),purpose,checks:receipt[purpose],portals,
      reachableUsePoints:placement.checkedPoints.map(p=>p.id??p.usePointId),initial});
    if(studio){
      for(const card of cards){
        await session.apply([{type:'replace-resource',id,resource:ref(card.id)}]);
        const actual=model(session,id).evidence;
        assert.deepEqual(actual.transform,initial.transform);
        report.models.push({glbSha256:card.asset.sha256,...actual});
      }
      await session.apply([{type:'replace-resource',id,resource:initial.resource}]);
      report.narrowEntry=measureNarrowEntry(session.document,id,model(session,id));
      await session.apply([move(id,2.1,-.18)]);
      await session.apply([{type:'copy-facility',id,newId:copy,parentId:room,transform:pose(-2.1,1.2)}]);
      await session.apply([{type:'replace-resource',id:copy,resource:ref('absorber-folding')}]);
      assert.deepEqual(findNode(session.document,id).resource,initial.resource);
      await session.save();
      await reject(session,'wall clearance',move(id,2.88,0,quarter),'invalid-floor-fit');
      await reject(session,'exterior doorway',move(id,.86,2.64),'blocked-portal');
      await reject(session,'foot-only intrusion at room entry',move(id,-.38,1.97),'blocked-entry');
      await reject(session,'tall end in window frame',move(id,2.29,0),'window-obstructed');
      await reject(session,'copy into original',{type:'copy-facility',id,newId:copy+'-overlap'},'overlapping-facilities');
      await session.apply([move(id,2.71,0,quarter)]);
      const actual=model(session,id),window=session.scene.root.getObjectByName(room+'/east-window').children[0];
      const windowBox=new T.Box3().setFromObject(window,true);
      const instance=session.scene.root.getObjectByName(id);
      // The foot reaches beneath the window while the panel body at glazing height clears the inner frame.
      const wallSide=windowBox.min.x;
      const atSill=actual.triangles.filter(({triangle:t})=>[t.a,t.b,t.c].some(p=>instance.localToWorld(p.clone()).y>=windowBox.min.y));
      const bodyEdge=Math.max(...atSill.flatMap(({triangle:t})=>[t.a,t.b,t.c].map(p=>instance.localToWorld(p.clone()).x)));
      const footEdge=Math.max(...actual.evidence.ground.map(p=>p.ground[0]));
      assert(wallSide-bodyEdge>.002&&footEdge>wallSide+.002);
      report.window={windowMin:tuple(windowBox.min),windowMax:tuple(windowBox.max),footEdge,bodyEdge,clearanceM:round(wallSide-bodyEdge)};
    }else{
      await session.apply([move(id,1.42,-1.12,quarter)]);
      await session.apply([move(id,1.44,-1.08,quarter)]);
      await session.save();
      await reject(session,'rental doorway',move(id,1.44,.46),'blocked-portal');
      await reject(session,'rental interior entry',move(id,1.66,0,quarter),'blocked-entry');
    }
    const end=await inspect(session.document);
    assert(end.length);report.rooms.at(-1).editedChecks=end;
  });
}
async function hiddenFloor(){
  const doc=createCompanyScaleV2({id:'absorber-hidden-floor',scale:'building',spaceProfile:{id:'company-space-v2',version:1},
    furnishingVersion:2,floors:[{id:'ground',rooms:[]},{id:'upper',rooms:[]}]},catalog,templates);
  const ground=doc.id+'/ground',upper=doc.id+'/upper',room=upper+'/room-1',id=room+'/screen';
  await author(doc,async session=>{
    await session.setView({floorId:ground});
    await session.apply([{type:'add-facility',id,parentId:room,resource:ref('absorber-curved'),transform:pose(0,-1)}]);
    assert(!session.scene.root.getObjectByName(id));
    assert(!session.scene.navigation().obstacles.some(o=>o.instanceId===id));
    const unseen=session.scene.navigation(upper).obstacles.find(o=>o.instanceId===id);assert(unseen&&unseen.object===null);
    await session.save();
    await reject(session,'hidden upper floor boundary',move(id,0,-3.05),'invalid-floor-fit');
    await session.setView({floorId:upper});const seen=model(session,id).evidence;
    report.hiddenFloor={visibleAtEdit:ground,measured:upper,model:seen.resource,upperGroundContacts:seen.ground.length};
  });
}
try{
  assert(cards.every(Boolean),'Register all four formal screen resources first');
  assert.equal(new Set(cards.map(c=>c.asset.sha256)).size,4);
  const first=await batch(recipe);assert(first.ok,JSON.stringify(first.results));
  const before=await pins();
  for(const item of recipe.items)await checkRoom(item);
  assert.equal(new Set(report.models.map(m=>JSON.stringify(m.parts))).size,4);
  await hiddenFloor();
  const broken=structuredClone(recipe),studio=broken.items.find(i=>i.key==='absorber-studio');
  studio.operations.push(move(studio.key+'/ground/live/screen',.86,2.64));
  const failure=await batch(broken,studio.key);
  assert.equal(failure.results[0]?.code,'blocked-portal');
  assert.deepEqual(await pins(),before);
  const retry=await batch(recipe);assert(retry.ok&&retry.results.every(r=>r.status==='idempotent'),JSON.stringify(retry.results));
  assert.deepEqual(await pins(),before);
  report.batch={first:first.results.map(x=>x.status),failed:failure.results[0],retry:retry.results.map(x=>x.status),unchanged:before};
  report.status='passed';
}catch(e){report.status='failed';report.error={code:e.code,message:e.message};throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:report.status,roomCount:report.rooms.length,models:report.models.length,rejected:report.rejected.length,output:out}));
