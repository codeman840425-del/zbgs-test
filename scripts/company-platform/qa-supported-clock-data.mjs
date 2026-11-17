import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,prepareCompanyChange,identityTransform,deriveCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {validateClockResource,clockReading} from '../../prototype/src/company/clock-display.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root))),templates={templates:[]};
const resources=catalog.resources.filter(r=>r.clockDisplay&&r.mount==='support-surface'),shelves=catalog.resources.filter(r=>r.mountRole==='storage-shelf'),checks=[];
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
let scene;
try {
await check('Eight supported appearances share branch function but cannot replace wall clocks or arbitrary frames',()=>{
 assert.equal(resources.length,8);
 for(const kind of ['analog','digital']){const selected=resources.filter(r=>r.clockDisplay.kind===kind);assert.equal(selected.length,4);assert.equal(new Set(selected.map(r=>r.asset.sha256)).size,4);for(const r of selected)assert(compareFacilityFunction(selected[0],r).compatible);assert(!compareFacilityFunction(selected[0],catalog.resources.find(r=>r.clockDisplay?.kind===kind&&r.mount==='wall')).compatible);}
 for(const mutate of [r=>r.clockDisplay.frame[1]+=.01,r=>delete r.clockNodes.base,r=>r.clockNodes.base=r.clockNodes.frame,r=>r.mounting.origin='center',r=>r.clockDisplay.frame.push(0)]){const bad=structuredClone(resources[0]);mutate(bad);assert.throws(()=>validateClockResource(bad,fail),e=>e.code==='invalid-clock-contract');}
});
await library.preload([...resources,...shelves]);
let doc=createCompany({id:'supported-clock-check',width:7,depth:6},catalog);const room=doc.nodes[1].id,ref=r=>({id:r.id,version:r.version});
doc=prepareCompanyChange(doc,[{type:'add-facility',id:'shelf',parentId:room,resource:ref(shelves[0]),transform:{position:[-1,0,-1],yaw:0}},
 ...['analog','digital'].map((kind,i)=>({type:'add-facility',id:kind,parentId:'shelf',resource:ref(resources.find(r=>r.clockDisplay.kind===kind)),attachment:{surfaceId:i?'top':'middle'},transform:{position:[0,i?1.8:1.05,0],yaw:0}})),
 {type:'group-facilities',id:'display',parentId:room,memberIds:['shelf'],transform:identityTransform()}],{catalog,templates}).document;
scene=createCompanyScene(new THREE.Scene(),doc,{catalog,templates,assetLibrary:library});
const apply=ops=>scene.commit(scene.prepareChange(ops)),get=id=>scene.root.getObjectByName(id);
await check('Real clock bottom contacts follow parent translation/yaw and host updates never rotate base or display frame',()=>{
 scene.setPresentationInputs({clockSeconds:33330});
 apply([{type:'move',id:'shelf',transform:{position:[1,0,-1],yaw:Math.PI/2}}]);
 const parent=get('shelf');
 for(const id of ['analog','digital']){const node=scene.document.nodes.find(n=>n.id===id),r=catalog.resources.find(r=>r.id===node.resource.id),object=get(id),base=object.getObjectByName(r.clockNodes.base),frame=object.getObjectByName(r.clockNodes.frame);
  assert(Math.abs(base.rotation.z)<1e-12);assert(Math.abs(frame.rotation.z)<1e-12);const expected=parent.localToWorld(new THREE.Vector3(...node.transform.position));assert(object.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-9);
  assert.deepEqual(frame.position.toArray(),r.clockDisplay.frame);
  if(id==='analog')assert(Math.abs(object.getObjectByName(r.clockNodes.second).rotation.z+Math.PI)<1e-9);
 }
});
await check('Each actual clock appearance preserves state and exact local mounting through restore',()=>{
 for(const kind of ['analog','digital'])for(const r of resources.filter(r=>r.clockDisplay.kind===kind)){
  apply([{type:'set-state',id:kind,state:kind==='digital'?{timeOffsetSeconds:3600,on:true,brightness:.3}:{timeOffsetSeconds:3600}},{type:'replace-resource',id:kind,resource:ref(r)}]);
  const before=scene.save();scene.restore(before);const n=scene.document.nodes.find(n=>n.id===kind);assert.equal(n.parentId,'shelf');assert.equal(n.state.timeOffsetSeconds,3600);assert.equal(n.attachment.surfaceId,kind==='analog'?'middle':'top');
  if(kind==='analog')assert(Math.abs(get(kind).getObjectByName(r.clockNodes.hour).rotation.z-clockReading(33330,3600).angles.hour)<1e-9);
 }
});
await check('Parent appearance replacement and assembly copy preserve children with independent identities/settings',()=>{
 const before=get('analog').matrixWorld.toArray();apply([{type:'replace-resource',id:'shelf',resource:ref(shelves[1])}]);assert.deepEqual(get('analog').matrixWorld.toArray(),before);
 apply([{type:'copy-group',id:'display',newId:'copy',transform:{position:[-3,0,1],yaw:0}}]);
 const copyShelf=scene.document.nodes.find(n=>n.parentId==='copy'),copyClock=scene.document.nodes.find(n=>n.parentId===copyShelf.id&&catalog.resources.find(r=>r.id===n.resource?.id)?.clockDisplay?.kind==='digital');assert(copyClock&&copyClock.id!=='digital');
 apply([{type:'set-state',id:copyClock.id,state:{on:false}}]);const derived=deriveCompany(scene.document,catalog,templates);assert.equal(derived.facilities.find(f=>f.id==='digital').state.on,true);assert.equal(derived.facilities.find(f=>f.id===copyClock.id).state.on,false);
 const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);return {copiedClock:copyClock.id,copiedParent:copyShelf.id};
});
await check('Whole-prop overhang and wrong height fail without changing saved state or current geometry',()=>{
 const saved=scene.save(),object=get('analog');
 for(const position of [[.5,1.05,0],[0,1.051,0]])assert.throws(()=>scene.prepareChange([{type:'move',id:'analog',transform:{position,yaw:0}}]),e=>e.code==='invalid-support-fit');
 assert.equal(scene.save(),saved);assert.equal(get('analog'),object);
});
}finally{scene?.dispose();library.dispose();}
const report={status:'passed',checks,limits:['CPU actual GLB checks only; browser restart and final fixed media separately required.','No stability, mass, physics or role acceptance.']};
if(process.argv[2]){await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(`${process.argv[2]}/report.json`,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
