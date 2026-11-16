"""Read-only localization of the original 8 mm operator and mouth components."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/mouth-visible-v2';BASE.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
results=[]
for sex in ['female','male']:
 rp=ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json';r=json.loads(rp.read_text(encoding='utf-8'));g=GLB(ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm');m=g.doc['meshes'][r['meshIndex']];p=m['primitives'][0];pos=g.acc(p['attributes']['POSITION']).astype(float);w=np.array(r['weights']);cx=r['centerX'];shapes=['Basis']+m['extras']['targetNames'];records=[];components=[]
 for pi,pr in enumerate(m['primitives']):
  mat=g.doc['materials'][pr['material']]['name'];tri=g.acc(pr['indices']).reshape(-1,3)
  for si,name in enumerate(shapes):
   q=pos+(g.acc(p['targets'][si-1]['POSITION'])if si else 0);n=q.copy();n[:,0]=cx+(q[:,0]-cx)*(1+.12*w);a=np.cross(q[tri[:,1]]-q[tri[:,0]],q[tri[:,2]]-q[tri[:,0]]);b=np.cross(n[tri[:,1]]-n[tri[:,0]],n[tri[:,2]]-n[tri[:,0]]);la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);angle=np.degrees(np.arccos(np.clip((a*b).sum(1)/np.maximum(la*lb,1e-30),-1,1)));angle[la<=1e-12]=-1;i=int(angle.argmax());ids=tri[i]
   records.append({'shape':name,'primitive':pi,'material':mat,'triangle':i,'vertices':ids.tolist(),'angleDeg':float(angle[i]),'originalAreaMm2':float(la[i]*.5e6),'newAreaMm2':float(lb[i]*.5e6),'weights':w[ids].tolist(),'originalMm':(q[ids]*1000).tolist(),'newMm':(n[ids]*1000).tolist(),'sourceBasisMm':(pos[ids]*1000).tolist()})
  if 'FaceMouth' in mat:
   adj={int(i):set()for i in np.unique(tri)}
   for t in tri:
    for a in t:adj[int(a)].update(int(b)for b in t if b!=a)
   left=set(adj)
   while left:
    seed=min(left);group={seed};stack=[seed];left.remove(seed)
    while stack:
     for b in adj[stack.pop()]:
      if b in left:left.remove(b);group.add(b);stack.append(b)
    ids=np.array(sorted(group));ts=tri[np.isin(tri[:,0],ids)];uv=g.acc(pr['attributes']['TEXCOORD_0'])[ids]
    components.append({'component':len(components),'vertexIds':ids.tolist(),'triangleCount':len(ts),'boundsMm':[pos[ids].min(0).tolist(),pos[ids].max(0).tolist()],'uvBounds':[uv.min(0).tolist(),uv.max(0).tolist()],'seamVertices':[int(i)for i in ids if i in np.array(r['mouthBoundaryPairs'])[:,1]]})
    components[-1]['boundsMm']=(np.array(components[-1]['boundsMm'])*1000).tolist()
 results.append({'sex':sex,'worstOriginal8mmPlus12':sorted(records,key=lambda x:x['angleDeg'],reverse=True)[:10],'mouthComponents':components})
(BASE/'inspection.json').write_text(json.dumps({'scriptSha256':sha(Path(__file__)),'results':results},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'sex':r['sex'],'worst':r['worstOriginal8mmPlus12'][0],'components':[{k:v for k,v in c.items()if k!='vertexIds'}for c in r['mouthComponents']]}for r in results],indent=2))
