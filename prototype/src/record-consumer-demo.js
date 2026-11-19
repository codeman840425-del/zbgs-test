import * as THREE from 'three';
import Phaser from 'phaser';
import {prepareRecordedCharacter,createRecordAppearanceController} from './character-record-consumer.js';
import {attachFacilityBehavior} from './facility-behavior.js';
import {createSeatLeases} from './seat-lease.js';
import {resolveActorRoom,captureFacilityState,restoreFacilityState} from './record-facility-room.js';
import {createCharacterRecordBatch} from './character-record-batch.js';
import {performCharacterProduction} from './character-production.js';
import {productionRuleBodyPointers,validateCharacterRecordInput} from './character-record-input.js';
import {initializeRuleBodyData} from './foundation-profiles.js';
import {createRuleBodyGroupLoads} from './initial-asset-reads.js';

const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7ede3');
scene.add(new THREE.HemisphereLight(0xe9f4ff, 0xa5aa94, 2.5));
const light = new THREE.DirectionalLight(0xfff0d6, 2.9); light.position.set(-3, 8, 5); scene.add(light);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const stage=document.querySelector('#stage');stage.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(36,1,.05,60);camera.position.set(0,1.65,3.5);camera.lookAt(0,.9,0);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({color:'#d9ded5',roughness:1}));
ground.rotation.x=-Math.PI/2;scene.add(ground);
const resize=()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();};
const observer=new ResizeObserver(resize);observer.observe(stage);resize();
let batch=null,generation=0,records=[],selected=0,ready=false;
let closed=false,game,ruleBodyRegistration,groupLoads,failedSelection;
let selectionRequest=0;
const actors=new Map(), attempts=[], errors=[];
const actorRecords=new WeakMap(), seatLeases=createSeatLeases();
let room=null,restoreGeneration=0;
window.addEventListener('pagehide',event=>{
  if(event.persisted||closed)return;
  closed=true;generation++;batch?.cancel('page closing');observer.disconnect();
  for(const actor of actors.values())actor.dispose();actors.clear();
  groupLoads?.dispose();ruleBodyRegistration?.dispose();
  game?.destroy(true);ground.geometry.dispose();ground.material.dispose();renderer.dispose();
});
const buildInfo=await fetch('/build-info.json').then(r=>r.json());
const status=document.querySelector('#status'),resultElement=document.querySelector('#results');
function show(){const snapshot=batch?.snapshot();resultElement.textContent=snapshot?JSON.stringify(snapshot.items.map(({identityId,status,attempt,reason})=>({id:identityId,status,attempt,reason})),null,2):'';}
function setRoomPresentation(actor) {
  const previewSpeaking=!room?.supportsVocal;
  actor.avatar.livePresentation.setSpeaking(previewSpeaking);
  actor.avatar.livePresentation.setGaze(previewSpeaking?camera.position.toArray():null);
}
async function prepareRoomActor(record,{getPeers=()=>actors.values(),...options}) {
  const instance=await prepareRecordedCharacter(record,{scene,renderer,...options,
    createController(context) {
      return attachFacilityBehavior(createRecordAppearanceController(context.avatar),
        {...context,seatLeases,getRoom:()=>room,getPeers});
    }});
  actorRecords.set(instance,record);
  setRoomPresentation(instance);
  return instance;
}
async function consume(record,context,initialAssets){
  const owner=generation;attempts.push({identityId:record.identity.id,requestId:context.requestId});
  const current=()=>owner===generation&&context.isCurrent();
  const position=room?room.spawns[context.index]:[context.index===0?-.55:.55,0,0];
  if(!position)throw Error('missing-facility-spawn');
  const instance=await prepareRoomActor(record,{isCurrent:current,signal:context.signal,position,initialAssets});
  const release=()=>{if(actors.get(record.identity.id)===instance)actors.delete(record.identity.id);instance.dispose();};
  try{
    if(!current()){release();return{applied:false,cancelled:true};}
    instance.attach();actors.set(record.identity.id,instance);
    return{applied:true,release};
  }catch(error){release();throw error;}
}
async function selectGroup(index,inputs){
  if(![0,1].includes(index))throw Error('Unknown group');
  const group=inputs??records.slice(index*2,index*2+2);
  if(!Array.isArray(group)||group.length<1||group.length>2)throw Error('A group requires one or two character records');
  if(closed)throw Error('The record consumer has closed');
  const request=++selectionRequest;
  failedSelection=null;
  let initialAssets;
  if(groupLoads){
    try {
      const stage=await groupLoads.prepare(group);
      if(closed||request!==selectionRequest)return;
      initialAssets=stage?.commit();
    }
    catch(error){
      if(request===selectionRequest&&!closed) failedSelection={index,inputs,message:error.message};
      throw error;
    }
    if(!initialAssets)return;
  }
  selected=index;generation++;batch?.cancel('另一组人物已被选择');
  for(const actor of actors.values())actor.dispose();actors.clear();
  try {
    const ownBatch=createCharacterRecordBatch(group,{consume:(r,c)=>consume(r,c,initialAssets),batchId:'record-demo-'+generation});batch=ownBatch;
    status.textContent='加载人物记录 · '+buildInfo.shortId;show();
    const result=await ownBatch.run();
    if(!closed&&batch===ownBatch){status.textContent='当前组读取结束 · '+buildInfo.shortId;show();}
    return result;
  } finally { initialAssets?.dispose(); }
}
async function retrySelection(){
  if(failedSelection)return selectGroup(failedSelection.index,failedSelection.inputs);
  const result=await batch.retryFailed();show();return result;
}
const parameters=new URLSearchParams(location.search);
const productionMode=parameters.get('production')==='1';
let inputFailure=null;
if(!productionMode){
 try{
 const externalPath=parameters.get('records');
 if(parameters.has('records')&&(parameters.getAll('records').length!==1||externalPath!=='/records/manifest.json'))throw Error('Unsupported record manifest path');
 const manifestResponse=await fetch(externalPath??'/assets/record-consumer-v1/manifest.json',{redirect:'error'});
 if(!manifestResponse.ok)throw Error('Manifest HTTP '+manifestResponse.status);
 const manifest=await manifestResponse.json();
 const entries=externalPath?validateCharacterRecordInput(manifest,externalPath):manifest.entries;
 if(externalPath && Object.hasOwn(manifest,'ruleBodyDataPacks'))
   groupLoads=createRuleBodyGroupLoads(manifest.ruleBodyDataPacks,initializeRuleBodyData,location.href);
 records=await Promise.all(entries.map(async entry=>{
   const response=await fetch(entry.url,{redirect:'error'});if(!response.ok)throw Error('Record HTTP '+response.status);
   const bytes=await response.text();if(new TextEncoder().encode(bytes).length>512*1024)throw Error('Record exceeds 512 KiB');
   const record=JSON.parse(bytes);if(record.identity?.id!==entry.id||record.integrity?.recordSha256!==entry.recordSha256)throw Error('Record manifest identity mismatch');return record;
 }));
 document.querySelector('#second').hidden=records.length<=2;
 }catch(error){inputFailure=error.message;errors.push(inputFailure);status.textContent='人物记录加载失败：'+inputFailure;for(const id of ['first','second','retry'])document.querySelector('#'+id).disabled=true;}
}else{
 for(const id of ['first','second','retry'])document.querySelector('#'+id).hidden=true;
 status.textContent='等待 agent 制作请求 · '+buildInfo.shortId;
 if(parameters.has('ruleBodyData')) {
   try {
     if(parameters.getAll('ruleBodyData').length!==1 || parameters.get('ruleBodyData')!=='1')
       throw Error('Invalid rule body data selection');
     const response=await fetch('/records/rule-body-data.json',{redirect:'error'});
     if(!response.ok)throw Error('Published rule body list HTTP '+response.status);
     ruleBodyRegistration=await initializeRuleBodyData(productionRuleBodyPointers(await response.json()));
   } catch(error) {
     inputFailure=error.message;errors.push(inputFailure);
     status.textContent='角色数据包加载失败：'+inputFailure;
   }
 }
}
let productionController=null;
window.addEventListener('pagehide',event=>{if(!event.persisted)productionController?.abort();});
// Phaser is the only frame clock. Hidden time is not replayed on returning.
let previousFrame=null;
function resumeClock(){
  previousFrame=null;
  for(const instance of actors.values())instance.avatar.resetSecondary();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!closed)resumeClock();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!closed)resumeClock();});
