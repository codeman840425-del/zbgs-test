import {createFacilityEditor} from './facility-editor.js';
import * as THREE from 'three';
import Phaser from 'phaser';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import catalog from './library-catalog.json' with {type:'json'};
import templates from './templates-extended.json' with {type:'json'};
import ceilingCompany from './examples/c2-ceiling-company.json' with {type:'json'};
import ceilingHome from './examples/c1-ceiling-home.json' with {type:'json'};
import surfaceCompany from './examples/c2-surface-company.json' with {type:'json'};
import surfaceHome from './examples/c1-surface-home.json' with {type:'json'};
import mixedCompany from './examples/c2-mixed-company.json' with {type:'json'};
import {createCompanyAuthoring} from './authoring.js';
import {createCompanyAssetLibrary} from './asset-library.js';
import scaleV2Examples from './examples/c2-scale-v2.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from './document.js';
import {createBuildingView} from './building-view.js';
import {appearanceBranches,appearanceCandidates,createAppearanceSample} from './appearance-samples.js';
import {createSupportSample} from './support-samples.js';
import {createHingedSample} from './hinged-samples.js';
import {createSlidingSample} from './sliding-samples.js';
import {createClockSample} from './clock-samples.js';
import {createSupportedClockSample} from './supported-clock-samples.js';
import {createInformationSample} from './information-samples.js';
import {createFloorInformationSample} from './floor-information-samples.js';
import {createMirrorSample} from './mirror-samples.js';
import {createFloorMirrorSample} from './floor-mirror-samples.js';
import {createMakeupMirrorSample} from './makeup-mirror-samples.js';
import {createMakeupStorageSample} from './makeup-storage-samples.js';
import {createMakeupDrawerSample} from './makeup-drawer-samples.js';
import {createMakeupWallMirrorSample} from './makeup-wall-mirror-samples.js';
import {createSideTableSample} from './side-table-samples.js';
import {createSideTableLifeItemsSample} from './side-table-life-items-samples.js';
import {createCableSample} from './cable-samples.js';
import {createCeilingAcousticSample} from './ceiling-acoustic-samples.js';
import {createWallShelfSample} from './wall-shelf-samples.js';
import {createVanitySample} from './vanity-samples.js';
import {createMirrorController,selectMirrorRenderProfile} from './mirror-render.js';
import {validatePresentationInputs} from './clock-display.js';
import './preview.css';

