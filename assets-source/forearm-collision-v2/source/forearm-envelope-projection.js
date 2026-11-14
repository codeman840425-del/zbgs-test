// Optional calibrated forearm narrow phase. Pure geometry; no animation state.
// Circumscribed polygonal frusta/caps bound the measured circular envelope.
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const norm=a=>mul(a,1/length(a));

function sphereTemplate() {
  const rings=8,sectors=12,verts=[];
  for(let j=0;j<=rings;j++) for(let i=0;i<sectors;i++) {
    const v=Math.PI*j/rings,u=2*Math.PI*i/sectors;
    verts.push([Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)]);
  }
  const faces=[];
  for(let j=0;j<rings;j++)for(let i=0;i<sectors;i++){
    const a=j*sectors+i,b=j*sectors+(i+1)%sectors,c=(j+1)*sectors+i,d=(j+1)*sectors+(i+1)%sectors;
    if(j>0)faces.push([verts[a],verts[c],verts[b]]);
    if(j<rings-1)faces.push([verts[b],verts[c],verts[d]]);
  }
  let minPlane=1;
  for(const [a,b,c]of faces)minPlane=Math.min(minPlane,Math.abs(dot(norm(cross(sub(b,a),sub(c,a))),a)));
  // Scaling every plane to >= radius makes the convex polyhedron contain sphere.
  return {faces:faces.map(f=>f.map(p=>mul(p,1/minPlane))),inflation:1/minPlane};
}
const sphere=sphereTemplate();
export const envelopeApproximation={sectors:12,sphereRadialInflation:sphere.inflation,frustumRadialInflation:1/Math.cos(Math.PI/12)};

export function validateForearmProfile(bundle,bodySHA) {
  if(!bundle || bundle.schema!=='m1.semantic-forearm-envelope.1' || !bodySHA || bundle.bodySHA256!==bodySHA) return false;
  return ['left','right'].every(side=>{
    const p=bundle.profiles?.find(p=>p.side===side);
    return p && p.length>0 && p.knots?.length>=2 && p.knots[0].t===0 && p.knots.at(-1).t===1 &&
      p.knots.every((k,i)=>Number.isFinite(k.radius)&&k.radius>0&&Number.isFinite(k.t)&&(!i||k.t>p.knots[i-1].t)) &&
      [p.elbowCap?.radius,p.wristCap?.radius].every(r=>Number.isFinite(r)&&r>0) &&
      (!p.extendedKnots || (p.extendedKnots.length>=2 && p.extendedKnots[0].t<=0 && p.extendedKnots.at(-1).t>=1 &&
        p.extendedKnots.every((k,i)=>Number.isFinite(k.t)&&Number.isFinite(k.radius)&&k.radius>0&&(!i||k.t>p.extendedKnots[i-1].t))));
  });
}

export function forearmEnvelopeTriangles(start,end,profile) {
  const delta=sub(end,start),scale=length(delta)/profile.length,axis=norm(delta);
  const rx=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),ry=cross(axis,rx);
  const ring=k=>Array.from({length:12},(_,i)=>add(add(start,mul(delta,k.t)),mul(add(mul(rx,Math.cos(i*Math.PI/6)),mul(ry,Math.sin(i*Math.PI/6))),k.radius*scale*envelopeApproximation.frustumRadialInflation)));
  const rings=profile.knots.map(ring),faces=[];
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<12;i++){
    const n=(i+1)%12;
    faces.push([rings[k][i],rings[k+1][i],rings[k][n]],[rings[k][n],rings[k+1][i],rings[k+1][n]]);
  }
  for(const [center,radius]of [[start,profile.elbowCap.radius],[end,profile.wristCap.radius]])
    faces.push(...sphere.faces.map(f=>f.map(p=>add(center,mul(p,radius*scale)))));
  // Explicit end discs close the frusta even when a measured end sphere is smaller.
  for(let i=0;i<12;i++)faces.push([start,rings[0][i],rings[0][(i+1)%12]],[end,rings.at(-1)[i],rings.at(-1)[(i+1)%12]]);
  return faces;
}

function area(a,b,c){return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function overlap(subject,clip) {
  let poly=subject.map(p=>p.slice());const winding=Math.sign(area(...clip));
  if(!winding)return [];
  for(let j=0;j<3&&poly.length;j++){
    const a=clip[j],b=clip[(j+1)%3],next=[];
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],dp=area(a,b,p)*winding,dq=area(a,b,q)*winding;
      if(dp>=-1e-12)next.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    poly=next;
  }
  return poly;
}
function barycentric(p,t){const den=area(...t);return[area(p,t[1],t[2])/den,area(t[0],p,t[2])/den,area(t[0],t[1],p)/den];}

/** Exact overlap extrema for opaque planar faces of the conservative envelope.
 * select(projectedBounds) reuses fitSeatHands' garment grid. Candidate.points
 * are arrays and candidate.projected=[u0,v0,...]. opaque receives its actual
 * 3D hit for existing alpha-mask sampling. Alpha remains sampled, not exact CCD.
 */
export function directionalEnvelopeClearance(faces,basis,select,opaque=()=>true,margin=.008) {
  let amount=0,pairs=0;const {u,v,outward}=basis;
  for(const face of faces){
    const f=face.map(p=>[dot(p,u),dot(p,v)]);if(Math.abs(area(...f))<1e-12)continue;
    const bounds=[Math.min(...f.map(p=>p[0])),Math.min(...f.map(p=>p[1])),Math.max(...f.map(p=>p[0])),Math.max(...f.map(p=>p[1]))];
    for(const tri of select(bounds)){
      const t=[tri.projected.slice(0,2),tri.projected.slice(2,4),tri.projected.slice(4,6)];if(Math.abs(area(...t))<1e-12)continue;
      const polygon=overlap(t,f);if(!polygon.length)continue;pairs++;
      // Add centroid only for alpha mask coverage; opaque extrema are vertices.
      const sample=[...polygon,polygon.reduce((s,p)=>[s[0]+p[0]/polygon.length,s[1]+p[1]/polygon.length],[0,0])];
      for(const p of sample){
        const tb=barycentric(p,t),fb=barycentric(p,f),hit=tri.points[0].map((_,i)=>tri.points.reduce((s,q,j)=>s+q[i]*tb[j],0));
        if(!opaque(tri,hit))continue;
        const depth=dot(hit,outward)-face.reduce((s,q,j)=>s+dot(q,outward)*fb[j],0);
        if(depth>-margin&&depth<.3)amount=Math.max(amount,depth+margin);
      }
    }
  }
  return {amount,pairs};
}
