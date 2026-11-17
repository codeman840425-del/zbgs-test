import {createCompany,prepareCompanyChange} from './document.js';
export function createMirrorSample(catalog,templates,{index=0,alternate=false}={}) {
  const mirrors=catalog.resources.filter(r=>r.mountRole==='mirror'),selected=mirrors[index];
  if(!selected)throw Error('Mirror sample requires a registered mirror');
  let document=createCompany({id:alternate?'mirror-alternate':'appearance-mirror',name:alternate?'墙镜 · 侧墙布局':'墙镜 · 真实场景反射',width:7,depth:5.25},catalog);
  const room=document.nodes[1],ops=[{type:'add-workstation',id:'mirror/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:alternate?[1.4,0,.3]:[-1.2,0,.3],yaw:0}}];
  ops.push({type:'add-facility',id:'mirror/primary',parentId:room.id,name:'墙挂镜',resource:{id:selected.id,version:selected.version},transform:{position:alternate?[-3.4,1.4,0]:[1.2,1.4,-2.525],yaw:alternate?Math.PI/2:0}});
  const plant=catalog.resources.find(r=>r.id==='plant-palm'&&r.asset);
  if(plant)ops.push({type:'add-facility',id:'mirror/object',parentId:room.id,name:'镜中绿植',resource:{id:plant.id,version:plant.version},transform:{position:alternate?[1.2,0,-1.5]:[1.2,0,1.5],yaw:0}});
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'mirror/primary',branch:'mirror',index,resource:{id:selected.id,version:selected.version}};
}
