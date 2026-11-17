import * as THREE from 'three';
import {deriveCompany,CompanyError} from './document.js';
import {compareFacilityFunction} from './appearance-contract.js';
import {appearanceBranches,appearanceCandidates} from './appearance-samples.js';
import {listPlacementTargets,createFacilityPlacement,getFacilityEditConstraints} from './facility-edit-data.js';

const el=id=>document.getElementById(id),ref=r=>`${r.id}@${r.version}`;
const angle=yaw=>((Math.round(yaw*180/Math.PI)%360)+360)%360;
const nice=(r)=>r?.displayName||r?.name||appearanceBranches.find(([id])=>id===(r?.productionBranch||r?.mountRole))?.[1]||r?.id||'';
function options(select,rows,value){
  select.replaceChildren(...rows.map(row=>{const o=document.createElement('option');o.value=row.value;o.textContent=row.label;o.disabled=Boolean(row.disabled);return o;}));
  if(rows.some(r=>r.value===value))select.value=value;
}

export function createFacilityEditor({session,catalog,templates,world,camera,getCanvas,perform,refresh,isBusy,showSpace,defaultSpace,layouts,showSample}){
  let selected='',armed=null,mode='room',disposed=false,tool='selection';
  const drafts={room:null,sample:null},documents=new Map(),allLayouts=[...el('layout').options].map(o=>({value:o.value,label:o.textContent,disabled:o.disabled}));
  const roomLayouts=new Set(['smallHome','studio','base','alternate','rental','flat','twoFloors','building']);
  const outline=new THREE.Box3Helper(new THREE.Box3(),0xd58b28);outline.material.depthTest=false;outline.renderOrder=100;outline.visible=false;world.add(outline);
  const resource=n=>catalog.resources.find(r=>n?.resource?.id===r.id&&n.resource.version===r.version);
  const node=()=>session.document.nodes.find(n=>n.id===selected);
  const region=()=>{
    const regions=session.document.nodes.filter(n=>['room','area'].includes(n.kind));
    return regions.find(n=>n.id===el('room').value)?.id||regions.find(n=>n.id===session.scene.view.roomId)?.id||regions[0]?.id;
  };
  const message=(text,error=false)=>{el('edit-message').textContent=text;el('edit-message').dataset.error=String(error);};
  const remember=()=>documents.set(session.document.id,structuredClone(session.document));
  const execute=(label,fn)=>perform(label,async()=>{try{remember();await fn();message('已更新当前布置。保存后可关闭并继续。');}catch(e){message(explain(e),true);throw e;}});
  function explain(error){
    const messages={'invalid-support-fit':'所选物品超出承载面的宽度、高度或深度。','overlapping-supported-props':'这个承载面上已有物品，位置发生重叠。','overlapping-facilities':'这里已有设施，请换一个位置。','blocked-use-point':'该位置挡住了设施的使用空间。','invalid-wall-fit':'物品必须贴合墙面，并避开边界。','wall-display-over-portal':'这里是门口，不能覆盖。','missing-placement-target':'当前房间没有合适的承载物，请先添加桌、柜架或信息板。','incompatible-appearance':'此造型的功能或安装规格不同，不能作为原位外观替换。','required-template-part':'这是工位的必要部件；可换外观，移除请选所属整体。','visual-outside-room':'物品超出房间边界，请放回房间内。','visual-surface-overhang':'物品超出了桌面，请调整位置。','invalid-edit-value':'请输入有效的位置数值。'};
    return `${messages[error.code]||'这个位置或操作不符合安装要求。'} 原布置已保留。`;
  }
  function select(id){if(selected!==id)el('placement-tools').open=false;selected=id;tool='selection';cancel();sync();}
  function cancel(){armed=null;el('placement-banner').hidden=true;getCanvas().style.cursor='';}
  function arm(action){armed=action;el('placement-instruction').textContent=action.kind==='add'?'点击所选区域放置设施；拖动仍可调整镜头。':action.kind==='copy'?'点击新位置放置副本；原物品保留。':'点击目标位置移动；拖动仍可调整镜头。';el('placement-banner').hidden=false;getCanvas().style.cursor='crosshair';}
  function chosenResource(){return catalog.resources.find(r=>ref(r)===el('add-look').value);}
  function refreshTargets(){
    const r=chosenResource(),targets=r?listPlacementTargets(session.document,catalog,r,region(),{templates}):[];
    options(el('add-target'),targets.map(t=>({value:t.id,label:t.label})),el('add-target').value);
    const target=targets.find(t=>t.id===el('add-target').value);
    el('add-note').textContent=target?.note||(!targets.length?'当前空间没有合适的安装位置或承载物。请先添加对应的桌、柜架或信息板。':'点击场景放置，也可使用所选位置的默认点。');
    el('add-place').disabled=el('add-center').disabled=isBusy()||!target||session.scene.view.mode==='building';
    if(r?.mount==='parent-device-endpoints'){
      el('add-place').disabled=true;
      if(!target)el('add-note').textContent='需要同一桌面上两个相对、同高且未被连接线占用的接口。先布置带连接口的屏幕和键盘，再连接。';
    }
    el('add-center').textContent=r?.mount==='parent-device-endpoints'?'连接所选接口':'放到默认位置';
    return target;
  }
  function refreshAddLooks(){
    const rows=appearanceCandidates(catalog,el('add-branch').value);
    options(el('add-look'),rows.map(r=>({value:ref(r),label:nice(r)})),el('add-look').value);refreshTargets();
  }
  async function add(overrides){
    const r=chosenResource();if(!r)throw new CompanyError('missing-placement-target','add','Select an appearance');
    const result=createFacilityPlacement(session.document,catalog,r,el('add-target').value,overrides||{},region(),{templates});
    await session.apply([result.operation]);selected=result.id;cancel();
  }
  async function move(transform){const n=node();if(!n)return;await session.apply([{type:'move',id:n.id,transform}]);cancel();}
  function readTransform(){
    const n=node(),position=['x','y','z'].map(axis=>Number(el(`edit-${axis}`).value));
    if(!n||position.some(v=>!Number.isFinite(v))||['x','y','z'].some(axis=>!el(`edit-${axis}`).value.trim()))throw new CompanyError('invalid-edit-value','position','Finite coordinates required');
    const degrees=Number(el('edit-yaw').value);if(![0,90,180,270].includes(degrees))throw new CompanyError('invalid-edit-value','yaw','Choose a supported orientation');
    return{position,yaw:degrees*Math.PI/180};
  }
  function stateControls(n,r){
    const container=el('edit-states');container.replaceChildren();if(!r)return;
    const state={...r.stateDefaults,...n.state};
    for(const [field,value]of Object.entries(state)){
      const spec=r.stateSchema?.[field];
      if(typeof value==='boolean'){
        const label=field==='on'?(r.light?'灯光':'电源'):field==='visible'?'内容显示':field==='connected'?'连接':'开关';
        const b=document.createElement('button');b.textContent=`${label}：${value?'开':'关'}`;b.setAttribute('aria-pressed',String(value));b.disabled=isBusy();
        b.onclick=()=>execute('正在更新设施状态…',()=>session.apply([{type:'set-state',id:n.id,state:{[field]:!value}}]));container.append(b);
      }else if(typeof value==='number'&&spec?.type==='number'){
        const wrap=document.createElement('label');wrap.textContent=field==='openFraction'?'打开程度':field==='intensity'?'灯光强度':field==='brightness'?'显示亮度':field;
        const input=document.createElement('input');input.type='range';input.min=spec.min;input.max=spec.max;input.step=(spec.max-spec.min)/20;input.value=value;input.disabled=isBusy();input.setAttribute('aria-label',wrap.textContent);
        input.onchange=()=>execute('正在调整设施…',()=>session.apply([{type:'set-state',id:n.id,state:{[field]:Number(input.value)}}]));wrap.append(input);container.append(wrap);
      }
    }
  }
  function sync(){
    if(disposed)return;
    const doc=session.document,derived=deriveCompany(doc,catalog,templates),view=session.scene.view;
    const knownLayout=Object.entries(layouts).find(([,d])=>d.id===doc.id)?.[0];
    if(knownLayout)mode=roomLayouts.has(knownLayout)?'room':'sample';
    else if(doc.id.startsWith('appearance-'))mode='sample';
    const visible=doc.nodes.filter(n=>['facility','workstation','assembly'].includes(n.kind)&&derived.floorIds.get(n.id)===view.floorId&&(!region()||derived.roomIds.get(n.id)===region()));
    if(!visible.some(n=>n.id===selected))selected='';
    options(el('edit-instance'),[{value:'',label:'选择场景里的物品'},...visible.map((n,i)=>({value:n.id,label:`${i+1} · ${nice(resource(n))||n.name||'组合工位'}`}))],selected);
    const n=node(),r=resource(n),constraints=n?getFacilityEditConstraints(n,r):null;
    el('edit-empty').hidden=Boolean(n);el('edit-fields').hidden=!n;el('edit-focus').disabled=!n||isBusy()||view.mode==='building';outline.visible=false;
    if(n){
      const candidates=r?catalog.resources.filter(c=>c.asset&&compareFacilityFunction(r,c).compatible):[];
      if(r&&!candidates.some(c=>ref(c)===ref(r)))candidates.unshift(r);
      options(el('edit-look'),candidates.map(c=>({value:ref(c),label:nice(c)})),r?ref(r):'');
      el('edit-look').disabled=isBusy()||candidates.length<2;
      el('edit-compatibility').textContent=r?`${candidates.length} 款符合当前安装与功能规格；更换不改变位置。`:'选中的是整体；移动、旋转和复制会带上内部部件。选中部件可单独换款。';
      for(const [i,axis]of ['x','y','z'].entries()){el(`edit-${axis}`).value=Number(n.transform.position[i].toFixed(4));el(`edit-${axis}`).disabled=isBusy()||constraints.lockedAxes.includes(axis);}
      el('edit-yaw').value=String(angle(n.transform.yaw));el('edit-yaw').disabled=isBusy()||constraints.lockedAxes.includes('yaw');
      el('edit-rotate').disabled=el('edit-yaw').disabled;el('edit-position').disabled=isBusy()||constraints.lockedAxes.length===4;
      el('edit-move').disabled=isBusy()||constraints.lockedAxes.length===4||view.mode==='building';
      el('edit-rule').textContent=constraints.note;
      const installable=r&&['wall','portal','support-surface'].includes(r.mount);
      const targets=installable?listPlacementTargets(doc,catalog,r,derived.roomIds.get(n.id),{templates}):[];
      el('edit-installation').hidden=!installable;
      options(el('edit-target'),targets.map(t=>({value:t.id,label:t.label})),el('edit-target').value);
      el('edit-attach').disabled=isBusy()||!targets.length;
      el('edit-parent').disabled=!doc.nodes.some(p=>p.id===n.parentId&&['facility','workstation','assembly'].includes(p.kind));
      el('edit-remove').disabled=isBusy()||Boolean(n.stationId);
      el('edit-copy').disabled=isBusy()||Boolean(n.stationId)||r?.mount==='parent-device-endpoints';stateControls(n,r);
      const object=session.scene.root.getObjectByName(selected);
      if(object&&view.mode!=='building'){outline.box.setFromObject(object);outline.visible=!outline.box.isEmpty();}
    }
    refreshTargets();
    for(const type of ['room','sample'])el(`mode-${type}`).setAttribute('aria-pressed',String(mode===type));
    el('sample-browser').hidden=mode!=='sample';
    if(mode==='sample'||view.mode==='building')tool='selection';
    const building=view.mode==='building',overview=view.mode!=='room';
    el('workspace-description').textContent=mode==='sample'?'检查单件外观与功能；不修改公司方案。':'选择公司方案，再进入楼层或房间查看。';
    el('sample-scenarios').hidden=mode!=='sample';
    el('layout-picker').hidden=mode==='sample'&&el('sample-scenarios').getAttribute('aria-expanded')!=='true';
    el('inspector-unavailable').hidden=!overview;
    el('inspector-unavailable').textContent=building?'先选择楼层，再进入房间查看物品。':'点击画面中的房间，或在左侧选择房间，再检查外观与布置。';
    for(const [key,panel]of [['selection','selection-panel'],['add','add-panel'],['finish','finish-panel']]){
      el(`tool-${key}`).hidden=mode==='sample'&&key!=='selection';
      el(`tool-${key}`).disabled=isBusy()||overview;
      el(`tool-${key}`).setAttribute('aria-pressed',String(tool===key));
      el(panel).hidden=overview||tool!==key;
    }
    el('selection-scope').textContent=`所在空间：${derived.nodes.get(region())?.name||'当前房间'}`;
    el('save').textContent=mode==='sample'?'保存当前样件':'保存公司方案';
    el('restore').textContent=mode==='sample'?'恢复此样件存档':'恢复此公司存档';
    el('restore').title='重新载入此方案最后一次保存的内容，覆盖当前未保存修改';
    el('view-context').textContent=building?'大楼概览':`${derived.nodes.get(view.floorId)?.name||'当前层'}${view.mode==='room'?' / '+(derived.nodes.get(view.roomId)?.name||'当前房间'):' / 整层总览'}`;
    el('floor-view').hidden=building||view.mode==='floor'||doc.nodes.filter(x=>['room','area'].includes(x.kind)).length===1;
    el('building-view').hidden=building||doc.scale!=='building';
    el('wall-view').hidden=building;
    document.querySelectorAll('.view-toolbar [data-view]').forEach(b=>b.hidden=view.mode!=='room'||(b.dataset.view==='ceiling'&&b.disabled));
    document.querySelector('.view-toolbar').hidden=building;
    el('floor').disabled=isBusy()||doc.nodes.filter(x=>x.kind==='floor').length<2;
    el('room').disabled=isBusy()||building;
    el('edit-instance').disabled=isBusy()||building;
    el('edit-focus').hidden=!n;
    el('edit-parent').hidden=el('edit-parent').disabled;
    if(n)el('edit-look').hidden=!r;
    el('placement-tools').hidden=!n;
    if(n)el('edit-empty').hidden=true;
    el('layout-heading').textContent=mode==='room'?'公司方案':'组合验证场景';el('layout-label').textContent=mode==='room'?'切换公司方案':'选择已配置的组合场景';
    const matched=Object.entries(layouts).find(([,d])=>d.id===doc.id)?.[0]||'custom';
    options(el('layout'),allLayouts.filter(o=>o.value==='custom'||(roomLayouts.has(o.value)===(mode==='room'))),matched);
    el('selection-panel').classList.toggle('sample-selection',mode==='sample');
  }
  async function setMode(next){
    if(next===mode)return;
    remember();
    drafts[mode]=structuredClone(session.document);cancel();selected='';el('placement-tools').open=false;
    const previous=mode,previousDocument=structuredClone(session.document);
    try{if(drafts[next])await session.load(drafts[next]);else if(next==='sample')await showSample(el('sample-branch').value||'desk',0);else await session.load(layouts.smallHome);mode=next;if(drafts[next]||next==='room')await defaultSpace();}
    catch(e){await session.load(previousDocument);mode=previous;throw e;}sync();
  }
  async function openLayout(key){
    const initial=layouts[key];if(!initial)return;
    remember();cancel();selected='';await session.load(documents.get(initial.id)||initial);await defaultSpace();sync();
  }
  async function copyAt(transform){
    const n=node();let count=1,newId;do{newId=`${n.id}-copy-${count++}`;}while(session.document.nodes.some(n=>n.id===newId));
    await session.apply([{type:n.kind==='facility'?'copy-facility':n.kind==='workstation'?'copy-workstation':'copy-group',id:n.id,newId,transform}]);selected=newId;cancel();
  }
  function focus(){
    const object=session.scene.root.getObjectByName(selected);if(!object)return;
    // Host camera helper owns orbit target and camera constraints.
    return object;
  }
  function pointer(event){
    if(isBusy()||session.scene.view.mode!=='room')return false;
    const rect=getCanvas().getBoundingClientRect(),ndc=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    if(armed){
      const n=node(),r=armed.kind==='add'?chosenResource():resource(n),t=armed.kind==='add'?refreshTargets():null;
      const parentId=armed.kind==='add'?t?.parentId:n?.parentId,parent=session.scene.root.getObjectByName(parentId);
      if(!parent){message('请先进入要布置的楼层或房间。',true);return true;}
      const localRay=ray.ray.clone().applyMatrix4(parent.matrixWorld.clone().invert());
      const base=armed.kind==='add'?t.position:n.transform.position,yaw=armed.kind==='add'?t.yaw:n.transform.yaw;
      const wall=r&&['wall','portal'].includes(r.mount),normal=wall?new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)):new THREE.Vector3(0,1,0);
      const hit=localRay.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...base)),new THREE.Vector3());
      if(!hit){message('请调整镜头，让摆放面出现在画面里。',true);return true;}
      const position=hit.toArray().map(v=>Math.round(v*10)/10),locks=armed.kind==='add'?(t.lockedAxes||[]):getFacilityEditConstraints(n,r).lockedAxes;
      for(const [i,axis]of ['x','y','z'].entries())if(locks.includes(axis))position[i]=base[i];
      if(!wall)position[1]=base[1];
      const kind=armed.kind;
      execute('正在检查摆放位置…',()=>kind==='add'?add({x:position[0],height:position[1],z:position[2],yaw}):kind==='copy'?copyAt({position,yaw}):move({position,yaw}));return true;
    }
    for(const hit of ray.intersectObject(session.scene.root,true)){
      let visible=true;for(let p=hit.object;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)continue;
      for(let p=hit.object;p;p=p.parent){if(session.document.nodes.some(n=>n.id===p.name&&n.kind==='facility')){select(p.name);return true;}}
    }
    return false;
  }
  el('edit-instance').onchange=()=>select(el('edit-instance').value);
  el('edit-look').onchange=()=>execute('正在原位替换外观…',async()=>{const r=catalog.resources.find(r=>ref(r)===el('edit-look').value);await session.apply([{type:'replace-resource',id:selected,resource:{id:r.id,version:r.version}}]);});
  el('edit-position').onclick=()=>execute('正在更新位置…',()=>move(readTransform()));
  el('edit-rotate').onclick=()=>execute('正在检查转向空间…',()=>{const n=node();return move({position:[...n.transform.position],yaw:(angle(n.transform.yaw)+90)%360*Math.PI/180});});
  el('edit-move').onclick=()=>arm({kind:'move'});el('placement-cancel').onclick=cancel;
  el('edit-parent').onclick=()=>select(node().parentId);
  el('edit-remove').onclick=()=>execute('正在移除物品…',async()=>{await session.apply([{type:'remove',id:selected}]);selected='';cancel();});
  el('edit-copy').onclick=()=>arm({kind:'copy'});
  el('edit-attach').onclick=()=>execute('正在更换安装位置…',()=>{
    const n=node(),r=resource(n),t=listPlacementTargets(session.document,catalog,r,region(),{templates}).find(t=>t.id===el('edit-target').value);
    if(!t)throw new CompanyError('missing-placement-target',n.id,'Select an installation target');
    const transform={position:t.position,yaw:t.yaw};
    return session.apply([r.mount==='support-surface'?{type:'attach-surface',id:n.id,parentId:t.parentId,surfaceId:t.attachment.surfaceId,transform}:{type:'move',id:n.id,transform}]);
  });
  const order=['desk','chair','sofa','side-table','monitor','fill-light','keyboard','desk-microphone','plant','rug','wall-art'];
  options(el('add-branch'),appearanceBranches.filter(([b])=>b!=='stream-station'&&appearanceCandidates(catalog,b).length).sort(([a],[b])=>(order.includes(a)?order.indexOf(a):100)-(order.includes(b)?order.indexOf(b):100)).map(([value,label])=>({value,label})),'desk');
  el('add-branch').onchange=refreshAddLooks;el('add-look').onchange=refreshTargets;el('add-target').onchange=refreshTargets;
  el('add-place').onclick=()=>arm({kind:'add'});el('add-center').onclick=()=>execute('正在添加设施…',()=>add());
  el('sample-scenarios').onclick=()=>{el('sample-scenarios').setAttribute('aria-expanded',String(el('sample-scenarios').getAttribute('aria-expanded')!=='true'));sync();};
  for(const key of ['selection','add','finish'])el(`tool-${key}`).onclick=()=>{tool=key;cancel();sync();};
  for(const m of ['room','sample'])el(`mode-${m}`).onclick=()=>execute('正在切换工作区域…',()=>setMode(m));
  const escape=e=>{if(e.key==='Escape')cancel();};document.addEventListener('keydown',escape);
  const sampleIds=new Set(Object.entries(layouts).filter(([k])=>!roomLayouts.has(k)).map(([,d])=>d.id));
  if(sampleIds.has(session.document.id)||session.document.id.startsWith('appearance-'))mode='sample';
  refreshAddLooks();
  return{sync,select,pointer,focus,setMode,openLayout,get mode(){return mode;},get selected(){return selected;},cancel,
    sampleLoaded(sample){mode='sample';tool='selection';selected=sample.target;el('placement-tools').open=false;sync();},
    beforeSample(){remember();if(mode==='room')drafts.room=structuredClone(session.document);},
    getDraft(id){return documents.get(id);},
    dispose(){disposed=true;document.removeEventListener('keydown',escape);world.remove(outline);outline.geometry.dispose();outline.material.dispose();}};
}
