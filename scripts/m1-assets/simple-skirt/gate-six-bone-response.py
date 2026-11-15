"""Actual captured triangle gate of one authored response and its seated target."""
from pathlib import Path
import gzip,hashlib,json,time
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'pose-response-v1'
assert R.name=='m1-simple-skirt-worktree' and not(O/'geometry-gate.json').exists()
source=gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes());capture=json.loads(source);samples=json.loads(gzip.decompress((O/'four-pose-geometry.json.gz').read_bytes()));tri=np.array(samples['triangles'])
cap=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))['removedOriginalFaces'])
def tree(p,t):return BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(t).tolist(),all_triangles=True)
results=[];start=time.monotonic()
for index,frame in enumerate(capture['frames']):
 candidates=[('six-rigid-bone',np.array(samples['positions'][index]))]
 if index==2:candidates.append(('author-target',np.array(samples['seatedAuthorTarget'])))
 for mode,p in candidates:
  ct=tree(p,tri);collisions=[]
  for mesh in frame['colliders']:
   if not('Body'in mesh['name']or'uniform-top'in mesh['name']):continue
   points=np.array(mesh['positions']).reshape(-1,3);faces=np.array(mesh['triangles']).reshape(-1,3);pairs=ct.overlap(tree(points,faces));caps=[pair for pair in pairs if mesh['name']=='m1-uniform-top_1'and pair[1]in cap];other=[pair for pair in pairs if pair not in caps]
   collisions.append({'name':mesh['name'],'pairs':pairs,'count':len(pairs),'internalTopCap':len(caps),'nonCap':len(other)})
  for box in frame['chair']:
   lo=box['min'];hi=box['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=ct.overlap(tree(q[:,:3],f));collisions.append({'name':box['name'],'pairs':pairs,'count':len(pairs),'chair':True})
  # Geometric duplicates on the true seam are adjacent after source welding;
  # identify at this same actual pose, retaining non-adjacent inner-hem events.
  ids={};weld=[]
  for point in np.round(p,7):key=tuple(point);ids.setdefault(key,len(ids));weld.append(ids[key])
  wt=np.array(weld)[tri];selfpairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(wt[a])&set(wt[b]))]
  results.append({'pose':frame['label'],'mode':mode,'collisions':collisions,'selfPairs':selfpairs,'selfCount':len(selfpairs)})
report={'status':'failed-if-any-original-gate-nonzero','sourceRawSha256':hashlib.sha256(source).hexdigest(),'responseSha256':hashlib.sha256((O/'six-bone-response.json').read_bytes()).hexdigest(),'seconds':time.monotonic()-start,'rows':results,'limits':['Old hands correspond to original default skirt; new real hand fitting not closed-loop here.','Triangle pairs are not exposed-hole counts; alpha and visibility separate.','Author target not automatically a valid surface merely because fitted.']}
(O/'geometry-gate.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'seconds':report['seconds'],'rows':[{'pose':x['pose'],'mode':x['mode'],'contacts':[(c['name'],c['count'],c.get('nonCap'))for c in x['collisions']],'self':x['selfCount']}for x in results]},indent=2))
