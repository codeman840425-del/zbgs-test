import {createCompany,prepareCompanyChange} from './document.js';
import {CEILING_ACOUSTIC_IDS} from './ceiling-acoustic-data.js';
export function createCeilingAcousticSample(catalog,templates,{index=0,alternate=false}={}){
  const resource=catalog.resources.find(r=>r.id===CEILING_ACOUSTIC_IDS[index]&&r.version===1);
  const table=catalog.resources.find(r=>r.id==='side-table-square'&&r.version===1);
  if(!resource||!table)throw Error('Ceiling sample requires registered ceiling components and the existing side table');
  let document=createCompany({id:alternate?'ceiling-acoustic-alternate':'ceiling-acoustic-demo',name:alternate?'顶部吸声 · 转向布置':'顶部吸声 · 四款结构',width:6,depth:4},catalog);
  const [floor,room]=document.nodes,target='ceiling-acoustic/primary',ref=r=>({id:r.id,version:r.version});
  const position=alternate?[1.1,2.8,-.6]:[0,2.8,0],yaw=alternate?Math.PI/2:0;
  document=prepareCompanyChange(document,[
    {type:'add-facility',id:target,parentId:room.id,name:resource.displayName||resource.id,resource:ref(resource),transform:{position,yaw}},
    {type:'add-facility',id:'ceiling-acoustic/table',parentId:room.id,name:'下方边几',resource:ref(table),transform:{position:[position[0],0,position[2]],yaw}},
  ],{catalog,templates}).document;
  return{document,target,branch:'ceiling-acoustic-baffle',index,resource:ref(resource),floorId:floor.id,roomId:room.id};
}
