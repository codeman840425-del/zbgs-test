// Actual captured full skin/top surfaces, all frames, triangle intersections.
// Alpha is deliberately not guessed: raw crossings are conservative diagnostics.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=path.resolve(process.argv[2]);
const out=path.join(root,'assets-source/m1/seated-front-v1');
const reportOut=process.env.QA_SKIRT_OUTPUT?path.resolve(process.env.QA_SKIRT_OUTPUT):out;
const data=JSON.parse(await readFile(path.join(dir,'capture.json'),'utf8'));
const alpha=JSON.parse(await readFile(path.join(out,'alpha-input.json'),'utf8')).materials;
for(const m of Object.values(alpha))m.pixels=inflateSync(Buffer.from(m.zlibAlphaBase64,'base64'));
const readFloats=async name=>{const b=await readFile(name);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const actual=await readFloats(path.join(dir,'colliders.f32')),before=await readFloats(path.join(dir,'displayed.f32')),after=process.env.QA_SKIRT_SELF_CAPTURE==='1'?before:await readFloats(path.join(reportOut,'candidate-world.f32'));
const skirtCount=data.topology.displayed.vertexCount,indices=data.topology.displayed.triangles;
const bodyStride=data.topology.colliders.reduce((n,m)=>n+m.vertexCount*3,0);
let offset=0;const meshes=data.topology.colliders.map(m=>{const item={...m,offset};offset+=m.vertexCount*3;return item;}).filter(m=>['body','top'].includes(m.role));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const pos=(a,i)=>[a[i],a[i+1],a[i+2]];
function box(t){return [0,1,2].map(k=>[Math.min(...t.map(p=>p[k])),Math.max(...t.map(p=>p[k]))]);}
const overlap=(a,b)=>a.every(([lo,hi],k)=>lo<=b[k][1]+1e-8&&hi>=b[k][0]-1e-8);
function segmentTriangle(a,b,t){
 const direction=sub(b,a),edge1=sub(t[1],t[0]),edge2=sub(t[2],t[0]),p=cross(direction,edge2),det=dot(edge1,p);
 if(Math.abs(det)<1e-12)return false;const inv=1/det,s=sub(a,t[0]),u=dot(s,p)*inv;
 if(u < -1e-7 || u > 1+1e-7)return false;const q=cross(s,edge1),v=dot(direction,q)*inv;
 if(v < -1e-7 || u+v > 1+1e-7)return false;const d=dot(edge2,q)*inv;
 return d>1e-6&&d<1-1e-6?{edgeFraction:d,bary:[1-u-v,u,v]}:false;
}
function opaque(mesh,face,bary){
 const mat=alpha[mesh.materials[0].name];assert.ok(mat,'Missing actual alpha '+mesh.materials[0].name);
 if(!mat.alphaCutoff)return true;
 const uv=[0,0];for(let k=0;k<3;k++){const vertex=mesh.triangles[face*3+k];uv[0]+=mesh.uv[vertex*2]*bary[k];uv[1]+=mesh.uv[vertex*2+1]*bary[k];}
 const wrap=(x,mode)=>mode===33071?Math.max(0,Math.min(1,x)):mode===33648?1-Math.abs(((x%2)+2)%2-1):((x%1)+1)%1;
 const x=Math.min(mat.width-1,Math.floor(wrap(uv[0],mat.sampler.wrapS??10497)*mat.width)),y=Math.min(mat.height-1,Math.floor(wrap(uv[1],mat.sampler.wrapT??10497)*mat.height));
 return mat.pixels[y*mat.width+x]/255*mat.baseAlpha>=mat.alphaCutoff;
}
function intersects(a,b,skirtFace,bodyFace){
 for(let i=0;i<3;i++){
  const first=segmentTriangle(a[i],a[(i+1)%3],b);
  if(first){const bary=[0,0,0];bary[i]=1-first.edgeFraction;bary[(i+1)%3]=first.edgeFraction;if(opaque(data.topology.displayed,skirtFace,bary)&&opaque(bodyFace.meshData,bodyFace.face,first.bary))return true;}
  const second=segmentTriangle(b[i],b[(i+1)%3],a);
  if(second){const bary=[0,0,0];bary[i]=1-second.edgeFraction;bary[(i+1)%3]=second.edgeFraction;if(opaque(data.topology.displayed,skirtFace,second.bary)&&opaque(bodyFace.meshData,bodyFace.face,bary))return true;}
 }return false;
}
const cell=.04,key=(x,y,z)=>`${x},${y},${z}`;
function cells(bounds,visit){const [x,y,z]=bounds.map(([a,b])=>[Math.floor(a/cell),Math.floor(b/cell)]);for(let i=x[0];i<=x[1];i++)for(let j=y[0];j<=y[1];j++)for(let k=z[0];k<=z[1];k++)visit(key(i,j,k));}
const records=[],start=performance.now();
for(let frame=0;frame<data.frames.length;frame++){
 const variants=[before,after].map(a=>{const points=[];for(let v=0;v<skirtCount;v++)points.push(pos(a,(frame*skirtCount+v)*3));const triangles=[];for(let i=0;i<indices.length;i+=3){const t=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];triangles.push({t,box:box(t)});}return triangles;});
 const bounds=[0,1,2].map(k=>[Math.min(...variants.flat().map(t=>t.box[k][0])),Math.max(...variants.flat().map(t=>t.box[k][1]))]);
 const grid=new Map(),body=[];
 for(const m of meshes)for(let f=0;f<m.triangles.length;f+=3){
  const t=[0,1,2].map(k=>pos(actual,frame*bodyStride+m.offset+m.triangles[f+k]*3)),b=box(t);if(!overlap(b,bounds))continue;
  const index=body.length;body.push({t,box:b,mesh:m.name,meshData:m,role:m.role,face:f/3});
  cells(b,k=>{if(!grid.has(k))grid.set(k,[]);grid.get(k).push(index);});
 }
 const hits=variants.map(variant=>{
  const found=[];for(let f=0;f<variant.length;f++){const skirt=variant[f],candidate=new Set();cells(skirt.box,k=>{for(const i of grid.get(k)||[])candidate.add(i);});
   for(const i of candidate){const b=body[i];if(overlap(skirt.box,b.box)&&intersects(skirt.t,b.t,f,b))found.push(`${f}:${b.mesh}:${b.face}`);}
  }return found.sort();});
 const old=new Set(hits[0]),current=new Set(hits[1]);
 records.push({frame:data.frames[frame].frame,sitProgress:data.frames[frame].sitProgress,reference:hits[0].length,candidate:hits[1].length,
  ...(process.env.QA_SKIRT_SELF_CAPTURE==='1'?{actualPairs:hits[0]}:{}),newPairs:hits[1].filter(x=>!old.has(x)),removedPairs:hits[0].filter(x=>!current.has(x))});
}
const result={status:'alpha-sampled-triangle-diagnostic-not-visual-acceptance',captureBuild:data.identity.runtimeBuild.shortId,elapsedMs:performance.now()-start,frames:records.length,
 maxReference:Math.max(...records.map(x=>x.reference)),maxCandidate:Math.max(...records.map(x=>x.candidate)),
 framesWithNewPairs:records.filter(x=>x.newPairs.length).length,totalNewPairs:records.reduce((n,x)=>n+x.newPairs.length,0),
 records,limits:['Finite edge/triangle crossing at 30Hz, not CCD; coplanar overlaps not classified.',
  'All actual skin/top faces retained. Actual GLB alpha sampled nearest at edge crossing UVs; not exact GPU bilinear coverage or interior segment clipping.',
  'Existing fixed waist cap intersections are retained and compared, not removed or hidden.']};
await writeFile(path.join(reportOut,'triangle-alpha-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,records:undefined},null,2));
assert.ok(Number.isFinite(result.elapsedMs));
