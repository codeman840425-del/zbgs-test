import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {checkShowcaseRoom} from './check-showcase-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {runCompanyBatch} from './batch.mjs';
import {checkManagedOutput} from './package-company.mjs';

const [target,...extra]=process.argv.slice(2);
assert(target&&!extra.length,'node scripts/company-platform/test-glass-partition-rooms.mjs NEW_OUTPUT_DIRECTORY');
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(target);
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const batchFile=name=>new URL('./batch-inputs/'+name+'.json',import.meta.url);
const batch=JSON.parse(await fs.readFile(batchFile('glass-partition-rooms'),'utf8')),published=path.join(out,'rooms');
const ids=['clear','frosted','tinted','framed'].map(k=>'glass-partition-'+k);
const cards=ids.map(id=>catalog.resources.find(r=>r.id===id&&r.version===1)),opts={catalog,templates};
const q=Math.PI/2,pose=(x,z,yaw)=>({position:[x,0,z],yaw}),ref=id=>({id,version:1});
const move=(id,x,z,yaw)=>({type:'move',id,transform:pose(x,z,yaw)}),node=(doc,id)=>doc.nodes.find(n=>n.id===id);
const hash=s=>createHash('sha256').update(s).digest('hex'),round=v=>Math.round(v*1e6)/1e6,xyz=p=>p.toArray().map(round);
const bytes=subject=>JSON.stringify(subject,null,2)+'\n';
const report={status:'running',rooms:[],scope:'Installed full-height partition: solid backing contact, static circulation and product sight rays. No actor trial.'};

