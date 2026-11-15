"""Blender BVH-assisted ONE frozen source fit, not cloth or runtime projection.
Changes actual authoring skirt/top mesh positions only; body source remains exact.
"""
from pathlib import Path
import json,hashlib,heapq,time,sys
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/cloth-admission-v1';D=O/'source-fit'
if '--out' in sys.argv:
 D=(R/sys.argv[sys.argv.index('--out')+1]).resolve();assert D.is_relative_to((R/'experiments').resolve()),'Replay output must be isolated experiments path'
D.mkdir(parents=True,exist_ok=True);P=O/'fit-plan.json';cfg=json.loads(P.read_text(encoding='utf-8'))
assert not(D/'fit-result.json').exists(),'One-shot source fit already exists; do not overwrite or search parameters'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));rest=read(R/cfg['sourceRest']);cap=read(R/cfg['initialCapture']);topEdit=read(R/cfg['sourceTopOpening']);topo=read(R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json')
skirt=np.array(rest['positionsWorld'],dtype=float);originalSkirt=skirt.copy();sf=np.array(rest['triangles']);body=next(m for m in cap['colliders']if m['name']=='Bodybaked');top=next(m for m in cap['colliders']if m['name']=='m1-uniform-top_1');topPos=np.array(top['positions'],dtype=float);originalTop=topPos.copy();topFaces=np.delete(np.array(top['triangles']).reshape(-1,3),topEdit['removedOriginalFaces'],axis=0)
bodyTree=BVHTree.FromPolygons(body['positions'],np.array(body['triangles']).reshape(-1,3).tolist(),all_triangles=True)
samples=np.array([[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]])
lo,hi=cfg['worldHeightEditBandMetres'];limit=cfg['maximumAdditionalSourceDisplacementMetres'];axis=np.array(rest['hipWorld']).reshape(4,4).T[:3,3]
affected=sorted(set(sf[cfg['historicalFailureSkirtFaces']].ravel()));distance=np.linalg.norm(originalSkirt[:,None]-originalSkirt[affected][None],axis=2).min(axis=1);weight=np.clip(1-distance/cfg['failurePatchFalloffMetres'],0,1);weight=weight*weight*(3-2*weight);targetGap=cfg['bodyMinimumGapMetres']+(cfg['failurePatchBodyGapMetres']-cfg['bodyMinimumGapMetres'])*weight
skirtMovable=(originalSkirt[:,1]>=lo)&(originalSkirt[:,1]<=hi);topMovable=(originalTop[:,1]>=lo)&(originalTop[:,1]<=hi)
# Shared raw positions may have UV/normal splits. Tailoring must not tear those.
topGroups={}
for i,p in enumerate(originalTop):topGroups.setdefault(tuple(np.round(p,7)),[]).append(i)
def enforceBudget(points,source,movable,groups=None):
 if groups:
  for ids in groups.values():
   if movable[ids].any():points[ids]=points[ids].mean(axis=0)
 delta=points-source;length=np.linalg.norm(delta,axis=1);clipped=length>limit;delta[clipped]*=(limit/length[clipped])[:,None];delta[~movable]=0;points[:]=source+delta;return int(clipped.sum())
def add(accum,counts,ids,bary,correction,movable):
 active=np.array([b>1e-10 and movable[i]for i,b in zip(ids,bary)])
 if not active.any():return
 denominator=float(np.sum(bary[active]**2))
 for i,b,on in zip(ids,bary,active):
  if on:accum[i]+=correction*b/denominator;counts[i]+=1
start=time.monotonic();progress=[]
for iteration in range(cfg['iterations']):
 accum=np.zeros_like(skirt);counts=np.zeros(len(skirt));worstBody=0
 for ids in sf:
  if not skirtMovable[ids].any():continue
  for bary in samples:
   p=bary@skirt[ids];q,n,face,d=bodyTree.find_nearest(Vector(p))
   if q is None:continue
   signed=float((Vector(p)-q).dot(n));want=float(bary@targetGap[ids]);violation=want-signed
   if violation>0:worstBody=max(worstBody,violation);add(accum,counts,ids,bary,np.array(n)*violation,skirtMovable)
 mask=counts>0;skirt[mask]+=accum[mask]/counts[mask,None];skirtClamps=enforceBudget(skirt,originalSkirt,skirtMovable)
 st=BVHTree.FromPolygons(skirt.tolist(),sf.tolist(),all_triangles=True);accum=np.zeros_like(topPos);counts=np.zeros(len(topPos));worstTop=0
 for ids in topFaces:
  if not topMovable[ids].any():continue
  for bary in samples:
   p=bary@topPos[ids];q,n,face,d=st.find_nearest(Vector(p))
   if q is None or d>.015:continue
   radial=p-axis;radial[1]=0;radial/=max(np.linalg.norm(radial),1e-15);direction=np.array(p)-np.array(q);signed=float(direction@radial)
   # Top is the outside layer: only move its actual surface outwards.
   violation=cfg['topMinimumGapMetres']-signed
   if violation>0:worstTop=max(worstTop,violation);add(accum,counts,ids,bary,radial*violation,topMovable)
 mask=counts>0;topPos[mask]+=accum[mask]/counts[mask,None];topClamps=enforceBudget(topPos,originalTop,topMovable,topGroups)
 progress.append({'iteration':iteration+1,'bodySampleCorrectionMaximum':worstBody,'topSampleCorrectionMaximum':worstTop,'skirtBudgetClampedVertices':skirtClamps,'topBudgetClampedVertices':topClamps})
# New pins derive from the real open-waist boundary, not a height-fixed cap band.
edgeCount={};neighbors=[[]for _ in skirt]
for face in sf:
 for a,b in zip(face,np.roll(face,-1)):
  key=tuple(sorted((int(a),int(b))));edgeCount[key]=edgeCount.get(key,0)+1
for a,b in edgeCount:
 d=float(np.linalg.norm(skirt[a]-skirt[b]));neighbors[a].append((b,d));neighbors[b].append((a,d))
boundary=[e for e,n in edgeCount.items()if n==1];remaining=set(i for e in boundary for i in e);components=[]
while remaining:
 comp=set();stack=[next(iter(remaining))]
 while stack:
  i=stack.pop()
  if i in comp:continue
  comp.add(i);remaining.discard(i)
  for e in boundary:
   if i in e:stack.extend(j for j in e if j not in comp)
 components.append(sorted(comp))
waist=max(components,key=lambda c:float(skirt[c,1].mean()));assert len(waist)==20
geodesic=np.full(len(skirt),np.inf);queue=[]
for i in waist:geodesic[i]=0;heapq.heappush(queue,(0,i))
while queue:
 d,i=heapq.heappop(queue)
 if d>geodesic[i]:continue
 for j,l in neighbors[i]:
  if d+l<geodesic[j]:geodesic[j]=d+l;heapq.heappush(queue,(d+l,j))
pin=np.clip(1-geodesic/.025,0,1);pin=pin*pin*(3-2*pin)
result={'status':'single-source-fit-awaiting-original-static-gates','parametersSha256':hashlib.sha256(P.read_bytes()).hexdigest(),'elapsedSeconds':time.monotonic()-start,'sourceBodyUnchanged':True,'sourceUVAndWeightsUnchangedByVertexMapping':True,'noNewClothTrial':True,'config':cfg,'positionsWorld':skirt.tolist(),'triangles':sf.tolist(),'topPositionsWorld':topPos.tolist(),'topTriangles':topFaces.tolist(),'actualWaistBoundary':waist,'pinWeights':pin.tolist(),'pinGeodesicDistances':geodesic.tolist(),'bodyTargetPerVertex':targetGap.tolist(),'skirtMaxAdditionalDisplacement':float(np.linalg.norm(skirt-originalSkirt,axis=1).max()),'topMaxAdditionalDisplacement':float(np.linalg.norm(topPos-originalTop,axis=1).max()),'progress':progress,'limits':['Authoring pose source only, not a newly bound runtime GLB. Original opened weighted GLBs and index mapping retained.','Seven-point constraint preparation is not static acceptance; exact native triangles/distances follow.','One fixed fit, no candidate search; failed targets will stop this branch.']}
(D/'fit-result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
# Real editable surface checkpoint. No cloth modifier, no body collider inflation.
bpy.ops.wm.read_factory_settings(use_empty=True)
def objectMesh(name,p,tri,uv=None,renderMap=None):
 points=p if renderMap is None else p[np.array(renderMap)];m=bpy.data.meshes.new(name);m.from_pydata(points.tolist(),[],np.array(tri).tolist());m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o)
 if uv is not None:
  layer=m.uv_layers.new(name='UnchangedSourceUV');layer.data.foreach_set('uv',np.array(uv).reshape(-1,2)[np.array(tri).ravel()].astype('f4').ravel())
 return o
obj=objectMesh('Candidate_ActualSkirtSourceFit',skirt,topo['renderTriangles'],topo['uv'],topo['renderToWeld']);g=obj.vertex_groups.new(name='ActualWaist_25mmGeodesicRelease')
for render,weld in enumerate(topo['renderToWeld']):
 if pin[weld]>0:g.add([render],float(pin[weld]),'REPLACE')
objectMesh('Candidate_ActualTopSourceFit',topPos,topFaces,top['uv']);objectMesh('Unchanged_ActualBody',np.array(body['positions']),np.array(body['triangles']).reshape(-1,3),body['uv'])
bpy.context.scene['scope']='Source-fit authoring checkpoint, exact source texture/skin data remain in referenced openedGLBs; not a runtime bound asset'
bpy.context.scene['parameters_sha256']=result['parametersSha256'];bpy.ops.wm.save_as_mainfile(filepath=str(D/'source-fit.blend'),compress=True)
print(json.dumps({k:result[k]for k in ['status','elapsedSeconds','skirtMaxAdditionalDisplacement','topMaxAdditionalDisplacement']}))
