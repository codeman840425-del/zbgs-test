// Triangle cohesion and embedded solid fittings use the same tests as the movable screen.
const tolerance=.001;

function physicalIslands(faces,{Vector3,Box3,Triangle}) {
  // Weld geometric seams across UV splits, primitives and draw calls. A GLB mesh
  // can also contain several unrelated pieces, so its node is not a connection.
  const parent=faces.map((_,i)=>i), vertexIds=new Map(), firstFace=[];
  function root(i) {
    while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}
    return i;
  }
  function vertexId(p){
    const key=[p.x,p.y,p.z].map(x=>Math.round(x*1e6)).join(',');
    if(!vertexIds.has(key)) vertexIds.set(key,vertexIds.size);
    return vertexIds.get(key);
  }
  for(const [i,f] of faces.entries()){
    f.corners=[f.a,f.b,f.c];
    f.indices=f.corners.map(vertexId);
    for(const j of f.indices){
      if(firstFace[j]===undefined)firstFace[j]=i;
      else parent[root(i)]=root(firstFace[j]);
    }
  }
  const byRoot=new Map();
  for(const [i,f] of faces.entries()){
    const id=root(i);
    if(!byRoot.has(id))byRoot.set(id,{faces:[],bounds:new Box3(),edges:new Map(),volume6:0,origin:f.a});
    const piece=byRoot.get(id);
    f.triangle=new Triangle(f.a,f.b,f.c);
    f.box=new Box3().setFromPoints(f.corners).expandByScalar(tolerance/2);
    f.piece=piece;piece.faces.push(f);
    for(const [k,p] of f.corners.entries()){
      piece.bounds.expandByPoint(p);
      const i0=f.indices[k],i1=f.indices[(k+1)%3],key=Math.min(i0,i1)+','+Math.max(i0,i1);
      piece.edges.set(key,(piece.edges.get(key)??0)+(i0<i1?1:-1));
    }
    // The local reference prevents isolated flat pictures from gaining volume
    // simply because they were modelled far from the GLB origin.
    const a=new Vector3().subVectors(f.a,piece.origin),b=new Vector3().subVectors(f.b,piece.origin),c=new Vector3().subVectors(f.c,piece.origin);
    piece.volume6+=a.dot(b.cross(c));
  }
  for(const piece of byRoot.values()){
    piece.solid=Math.abs(piece.volume6)>1e-12 && [...piece.edges.values()].every(n=>n===0);
    piece.bounds.expandByScalar(tolerance/2);
  }
  return [...byRoot.values()];
}

function touching(a,b,{Vector3,Ray}) {
  if(!a.bounds.intersectsBox(b.bounds))return false;
  const ray=new Ray(),hit=new Vector3(),near=new Vector3(),limit=tolerance*tolerance;
  function crosses(s,t){
    for(let i=0;i<3;i++){
      const p=s.corners[i],q=s.corners[(i+1)%3];
      if(t.triangle.closestPointToPoint(p,hit).distanceToSquared(p)<=limit)return true;
      ray.origin.copy(p);ray.direction.subVectors(q,p).normalize();
      const length=p.distanceToSquared(q);
      if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)&&hit.distanceToSquared(p)<=length)return true;
      for(let j=0;j<3;j++){
        if(ray.distanceSqToSegment(t.corners[j],t.corners[(j+1)%3],near)<=limit && near.distanceToSquared(p)<=length)return true;
      }
    }
    return false;
  }
  for(const f of a.faces){
    if(!f.box.intersectsBox(b.bounds))continue;
    for(const g of b.faces)if(f.box.intersectsBox(g.box) && (crosses(f,g)||crosses(g,f)))return true;
  }
  // A fitting may be completely embedded in a solid without their boundary
  // triangles crossing. Generalised winding number also works for concave shells.
  function contains(shell,p){
    if(!shell.solid||!shell.bounds.containsPoint(p))return false;
    const u=new Vector3(),v=new Vector3(),w=new Vector3(),cross=new Vector3();let angle=0;
    for(const f of shell.faces){
      u.subVectors(f.a,p);v.subVectors(f.b,p);w.subVectors(f.c,p);
      const l=u.length(),m=v.length(),n=w.length();
      angle+=2*Math.atan2(u.dot(cross.crossVectors(v,w)),l*m*n+u.dot(v)*n+v.dot(w)*l+w.dot(u)*m);
    }
    return Math.abs(angle)>2*Math.PI;
  }
  return contains(a,b.faces[0].a)||contains(b,a.faces[0].a);
}

