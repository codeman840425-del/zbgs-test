import * as THREE from 'three';
import {createPlacementProbe} from './placement-probe.js';

// An overlay is a map of checked, snapped origin coordinates, never a new collider.
export function createPlacementInteraction({session,catalog,templates,assetLibrary,world,camera,orbit,canvas,explain,commit,onCancel}) {
  let active=null,serial=0;
  const banner=document.getElementById('placement-banner'),instruction=document.getElementById('placement-instruction');
  const status=document.getElementById('placement-status');
  const colors={valid:new THREE.Color('#26836b'),invalid:new THREE.Color('#c44444'),pending:new THREE.Color('#7b858b')};
  function clear(){
    serial++;const a=active;active=null;
    if(a){world.remove(a.group);a.previewMaterials?.forEach(m=>m.dispose());a.probe?.dispose();a.tiles?.geometry.dispose();a.tiles?.material.dispose();a.ghost?.material.dispose();a.ghost?.geometry.dispose();
      camera.position.copy(a.camera.position);camera.quaternion.copy(a.camera.quaternion);orbit.target.copy(a.camera.target);orbit.enabled=a.camera.enabled;orbit.update();}
    banner.hidden=true;canvas.style.cursor='';document.querySelector('.view-toolbar').inert=false;document.getElementById('camera-hint').hidden=false;
  }
  function cancel(){clear();onCancel?.();}
  function bounds(config,parent){
    const p=session.document.nodes.find(n=>n.id===config.parentId),r=catalog.resources.find(r=>r.id===p?.resource?.id&&r.version===p.resource.version);
    const surface=r?.supportSurfaces?.find(s=>s.id===config.attachment?.surfaceId)||r?.surface;
    if(surface){const c=surface.center||[0,0];return{x:[c[0]-surface.halfSize[0],c[0]+surface.halfSize[0]],z:[c[1]-surface.halfSize[1],c[1]+surface.halfSize[1]],y:[0,2.8]};}
    const room=session.document.nodes.find(n=>n.id===config.roomId),obj=session.scene.root.getObjectByName(room.id);
    const box=new THREE.Box3();for(const x of [-1,1])for(const z of [-1,1])box.expandByPoint(new THREE.Vector3(x*room.bounds.width/2,0,z*room.bounds.depth/2).applyMatrix4(obj.matrixWorld).applyMatrix4(parent.matrixWorld.clone().invert()));
    return{x:[box.min.x,box.max.x],z:[box.min.z,box.max.z],y:[0,2.8]};
  }
  function point(a,u,v){const p=[...a.config.position];p[a.axes[0]]=u;p[a.axes[1]]=v;return p;}
  const key=p=>p.map(v=>v.toFixed(3)).join(',');
  function check(a,p){
    const k=key(p);if(a.cache.has(k))return a.cache.get(k);
    let result;try{result=a.probe.check([a.config.operation({position:p,yaw:a.yaw})]);}catch(error){result={valid:false,error};}
    a.cache.set(k,result);return result;
  }
  function paint(a,index,result){const color=result?colors[result.valid?'valid':'invalid']:colors.pending;for(let i=0;i<6;i++)a.tiles.geometry.attributes.color.setXYZ(index*6+i,color.r,color.g,color.b);a.tiles.geometry.attributes.color.needsUpdate=true;}
  function ensureModel(a){
    if(a.model)return;
    const op=a.config.operation({position:a.config.position,yaw:a.yaw}),source=a.config.source||a.probe?.visual?.(op.newId||op.id);
    if(!source)return;
    const model=source.clone(true),materials=[];model.visible=false;
    model.traverse(object=>{if(object.isLight)object.visible=false;if(object.isMesh){object.castShadow=false;object.receiveShadow=false;object.renderOrder=115;
      const array=Array.isArray(object.material),next=[object.material].flat().map(old=>{const m=new THREE.MeshBasicMaterial({color:old?.color||'#dfece4',transparent:true,opacity:.55,depthWrite:false,depthTest:false,side:THREE.DoubleSide});materials.push(m);return m;});object.material=array?next:next[0];
    }});
    a.previewMaterials=materials;a.model=model;a.group.add(model);
  }
  function map(a){
    a.cache.clear();a.pending=0;const generation=++a.mapGeneration;
    a.cells.forEach((p,i)=>paint(a,i,null));
    const batch=()=>{if(active!==a||generation!==a.mapGeneration||!a.probe)return;const start=performance.now();
      do{const i=a.pending++;paint(a,i,check(a,a.cells[i]));ensureModel(a);}while(a.pending<a.cells.length&&performance.now()-start<12);
      if(a.pending<a.cells.length)setTimeout(batch,0);
    };setTimeout(batch,0);
  }
  async function start(config){
    clear();const token=serial,parent=session.scene.root.getObjectByName(config.parentId);if(!parent)return;
    parent.updateWorldMatrix(true,false);
    const wall=['wall','wall-opening','portal'].includes(config.resource?.mount),axis=wall?(Math.abs(Math.sin(config.yaw))<.5?0:2):0;
    const axes=wall?[axis,1]:[0,2],step=config.resource&&['desk-surface','support-surface','wall','wall-opening'].includes(config.resource.mount)?.1:.2;
    const range=bounds(config,parent),names=['x','y','z'];
    const intervals=axes.map(i=>config.locks.includes(names[i])?[config.position[i],config.position[i]]:range[names[i]]);
    const group=new THREE.Group();group.name='PlacementOverlay';group.matrixAutoUpdate=false;group.matrix.copy(parent.matrixWorld);world.add(group);
    const normal=new THREE.Vector3();normal.setComponent([0,1,2].find(i=>!axes.includes(i)),wall?Math.cos(config.yaw)+Math.sin(config.yaw)>0?1:-1:1);
    const cells=[],vertices=[],rgb=[];
    const lo=intervals.map(([v],i)=>Math.ceil((v-config.position[axes[i]]-step*.5)/step)),hi=intervals.map(([,v],i)=>Math.floor((v-config.position[axes[i]]+step*.5)/step));
    for(let u=lo[0];u<=hi[0];u++)for(let v=lo[1];v<=hi[1];v++){
      const p=[...config.position];p[axes[0]]=intervals[0][0]===intervals[0][1]?intervals[0][0]:Number((config.position[axes[0]]+u*step).toFixed(4));p[axes[1]]=intervals[1][0]===intervals[1][1]?intervals[1][1]:Number((config.position[axes[1]]+v*step).toFixed(4));cells.push(p);
      for(const [du,dv]of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){const q=new THREE.Vector3(...p).addScaledVector(normal,.018);q.setComponent(axes[0],q.getComponent(axes[0])+du*step*.43);q.setComponent(axes[1],q.getComponent(axes[1])+dv*step*.43);vertices.push(...q);rgb.push(...colors.pending);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    const tiles=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.34,side:THREE.DoubleSide,depthWrite:false,depthTest:false}));tiles.renderOrder=110;group.add(tiles);
    const localBox=config.source?new THREE.Box3().setFromObject(config.source).applyMatrix4(parent.matrixWorld.clone().invert()):null;
    const m=config.resource?.mounting,f=config.resource?.footprint;
    const size=localBox?.getSize(new THREE.Vector3())||new THREE.Vector3(m?.width||f?.halfSize?.[0]*2||.6,m?.height||.65,m?.depth||f?.halfSize?.[1]*2||.6);
    const center=localBox?localBox.getCenter(new THREE.Vector3()).sub(new THREE.Vector3(...config.position)):new THREE.Vector3(0,m?.origin==='center'?0:size.y/2,0);
    const ghost=new THREE.Box3Helper(new THREE.Box3(),0x26836b);ghost.material.depthTest=false;ghost.renderOrder=120;group.add(ghost);ghost.visible=false;
    const a=active={config,group,tiles,ghost,size,center,axes,normal,step,cells,cache:new Map(),yaw:config.yaw,probe:null,pending:0,mapGeneration:0,drag:false,point:null,
      camera:{position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:orbit.target.clone(),enabled:orbit.enabled},revision:session.scene.revision,docId:session.document.id};
    orbit.enabled=false;document.querySelector('.view-toolbar').inert=true;document.getElementById('camera-hint').hidden=true;canvas.style.cursor='grab';banner.hidden=false;
    instruction.textContent=`镜头已锁定 · 左键拖放 / 点击落点 · 右键操作 · ${step} 米吸附`;
    status.textContent='正在检查安装面…';status.dataset.valid='pending';
    // Wall placement needs a face-on view; top placement needs a view from above.
    const mid=point(a,(intervals[0][0]+intervals[0][1])/2,(intervals[1][0]+intervals[1][1])/2),target=new THREE.Vector3(...mid).applyMatrix4(parent.matrixWorld);
    const direction=(wall?normal.clone():new THREE.Vector3(0,1,.12)).transformDirection(parent.matrixWorld);
    const span=Math.max(intervals[0][1]-intervals[0][0],intervals[1][1]-intervals[1][0],2);
    orbit.target.copy(target);camera.position.copy(target).addScaledVector(direction,span/(2*Math.tan(camera.fov*Math.PI/360))*1.35/Math.min(camera.aspect,1));camera.lookAt(target);camera.updateMatrixWorld();
    session.scene.setWallView({mode:document.getElementById('wall-view').value,cameraPosition:camera.position.toArray()});
    try{const probe=await createPlacementProbe({session,catalog,templates,assetLibrary,resource:config.resource});if(token!==serial){probe.dispose();return;}a.probe=probe;map(a);status.textContent='绿色：可放落点 · 红色：禁放 · 灰色：检查中';}
    catch(error){if(active===a){cancel();document.getElementById('edit-message').textContent=explain(error);}}
  }
  function hover(event){const a=active;if(!a?.probe)return true;
    if(a.docId!==session.document.id||a.revision!==session.scene.revision){cancel();return true;}
    const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    ray.ray.applyMatrix4(a.group.matrix.clone().invert());
    const hit=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(a.normal,new THREE.Vector3(...a.config.position)),new THREE.Vector3());
    if(!hit){a.point=null;a.ghost.visible=false;return true;}
    const p=[...a.config.position];for(const i of a.axes)if(!a.config.locks.includes(['x','y','z'][i]))p[i]=Number((a.config.position[i]+Math.round((hit.getComponent(i)-a.config.position[i])/a.step)*a.step).toFixed(4));
    const result=check(a,p);a.point=p;a.result=result;
    ensureModel(a);if(a.model){a.model.visible=true;a.model.position.fromArray(p);a.model.rotation.y=a.yaw;}
    const turn=Math.abs(Math.sin(a.yaw-a.config.yaw))>.5,size=a.size.clone();if(turn)[size.x,size.z]=[size.z,size.x];
    a.ghost.box.setFromCenterAndSize(new THREE.Vector3(...p).add(a.center),size);a.ghost.visible=true;a.ghost.material.color.copy(colors[result.valid?'valid':'invalid']);
    status.dataset.valid=String(result.valid);status.textContent=`${result.valid?'可放置 ✓':'不可放置 ×'} · 坐标 ${p.map(v=>Number(v.toFixed(3))).join(' / ')} 米${result.valid?'':` · ${explain(result.error)}`}`;
    canvas.style.cursor=a.drag?'grabbing':result.valid?'grab':'not-allowed';return true;
  }
  function down(event){if(!active||event.button!==0)return false;active.drag=true;canvas.setPointerCapture(event.pointerId);hover(event);return true;}
  function up(event){const a=active;if(!a||event.button!==0)return Boolean(a);if(!a.drag)return true;a.drag=false;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);hover(event);
    if(a.point&&a.result?.valid)commit(a.config.operation({position:a.point,yaw:a.yaw}));return true;
  }
  function rotate(){const a=active;if(!a||a.config.locks.includes('yaw'))return false;a.yaw=(a.yaw+Math.PI/2)%(Math.PI*2);a.point=null;a.ghost.visible=false;map(a);status.textContent='朝向已改变，正在重算可放区域。';return true;}
  return{start,cancel,clear,hover,down,up,rotate,get active(){return Boolean(active);},get lockedRotation(){return active?.config.locks.includes('yaw');},
    snapshot:()=>active?{step:active.step,yaw:active.yaw,checked:active.cache.size,total:active.cells.length,complete:active.pending===active.cells.length,drag:active.drag,point:active.point,cells:active.cells.map(p=>({position:p,valid:active.cache.get(key(p))?.valid,error:active.cache.get(key(p))?.error?.code,message:active.cache.get(key(p))?.error?.message})),parentMatrix:active.group.matrix.toArray()}:null};
}
