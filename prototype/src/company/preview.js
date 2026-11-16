import * as THREE from 'three';
import Phaser from 'phaser';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import catalog from './library-catalog.json' with {type:'json'};
import templates from './templates.json' with {type:'json'};
import base from './examples/c1-two-stations.json' with {type:'json'};
import alternate from './examples/c1-two-stations-alternate.json' with {type:'json'};
import studio from './examples/c1-studio.json' with {type:'json'};
import {createCompanyAuthoring} from './authoring.js';
import {createCompanyAssetLibrary} from './asset-library.js';
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
orbit.enableDamping=false;orbit.maxPolarAngle=Math.PI*.48;orbit.minDistance=2;orbit.maxDistance=80;
const layouts={base,alternate,studio},assetLibrary=createCompanyAssetLibrary();let session,activeView='room',busy=false,game;
function status(text,error=false){element('status').textContent=text;element('status').dataset.error=String(error);}
function setView(name){
  activeView=name;const positions={room:[8.6,8,11.6],top:[.01,17,.1],station:[2.9,2.8,4.4],sofa:[3,2.8,-.3]};
  camera.position.fromArray(positions[name]||positions.room);orbit.target.set(name==='station'?-1.4:0,name==='room'||name==='top'?0:.8,name==='sofa'?2.3:0);orbit.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
}
function sync(){
  if(!session)return;const doc=session.document,facilities=doc.nodes.filter(n=>n.kind==='facility'),previous=element('station').value;
  const stations=doc.nodes.filter(n=>n.kind==='workstation');element('station').replaceChildren(...stations.map((station,i)=>{const option=document.createElement('option');option.value=station.id;option.textContent=`工位${i+1}`;return option;}));
  if(stations.some(n=>n.id===previous))element('station').value=previous;const id=element('station').value;element('station').disabled=busy||!stations.length;
  element('layout').value=Object.entries(layouts).find(([,value])=>JSON.stringify(value)===JSON.stringify(doc))?.[0]||'custom';
  element('scene-name').textContent=doc.name; element('scene-count').textContent=`${doc.nodes.filter(n=>n.kind==='workstation').length} 个工位 · ${facilities.length} 件组件 · ${doc.nodes.filter(n=>n.kind==='room').length} 间房间`;
  const sofa=facilities.find(n=>n.id==='lounge/sofa');element('sofa').disabled=busy||!sofa;if(sofa)element('sofa').value=String(sofa.resource.version);
  element('fabric').disabled=busy||!sofa;const fabric=sofa?.appearance?.materials?.fabric;
  element('fabric').value=!fabric?'original':fabric.color==='#345c83'?'blue':'custom';
  for(const [button,part,label]of[['screen','monitor','屏幕'],['light','fill-light','补光']]) {
    const node=facilities.find(n=>n.id===`${id}/${part}`),resource=catalog.resources.find(r=>r.id===node?.resource.id&&r.version===node?.resource.version);
    element(button).disabled=busy||!node;element(button).textContent=`${node?.state.on??resource?.stateDefaults.on?'关闭':'开启'}${label}`;
  }
}
async function perform(label,action){
  if(busy)return;busy=true;document.querySelectorAll('button,select').forEach(e=>e.disabled=true);status(label);
  try{await action();status('方案已更新，可以继续查看或保存。');}catch(error){
    const messages={'overlapping-facilities':'设施位置重叠','visual-outside-room':'模型超出房间边界','visual-surface-overhang':'设备超出桌面承载范围','asset-fetch-failed':'缺少所需模型文件','asset-texture-load-failed':'模型贴图损坏或无法加载','save-not-found':'尚未保存过这个方案','save-write-failed':'浏览器存储空间不足或不可写','dependency-content-mismatch':'存档需要的素材版本与当前素材不一致'};
    status(`${messages[error.code]||'素材或布局不符合当前支持规则'}。当前有效方案已保留。`,true);console.error(error);
  }
  finally{busy=false;document.querySelectorAll('button,select').forEach(e=>e.disabled=false);sync();}
}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(world,camera);}
class CompanyPreview extends Phaser.Scene {update(){if(!document.hidden){renderer.render(world,camera);}}}
async function start(){
  session=await createCompanyAuthoring(world,studio,{catalog,templates,storage:localStorage,assetLibrary});
  let restored=false,restoreError;
  try{await session.restore();restored=true;}catch(error){if(error.code!=='save-not-found')restoreError=error;}
  window.company={ready:true,catalog,templates,session,renderer,world,camera,view:setView,layouts,
    async apply(ops){const r=await session.apply(ops);sync();return r;},
    async load(doc){const r=await session.load(doc);sync();return r;},
    snapshot:()=>session.snapshot(),save:()=>session.save(),restore:async()=>{const r=await session.restore();sync();return r;},export:()=>session.export()};
  game=new Phaser.Game({type:Phaser.CANVAS,parent:'phaser-stage',width:1,height:1,transparent:true,audio:{noAudio:true},fps:{target:30},scene:CompanyPreview});
  setView('room');resize();new ResizeObserver(resize).observe(stage);sync();status(restoreError?`已保留默认方案，存档未载入：${restoreError.message}`:restored?'已恢复上次保存的方案。':'方案已加载。',Boolean(restoreError));
  element('layout').onchange=()=>perform('正在加载方案…',()=>session.load(layouts[element('layout').value]));
  element('station').onchange=sync;
  element('sofa').onchange=()=>perform('正在替换沙发外观…',()=>session.apply([{type:'replace-resource',id:'lounge/sofa',resource:{id:'lounge-sofa',version:Number(element('sofa').value)}}]));
  element('fabric').onchange=()=>perform('正在更新面料…',()=>session.apply([{type:'set-appearance',id:'lounge/sofa',appearance:element('fabric').value==='original'?{}:{materials:{fabric:{color:'#345c83',roughness:.9}}}}]));
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  for(const [button,part]of[['screen','monitor'],['light','fill-light']])element(button).onclick=()=>perform('正在更新设施…',()=>{
    const id=`${element('station').value}/${part}`,node=session.document.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    return session.apply([{type:'set-state',id,state:{on:!(node.state.on??resource.stateDefaults.on)}}]);
  });
  element('save').onclick=()=>perform('正在保存…',async()=>{await session.save();});
  element('restore').onclick=()=>perform('正在恢复…',()=>session.restore());
  element('export').onclick=()=>perform('正在导出…',async()=>{
    const url=URL.createObjectURL(new Blob([await session.export()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${session.document.id.replaceAll('/','-')}.company.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  element('import').onclick=()=>element('file').click();
  element('file').onchange=()=>{const file=element('file').files[0];if(file)perform('正在检查并加载文件…',async()=>session.import(await file.text()));element('file').value='';};
  fetch('/company-build-info.json').then(r=>r.ok?r.json():null).then(info=>{if(info){element('build-label').textContent=`构建 ${info.shortId}`;window.company.buildInfo=info;}}).catch(()=>{});
}
start().catch(error=>{status(`场景加载失败：${error.message}`,true);console.error(error);});
addEventListener('pagehide',()=>{game?.destroy(true);session?.dispose();assetLibrary.dispose();orbit.dispose();renderer.dispose();},{once:true});
