import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Group} from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import batch from './batch-inputs/enclosed-wardrobe-rooms.json' with {type:'json'};
import contract from '../../assets-source/company-enclosed-wardrobe-v1/contract.json' with {type:'json'};
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {composeTransform,createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {inspectCompanyMotionSweep,inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {validateWardrobeResource} from '../../prototype/src/company/enclosed-wardrobe-data.js';
import {overlapsObstacle} from '../../prototype/src/company/wardrobe-footprints.js';

const contractOnly=process.argv.includes('--contract-only');
const base=['timber','framed','inset','glass'].map(name=>'enclosed-wardrobe-'+name);
const wardrobes=contractOnly?base.map(id=>({id,version:1,...contract.resource,asset:{format:'glb'},
  provenance:{environmentBranch:'garment-rack-wardrobe'}})):catalog.resources.filter(r=>r.mountRole==='enclosed-wardrobe');
assert(base.every(id=>wardrobes.some(r=>r.id===id&&r.version===1)),'Requires four registered v1 wardrobes');
const frame={id:'study-clearance-fixture',version:1,category:'decor',footprint:{center:[0,0],halfSize:[.003,.015],blocking:true},usePoints:[],stateDefaults:{}};
const active={...catalog,resources:[...catalog.resources.filter(r=>r.mountRole!=='enclosed-wardrobe'),...wardrobes,frame]};
const ctx={catalog:active,templates};
const ref=({id,version})=>({id,version});
const change=(doc,ops)=>{
  const result=prepareCompanyChange(doc,ops,ctx);
  inspectCompanyMotionSweep(doc,result.document,active,templates);
  inspectCompanyPlacement(result.document,active,templates);
  return result.document;
};
const node=(doc,id)=>doc.nodes.find(n=>n.id===id);
const set=(id,state)=>({type:'set-state',id,state});
const replace=(id,r)=>({type:'replace-resource',id,resource:ref(r)});
const attach=(id,parentId,slotId)=>({type:'attach-garment',id,parentId,slotId});
const remove=id=>({type:'remove',id});
const originalOpen=catalog.resources.find(r=>r.mountRole==='garment-rack-wardrobe');
assert(!compareFacilityFunction(originalOpen,wardrobes[0]).compatible);
for(const r of wardrobes)assert(compareFacilityFunction(wardrobes[0],r).compatible);
const fail=(code,path,message)=>{throw Object.assign(Error(path+': '+message),{code});};
for(const [field,v] of [['mountRole','garment-rack-wardrobe'],['partNodes',{left:'same',right:'same'}],
    ['garmentRail',{radius:.01}],['usePoints',[{id:'fabricated'}]],['stateDefaults',{leftOpen:1,rightOpen:0}]]){
  assert.throws(()=>validateWardrobeResource({...wardrobes[0],[field]:v},fail),{code:'invalid-wardrobe-contract'});
}
const keep=[];
async function denied(doc,ops,code){
  const saved=await encodeCompanySave(doc,active,templates);
  assert.throws(()=>change(doc,ops),{code});
  assert.equal(await encodeCompanySave(doc,active,templates),saved);
  keep.push(code);
}
async function navigationProvider(doc,id){
  installNodeImageDecodeShim();
  const assetLibrary=createCompanyAssetLibrary({fetchImpl:async url=>{
    const bytes=await fs.readFile(new URL('../../prototype/public'+url,import.meta.url));
    return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
  const stored=new Map(),storage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)};
  let session;
  try{
    session=await createCompanyAuthoring(new Group(),doc,{...ctx,storage,assetLibrary,
      mirrorPreflight:({mirrors})=>assert(mirrors.length)});
    await session.save();
    const text=session.readSavedText(doc.id);
    const items=()=>session.scene.navigation().obstacles.filter(o=>o.instanceId===id);
    const initial=items(),entry=session.scene.root.getObjectByName(id);
    assert(initial.every(o=>o.object===entry && o.footprint.partId));
    assert.deepEqual(new Set(initial.map(o=>o.footprint.partId)),new Set(['body','left','right']));
    const old=session.scene.root;
    await assert.rejects(session.apply([set(id,{leftOpen:1})]),{code:'overlapping-facilities'});
    assert.equal(session.scene.root,old);assert.equal(session.readSavedText(doc.id),text);
    await session.apply([set(id,{rightOpen:.5})]);
    const half=items();
    assert(half.filter(o=>o.footprint.partId==='right').length>1 && half.every(o=>o.instanceId===id));
    await session.restore(doc.id);
    assert.deepEqual(session.document,doc);
    return {initialCount:initial.length,halfCount:half.length,rejectedWithSameScene:true};
  }finally{session?.dispose();assetLibrary.dispose();}
}

async function checkRoom(item){
  const original=createCompanyScaleV2(item.input,active,templates);
  const ops=structuredClone(item.operations);
  const rack=ops.find(o=>o.resource?.id.startsWith('enclosed-wardrobe-')),id=rack.id;
  assert(base.includes(rack.resource.id));
  const initial=change(original,ops),children=initial.nodes.filter(n=>n.parentId===id);
  assert.equal(children.length,2);
  const put=(resource,name,offset,yaw=0)=>({type:'add-facility',parentId:rack.parentId,id:item.key+'/'+name,resource,
    transform:composeTransform(rack.transform,{position:offset,yaw})});
  const screen=put({id:'screen-partition-timber',version:1},'left-screen',[-.495,0,1.23],Math.PI/2);
  const coupon=put(ref(frame),'thin-probe',[-.451,0,.595]);
  const open=change(initial,[set(id,{leftOpen:1,rightOpen:1})]);
  const obstacleParts=doc=>deriveCompany(doc,active,templates).obstacles.filter(o=>o.id===id);
  const both=obstacleParts(open);
  assert.deepEqual(new Set(both.map(o=>o.partId)),new Set(['body','left','right']));
  assert(both.every(o=>o.node.id===id));
  assert.deepEqual(open.nodes.filter(n=>n.parentId===id),children);
  const screened=change(initial,[screen]),right=change(screened,[set(id,{rightOpen:1})]);
  assert.deepEqual(node(right,id).state,{leftOpen:0,rightOpen:1});
  await denied(right,[set(id,{leftOpen:1})],'overlapping-facilities');
  const half=change(screened,[set(id,{rightOpen:.5})]);
  assert(obstacleParts(half).filter(o=>o.partId==='right').length>1);
  const from=change(initial,[coupon]);
  await denied(from,[set(id,{leftOpen:1})],'blocked-moving-part');
  const end=change(change(initial,[set(id,{leftOpen:1})]),[coupon]);
  const text=await encodeCompanySave(end,active,templates);
  const restored=await decodeCompanySave(text,active,templates);
  assert.deepEqual(restored,end);
  inspectCompanyPlacement(restored,active,templates);
  await denied(restored,[set(id,{leftOpen:0})],'blocked-moving-part');
  const fixture=deriveCompany(end,active,templates).obstacles.find(o=>o.id===coupon.id);
  assert(!obstacleParts(end).some(o=>overlapsObstacle(o,fixture)));
  const left=children.find(n=>n.attachment.slotId==='left'),sibling=children.find(n=>n.id!==left.id);
  await denied(right,[attach(left.id,id,'right')],'garment-slot-occupied');
  await denied(right,[replace(id,originalOpen)],'incompatible-replacement');
  await denied(right,[set(id,{rightOpen:1.001})],'invalid-device-state');
  const styled=change(right,[replace(id,wardrobes[1]),replace(left.id,{id:'garment-hanging-hoodie',version:1})]);
  assert.deepEqual(node(styled,id).state,node(right,id).state);
  assert.deepEqual(node(styled,sibling.id),sibling);
  const available=change(styled,[remove(sibling.id)]);
  assert.deepEqual(listPlacementTargets(available,active,left.resource,rack.parentId,{templates}).filter(t=>t.parentId===id).map(t=>t.attachment.slotId),[sibling.attachment.slotId]);
  const navigation=contractOnly?null:await navigationProvider(right,id);
  return {key:item.key,wardrobe:id,transform:rack.transform,screen:screen.transform,coupon:coupon.transform,navigation,
    rightOpen:node(right,id).state,independentParts:both.map(o=>o.partId),restoredPastBlockedArc:node(restored,id).state};
}
function twoFloors(){
  const doc=createCompany({id:'wardrobe-copy'},active);doc.scale='building';
  const [floor,room]=doc.nodes;doc.nodes.push({...floor,id:'upper'},{...room,parentId:'upper',id:'upper-room'});
  const add=(id,parentId,r,position,slotId)=>({type:'add-facility',id,parentId,resource:ref(r),
    ...(position?{transform:{position,yaw:0}}:{}),...(slotId?{attachment:{slotId}}:{})});
  const first=change(doc,[add('enclosed',room.id,wardrobes[0],[-1,0,-1]),add('open',room.id,originalOpen,[2,0,-1]),
    add('up','upper-room',wardrobes[1],[-1,0,-1]),add('left','enclosed',{id:'garment-hanging-jacket',version:1},null,'left')]);
  const copied=change(first,[{type:'copy-facility',id:'enclosed',newId:'clone',transform:{position:[1,0,1],yaw:Math.PI}},
    set('enclosed',{leftOpen:.5}),attach('left','open','right')]);
  const child=copied.nodes.find(n=>n.parentId==='clone');
  assert(child && child.id!=='left' && child.attachment.slotId==='left');
  const attached=change(copied,[attach('left','enclosed','right')]);
  assert.throws(()=>change(attached,[attach('left','up','left')]),{code:'cross-room-garment'});
  assert.deepEqual(node(attached,'clone').state,node(first,'enclosed').state);
  const upper=deriveCompany(attached,active,templates).facilities.find(f=>f.id==='up').state;
  assert.deepEqual(upper,{leftOpen:0,rightOpen:0});
  return {copiedGarment:child.id,upper};
}
const rooms=[];
for(const item of batch.items)rooms.push(await checkRoom(item));
console.log(JSON.stringify({status:'passed',contractOnly,wardrobes:wardrobes.map(ref),rooms,copies:twoFloors(),preservedRejections:keep},null,2));
