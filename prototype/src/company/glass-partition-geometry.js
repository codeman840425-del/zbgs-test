// Independent of node names: inspect visible triangles, material response and both actual bearing surfaces.
export function inspectGlassPartitionModel(scene, resource, THREE, fail) {
  const {Vector3, Matrix4, Box3, Ray} = THREE;
  const epsilon = .0005;
  const bad = reason => {
    if (fail) fail('glass-partition-geometry', resource.id, reason);
    throw new Error('glass-partition-geometry: ' + reason);
  };
  const near = (a,b) => Math.abs(a-b) <= epsilon;
  const vector = (x=0,y=0,z=0) => new Vector3(x,y,z);
  const q = n => Number(n.toFixed(6));
  const modelBounds = new Box3(), faces = [], panes = new Map();
  scene.updateWorldMatrix(true,true);
  const inverse = scene.matrixWorld.clone().invert();
  scene.traverseVisible(object => {
    if (!object.isMesh) return;
    const transform = new Matrix4().multiplyMatrices(inverse,object.matrixWorld);
    const geometry = object.geometry, indices = geometry.index;
    const count = indices?.count ?? geometry.attributes.position.count;
    const start = geometry.drawRange.start, end = Math.min(count,start+geometry.drawRange.count);
    for (let i=start; i+2<end; i+=3) {
      const group = Array.isArray(object.material) && geometry.groups.find(g=>i>=g.start && i<g.start+g.count);
      const material = Array.isArray(object.material) ? object.material[group?.materialIndex] : object.material;
      if (!material || !material.visible || material.opacity===0) continue;
      const pts = [0,1,2].map(k=>object.getVertexPosition(indices?indices.getX(i+k):i+k,vector()).applyMatrix4(transform));
      const glass = material.transparent && material.opacity>0 && material.opacity<1;
      const role=object.userData.glazingRole;
      if (glass && (Array.isArray(object.material) || role!==(resource.glassPartition?.construction==='frosted'?'privacy':'pane'))) bad('Glazing needs an explicit optical role and a single transparent material.');
      if (!glass && ['privacy','privacy-band','pane'].includes(role)) bad('An opaque structural face is labelled as vision glazing.');
      faces.push({pts,glass,object});
      for (const p of pts) modelBounds.expandByPoint(p);
      if (glass) {
        // Each solid pane has its own two edges, thickness and continuous support.
        const pane = panes.get(object) ?? {faces:[],bounds:new Box3(),material};
        pane.faces.push(pts);
        for (const p of pts) pane.bounds.expandByPoint(p);
        panes.set(object,pane);
      }
    }
  });
  const expected = [[-1.2,0,-.04],[1.2,2.8,.04]];
  const bounds = [modelBounds.min.toArray(),modelBounds.max.toArray()];
  if (!bounds.every((row,i)=>row.every((n,j)=>near(n,expected[i][j])))) bad('Expected centred 2.40 × 2.80 × 0.08 m with real contact plates.');
  if (!panes.size) bad('No visible alpha-blended pane.');
  const translucent = faces.filter(f=>f.glass), opaque = faces.filter(f=>!f.glass);
  const ray = new Ray(), intersection = vector();
  function hits(list,origin,dir) {
    ray.set(origin,dir);
    const result = [];
    for (const {pts} of list) if (ray.intersectTriangle(...pts,false,intersection)) result.push(intersection.clone());
    return result.sort((a,b)=>a.distanceToSquared(origin)-b.distanceToSquared(origin));
  }
  const up=vector(0,1,0),down=vector(0,-1,0),front=vector(0,0,1);
  let anchorSamples = 0;
  for (const x of [-1.16,-.6,0,.6,1.16]) for (const z of [-.03,0,.03]) {
    const lo=hits(opaque,vector(x,-.1,z),up)[0],hi=hits(opaque,vector(x,2.9,z),down)[0];
    if (!lo || !hi || !near(lo.y,0) || !near(hi.y,2.8)) bad('Missing a floor or ceiling bearing at x/z '+x+'/'+z);
    // The backing plate has a physical cross-section outside the narrower glass channel.
    if (z!==0) {
      const a=hits(opaque,vector(x,.06,z),down)[0],b=hits(opaque,vector(x,2.74,z),up)[0];
      if (!a||!b||a.y<=epsilon||a.y>.06||2.8-b.y<=epsilon||2.8-b.y>.06) bad('Contact plate has no finite thickness.');
    }
    anchorSamples++;
  }
  const measured = [];
  for (const [owner,pane] of panes) {
    const b=pane.bounds, center=b.getCenter(vector()), size=b.getSize(vector());
    if (size.z<.004 || size.x<.1 || size.y<.1) bad('A glazing sheet lacks solid thickness or a usable face.');
    // Closed triangle edges are measured after welding duplicate normals/UV seams.
    const edges=new Map(),ref=b.min;let signedVolume=0;
    for (const pts of pane.faces) {
      const ids=pts.map(p=>p.toArray().map(n=>Math.round(n*1e6)).join(','));
      for (let i=0;i<3;i++) {
        const a=ids[i],c=ids[(i+1)%3];if(a===c) continue;
        const key=a<c?a+'|'+c:c+'|'+a;
        edges.set(key,(edges.get(key)??0)+(a<c?1:-1));
      }
      signedVolume+=pts[0].clone().sub(ref).dot(pts[1].clone().sub(ref).cross(pts[2].clone().sub(ref)))/6;
    }
    if ([...edges.values()].some(n=>n!==0) || Math.abs(signedVolume)<.000001) bad('Glass pane is open or flat.');
    for (const fx of [.18,.5,.82]) {
      const x=b.min.x+fx*size.x;
      const lower=hits(opaque,vector(x,b.min.y+.001,center.z),down)[0], upper=hits(opaque,vector(x,b.max.y-.001,center.z),up)[0];
      if (!lower || !upper || !near(lower.y,b.min.y) || !near(upper.y,b.max.y)) bad('Glazing edge misses its lower or upper structural member.');
      for (const fy of [.26,.61,.83]) {
        const from=vector(x,b.min.y+fy*size.y,-.05);
        const both=hits(translucent.filter(f=>f.object===owner),from,front);
        if (both.length<2 || !near(both[0].z,b.min.z) || !near(both.at(-1).z,b.max.z) || hits(opaque,from,front).length) bad('A real clear aperture is missing or backed by an opaque object.');
      }
    }
    measured.push({centre:[q(center.x),q(center.y)],width:q(size.x),height:q(size.y),thickness:q(size.z),opacity:q(pane.material.opacity),roughness:q(pane.material.roughness)});
  }
  // Detect a removed pane without treating a gap as light transmission.
  let open=0,framing=0;
  for (let i=0;i<23;i++) for (let j=0;j<19;j++) {
    const origin=vector(-1.19+i*2.38/22,.06+j*2.68/18,-.08);
    if (hits(opaque,origin,front).length) framing++;
    else if (hits(translucent,origin,front).length>=2) open++;
    else bad('Unfilled opening in the installed partition.');
  }
  if (open<=framing) bad('Opaque structure blocks most of the glass surface.');
  return {triangles:faces.length,bounds:bounds.map(row=>row.map(q)),panes:measured.length,measured,anchorSamples,apertureRays:{glazed:open,framing}};
}
