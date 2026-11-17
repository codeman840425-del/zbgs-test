import {createCompany,prepareCompanyChange} from './document.js';
export function createInformationSample(catalog,templates,{index=0,alternate=false}={}) {
  const boards=catalog.resources.filter(r=>r.mountRole==='information-board'),contents=catalog.resources.filter(r=>r.informationContent);
  if(!boards[index]||contents.length<2)throw Error('Information sample requires four boards and two independent contents');
  let document=createCompany({id:alternate?'information-alternate':'appearance-information-board',name:alternate?'图文信息 · 侧墙布局':'图文信息 · 公司公告',width:7,depth:5.25},catalog);
  const room=document.nodes[1],ref=r=>({id:r.id,version:r.version}),ops=[];
  ops.push({type:'add-workstation',id:'information/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.2,0,.2],yaw:0}});
  for(let i=0;i<2;i++) {
    const id=i?'information/secondary':'information/primary',r=boards[(index+i)%boards.length];
    ops.push({type:'add-facility',id,parentId:room.id,name:i?'对照信息板':'信息板',resource:ref(r),transform:{position:alternate?[-3.4,1.7,-.8+i*1.2]:[.4+i*1.25,1.7,-2.525],yaw:alternate?Math.PI/2:0}},
      {type:'add-facility',id:`${id}/content`,parentId:id,name:i?'对照内容':'当前内容',resource:ref(contents[i]),transform:{position:[0,0,.031],yaw:0}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'information/primary',branch:'information-board',index,resource:ref(boards[index])};
}
