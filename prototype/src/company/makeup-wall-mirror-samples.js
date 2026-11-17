import {prepareCompanyChange,composeTransform} from './document.js';
import {createVanitySample} from './vanity-samples.js';

// Wall mirrors belong to the room, independently of the table and its contents.
export function createMakeupWallMirrorSample(catalog,templates,{index=0,alternate=false}={}) {
  const mirrors=catalog.resources.filter(r=>r.mountRole==='makeup-mirror-wall'),selected=mirrors[index];
  if(!selected)throw Error('Wall makeup sample requires four registered wall mirror appearances');
  let document=createVanitySample(catalog,templates,{index,alternate,id:alternate?'makeup-wall-mirror-alternate':'appearance-makeup-mirror-wall'}).document;
  document.name=alternate?'挂墙化妆镜 · 两房不同朝向':'挂墙化妆镜 · 反射与补光';
  const tables=document.nodes.filter(n=>catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='vanity-table');
  const ops=[];
  for(const [i,table]of tables.entries()) {
    const resource=catalog.resources.find(r=>r.id===table.resource.id&&r.version===table.resource.version);
    const transform=i?{position:[2.75,0,.5],yaw:3*Math.PI/2}:{position:[-1,0,-1.875],yaw:0};
    const mirror=mirrors[(index+i)%mirrors.length],id=`makeup-wall/${i?'secondary':'primary'}`;
    ops.push({type:'move',id:table.id,transform});
    ops.push({type:'move',id:table.id+'/seat',transform:composeTransform(transform,resource.clearance.seat)});
    ops.push({type:'remove',id:table.id+'/clock'});
    // The second room's west wall contains its real doorway. Use the east wall.
    ops.push({type:'add-facility',id,parentId:table.parentId,resource:{id:mirror.id,version:mirror.version},
      transform:i?{position:[3.4,1.145,.5],yaw:3*Math.PI/2}:{position:[-1,1.145,-2.525],yaw:0},
      state:{on:!i,intensity:i?3:7}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  for(const node of document.nodes)if(node.resource) {
    const resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    if(resource?.mountRole==='makeup-mirror-wall')node.name=resource.displayName||resource.id;
  }
  return{document,target:'makeup-wall/primary',branch:'makeup-mirror-wall',index,resource:{id:selected.id,version:selected.version}};
}
