import * as THREE from 'three';
import Phaser from 'phaser';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import catalog from './library-catalog.json' with {type:'json'};
import templates from './templates-extended.json' with {type:'json'};
import base from './examples/c1-two-stations.json' with {type:'json'};
import alternate from './examples/c1-two-stations-alternate.json' with {type:'json'};
import studio from './examples/c1-studio.json' with {type:'json'};
import smallHome from './examples/c2-small-home.json' with {type:'json'};
import rentalHome from './examples/c2-rental-home.json' with {type:'json'};
import {createCompanyAuthoring} from './authoring.js';
import {createCompanyAssetLibrary} from './asset-library.js';
import {createScaleExamples} from './scale-examples.js';
import {deriveCompany} from './document.js';
import './preview.css';

const element=id=>document.getElementById(id),stage=element('stage');
const world=new THREE.Scene();world.background=new THREE.Color('#e7ede3');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;stage.append(renderer.domElement);
world.add(new THREE.HemisphereLight(0xe9f4ff,0xa5aa94,2));
const sun=new THREE.DirectionalLight(0xfff0d6,2.3);sun.position.set(-3,8,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8});sun.shadow.normalBias=.015;world.add(sun);
const camera=new THREE.PerspectiveCamera(38,1,.05,300),orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=false;orbit.maxPolarAngle=Math.PI*.48;orbit.minDistance=2;orbit.maxDistance=160;
const layouts={base,alternate,studio,...createScaleExamples(catalog,templates),smallHome,rental:rentalHome},assetLibrary=createCompanyAssetLibrary();let session,activeView='room',busy=false,game;
let regionLabels=[];
function status(text,error=false){element('status').textContent=text;element('status').dataset.error=String(error);}
function setView(name){
  activeView=name;
  const doc=session.document,derived=deriveCompany(doc,catalog,templates),view=session.scene.view;
  let box=new THREE.Box3().setFromObject(session.scene.root),target=box.getCenter(new THREE.Vector3());
  if(view.mode!=='building') {
    const focused=view.mode==='room'?view.roomId:null;
    box=new THREE.Box3();
    for(const region of doc.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId&&(!focused||n.id===focused))) {
      const frame=derived.worlds.get(region.id),half=Math.max(region.bounds.width,region.bounds.depth)/2;
      box.expandByPoint(new THREE.Vector3(frame.position[0]-half,0,frame.position[2]-half));box.expandByPoint(new THREE.Vector3(frame.position[0]+half,0,frame.position[2]+half));
    }
    target=box.getCenter(new THREE.Vector3());
  }
  let closeObject;
  if(name==='station'||name==='sofa') {
    const id=name==='station'?element('station').value:sofaNode()?.id,object=session.scene.root.getObjectByName(id||'');
    if(object){target=object.getWorldPosition(new THREE.Vector3());target.y=.65;box=new THREE.Box3().setFromObject(object);closeObject=object;}
  }
  orbit.target.copy(target);
  const offset=name==='top'?new THREE.Vector3(.001,1,.001).normalize():new THREE.Vector3(.65,.8,1).normalize();
  if(name==='sofa'&&closeObject)offset.applyQuaternion(closeObject.getWorldQuaternion(new THREE.Quaternion()));
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),offset).normalize(),up=new THREE.Vector3().crossVectors(offset,right).normalize();
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=3;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
    const relative=new THREE.Vector3(x,y,z).sub(target),towards=relative.dot(offset);
    distance=Math.max(distance,towards+Math.abs(relative.dot(right))/(tangent*camera.aspect),towards+Math.abs(relative.dot(up))/tangent);
  }
  distance*=1.12;
  camera.position.copy(target).addScaledVector(offset,distance);orbit.update();
  sun.castShadow=view.mode==='room'||doc.nodes.filter(n=>n.kind==='room').length===1;
  sun.position.copy(target).add(new THREE.Vector3(-3,8,5));sun.target.position.copy(target);sun.target.updateMatrixWorld();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
}
function sofaNode(){return session.document.nodes.find(n=>n.kind==='facility'&&['lounge-sofa','timber-sofa'].includes(n.resource.id)&&deriveCompany(session.document,catalog,templates).roomIds.get(n.id)===element('room').value);}
function fillOptions(id,nodes,selected){const select=element(id);select.replaceChildren(...nodes.map((node,index)=>{const option=document.createElement('option');option.value=node.id;option.textContent=`${index+1} · ${node.name||node.id.split('/').at(-1)}`;return option;}));if(nodes.some(n=>n.id===selected))select.value=selected;}
function updateRegionLabels(){
  for(const {label,position}of regionLabels) {
    const projected=position.clone().project(camera),visible=Math.abs(projected.x)<.96&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1;
    label.hidden=!visible;label.style.left=`${(projected.x+1)*stage.clientWidth/2}px`;label.style.top=`${(1-projected.y)*stage.clientHeight/2}px`;
  }
}
async function showSpace(mode,floorId=element('floor').value,roomId=element('room').value){
  await session.setView({mode,floorId,roomId:mode==='room'?roomId:null});sync();setView(mode==='building'?'building':'room');
}
async function defaultSpace(){const doc=session.document;await showSpace(doc.scale==='building'?'building':'floor',session.scene.view.floorId);}
function sync(){
  if(!session)return;const doc=session.document,facilities=doc.nodes.filter(n=>n.kind==='facility'),previous=element('station').value,derived=deriveCompany(doc,catalog,templates),view=session.scene.view;
  fillOptions('floor',doc.nodes.filter(n=>n.kind==='floor'),view.floorId);
  const rooms=doc.nodes.filter(n=>n.kind==='room'&&derived.floorIds.get(n.id)===view.floorId);
  fillOptions('room',rooms,view.mode==='room'?view.roomId:element('room').value);
  const stations=doc.nodes.filter(n=>n.kind==='workstation'&&derived.floorIds.get(n.id)===view.floorId);element('station').replaceChildren(...stations.map((station,i)=>{const option=document.createElement('option');option.value=station.id;option.textContent=`工位${i+1}`;return option;}));
  if(stations.some(n=>n.id===previous))element('station').value=previous;const id=element('station').value;element('station').disabled=busy||!stations.length;
  element('layout').value=Object.entries(layouts).find(([,value])=>JSON.stringify(value)===JSON.stringify(doc))?.[0]||'custom';
  element('scene-name').textContent=doc.name; element('scene-count').textContent=`${doc.nodes.filter(n=>n.kind==='floor').length} 层 · ${doc.nodes.filter(n=>n.kind==='room').length} 间经营房间 · 已配置 ${doc.nodes.filter(n=>n.kind==='workstation').length} 个工位`;
  element('view-label').textContent=view.mode==='building'?'大楼概览':view.mode==='room'?`房间聚焦 · ${derived.nodes.get(view.roomId).name}`:`楼层总览 · ${derived.nodes.get(view.floorId).name||'当前层'}`;
  const sofa=sofaNode();element('sofa').disabled=busy||!sofa;if(sofa)element('sofa').value=sofa.resource.id==='timber-sofa'?'timber':String(sofa.resource.version);
  element('fabric').disabled=busy||!sofa;const fabric=sofa?.appearance?.materials?.fabric;
  element('fabric').value=!fabric?'original':fabric.color==='#345c83'?'blue':'custom';
  for(const [button,part,label]of[['screen','monitor','屏幕'],['light','fill-light','补光']]) {
    const node=facilities.find(n=>n.id===`${id}/${part}`),resource=catalog.resources.find(r=>r.id===node?.resource.id&&r.version===node?.resource.version);
    element(button).disabled=busy||!node||view.mode==='building';element(button).textContent=`${node?.state.on??resource?.stateDefaults.on?'关闭':'开启'}${label}`;
  }
  element('upgrade').disabled=busy||!id||doc.nodes.find(n=>n.id===id)?.template.version===2;
  element('building-view').disabled=busy||doc.scale!=='building';
  regionLabels=[];element('region-labels').replaceChildren();
  const labelNodes=view.mode==='building'?doc.nodes.filter(n=>n.kind==='floor'):doc.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId&&(!view.roomId||n.id===view.roomId));
  for(const [index,node]of labelNodes.entries()) {
    const label=document.createElement('span');label.className='region-label';label.textContent=node.name||`空间 ${index+1}`;element('region-labels').append(label);
    let position;
    if(node.kind==='floor') {
      const object=session.scene.root.getObjectByName(`Overview:${node.id}`),box=new THREE.Box3().setFromObject(object);position=new THREE.Vector3(box.min.x,box.max.y+.4,box.max.z);
    } else {const frame=derived.worlds.get(node.id);position=new THREE.Vector3(...frame.position);position.y+=.6;}
    regionLabels.push({label,position});
  }
  updateRegionLabels();
}
async function perform(label,action){
  if(busy)return;busy=true;document.querySelectorAll('button,select').forEach(e=>e.disabled=true);status(label);
  try{await action();status('方案已更新，可以继续查看或保存。');}catch(error){
    const messages={'overlapping-facilities':'设施位置重叠','visual-outside-room':'模型超出房间边界','visual-surface-overhang':'设备超出桌面承载范围','asset-fetch-failed':'缺少所需模型文件','asset-texture-load-failed':'模型贴图损坏或无法加载','save-not-found':'尚未保存过这个方案','save-write-failed':'浏览器存储空间不足或不可写','dependency-content-mismatch':'存档需要的素材版本与当前素材不一致'};
    status(`${messages[error.code]||'素材或布局不符合当前支持规则'}。当前有效方案已保留。`,true);console.error(error);
  }
  finally{busy=false;document.querySelectorAll('button,select').forEach(e=>e.disabled=false);sync();}
}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(world,camera);updateRegionLabels();}
class CompanyPreview extends Phaser.Scene {update(){if(!document.hidden){renderer.render(world,camera);updateRegionLabels();}}}
async function start(){
  session=await createCompanyAuthoring(world,smallHome,{catalog,templates,storage:localStorage,assetLibrary});
  let restored=false,restoreError;
  try{await session.restore(localStorage.getItem('company-preview:last-company')||session.document.id);restored=true;}catch(error){if(error.code!=='save-not-found')restoreError=error;}
  async function saveCurrent(){const result=await session.save();localStorage.setItem('company-preview:last-company',session.document.id);return result;}
  window.company={ready:true,catalog,templates,session,assetLibrary,renderer,world,camera,view:setView,showSpace,layouts,
    async apply(ops){const r=await session.apply(ops);sync();return r;},
    async load(doc){const r=await session.load(doc);sync();await defaultSpace();return r;},
    snapshot:()=>session.snapshot(),save:saveCurrent,restore:async()=>{const r=await session.restore();sync();await defaultSpace();return r;},export:()=>session.export()};
  game=new Phaser.Game({type:Phaser.CANVAS,parent:'phaser-stage',width:1,height:1,transparent:true,audio:{noAudio:true},fps:{target:30},scene:CompanyPreview});
  resize();new ResizeObserver(resize).observe(stage);sync();await defaultSpace();status(restoreError?`已保留默认方案，存档未载入：${restoreError.message}`:restored?'已恢复上次保存的方案。':'方案已加载。',Boolean(restoreError));
  element('layout').onchange=()=>perform('正在加载方案…',()=>window.company.load(layouts[element('layout').value]));
  element('floor').onchange=()=>perform('正在查看楼层…',()=>showSpace('floor'));
  element('room').onchange=()=>perform('正在查看房间…',()=>showSpace('room'));
  element('floor-view').onclick=()=>perform('正在查看整层…',()=>showSpace('floor'));
  element('building-view').onclick=()=>perform('正在查看大楼…',()=>showSpace('building'));
  element('station').onchange=sync;
  element('sofa').onchange=()=>perform('正在替换沙发外观…',()=>session.apply([{type:'replace-resource',id:sofaNode().id,resource:element('sofa').value==='timber'?{id:'timber-sofa',version:1}:{id:'lounge-sofa',version:1}}]));
  element('fabric').onchange=()=>perform('正在更新面料…',()=>session.apply([{type:'set-appearance',id:sofaNode().id,appearance:element('fabric').value==='original'?{}:{materials:{fabric:{color:'#345c83',roughness:.9}}}}]));
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  for(const [button,part]of[['screen','monitor'],['light','fill-light']])element(button).onclick=()=>perform('正在更新设施…',()=>{
    const id=`${element('station').value}/${part}`,node=session.document.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    return session.apply([{type:'set-state',id,state:{on:!(node.state.on??resource.stateDefaults.on)}}]);
  });
  element('save').onclick=()=>perform('正在保存…',saveCurrent);
  element('restore').onclick=()=>perform('正在恢复…',()=>window.company.restore());
  element('upgrade').onclick=()=>perform('正在升级工位模板…',()=>session.upgrade(element('station').value,{id:'stream-station',version:2}));
  element('export').onclick=()=>perform('正在导出…',async()=>{
    const url=URL.createObjectURL(new Blob([await session.export()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${session.document.id.replaceAll('/','-')}.company.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  element('import').onclick=()=>element('file').click();
  element('file').onchange=()=>{const file=element('file').files[0];if(file)perform('正在检查并加载文件…',async()=>{await session.import(await file.text());sync();await defaultSpace();});element('file').value='';};
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
  renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
    if(busy||!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObject(session.scene.root,true).find(hit=>hit.object.userData.floorId);
    if(hit){const {floorId,roomId}=hit.object.userData;perform('正在查看空间…',()=>showSpace(session.scene.view.mode==='building'?'floor':'room',floorId,roomId));}
  });
  fetch('/company-build-info.json').then(r=>r.ok?r.json():null).then(info=>{if(info){element('build-label').textContent=`构建 ${info.shortId}`;window.company.buildInfo=info;}}).catch(()=>{});
}
start().catch(error=>{status(`场景加载失败：${error.message}`,true);console.error(error);});
addEventListener('pagehide',()=>{game?.destroy(true);session?.dispose();assetLibrary.dispose();orbit.dispose();renderer.dispose();},{once:true});
