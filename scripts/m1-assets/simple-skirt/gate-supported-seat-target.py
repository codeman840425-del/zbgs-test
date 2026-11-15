"""One exact triangle gate for the frozen offline bent-tube target."""
from pathlib import Path
import gzip,hashlib,json,time
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'pose-support-v1'
assert R.name=='m1-simple-skirt-worktree'and not(O/'geometry-gate.json').exists()
capture=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()));f=capture['frames'][2];sample=json.loads(gzip.decompress((O/'geometry.json.gz').read_bytes()));p=np.array(sample['positions']);tri=np.array(sample['triangles'])
tree=lambda p,t:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(t).tolist(),all_triangles=True)
ct=tree(p,tri);caps=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))['removedOriginalFaces']);rows=[];start=time.monotonic()
for m in f['colliders']:
 if not(m['name'].startswith('Body')or'uniform-top'in m['name']):continue
 points=np.array(m['positions']).reshape(-1,3);faces=np.array(m['triangles']).reshape(-1,3);pairs=ct.overlap(tree(points,faces));internal=[(a,b)for a,b in pairs if m['name']=='m1-uniform-top_1'and b in caps];other=[(a,b)for a,b in pairs if(a,b)not in internal]
 rows.append({'name':m['name'],'pairs':pairs,'count':len(pairs),'internalTopCap':len(internal),'nonCap':len(other)})
for box in f['chair']:
 lo=box['min'];hi=box['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);faces=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=ct.overlap(tree(q[:,:3],faces));rows.append({'name':box['name'],'pairs':pairs,'count':len(pairs),'chair':True})
# Weld by original source topology, never treat newly coincident crossing points
# as authored adjacency. Exact source duplicates on the seam remain adjacent.
ids={};weld=[]
for point in np.round(np.array(sample['sourcePositions']),7):key=tuple(point);ids.setdefault(key,len(ids));weld.append(ids[key])
wt=np.array(weld)[tri];selfpairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(wt[a])&set(wt[b]))]
result={'status':'failed-material-and-or-contact-target-not-installed','seconds':time.monotonic()-start,'pose':'seated','authorReportSha256':hashlib.sha256((O/'author-target.json').read_bytes()).hexdigest(),'contacts':rows,'selfPairs':selfpairs,'selfCount':len(selfpairs),'limits':['All actual body retained, including old hand pose; not a new closed-loop hand fit.','No alpha or exposed-visibility claim from pair counts.','Material distortion is an independent failure even if contact count improves.']}
(O/'geometry-gate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'seconds':result['seconds'],'contacts':[(x['name'],x['count'],x.get('nonCap'))for x in rows],'selfCount':len(selfpairs)}))