async function withAssets(doc,fn){
  const d=deriveCompany(doc,catalog,templates);
  const resources=[...cards,...d.facilities.map(f=>f.resource),...d.surfaceFinishes.map(f=>f.resource)];
  await preflightLibraryAssets({root,resources,validate:fn});
}
function installed(session,id) {
  const doc=session.document,n=node(doc,id),room=n.parentId,card=cards.find(c=>c.id===n.resource.id);
  const world=session.scene.root;world.updateWorldMatrix(true,true);
  const group=world.getObjectByName(id),visual=group.children[0],floor=world.getObjectByName('Floor:'+room),ceiling=world.getObjectByName('Ceiling:'+room);
  assert(floor?.isMesh&&ceiling?.isMesh&&visual);
  const parts=[];
  visual.traverseVisible(mesh=>{if(mesh.isMesh)parts.push(mesh.userData.name||mesh.name);});
  const vectors=(x,y,z)=>group.localToWorld(new T.Vector3(x,y,z)),up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
  const hit=(o,from,dir,range)=>new T.Raycaster(from,dir,0,range).intersectObject(o,true)[0];
  const contacts=[];
  // Separate rays from opposite sides resolve the architectural surface and the outer metal plate independently.
  for(const x of [-1.15,0,1.15])for(const z of [-.029,.029]){
    const low=hit(visual,vectors(x,-.06,z),up,.10),high=hit(visual,vectors(x,2.86,z),down,.10);
    const ground=hit(floor,vectors(x,.075,z),down,.15),head=hit(ceiling,vectors(x,2.725,z),up,.15);
    assert(low&&high&&ground&&head,'Missing installed channel or floor/ceiling at '+x+', '+z);
    const floorGap=low.point.y-ground.point.y,ceilingGap=head.point.y-high.point.y;
    assert(Math.abs(floorGap)<.001&&Math.abs(ceilingGap)<.001);
    contacts.push({atXZ:[x,z],floor:ground.object.name,bottom:low.object.name,top:high.object.name,ceiling:head.object.name,
      worldBottom:xyz(low.point),worldTop:xyz(high.point),floorGapM:round(floorGap),ceilingGapM:round(ceilingGap)});
  }
  const nav=session.scene.navigation().obstacles.find(o=>o.instanceId===id);
  assert(nav?.object===group);assert.deepEqual(nav.footprint,card.footprint);
  const obstacle=deriveCompany(doc,catalog,templates).obstacles.find(o=>o.id===id),bounds=new T.Box3().setFromObject(visual,true);
  for(const [i,axis] of ['x','z'].entries()){
    assert(Math.abs(bounds.min[axis]-obstacle.min[i])<.001&&Math.abs(bounds.max[axis]-obstacle.max[i])<.001);
  }
  return {id,parentId:room,resource:n.resource,glbSha256:card.asset.sha256,transform:n.transform,contacts,parts,worldBounds:[xyz(bounds.min),xyz(bounds.max)]};
}
async function rooms(item){
  const studio=item.key==='glass-studio',folder=path.join(published,item.key),id=item.key+(studio?'/ground/live/screen':'/ground/work/screen');
  const saved=await fs.readFile(path.join(folder,'save.json'),'utf8'),layout=await decodeCompanySave(saved,catalog,templates);
  assert.deepEqual(layout,JSON.parse(await fs.readFile(path.join(folder,'layout.json'),'utf8')));
  const base=node(layout,id),room=base.parentId,before=inspectCompanyPlacement(layout,catalog,templates);
  const summary={key:item.key,sourceSaveSha256:hash(saved),roomId:room,base:base.resource,models:[]};report.rooms.push(summary);
  const staticUse=p=>{
    const portals=p.checkedPortals.filter(s=>s.regionId===room),points=p.checkedPoints.filter(s=>s.roomId===room);
    assert(portals.some(s=>s.connected)&&points.length===(studio?3:1)&&points.every(s=>s.approachConnected&&s.exitConnected));
    return {portals:portals.map(s=>({id:s.connectionId,local:s.center.local,width:s.width})),points:points.map(s=>s.id)};
  };
  summary.routes=staticUse(before);
  await withAssets(layout,async assetLibrary=>{
    const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,value)=>values.set(k,value)};
    const open=()=>createCompanyAuthoring(new T.Scene(),layout,{...opts,storage,assetLibrary,mirrorPreflight:()=>{}});
    let final,finalSave,last;
    const session=await open();
    try{
      for(const card of cards){
        await session.apply([{type:'replace-resource',id,resource:ref(card.id)}]);
        const model=installed(session,id);assert.deepEqual(model.transform,base.transform);summary.models.push(model);
      }
      assert.equal(new Set(summary.models.map(m=>m.glbSha256)).size,4);
      await session.apply([{type:'replace-resource',id,resource:base.resource}]);
      const shifted=studio?move(id,0,.22,q):move(id,-.85,1.47,0);
      await session.apply([shifted]);assert.deepEqual(installed(session,id).transform,shifted.transform);
      const rotated=studio?move(id,0,1.65,0):move(id,1.65,-.12,q);
      await session.apply([rotated]);last=installed(session,id);
      assert.deepEqual(last.transform,rotated.transform);summary.changed=last;
      const copy=id+'-copy',copyTransform=studio?pose(-2.52,1.39,q):base.transform;
      await session.apply([{type:'copy-facility',id,newId:copy,parentId:room,transform:copyTransform}]);
      const duplicate=installed(session,copy);assert.deepEqual(duplicate.resource,last.resource);summary.copy=duplicate;
      await session.apply([{type:'remove',id:copy}]);
      assert(!session.scene.navigation().obstacles.some(o=>o.instanceId===copy));
      assert(!node(session.document,copy));assert.deepEqual(installed(session,id),last);
      summary.editedRoutes=staticUse(inspectCompanyPlacement(session.document,catalog,templates));
      await session.save();finalSave=session.readSavedText(layout.id);final=session.snapshot();const scene=session.scene.root;
      const op=studio?move(id,1.46,2.64,0):move(id,-1.9,0,q);
      await assert.rejects(()=>session.apply([op]),error=>{
        assert.equal(error.code,'blocked-portal',error.message);assert.equal(error.path,summary.routes.portals[0].id);assert.equal(error.details.obstacleId,id);
        summary.refused={op,code:error.code,path:error.path,details:error.details};return true;
      });
      assert.deepEqual(session.snapshot(),final);assert.equal(session.scene.root,scene);assert.equal(session.readSavedText(layout.id),finalSave);
    }finally{session.dispose();}
    const cold=await open();
    try{
      await cold.restore(layout.id);assert.deepEqual(cold.snapshot(),final);assert.equal(await cold.export(),finalSave);
      assert.deepEqual(installed(cold,id),last);summary.coldSaveSha256=hash(finalSave);
      await fs.writeFile(path.join(out,item.key+'.edited.save.json'),finalSave,{flag:'wx'});
    }finally{cold.dispose();}
  });
}
async function sightFixture(){
  const original=JSON.parse(await fs.readFile(batchFile('product-showcase-rooms'),'utf8')).items.find(i=>i.key==='showcase-rental');
  const room=original.key+'/ground/live',id=room+'/sight-partition',rule=original.productShowcases[0];
  const ceiling={type:'set-surface-finish',id:room,surface:'ceiling',finish:{resource:ref('ceiling-panel-grid')}};
  const fixture=prepareCompanyChange(createCompanyScaleV2(original.input,catalog,templates),[...original.operations,ceiling],opts).document;
  const unpartitioned=await checkShowcaseRoom(fixture,rule);
  const transform=pose(-.15,.56,0),add={type:'add-facility',parentId:room,id,resource:ref('glass-partition-clear'),transform};
  const clear=prepareCompanyChange(fixture,[add],opts).document;
  const framed=prepareCompanyChange(clear,[{type:'replace-resource',id,resource:ref('glass-partition-framed')}],opts).document;
  const clearResult=await checkShowcaseRoom(clear,rule);
  assert.equal(clearResult.sight.productHits.length,5);
  assert.deepEqual(clearResult.sight.productHits,unpartitioned.sight.productHits);
  const evidence={source:'scripts/company-platform/batch-inputs/product-showcase-rooms.json',sourceKey:original.key,
    roomId:room,portalId:rule.portalId,id,transform,clear:clearResult.sight,baselines:{camera:rule.members.camera,product:rule.members.featured},rays:{}};
  // Independently intersect each measured lens-to-product segment with only the newly installed visible GLB.
  for(const doc of [clear,framed])await withAssets(doc,async assetLibrary=>{
    const session=await createCompanyAuthoring(new T.Scene(),doc,{...opts,assetLibrary,storage:{getItem:()=>null,setItem:()=>{}},mirrorPreflight:()=>{}});
    try{
      const root=session.scene.root;root.updateWorldMatrix(true,true);
      const region=root.getObjectByName(room),part=root.getObjectByName(id),visual=part.children[0];
      const origin=region.localToWorld(new T.Vector3(...clearResult.sight.lens));
      const rows=clearResult.sight.productHits.map(target=>{
        const end=region.localToWorld(new T.Vector3(...target.position)),direction=end.clone().sub(origin);
        const ray=new T.Raycaster(origin,direction.clone().normalize(),0,direction.length());
        const intersections=ray.intersectObject(visual,true);assert(intersections.length);
        const hit=intersections[0],m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
        return {target:target.position,point:xyz(part.worldToLocal(hit.point.clone())),part:hit.object.userData.name||hit.object.name,material:m.name,
          transparent:m.transparent,opacity:round(m.opacity),lensToFirstSurfaceM:round(hit.distance)};
      });
      const variant=node(doc,id).resource.id;
      if(doc===clear)assert(rows.every(r=>r.transparent&&r.opacity<1));
      else assert(rows.every(r=>r.part==='mullion-1'&&r.opacity===1));
      evidence.rays[variant]=rows;
    }finally{session.dispose();}
  });
  await assert.rejects(()=>checkShowcaseRoom(framed,rule),err=>{
    assert.equal(err.code,'showcase-occluded',err.message);assert.equal(err.path,id);assert.equal(err.details.blocker.mesh,'mullion-1');
    evidence.framedRefusal={code:err.code,path:err.path,details:err.details};return true;
  });
  await fs.writeFile(path.join(out,'camera-fixture.json'),bytes({source:evidence.source,key:original.key,operations:[ceiling,add],
    blockedOperation:{type:'replace-resource',id,resource:ref('glass-partition-framed')}}),{flag:'wx'});
  report.productCamera=evidence;
}
try{
  assert(cards.every(Boolean),'Register all four glass partitions first');
  const publishedRun=await runCompanyBatch(batch,{outputDirectory:published});assert(publishedRun.ok,JSON.stringify(publishedRun.results));
  for(const item of batch.items)await rooms(item);
  await sightFixture();
  const retry=await runCompanyBatch(batch,{outputDirectory:published});assert(retry.ok&&retry.results.every(i=>i.status==='idempotent'));
  report.batch=retry.results.map(({key,status})=>({key,initial:publishedRun.results.find(r=>r.key===key).status,retry:status}));
  for(const result of report.rooms){
    const reissued=await fs.readFile(path.join(published,result.key,'save.json'));
    assert.equal(hash(reissued),result.sourceSaveSha256);
    result.batchRetrySaveSha256=hash(reissued);
  }
  report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),bytes(report),{flag:'wx'});}
console.log(JSON.stringify({status:report.status,rooms:report.rooms.length,cameraSamples:report.productCamera?.clear.productHits.length,output:out}));
