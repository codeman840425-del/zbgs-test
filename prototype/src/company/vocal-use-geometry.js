import {Box3,Matrix4,Triangle,Vector3} from 'three';
import {pointInTransform} from './document.js';
import {overlapsObstacle} from './wardrobe-footprints.js';

// World axes remain aligned to the room and facility axes (quarter-turn layout contract).
// The same 1 mm contact allowance is used for the published door-to-stage route.
function sweep(point,end) {
  const a=pointInTransform(point.world,point.position), b=pointInTransform(point.world,end);
  const halfWidth=point.clearance.width/2-.001, halfDepth=point.clearance.depth/2-.001;
  return new Box3(new Vector3(Math.min(a[0],b[0])-halfWidth,a[1]+.001,Math.min(a[2],b[2])-halfDepth),
    new Vector3(Math.max(a[0],b[0])+halfWidth,a[1]+point.clearance.height-.001,Math.max(a[2],b[2])+halfDepth));
}

function meshHits(mesh,matrix,box) {
  const geometry=mesh.geometry;
  if(!geometry.boundingBox) geometry.computeBoundingBox();
  if(!geometry.boundingBox.clone().applyMatrix4(matrix).intersectsBox(box)) return false;
  const positions=geometry.getAttribute('position'), index=geometry.index, tri=new Triangle();
  const start=geometry.drawRange.start;
  const end=Math.min(index?.count??positions.count,start+geometry.drawRange.count);
  const vertex=(i,out)=>mesh.getVertexPosition(index?index.getX(i):i,out).applyMatrix4(matrix);
  for(let i=start;i+2<end;i+=3) {
    vertex(i,tri.a);vertex(i+1,tri.b);vertex(i+2,tri.c);
    if(box.intersectsTriangle(tri)) return true;
  }
  return false;
}

export function validateVocalUseGeometry(derived,facilities,fail) {
  for(const point of derived.usePoints) {
    if(point.kind!=='standing-vocal' || !facilities.has(point.facilityId)) continue;
    const mic=facilities.get(point.facilityId);
    const worldToLayout=new Matrix4().makeRotationY(mic.world.yaw).setPosition(...mic.world.position)
      .multiply(mic.root.matrixWorld.clone().invert());
    const segments=point.approach.every((value,i)=>value===point.exit[i]) ? ['approach'] : ['approach','exit'];
    const zones=segments.map(segment=>({segment,box:sweep(point,point[segment])}));
    const reject=(zone,id)=>fail('vocal-use-path-blocked',point.id,'The final route to the microphone is obstructed.',
      {segment:zone.segment,blockedBy:id});
    for(const zone of zones) {
      const {min,max}=zone.box;
      const area={min:[min.x,min.z],max:[max.x,max.z]};
      for(const obstacle of derived.obstacles) {
        if(obstacle.floorId===point.floorId && overlapsObstacle(area,obstacle)) reject(zone,obstacle.id);
      }
    }
    for(const item of facilities.values()) {
      if(item.floorId!==point.floorId) continue;
      item.visual.traverse(mesh=>{
        if(!mesh.isMesh) return;
        const matrix=worldToLayout.clone().multiply(mesh.matrixWorld);
        for(const zone of zones) if(meshHits(mesh,matrix,zone.box)) reject(zone,item.id);
      });
    }
  }
}
