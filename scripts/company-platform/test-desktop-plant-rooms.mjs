import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Group, Raycaster, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import batch from './batch-inputs/desktop-plant-rooms.json' with {type:'json'};
import cableBatch from './batch-inputs/mouse-pad-rooms.json' with {type:'json'};
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createFacilityPlacement,listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {installNodeImageDecodeShim,preflightDesktopAreas} from './preflight-library-assets.mjs';

const context={catalog,templates};
const branch='plant-desktop-installation';
const root=fileURLToPath(new URL('../../',import.meta.url));
const looks=catalog.resources.filter(r=>r.productionBranch===branch);
const ref=({id,version})=>({id,version});
const known=['bonsai','cactus','broadleaf','succulent'].map(name=>'desktop-plant-'+name);
assert(known.every(id=>looks.some(r=>r.id===id&&r.version===1)));
assert.equal(new Set(looks.map(r=>r.asset.sha256)).size,looks.length);
for(const look of looks){
  assert.equal(look.mountRole,branch);
  assert.equal(look.mount,'desk-surface');
  assert.deepEqual(look.mounting,{origin:'bottom',width:.35,height:.55,depth:.35,reserveDesktopArea:true});
  assert(compareFacilityFunction(looks[0],look).compatible);
  assert(!look.footprint?.blocking && !look.usePoints.length);
}
assert.deepEqual(batch.items.map(item=>item.key).sort(),['plant-home','plant-rental']);
const documents=new Map();
const storage={getItem:key=>documents.get(key)??null,setItem:(key,value)=>documents.set(key,value)};
installNodeImageDecodeShim();
const assetLibrary=createCompanyAssetLibrary({fetchImpl:async url=>{
  const bytes=await fs.readFile(new URL('../../prototype/public'+url,import.meta.url));
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}});
const author=document=>createCompanyAuthoring(new Group(),document,{...context,storage,assetLibrary});
const inputDocument=item=>prepareCompanyChange(createCompanyScaleV2(item.input,catalog,templates),item.operations,context).document;
const at=(doc,id)=>{const node=doc.nodes.find(n=>n.id===id);assert(node,id);return node;};
const move=(id,position,yaw=0)=>({type:'move',id,transform:{position,yaw}});
const replace=(id,look)=>({type:'replace-resource',id,resource:ref(look)});
const geometryPreflight=doc=>preflightDesktopAreas(root,deriveCompany(doc,catalog,templates));
const snapshotPlacement=doc=>inspectCompanyPlacement(doc,catalog,templates);
async function rejected(session,operations,code,detail){
  await session.save();
  const original=session.document,bytes=session.readSavedText(original.id);
  await assert.rejects(session.apply(operations),error=>error.code===code&&(!detail||error.message.includes(detail)));
  assert.deepEqual(session.document,original);
  assert.equal(session.readSavedText(original.id),bytes);
}

// Measure actual bottom vertices across the pot and cast down to the host tabletop.
// Both world transforms include the floor, workstation and parent desk.
function verifyContact(session,id){
  const doc=session.document,node=at(doc,id);
  const group=session.scene.root.getObjectByName(id),desk=session.scene.root.getObjectByName(node.parentId);
  const pot=group?.getObjectByName('desktop-plant-pot'),foliage=group?.getObjectByName('desktop-plant-foliage');
  const top=desk?.getObjectByName('desktop');
  assert(pot&&foliage&&top?.isMesh,'The loaded plant and desk must expose their real mesh parts.');
  session.scene.root.updateMatrixWorld(true);
  const base=[],leaves=[];
  for(const [part,points] of [[pot,base],[foliage,leaves]]){
    part.traverse(mesh=>{
      if(!mesh.isMesh)return;
      assert(mesh.visible && mesh.geometry.attributes.position.count>=3);
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)points.push(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
    });
    assert(points.length>=3);
  }
  const floorY=base.reduce((min,p)=>Math.min(min,p.y),Infinity);
  const contact=base.filter(p=>p.y<floorY+.0001);
  const delta=(a,b,field)=>a[field]-b[field];
  const yAxis=new Vector3(0,-1,0);
  for(const field of ['x','z']){
    contact.sort((a,b)=>delta(a,b,field));
    assert(contact.at(-1)[field]-contact[0][field]>.01,'Pot must rest on a finite base');
    for(const vertex of [contact[0],contact.at(-1)]){
      const ray=new Raycaster(vertex.clone().addScaledVector(yAxis,-.05),yAxis,0,.055);
      const hit=ray.intersectObject(top,false)[0];
      assert(hit && Math.abs(hit.point.y-vertex.y)<.001,'The rendered pot base must meet the tabletop');
    }
  }
  assert(leaves.some(p=>p.y>floorY+.01));
  const position=group.getWorldPosition(new Vector3());
  const expected=deriveCompany(doc,catalog,templates).worlds.get(id).position;
  assert(position.distanceTo(new Vector3(...expected))<1e-6);
  return {potVertices:base.length,leafVertices:leaves.length,contactHeightM:floorY,world:position.toArray()};
}

