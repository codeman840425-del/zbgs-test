// Calibrated segmented contour candidate. Finite rails are NOT full-surface CCD.
export function createForearmContourWorkspace(THREE,profile) {
  const V=THREE.Vector3,knots=profile.extendedKnots||profile.knots;
  const rings=knots.map(()=>Array.from({length:8},()=>new V()));
  const rails=[];
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<8;i++)rails.push([rings[k][i],rings[k+1][i]]);
  for(const ring of [rings[0],rings.at(-1)])for(let i=0;i<4;i++)rails.push([ring[i],ring[i+4]]);
  return {axis:new V(),x:new V(),y:new V(),fallback:new V(),rings,rails};
}
export function forearmContourRails(THREE, start, end, profile, outward, workspace) {
  const w=workspace||createForearmContourWorkspace(THREE,profile);
  const axis=w.axis.copy(end).sub(start),length=axis.length(),scale=length/profile.length;
  axis.divideScalar(length);
  // Include the inward-most contour for this actual correction direction.
  const x=w.x.copy(outward).addScaledVector(axis,-outward.dot(axis));
  if(x.lengthSq()<1e-8)x.crossVectors(axis,Math.abs(axis.y)<.9?w.fallback.set(0,1,0):w.fallback.set(1,0,0));
  x.normalize();const y=w.y.crossVectors(axis,x).normalize();
  const knots=profile.extendedKnots||profile.knots,sectors=8,inflation=1/Math.cos(Math.PI/sectors);
  for(let k=0;k<knots.length;k++)for(let i=0;i<sectors;i++)w.rings[k][i].copy(start).addScaledVector(axis,knots[k].t*length).addScaledVector(x,Math.cos(i*2*Math.PI/sectors)*knots[k].radius*scale*inflation).addScaledVector(y,Math.sin(i*2*Math.PI/sectors)*knots[k].radius*scale*inflation);
  return w.rails;
}
