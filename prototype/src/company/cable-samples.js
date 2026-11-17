import {createCompany,prepareCompanyChange,identityTransform} from './document.js';
import {CABLE_IDS} from './cable-data.js';
export function createCableSample(catalog,templates,{index=0,alternate=false}={}){
  const cable=catalog.resources.find(r=>r.id===CABLE_IDS[index]&&r.version===1);
  const desk=catalog.resources.find(r=>r.id==='desk-trestle'&&r.version===1);
  if(!cable||!desk)throw Error('Cable sample requires registered cable and desk resources');
  let document=createCompany({id:alternate?'cable-alternate':'cable-demo',name:alternate?'设备连接 · 转向与不同间距':'设备连接 · 四款外观',width:6,depth:4},catalog);
  const [floor,room]=document.nodes,target='cable/primary',parent='cable/desk';
  document=prepareCompanyChange(document,[
    {type:'add-facility',id:parent,parentId:room.id,name:'设备桌',resource:{id:desk.id,version:1},transform:{position:alternate?[.5,0,0]:[0,0,0],yaw:alternate?Math.PI/2:0}},
    {type:'add-facility',id:'cable/monitor',parentId:parent,resource:{id:'monitor-aurora-usb',version:1},transform:{position:[0,desk.surface.topY,-.25],yaw:0}},
    {type:'add-facility',id:'cable/keyboard',parentId:parent,resource:{id:'keyboard-compact-usb',version:1},transform:{position:[0,desk.surface.topY,alternate?.31:.21],yaw:0}},
    {type:'add-facility',id:target,parentId:parent,resource:{id:cable.id,version:1},transform:identityTransform(),cableLink:{a:{deviceId:'cable/keyboard',portId:'usb'},b:{deviceId:'cable/monitor',portId:'usb'}}},
  ],{catalog,templates}).document;
  return{document,target,branch:'cable-route',index,resource:{id:cable.id,version:1},floorId:floor.id,roomId:room.id};
}
