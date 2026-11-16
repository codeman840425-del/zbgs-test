import {createCompany, prepareCompanyChange, identityTransform} from './document.js';

// Two inputs share the same support contracts, authoring and rendering path.
export function createSupportSample(catalog, templates, {index=0, alternate=false, branch='storage-shelf'}={}) {
  const shelves=catalog.resources.filter(r=>r.mountRole==='storage-shelf');
  const props=catalog.resources.filter(r=>r.mountRole==='tabletop-ornament');
  if(shelves.length<4||props.length<4)throw Error('Support samples require four registered shelves and props');
  const shelf=shelves[branch==='storage-shelf'?index:0],prop=props[branch==='tabletop-ornament'?index:0];
  if(!shelf||!prop)throw Error('Unsupported support sample index');
  let document=createCompany({id:alternate?'support-alternate':`appearance-${branch}`,name:alternate?'多层承载 · 转向布局':'多层承载 · 陈列与工位',width:alternate?7:6,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],assembly='support/display',parent='support/shelf';
  room.entry={position:[2.4,0,1.9]};
  const ref=r=>({id:r.id,version:r.version});
  const ops=[{type:'add-workstation',id:'support/station',parentId:room.id,template:{id:'stream-station',version:1},transform:{position:[-1.4,0,0],yaw:0}},
    {type:'add-facility',id:parent,parentId:room.id,resource:ref(shelf),transform:{position:alternate?[1.7,0,-.4]:[1.35,0,-1.7],yaw:alternate?Math.PI/2:0}}];
  for(const [i,surface]of shelf.supportSurfaces.entries())for(const side of [-1,1]) {
    const selected=branch==='tabletop-ornament'?prop:props[(i+(side===1?1:0))%props.length];
    ops.push({type:'add-facility',id:`support/prop-${surface.id}-${side===1?'right':'left'}`,parentId:parent,resource:ref(selected),
      attachment:{surfaceId:surface.id},transform:{position:[side*.23,surface.topY,0],yaw:0}});
  }
  document=prepareCompanyChange(document,ops,{catalog,templates}).document;
  document=prepareCompanyChange(document,[{type:'group-facilities',id:assembly,parentId:room.id,memberIds:[parent],transform:identityTransform()}],{catalog,templates}).document;
  return{document,target:branch==='tabletop-ornament'?'support/prop-middle-left':parent,branch,index,
    resource:ref(branch==='tabletop-ornament'?prop:shelf),floorId:floor.id,roomId:room.id};
}