function connectedAssembly(pieces,T){
  const connected=new Set([pieces[0]]);
  for(const piece of connected){
    for(const other of pieces)if(!connected.has(other)&&touching(piece,other,T))connected.add(other);
  }
  return connected.size;
}

// A rectangle can cross a triangle seam. Test the union of horizontal triangle
// slices between every change of edge order, so overlapping triangles cannot hide a hole.
function coversRectangle(faces,axis,zone){
  const along=axis==='x'?'z':'x',lo=zone.along[0],hi=zone.along[1],[bottom,top]=zone.y;
  const edges=[],levels=new Set([bottom,top]);
  for(const f of faces){
    f.strips=[];
    for(let i=0;i<3;i++){
      const a=f.corners[i],b=f.corners[(i+1)%3];
      if(Math.abs(a.y-b.y)<1e-10)continue;
      const low=Math.max(bottom,Math.min(a.y,b.y)),high=Math.min(top,Math.max(a.y,b.y));
      if(high<=low)continue;
      const slope=(b[along]-a[along])/(b.y-a.y),offset=a[along]-a.y*slope;
      const e={low,high,slope,offset};f.strips.push(e);edges.push(e);levels.add(low);levels.add(high);
      if(Math.abs(slope)>1e-10)for(const end of [lo,hi]){
        const y=(end-offset)/slope;if(y>low&&y<high)levels.add(y);
      }
    }
  }
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const a=edges[i],b=edges[j],delta=a.slope-b.slope;
    if(Math.abs(delta)<1e-10)continue;
    const y=(b.offset-a.offset)/delta;
    if(y>Math.max(a.low,b.low)&&y<Math.min(a.high,b.high))levels.add(y);
  }
  const ys=[...levels].sort((a,b)=>a-b);
  for(let i=1;i<ys.length;i++){
    if(ys[i]-ys[i-1]<1e-6)continue;
    for(const t of [.00001,.99999]){
      const y=ys[i-1]+(ys[i]-ys[i-1])*t,intervals=[];
      for(const f of faces){
        const x=f.strips.filter(e=>e.low<=y&&y<=e.high).map(e=>e.slope*y+e.offset);
        if(x.length>=2)intervals.push([Math.min(...x),Math.max(...x)]);
      }
      let reach=lo;
      for(const [a,b] of intervals.sort((a,b)=>a[0]-b[0])){
        if(a>reach+tolerance)break;reach=Math.max(reach,b);
      }
      if(reach<hi-tolerance)return false;
    }
  }
  return true;
}

