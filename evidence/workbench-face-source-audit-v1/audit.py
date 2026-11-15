"""Read-only original F/M hair/skin geometry audit; CPU only, no source edits."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import json,struct,hashlib,collections,itertools
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
class GLB:
 def __init__(self,p):
  self.raw=p.read_bytes();n=struct.unpack_from('<I',self.raw,12)[0];self.j=json.loads(self.raw[20:20+n]);self.b=self.raw[28+n:]
 def a(self,i):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];d=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];assert 'sparse' not in a
  return np.ndarray((a['count'],w),dtype=d,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*d.itemsize),d.itemsize)).copy()
def ray(tris,origin,direction):
 # Moller-Trumbore, two-sided source triangle existence, not renderer culling.
 e1=tris[:,1]-tris[:,0];e2=tris[:,2]-tris[:,0];d=np.array(direction,dtype=float);o=np.array(origin);h=np.cross(np.broadcast_to(d,e2.shape),e2);det=np.sum(e1*h,axis=1);valid=np.abs(det)>1e-12;inv=np.zeros_like(det);inv[valid]=1/det[valid];s=o-tris[:,0];u=inv*np.sum(s*h,axis=1);q=np.cross(s,e1);v=inv*np.sum(d*q,axis=1);t=inv*np.sum(e2*q,axis=1);hit=valid&(u>=-1e-9)&(v>=-1e-9)&(u+v<=1+1e-9)&(t>=0)
 vals=t[hit];return {'origin':list(map(float,origin)),'direction':direction,'triangleHits':int(hit.sum()),'nearestM':float(vals.min()) if len(vals) else None}
report={'scope':'Actual static source triangles after excluding only _HAIR materials; not a runtime visibility/material/animation pass. All coordinates original exported glTF metres, Y up, front negative Z.','bodies':{}}
for sex,pin in [('female','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'),('male','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff')]:
 path=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';g=GLB(path);digest=hashlib.sha256(g.raw).hexdigest();assert digest==pin
 for n in g.j['nodes']:
  if 'mesh' in n:assert not any(k in n for k in ['matrix','translation','rotation','scale'])
 rows=[];skin=[];byname={}
 for mi,m in enumerate(g.j['meshes']):
  for pi,p in enumerate(m['primitives']):
   name=g.j['materials'][p['material']]['name'];pts=g.a(p['attributes']['POSITION']).astype(float);ix=g.a(p['indices']).reshape(-1,3);ids=np.unique(ix);byname[name]=(pts,ix,p);rows.append({'mesh':m['name'],'material':name,'referencedVertices':len(ids),'triangles':len(ix),'bounds':[pts[ids].min(0).tolist(),pts[ids].max(0).tolist()],'morphTargets':len(p.get('targets',[]))})
   if name.endswith('_SKIN'):skin.append(pts[ix])
 triangles=np.concatenate(skin);face=next(r for r in rows if '_Face_00_SKIN' in r['material']);iris=next(r for r in rows if '_EyeIris_' in r['material']);eyeY=(iris['bounds'][0][1]+iris['bounds'][1][1])/2;cx=(face['bounds'][0][0]+face['bounds'][1][0])/2;headMin=face['bounds'][0][1];headMax=max(r['bounds'][1][1] for r in rows if r['material'].endswith('_SKIN'));head=triangles[np.max(triangles[:,:,1],axis=1)>=headMin]
 # Diagnostic Euclidean seam weld, not coordinate rounding: near-identical
 # source split points can straddle a rounding bin and invent a long thin hole.
 # Only graph identity changes here, never source geometry/production topology.
 coords=head.reshape(-1,3);unique,exactInverse=np.unique(coords,axis=0,return_inverse=True);parents=list(range(len(unique)));buckets=collections.defaultdict(list);tolerance=1e-5;maxMerge=0.
 def find(i):
  while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
  return i
 for i,point in enumerate(unique):
  key=tuple(np.floor(point/tolerance).astype(int))
  for step in itertools.product([-1,0,1],repeat=3):
   for j in buckets[tuple(key[k]+step[k] for k in range(3))]:
    distance=float(np.linalg.norm(point-unique[j]))
    if distance<=tolerance:parents[find(i)]=find(j);maxMerge=max(maxMerge,distance)
  buckets[key].append(i)
 inverse=np.array([find(int(i)) for i in exactInverse]);faces=inverse.reshape(-1,3);edges=collections.Counter(tuple(sorted((int(a),int(b)))) for t in faces for a,b in [(t[0],t[1]),(t[1],t[2]),(t[2],t[0])] if a!=b);boundary=[e for e,n in edges.items() if n==1];adj=collections.defaultdict(set)
 for a,b in boundary:adj[a].add(b);adj[b].add(a)
 comps=[];seen=set()
 for start in adj:
  if start in seen:continue
  todo=[start];component=[];seen.add(start)
  while todo:
   a=todo.pop();component.append(a)
   for b in adj[a]:
    if b not in seen:seen.add(b);todo.append(b)
  v=unique[component];comps.append({'vertices':len(component),'min':v.min(0).tolist(),'max':v.max(0).tolist(),'center':v.mean(0).tolist(),'aboveFaceBottom':bool(v[:,1].min()>headMin+.002)})
 probes={}
 probes['crown']=[ray(head,[cx+x,headMax+.1,z],[0,-1,0]) for x in [-.035,0,.035] for z in [-.04,0,.04]]
 probes['back']=[ray(head,[cx+x,y,.25],[0,0,-1]) for x in [-.04,0,.04] for y in [eyeY,eyeY+(headMax-eyeY)*.4,eyeY+(headMax-eyeY)*.75]]
 probes['earLeft']=[ray(head,[cx-.25,y,z],[1,0,0]) for y in [eyeY-.02,eyeY,eyeY+.02] for z in [-.04,-.015,.01]]
 probes['earRight']=[ray(head,[cx+.25,y,z],[-1,0,0]) for y in [eyeY-.02,eyeY,eyeY+.02] for z in [-.04,-.015,.01]]
 # Count true ear-side surface, without pretending ray hits identify anatomy.
 earCounts={side:int(np.sum((head.mean(1)[:,0]*sign-cx*sign>.075)&(np.abs(head.mean(1)[:,1]-eyeY)<.065))) for side,sign in [('left',-1),('right',1)]}
 report['bodies'][sex]={'path':path.relative_to(ROOT).as_posix(),'sha256':digest,'materials':rows,'hairPrimitives':[r for r in rows if '_HAIR' in r['material']],'skinHeadTriangles':len(head),'headRangeY':[headMin,headMax],'irisMiddleY':eyeY,'boundaryComponentsAfter10umDiagnosticWeld':comps,'maximumActuallyMergedDistanceM':maxMerge,'nonmanifoldEdgesAfterDiagnosticWeld':sum(n>2 for n in edges.values()),'rays':probes,'rayHits':{k:{'tested':len(v),'withSkinHit':sum(x['triangleHits']>0 for x in v)} for k,v in probes.items()},'earSideTriangleCounts':earCounts,'faceTargetNames':next(m for m in g.j['meshes'] if m['name'].startswith('Face'))['extras']['targetNames']}
 # Save actual skin-only triangle data for compact CPU diagnostic plotting.
 np.savez_compressed(OUT/f'{sex}-head-skin.npz',triangles=head,headMin=headMin,headMax=headMax,centerX=cx)
OUT.mkdir(parents=True,exist_ok=True);(OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({sex:{k:v[k] for k in ['skinHeadTriangles','headRangeY','rayHits','earSideTriangleCounts','boundaryComponentsAfter10umDiagnosticWeld','nonmanifoldEdgesAfterDiagnosticWeld']} for sex,v in report['bodies'].items()},indent=2))
