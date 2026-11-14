"""Blender native BVH qualification only. No cloth, no product edits.
Run under an assigned CPU window; preserves all visible noncap colliders.
"""
import json,pathlib,sys,time
import numpy as np
from mathutils import Vector
from mathutils.geometry import closest_point_on_tri
from mathutils.bvhtree import BVHTree
R=pathlib.Path(__file__).resolve().parents[2];O=R/'assets-source/m1/offline-corrective/open-waist-v1';start=time.monotonic()
c=json.loads((R/'experiments/skirt-offline-corrective/displayed-initial-0df63cf2bdea/standing-01/initial.json').read_text(encoding='utf8'));r=json.loads((O/'standing-rest-candidate.json').read_text(encoding='utf8'));top=json.loads((O/'top-edit.json').read_text(encoding='utf8'));points=np.array(r['positionsWorld']);tri=r['triangles'];tree=BVHTree.FromPolygons(points.tolist(),tri,all_triangles=True)
if '--ring'in sys.argv:
 O=R/'assets-source/m1/offline-corrective/ring-cage-v1';ring=json.loads((O/'cage-and-binding.json').read_text(encoding='utf8'));points=np.array(ring['positionsWorld']);tri=ring['triangles'];tree=BVHTree.FromPolygons(points.tolist(),tri,all_triangles=True)
edges=sorted(set(tuple(sorted((a,b)))for t in tri for a,b in zip(t,t[1:]+t[:1])));samples=[]
for a,b in edges:
 for x in np.linspace(0,1,max(2,int(np.ceil(np.linalg.norm(points[a]-points[b])/.001))+1)):
  samples.append(points[a]*(1-x)+points[b]*x)
rows=[]
def segment_distance(a,b,c,d):
 u=b-a;v=d-c;w=a-c;A=u@u;B=u@v;C=v@v;D=u@w;E=v@w;den=A*C-B*B
 if A<1e-25:return float(np.linalg.norm(a-(c+np.clip(E/max(C,1e-25),0,1)*v)))
 if C<1e-25:return float(np.linalg.norm(c-(a+np.clip(-D/A,0,1)*u)))
 s=np.clip((B*E-C*D)/den,0,1)if den>1e-25 else 0.;t=(B*s+E)/C
 if t<0:t=0.;s=np.clip(-D/A,0,1)
 elif t>1:t=1.;s=np.clip((B-D)/A,0,1)
 return float(np.linalg.norm(w+s*u-t*v))
def triangle_distance(a,b):
 av=[Vector(x)for x in a];bv=[Vector(x)for x in b]
 values=[(x-closest_point_on_tri(x,*bv)).length for x in av]+[(x-closest_point_on_tri(x,*av)).length for x in bv]
 values += [segment_distance(x,y,z,w)for x,y in zip(a,np.roll(a,-1,axis=0))for z,w in zip(b,np.roll(b,-1,axis=0))]
 return min(values)
for m in c['colliders']:
 faces=np.array(m['triangles']).reshape(-1,3)
 if m['name']=='m1-uniform-top_1':faces=np.delete(faces,top['removedOriginalFaces'],axis=0)
 bt=BVHTree.FromPolygons(m['positions'],faces.tolist(),all_triangles=True);pairs=tree.overlap(bt);minimum=None
 for i,p in enumerate(samples):
  q,normal,face,distance=bt.find_nearest(Vector(p))
  if distance is not None and(minimum is None or distance<minimum['distance']):minimum={'sample':i,'point':p.tolist(),'nearest':list(q),'face':face,'distance':distance}
 exact=None
 if m['name']in ['Bodybaked','m1-uniform-top_1']:
  pv=np.array(m['positions']);ff=np.array(tri);other=pv[faces];low=other.min(axis=1);high=other.max(axis=1);proximityPairs=[]
  for i,face in enumerate(points[ff]):
   for j in np.flatnonzero(np.all(high>=face.min(axis=0)-.003,axis=1)&np.all(low<=face.max(axis=0)+.003,axis=1)):proximityPairs.append((i,int(j)))
  for i,j in proximityPairs:
   dist=triangle_distance(points[ff[i]],pv[faces[j]])
   if exact is None or dist<exact['distance']:exact={'skirtTriangle':i,'colliderTriangle':j,'distance':dist}
  if exact is not None:exact['candidatePairs']=len(proximityPairs)
 rows.append({'name':m['name'],'trianglePairs':pairs,'minimumSampledEdgeDistance':minimum,'exactNearTriangleMinimum':exact})
selfpairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(tri[a])&set(tri[b]))]
report={'status':'native-bvh-clear-not-cloth-accepted'if not selfpairs and all(not x['trianglePairs']for x in rows)else'rejected-native-bvh',
 'method':'Native BVH all preserved visible collider triangles; only verified top source cap replaced by its opened version. Cloth edge samples <=1mm apart find nearest triangle points. Sampled minimum is an upper bound on global clearance. For body/top: AABB expanded3mm proximity candidates then exact vertex-face + edge-edge distances, valid for these nonintersecting triangle pairs; minimum below expansion range bounds global minimum. No cloth simulation.',
 'seconds':time.monotonic()-start,'edgeSamples':len(samples),'colliders':rows,'selfPairs':selfpairs,'limits':['No visual rest approval','No actual cloth thickness acceptance','Standing only']}
(O/'native-initial-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'status':report['status'],'seconds':report['seconds'],'selfPairs':len(selfpairs),'colliders':[{'name':x['name'],'pairs':len(x['trianglePairs']),'sampledMin':x['minimumSampledEdgeDistance']['distance']if x['minimumSampledEdgeDistance']else None,'exactNearMin':x['exactNearTriangleMinimum']}for x in rows]}))
