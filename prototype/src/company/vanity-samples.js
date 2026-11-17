import {createCompany,prepareCompanyChange,composeTransform} from './document.js';

export function createVanitySample(catalog,templates,{index=0,alternate=false}={}) {
  const tables=catalog.resources.filter(r=>r.mountRole==='vanity-table'),selected=tables[index];
  const seat=catalog.resources.find(r=>r.id==='vanity-chair-side-entry');
  const clock=catalog.resources.find(r=>r.id==='digital-clock-shelf-flat');
  const props=catalog.resources.filter(r=>r.mountRole==='tabletop-ornament');
  if(!selected||!seat||!clock||props.length<2)throw Error('Vanity sample requires registered tables, explicit seat adapter, supported clock and ornaments');
  let document=createCompany({id:alternate?'vanity-alternate':'appearance-vanity-table',name:alternate?'化妆台 · 两房转向布置':'化妆台 · 承载与留空',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1];room.name='化妆准备间';room.purpose='work';
  const arrangements=[{roomId:room.id,id:'vanity/primary',table:selected,transform:{position:[-1,0,-1.3],yaw:0}}];
  if(alternate) {
    document.scale='rental-home';
    const second=document.id+'/room-2';
    document.nodes.push({id:second,kind:'room',parentId:floor.id,name:'化妆准备间',purpose:'work',bounds:{width:7,depth:5.25},transform:{position:[7,0,0],yaw:0}});
    floor.connections=[{id:document.id+'/door',from:{regionId:room.id,edge:'east',offset:0,width:1.4},to:{regionId:second,edge:'west',offset:0,width:1.4}}];
    arrangements.push({roomId:second,id:'vanity/secondary',table:tables[(index+1)%tables.length],transform:{position:[1,0,-1],yaw:Math.PI/2}});
  }
  const ref=r=>({id:r.id,version:r.version}),ops=[];
  for(const [i,a]of arrangements.entries()) {
    ops.push({type:'add-facility',id:a.id,parentId:a.roomId,name:a.table.displayName||a.table.id,resource:ref(a.table),transform:a.transform});
    ops.push({type:'add-facility',id:a.id+'/seat',parentId:a.roomId,name:'侧向接近座椅',resource:ref(seat),transform:composeTransform(a.transform,a.table.clearance.seat)});
    ops.push({type:'add-facility',id:a.id+'/clock',parentId:a.id,name:'台面钟',resource:ref(clock),attachment:{surfaceId:'top'},transform:{position:[.02,.78,-.15],yaw:0},state:{timeOffsetSeconds:i?7200:3600,on:true,brightness:i?.7:.4}});
    for(const [j,p]of props.slice(0,2).entries())ops.push({type:'add-facility',id:a.id+'/ornament-'+j,parentId:a.id,name:'陈列摆件',resource:ref(p),attachment:{surfaceId:'top'},transform:{position:[j?.22:-.20,.78,.08],yaw:0}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'vanity/primary',branch:'vanity-table',index,resource:ref(selected)};
}
