import {prepareCompanyChange,composeTransform} from './document.js';
import {createVanitySample} from './vanity-samples.js';

// The grounded side cabinet is a separate room facility. Its drawer owns the
// insert; the insert owns its compact. No implied attachment to the table.
export function createMakeupDrawerSample(catalog,templates,{index=0,alternate=false}={}) {
  const inserts=catalog.resources.filter(r=>r.mountRole==='makeup-storage-drawer');
  const selected=inserts[index],host=catalog.resources.find(r=>r.id==='makeup-drawer-host'&&r.version===1);
  const compact=catalog.resources.find(r=>r.id==='makeup-storage-content-compact'&&r.version===1);
  const clock=catalog.resources.find(r=>r.id==='digital-clock-shelf-flat'&&r.version===1);
  if(!selected||!host||!compact||!clock)throw Error('Drawer sample requires registered host, four inserts, compact and supported clock');
  let document=createVanitySample(catalog,templates,{alternate,id:alternate?'makeup-drawer-alternate':'appearance-makeup-storage-drawer'}).document;
  document.name=alternate?'抽屉内收纳 · 两房独立开合':'抽屉内收纳 · 真实容纳与随动';
  const tables=document.nodes.filter(n=>catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='vanity-table');
  const ref=r=>({id:r.id,version:r.version}),ops=[];
  for(const [i,table]of tables.entries()) {
    const id=i?'makeup-drawer/secondary':'makeup-drawer/primary',insert=inserts[(index+i)%inserts.length];
    ops.push({type:'add-facility',id,parentId:table.parentId,name:'化妆侧柜',resource:ref(host),
      transform:composeTransform(table.transform,{position:[1,0,-.35],yaw:0}),state:{openFraction:i?.25:1}});
    ops.push({type:'add-facility',id:id+'/insert',parentId:id,name:insert.displayName||insert.id,resource:ref(insert),
      attachment:{surfaceId:'drawer'},transform:{position:[0,.455,.03125],yaw:0}});
    ops.push({type:'add-facility',id:id+'/insert/content',parentId:id+'/insert',name:'随抽屉移动的小圆盒',resource:ref(compact),
      attachment:{surfaceId:'top'},transform:{position:[0,.01,-.045],yaw:0}});
    ops.push({type:'add-facility',id:id+'/top-clock',parentId:id,name:'柜顶固定钟',resource:ref(clock),
      attachment:{surfaceId:'top'},transform:{position:[0,.78,-.04],yaw:0},state:{timeOffsetSeconds:0,on:true,brightness:.4}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'makeup-drawer/primary',branch:'makeup-storage-drawer',index,resource:ref(selected)};
}
