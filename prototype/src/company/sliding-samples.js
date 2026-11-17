import {createCompany,prepareCompanyChange} from './document.js';

export function createSlidingSample(catalog,templates,{index=0,alternate=false}={}) {
  const resource=catalog.resources.filter(r=>r.mountRole==='sliding-drawer-cabinet')[index];
  const prop=catalog.resources.find(r=>r.id==='tabletop-ornament-vase');
  if(!resource||!prop)throw Error('Sliding sample requires registered cabinet and supported prop');
  let document=createCompany({id:alternate?'sliding-alternate':'appearance-sliding-drawer-cabinet',name:alternate?'抽屉柜 · 转向布局':'抽屉柜 · 陈列与工位',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1];room.entry={position:[2.5,0,1.9]};
  const ref=r=>({id:r.id,version:r.version});
  document=prepareCompanyChange(document,[
    {type:'add-workstation',id:'sliding/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.5,0,0],yaw:0}},
    {type:'add-facility',id:'sliding/cabinet',parentId:room.id,resource:ref(resource),transform:{position:alternate?[1.7,0,-.4]:[1.5,0,-1.7],yaw:alternate?Math.PI/2:0}},
    {type:'add-facility',id:'sliding/top-prop',parentId:'sliding/cabinet',resource:ref(prop),attachment:{surfaceId:'top'},transform:{position:[.2,1.2,0],yaw:0}},
  ],{catalog,templates}).document;
  return{document,target:'sliding/cabinet',branch:'sliding-drawer-cabinet',index,resource:ref(resource),floorId:floor.id,roomId:room.id};
}
