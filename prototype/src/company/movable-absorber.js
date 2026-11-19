import {BackSide, Box3, DoubleSide, Ray, Triangle, Vector3} from 'three';

const role = 'movable-absorber-screen';
const tolerance = .001;
const shapes = new Set(['folding','casters','double-sided','curved']);
const matchesPair = (value,x,y) => Array.isArray(value) && value.length === 2 && value[0] === x && value[1] === y;

export function validateMovableAbsorberResource(card, fail, location = card.id) {
  if (card.productionBranch !== role && card.mountRole !== role && card.acoustic?.purpose !== role) return;
  const m = card.mounting, f = card.footprint;
  if (card.mountRole !== role || card.productionBranch !== role || card.mount !== 'floor-surface' ||
      card.category !== 'decor' || card.asset?.format !== 'glb' || m?.origin !== 'bottom' ||
      m.width !== 1.2 || m.height !== 1.8 || m.depth !== .38 || f?.blocking !== true ||
      !matchesPair(f.center,0,0) || !matchesPair(f.halfSize,.6,.19) ||
      card.acoustic?.purpose !== role || card.acoustic.configuration !== 'fixed-deployed' || !shapes.has(card.acoustic.construction) ||
      card.usePoints?.length || Object.keys(card.stateDefaults ?? {}).length || card.movingParts || card.supportSurfaces)
    fail('invalid-movable-absorber', location, 'Use the deployed floor screen with its full 1.20 × 0.38 m blocking footprint and 1.80 m height');
}

// Keep the actual floor contacts; a wheel may meet the ground at a point or a line.
function surroundsCentre(points) {
  const cross = (a,b,c) => (b.x-a.x)*(c.z-a.z) - (b.z-a.z)*(c.x-a.x);
  const sorted = [...points.values()].sort((a,b) => a.x-b.x || a.z-b.z);
  function side(vertices) {
    const hull = [];
    for (const point of vertices) {
      while (hull.length >= 2 && cross(hull.at(-2),hull.at(-1),point) <= 0) hull.pop();
      hull.push(point);
    }
    hull.pop();
    return hull;
  }
  const outline = [...side(sorted), ...side(sorted.reverse())];
  return outline.length >= 3 && outline.every((point,i) => cross(point,outline[(i+1)%outline.length],{x:0,z:0}) > 1e-8);
}

