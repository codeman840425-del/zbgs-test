import {createCompany,prepareCompanyChange} from './document.js';
export function createFloorInformationSample(catalog,templates,{index=0,alternate=false}={}) {
  const boards=catalog.resources.filter(r=>r.mountRole==='information-board-floor'),contents=catalog.resources.filter(r=>r.informationContent);
  if(!boards[index]||boards.length!==4||contents.length<2)throw Error('Floor information sample requires four actual stands and existing independent contents');
  let document=createCompany({id:alternate?'floor-information-alternate':'appearance-information-board-floor',name:alternate?'落地信息板 · 转向入口':'落地信息板 · 公共入口',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],area={id:`${document.id}/public`,kind:'area',parentId:floor.id,name:'公共入口',bounds:{width:7,depth:3},transform:{position:[0,0,4.125],yaw:0}};
  floor.connections=[{id:`${document.id}/door`,from:{regionId:room.id,edge:'south',offset:0,width:1.4},to:{regionId:area.id,edge:'north',offset:0,width:1.4}}];
  document.nodes=[floor,area,room];
  const ref=r=>({id:r.id,version:r.version}),ops=[{type:'add-workstation',id:'floor-information/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.2,0,.2],yaw:0}}];
  for(let i=0;i<2;i++) {
    const id=i?'floor-information/secondary':'floor-information/primary',r=boards[(index+i)%boards.length];
    ops.push({type:'add-facility',id,parentId:area.id,name:i?'对照落地板':'落地信息板',resource:ref(r),transform:{position:[(i?1:-1)*(alternate?2:1.5),0,0],yaw:alternate?(i?-1:1)*Math.PI/2:0}},
      {type:'add-facility',id:`${id}/content`,parentId:id,name:i?'对照内容':'当前内容',resource:ref(contents[i]),transform:{position:[0,1.3,.031],yaw:0}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'floor-information/primary',branch:'information-board-floor',index,resource:ref(boards[index])};
}
