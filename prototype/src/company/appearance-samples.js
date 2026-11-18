import {listPlacementTargets} from './facility-edit-data.js';
import {createWindowSample} from './window-samples.js';
import {createCompany,prepareCompanyChange,identityTransform} from './document.js';
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
import {createVanitySample} from './vanity-samples.js';
import {createSideTableSample} from './side-table-samples.js';
import {createSideTableLifeItemsSample} from './side-table-life-items-samples.js';
import {createCeilingAcousticSample} from './ceiling-acoustic-samples.js';
import {createWallShelfSample} from './wall-shelf-samples.js';
import {createCableSample} from './cable-samples.js';
import {resolveWorkstationLook,workstationLooks,workstationLookOperations} from './workstation-looks.js';
export const appearanceBranches=[
 ['screen-partition','落地屏风'],
 ['background-fabric','可收卷直播背景幕'],
 ['static-textile','沙发软装'],
 ['window-opening-and-glass','窗体与真实洞口'],
 ['window-cover','窗体覆盖（帘/卷帘/百叶）'],
 ['exterior-door-leaf','外部门扇'],
 ['cable-route','设备连接线'],
 ['ceiling-acoustic-baffle','顶部吸声构件'],
 ['wall-shelf','墙装多层壁架'],
 ['side-table-life-items','边几日用品'],
 ['side-table','边几与茶几'],
 ['makeup-mirror-wall','挂墙化妆镜'],
 ['makeup-storage-drawer','抽屉内化妆收纳'],
 ['makeup-storage','化妆台面收纳'],
 ['makeup-mirror','台面化妆镜'],
 ['vanity-table','化妆台'],
 ['floor-mirror','落地镜'],
 ['mirror','墙挂镜'],
 ['information-board-floor','落地图文板'],
 ['information-board','墙挂图文板'],
 ['analog-clock-shelf','台面指针钟'],['digital-clock-shelf','台面数字钟'],
 ['analog-clock','挂墙指针钟'],['digital-clock','挂墙数字钟'],
 ['hinged-cabinet','单扇开合柜'],
 ['sliding-drawer-cabinet','单抽屉收纳柜'],
 ['storage-shelf','多层开放架'],['tabletop-ornament','台面陈列摆件'],
 ['desk','桌子'],['chair','单人座椅'],['sofa','双人沙发'],['monitor','屏幕'],['fill-light','补光系统'],['desk-lamp','桌面台灯'],
 ['camera-device','摄像设备'],['phone-static','桌面直播手机'],['background-display','直播背景'],['headphones-and-stand','耳机与耳机架'],['audio-control','音频控制设备'],['desktop-computer','桌面电脑'],['laptop-computer','笔记本电脑'],
 ['outlet-switch','墙面插座/开关'],['power-strip','桌面插排'],
 ['keyboard','键盘'],['mouse-and-pad','鼠标与鼠标垫'],['desk-microphone','桌面麦克风'],['plant','绿植'],['wall-art','挂画'],
 ['floor-panel','地板模块'],['wall-panel','墙面模块'],['door-frame','开放门框'],['window-panel','窗饰模块'],['rug','地毯'],['stream-station','组合直播工位'],
 ['camera-mount','相机挂载'],
];
const names={'chair-cantilever':'悬臂滑橇椅','chair-pedestal':'中心底盘椅','chair-ladder':'梯架靠背椅','chair-crossbeam':'交叉梁椅',
 'lounge-sofa':'软包双人沙发','timber-sofa':'开放木框双人沙发','sofa-modular':'模块软包双人沙发','sofa-arch':'拱架双人沙发',
 'exterior-door-leaf-plain':'平板外部门扇','exterior-door-leaf-glass-panel':'玻璃外部门扇','exterior-door-leaf-slatted':'格栅外部门扇','exterior-door-leaf-solid-panel':'实芯面板外部门扇',
 'window-cover-curtain':'对开布帘','window-cover-roller':'卷帘','window-cover-venetian':'横向百叶','window-cover-sheer':'纱帘',
 'monitor-aurora':'圆角环框屏幕','monitor-ribbon':'双柱宽框屏幕','monitor-pillar':'立柱支撑屏幕','monitor-slate':'V形支架屏幕',
 'fill-light-orbit':'圆筒柔光系统','fill-light-wing':'双翼反光系统','fill-light-column':'立柱柔光系统','fill-light-panel':'悬臂面板补光',
 'headphones-arc':'弧形头戴耳机','headphones-cushion':'软垫头戴耳机','headphones-dock':'桌面耳机架','headphones-in-ear':'入耳耳机收纳盒',
 'desktop-tower':'标准塔式主机','desktop-compact':'紧凑塔式主机','desktop-all-in-one':'一体式电脑','desktop-workstation':'工作站主机',
 'slim-laptop':'轻薄本','dual-screen-laptop':'双屏本','rugged-laptop':'加固型笔记本','tablet-laptop':'平板式笔记本',
 'outlet-switch-outlet-single':'单插座面板','outlet-switch-outlet-multi':'多孔插座面板','outlet-switch-switch-rocker':'翘板开关面板','outlet-switch-control-panel':'墙面控制面板',
 'power-strip-desk':'桌面插排','power-strip-underdesk':'桌下插排','power-strip-tower':'塔式插排','power-strip-usb':'USB插排'};
