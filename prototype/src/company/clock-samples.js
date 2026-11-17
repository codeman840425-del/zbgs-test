import {createCompany,prepareCompanyChange} from './document.js';

export function createClockSample(catalog,templates,{branch='analog-clock',index=0,alternate=false}={}) {
  const resource=catalog.resources.filter(r=>r.mountRole===branch)[index];
  const other=catalog.resources.find(r=>r.mountRole===(branch==='analog-clock'?'digital-clock':'analog-clock'));
  if(!resource||!other)throw Error('Clock sample requires both registered wall clock branches');
  let document=createCompany({id:alternate?'clock-alternate':`appearance-${branch}`,name:alternate?'钟表 · 侧墙布局':'钟表 · 直播间',width:7,depth:5.25},catalog);
  const room=document.nodes[1],ref=r=>({id:r.id,version:r.version});
  document=prepareCompanyChange(document,[
    {type:'add-workstation',id:'clock/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.2,0,0],yaw:0}},
    {type:'add-facility',id:'clock/primary',name:'主钟',parentId:room.id,resource:ref(resource),transform:{position:alternate?[-3.4,1.8,-.7]:[.7,1.8,-2.525],yaw:alternate?Math.PI/2:0}},
    {type:'add-facility',id:'clock/secondary',name:'对照钟',parentId:room.id,resource:ref(other),transform:{position:alternate?[-3.4,1.8,.4]:[1.6,1.8,-2.525],yaw:alternate?Math.PI/2:0}},
  ],{catalog,templates}).document;
  return {document,target:'clock/primary',branch,index,resource:ref(resource)};
}
