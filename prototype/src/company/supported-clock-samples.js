import {createCompany,prepareCompanyChange,identityTransform} from './document.js';

export function createSupportedClockSample(catalog,templates,{branch='analog-clock-shelf',index=0,alternate=false}={}) {
  const resource=catalog.resources.filter(r=>r.productionBranch===branch)[index];
  const other=catalog.resources.find(r=>r.productionBranch===(branch==='analog-clock-shelf'?'digital-clock-shelf':'analog-clock-shelf'));
  const shelf=catalog.resources.find(r=>r.mountRole==='storage-shelf');
  if(!resource||!other||!shelf)throw Error('Supported clock sample requires both clock branches and an actual support shelf');
  let document=createCompany({id:alternate?'supported-clock-alternate':`appearance-${branch}`,name:alternate?'台面钟 · 转向层架':'台面钟 · 陈列与工位',width:7,depth:5.25},catalog);
  const room=document.nodes[1],ref=r=>({id:r.id,version:r.version}),parent='supported-clock/shelf';room.entry={position:[2.4,0,1.9]};
  document=prepareCompanyChange(document,[
    {type:'add-workstation',id:'supported-clock/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.4,0,0],yaw:0}},
    {type:'add-facility',id:parent,parentId:room.id,resource:ref(shelf),transform:{position:alternate?[1.7,0,-.4]:[1.35,0,-1.7],yaw:alternate?Math.PI/2:0}},
    ...[resource,other].map((r,i)=>{const surface=shelf.supportSurfaces.find(s=>s.id===(i?'top':'middle'));return {type:'add-facility',id:i?'supported-clock/secondary':'supported-clock/primary',name:i?'对照钟':'主钟',parentId:parent,resource:ref(r),attachment:{surfaceId:surface.id},transform:{position:[0,surface.topY,0],yaw:0}};}),
  ],{catalog,templates}).document;
  document=prepareCompanyChange(document,[{type:'group-facilities',id:'supported-clock/display',parentId:room.id,memberIds:[parent],transform:identityTransform()}],{catalog,templates}).document;
  return {document,target:'supported-clock/primary',branch,index,resource:ref(resource)};
}