class RecordScene extends Phaser.Scene{update(time){
  if(document.hidden||closed){previousFrame=null;return;}
  const dt=previousFrame===null?0:Math.min(Math.max(time-previousFrame,0)/1000,.05);
  previousFrame=time;
  for(const actor of actors.values())actor.controller.simulate(dt,actor.update);
  renderer.render(scene,camera);
}}
if(!closed)game=new Phaser.Game({type:Phaser.HEADLESS,width:1,height:1,audio:{noAudio:true},banner:false,scene:RecordScene});
document.querySelector('#first').onclick=()=>selectGroup(0).catch(e=>{status.textContent=e.message;errors.push(e.message);});
document.querySelector('#second').onclick=()=>selectGroup(1).catch(e=>{status.textContent=e.message;errors.push(e.message);});
document.querySelector('#retry').onclick=()=>retrySelection().catch(e=>{status.textContent=e.message;});
window.__recordConsumer={buildInfo,scene,renderer,camera,three:THREE,actors,attempts,errors,records,seatLeases,
  bindFacilityRoom(options) {
    if (closed || !ready || batch?.snapshot().phase==='running') throw Error('record-consumer-busy');
    if ([...actors.values()].some(actor=>actor.controller.captureFacilityPose().phase!=='idle')) throw Error('facility-room-in-use');
    const next=resolveActorRoom(scene,options);
    if(next.spawns.length<actors.size)throw Error('missing-facility-spawn');
    room=next;restoreGeneration++;ground.visible=false;
    [...actors.values()].forEach((actor,index)=>{
      actor.avatar.root.position.fromArray(room.spawns[index]);actor.motion.reset();
      setRoomPresentation(actor);
      actor.update(0,{action:'idle'});actor.avatar.resetSecondary();
    });
    return {floorId:room.floorId,roomId:room.roomId,spawns:structuredClone(room.spawns)};
  },
  captureFacilityState:()=>captureFacilityState(room,actors),
  async restoreFacilityState(saved) {
    const token=++restoreGeneration,group=generation;
    const isCurrent=()=>!closed && token===restoreGeneration && group===generation;
    return restoreFacilityState(room,actors,structuredClone(saved),{isCurrent,
      prepare:(previous,position,getPeers)=>prepareRoomActor(actorRecords.get(previous),{position,isCurrent,getPeers})});
  },
  removeActor(id) {
    const actor=actors.get(id);if(!actor)return false;
    actors.delete(id);actor.dispose();return true;
  },
  get inputFailure(){return inputFailure??failedSelection?.message??null;},
  get ready(){return ready;},get selected(){return selected;},selectGroup,
  snapshot:()=>batch?.snapshot(),retry:retrySelection,
  cancel:()=>{selectionRequest++;failedSelection=null;groupLoads?.cancel();generation++;return batch?.cancel('cancelled by game');},
  async production(request){
    if(inputFailure)throw Error(inputFailure);
    productionController?.abort();const own=new AbortController();productionController=own;
    try{return await performCharacterProduction(request,{scene,renderer,signal:own.signal,isCurrent:()=>!closed&&productionController===own});}
    finally{if(productionController===own)productionController=null;}
  },
  cancelProduction:()=>productionController?.abort(),
};
if(!closed){
  if(!productionMode&&!inputFailure) {
    try { await selectGroup(0); }
    catch(error) { if(!failedSelection)throw error;status.textContent=error.message;errors.push(error.message); }
  }
  ready=!closed;
}