async function checkRoom(item){
  const start=inputDocument(item), live=item.key+'/ground/live',station=live+'/station-1',desk=station+'/desk';
  const id=station+'/desktop-plant',phone=station+'/phone';
  const initial=at(start,id), surface=catalog.resources.find(r=>r.id===at(start,desk).resource.id&&r.version===at(start,desk).resource.version).surface;
  const plain=prepareCompanyChange(start,[{type:'remove',id}],context).document;
  const navigation=snapshotPlacement(plain);
  assert.deepEqual(snapshotPlacement(start),navigation);
  let session=await author(start);
  try{
    const measurements=[];
    for(const look of looks){
      await session.apply([replace(id,look)]);
      assert.deepEqual(at(session.document,id).transform,initial.transform);
      assert.deepEqual(snapshotPlacement(session.document),navigation);
      measurements.push({look:ref(look),glbSha256:look.asset.sha256,...verifyContact(session,id)});
    }
    const spot=initial.transform.position;
    await session.apply([{type:'remove',id}]);
    const target=listPlacementTargets(session.document,catalog,looks[0],live,{templates}).find(t=>t.parentId===desk);
    assert(target);
    const {operation,id:manual}=createFacilityPlacement(session.document,catalog,looks[0],target.id,{x:spot[0],z:spot[2]},live,{templates});
    await session.apply([operation]);verifyContact(session,manual);
    await session.apply([{type:'remove',id:manual},{type:'add-facility',id,parentId:desk,resource:initial.resource,transform:initial.transform}]);
    const sign=Math.sign(spot[0]),edge=sign*(surface.halfSize[0]-.35/2);
    await session.apply([move(id,[edge,surface.topY,spot[2]],Math.PI/2)]);verifyContact(session,id);
    await rejected(session,[move(id,[edge+sign*.002,surface.topY,spot[2]],Math.PI/2)],'invalid-desktop-envelope');
    await session.apply([move(id,spot)]);
    const phoneSpot=at(start,phone).transform.position;
    // Partial overlap: the centres remain outside one another's installation area.
    const overlap=[phoneSpot[0]+Math.sign(phoneSpot[0])*(.175+.09-.012),surface.topY,phoneSpot[2]];
    const keyboard=at(start,station+'/keyboard');
    for(const view of ['floor','building']){
      await session.setView({mode:view});
      await rejected(session,[move(id,overlap)],'desktop-area-occupied');
      await rejected(session,[move(id,phoneSpot)],'desktop-area-occupied');
      await rejected(session,[move(id,keyboard.transform.position)],'desktop-area-occupied',keyboard.id);
    }
    await session.setView({mode:'floor'});
    await rejected(session,[move(station,at(start,station).transform.position,Math.PI/4)],'unsupported-rotation');
    await session.apply([move(station,[0,0,0],Math.PI/2)]);
    const rotated=verifyContact(session,id);
    await rejected(session,[move(id,overlap)],'desktop-area-occupied');
    const copy=live+'/plant-station-copy';
    await session.apply([move(station,[-1.1,0,-.5]),{type:'copy-workstation',id:station,newId:copy,transform:{position:[1.1,0,-.5],yaw:0}}]);
    const duplicate=session.document.nodes.find(n=>n.parentId===copy+'/desk'&&n.resource?.id===initial.resource.id);
    assert(duplicate && duplicate.id!==id);verifyContact(session,duplicate.id);
    const substitute=looks.find(r=>r.id!==initial.resource.id);
    await session.apply([replace(duplicate.id,substitute)]);
    assert.deepEqual(at(session.document,id).resource,initial.resource);
    const final=session.document;
    await session.save();
    const saved=session.readSavedText(item.key);
    session.dispose();session=await author(plain);await session.restore(item.key);
    assert.deepEqual(session.document,final);assert.equal(session.readSavedText(item.key),saved);
    assert.deepEqual(at(session.document,duplicate.id).resource,ref(substitute));
    verifyContact(session,id);verifyContact(session,duplicate.id);
    return {key:item.key,id,copy:duplicate.id,rotated,measurements,
      edgeContactX:edge,rejectedOverhangM:.002,phoneOverlapM:.012,blockedByKeyboard:keyboard.id,
      restoredRevision:session.document.revision,originalResource:at(session.document,id).resource,copiedResource:ref(substitute)};
  } finally {session.dispose();}
}

