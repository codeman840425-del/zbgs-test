import {createCompany,prepareCompanyChange} from './document.js';
export function createFloorMirrorSample(catalog,templates,{index=0,alternate=false}={}) {
  const mirrors=catalog.resources.filter(r=>r.mountRole==='floor-mirror'),selected=mirrors[index];
  if(!selected)throw Error('Floor mirror sample requires four registered appearances');
  let document=createCompany({id:alternate?'floor-mirror-alternate':'appearance-floor-mirror',name:alternate?'落地镜 · 转向布置':'落地镜 · 真实支承与反射',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],area=document.id+'/public';
  floor.connections=[{id:document.id+'/entry',from:{regionId:room.id,edge:'south',offset:0,width:1.4},to:{regionId:area,edge:'north',offset:0,width:1.4}}];
  document.nodes.push({id:area,kind:'area',parentId:floor.id,name:'公共入口',bounds:{width:7,depth:3},transform:{position:[0,0,4.125],yaw:0}});
  const ops=[{type:'add-workstation',id:'floor-mirror/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:alternate?[1.2,0,-.3]:[-1.2,0,0],yaw:0}},
    {type:'add-facility',id:'floor-mirror/primary',parentId:room.id,name:'落地镜',resource:{id:selected.id,version:selected.version},transform:{position:alternate?[-2,0,0]:[1.5,0,-1.5],yaw:alternate?Math.PI/2:0}}];
  const plant=catalog.resources.find(r=>r.id==='plant-palm');
  ops.push({type:'add-facility',id:'floor-mirror/object',parentId:room.id,name:'镜中绿植',resource:{id:plant.id,version:plant.version},transform:{position:alternate?[.2,0,1.4]:[1.2,0,1.6],yaw:0}});
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'floor-mirror/primary',branch:'floor-mirror',index,resource:{id:selected.id,version:selected.version}};
}