function physicalIslands(faces) {
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
    if(!byRoot.has(id))byRoot.set(id,{faces:[],bounds:new Box3(),ground:new Map(),edges:new Map(),volume6:0,origin:f.a});
    const piece=byRoot.get(id);
    f.triangle=new Triangle(f.a,f.b,f.c);
    f.box=new Box3().setFromPoints(f.corners).expandByScalar(tolerance/2);
    f.piece=piece;piece.faces.push(f);
    for(const [k,p] of f.corners.entries()){
      piece.bounds.expandByPoint(p);
      if(Math.abs(p.y)<=tolerance)piece.ground.set(f.indices[k],p);
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

function touching(a,b) {
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

function connectedAssembly(pieces){
  const connected=new Set([pieces[0]]);
  for(const piece of connected){
    for(const other of pieces)if(!connected.has(other)&&touching(piece,other))connected.add(other);
  }
  return connected.size;
}

export function validateMovableAbsorberGeometry(root, card, fail, location = card.id) {
  if (card.mountRole !== role) return;
  root.updateWorldMatrix(true,true);
  const bounds = new Box3(), triangles = [];
  const ab = new Vector3(), ac = new Vector3(), normal = new Vector3();
  let sideArea = 0;
  root.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, index = geometry.index, count = index?.count ?? geometry.attributes.position.count;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) ? geometry.groups : [{start:0,count,materialIndex:0}];
    const reverse = mesh.matrixWorld.determinant() < 0;
    const points = new Map();
    function vertex(drawIndex) {
      const i = index ? index.getX(drawIndex) : drawIndex;
      if (!points.has(i)) points.set(i,mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));
      return points.get(i);
    }
    for (const group of groups) {
      const material = materials[group.materialIndex];
      if (!material?.visible || material.opacity <= 0) continue;
      const from = Math.max(group.start,geometry.drawRange.start);
      const to = Math.min(count,group.start+group.count,geometry.drawRange.start+geometry.drawRange.count);
      for (let i=from; i+2<to; i+=3) {
        const a=vertex(i), b=vertex(i+1), c=vertex(i+2);
        normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));
        if (normal.lengthSq()<1e-20) continue;
        for (const point of [a,b,c]) {
          bounds.expandByPoint(point);
        }
        const high=Math.max(a.y,b.y,c.y);
        // Upper edges with real depth distinguish a body from two loose pictures on a stand.
        if (high>.45 && Math.max(a.z,b.z,c.z)-Math.min(a.z,b.z,c.z)>tolerance)
          sideArea+=Math.hypot(normal.x,normal.y)*.5;
        const flip=reverse !== (material.side===BackSide);
        triangles.push({a, b:flip?c:b, c:flip?b:c, cull:material.side!==DoubleSide});
      }
    }
  });
  const {min,max}=bounds;
  if (bounds.isEmpty() || Math.max(Math.abs(min.x+.6),Math.abs(max.x-.6),Math.abs(min.y),Math.abs(max.y-1.8),
      Math.abs(min.z+.19),Math.abs(max.z-.19))>tolerance)
    fail('movable-absorber-envelope',location,'The visible installed screen and its feet must match the declared floor envelope');
  const pieces=physicalIslands(triangles),contacts=new Map();
  for(const piece of pieces)if(piece.solid)for(const [key,p] of piece.ground)contacts.set(key,p);
  if (!surroundsCentre(contacts)) fail('movable-absorber-ground',location,'Grounded three-dimensional supports must surround the screen centre.');
  const connected=connectedAssembly(pieces);
  if(connected!==pieces.length)fail('movable-absorber-support-gap',location,'A visible physical part is disconnected from the assembled floor screen.');
  if (sideArea<.001) fail('movable-absorber-thickness',location,'The elevated screen body needs physical edge depth');
  const ray=new Ray(), hit=new Vector3();
  function faceZ(x,y,side) {
    ray.origin.set(x,y,side*.5);ray.direction.set(0,0,-side);
    let nearest;
    for (const triangle of triangles) {
      if (ray.intersectTriangle(triangle.a,triangle.b,triangle.c,triangle.cull,hit) &&
          (nearest===undefined || side*hit.z>side*nearest)) nearest=hit.z;
    }
    return nearest;
  }
  const sections=[];
  for (const x of [-.30,.30]) for (const y of [.55,1,1.45]) {
    const front=faceZ(x,y,1), back=faceZ(x,y,-1);
    if (front===undefined || back===undefined || front-back<=tolerance)
      fail('movable-absorber-faces',location,'Both sides of the deployed screen need visible faces and real thickness at '+x+', '+y);
    // At least one actual material interval must occupy this section. Two flat
    // pictures separated by air, even with a solid post beside them, cannot pass.
    ray.origin.set(x,y,.5);ray.direction.set(0,0,-1);
    let materialThickness=0;
    for(const piece of pieces){
      if(!piece.solid || x<piece.bounds.min.x || x>piece.bounds.max.x || y<piece.bounds.min.y || y>piece.bounds.max.y) continue;
      const crossings=new Map();
      for(const f of piece.faces){
        if(!ray.intersectTriangle(f.a,f.b,f.c,false,hit))continue;
        const key=Math.round(hit.z*1e7), facing=Math.sign((f.b.x-f.a.x)*(f.c.y-f.a.y)-(f.b.y-f.a.y)*(f.c.x-f.a.x));
        crossings.set(key,(crossings.get(key)??0)+facing);
      }
      let winding=0,previous;
      for(const [level,sign] of [...crossings].sort((a,b)=>b[0]-a[0])){
        if(winding)materialThickness=Math.max(materialThickness,(previous-level)*1e-7);
        winding+=Math.sign(sign);previous=level;
      }
    }
    if(materialThickness<=tolerance)fail('movable-absorber-faces',location,'No solid panel material at '+x+', '+y);
    sections.push({x,y,thickness:front-back,materialThickness});
  }
  return {size:bounds.getSize(new Vector3()).toArray(),floorContactVertices:contacts.size,supportedHeight:max.y,connectedIslands:connected,sections};
}
