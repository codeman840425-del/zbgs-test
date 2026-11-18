import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Raycaster,Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import batch from './batch-inputs/garment-rack-rooms.json' with {type:'json'};
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {createFacilityPlacement,listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {validateGarmentGeometry} from '../../prototype/src/company/garment-rack-geometry.js';
import {installNodeImageDecodeShim,preflightDesktopAreas} from './preflight-library-assets.mjs';

const context={catalog,templates};
const racks=catalog.resources.filter(r=>r.mountRole==='garment-rack-wardrobe');
const clothes=catalog.resources.filter(r=>r.mountRole==='hanging-garment');
for(const [list,prefix,ids] of [[racks,'garment-rack-',['portal','a-frame','cantilever','trestle']],
    [clothes,'garment-hanging-',['jacket','shirt','dress','hoodie']]]){
  for(const name of ids)assert(list.some(r=>r.id===prefix+name&&r.version===1),prefix+name);
  for(const r of list)assert(compareFacilityFunction(list[0],r).compatible,r.id);
}
const changed=structuredClone(racks[0]);changed.garmentRail.slots[0].position[0]+=.01;
assert(!compareFacilityFunction(racks[0],changed).compatible);
const ref=({id,version})=>({id,version});
const transform=(position,yaw=0)=>({position,yaw});
const rack=(id,parentId,position=[0,0,0],yaw=0)=>({type:'add-facility',id,parentId,transform:transform(position,yaw),resource:ref(racks[0])});
const garment=(id,parentId,slotId)=>({type:'add-facility',id,parentId,attachment:{slotId},resource:ref(clothes[0])});
const move=(id,position,yaw=0)=>({type:'move',id,transform:transform(position,yaw)});
const attach=(id,parentId,slotId)=>({type:'attach-garment',id,parentId,slotId});
const replace=(id,r)=>({type:'replace-resource',id,resource:ref(r)});
const at=(doc,id)=>{const n=doc.nodes.find(node=>node.id===id);assert(n,id);return n;};
const change=(doc,ops)=>prepareCompanyChange(doc,ops,context).document;
const geometryFail=(code,path,message)=>{throw Object.assign(new Error(path+': '+message),{code});};
const storageMap=new Map();
const storage={getItem:key=>storageMap.get(key)??null,setItem:(key,text)=>storageMap.set(key,text)};
installNodeImageDecodeShim();
const assetLibrary=createCompanyAssetLibrary({fetchImpl:async url=>{
  const bytes=await fs.readFile(new URL('../../prototype/public'+url,import.meta.url));
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}});
// The real rooms include mirrors. This CPU test checks the host callback only; mirror drawing is browser QA.
const author=doc=>createCompanyAuthoring(new Group(),doc,{...context,storage,assetLibrary,
  mirrorPreflight:({root,mirrors})=>assert(root.isObject3D && mirrors.length)});
const negativeCodes=[];
async function rejectsEdit(session,ops,code) {
  const original=session.document;
  await session.save();
  const previous=session.readSavedText(original.id);
  await assert.rejects(session.apply(ops),{code});
  assert.deepEqual(session.document,original);
  assert.equal(session.readSavedText(original.id),previous);
  negativeCodes.push(code);
}

// The ray from inside the real rail bore meets the hook crown at the same world point as the ray onto the rod.
function contacts(session,rackId){
  const scene=session.scene.root;scene.updateMatrixWorld(true);
  const parent=scene.getObjectByName(rackId),rail=parent?.getObjectByName('garment-rail');
  assert(rail?.isMesh,rackId);
  return session.document.nodes.filter(n=>n.parentId===rackId && n.attachment).map(node=>{
    const child=scene.getObjectByName(node.id),hook=child?.getObjectByName('hanger-hook');
    assert(hook?.isMesh && child.getObjectByName('garment-cloth')?.isMesh,node.id);
    const center=child.localToWorld(new Vector3(0,-.015,0)),up=new Vector3(0,1,0);
    const crown=new Raycaster(center,up,0,.025).intersectObject(hook,false)[0];
    const top=new Raycaster(center.clone().addScaledVector(up,.035),up.clone().negate(),0,.03).intersectObject(rail,false)[0];
    assert(crown&&top,node.id);
    const gap=crown.point.distanceTo(top.point);
    assert(gap<=.0005,node.id+' hook-to-rail '+gap);
    return {id:node.id,slot:node.attachment.slotId,look:node.resource,gapMetres:gap,contact:top.point.toArray()};
  });
}

async function checkRooms(){
  const rooms=[];
  for(const item of batch.items){
    const doc=change(createCompanyScaleV2(item.input,catalog,templates),item.operations);
    const id=doc.nodes.find(n=>racks.some(r=>r.id===n.resource?.id)).id;
    const session=await author(doc);
    try {
      const physical=contacts(session,id);
      assert.deepEqual(physical.map(p=>p.slot).sort(),['left','right']);
      const derived=deriveCompany(doc,catalog,templates);
      assert(derived.obstacles.some(o=>o.id===id));
      assert(!derived.usePoints.some(p=>p.facilityId===id||physical.some(c=>c.id===p.facilityId)));
      assert.deepEqual(listPlacementTargets(doc,catalog,clothes[0],at(doc,id).parentId,context),[]);
      await session.save();
      const reopened=await author(createCompany({id:'cold-room'},catalog));
      try{
        await reopened.restore(doc.id);
        assert.deepEqual(reopened.document,doc);
        assert.deepEqual(contacts(reopened,id),physical);
      }finally{reopened.dispose();}
      rooms.push({room:item.key,rack:at(doc,id).resource,physical});
    }finally{session.dispose();}
  }
  return rooms;
}

async function checkTransactions(){
  // Two separate floors deliberately share plan coordinates to expose cross-floor leaks.
  const doc=createCompany({id:'rack-operations'},catalog);
  doc.scale='building';
  const [floor,room]=doc.nodes,upper=room.id+'-upper',other=room.id+'-west';
  doc.nodes.push({...floor,id:floor.id+'-upper'}, {...room,id:upper,parentId:floor.id+'-upper'},
    {...room,id:other,transform:transform([9,0,0])});
  floor.connections=[{id:'adjoining-room',from:{regionId:room.id,edge:'east',offset:0,width:1},
    to:{regionId:other,edge:'west',offset:0,width:1}}];
  const session=await author(doc);
  const a='rack-a',b='rack-b',g='garment-a',h='garment-b';
  try{
    await session.apply([rack(a,room.id,[-2,0,-1]),rack(b,room.id,[1,0,-1]),rack('up',upper,[-2,0,-1]),rack('west',other)]);
    const targets=listPlacementTargets(session.document,catalog,clothes[0],room.id,context);
    assert.equal(targets.length,4);
    const target=targets.find(t=>t.parentId===a && t.attachment.slotId==='left');
    const {operation}=createFacilityPlacement(session.document,catalog,clothes[0],target.id,{},room.id,context);
    await session.apply([{...operation,id:g},garment(h,a,'right')]);
    assert(!listPlacementTargets(session.document,catalog,clothes[0],room.id,context).some(t=>t.parentId===a));
    assert.throws(()=>createFacilityPlacement(session.document,catalog,clothes[0],target.id,{},room.id,context),{code:'no-placement-target'});
    const sibling=structuredClone(at(session.document,h));
    const pairs=[];
    for(const r of racks){
      await session.apply([replace(a,r)]);
      for(const look of clothes){
        await session.apply([replace(g,look)]);
        assert.deepEqual(at(session.document,h),sibling);
        pairs.push({rack:ref(r),garment:ref(look),gapMetres:contacts(session,a).find(p=>p.id===g).gapMetres});
      }
    }
    await rejectsEdit(session,[attach(g,a,'right')],'garment-slot-occupied');
    await rejectsEdit(session,[attach(g,a,'middle')],'invalid-garment-attachment');
    await rejectsEdit(session,[attach(g,room.id,'left')],'invalid-garment-attachment');
    for(const targetRack of ['up','west'])await rejectsEdit(session,[attach(g,targetRack,'left')],'cross-room-garment');
    await rejectsEdit(session,[move(g,[-.23,1.515,0])],'invalid-garment-fit');
    await rejectsEdit(session,[move(g,[-.24,1.515,0],Math.PI/2)],'invalid-garment-fit');
    await rejectsEdit(session,[garment('free',room.id,'left')],'invalid-garment-attachment');
    await rejectsEdit(session,[replace(g,racks[0])],'incompatible-replacement');
    await rejectsEdit(session,[move(a,[0,0,3])],'outside-garment-clearance');
    await rejectsEdit(session,[rack('blocker',room.id,[-2,0,-.20],Math.PI)],'blocked-garment-clearance');
    await session.apply([attach(g,b,'right')]);
    assert.equal(at(session.document,g).parentId,b);
    await session.apply([attach(h,a,'left'),attach(g,a,'right')]);
    // The destination and source swap in the same transaction; there is no invalid persisted intermediate state.
    await session.apply([attach(h,a,'right'),attach(g,a,'left')]);
    await session.apply([move(a,[-2,0,-1],Math.PI/2)]);
    const before=contacts(session,a);
    await session.apply([{type:'copy-facility',id:a,newId:'rack-copy',transform:transform([1,0,1],Math.PI)}]);
    const copied=contacts(session,'rack-copy');
    assert.equal(copied.length,2);
    for(const c of copied){const original=before.find(p=>p.slot===c.slot);assert(original);assert.deepEqual(c.look,original.look);assert.notEqual(c.id,original.id);}
    await session.apply([move(a,[-1,0,-1],Math.PI)]);
    assert.deepEqual(contacts(session,'rack-copy'),copied);
    assert.notDeepEqual(contacts(session,a).map(p=>p.contact),before.map(p=>p.contact));
    const chair='active-chair',withChair=change(session.document,[{type:'add-facility',id:chair,parentId:room.id,
      resource:{id:'chair-ladder',version:1},transform:transform([3,0,2])}]);
    const point=deriveCompany(withChair,catalog,templates).usePoints.find(p=>p.facilityId===chair);
    assert(point);
    assert.throws(()=>prepareCompanyChange(withChair,[attach(g,b,'left'),move(chair,[3,0,1])],
      {...context,isUsePointBusy:id=>id===point.id}),{code:'facility-busy'});
    assert.equal(at(withChair,g).parentId,a);
    const final=session.document;
    await session.save();
    const restored=await author(doc);
    try{await restored.restore(final.id);assert.deepEqual(restored.document,final);assert.deepEqual(contacts(restored,'rack-copy'),copied);}
    finally{restored.dispose();}
    return {worldPairs:pairs,copy:copied,busyUsePoint:point.id};
  }finally{session.dispose();}
}

async function checkHiddenPreflight(){
  // A real, correctly hashed rack GLB is deliberately bound as a hanging garment.
  // Its validated role must follow the requested declaration even when the GLB is already cached as a rack.
  const wrong={...clothes[0],id:'test-wrong-garment',asset:racks[0].asset};
  const wrongCatalog={...catalog,resources:[...catalog.resources,wrong]};
  const base=createCompany({id:'rack-hidden'},wrongCatalog);
  base.scale='building';
  const [floor,room]=base.nodes;
  base.nodes.push({...floor,id:'upper-floor'},{...room,id:'upper-room',parentId:'upper-floor'});
  const testContext={catalog:wrongCatalog,templates};
  const from=prepareCompanyChange(base,[rack('upper-rack','upper-room'),garment('upper-garment','upper-rack','left')],testContext).document;
  const op=replace('upper-garment',wrong);
  const proposed=prepareCompanyChange(from,[op],testContext).derived;
  await assert.rejects(preflightDesktopAreas(fileURLToPath(new URL('../../',import.meta.url)),proposed),{code:'invalid-garment-envelope'});
  const session=await createCompanyAuthoring(new Group(),from,{...testContext,storage,assetLibrary});
  try{
    for(const view of [{mode:'floor',floorId:floor.id},{mode:'building'},{mode:'floor',floorId:'upper-floor'}]){
      await session.setView(view);
      await rejectsEdit(session,[op],'invalid-garment-envelope');
    }
  }finally{session.dispose();}
  return {resource:ref(wrong),glbFrom:racks[0].id,error:'invalid-garment-envelope',modes:['offline','other-floor','building','active-floor']};
}
async function checkMeshes(){
  await assetLibrary.preload([...racks,...clothes]);
  function damaged(resource,mutate,code){
    const {root}=assetLibrary.instantiate(resource);mutate(root);
    assert.throws(()=>validateGarmentGeometry(root,resource,geometryFail),{code});
    negativeCodes.push(code);
  }
  damaged(racks[0],root=>{root.getObjectByName('garment-rail').position.z+=.012;},'invalid-garment-rail');
  damaged(racks[0],root=>{root.traverse(n=>{if(n.isMesh&&n.name!=='garment-rail')n.position.y+=.003;});},'invalid-garment-ground');
  damaged(racks[0],root=>{
    const crossbar=new Mesh(new BoxGeometry(.85,.04,.04),new MeshStandardMaterial());
    crossbar.position.y=1.12;root.add(crossbar);
  },'blocked-garment-slot');
  damaged(clothes[0],root=>{root.getObjectByName('hanger-hook').position.z+=.003;},'invalid-garment-hook');
  damaged(clothes[0],root=>{root.getObjectByName('garment-cloth').visible=false;},'invalid-garment-mesh');
  damaged(clothes[0],root=>{
    const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,-.02,-.03,0,.006,.018,0,-.04,.03],3));
    root.add(new Mesh(geometry,new MeshStandardMaterial()));
  },'invalid-garment-hook');
  const badCatalog={...catalog,resources:catalog.resources.map(r=>r===racks[0]?changed:r)};
  assert.throws(()=>deriveCompany(createCompany({},badCatalog),badCatalog,templates),{code:'invalid-garment-contract'});
  const badGarment={...clothes[0],usePoints:[{id:'phantom'}]};
  await assert.rejects(assetLibrary.preload([badGarment]),{code:'invalid-garment-contract'});
  for(const list of [racks,clothes]){
    for(let i=0;i<list.length;i++){
      const sample=createAppearanceSample(list[0].productionBranch,i,catalog,templates);
      const session=await author(sample.document);
      try{
        const parent=sample.document.nodes.find(n=>racks.some(r=>n.resource?.id===r.id));
        assert.equal(contacts(session,parent.id).length,1);
        assert.deepEqual(at(sample.document,sample.target).resource,sample.resource);
      }finally{session.dispose();}
    }
  }
  return [...racks,...clothes].map(r=>({...ref(r),sha256:r.asset.sha256}));
}

try{
  const resources=await checkMeshes(),rooms=await checkRooms(),transactions=await checkTransactions();
  console.log(JSON.stringify({status:'passed',resources,rooms,transactions,hiddenPreflight:await checkHiddenPreflight(),negativeCodes},null,2));
}finally{assetLibrary.dispose();}
