import * as THREE from 'three';
import Phaser from 'phaser';
import {prepareRecordedCharacter} from './character-record-consumer.js';
import {createCharacterRecordBatch} from './character-record-batch.js';
import {performCharacterProduction} from './character-production.js';
import {validateCharacterRecordInput} from './character-record-input.js';

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
let closed=false,game;
const actors=new Map(), attempts=[], errors=[];
window.addEventListener('pagehide',event=>{
  if(event.persisted||closed)return;
  closed=true;generation++;batch?.cancel('page closing');observer.disconnect();
  for(const actor of actors.values())actor.dispose();actors.clear();
  game?.destroy(true);ground.geometry.dispose();ground.material.dispose();renderer.dispose();
});
const buildInfo=await fetch('/build-info.json').then(r=>r.json());
const status=document.querySelector('#status'),resultElement=document.querySelector('#results');
function show(){const snapshot=batch?.snapshot();resultElement.textContent=snapshot?JSON.stringify(snapshot.items.map(({identityId,status,attempt,reason})=>({id:identityId,status,attempt,reason})),null,2):'';}
async function consume(record,context){
  const owner=generation;attempts.push({identityId:record.identity.id,requestId:context.requestId});
  const current=()=>owner===generation&&context.isCurrent();
  const instance=await prepareRecordedCharacter(record,{scene,renderer,isCurrent:current,signal:context.signal,
    position:[context.index===0?-.55:.55,0,0]});
  const release=()=>{if(actors.get(record.identity.id)===instance)actors.delete(record.identity.id);instance.dispose();};
  try{
    if(!current()){release();return{applied:false,cancelled:true};}
    instance.attach();actors.set(record.identity.id,instance);
    instance.avatar.livePresentation.setSpeaking(true);
    instance.avatar.livePresentation.setGaze(camera.position.toArray());
    return{applied:true,release};
  }catch(error){release();throw error;}
}
async function selectGroup(index,inputs){
  if(![0,1].includes(index))throw Error('Unknown group');
  const group=inputs??records.slice(index*2,index*2+2);
  if(!Array.isArray(group)||group.length<1||group.length>2)throw Error('A group requires one or two character records');
  if(closed)throw Error('The record consumer has closed');
  selected=index;generation++;batch?.cancel('另一组人物已被选择');
  for(const actor of actors.values())actor.dispose();actors.clear();
  const ownBatch=createCharacterRecordBatch(group,{consume,batchId:'record-demo-'+generation});batch=ownBatch;
  status.textContent='加载人物记录 · '+buildInfo.shortId;show();
  const result=await ownBatch.run();
  if(!closed&&batch===ownBatch){status.textContent='当前组读取结束 · '+buildInfo.shortId;show();}
  return result;
}
const parameters=new URLSearchParams(location.search);
const productionMode=parameters.get('production')==='1';
let inputFailure=null;
if(!productionMode){
 try{
 const externalPath=parameters.get('records');
 if(parameters.has('records')&&externalPath!=='/records/manifest.json')throw Error('Unsupported record manifest path');
 const manifestResponse=await fetch(externalPath??'/assets/record-consumer-v1/manifest.json');
 if(!manifestResponse.ok)throw Error('Manifest HTTP '+manifestResponse.status);
 const manifest=await manifestResponse.json();
 const entries=externalPath?validateCharacterRecordInput(manifest,externalPath):manifest.entries;
 records=await Promise.all(entries.map(async entry=>{
   const response=await fetch(entry.url);if(!response.ok)throw Error('Record HTTP '+response.status);
   const bytes=await response.text();if(new TextEncoder().encode(bytes).length>512*1024)throw Error('Record exceeds 512 KiB');
   const record=JSON.parse(bytes);if(record.identity?.id!==entry.id||record.integrity?.recordSha256!==entry.recordSha256)throw Error('Record manifest identity mismatch');return record;
 }));
 document.querySelector('#second').hidden=records.length<=2;
 }catch(error){inputFailure=error.message;errors.push(inputFailure);status.textContent='人物记录加载失败：'+inputFailure;for(const id of ['first','second','retry'])document.querySelector('#'+id).disabled=true;}
}else{
 for(const id of ['first','second','retry'])document.querySelector('#'+id).hidden=true;
 status.textContent='等待 agent 制作请求 · '+buildInfo.shortId;
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
  for(const actor of actors.values())actor.update(dt,{action:'idle',speaking:true});
  renderer.render(scene,camera);
}}
if(!closed)game=new Phaser.Game({type:Phaser.HEADLESS,width:1,height:1,audio:{noAudio:true},banner:false,scene:RecordScene});
document.querySelector('#first').onclick=()=>selectGroup(0).catch(e=>{status.textContent=e.message;errors.push(e.message);});
document.querySelector('#second').onclick=()=>selectGroup(1).catch(e=>{status.textContent=e.message;errors.push(e.message);});
document.querySelector('#retry').onclick=async()=>{try{await batch.retryFailed();show();}catch(e){status.textContent=e.message;}};
window.__recordConsumer={buildInfo,scene,renderer,actors,attempts,errors,records,
  get inputFailure(){return inputFailure;},
  get ready(){return ready;},get selected(){return selected;},selectGroup,
  snapshot:()=>batch?.snapshot(),retry:async()=>{const result=await batch.retryFailed();show();return result;},
  cancel:()=>{generation++;return batch?.cancel('cancelled by game');},
  async production(request){
    productionController?.abort();const own=new AbortController();productionController=own;
    try{return await performCharacterProduction(request,{scene,renderer,signal:own.signal,isCurrent:()=>!closed&&productionController===own});}
    finally{if(productionController===own)productionController=null;}
  },
  cancelProduction:()=>productionController?.abort(),
};
if(!closed){if(!productionMode&&!inputFailure)await selectGroup(0);ready=!closed;}
