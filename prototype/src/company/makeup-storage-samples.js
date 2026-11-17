import {prepareCompanyChange} from './document.js';
import {createMakeupMirrorSample} from './makeup-mirror-samples.js';

// Storage shares the delivered vanity/mirror layout and keeps separate saved contents.
export function createMakeupStorageSample(catalog,templates,{index=0,alternate=false}={}) {
  const storage=catalog.resources.filter(r=>r.mountRole==='makeup-storage');
  const selected=storage[index],content=catalog.resources.find(r=>r.id==='makeup-storage-content-compact'&&r.version===1);
  if(!selected||!content)throw Error(`Missing registered makeup storage/content ${index}`);
  let document=createMakeupMirrorSample(catalog,templates,{alternate,id:alternate?'makeup-storage-alternate':'appearance-makeup-storage'}).document;
  document.name=alternate?'化妆收纳 · 两房转向与独立内容':'化妆收纳 · 开合与内部小物';
  const ref=r=>({id:r.id,version:r.version}),ops=[];
  const tables=document.nodes.filter(n=>catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='vanity-table');
  for(const [i,table]of tables.entries()) {
    for(const j of [0,1])ops.push({type:'move',id:table.id+'/ornament-'+j,transform:{position:[j?.335:-.295,.78,.08],yaw:0}});
    const id=table.id+'/storage',resource=storage[(index+i)%storage.length];
    ops.push({type:'add-facility',id,parentId:table.id,resource:ref(resource),attachment:{surfaceId:'top'},
      transform:{position:[.02,.78,.075],yaw:0},state:{openFraction:i?.25:.65}});
    ops.push({type:'add-facility',id:id+'/content',parentId:id,resource:ref(content),attachment:{surfaceId:'drawer'},
      transform:{position:[0,.022,-.005],yaw:0}});
    ops.push({type:'add-facility',id:id+'/top-content',parentId:id,resource:ref(content),attachment:{surfaceId:'top'},
      transform:{position:[0,.100,-.045],yaw:0}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return{document,target:'vanity/primary/storage',branch:'makeup-storage',index,resource:ref(selected)};
}
