import {deriveCompany,pointInTransform} from './document.js';
import {cutWallForWindows} from './window-wall-slices.js';
import {inspectCompanyConnections} from './space.js';

// Physical boundaries are data. Cutaway heights and visibility never alter them.
export function describeArchitecture(document,catalog,templates) {
  const derived=deriveCompany(document,catalog,templates);
  const topology=inspectCompanyConnections(document,catalog,templates),walls=[];
  for(const floor of topology.floors)for(const regionId of floor.regionIds) {
    const region=derived.nodes.get(regionId),world=derived.worlds.get(regionId);
    const portals=floor.connections.flatMap(connection=>[connection.from,connection.to]).filter(p=>p.regionId===regionId);
    for(const edge of ['north','south','west','east']) {
      const horizontal=edge==='north'||edge==='south',span=horizontal?region.bounds.width:region.bounds.depth;
      const intervals=portals.filter(p=>p.edge===edge).map(p=>[p.offset-p.width/2,p.offset+p.width/2]).sort((a,b)=>a[0]-b[0]);
      let from=-span/2,index=0;
      for(const [to,next]of [...intervals,[span/2,span/2]]) {
        if(to-from>1e-7) {
          const position=horizontal?[(from+to)/2,1.4,(edge==='north'?-1:1)*(region.bounds.depth/2-.05)]:[(edge==='west'?-1:1)*(region.bounds.width/2-.05),1.4,(from+to)/2];
          const size=horizontal?[to-from,2.8,.1]:[.1,2.8,to-from];
          const center=pointInTransform(world,position),rotated=Math.abs(Math.sin(world.yaw))>.5;
          const halfSize=rotated?[size[2]/2,size[0]/2]:[size[0]/2,size[2]/2];
          walls.push({id:`${regionId}/wall-${edge}-${index++}`,floorId:floor.floorId,regionId,edge,position,size,center,halfSize});
        }
        from=next;
      }
    }
  }
  const physicalWalls=walls.flatMap(wall=>{
    const axis=['north','south'].includes(wall.edge)?0:2;
    const openings=[...derived.windowOpenings.values()].flatMap(o=>o.regions).filter(o=>o.regionId===wall.regionId&&o.edge===wall.edge&&Math.abs(o.offset-wall.position[axis])<(wall.size[axis]+o.width)/2-1e-6);
    return cutWallForWindows(wall,openings,derived.worlds.get(wall.regionId));
  });
  return {topology,walls:physicalWalls,navigationWalls:walls,visibilityWalls:walls};
}