const element=id=>document.getElementById(id),stage=element('stage');
const world=new THREE.Scene();world.background=new THREE.Color('#e7ede3');
let renderer;
function configureRenderer(canvas,context) {
  const next=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false,...(canvas?{canvas,context}:{})});
  next.localClippingEnabled=true;next.setPixelRatio(Math.min(devicePixelRatio,1.5));
  next.shadowMap.enabled=true;next.shadowMap.type=THREE.PCFShadowMap;
  next.outputColorSpace=THREE.SRGBColorSpace;next.toneMapping=THREE.ACESFilmicToneMapping;next.toneMappingExposure=1.08;
  return next;
}
renderer=configureRenderer();stage.append(renderer.domElement);
let mirrorRenderProfile=selectMirrorRenderProfile(renderer);
const mirrorController=createMirrorController({maxFacesPerMirror:3});
function updateMirrorQualityLabel() {
  const profile=session?.scene.mirrorRenderProfile||mirrorRenderProfile;
  const quality=profile==='detail-1024-msaa4-v1'?'清晰（抗锯齿）':profile==='detail-1024-v1'?'清晰':'基础';
  const text=`镜面画质：${quality}。当前画面最多一件镜子实时反射，三折镜包含三个镜面；其他镜子暂不显示反射。镜中使用当前墙体剖切结果。`;
  if(element('mirror-limit').textContent!==text)element('mirror-limit').textContent=text;
}
let hostFrame=0,rendererRestarts=0,lastRenderError=null;
function recoverRenderer(error) {
  lastRenderError={code:error.code||'render-failed',message:error.message};
  for(const binding of session?.scene.mirrorBindings()||[])binding.deactivate();
  const canvas=renderer.domElement,context=renderer.getContext();
  if(context.isContextLost()) {status('显示设备暂不可用，布局和存档已保留；等待浏览器恢复。',true);return;}
  renderer.dispose();renderer=configureRenderer(canvas,context);renderer.resetState();
  mirrorRenderProfile=selectMirrorRenderProfile(renderer);
  session?.scene.setMirrorRenderProfile(mirrorRenderProfile);
  updateMirrorQualityLabel();
  renderer.setSize(stage.clientWidth,stage.clientHeight);rendererRestarts++;
  status('显示暂时中断，已重建渲染器；布局和存档未改变。',true);
}
function mirrorPreflight({mirrors}) {
  try{return mirrorController.preflight(mirrors,renderer,world,camera,{frameId:hostFrame,timeMs:performance.now()});}
  catch(error){if(error.code==='mirror-renderer-reset-required')recoverRenderer(error);throw error;}
}
function drawHostFrame(timeMs=performance.now()) {
  if(!session||document.hidden||session.scene.view.mode==='building')return;
  if(renderer.getContext().isContextLost())return;
  camera.updateMatrixWorld();world.updateMatrixWorld(true);
  try {
    mirrorController.update(session.scene.mirrorBindings(),renderer,world,camera,{frameId:++hostFrame,timeMs});
    renderer.render(world,camera);updateRegionLabels();updateMirrorQualityLabel();
  } catch(error) {recoverRenderer(error);}
}
world.add(new THREE.HemisphereLight(0xe9f4ff,0xa5aa94,2));
const sun=new THREE.DirectionalLight(0xfff0d6,2.3);sun.position.set(-3,8,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8});sun.shadow.normalBias=.015;world.add(sun);
const camera=new THREE.PerspectiveCamera(38,1,.05,300),orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=false;orbit.maxPolarAngle=Math.PI*.48;orbit.minDistance=2;orbit.maxDistance=160;
const layouts={cables:createCableSample(catalog,templates).document,cableAlternate:createCableSample(catalog,templates,{alternate:true}).document,ceilingAcoustic:createCeilingAcousticSample(catalog,templates).document,ceilingAcousticAlternate:createCeilingAcousticSample(catalog,templates,{alternate:true}).document,wallShelves:createWallShelfSample(catalog,templates).document,wallShelfAlternate:createWallShelfSample(catalog,templates,{alternate:true}).document,sideTableLifeItems:createSideTableLifeItemsSample(catalog,templates).document,sideTableLifeItemsAlternate:createSideTableLifeItemsSample(catalog,templates,{alternate:true}).document,sideTables:createSideTableSample(catalog,templates).document,sideTableAlternate:createSideTableSample(catalog,templates,{alternate:true}).document,makeupWallMirrors:createMakeupWallMirrorSample(catalog,templates).document,makeupWallMirrorAlternate:createMakeupWallMirrorSample(catalog,templates,{alternate:true}).document,makeupDrawer:createMakeupDrawerSample(catalog,templates).document,makeupDrawerAlternate:createMakeupDrawerSample(catalog,templates,{alternate:true}).document,makeupStorage:createMakeupStorageSample(catalog,templates).document,makeupStorageAlternate:createMakeupStorageSample(catalog,templates,{alternate:true}).document,makeupMirrors:createMakeupMirrorSample(catalog,templates).document,makeupMirrorAlternate:createMakeupMirrorSample(catalog,templates,{alternate:true}).document,vanities:createVanitySample(catalog,templates).document,vanityAlternate:createVanitySample(catalog,templates,{alternate:true}).document,floorMirrors:createFloorMirrorSample(catalog,templates).document,floorMirrorAlternate:createFloorMirrorSample(catalog,templates,{alternate:true}).document,mirrors:createMirrorSample(catalog,templates).document,mirrorAlternate:createMirrorSample(catalog,templates,{alternate:true}).document,floorInformation:createFloorInformationSample(catalog,templates).document,floorInformationAlternate:createFloorInformationSample(catalog,templates,{alternate:true}).document,information:createInformationSample(catalog,templates).document,informationAlternate:createInformationSample(catalog,templates,{alternate:true}).document,supportedClocks:createSupportedClockSample(catalog,templates).document,supportedClockAlternate:createSupportedClockSample(catalog,templates,{alternate:true}).document,clocks:createClockSample(catalog,templates).document,clockAlternate:createClockSample(catalog,templates,{alternate:true}).document,sliding:createSlidingSample(catalog,templates).document,slidingAlternate:createSlidingSample(catalog,templates,{alternate:true}).document,hinged:createHingedSample(catalog,templates).document,hingedAlternate:createHingedSample(catalog,templates,{alternate:true}).document,...scaleV2Examples,mixed:mixedCompany,surfaces:surfaceCompany,surfaceHome,ceilings:ceilingCompany,ceilingHome,
  supports:createSupportSample(catalog,templates).document,supportAlternate:createSupportSample(catalog,templates,{alternate:true}).document},assetLibrary=createCompanyAssetLibrary();let session,activeView='room',busy=false,game;
