import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import catalogInput from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {deriveCompany,createCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {shouldCheckGlassPartitions,glassPartitionFloors,measureGlassPartitionFloor,inspectGlassPartitionObjects} from '../../prototype/src/company/glass-partition-room.js';
import {createLocalRoomAssetLibrary} from './check-training-clearance.mjs';
import {checkManagedOutput} from './package-company.mjs';
const {rooms,output,help}=parseArgs({options:{rooms:{type:'string'},output:{type:'string'},help:{type:'boolean'}}}).values;
const usage='node scripts/company-platform/test-glass-partition-installed.mjs --rooms BATCH_DIRECTORY [--output NEW_RESULT_DIRECTORY]';
if(help){console.log(usage);process.exit(0);}
assert(rooms,usage);
const root=path.resolve(import.meta.dirname,'../..'),batch=await fs.realpath(path.resolve(rooms));
const directory=output && path.resolve(output),out=directory && path.join(directory,'report.json');
async function checkOutput(){
  if(!out)return;
  await checkManagedOutput(directory,root,{allowDelivery:false});
  await checkManagedOutput(out,root,{allowDelivery:false});
  for(let cursor=directory;;cursor=path.dirname(cursor)){
    const stat=await fs.lstat(cursor).catch(error=>{if(error.code!=='ENOENT')throw error;});
    if(stat) {
      assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Expected a regular output ancestor: '+cursor);
      assert(cursor!==directory,'A fresh output directory is required: '+cursor);
    }
    if(cursor===path.dirname(cursor))break;
  }
}
await checkOutput();
const catalog=structuredClone(catalogInput);
const lib=createLocalRoomAssetLibrary(),opts={catalog,templates,assetLibrary:lib},cases=[];
const cup=catalog.resources.find(r=>r.id==='tea-ceramic-cup'&&r.version===1);
const unblocked={id:'inspection-nonblocking-porcelain',version:1,coordinates:cup.coordinates,asset:cup.asset,category:'decor',mountRole:'inspection-decor',footprint:{blocking:false},stateDefaults:{},usePoints:[]};
catalog.resources.push(unblocked);
async function measured(doc){
  const d=deriveCompany(doc,catalog,templates);
  assert(shouldCheckGlassPartitions(doc,d));assert(shouldCheckGlassPartitions(doc,{catalog}));
  const groups=glassPartitionFloors(doc,d);await lib.preload(groups.flatMap(g=>g.resources));return groups.flatMap(g=>measureGlassPartitionFloor(doc,d,null,g,opts));
}
const pose=(x,y,z,yaw=0)=>({position:[x,y,z],yaw});
try{
  for(const id of ['glass-studio','glass-rental']){
    const doc=JSON.parse(await fs.readFile(path.join(batch,id,'layout.json'),'utf8'));
    assert.equal(doc.id,id,'The two named batch documents must have their own identities');
    const result=await measured(doc);const part=result[0].partitions[0];
    assert([part.bearings.floor,part.bearings.ceiling].every(row=>row.samples.length===15 && row.samples.every(s=>s.gapM<.001)));
    cases.push({name:id+' original pair of rail bearings',result});
    if(id==='glass-rental'){
      const room=doc.nodes.find(n=>n.id===part.roomId);room.finishes={...room.finishes,baseboard:{resource:{id:'baseboard-timber',version:1}}};
      await assert.rejects(measured(doc),e=>{assert.equal(e.code,'glass-partition-room-wall');assert.equal(e.details.structure,'baseboard');cases.push({name:'same rental with physical timber trim',code:e.code,details:e.details});return true;});
    }
  }
  const doc=createCompany({id:'dual-rail-inspection',width:8,depth:6},catalog);doc.scale='building';
  const [ground,room]=doc.nodes,upper={...structuredClone(ground),id:'upper'},upRoom={...structuredClone(room),id:'up-room',parentId:upper.id,transform:pose(2,0,-1,Math.PI/2)};
  const part={id:'installed-glass',kind:'facility',resource:{id:'glass-partition-clear',version:1},parentId:upRoom.id,transform:pose(0,0,0),state:{}};
  const jar={id:'unblocked-cup',kind:'facility',resource:{id:unblocked.id,version:1},parentId:upRoom.id,transform:pose(.34,1.12,.45),state:{}};
  doc.nodes.push(upper,upRoom,part,jar);
  await lib.preload([unblocked]);const cupInstance=lib.instantiate(unblocked);const cupBounds=new T.Box3().setFromObject(cupInstance.root,true);
  // The actual 12 mm pane has +/- 6 mm faces. Move the cup just inside the broader +/- 40 mm reservation.
  jar.transform.position[2]=.012-cupBounds.min.z;
  const good=await measured(doc);assert.equal(good[0].floorId,upper.id);
  cases.push({name:'real cup in reserved footprint but 6 mm clear of the pane',cupMinZ:.012,result:'accepted',floorId:upper.id,cupSha256:cup.asset.sha256});
  const d=deriveCompany(doc,catalog,templates),s=createCompanyScene(new T.Scene(),doc,{...opts,visibleFloorId:upper.id});
  try{
    const groups=new Map(doc.nodes.map(n=>[n.id,s.root.getObjectByName(n.id)]));
    const facilities=new Map(d.facilities.filter(f=>f.floorId===upper.id).map(f=>[f.id,{...f,visual:groups.get(f.id).children[0]}]));
    const floor=s.root.getObjectByName('Floor:'+upRoom.id),ceil=s.root.getObjectByName('Ceiling:'+upRoom.id);
    const ctx={groups,floorId:upper.id,facilities,walls:s.walls,floors:[floor],ceilings:[ceil]};
    inspectGlassPartitionObjects(d,ctx);
    for(const [key,surf] of [['floors','floor'],['ceilings','ceiling']]){
      assert.throws(()=>inspectGlassPartitionObjects(d,{...ctx,[key]:[]}),e=>{
        assert.equal(e.code,'glass-partition-room-bearing');assert.equal(e.details.surface,surf);assert.equal(e.details.slab,null);
        cases.push({name:'missing real '+surf,code:e.code,details:e.details});return true;});
    }
  }finally{s.dispose();}
  const entries=new Map(),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)};
  const session=await createCompanyAuthoring(new T.Scene(),doc,{...opts,storage});
  try{
    assert.equal(session.scene.view.floorId,ground.id);await session.save();
    const before=session.snapshot(),savedText=session.readSavedText(doc.id),savedEntries=[...entries];
    await assert.rejects(()=>session.apply([{type:'move',id:jar.id,transform:pose(.34,1.12,-cupBounds.getCenter(new T.Vector3()).z)}]),e=>{
      assert.equal(e.code,'glass-partition-room-occupied');assert.equal(e.details.other,jar.id);
      cases.push({name:'hidden rotated upper floor cup penetrates glass',code:e.code,details:e.details});return true;});
    assert.deepEqual(session.snapshot(),before);assert.deepEqual([...entries],savedEntries);assert.deepEqual(session.readSavedText(doc.id),savedText);
    await session.restore();assert.equal(session.document.nodes.find(n=>n.id===jar.id).transform.position[2],jar.transform.position[2]);
    cases.push({name:'ordinary save, failed edit and restore',result:'previous transform and stored bytes retained'});
  }finally{session.dispose();}
  const report=JSON.stringify({status:'passed',cases},null,2)+'\n';
  if(out){
    await checkOutput();
    await fs.mkdir(path.dirname(directory),{recursive:true});
    await fs.mkdir(directory);
    await fs.writeFile(out,report,{flag:'wx'});
    console.log(JSON.stringify({status:'passed',cases:cases.length,output:out}));
  }else process.stdout.write(report);
}finally{lib.dispose();}
