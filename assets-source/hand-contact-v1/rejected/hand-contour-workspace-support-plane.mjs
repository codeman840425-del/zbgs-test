// Isolated candidate: actual current skinned hand vertices, semantic subgroups.
// Finite projected contours + inward-point spokes, NOT a perfect volume/CCD.
// Caller invokes refresh AFTER its existing seatHandSurfaces(true) sync.
export function projectedHull(points) {
  const sorted=points.slice().sort((a,b)=>a.u-b.u||a.v-b.v||a.depth-b.depth);
  const unique=[];for(const p of sorted){const last=unique.at(-1);if(!last||p.u!==last.u||p.v!==last.v)unique.push(p);}
  if(unique.length<3)return unique;
  const cross=(o,a,b)=>(a.u-o.u)*(b.v-o.v)-(a.v-o.v)*(b.u-o.u);
  const lower=[],upper=[];
  for(const p of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}

// Intersection of 8 measured support half-planes. Contains the actual projected
// points without a guessed radius. Depth uses the group's most inward sample;
// this is deliberately conservative and may overcorrect a bent finger group.
export function supportOctagon(points) {
  const minU=Math.min(...points.map(p=>p.u)),maxU=Math.max(...points.map(p=>p.u)),minV=Math.min(...points.map(p=>p.v)),maxV=Math.max(...points.map(p=>p.v));
  let poly=[{u:minU,v:minV},{u:maxU,v:minV},{u:maxU,v:maxV},{u:minU,v:maxV}];
  for(const [du,dv]of [[1,1],[-1,1],[-1,-1],[1,-1]]){
    const h=Math.max(...points.map(p=>p.u*du+p.v*dv)),next=[];
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=a.u*du+a.v*dv-h,db=b.u*du+b.v*dv-h;if(da<=0)next.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);next.push({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}}
    poly=next;
  }
  const unique=[];for(const p of poly)if(!unique.some(q=>Math.abs(p.u-q.u)<1e-12&&Math.abs(p.v-q.v)<1e-12))unique.push(p);
  return {polygon:unique,minDepth:Math.min(...points.map(p=>p.depth)),maxDepth:Math.max(...points.map(p=>p.depth))};
}

