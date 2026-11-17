import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {clockReading,validateClockResource,validatePresentationInputs} from '../../prototype/src/company/clock-display.js';
import {createCompany,prepareCompanyChange,deriveCompany,catalogMaps} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root))),templates={templates:[]};
const resources=catalog.resources.filter(r=>r.clockDisplay&&r.mount==='wall'),checks=[];
const fail=(code,path,message)=>{throw Object.assign(Error(message),{code,path});};
async function check(name,fn){const result=await fn();checks.push({name,passed:true,result});}
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
let scene;
try {
await check('Eight actual registrations have exact typed states and distinct compatible branch mappings',()=>{
  assert.equal(resources.length,8);catalogMaps(catalog,templates);
  for(const kind of ['analog','digital']){const branch=resources.filter(r=>r.clockDisplay.kind===kind);assert.equal(branch.length,4);assert.equal(new Set(branch.map(r=>r.asset.sha256)).size,4);for(const r of branch)assert(compareFacilityFunction(branch[0],r).compatible);}
  const good=resources.find(r=>r.clockDisplay.kind==='digital');
  for(const mutate of [r=>r.clockDisplay.format='12h',r=>r.clockNodes.digits[1][0]=r.clockNodes.digits[0][0],r=>r.stateSchema.on.min=0,r=>r.stateSchema.brightness.max=100,r=>r.stateSemantics.on='other',r=>r.mounting.width=1,r=>r.clockDisplay.extra=true]){
    const bad=structuredClone(good);mutate(bad);assert.throws(()=>validateClockResource(bad,fail),e=>e.code==='invalid-clock-contract');
  }
});
await check('Known host inputs preserve fractional movement, 24-hour wrap and negative offsets',()=>{
  assert.equal(clockReading(33330).text,'09:15:30');assert.equal(clockReading(86400).text,'00:00:00');assert.equal(clockReading(0,-1).text,'23:59:59');assert.equal(clockReading(-86401).text,'23:59:59');
  const angles=clockReading(3661.5).angles;assert(Math.abs(angles.second+Math.PI/20)<1e-12);assert(Math.abs(angles.minute+Math.PI*2*61.5/3600)<1e-12);assert(Math.abs(angles.hour+Math.PI*2*3661.5/43200)<1e-12);
  for(const input of [{clockSeconds:NaN},{clockSeconds:Infinity},{clockSeconds:'1'},{clockSeconds:1e13},{clockSeconds:1,delta:1},{}])assert.throws(()=>validatePresentationInputs(input));
});
await library.preload(resources);
const analog=resources.find(r=>r.clockDisplay.kind==='analog'),digital=resources.find(r=>r.clockDisplay.kind==='digital');
let doc=createCompany({id:'clock-data',width:6,depth:5},catalog),room=doc.nodes[1].id;
doc=prepareCompanyChange(doc,[analog,digital,digital].map((r,i)=>({type:'add-facility',id:`clock${i}`,parentId:room,resource:{id:r.id,version:r.version},transform:{position:[-1+i,1.7,-2.4],yaw:0}})),{catalog,templates}).document;
scene=createCompanyScene(new THREE.Scene(),doc,{catalog,templates,assetLibrary:library});
const object=id=>scene.root.getObjectByName(id),reading=id=>{const node=scene.document.nodes.find(n=>n.id===id),r=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);return {node,r,object:object(id)};};
await check('Clock ticks use actual imported hands/segments and leave revisions, saved bytes and navigation unchanged',()=>{
  const before=scene.save(),revision=scene.revision,navigation=JSON.stringify(scene.navigation().obstacles.map(({object,...o})=>o));
  scene.setPresentationInputs({clockSeconds:33330});const a=reading('clock0');assert(Math.abs(a.object.getObjectByName(a.r.clockNodes.second).rotation.z+Math.PI)<1e-12);
  const d=reading('clock1'),digit=d.r.clockNodes.digits[0].map(n=>d.object.getObjectByName(n).visible);assert.deepEqual(digit,[true,true,true,true,true,true,false]);
  scene.setPresentationInputs({clockSeconds:33331.5});assert.notEqual(a.object.getObjectByName(a.r.clockNodes.second).rotation.z,-Math.PI);
  assert.equal(scene.save(),before);assert.equal(scene.revision,revision);assert.equal(JSON.stringify(scene.navigation().obstacles.map(({object,...o})=>o)),navigation);
});
await check('Latest time applies to a previously prepared appearance and restore/view changes without transaction conflicts',()=>{
  const candidate=scene.prepareChange([{type:'replace-resource',id:'clock0',resource:{id:resources.filter(r=>r.clockDisplay.kind==='analog')[1].id,version:1}}]);
  scene.setPresentationInputs({clockSeconds:43215});scene.commit(candidate);
  let a=reading('clock0');assert(Math.abs(a.object.getObjectByName(a.r.clockNodes.second).rotation.z+Math.PI/2)<1e-12);
  const saved=scene.save();scene.setView({mode:'building'});scene.setPresentationInputs({clockSeconds:43245});scene.setView({mode:'room',roomId:room});scene.restore(saved);
  a=reading('clock0');assert(Math.abs(a.object.getObjectByName(a.r.clockNodes.second).rotation.z+Math.PI*1.5)<1e-12);assert.equal(scene.save(),saved);
});
await check('Digital power, brightness and offset are independently saved and do not mutate another instance',()=>{
  scene.commit(scene.prepareChange([{type:'set-state',id:'clock1',state:{brightness:.3,timeOffsetSeconds:3600,on:false}}]));
  const d1=reading('clock1'),d2=reading('clock2'),mesh1=d1.object.getObjectByName(d1.r.clockNodes.digits[0][0]),mesh2=d2.object.getObjectByName(d2.r.clockNodes.digits[0][0]);
  assert.notEqual(mesh1.material,mesh2.material);assert.equal(mesh1.visible,false);assert.equal(mesh2.visible,false); // 12h begins with 1: top segment off.
  assert.equal(mesh1.material.emissiveIntensity,0);assert.equal(mesh2.material.emissiveIntensity,1);
  scene.commit(scene.prepareChange([{type:'set-state',id:'clock1',state:{on:true}}]));assert.equal(reading('clock1').object.getObjectByName(d1.r.clockNodes.digits[0][1]).material.emissiveIntensity,.3);
  const saved=scene.save();scene.restore(saved);assert.equal(reading('clock1').node.state.timeOffsetSeconds,3600);assert.equal(deriveCompany(scene.document,catalog,templates).facilities.find(f=>f.id==='clock2').state.brightness,1);
});
await check('Invalid time and state fail before replacing the live scene, input or saved configuration',()=>{
  const before=scene.save(),input=scene.presentationInputs,live=scene.root;
  for(const value of [NaN,Infinity,1e13,'12'])assert.throws(()=>scene.setPresentationInputs({clockSeconds:value}),e=>e.code==='invalid-presentation-input');
  for(const state of [{on:1},{brightness:1.1},{timeOffsetSeconds:-86401},{unknown:1}])assert.throws(()=>scene.prepareChange([{type:'set-state',id:'clock1',state}]),e=>e.code==='invalid-device-state');
  assert.equal(scene.save(),before);assert.equal(scene.root,live);assert.deepEqual(scene.presentationInputs,input);
});
} finally {scene?.dispose();library.dispose();}
const report={status:'passed',checks,limits:['CPU tests consume real imported GLBs; browser process restart, visual evidence and ordinary-PC performance are separate.']};
if(process.argv[2]){await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(`${process.argv[2]}/report.json`,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
