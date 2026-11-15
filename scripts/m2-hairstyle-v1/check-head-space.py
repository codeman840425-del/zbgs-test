"""Static finite-triangle intersection diagnostic; scalp contact is not appearance failure.
No coplanar overlap/CCD claim. The complete character remains in the source/render.
"""
import pathlib,sys,json,numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-hairstyle-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
s=GLB(ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm');r=json.loads((OUT/'build-report.json').read_text());hair=s.doc['meshes'][0]['primitives'][5];used=np.array(r['originalUsedVertices']);ht=np.searchsorted(used,s.acc(hair['indices']).reshape(-1,3))
def segment_hits(a,b,ts):
 d=b-a;e1=ts[:,1]-ts[:,0];e2=ts[:,2]-ts[:,0];h=np.cross(np.broadcast_to(d,e2.shape),e2);det=np.sum(e1*h,axis=1);ok=abs(det)>1e-12;f=np.zeros_like(det);f[ok]=1/det[ok];q=a-ts[:,0];u=f*np.sum(q*h,axis=1);v=f*np.sum(np.broadcast_to(d,e2.shape)*np.cross(q,e1),axis=1);t=f*np.sum(e2*np.cross(q,e1),axis=1)
 return ok&(u>1e-7)&(v>1e-7)&(u+v<1-1e-7)&(t>1e-7)&(t<1-1e-7)
def pairs(v,other,ids):
 result=[]
 for hi,tri in enumerate(v[ht]):
  mask=np.all(other.max(1)>=tri.min(0),axis=1)&np.all(other.min(1)<=tri.max(0),axis=1);ix=np.flatnonzero(mask);tt=other[ix]
  if not len(tt):continue
  hit=np.zeros(len(tt),dtype=bool)
  for j in range(3):hit|=segment_hits(tri[j],tri[(j+1)%3],tt)
  for k,t in enumerate(tt):
   for j in range(3):
    if segment_hits(t[j],t[(j+1)%3],tri[None])[0]:hit[k]=True
  result.extend([[hi,int(ids[ix[k]])]for k in np.flatnonzero(hit)])
 return result
res={}
for mi,m in enumerate(s.doc['meshes']):
 for pi,p in enumerate(m['primitives']):
  name=s.doc['materials'][p['material']]['name']
  if 'SKIN' not in name:continue
  v=s.acc(p['attributes']['POSITION']);t=s.acc(p['indices']).reshape(-1,3);mask=v[t][:,:,1].max(1)>1.30;ids=np.flatnonzero(mask);other=v[t[mask]]
  old=pairs(np.array(r['sourceWorldPositions']),other,ids);new=pairs(np.array(r['candidateWorldPositions']),other,ids)
  res[name]={'sourcePairs':old,'candidatePairs':new,'newPairs':[p for p in new if p not in old]}
out={'scope':'Bind pose only, head/neck skin triangles above 1.30m. Finite noncoplanar strict intersections; no all-action collision claim. Scalp/covered ear contact must be visually classified.','materials':res}
(OUT/'head-space-report.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print({k:{'original':len(v['sourcePairs']),'candidate':len(v['candidatePairs']),'new':len(v['newPairs'])}for k,v in res.items()})