export function createHandContourWorkspace(THREE,vrm,root,{bodySHA256,expectedSHA256,representation='exact-contour'}) {
  if(!/^[a-f0-9]{64}$/.test(expectedSHA256||'')||bodySHA256!==expectedSHA256)throw Error('Hand candidate exact-body identity mismatch');
  if(!['exact-contour','support-plane'].includes(representation))throw Error('Unknown isolated hand representation');
  const semantic=new Map(),names=['palm','thumb','index','middle','ring','little'];
  for(const side of ['left','right']){
    const wrist=vrm.humanoid.getRawBoneNode(side+'Hand');if(!wrist)throw Error('Missing semantic wrist');semantic.set(wrist,{side,group:'palm'});
    for(const finger of ['Thumb','Index','Middle','Ring','Little'])for(const part of ['Metacarpal','Proximal','Intermediate','Distal']){
      const b=vrm.humanoid.getRawBoneNode(side+finger+part);if(b)semantic.set(b,{side,group:finger.toLowerCase()});
    }
  }
  const meshes=[],groups=new Map(),sides=new Map();
  for(const side of ['left','right']){sides.set(side,{base:[],shifted:[],generated:[],origin:new THREE.Vector3(),metrics:{}});for(const group of names)groups.set(side+':'+group,[]);}
  vrm.scene.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||mesh.userData.assetRole!=='body')return;
    const g=mesh.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,index=g.index;
    if(!si||!sw||!index)return;
    const classification=new Map(),selected=new Map(),joint=mesh.skeleton.bones.map(b=>semantic.get(b));
    const classify=i=>{if(classification.has(i))return classification.get(i);const sums={left:0,right:0},parts={};for(let k=0;k<4;k++){const s=joint[si.getComponent(i,k)],w=sw.getComponent(i,k);if(s){sums[s.side]+=w;parts[s.side+':'+s.group]=(parts[s.side+':'+s.group]||0)+w;}}const c={sums,parts};classification.set(i,c);return c;};
    for(let f=0;f<index.count;f+=3){const ids=[index.getX(f),index.getX(f+1),index.getX(f+2)],cs=ids.map(classify);for(const side of ['left','right'])if(cs.reduce((n,c)=>n+c.sums[side],0)/3>=.25)for(const i of ids){
      const c=classify(i),group=names.reduce((best,n)=>(c.parts[side+':'+n]||0)>(c.parts[side+':'+best]||0)?n:best,'palm');
      const key=side+':'+i;if(!selected.has(key)){const p={mesh,index:i,side,group,world:new THREE.Vector3(),u:0,v:0,depth:0};selected.set(key,p);groups.get(side+':'+group).push(p);}
    }}
    if(selected.size)meshes.push({mesh,geometry:g,index,indexVersion:index.version,points:[...selected.values()]});
  });
  if(!meshes.length)throw Error('No semantically weighted visible body hand surface');
  let refreshed=false;
  return {
    refresh(){
      // Do not call humanoid.update here: caller already owns current-pose sync.
      for(const m of meshes){if(m.mesh.geometry!==m.geometry||m.geometry.index!==m.index||m.index.version!==m.indexVersion)throw Error('Hand source topology changed; rebuild workspace');for(const p of m.points){m.mesh.getVertexPosition(p.index,p.world);p.world.applyMatrix4(m.mesh.matrixWorld);if(!Number.isFinite(p.world.lengthSq()))throw Error('Nonfinite actual hand vertex');}}
      refreshed=true;
    },
    project(side,u,v,outward,wrist){
      if(!refreshed)throw Error('Actual current hand skin must be refreshed first');const state=sides.get(side);state.origin.copy(wrist);state.base.length=0;const metrics=[];let generated=0;
      for(const group of names){const points=groups.get(side+':'+group);if(!points.length)continue;for(const p of points){p.u=p.world.dot(u);p.v=p.world.dot(v);p.depth=p.world.dot(outward);}
        if(representation==='exact-contour'){
          const hull=projectedHull(points),inward=points.reduce((a,b)=>a.depth<b.depth?a:b),seen=new Set();
          const add=(a,b)=>{if(a===b)return;const key=[a.index+':'+a.mesh.uuid,b.index+':'+b.mesh.uuid].sort().join('|');if(seen.has(key))return;seen.add(key);state.base.push([a.world,b.world]);};
          for(let i=0;i<hull.length;i++){add(hull[i],hull[(i+1)%hull.length]);add(inward,hull[i]);}
          metrics.push({group,vertices:points.length,outlineVertices:hull.length,rails:seen.size,representation});continue;
        }
        const envelope=supportOctagon(points),hull=envelope.polygon.map(p=>{const w=state.generated[generated]||=new THREE.Vector3();generated++;return w.set(0,0,0).addScaledVector(u,p.u).addScaledVector(v,p.v).addScaledVector(outward,envelope.minDepth);}),seen=new Set();const add=(a,b)=>{if(a===b)return;const key=[a,b].sort((x,y)=>x-y).join(':');if(seen.has(key))return;seen.add(key);state.base.push([hull[a],hull[b]]);};
        for(let i=0;i<hull.length;i++)add(i,(i+1)%hull.length);
        for(let i=0;i<Math.ceil(hull.length/2);i++)add(i,(i+Math.floor(hull.length/2))%hull.length);
        metrics.push({group,vertices:points.length,outlineVertices:hull.length,rails:seen.size,measuredDepthRange:envelope.maxDepth-envelope.minDepth});
      }
      state.metrics={groups:metrics,railCount:state.base.length,vertices:metrics.reduce((s,m)=>s+m.vertices,0)};return state.metrics;
    },
    railsAt(side,wrist){const s=sides.get(side),dx=wrist.x-s.origin.x,dy=wrist.y-s.origin.y,dz=wrist.z-s.origin.z;for(let i=0;i<s.base.length;i++){s.shifted[i]||=[new THREE.Vector3(),new THREE.Vector3()];for(let k=0;k<2;k++){const p=s.shifted[i][k],a=s.base[i][k];p.set(a.x+dx,a.y+dy,a.z+dz);}}s.shifted.length=s.base.length;return s.shifted;},
    metrics(side){return sides.get(side).metrics;},
    selection(){return meshes.map(m=>({mesh:m.mesh.name,points:m.points.map(p=>({index:p.index,side:p.side,group:p.group})),indexCount:m.index.count}));},
  };
}