let regionLabels=[],previewClockOverride=null,facilityEditor;
function setPreviewClock(seconds){if(seconds!==null)validatePresentationInputs({clockSeconds:seconds});previewClockOverride=seconds;if(seconds!==null)session.scene.setPresentationInputs({clockSeconds:seconds});return seconds;}
let buildingPresentation='exterior';
let wallMode='cutaway';
function updateWallView(){if(session)session.scene.setWallView({mode:wallMode,cameraPosition:camera.position.toArray()});}
orbit.addEventListener('change',updateWallView);
const buildingView=createBuildingView(element('building-stage'),{
  onSelectFloor:floorId=>perform('正在查看楼层…',()=>showSpace('floor',floorId)),
  onPresentationChange:presentation=>{buildingPresentation=presentation;if(session?.scene.view.mode==='building')element('view-label').textContent=presentation==='section'?'大楼侧剖面':'大楼外观';},
});
function status(text,error=false){element('status').textContent=text;element('status').dataset.error=String(error);}
function setView(name){
  activeView=name;orbit.maxPolarAngle=name==='ceiling'?Math.PI*.96:Math.PI*.48;
  const doc=session.document,derived=deriveCompany(doc,catalog,templates),view=session.scene.view;
  orbit.enableRotate=view.mode==='room';orbit.enablePan=view.mode==='room';orbit.enableZoom=view.mode==='room';
  if(view.mode==='building')return;
  let box=new THREE.Box3().setFromObject(session.scene.root),target=box.getCenter(new THREE.Vector3());
  if(view.mode!=='building') {
    const focused=view.mode==='room'?view.roomId:null;
    box=new THREE.Box3();
    for(const region of doc.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId&&(!focused||n.id===focused))) {
      const frame=derived.worlds.get(region.id);
      for(const x of [-region.bounds.width/2,region.bounds.width/2])for(const z of [-region.bounds.depth/2,region.bounds.depth/2])for(const y of [0,2.8]) {
        const point=new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),frame.yaw).add(new THREE.Vector3(...frame.position));
        box.expandByPoint(point);
      }
    }
    target=box.getCenter(new THREE.Vector3());
  }
  if(name==='information'&&view.mode==='room') {
    const object=session.scene.root.getObjectByName(element('information-board').value);
    if(object){const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()),node=session.document.nodes.find(n=>n.id===object.name),resource=catalog.resources.find(r=>r.id===node?.resource?.id&&r.version===node?.resource?.version);if(resource?.mountRole==='information-board-floor')center.copy(object.localToWorld(new THREE.Vector3(...resource.informationSurface.position)));orbit.minDistance=.6;orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,.02,1.45).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())));orbit.update();updateWallView();return;}
  }
  if(name==='clock'&&view.mode==='room') {
    const object=session.scene.root.getObjectByName(element('clock').value);
    if(object){const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()),node=session.document.nodes.find(n=>n.id===object.name),resource=catalog.resources.find(r=>r.id===node?.resource?.id&&r.version===node?.resource?.version);if(resource?.mountRole==='information-board-floor')center.copy(object.localToWorld(new THREE.Vector3(...resource.informationSurface.position)));orbit.minDistance=.6;orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,.03,.85).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())));orbit.update();updateWallView();return;}
  }
  if(name==='cabinet'&&view.mode==='room') {
    const id=element('cabinet').value,node=session.document.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node?.resource?.id&&r.version===node?.resource?.version);
    const object=session.scene.root.getObjectByName(id);
    if(object&&['makeup-storage','makeup-drawer-host'].includes(resource?.mountRole)) {
      const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      orbit.minDistance=.25;orbit.target.copy(center);camera.position.copy(center).add((resource.mountRole==='makeup-drawer-host'?new THREE.Vector3(.25,1.70,.75):new THREE.Vector3(.25,.60,.65)).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())));
      orbit.update();updateWallView();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));return;
    }
  }
  orbit.minDistance=2;
  if(name==='ceiling'&&view.mode==='room') {
    const room=derived.nodes.get(view.roomId),frame=derived.worlds.get(view.roomId);
    const origin=new THREE.Vector3(...frame.position),offset=new THREE.Vector3(-room.bounds.width*.3,1.1,room.bounds.depth*.35);
    const look=new THREE.Vector3(0,2.45,-room.bounds.depth*.25),axis=new THREE.Vector3(0,1,0);
    offset.applyAxisAngle(axis,frame.yaw);look.applyAxisAngle(axis,frame.yaw);
    camera.position.copy(origin).add(offset);orbit.target.copy(origin).add(look);
    const mounts=derived.facilities.filter(f=>f.roomId===room.id&&f.resource.mount==='ceiling');
    if(mounts.length){
      const box=new THREE.Box3();for(const f of mounts)box.expandByObject(session.scene.root.getObjectByName(f.id));
      const lowView=new THREE.Vector3(0,.2,room.bounds.depth*.45).applyAxisAngle(axis,frame.yaw);
      camera.position.copy(origin).add(lowView);orbit.target.copy(box.getCenter(new THREE.Vector3()));
    }
    orbit.update();updateWallView();
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
    return;
  }
  let closeObject;
  if(['station','sofa','cabinet'].includes(name)) {
    const id=name==='station'?element('station').value:name==='cabinet'?element('cabinet').value:sofaNode()?.id,object=session.scene.root.getObjectByName(id||'');
    if(object){target=object.getWorldPosition(new THREE.Vector3());target.y=.65;box=new THREE.Box3().setFromObject(object);closeObject=object;}
  }
  orbit.target.copy(target);
  const offset=name==='top'?new THREE.Vector3(0,1,.001).normalize():new THREE.Vector3(.65,.8,1).normalize();
  if(['sofa','cabinet'].includes(name)&&closeObject)offset.applyQuaternion(closeObject.getWorldQuaternion(new THREE.Quaternion()));
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),offset).normalize(),up=new THREE.Vector3().crossVectors(offset,right).normalize();
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=3;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
    const relative=new THREE.Vector3(x,y,z).sub(target),towards=relative.dot(offset);
    distance=Math.max(distance,towards+Math.abs(relative.dot(right))/(tangent*camera.aspect),towards+Math.abs(relative.dot(up))/tangent);
  }
  distance*=1.12;
  orbit.maxDistance=Math.max(160,distance*1.1);
  camera.position.copy(target).addScaledVector(offset,distance);orbit.update();updateWallView();
  sun.castShadow=view.mode==='room'||doc.nodes.filter(n=>n.kind==='room').length===1;
  sun.position.copy(target).add(new THREE.Vector3(-3,8,5));sun.target.position.copy(target);sun.target.updateMatrixWorld();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
}
const sofaChoice=resource=>resource.id==='lounge-sofa'?String(resource.version):resource.id==='timber-sofa'?'timber':`${resource.id}@${resource.version}`;
function sofaNode(){
  const derived=deriveCompany(session.document,catalog,templates);
  return session.document.nodes.find(n=>n.kind==='facility'&&derived.roomIds.get(n.id)===element('room').value&&catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mountRole==='sofa');
}
function fillSampleLooks(){
  const branch=element('sample-branch').value;
  fillOptions('sample-look',appearanceCandidates(catalog,branch).map((r,i)=>({id:String(i),name:r.displayName||r.name||r.id})),'0');
}
const finishChoice=finish=>finish?`${finish.resource.id}@${finish.resource.version}`:'';
const finishResources=type=>catalog.resources.filter(resource=>resource.kind==='surface-finish'&&resource.finish.allowedSurfaces.includes(type));
function currentFinishRoom(){return session.document.nodes.find(node=>node.id===element('room').value&&['room','area'].includes(node.kind));}
function syncFinishes(){
  const room=currentFinishRoom(),unavailable=busy||!room||session.scene.view.mode==='building';
  element('finish-scope').textContent=room?`适用于：${room.name||room.id}`:'先选择一个房间';
  for(const type of ['floor','wall','ceiling']) {
    const select=element(`finish-${type}`),surfaces=type==='wall'?['north','south','west','east']:[type];
    const choices=new Set(surfaces.map(surface=>finishChoice(room?.finishes?.[surface])));
    const selected=choices.size===1?[...choices][0]:'mixed';
    select.replaceChildren(...[{value:'',name:'结构原材质'},...finishResources(type).map(resource=>({value:`${resource.id}@${resource.version}`,name:resource.displayName||resource.id})),...(selected==='mixed'?[{value:'mixed',name:'各面分别配置',disabled:true}]:[])].map(item=>{
      const option=document.createElement('option');option.value=item.value;option.textContent=item.name;option.disabled=Boolean(item.disabled);return option;
    }));
    select.value=selected;select.disabled=unavailable||!finishResources(type).length;
  }
  element('finish-turn').disabled=unavailable||!room?.finishes?.floor;
}
async function changeFinish(type){
  const room=currentFinishRoom(),choice=element(`finish-${type}`).value;
  const resource=finishResources(type).find(resource=>`${resource.id}@${resource.version}`===choice);
  if(!room||(choice&&!resource))throw Error('Choose a supported room finish');
  const surfaces=type==='wall'?['north','south','west','east']:[type];
  return session.apply(surfaces.map(surface=>({type:'set-surface-finish',id:room.id,surface,
    finish:resource?{...room.finishes?.[surface],resource:{id:resource.id,version:resource.version}}:null})));
}
async function showAppearanceSample(branch,index){
  facilityEditor?.beforeSample();
  const sample=createAppearanceSample(branch,index,catalog,templates,{alternate:(branch==='cable-route'&&session?.document?.id==='cable-alternate')||(branch==='ceiling-acoustic-baffle'&&session?.document?.id==='ceiling-acoustic-alternate')||(branch==='side-table-life-items'&&session?.document?.id==='side-table-life-items-alternate')||(branch==='wall-shelf'&&session?.document?.id==='wall-shelf-alternate')});
  const savedSample=facilityEditor?.getDraft(sample.document.id),sameSample=session.document.id===sample.document.id;
  if(sameSample||savedSample){
    const replacements=sample.document.nodes.filter(n=>n.resource&&(!['cable-route','ceiling-acoustic-baffle','wall-shelf','side-table-life-items','side-table','makeup-mirror','makeup-mirror-wall','makeup-storage','makeup-storage-drawer'].includes(branch)||catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mountRole===branch)&&(!['information-board','information-board-floor'].includes(branch)||catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.informationSurface)).map(n=>({type:'replace-resource',id:n.id,resource:n.resource}));
    if(sameSample)await session.apply(replacements);
    else await session.load(prepareCompanyChange(savedSample,replacements,{catalog,templates}).document);
  }else await session.load(sample.document);
  facilityEditor?.sampleLoaded(sample);
  await showSpace('room',sample.document.nodes[0].id,sample.document.nodes[1].id);
  element('sample-branch').value=branch;fillSampleLooks();element('sample-look').value=String(index);
  const object=session.scene.root.getObjectByName(sample.target),box=new THREE.Box3().setFromObject(object);
  if(branch==='vanity-table')box.expandByObject(session.scene.root.getObjectByName(sample.target+'/seat'));
  const target=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  if(branch==='ceiling-acoustic-baffle'){
    activeView='ceiling';orbit.maxPolarAngle=Math.PI*.96;orbit.minDistance=.4;
    const offset=new THREE.Vector3(.45,-.65,1).normalize().applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
    camera.position.copy(target).addScaledVector(offset,1.9);orbit.target.copy(target);orbit.update();updateWallView();
    element('scene-name').textContent=sample.document.name;return sample;
  }
  orbit.minDistance=['cable-route','side-table-life-items','makeup-storage','makeup-storage-drawer'].includes(branch)?.25:['analog-clock','digital-clock','analog-clock-shelf','digital-clock-shelf'].includes(branch)?.6:2;
  const offset=branch==='cable-route'?new THREE.Vector3(-.7,1,.7):branch==='side-table-life-items'?new THREE.Vector3(1,.8,-1):branch==='makeup-storage-drawer'?new THREE.Vector3(.25,1.7,.75):branch==='vanity-table'?new THREE.Vector3(-.8,.6,1):['floor-panel','rug'].includes(branch)?new THREE.Vector3(.15,1,.35):new THREE.Vector3(.5,.45,1);
  offset.normalize().applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  const distance=branch==='vanity-table'?box.getBoundingSphere(new THREE.Sphere()).radius/Math.sin(halfFov)*1.05:Math.max(size.y,size.x/camera.aspect,size.z)*1.9+.35;
  camera.position.copy(target).addScaledVector(offset,distance);orbit.target.copy(target);orbit.update();
  element('scene-name').textContent=sample.document.name;
  return sample;
}
function fillOptions(id,nodes,selected){const select=element(id);select.replaceChildren(...nodes.map((node,index)=>{const option=document.createElement('option');option.value=node.id;option.textContent=`${index+1} · ${node.name||node.id.split('/').at(-1)}`;return option;}));if(nodes.some(n=>n.id===selected))select.value=selected;}
function updateRegionLabels(){
  const compact=session?.scene.view.mode==='floor'&&regionLabels.length>8&&stage.clientWidth<900;
  for(const {label,position,name,shortName}of regionLabels) {
    const text=compact?shortName:name;if(label.textContent!==text)label.textContent=text;
    const projected=position.clone().project(camera),visible=Math.abs(projected.x)<.96&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1;
    label.hidden=!visible;label.style.left=`${(projected.x+1)*stage.clientWidth/2}px`;label.style.top=`${(1-projected.y)*stage.clientHeight/2}px`;
  }
}
async function showSpace(mode,floorId=element('floor').value,roomId=element('room').value,presentation='exterior'){
  await session.setView({mode,floorId,roomId:mode==='room'?roomId:null});if(mode==='building')buildingPresentation=presentation;sync();resize();setView(mode==='building'?'building':mode==='floor'&&['leased-floor','building'].includes(session.document.scale)?'top':'room');
}
async function defaultSpace(){const doc=session.document,rooms=doc.nodes.filter(n=>['room','area'].includes(n.kind));await showSpace(doc.scale==='building'?'building':rooms.length===1?'room':'floor',session.scene.view.floorId,rooms[0]?.id);}
function sync(){
  element('mirror-limit').hidden=!session.document.nodes.some(n=>catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mirrorSurface);
  if(!session)return;const doc=session.document,facilities=doc.nodes.filter(n=>n.kind==='facility'),previous=element('station').value,derived=deriveCompany(doc,catalog,templates),view=session.scene.view;
  fillOptions('floor',doc.nodes.filter(n=>n.kind==='floor'),view.floorId);
  const rooms=doc.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId);
  fillOptions('room',rooms,view.mode==='room'?view.roomId:element('room').value);
  const stations=doc.nodes.filter(n=>n.kind==='workstation'&&derived.floorIds.get(n.id)===view.floorId);element('station').replaceChildren(...stations.map((station,i)=>{const option=document.createElement('option');option.value=station.id;option.textContent=`工位${i+1}`;return option;}));
  if(stations.some(n=>n.id===previous))element('station').value=previous;const id=element('station').value;element('station').disabled=busy||!stations.length;
  element('layout').value=Object.entries(layouts).find(([,value])=>JSON.stringify(value)===JSON.stringify(doc))?.[0]||'custom';
  element('scene-name').textContent=doc.name; element('scene-count').textContent=`${doc.nodes.filter(n=>n.kind==='floor').length} 层 · ${doc.nodes.filter(n=>n.kind==='room').length} 间经营房间 · 已配置 ${doc.nodes.filter(n=>n.kind==='workstation').length} 个工位`;
  element('view-label').textContent=view.mode==='building'?(buildingPresentation==='section'?'大楼侧剖面':'大楼外观'):view.mode==='room'?`房间聚焦 · ${derived.nodes.get(view.roomId).name}`:`楼层总览 · ${derived.nodes.get(view.floorId).name||'当前层'}`;
  const sofa=sofaNode(),sofaResources=appearanceCandidates(catalog,'sofa');
  if(sofa&&!sofaResources.some(r=>r.id===sofa.resource.id&&r.version===sofa.resource.version)){
    const current=catalog.resources.find(r=>r.id===sofa.resource.id&&r.version===sofa.resource.version);if(current)sofaResources.push({...current,displayName:'当前历史沙发（独立规格）'});
  }
  fillOptions('sofa',sofaResources.map(r=>({id:sofaChoice(r),name:r.displayName||r.id})),sofa?sofaChoice(sofa.resource):'1');
  element('sofa').disabled=busy||!sofa;
  const sofaResource=sofa&&catalog.resources.find(r=>r.id===sofa.resource.id&&r.version===sofa.resource.version);
  element('fabric').disabled=busy||!sofaResource?.materialSlots?.fabric;const fabric=sofa?.appearance?.materials?.fabric;
  element('fabric').value=!fabric?'original':fabric.color==='#345c83'?'blue':'custom';
  for(const [button,part,label]of[['screen','monitor','屏幕'],['light','fill-light','补光']]) {
    const node=facilities.find(n=>n.id===`${id}/${part}`),resource=catalog.resources.find(r=>r.id===node?.resource.id&&r.version===node?.resource.version);
    element(button).disabled=busy||!node||view.mode==='building';element(button).textContent=`${node?.state.on??resource?.stateDefaults.on?'关闭':'开启'}${label}`;
  }
  const makeup=facilities.filter(n=>derived.floorIds.get(n.id)===view.floorId&&['makeup-mirror','makeup-mirror-wall'].includes(catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mountRole));
  element('makeup-controls').hidden=!makeup.length;
  fillOptions('makeup-mirror',makeup,element('makeup-mirror').value);
  const selectedMakeup=makeup.find(n=>n.id===element('makeup-mirror').value),makeupState=selectedMakeup?derived.facilities.find(f=>f.id===selectedMakeup.id).state:null;
  for(const key of ['makeup-mirror','makeup-power','makeup-intensity'])element(key).disabled=busy||!selectedMakeup||view.mode==='building';
  element('makeup-power').textContent=makeupState?.on?'关闭镜前补光':'开启镜前补光';
  element('makeup-intensity').value=String(makeupState?.intensity??5);
  const enabledMakeup=selectedMakeup&&session.scene.snapshot().lights.find(l=>l.id===selectedMakeup.id)?.intensity>0;
  element('makeup-status').textContent=!makeupState?'':!makeupState.on||makeupState.intensity===0?'补光已关闭；镜面仍可反射。':enabledMakeup?'镜前补光已开启。':'补光设置已保留，当前视图或灯光数量限制使它暂未点亮。';
  element('upgrade').disabled=busy||!id||doc.nodes.find(n=>n.id===id)?.template.version===2;
  element('building-view').disabled=busy||doc.scale!=='building';
  const building=view.mode==='building';element('building-stage').hidden=!building;stage.hidden=building;
  element('wall-view').disabled=busy||building;element('wall-view').value=wallMode;updateWallView();
  const hinged=facilities.filter(n=>derived.floorIds.get(n.id)===view.floorId&&['hinged-cabinet','sliding-drawer-cabinet','makeup-storage','makeup-drawer-host'].includes(catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mountRole));
  fillOptions('cabinet',hinged,element('cabinet').value);element('cabinet').disabled=busy||!hinged.length;
  const selectedCabinet=hinged.find(n=>n.id===element('cabinet').value),sliding=catalog.resources.find(r=>r.id===selectedCabinet?.resource.id&&r.version===selectedCabinet?.resource.version)?.movingParts?.[0]?.kind==='slide';
  for(const button of document.querySelectorAll('[data-opening]')){button.setAttribute('aria-pressed',String(Number(button.dataset.opening)===(selectedCabinet?.state?.openFraction??0)));button.disabled=busy||!hinged.length||view.mode==='building';button.textContent=(sliding?['收回','半拉','全拉']:['关门','半开','全开'])[Number(button.dataset.opening)*2];}
  element('cabinet-status').textContent=selectedCabinet?`当前开度 ${Math.round((selectedCabinet.state.openFraction??0)*100)}%`:'当前区域没有可开合设施';
  const clocks=facilities.filter(n=>derived.floorIds.get(n.id)===view.floorId&&catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.clockDisplay);
  fillOptions('clock',clocks,element('clock').value);element('clock').disabled=busy||!clocks.length;
  const selectedClock=clocks.find(n=>n.id===element('clock').value),clockResource=catalog.resources.find(r=>r.id===selectedClock?.resource.id&&r.version===selectedClock?.resource.version);
  element('clock-power').disabled=busy||building||clockResource?.clockDisplay.kind!=='digital';
  element('clock-power').textContent=(selectedClock?.state?.on??clockResource?.stateDefaults?.on)?'关闭数字显示':'开启数字显示';
  element('clock-brightness').disabled=element('clock-power').disabled;element('clock-brightness').value=String(selectedClock?.state?.brightness??clockResource?.stateDefaults?.brightness??1);
  element('clock-time').disabled=busy||!clocks.length;
  const boards=facilities.filter(n=>derived.floorIds.get(n.id)===view.floorId&&catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.informationSurface);
  fillOptions('information-board',boards,element('information-board').value);element('information-board').disabled=busy||building||!boards.length;
  const content=facilities.find(n=>n.parentId===element('information-board').value&&catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.informationContent);
  fillOptions('information-content',catalog.resources.filter(r=>r.informationContent).map(r=>({id:r.id,name:r.displayName})),content?.resource.id);
  element('information-content').disabled=busy||building||!content;element('information-visible').disabled=busy||building||!content;
  element('information-visible').textContent=content?.state?.visible===false?'显示图文':'隐藏图文';
  syncFinishes();
  if(building)buildingView.render(doc,{presentation:buildingPresentation});
  element('camera-hint').textContent=building?'先进入侧剖面，再选择楼层。':view.mode==='room'?'单间可拖动旋转，滚轮缩放。':'当前为固定角度总览，点击房间进入三维查看。';
  document.querySelectorAll('[data-view]').forEach(button=>{button.disabled=busy||view.mode!=='room'||(button.dataset.view==='ceiling'&&!currentFinishRoom()?.finishes?.ceiling&&!session.document.nodes.some(n=>n.parentId===currentFinishRoom()?.id&&catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mount==='ceiling'));});
  regionLabels=[];element('region-labels').replaceChildren();
  const labelNodes=building?[]:doc.nodes.filter(n=>['room','area'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId&&(!view.roomId||n.id===view.roomId));
  let roomNumber=0;
  for(const [index,node]of labelNodes.entries()) {
    const label=document.createElement('span');label.className='region-label';label.textContent=node.name||`空间 ${index+1}`;element('region-labels').append(label);
    let position;
    if(node.kind==='floor') {
      const object=session.scene.root.getObjectByName(`Overview:${node.id}`),box=new THREE.Box3().setFromObject(object);position=new THREE.Vector3(box.min.x,box.max.y+.4,box.max.z);
    } else {const frame=derived.worlds.get(node.id);position=new THREE.Vector3(...frame.position);position.y+=.6;}
    const shortName=node.kind==='room'?String(++roomNumber):({corridor:'通道',lobby:'入口厅','lift-access':'电梯','stair-access':'楼梯','restroom-access':'卫生',living:'客厅'}[node.publicRole]||node.name||'公共区');
    regionLabels.push({label,position,name:label.textContent,shortName});
  }
  updateRegionLabels();facilityEditor?.sync();
}
async function perform(label,action){
  if(busy)return;busy=true;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);status(label);
  try{await action();status('方案已更新，可以继续查看或保存。');}catch(error){
    const messages={'overlapping-facilities':'设施位置重叠','visual-outside-room':'模型超出房间边界','visual-surface-overhang':'设备超出桌面承载范围','asset-fetch-failed':'缺少所需模型文件','asset-texture-load-failed':'模型贴图损坏或无法加载','save-not-found':'尚未保存过这个方案','save-write-failed':'浏览器存储空间不足或不可写','dependency-content-mismatch':'存档需要的素材版本与当前素材不一致'};
    status(`${messages[error.code]||'素材或布局不符合当前支持规则'}。当前有效方案已保留。`,true);console.error(error);
  }
  finally{busy=false;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=false);sync();}
}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(session?.scene.view.mode==='floor')setView(activeView);updateRegionLabels();}
class CompanyPreview extends Phaser.Scene {update(time){if(session)session.scene.setPresentationInputs({clockSeconds:previewClockOverride??(32400+time/1000)});drawHostFrame(performance.now());}}
async function start(){
  session=await createCompanyAuthoring(world,layouts.smallHome,{catalog,templates,storage:localStorage,assetLibrary,mirrorPreflight,mirrorRenderProfile});
  let restored=false,restoreError;
  try{await session.restore(localStorage.getItem('company-preview:last-company')||session.document.id);restored=true;}catch(error){if(error.code!=='save-not-found')restoreError=error;}
  async function saveCurrent(){const result=await session.save();localStorage.setItem('company-preview:last-company',session.document.id);return result;}
  window.company={ready:true,catalog,templates,session,assetLibrary,get renderer(){return renderer;},get mirrorRenderProfile(){return session?.scene.mirrorRenderProfile||mirrorRenderProfile;},world,camera,mirrorController,drawHostFrame,renderStatus:()=>({hostFrame,rendererRestarts,lastRenderError}),setPreviewClock,pausePreview:()=>game?.loop.sleep(),view:setView,showSpace,layouts,showAppearanceSample,appearanceBranches,appearanceCandidates:branch=>appearanceCandidates(catalog,branch),
    async apply(ops){const r=await session.apply(ops);sync();return r;},
    async load(doc){const r=await session.load(doc);await defaultSpace();return r;},
    snapshot:()=>session.snapshot(),save:saveCurrent,restore:async()=>{const r=await session.restore();await defaultSpace();return r;},export:()=>session.export()};
  facilityEditor=createFacilityEditor({session,catalog,templates,world,camera,getCanvas:()=>renderer.domElement,perform,refresh:sync,isBusy:()=>busy,showSpace,defaultSpace,layouts,showSample:showAppearanceSample});
  window.company.editor=facilityEditor;
  element('edit-focus').onclick=()=>{const object=facilityEditor.focus();if(!object)return;const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3());orbit.minDistance=.25;orbit.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(.6,.7,1).normalize().applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())),Math.max(.5,box.getSize(new THREE.Vector3()).length()*1.6));orbit.update();updateWallView();};
  game=new Phaser.Game({type:Phaser.CANVAS,parent:'phaser-stage',width:1,height:1,transparent:true,audio:{noAudio:true},fps:{target:30},scene:CompanyPreview});
  resize();new ResizeObserver(resize).observe(stage);sync();await defaultSpace();status(restoreError?`已保留默认方案，存档未载入：${restoreError.message}`:restored?'已恢复上次保存的方案。':'方案已加载。',Boolean(restoreError));
  fillOptions('sample-branch',appearanceBranches.filter(([branch])=>appearanceCandidates(catalog,branch).length).map(([id,name])=>({id,name})),'desk');fillSampleLooks();
  element('sample-branch').onchange=fillSampleLooks;
  element('sample-show').onclick=()=>perform('正在替换并检查外观…',()=>showAppearanceSample(element('sample-branch').value,Number(element('sample-look').value)));
  for(const type of ['wall','floor','ceiling'])element(`finish-${type}`).onchange=()=>perform('正在准备整面饰材…',()=>changeFinish(type));
  element('finish-turn').onclick=()=>perform('正在调整地板铺设方向…',()=>{
    const room=currentFinishRoom(),finish=room?.finishes?.floor;
    if(!finish)throw Error('Choose a floor finish first');
    return session.apply([{type:'set-surface-finish',id:room.id,surface:'floor',finish:{...finish,quarterTurns:((finish.quarterTurns||0)+1)%4}}]);
  });
  element('layout').onchange=()=>perform('正在加载方案…',()=>facilityEditor.openLayout(element('layout').value));
  element('floor').onchange=()=>perform('正在查看楼层…',()=>showSpace('floor'));
  element('room').onchange=()=>perform('正在查看房间…',()=>showSpace('room'));
  element('floor-view').onclick=()=>perform('正在查看整层…',()=>showSpace('floor'));
  element('building-view').onclick=()=>perform('正在查看大楼…',()=>showSpace('building',element('floor').value,null,'section'));
  element('station').onchange=sync;
  element('cabinet').onchange=sync;
  element('information-board').onchange=sync;
  const selectedInformation=()=>session.document.nodes.find(n=>n.parentId===element('information-board').value&&catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.informationContent);
  element('information-content').onchange=()=>perform('正在更换图文…',()=>{const r=catalog.resources.find(r=>r.id===element('information-content').value);return session.apply([{type:'replace-resource',id:selectedInformation().id,resource:{id:r.id,version:r.version}}]);});
  element('information-visible').onclick=()=>perform('正在更新图文显示…',()=>{const n=selectedInformation();return session.apply([{type:'set-state',id:n.id,state:{visible:n.state?.visible===false}}]);});
  element('makeup-mirror').onchange=sync;
  element('makeup-power').onclick=()=>perform('正在更新镜前补光…',()=>{const n=session.document.nodes.find(n=>n.id===element('makeup-mirror').value);return session.apply([{type:'set-state',id:n.id,state:{on:!n.state.on}}]);});
  element('makeup-intensity').onchange=()=>perform('正在调整镜前补光…',()=>session.apply([{type:'set-state',id:element('makeup-mirror').value,state:{intensity:Number(element('makeup-intensity').value)}}]));
  element('clock').onchange=sync;
  element('clock-time').onchange=()=>setPreviewClock(element('clock-time').value==='live'?null:Number(element('clock-time').value));
  element('clock-power').onclick=()=>perform('正在更新数字显示…',()=>{const node=session.document.nodes.find(n=>n.id===element('clock').value),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);return session.apply([{type:'set-state',id:node.id,state:{on:!(node.state.on??resource.stateDefaults.on)}}]);});
  element('clock-brightness').onchange=()=>perform('正在更新显示亮度…',()=>session.apply([{type:'set-state',id:element('clock').value,state:{brightness:Number(element('clock-brightness').value)}}]));
  element('wall-view').onchange=()=>perform('正在调整墙体观看…',()=>{wallMode=element('wall-view').value;updateWallView();});
  element('sofa').onchange=()=>perform('正在替换沙发外观…',()=>{
    const resource=catalog.resources.find(r=>r.mountRole==='sofa'&&sofaChoice(r)===element('sofa').value);
    if(!resource)throw Error('Unknown sofa appearance');
    return session.apply([{type:'replace-resource',id:sofaNode().id,resource:{id:resource.id,version:resource.version}}]);
  });
  element('fabric').onchange=()=>perform('正在更新面料…',()=>session.apply([{type:'set-appearance',id:sofaNode().id,appearance:element('fabric').value==='original'?{}:{materials:{fabric:{color:'#345c83',roughness:.9}}}}]));
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  for(const [button,part]of[['screen','monitor'],['light','fill-light']])element(button).onclick=()=>perform('正在更新设施…',()=>{
    const id=`${element('station').value}/${part}`,node=session.document.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    return session.apply([{type:'set-state',id,state:{on:!(node.state.on??resource.stateDefaults.on)}}]);
  });
  document.querySelectorAll('[data-opening]').forEach(button=>button.onclick=()=>perform('正在检查设施开合空间…',async()=>{await session.apply([{type:'set-state',id:element('cabinet').value,state:{openFraction:Number(button.dataset.opening)}}]);setView('cabinet');}));
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
    if(facilityEditor?.pointer(event))return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObject(session.scene.root,true).find(hit=>hit.object.userData.floorId);
    if(hit){const {floorId,roomId}=hit.object.userData;perform('正在查看空间…',()=>showSpace(session.scene.view.mode==='building'?'floor':'room',floorId,roomId));}
  });
  fetch('/company-build-info.json').then(r=>r.ok?r.json():null).then(info=>{if(info){element('build-label').textContent=`构建 ${info.shortId}`;window.company.buildInfo=info;}}).catch(()=>{});
  const query=new URLSearchParams(location.search),requested=query.get('sample');
  if(requested&&appearanceBranches.some(([branch])=>branch===requested))await showAppearanceSample(requested,Number(query.get('look')||0));
  else if(Object.hasOwn(layouts,query.get('layout'))){await window.company.load(layouts[query.get('layout')]);if(!['smallHome','studio','base','alternate','rental','flat','twoFloors','building'].includes(query.get('layout')))facilityEditor.sampleLoaded({target:''});}
  facilityEditor.sync();
}
start().catch(error=>{status(`场景加载失败：${error.message}`,true);console.error(error);});
addEventListener('pagehide',()=>{facilityEditor?.dispose();game?.destroy(true);session?.dispose();assetLibrary.dispose();orbit.dispose();buildingView.dispose();renderer.dispose();},{once:true});