export function inspectCornerAbsorberModel(scene,resource,T,fail){
  if(resource?.mountRole!=='corner-absorber')return;
  const reject=(code,msg)=>fail(code,resource.id,msg);
  scene.updateWorldMatrix(true,true);
  const faces=[],bounds=new T.Box3(),norm=new T.Vector3(),u=new T.Vector3(),w=new T.Vector3();
  scene.traverseVisible(m=>{
    if(!m.isMesh)return;
    const g=m.geometry,p=g.attributes.position,ix=g.index,n=ix?.count??p.count,points=new Map();
    const lookup=i=>{const k=ix?ix.getX(i):i;if(!points.has(k))points.set(k,m.getVertexPosition(k,new T.Vector3()).applyMatrix4(m.matrixWorld));return points.get(k);};
    const materials=Array.isArray(m.material)?m.material:[m.material];
    for(const group of Array.isArray(m.material)?g.groups:[{start:0,count:n,materialIndex:0}]){
      const material=materials[group.materialIndex];if(!material?.visible||material.opacity<=0)continue;
      const end=Math.min(group.start+group.count,g.drawRange.start+g.drawRange.count,n);
      for(let i=Math.max(group.start,g.drawRange.start);i+2<end;i+=3){
        const a=lookup(i),b=lookup(i+1),c=lookup(i+2);
        norm.crossVectors(u.subVectors(b,a),w.subVectors(c,a));if(norm.lengthSq()<1e-20)continue;
        const flip=(m.matrixWorld.determinant()<0)!==(material.side===T.BackSide);
        faces.push({a,b:flip?c:b,c:flip?b:c,normal:norm.clone().normalize().multiplyScalar(flip?-1:1),double:material.side===T.DoubleSide});
        for(const point of [a,b,c])bounds.expandByPoint(point);
      }
    }
  });
  const dims=resource.mounting;
  if(!faces.length||bounds.min.length()>tolerance||Math.max(Math.abs(bounds.max.x-dims.width),Math.abs(bounds.max.y-dims.height),Math.abs(bounds.max.z-dims.depth))>tolerance)
    reject('corner-absorber-geometry-envelope','The actual corner unit must fill the positive-X/Z installed envelope.');
  const pieces=physicalIslands(faces,T),bearings={};
  for(const axis of ['x','z']){
    const patch=resource.cornerMount?.bearings?.[axis],rear=faces.filter(f=>f.piece.solid&&f.normal[axis]<-.999&&f.corners.every(p=>Math.abs(p[axis])<=tolerance));
    if(!patch||!rear.length||!coversRectangle(rear,axis,patch))
      reject('corner-absorber-geometry-bearing','Missing physical wall-bearing surface on '+axis.toUpperCase()+'.');
    bearings[axis]={along:[...patch.along],y:[...patch.y],triangles:rear.length};
  }
  const connected=connectedAssembly(pieces,T);
  if(connected!==pieces.length)reject('corner-absorber-geometry-support','All visible parts must connect to both wall bearings through real material.');
  const outward=new T.Vector3(1,0,1).normalize(),ray=new T.Ray(),point=new T.Vector3(),sections=[];
  for(const y of [.45,1.1,1.85]){
    ray.direction.copy(outward).negate();ray.origin.set(.65,y,.65);
    const intervals=new Map();let first;
    for(const f of faces){
      if(!ray.intersectTriangle(f.a,f.b,f.c,false,point))continue;
      const depth=point.dot(outward),sign=Math.sign(f.normal.dot(outward));
      if((sign>0||f.double)&&(!first||depth>first.depth))first={depth,normal:f.normal,point:point.clone()};
      if(!f.piece.solid)continue;
      if(!intervals.has(f.piece))intervals.set(f.piece,new Map());
      const map=intervals.get(f.piece),k=Math.round(depth*1e7);
      map.set(k,(map.get(k)??0)+sign);
    }
    let bulk=0;
    for(const map of intervals.values()){
      let winding=0,last;
      for(const [z,s] of [...map].sort((a,b)=>b[0]-a[0])){
        if(winding)bulk=Math.max(bulk,(last-z)*1e-7);
        winding+=Math.sign(s);last=z;
      }
    }
    if(!first||first.normal.dot(outward)<.35||bulk<=tolerance)reject('corner-absorber-geometry-face','Missing visible room-facing solid section at '+y+' m.');
    sections.push({y,point:first.point.toArray(),materialDepthM:bulk});
  }
  return {bounds:[bounds.min.toArray(),bounds.max.toArray()],bearings,connectedIslands:connected,triangles:faces.length,sections};
}
