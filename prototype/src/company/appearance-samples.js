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
export const appearanceBranches=[
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
 ['desk','桌子'],['chair','单人座椅'],['sofa','双人沙发'],['monitor','屏幕'],['fill-light','补光系统'],
 ['keyboard','键盘'],['desk-microphone','桌面麦克风'],['plant','绿植'],['wall-art','挂画'],
 ['floor-panel','地板模块'],['wall-panel','墙面模块'],['door-frame','开放门框'],['window-panel','窗饰模块'],['rug','地毯'],['stream-station','组合直播工位'],
];
const names={'chair-cantilever':'悬臂滑橇椅','chair-pedestal':'中心底盘椅','chair-ladder':'梯架靠背椅','chair-crossbeam':'交叉梁椅',
 'lounge-sofa':'软包双人沙发','timber-sofa':'开放木框双人沙发','sofa-modular':'模块软包双人沙发','sofa-arch':'拱架双人沙发',
 'monitor-aurora':'圆角环框屏幕','monitor-ribbon':'双柱宽框屏幕','monitor-pillar':'立柱支撑屏幕','monitor-slate':'V形支架屏幕',
 'fill-light-orbit':'圆筒柔光系统','fill-light-wing':'双翼反光系统','fill-light-column':'立柱柔光系统','fill-light-panel':'悬臂面板补光'};
export function appearanceCandidates(catalog,branch) {
 if(branch==='stream-station')return [0,1,2,3].map(i=>({id:`station-look-${i+1}`,version:1,displayName:['横梁与悬臂','双柱与转椅','侧柜与栅背','金属框与交叉椅'][i]}));
 const selected=catalog.resources.filter(r=>(r.productionBranch||r.mountRole)===branch&&r.asset&&r.id!=='lounge-sofa');
 if(branch==='sofa')selected.unshift(catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===1));
 return selected.filter(Boolean).map(r=>({...r,displayName:r.displayName||names[r.id]||r.id}));
}
export function createAppearanceSample(branch,index,catalog,templates,options={}) {
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
 let doc=createCompany({id:`appearance-${branch}`,name:`${appearanceBranches.find(([key])=>key===branch)?.[1]} · ${selected.displayName||selected.name||selected.id}`,width:9,depth:7},catalog);
 const floor=doc.nodes[0],room=doc.nodes[1],area=`${doc.id}/public`;
 floor.connections=[{id:`${doc.id}/entry`,from:{regionId:room.id,edge:'south',offset:0,width:1.4},to:{regionId:area,edge:'north',offset:0,width:1.4}}];
 doc.nodes.push({id:area,kind:'area',parentId:floor.id,name:'公共入口',bounds:{width:9,depth:3},transform:{position:[0,0,5],yaw:0}});
 const station='sample/station',ops=[{type:'add-workstation',id:station,parentId:room.id,template:{id:'stream-station',version:1},transform:identityTransform()}];
 const partKeys={'desk':'desk','chair':'chair','monitor':'monitor','keyboard':'keyboard','desk-microphone':'microphone','fill-light':'fill-light'};
 let target;
 if(branch==='stream-station'){
   for(const [key,part]of Object.entries(partKeys)){const resource=appearanceCandidates(catalog,key)[index];if(!resource)throw Error(`Incomplete workstation look: ${key}[${index}]`);ops.push({type:'replace-resource',id:`${station}/${part}`,resource:{id:resource.id,version:resource.version}});}
   target=station;
 }else if(partKeys[branch]&&!['chair','fill-light'].includes(branch)){target=`${station}/${partKeys[branch]}`;ops.push({type:'replace-resource',id:target,resource:{id:selected.id,version:selected.version}});}
 else {
   const transforms={sofa:[[-2.8,0,1.7],0],chair:[[-2.8,0,1.7],0],'fill-light':[[-2.8,0,1.7],0],plant:[[3.4,0,1.8],0],'wall-art':[[0,1.4,-3.4],0],
     'wall-panel':[[-2,0,-3.4],0],'window-panel':[[2,1.4,-3.4],0],'door-frame':[[0,0,3.4],Math.PI],
     'floor-panel':[[2,0,-1.5],0],rug:[[0,0,1.8],0]};
   const [position,yaw]=transforms[branch];target='sample/object';
   ops.push({type:'add-facility',id:target,parentId:room.id,resource:{id:selected.id,version:selected.version},transform:{position,yaw}});
 }
 doc=prepareCompanyChange(doc,ops,{catalog,templates}).document;
 return {document:doc,target,branch,index,resource:{id:selected.id,version:selected.version}};
}
