"""Original native triangle/distance gates, plus fixed source-fit gap budget.
No cloth. No automatic retries or source mutations.
"""
import json,time,hashlib,sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/cloth-admission-v1';D=(R/sys.argv[sys.argv.index('--source-fit')+1]).resolve() if '--source-fit' in sys.argv else O/'source-fit';read=lambda p:json.loads(p.read_text(encoding='utf-8'));fit=read(D/'fit-result.json');cfg=fit['config'];cap=read(R/cfg['initialCapture']);points=np.array(fit['positionsWorld']);faces=np.array(fit['triangles']);tree=BVHTree.FromPolygons(points.tolist(),faces.tolist(),all_triangles=True);start=time.monotonic()
def segment_distance(a,b,c,d):
 u=b-a;v=d-c;w=a-c;A=u@u;B=u@v;C=v@v;D=u@w;E=v@w;den=A*C-B*B
 if A<1e-25:return float(np.linalg.norm(a-(c+np.clip(E/max(C,1e-25),0,1)*v)))
 if C<1e-25:return float(np.linalg.norm(c-(a+np.clip(-D/A,0,1)*u)))
 s=np.clip((B*E-C*D)/den,0,1)if den>1e-25 else 0.;t=(B*s+E)/C
 if t<0:t=0.;s=np.clip(-D/A,0,1)
 elif t>1:t=1.;s=np.clip((B-D)/A,0,1)
 return float(np.linalg.norm(w+s*u-t*v))
def triangle_distance(a,b):
 av=[Vector(x)for x in a];bv=[Vector(x)for x in b];values=[(x-closest_point_on_tri(x,*bv)).length for x in av]+[(x-closest_point_on_tri(x,*av)).length for x in bv];values += [segment_distance(x,y,z,w)for x,y in zip(a,np.roll(a,-1,axis=0))for z,w in zip(b,np.roll(b,-1,axis=0))];return min(values)
def exactMinimum(other,selected,range):
 low,high=other.min(axis=1),other.max(axis=1);best=None;tested=0
 for i in selected:
  face=points[faces[i]];candidates=np.flatnonzero(np.all(high>=face.min(0)-range,axis=1)&np.all(low<=face.max(0)+range,axis=1))
  for j in candidates:
   d=triangle_distance(face,other[j]);tested+=1
   if best is None or d<best['distance']:best={'skirtFace':int(i),'otherFace':int(j),'distance':d}
 return {'minimum':best,'testedTrianglePairs':tested,'searchRangeMetres':range,'noCandidatesMeansAtLeastRange':best is None}
rows=[];failures=[]
for m in cap['colliders']:
 if m['name']=='m1-uniform-top_1':p=np.array(fit['topPositionsWorld']);f=np.array(fit['topTriangles'])
 else:p=np.array(m['positions']);f=np.array(m['triangles']).reshape(-1,3)
 bt=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True);pairs=tree.overlap(bt);row={'name':m['name'],'trianglePairs':pairs}
 if pairs:failures.append({'kind':'actual-triangle-crossing','mesh':m['name'],'pairs':len(pairs)})
 if m['name']in ['Bodybaked','m1-uniform-top_1']:
  minimum=exactMinimum(p[f],range(len(faces)),.003);row['exactNearTriangleMinimum']=minimum;target=cfg['bodyMinimumGapMetres']if m['name']=='Bodybaked'else cfg['topMinimumGapMetres']
  if minimum['minimum']and minimum['minimum']['distance']<target-1e-7:failures.append({'kind':'global-gap-target','mesh':m['name'],'required':target,'actual':minimum['minimum']['distance']})
  if m['name']=='Bodybaked':
   patch=exactMinimum(p[f],cfg['historicalFailureSkirtFaces'],.012);row['failurePatchExactMinimum']=patch
   if patch['minimum']and patch['minimum']['distance']<cfg['failurePatchBodyGapMetres']-1e-7:failures.append({'kind':'patch-gap-target','required':cfg['failurePatchBodyGapMetres'],'actual':patch['minimum']['distance']})
 rows.append(row)
selfPairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(faces[a])&set(faces[b]))]
if selfPairs:failures.append({'kind':'nonadjacent-self-crossing','pairs':len(selfPairs)})
for field in ['skirtMaxAdditionalDisplacement','topMaxAdditionalDisplacement']:
 if fit[field]>cfg['maximumAdditionalSourceDisplacementMetres']+1e-10:failures.append({'kind':'source-displacement-budget','field':field,'actual':fit[field]})
assert len(fit['actualWaistBoundary'])==20
assert all(fit['pinWeights'][i]==1 for i in fit['actualWaistBoundary'])
report={'status':'rejected-no-native-cloth-authorized'if failures else'static-admission-only-not-cloth-pass','elapsedSeconds':time.monotonic()-start,'sourceFitSha256':hashlib.sha256((D/'fit-result.json').read_bytes()).hexdigest(),'colliders':rows,'selfPairs':selfPairs,'failures':failures,'pins':{'boundaryVertices':20,'fullBoundaryPin':True,'releaseMetres':.025},'distanceRoundoffToleranceMetres':1e-7,'limits':['Native all actual triangles kept except independently verified original top/waistcaps.','Distance gate is exact near-triangle vertex/face+edge/edge for nonintersecting surfaces; noCCD or sustainedcloth conclusion.','Opening/pin and margin preparation do not resolve long-face interior contact generally.','On any failure do not start nativecloth or tune this candidate.']}
(D/'static-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':report['status'],'seconds':report['elapsedSeconds'],'failures':failures,'selfPairs':len(selfPairs),'distances':[{k:v for k,v in row.items()if k!='trianglePairs'}for row in rows if row['name']in ['Bodybaked','m1-uniform-top_1']]},indent=2))
if failures:raise SystemExit(2)
