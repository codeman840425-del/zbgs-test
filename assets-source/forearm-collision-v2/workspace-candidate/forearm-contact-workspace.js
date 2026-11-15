// Reusable storage only. No cached skin position or clearance result.
// Each refresh samples every actual vertex; each build reprojects every face.
export function createSkinContactWorkspace(THREE) {
  const caches = new WeakMap();
  return {
    refresh(mesh, alpha) {
      const geometry = mesh.geometry, index = geometry.index, uv = geometry.attributes.uv;
      let cache = caches.get(mesh);
      if (!cache || cache.geometry !== geometry || cache.index !== index ||
          cache.indexVersion !== index.version || cache.uv !== uv ||
          cache.uvVersion !== uv?.version || cache.points.length !== geometry.attributes.position.count) {
        const points = Array.from({length: geometry.attributes.position.count}, () => new THREE.Vector3());
        const triangles = [];
        for (let i=0; i<index.count; i+=3) {
          const ids = [index.getX(i), index.getX(i+1), index.getX(i+2)];
          triangles.push({ids, points:ids.map(id=>points[id]), uv, alpha,
            projected:new Array(6).fill(0), candidateStamp:0});
        }
        cache = {geometry,index,indexVersion:index.version,uv,uvVersion:uv?.version,points,triangles};
        caches.set(mesh,cache);
      }
      mesh.updateWorldMatrix(true,false);
      for (let i=0;i<cache.points.length;i++) mesh.getVertexPosition(i,cache.points[i]).applyMatrix4(mesh.matrixWorld);
      for (const t of cache.triangles) t.alpha=alpha;
      return cache.triangles;
    },
  };
}

export function createProjectedContactWorkspace() {
  const cells = new Map(), lists=[], candidates=[];
  let usedLists=0, stamp=0;
  return {
    build(triangles,u,v) {
      cells.clear();usedLists=0;
      for (const t of triangles) {
        const p=t.projected;
        for(let j=0;j<3;j++){p[j*2]=t.points[j].dot(u);p[j*2+1]=t.points[j].dot(v);}
        const minX=Math.floor(Math.min(p[0]/.04,p[2]/.04,p[4]/.04));
        const maxX=Math.floor(Math.max(p[0]/.04,p[2]/.04,p[4]/.04));
        const minY=Math.floor(Math.min(p[1]/.04,p[3]/.04,p[5]/.04));
        const maxY=Math.floor(Math.max(p[1]/.04,p[3]/.04,p[5]/.04));
        for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++) {
          const key=x+':'+y;let list=cells.get(key);
          if(!list){list=lists[usedLists]||(lists[usedLists]=[]);usedLists++;list.length=0;cells.set(key,list);}
          list.push(t);
        }
      }
    },
    query(su,sv,eu,ev) {
      // Number integer counter stays exact for millions of years at normal rates.
      stamp++; candidates.length=0;
      for(let x=Math.floor(Math.min(su,eu)/.04);x<=Math.floor(Math.max(su,eu)/.04);x++)
        for(let y=Math.floor(Math.min(sv,ev)/.04);y<=Math.floor(Math.max(sv,ev)/.04);y++) {
          const list=cells.get(x+':'+y);if(!list)continue;
          for(const t of list)if(t.candidateStamp!==stamp){t.candidateStamp=stamp;candidates.push(t);}
        }
      return candidates;
    },
  };
}

export function createProjectedInterval() { return {lo:0,hi:1,start:[0,0,0],end:[0,0,0]}; }
// Same arithmetic and clipping order as projectedSegmentInterval, with caller-owned output.
export function projectedSegmentIntervalInto(su,sv,eu,ev,t,out) {
  const [au,av,bu,bv,cu,cv]=t;
  const denominator=(bv-cv)*(au-cu)+(cu-bu)*(av-cv);
  if(Math.abs(denominator)<1e-12)return null;
  const start=out.start,end=out.end;
  start[0]=((bv-cv)*(su-cu)+(cu-bu)*(sv-cv))/denominator;
  start[1]=((cv-av)*(su-cu)+(au-cu)*(sv-cv))/denominator;
  start[2]=1-start[0]-start[1];
  end[0]=((bv-cv)*(eu-cu)+(cu-bu)*(ev-cv))/denominator;
  end[1]=((cv-av)*(eu-cu)+(au-cu)*(ev-cv))/denominator;
  end[2]=1-end[0]-end[1];
  let lo=0,hi=1;
  for(let k=0;k<3;k++){
    const delta=end[k]-start[k];
    if(Math.abs(delta)<1e-12){if(start[k]<-1e-9)return null;}
    else if(delta>0)lo=Math.max(lo,-start[k]/delta);
    else hi=Math.min(hi,-start[k]/delta);
  }
  if(lo>hi+1e-9)return null;
  out.lo=Math.max(0,lo);out.hi=Math.min(1,hi);return out;
}