async function checkLampPose(){
  const item=batch.items.find(i=>i.key==='plant-rental'),base=inputDocument(item);
  const desk=item.key+'/ground/work/desk',lamp=desk+'/column',pot=desk+'/bonsai';
  const add=(id,resource,z,state={})=>({type:'add-facility',id,parentId:desk,resource:{id:resource,version:1},
    transform:{position:[0,.84,z],yaw:0},state});
  const pair=(angle,gap)=>[add(lamp,'desk-lamp-column',-.15,{angle}),add(pot,'desktop-plant-bonsai',-.15+gap+.175)];
  // The column head reaches 88.4 mm at +0.35 and 111.6 mm at -0.35.
  // The neutral imported mesh reaches 103.5 mm. These clearances distinguish all three poses.
  const cases=[{angle:.35,gap:.095,valid:true},{angle:-.35,gap:.107,valid:false},{angle:-.35,gap:.112,valid:true}];
  for(const {angle,gap,valid} of cases){
    const operations=pair(angle,gap);
    const candidate=prepareCompanyChange(base,operations,context).document;
    for(const mode of ['floor','building']){
      const session=await author(base);
      try{
        await session.setView({mode});
        if(valid){
          await session.apply(operations);
          assert.equal(at(session.document,lamp).state.angle,angle);
        }else await rejected(session,operations,'desktop-area-occupied',lamp);
      } finally {session.dispose();}
    }
    if(valid)await geometryPreflight(candidate);
    else await assert.rejects(geometryPreflight(candidate),{code:'desktop-area-occupied',path:pot});
  }
  const session=await author(base);
  try{
    await session.apply(pair(.35,.095));
    await rejected(session,[{type:'set-state',id:lamp,state:{angle:-.35}}],'desktop-area-occupied',lamp);
    await session.restore(base.id);
    assert.equal(at(session.document,lamp).state.angle,.35);
  } finally {session.dispose();}
  return cases;
}

async function checkCable(){
  const item=cableBatch.items.find(i=>i.key==='mouse-pad-home');
  const source=inputDocument(item),derived=deriveCompany(source,catalog,templates);
  const route=[...derived.cableConnections.values()][0];assert(route?.connected);
  const middle=route.a.map((v,i)=>(v+route.b[i])/2);
  const op={type:'add-facility',id:route.parentId+'/test-plant-at-cable',parentId:route.parentId,resource:ref(looks[0]),
    transform:{position:[middle[0],.84,middle[2]],yaw:0}};
  const session=await author(source);
  try{
    await rejected(session,[op],'cable-route-obstructed');
    const blocked=prepareCompanyChange(source,[op],context).document;
    await assert.rejects(geometryPreflight(blocked),{code:'cable-route-obstructed'});
    return {route:route.id,span:route.span,rejection:'cable-route-obstructed'};
  } finally {session.dispose();}
}

try {
  const rooms=[];
  for(const item of batch.items)rooms.push(await checkRoom(item));
  console.log(JSON.stringify({status:'passed',rooms,cable:await checkCable(),lampPoses:await checkLampPose()},null,2));
} finally {assetLibrary.dispose();}
