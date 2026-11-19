import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Vector3} from 'three';
import {createCompanyAuthoring} from 'released-company/authoring.js';
import {createCompanyAssetLibrary} from 'released-company/asset-library.js';
import {decodeCompanySave} from 'released-company/persistence.js';

const byId=id=>document.getElementById(id);
async function getText(path) {
  const response=await fetch(path,{redirect:'error'});
  if (!response.ok) throw Error(path+' HTTP '+response.status);
  return response.text();
}

export async function mountCompanyRoom(consumer,roomKey) {
  const metadata=JSON.parse(await getText('./facility/rooms.json'));
  const room=metadata.rooms.find(entry=>entry.key===roomKey);
  if (!room) throw Error('未知房间 '+roomKey);
  const [catalogText,templatesText,save]=await Promise.all([
    getText('./facility/library-catalog.json'),getText('./facility/templates.json'),getText(room.save)
  ]);
  const catalog=JSON.parse(catalogText),templates=JSON.parse(templatesText);
  const doc=await decodeCompanySave(save,catalog,templates);
  const {floorId,roomId}=room;
  if(doc.id!==roomKey) throw Error('公司存档身份不符');
  const assetLibrary=createCompanyAssetLibrary();
  let session;
  const dispose=()=>{session?.dispose();assetLibrary.dispose();};
  try {
    session=await createCompanyAuthoring(consumer.scene,doc,{catalog,templates,storage:localStorage,
      assetLibrary,isUsePointBusy:id=>Boolean(consumer.seatLeases.forSeat(id))});
    await session.setView({mode:'room',floorId,roomId});
    return {session,assetLibrary,room,metadata,dispose};
  } catch(error){dispose();throw error;}
}

export async function openFacilityRoom(consumer,roomKey) {
  const mounted=await mountCompanyRoom(consumer,roomKey);
  const {session,assetLibrary,room,metadata}=mounted;
  const {floorId,roomId}=room;
  let orbit;
  const close=()=>{orbit?.dispose();mounted.dispose();};
  try {
    await consumer.bindFacilityRoom({session,floorId,roomId});
    const {camera,renderer}=consumer;
    const region=session.scene.navigation(floorId).regions.find(item=>item.id===roomId);
    orbit=new OrbitControls(camera,renderer.domElement);
    orbit.maxPolarAngle=Math.PI*.48;
    const updateWalls=()=>session.scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
    orbit.addEventListener('change',updateWalls);
    function frameRoom() {
      const {width,depth}=region.bounds;
      const center=new Vector3(...region.transform.position);center.y+=.95;
      const offset=new Vector3(.54,.62,1).normalize().applyAxisAngle(new Vector3(0,1,0),region.transform.yaw);
      const tangent=Math.tan(camera.fov*Math.PI/360);
      const distance=Math.max(width,depth)*.75/Math.min(1,camera.aspect)/tangent;
      camera.position.copy(center).addScaledVector(offset,distance);
      orbit.target.copy(center);orbit.update();updateWalls();
    }
    frameRoom();
    const actorSelect=byId('facility-actor'),seatSelect=byId('facility-seat');
    for(const record of consumer.records) actorSelect.add(new Option(record.identity.name??record.identity.id,record.identity.id));
    const points=session.scene.describeUsePoints({floorId}).filter(p=>p.roomId===roomId);
    for(const point of points) seatSelect.add(new Option(point.id.split('/').slice(-2).join('/'),point.id));
    const station=points.find(p=>p.id===room.seatId);
    if (!station) throw Error('公司存档缺少指定工位座椅');
    seatSelect.value=station.id;
    const status=byId('room-status');
    function message(text){status.textContent=text;}
    const lastRequest=new Map();
    function taskMessage(task) {
      const labels={pending:'等待',running:'进行中',completed:'完成',cancelled:'已取消',failed:'失败',rejected:'被拒绝'};
      const state=task.admission==='rejected'?'rejected':task.state;
      message([task.kind==='sit'?'入座':'起身',labels[state]??state,task.reason].filter(Boolean).join(' · '));
      return ['completed','failed','cancelled','rejected'].includes(state);
    }
    function request(kind) {
      const controller=consumer.actors.get(actorSelect.value).controller;
      const requestId=crypto.randomUUID();
      const reply=controller.requestBehavior({kind,requestId,payload:kind==='sit'?{usePointId:seatSelect.value}:{}});
      lastRequest.set(actorSelect.value,requestId);
      if(taskMessage(reply.task)) lastRequest.delete(actorSelect.value);
    }
    byId('facility-sit').onclick=()=>request('sit');
    byId('facility-stand').onclick=()=>request('stand');
    byId('facility-frame').onclick=frameRoom;
    const storageKey='facility-room-state:'+metadata.gameInventorySha256+':'+metadata.roomManifestSha256+':'+roomKey;
    byId('facility-save').onclick=()=>{
      try{localStorage.setItem(storageKey,JSON.stringify(consumer.captureFacilityState()));message('角色状态已保存');}
      catch(error){message(error.message);}
    };
    byId('facility-restore').onclick=async()=>{
      try{
        const entry=localStorage.getItem(storageKey);if(!entry) throw Error('这个房间还没有保存角色状态');
        await consumer.restoreFacilityState(JSON.parse(entry));message('角色状态已恢复');lastRequest.clear();
      }catch(error){message(error.message);}
    };
    const report=setInterval(()=>{
      const id=lastRequest.get(actorSelect.value);
      if(!id)return;
      const task=consumer.actors.get(actorSelect.value)?.controller.behaviorTasks.get(id);
      if(task && taskMessage(task)) lastRequest.delete(actorSelect.value);
    },300);
    window.facilityRoom={roomKey,floorId,roomId,session,assetLibrary,frameRoom,orbit};
    byId('facility-controls').disabled=false;
    status.dataset.state='ready';message(session.document.name+' · '+roomKey+' · '+consumer.buildInfo.shortId);
    window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(report);close();}});
  } catch(error) {close();throw error;}
}
