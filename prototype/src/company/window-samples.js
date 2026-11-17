import {createCompany,deriveCompany} from './document.js';

/** Two connected rooms on each of two floors; same resources, distinct layouts. */
export function createWindowSample(catalog,templates,{index=0,alternate=false}={}){
  const resources=catalog.resources.filter(r=>r.mountRole==='window-opening-and-glass');
  if(resources.length!==4||!resources[index])throw Error('Window sample requires four registered compatible windows');
  const id=alternate?'window-opening-alternate':'window-opening-company';
  const document=createCompany({id,name:alternate?'窗体 · 转向与共享墙':'窗体 · 四款与真实洞口',width:6,depth:5},catalog);
  document.scale='building';document.nodes=[];
  for(let level=0;level<2;level++){
    const floor=`${id}/floor-${level+1}`,room=`${floor}/live`,neighbor=`${floor}/work`;
    const floorTransform={position:[0,0,0],yaw:alternate&&level===1?Math.PI/2:0};
    document.nodes.push({id:floor,kind:'floor',parentId:id,name:`${level+1}层`,transform:floorTransform,connections:[{id:`${floor}/door`,from:{regionId:room,edge:'east',offset:-1.5,width:1.2},to:{regionId:neighbor,edge:'west',offset:-1.5,width:1.2}}]},
      {id:room,kind:'room',parentId:floor,name:'窗体展示间',purpose:'streaming',bounds:{width:6,depth:5},transform:{position:[-3,0,0],yaw:0}},
      {id:neighbor,kind:'room',parentId:floor,name:'相邻房间',purpose:'work',bounds:{width:6,depth:5},transform:{position:[3,0,0],yaw:0}});
    const positions=[{position:[alternate?1.2:-1.2,1.5,-2.4],yaw:0},{position:[-2.9,1.5,0],yaw:Math.PI/2},{position:[alternate?-1.2:1.2,1.5,2.4],yaw:Math.PI},{position:[2.9,1.5,1],yaw:Math.PI*1.5}];
    for(let i=0;i<4;i++){
      const resource=resources[i===0?index:i];
      document.nodes.push({id:`${room}/window-${i+1}`,kind:'facility',parentId:room,resource:{id:resource.id,version:resource.version},transform:positions[i],state:{openFraction:level===0?[0,.5,1,0][i]:[1,0,.5,1][i]}});
    }
    const plant=catalog.resources.find(r=>r.id==='plant');
    if(plant)document.nodes.push({id:`${neighbor}/plant`,kind:'facility',parentId:neighbor,resource:{id:plant.id,version:plant.version},transform:{position:[-1.5,0,1],yaw:0}});
    const wall=catalog.resources.find(r=>r.kind==='surface-finish'&&r.finish.allowedSurfaces.includes('wall'));
    if(wall)document.nodes.find(n=>n.id===room).finishes={north:{resource:{id:wall.id,version:wall.version},quarterTurns:0}};
  }
  deriveCompany(document,catalog,templates);
  return{document,target:`${id}/floor-1/live/window-1`,branch:'window-opening-and-glass',index,resource:{id:resources[index].id,version:resources[index].version}};
}
