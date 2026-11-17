import {createCompany,prepareCompanyChange} from './document.js';
import {WALL_SHELF_IDS} from './wall-shelf-data.js';

export function createWallShelfSample(catalog,templates,{index=0,alternate=false}={}) {
  const shelf=catalog.resources.find(r=>r.id===WALL_SHELF_IDS[index]&&r.version===1);
  const props=['cup','bottle','tissue','pen-notebook'].map(id=>catalog.resources.find(r=>r.id===`side-table-life-${id}`&&r.version===1));
  if(!shelf||props.some(r=>!r))throw Error('Wall-shelf sample requires registered shelves and supported life items');
  let document=createCompany({id:alternate?'wall-shelf-alternate':'wall-shelf-demo',name:alternate?'墙装壁架 · 侧墙布置':'墙装壁架 · 四款与多层承载',width:7,depth:5.25},catalog);
  const floor=document.nodes[0],room=document.nodes[1],target='wall-shelf/primary',ref=r=>({id:r.id,version:r.version});
  const childSpecs=[['cup','lower',-.18,.35],['bottle','lower',.18,.35],['tissue','middle',0,.95],['pen-notebook','top',0,1.55]];
  document=prepareCompanyChange(document,[
    {type:'add-facility',id:target,parentId:room.id,name:shelf.displayName||shelf.id,resource:ref(shelf),transform:{position:alternate?[3.4,.35,.4]:[-.8,.35,-2.525],yaw:alternate?Math.PI*1.5:0}},
    ...childSpecs.map(([name,surfaceId,x,y],i)=>({type:'add-facility',id:`wall-shelf/${name}`,parentId:target,name:props[i].displayName||props[i].id,
      resource:ref(props[i]),attachment:{surfaceId},transform:{position:[x,y,.19],yaw:0}})),
  ],{catalog,templates}).document;
  return{document,target,branch:'wall-shelf',index,resource:ref(shelf),floorId:floor.id,roomId:room.id};
}
