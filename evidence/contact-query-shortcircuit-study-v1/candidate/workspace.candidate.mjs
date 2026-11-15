// Reusable storage only. No cached skin position or clearance result.
// Each refresh samples every actual vertex; each build reprojects every face.
export function alphaImageIsOpaque(alpha) {
  if (!alpha || !Number.isInteger(alpha.width) || !Number.isInteger(alpha.height) ||
      alpha.width <= 0 || alpha.height <= 0 || !Number.isFinite(alpha.cutoff) ||
      alpha.pixels?.length !== alpha.width * alpha.height * 4) return false;
  for (let i = 3; i < alpha.pixels.length; i += 4)
    if (!(alpha.pixels[i] / 255 >= alpha.cutoff)) return false;
  return true;
}

// The old barycentric calculation must remain finite before bypassing it.
// Deliberately generous bounded inputs cover this metre-scale scene; degenerate
// or extreme diagnostic geometry keeps the original alpha sampling path.
export function opaqueAlphaHitSafe(t, point) {
  return t.opaqueAlphaSafe && Math.abs(point.x) <= 1e6 &&
    Math.abs(point.y) <= 1e6 && Math.abs(point.z) <= 1e6;
}

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
            uvValues:uv?ids.flatMap(id=>[uv.getX(id),uv.getY(id)]):null,
            alphaEdge0:new THREE.Vector3(),alphaEdge1:new THREE.Vector3(),alphaDelta:new THREE.Vector3(),
            projected:new Array(6).fill(0),clipConstants:new Array(7).fill(0),candidateStamp:0});
        }
        cache = {geometry,index,indexVersion:index.version,uv,uvVersion:uv?.version,points,triangles};
        caches.set(mesh,cache);
      }
      mesh.updateWorldMatrix(true,false);
      for (let i=0;i<cache.points.length;i++) mesh.getVertexPosition(i,cache.points[i]).applyMatrix4(mesh.matrixWorld);
      for (const t of cache.triangles) {
        t.alpha=alpha;
        if(alpha?.cutoff) prepareAlphaTriangle(t);
      }
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
        prepareProjectedInterval(p,t.clipConstants||(t.clipConstants=new Array(7)));
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

// Cache only constants of this freshly projected triangle, never a query result.
// Sufficient arithmetic bound, not a geometric/contact tolerance.
const CLIP_FINITE_LIMIT = 2 ** 100;
export function prepareProjectedInterval(t,out) {
  out.finiteClipArithmetic = false;
  const [au,av,bu,bv,cu,cv]=t;
  out[0]=bv-cv;out[1]=cu-bu;out[2]=cv-av;out[3]=au-cu;
  out[4]=cu;out[5]=cv;out[6]=(bv-cv)*(au-cu)+(cu-bu)*(av-cv);
  out.finiteClipArithmetic = out.every(value => Number.isFinite(value) && Math.abs(value) <= CLIP_FINITE_LIMIT);
  return out;
}
export function projectedSegmentIntervalPrepared(su,sv,eu,ev,c,out) {
  // Unsupported arithmetic keeps the exact original path, including NaN behavior.
  if (c.finiteClipArithmetic !== true ||
      !(Math.abs(su) <= CLIP_FINITE_LIMIT && Math.abs(sv) <= CLIP_FINITE_LIMIT &&
        Math.abs(eu) <= CLIP_FINITE_LIMIT && Math.abs(ev) <= CLIP_FINITE_LIMIT))
    return projectedSegmentIntervalPreparedFallback(su,sv,eu,ev,c,out);
  const denominator=c[6];
  if(Math.abs(denominator)<1e-12)return null;
  const start=out.start,end=out.end;
  let lo=0,hi=1;
  for(let k=0;k<3;k++){
    if(k===0){
      start[0]=(c[0]*(su-c[4])+c[1]*(sv-c[5]))/denominator;
      end[0]=(c[0]*(eu-c[4])+c[1]*(ev-c[5]))/denominator;
    }else if(k===1){
      start[1]=(c[2]*(su-c[4])+c[3]*(sv-c[5]))/denominator;
      end[1]=(c[2]*(eu-c[4])+c[3]*(ev-c[5]))/denominator;
    }else{
      start[2]=1-start[0]-start[1];
      end[2]=1-end[0]-end[1];
    }
    const delta=end[k]-start[k];
    if(Math.abs(delta)<1e-12){if(start[k]<-1e-9)return null;}
    else if(delta>0)lo=Math.max(lo,-start[k]/delta);
    else hi=Math.min(hi,-start[k]/delta);
    // Finite future constraints can only increase lo or decrease hi.
    // Retain the old inverted-interval tolerance exactly (thin-wedge witness).
    if(lo>hi+1e-9)return null;
  }
  out.lo=Math.max(0,lo);out.hi=Math.min(1,hi);return out;
}
// Null results have no scratch-array contract: the sole product caller continues
// immediately. Nonnull start/end, and every unsupported input, stay byte-for-value.
function projectedSegmentIntervalPreparedFallback(su,sv,eu,ev,c,out) {
  const denominator=c[6];
  if(Math.abs(denominator)<1e-12)return null;
  const start=out.start,end=out.end;
  start[0]=(c[0]*(su-c[4])+c[1]*(sv-c[5]))/denominator;
  start[1]=(c[2]*(su-c[4])+c[3]*(sv-c[5]))/denominator;
  start[2]=1-start[0]-start[1];
  end[0]=(c[0]*(eu-c[4])+c[1]*(ev-c[5]))/denominator;
  end[1]=(c[2]*(eu-c[4])+c[3]*(ev-c[5]))/denominator;
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

// Same operation order as Three r187 Triangle.getBarycoord. Shape refreshes every substep.
export function prepareAlphaTriangle(t) {
  const v0=t.alphaEdge0.subVectors(t.points[2],t.points[0]);
  const v1=t.alphaEdge1.subVectors(t.points[1],t.points[0]);
  t.alphaDot00=v0.dot(v0);t.alphaDot01=v0.dot(v1);t.alphaDot11=v1.dot(v1);
  t.alphaDenom=t.alphaDot00*t.alphaDot11-t.alphaDot01*t.alphaDot01;
  t.alphaInvDenom=1/t.alphaDenom;
  t.opaqueAlphaSafe = Boolean(t.alpha?.fullyOpaque && t.alphaDenom > 0 &&
    t.alphaDot00 <= 1e12 && t.alphaDot11 <= 1e12 &&
    Number.isFinite(t.alphaInvDenom) && t.alphaInvDenom <= 1e24 &&
    t.uvValues?.every(v => Math.abs(v) <= 1e6) &&
    t.points.every(p => Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6 && Math.abs(p.z) <= 1e6));
}
export function alphaBarycentricPrepared(t,point,target) {
  const v2=t.alphaDelta.subVectors(point,t.points[0]);
  const dot02=t.alphaEdge0.dot(v2),dot12=t.alphaEdge1.dot(v2);
  if(t.alphaDenom===0){target.set(0,0,0);return null;}
  const u=(t.alphaDot11*dot02-t.alphaDot01*dot12)*t.alphaInvDenom;
  const v=(t.alphaDot00*dot12-t.alphaDot01*dot02)*t.alphaInvDenom;
  return target.set(1-u-v,v,u);
}
