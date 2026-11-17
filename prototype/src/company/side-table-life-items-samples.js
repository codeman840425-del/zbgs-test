import {createCompany,prepareCompanyChange} from './document.js';

export function createSideTableLifeItemsSample(catalog,templates,{index=0,alternate=false}={}) {
  const items=catalog.resources.filter(r=>r.mountRole==='side-table-life-items'),selected=items[index];
  const table=catalog.resources.find(r=>r.id===(alternate?'side-table-low':'side-table-round')&&r.version===1);
  if(!selected||!table)throw Error('Life-item sample requires a registered item and compatible real side table');
  let document=createCompany({id:alternate?'side-table-life-items-alternate':'side-table-life-items-demo',name:alternate?'台面日用品 · 转向布置':'台面日用品 · 四款对照',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],parent='life-items/table',target='life-items/primary';
  const ref=r=>({id:r.id,version:r.version});
  document=prepareCompanyChange(document,[
    {type:'add-facility',id:parent,parentId:room.id,name:table.displayName||table.id,resource:ref(table),transform:{position:alternate?[1,0,.3]:[0,0,-.5],yaw:alternate?Math.PI/2:0}},
    {type:'add-facility',id:target,parentId:parent,name:selected.displayName||selected.id,resource:ref(selected),attachment:{surfaceId:'top'},transform:{position:[0,.5,0],yaw:0}},
  ],{catalog,templates}).document;
  return{document,target,parent,branch:'side-table-life-items',index,resource:ref(selected),floorId:floor.id,roomId:room.id};
}
