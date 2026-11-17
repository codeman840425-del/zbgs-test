import {prepareCompanyChange} from './document.js';
import {createVanitySample} from './vanity-samples.js';

// Reuse the real table/support/chair layout; mirror and clock cannot share the rear patch.
export function createMakeupMirrorSample(catalog,templates,{index=0,alternate=false,id}={}) {
  const mirrors=catalog.resources.filter(r=>r.mountRole==='makeup-mirror');
  const selected=mirrors[index];
  if(!selected)throw Error(`Missing registered makeup mirror ${index}`);
  const original=createVanitySample(catalog,templates,{index,alternate,id:id??(alternate?'makeup-mirror-alternate':'appearance-makeup-mirror')});
  let document=structuredClone(original.document);
  document.name=alternate?'化妆镜 · 两房转向与补光':'化妆镜 · 台面反射与补光';
  const ops=[];
  for(const [i,table]of document.nodes.filter(n=>catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='vanity-table').entries()) {
    const mirror=mirrors[(index+i)%mirrors.length];
    ops.push({type:'remove',id:table.id+'/clock'});
    ops.push({type:'add-facility',id:table.id+'/mirror',parentId:table.id,name:mirror.displayName||mirror.id,
      resource:{id:mirror.id,version:mirror.version},attachment:{surfaceId:'top'},transform:{position:[.02,.78,-.135],yaw:0},
      state:{on:i===0,intensity:i?3:7}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  return {document,target:'vanity/primary/mirror',branch:'makeup-mirror',index,resource:{id:selected.id,version:selected.version}};
}
