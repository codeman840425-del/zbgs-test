// Convex XZ pieces for a rigid Y hinge. The navigation adapter reads one
// world AABB per piece; precise facility collisions use their convex boundaries.
const epsilon=1e-8;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points){
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=values=>{
    const out=[];
    for(const p of values){
      while(out.length>=2 && cross(out.at(-2),out.at(-1),p)<=0)out.pop();
      out.push(p);
    }
    return out.slice(0,-1);
  };
  return [...half(sorted),...half([...sorted].reverse())];
}
function rectangle(x0,x1,z0,z1){return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];}
function rotate(x,z,angle,pivot,scale=1){
  const c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
  return [pivot[0]+c*x+s*z,pivot[2]-s*x+c*z];
}
export function wardrobeFootprints(resource,state,endState=state){
  const result=[{...resource.footprint,partId:'body'}];
  for(const p of resource.movingParts){
    const a=p.rotationRange[1]*state[p.stateField],b=p.rotationRange[1]*endState[p.stateField];
    const moving=a!==b;
    // Split a diagonal leaf longitudinally for rectangular navigation consumers.
    const strips=!moving && Math.abs(Math.sin(2*a))>1e-8 ? 8 : 1;
    const intervals=Math.max(1,Math.ceil(Math.abs(b-a)/(Math.PI/16)));
    for(let i=0;i<strips;i++){
      const x0=p.bounds.min[0],span=p.bounds.max[0]-x0;
      const corners=rectangle(x0+span*i/strips,x0+span*(i+1)/strips,p.bounds.min[2],p.bounds.max[2]);
      for(let j=0;j<intervals;j++){
        const start=a+(b-a)*j/intervals,stop=a+(b-a)*(j+1)/intervals;
        const points=corners.map(([x,z])=>rotate(x,z,start,p.pivot));
        if(moving){
          // Each small arc lies inside its two endpoints and the intersection of
          // the endpoint tangents. Maximum corner overreach <0.1 mm at radius .468 m.
          const steps=Math.ceil(Math.abs(stop-start)/.04);
          for(let k=0;k<steps;k++){
            const t=start+(stop-start)*k/steps,u=start+(stop-start)*(k+1)/steps;
            for(const [x,z] of corners)points.push(rotate(x,z,(t+u)/2,p.pivot,1/Math.cos((u-t)/2)),rotate(x,z,u,p.pivot));
          }
        }
        const polygon=moving?hull(points):points;
        const xs=polygon.map(q=>q[0]),zs=polygon.map(q=>q[1]);
        const min=[Math.min(...xs),Math.min(...zs)],max=[Math.max(...xs),Math.max(...zs)];
        result.push({partId:p.id,blocking:true,polygon,center:min.map((v,k)=>(max[k]+v)/2),halfSize:min.map((v,k)=>(max[k]-v)/2)});
      }
    }
  }
  return result;
}
export function overlapsObstacle(a,b,tolerance=epsilon){
  if(!a.min.every((m,i)=>m<b.max[i]-tolerance&&a.max[i]>b.min[i]+tolerance))return false;
  if(!a.polygon&&!b.polygon)return true;
  const outline=o=>o.polygon??rectangle(o.min[0],o.max[0],o.min[1],o.max[1]);
  const aa=outline(a),bb=outline(b);
  for(const poly of [aa,bb])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dz=q[1]-p[1];
    const len=Math.hypot(dx,dz);if(!len)continue;
    const project=v=>(v[0]*dz-v[1]*dx)/len;
    const ap=aa.map(project),bp=bb.map(project);
    if(Math.max(...ap)<=Math.min(...bp)+tolerance||Math.max(...bp)<=Math.min(...ap)+tolerance)return false;
  }
  return true;
}
