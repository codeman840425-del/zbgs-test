// Optimization only. Reference alpha lookup remains authoritative on every miss.
// Alpha objects/pixels are immutable snapshots created by fitSeatHands.alphaCache.
// Each workspace belongs to one controller; no pose or texture cache crosses instances.
const finite = a => a.every(Number.isFinite);
function widen(lo, hi) {
  const dl = Math.max(Number.MIN_VALUE, Math.abs(lo) * Number.EPSILON);
  const dh = Math.max(Number.MIN_VALUE, Math.abs(hi) * Number.EPSILON);
  return [lo - dl, hi + dh];
}
const point = x => [x, x];
const add = (a,b) => widen(a[0]+b[0],a[1]+b[1]);
const sub = (a,b) => widen(a[0]-b[1],a[1]-b[0]);
function mul(a,b) {
  const values=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];
  return widen(Math.min(...values),Math.max(...values));
}
const scale = (a,x) => mul(a,point(x));
function dot(v,d) { return add(add(scale(d[0],v.x),scale(d[1],v.y)),scale(d[2],v.z)); }
function uvBound(values,b,offset) {
  // Preserve the original 0+a*x+b*y+c*z evaluation order.
  return add(add(add(point(0),scale(b[0],values[offset])),scale(b[1],values[offset+2])),scale(b[2],values[offset+4]));
}

export function createOpaqueAlphaProof() {
  const textures = new WeakMap();
  const stats = {textureBuilds:0,scannedPixels:0,prepared:0,proven:0,hits:0,fallbacks:0};
  function texture(a) {
    let c=textures.get(a);
    if(c && c.pixels===a.pixels && c.width===a.width && c.height===a.height && c.cutoff===a.cutoff && c.flip===a.flip) return c;
    const {width:w,height:h,pixels,cutoff,flip}=a;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>16777216||pixels?.length!==w*h*4||!Number.isFinite(cutoff))return null;
    // Integer summed-area table counts EVERY pixel that the exact old predicate rejects.
    const stride=w+1, sat=new Uint32Array(stride*(h+1));
    for(let y=0;y<h;y++) {let row=0;for(let x=0;x<w;x++) {
      row += pixels[(y*w+x)*4+3]/255>=cutoff ? 0 : 1;
      sat[(y+1)*stride+x+1]=sat[y*stride+x+1]+row;
    }}
    c={pixels,width:w,height:h,cutoff,flip,sat,stride}; textures.set(a,c);
    stats.textureBuilds++;stats.scannedPixels+=w*h;return c;
  }
  function prepare(t) {
    t.opaqueAlphaBounds=null;stats.prepared++;
    if(!t.alpha?.cutoff || !t.uvValues || !finite(t.uvValues))return;
    const magnitude=Math.abs(t.alphaDot00*t.alphaDot11)+Math.abs(t.alphaDot01*t.alphaDot01);
    // Degenerate/ill-conditioned/non-finite geometry always runs the old lookup.
    // This is solely a proof eligibility guard, never a collision/visibility threshold.
    if(!Number.isFinite(magnitude)||magnitude===0||!Number.isFinite(t.alphaInvDenom)||!(Math.abs(t.alphaDenom)>magnitude*1e-10))return;
    const box=['x','y','z'].map(k=>[Math.min(...t.points.map(p=>p[k])),Math.max(...t.points.map(p=>p[k]))]);
    if(!box.every(finite))return;
    const delta=box.map((b,i)=>sub(b,point(t.points[0][['x','y','z'][i]])));
    const dot02=dot(t.alphaEdge0,delta), dot12=dot(t.alphaEdge1,delta);
    const u=scale(sub(scale(dot02,t.alphaDot11),scale(dot12,t.alphaDot01)),t.alphaInvDenom);
    const v=scale(sub(scale(dot12,t.alphaDot00),scale(dot02,t.alphaDot01)),t.alphaInvDenom);
    const b=[sub(sub(point(1),u),v),v,u];
    const U=uvBound(t.uvValues,b,0), V=uvBound(t.uvValues,b,1), a=t.alpha;
    const X=scale(U,a.width),Y=scale(a.flip?sub(point(1),V):V,a.height);
    if(!finite(X)||!finite(Y))return;
    const c=texture(a);if(!c)return;
    const x0=Math.max(0,Math.min(c.width-1,Math.floor(X[0]))),x1=Math.max(0,Math.min(c.width-1,Math.floor(X[1])));
    const y0=Math.max(0,Math.min(c.height-1,Math.floor(Y[0]))),y1=Math.max(0,Math.min(c.height-1,Math.floor(Y[1])));
    const s=c.stride,S=c.sat;
    if(S[(y1+1)*s+x1+1]-S[y0*s+x1+1]-S[(y1+1)*s+x0]+S[y0*s+x0]!==0)return;
    t.opaqueAlphaBounds=box;stats.proven++;
  }
  function opaque(t,p) {
    const b=t.opaqueAlphaBounds;
    // Even an ulp outside the proven world box falls back. No barycentric assumption.
    const yes=!!b && p.x>=b[0][0]&&p.x<=b[0][1]&&p.y>=b[1][0]&&p.y<=b[1][1]&&p.z>=b[2][0]&&p.z<=b[2][1];
    if(yes)stats.hits++;else stats.fallbacks++;
    return yes;
  }
  return {prepare,opaque,stats};
}