// Catalog history stays available to saved documents; new authoring choices use one latest version per resource ID.
export function latestAppearanceVersions(resources){
 const latest=new Map();for(const resource of resources)if(!latest.has(resource.id)||latest.get(resource.id).version<resource.version)latest.set(resource.id,resource);
 return [...latest.values()];
}
export function appearanceCandidates(catalog,branch) {
 if(branch==='stream-station')return workstationLooks.map(({id,version,displayName})=>({id,version,displayName}));
 const selected=catalog.resources.filter(r=>((r.productionBranch||r.mountRole)===branch ||
   (branch==='sofa' && r.productionBranch==='sofa-textile-host')) && r.asset && r.id!=='lounge-sofa');
 if(branch==='sofa')selected.unshift(catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===1));
 return latestAppearanceVersions(selected.filter(Boolean)).map(r=>({...r,displayName:r.displayName||names[r.id]||r.id}));
}
function createPowerStripSample(catalog,templates,{index=0}={}){
 const strip=appearanceCandidates(catalog,'power-strip')[index],desk=catalog.resources.find(r=>r.id==='desk-trestle'&&r.version===1),monitor=catalog.resources.find(r=>r.id==='monitor-aurora-usb'&&r.version===1),keyboard=catalog.resources.find(r=>r.id==='keyboard-compact-usb'&&r.version===1),single=catalog.resources.find(r=>r.id==='cable-route-single-sleeve'&&r.version===1),dual=catalog.resources.find(r=>r.id==='cable-route-dual-sleeve'&&r.version===1);
 if(!strip||!desk||!monitor||!keyboard||!single||!dual)throw Error('Power-strip sample requires desk, USB devices and cable resources');
 let document=createCompany({id:'power-strip-demo',name:'桌面插排 · 四端点连接',width:6,depth:4},catalog);const room=document.nodes[1],parent='power-strip/desk',topY=desk.surface.topY;
 document=prepareCompanyChange(document,[
  {type:'add-facility',id:parent,parentId:room.id,resource:{id:desk.id,version:1},transform:{position:[0,0,0],yaw:0}},
  {type:'add-facility',id:'power-strip/monitor',parentId:parent,resource:{id:monitor.id,version:monitor.version},transform:{position:[-.27,topY,-.4],yaw:0}},
  {type:'add-facility',id:'power-strip/keyboard',parentId:parent,resource:{id:keyboard.id,version:keyboard.version},transform:{position:[-.03,topY,.26],yaw:0}},
  {type:'add-facility',id:'power-strip/primary',parentId:parent,resource:{id:strip.id,version:strip.version},transform:{position:[0,topY,0],yaw:0},state:{on:false}},
  {type:'add-facility',id:'power-strip/cable-monitor',parentId:parent,resource:{id:single.id,version:single.version},transform:identityTransform(),cableLink:{a:{deviceId:'power-strip/primary',portId:'usb-1'},b:{deviceId:'power-strip/monitor',portId:'usb'}}},
  {type:'add-facility',id:'power-strip/cable-keyboard',parentId:parent,resource:{id:dual.id,version:dual.version},transform:identityTransform(),cableLink:{a:{deviceId:'power-strip/primary',portId:'usb-4'},b:{deviceId:'power-strip/keyboard',portId:'usb'}}},
 ],{catalog,templates}).document;
 return{document,target:'power-strip/primary',branch:'power-strip',index,resource:{id:strip.id,version:strip.version}};
}
export function createAppearanceSample(branch,index,catalog,templates,options={}) {
 if(branch==='window-opening-and-glass')return createWindowSample(catalog,templates,{index,alternate:Boolean(options.alternate)});
 if(branch==='window-cover'){
   const sample=createWindowSample(catalog,templates,{index:0,alternate:Boolean(options.alternate)});
   const oldId=sample.document.id,newId=`window-cover-${options.alternate?'alternate':'company'}`;
   const text=JSON.stringify(sample.document).replaceAll(oldId,newId);sample.document=JSON.parse(text);sample.document.id=newId;
   sample.target=sample.target.replace(oldId,newId);
   const selected=appearanceCandidates(catalog,branch)[index];
   if(!selected)throw Error(`No appearance ${branch}[${index}]`);
   const windowId=sample.target;
   sample.document.nodes.push({id:`${windowId}/cover`,kind:'facility',parentId:windowId,attachment:{windowId},resource:{id:selected.id,version:selected.version},transform:{position:[0,0,.13],yaw:0},state:{openFraction:index===1 ? .5 : index===2 ? 1 : 0}});
   sample.target=`${windowId}/cover`;sample.branch=branch;sample.index=index;sample.resource={id:selected.id,version:selected.version};
   return sample;
 }
 if(branch==='cable-route')return createCableSample(catalog,templates,{index,alternate:Boolean(options.alternate)});
 if(branch==='power-strip')return createPowerStripSample(catalog,templates,{index});
 if(branch==='ceiling-acoustic-baffle')return createCeilingAcousticSample(catalog,templates,{index,alternate:Boolean(options.alternate)});
 if(branch==='wall-shelf')return createWallShelfSample(catalog,templates,{index,alternate:Boolean(options.alternate)});
 if(branch==='side-table-life-items')return createSideTableLifeItemsSample(catalog,templates,{index,alternate:Boolean(options.alternate)});
 if(branch==='side-table')return createSideTableSample(catalog,templates,{index});
 if(branch==='makeup-mirror-wall')return createMakeupWallMirrorSample(catalog,templates,{index});
 if(branch==='makeup-storage-drawer')return createMakeupDrawerSample(catalog,templates,{index});
 if(branch==='makeup-storage')return createMakeupStorageSample(catalog,templates,{index});
 if(branch==='makeup-mirror')return createMakeupMirrorSample(catalog,templates,{index});
 if(branch==='vanity-table')return createVanitySample(catalog,templates,{index});
 if(branch==='floor-mirror')return createFloorMirrorSample(catalog,templates,{index});
 if(branch==='mirror')return createMirrorSample(catalog,templates,{index});
 if(branch==='information-board-floor')return createFloorInformationSample(catalog,templates,{index});
 if(branch==='information-board')return createInformationSample(catalog,templates,{index});
 if(['analog-clock-shelf','digital-clock-shelf'].includes(branch))return createSupportedClockSample(catalog,templates,{branch,index});
 if(['analog-clock','digital-clock'].includes(branch))return createClockSample(catalog,templates,{branch,index});
 if(branch==='hinged-cabinet')return createHingedSample(catalog,templates,{index});
 if(branch==='sliding-drawer-cabinet')return createSlidingSample(catalog,templates,{index});
 if(['storage-shelf','tabletop-ornament'].includes(branch))return createSupportSample(catalog,templates,{branch,index});
 const candidates=appearanceCandidates(catalog,branch),selected=candidates[index];
 if(!selected)throw Error(`No appearance ${branch}[${index}]`);
 const sampleId=branch==='camera-mount' ? `appearance-camera-mount-${selected.mount}` :
   selected.productionBranch==='sofa-textile-host' ? 'appearance-sofa-textile-host' : `appearance-${branch}`;
 let doc=createCompany({id:sampleId,name:`${appearanceBranches.find(([key])=>key===branch)?.[1]} · ${selected.displayName||selected.name||selected.id}`,width:9,depth:7},catalog);
 const floor=doc.nodes[0],room=doc.nodes[1],area=`${doc.id}/public`;
 if (branch==='static-textile') {
   const host='sample/sofa', target=host+'/textile', resource={id:selected.id,version:selected.version};
   doc=prepareCompanyChange(doc,[
     {type:'add-facility',id:host,parentId:room.id,resource:{id:'sofa-textile-modular',version:1}},
     {type:'add-facility',id:target,parentId:host,resource,attachment:{surfaceId:'textile-rest'}},
   ],{catalog,templates}).document;
   return {document:doc,target,branch,index,resource};
 }
 if(branch==='camera-mount'){
   if(selected.mount==='desk-edge-clamp'){
     doc=prepareCompanyChange(doc,[{type:'add-workstation',id:'sample/station',parentId:room.id,
       template:{id:'stream-station',version:1},transform:identityTransform()}],{catalog,templates}).document;
   }
   const [slot]=listPlacementTargets(doc,catalog,selected,room.id,{templates});
   if(!slot)throw Error(`Missing installation target for ${selected.id}`);
   const target='sample/object',resource={id:selected.id,version:selected.version};
   doc=prepareCompanyChange(doc,[{type:'add-facility',id:target,parentId:slot.parentId,resource,
     transform:{position:slot.position,yaw:slot.yaw}}],{catalog,templates}).document;
   return {document:doc,target,branch,index,resource};
 }
 floor.connections=[{id:`${doc.id}/entry`,from:{regionId:room.id,edge:'south',offset:0,width:1.4},to:{regionId:area,edge:'north',offset:0,width:1.4}}];
 doc.nodes.push({id:area,kind:'area',parentId:floor.id,name:'公共入口',bounds:{width:9,depth:3},transform:{position:[0,0,5],yaw:0}});
 const station='sample/station',ops=[{type:'add-workstation',id:station,parentId:room.id,template:{id:'stream-station',version:1},transform:identityTransform()}];
 if(branch==='stream-station'){
   doc=prepareCompanyChange(doc,ops,{catalog,templates}).document;
   const resource={id:selected.id,version:selected.version},recipe=resolveWorkstationLook(resource);
   const replacements=workstationLookOperations(doc,station,recipe,catalog,templates);
   if(replacements.length)doc=prepareCompanyChange(doc,replacements,{catalog,templates}).document;
   return {document:doc,target:station,branch,index,resource};
 }
 const partKeys={'desk':'desk','chair':'chair','monitor':'monitor','keyboard':'keyboard','desk-microphone':'microphone','fill-light':'fill-light'};
 let target;
 if(partKeys[branch]&&!['chair','fill-light'].includes(branch)){target=`${station}/${partKeys[branch]}`;ops.push({type:'replace-resource',id:target,resource:{id:selected.id,version:selected.version}});}
 else {
   const transforms={sofa:[[-2.8,0,1.7],0],chair:[[-2.8,0,1.7],0],'fill-light':[[-2.8,0,1.7],0],plant:[[3.4,0,1.8],0],'wall-art':[[0,1.4,-3.4],0],
     'wall-panel':[[-2,0,-3.4],0],'window-panel':[[2,1.4,-3.4],0],'door-frame':[[0,0,3.4],Math.PI],
     'mouse-and-pad':[[.5,.84,.21],0], 'phone-static':[[.52,.84,.05],0], 'background-fabric':[[0,0,-2.65],0],
     'floor-panel':[[2,0,-1.5],0],rug:[[0,0,1.8],0], 'desk-lamp':[[.67,.84,-.2],0], 'camera-device':[[.52,.84,-.02],0], 'desktop-computer':[[-.48,.84,.02],0], 'laptop-computer':[[.34,.84,.08],0], 'background-display':[[0,0,-2.6],0], 'screen-partition':[[-2.2,0,0],Math.PI/2], 'headphones-and-stand':[[.72,.84,.05],0], 'audio-control':[[0,.84,.08],0], 'outlet-switch':[[0,1.35,-3.4],0], 'power-strip':[[0,.84,.3],0]};
   const [position,yaw]=transforms[branch];target='sample/object';
   const deskMounted=selected.mount==='desk-surface';
   const parentId=deskMounted?`${station}/desk`:room.id;
   const partId={'camera-device':'camera','headphones-and-stand':'headphones'}[branch]||branch;
   if(deskMounted)target=`${station}/${partId}`;
   ops.push({type:'add-facility',id:target,parentId,resource:{id:selected.id,version:selected.version},transform:{position,yaw}});
 }
 doc=prepareCompanyChange(doc,ops,{catalog,templates}).document;
 return {document:doc,target,branch,index,resource:{id:selected.id,version:selected.version}};
}
