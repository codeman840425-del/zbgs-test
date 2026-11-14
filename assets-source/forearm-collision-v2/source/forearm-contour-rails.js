// Calibrated segmented contour candidate. Finite rails are NOT full-surface CCD.
export function forearmContourRails(THREE, start, end, profile, outward) {
  const V=THREE.Vector3,axis=end.clone().sub(start),length=axis.length(),scale=length/profile.length;
  axis.divideScalar(length);
  // Include the inward-most contour for this actual correction direction.
  const x=outward.clone().addScaledVector(axis,-outward.dot(axis));
  if(x.lengthSq()<1e-8)x.crossVectors(axis,Math.abs(axis.y)<.9?new V(0,1,0):new V(1,0,0));
  x.normalize();const y=new V().crossVectors(axis,x).normalize();
  const knots=profile.extendedKnots||profile.knots,sectors=8,inflation=1/Math.cos(Math.PI/sectors);
  const rings=knots.map(k=>Array.from({length:sectors},(_,i)=>start.clone().addScaledVector(axis,k.t*length).addScaledVector(x,Math.cos(i*2*Math.PI/sectors)*k.radius*scale*inflation).addScaledVector(y,Math.sin(i*2*Math.PI/sectors)*k.radius*scale*inflation)));
  const rails=[];
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<sectors;i++)rails.push([rings[k][i],rings[k+1][i]]);
  // Cover endpoint planes without applying a large sphere along the whole arm.
  for(const ring of [rings[0],rings.at(-1)])for(let i=0;i<sectors/2;i++)rails.push([ring[i],ring[i+sectors/2]]);
  return rails;
}
