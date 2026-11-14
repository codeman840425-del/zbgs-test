"""Bounded offline triangle checks of both-cap-open and fitted rest candidates.
Pure numpy AABB broadphase + actual triangle intersection segments; no Blender.
"""
import json,pathlib,sys,time
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];O=R/'assets-source/m1/offline-corrective/open-waist-v1';start=time.monotonic()
c=json.loads((R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json').read_text(encoding='utf8'));rest=json.loads((O/'standing-rest-candidate.json').read_text(encoding='utf8'));edit=json.loads((O/'edit.json').read_text(encoding='utf8'));topEdit=json.loads((O/'top-edit.json').read_text(encoding='utf8'));topology=json.loads((O/'topology.json').read_text(encoding='utf8'));f=np.array(topology['triangles']);mp=np.array(topology['renderToWeld']);used=np.array(edit['resultRenderVertexToOriginal']);p=np.array(c['displayed']['positions'])[used];shown=np.zeros((len(topology['position']),3));np.add.at(shown,mp,p);shown/=np.bincount(mp)[:,None]
def bary(p,t):
 v=t[1]-t[0];w=t[2]-t[0];q=p-t[0];a=v@v;b=w@w;z=v@w;den=a*b-z*z
 if abs(den)<1e-18:return None
 x=(q@v*b-q@w*z)/den;y=(q@w*a-q@v*z)/den;return np.array([1-x-y,x,y])
def segment(a,b):
 pts=[]
 for one,other in [(a,b),(b,a)]:
  n=np.cross(other[1]-other[0],other[2]-other[0]);length=np.linalg.norm(n)
  if length<1e-14:continue
  n/=length
  for p,q in zip(one,np.roll(one,-1,axis=0)):
   dp=(p-other[0])@n;dq=(q-other[0])@n
   if abs(dp-dq)<1e-12:continue
   u=dp/(dp-dq)
   if -1e-7<=u<=1+1e-7:
    x=p+u*(q-p);weights=bary(x,other)
    if weights is not None and min(weights)>=-1e-6 and not any(np.linalg.norm(x-y)<1e-7 for y in pts):pts.append(x)
 if len(pts)<2:return None
 a,b=max(((a,b)for a in pts for b in pts),key=lambda p:np.linalg.norm(p[0]-p[1]));return {'endpoints':[a.tolist(),b.tolist()],'length':float(np.linalg.norm(a-b))}
def check(a,b,selfFaces=None):
 low=b.min(axis=1);high=b.max(axis=1);rows=[];coplanar=0
 for i,tri in enumerate(a):
  candidates=np.flatnonzero(np.all(high>=tri.min(axis=0)-1e-7,axis=1)&np.all(low<=tri.max(axis=0)+1e-7,axis=1))
  for j in candidates:
   if selfFaces is not None and(j<=i or set(selfFaces[i])&set(selfFaces[j])):continue
   other=b[j];na=np.cross(tri[1]-tri[0],tri[2]-tri[0]);na/=max(np.linalg.norm(na),1e-30);nb=np.cross(other[1]-other[0],other[2]-other[0]);nb/=max(np.linalg.norm(nb),1e-30);da=(tri-other[0])@nb;db=(other-tri[0])@na
   if min(da)>1e-7 or max(da)<-1e-7 or min(db)>1e-7 or max(db)<-1e-7:continue
   if max(abs(da))<1e-7 and max(abs(db))<1e-7:coplanar+=1;continue
   s=segment(tri,other)
   if s and s['length']>1e-7:rows.append({'skirtFace':i,'otherFace':int(j),**s,'strictBothPlanes':bool(min(da)<-1e-5 and max(da)>1e-5 and min(db)<-1e-5 and max(db)>1e-5)})
 return {'pairs':rows,'coplanarAABBUnresolved':coplanar}
colliders=[]
for m in c['colliders']:
 if m['name']not in ['Bodybaked','m1-uniform-top_1']:continue
 ids=np.array(m['triangles']).reshape(-1,3)
 if m['name']=='m1-uniform-top_1':ids=np.delete(ids,topEdit['removedOriginalFaces'],axis=0)
 colliders.append((m['name'],np.array(m['positions'])[ids]))
results=[];destination=O/'triangle-check.json';shapes=[('both-caps-open-before-fit',shown,f),('radial-layer-fit',np.array(rest['positionsWorld']),f)]
if '--ring'in sys.argv:
 ringPath=R/'assets-source/m1/offline-corrective/ring-cage-v1';ring=json.loads((ringPath/'cage-and-binding.json').read_text(encoding='utf8'));shapes=[('regular-ring-cage',np.array(ring['positionsWorld']),np.array(ring['triangles'])),('detail-reconstructed-original-render',np.array(rest['positionsWorld']),f)];destination=ringPath/'static-triangle-check.json'
if '--recorded-ring'in sys.argv:
 trial=R/'experiments/skirt-offline-corrective/standing-ring-cage-v1';record=json.loads((trial/'result.json').read_text(encoding='utf8'));ring=json.loads((R/'assets-source/m1/offline-corrective/ring-cage-v1/cage-and-binding.json').read_text(encoding='utf8'));shapes=[]
 for frame in record['frames']:
  shapes.append((f"frame{frame['frame']}-simulation",np.array(frame['positionsWorld']),np.array(ring['triangles'])))
  shapes.append((f"frame{frame['frame']}-original-render",np.array(frame['originalRenderWeldedPositionsWorld']),f))
 destination=trial/'recorded-surface-check.json'
for label,vertices,shapeFaces in shapes:
 tri=vertices[shapeFaces];rows=[{'name':name,**check(tri,body)}for name,body in colliders];selfResult=check(tri,tri,shapeFaces)
 results.append({'candidate':label,'colliders':rows,'self':selfResult,'clearOfResolvedSegments':all(not r['pairs']for r in rows)and not selfResult['pairs']})
report={'method':'Original captured pose. Only explicitly removed garment cap faces omitted; all body and top sidewall retained. AABB then segment intersection, touching endpoints excluded at1e-7m. Coplanar unresolved counts are reported; this is not native BVH or normal-distance clearance acceptance.','seconds':time.monotonic()-start,'results':results}
destination.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'seconds':report['seconds'],'results':[{'candidate':r['candidate'],'colliders':[{'name':x['name'],'pairs':len(x['pairs']),'coplanarUnresolved':x['coplanarAABBUnresolved']}for x in r['colliders']],'selfPairs':len(r['self']['pairs']),'selfCoplanarUnresolved':r['self']['coplanarAABBUnresolved']}for r in results]}))
