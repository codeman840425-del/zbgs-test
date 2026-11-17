import {createCompany,prepareCompanyChange} from './document.js';

// The same fixed support surface is consumed by both independent layout inputs.
export function createSideTableSample(catalog,templates,{index=0,alternate=false}={}) {
  const tables=catalog.resources.filter(r=>r.mountRole==='side-table');
  const selected=tables[index],prop=catalog.resources.find(r=>r.id==='tabletop-ornament-vase');
  if(!selected||!prop)throw Error('Side-table sample requires registered external tables and a supported ornament');
  let document=createCompany({id:alternate?'side-table-alternate':'side-table-demo',name:alternate?'边几 · 转向布置':'边几 · 四款与台面承载',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],target='side-table/primary';
  const ref=r=>({id:r.id,version:r.version});
  document=prepareCompanyChange(document,[
    {type:'add-facility',id:target,parentId:room.id,name:selected.displayName||selected.id,resource:ref(selected),transform:{position:alternate?[1,0,.3]:[0,0,-.5],yaw:alternate?Math.PI/2:0}},
    {type:'add-facility',id:target+'/ornament',parentId:target,name:'台面花瓶',resource:ref(prop),attachment:{surfaceId:'top'},transform:{position:[0,.5,0],yaw:0}},
  ],{catalog,templates}).document;
  return{document,target,branch:'side-table',index,resource:ref(selected),floorId:floor.id,roomId:room.id};
}
