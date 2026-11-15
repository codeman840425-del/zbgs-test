"""Full actual nonadjacent triangle separation; no cloth execution."""
from pathlib import Path
R=Path(__file__).resolve().parents[3];src=R/'scripts/m1-assets/simple-skirt/diagnose-two-quad-dynamic.py';text=src.read_text().split('initialRender=')[0];text=text.replace("load(A/'m1-sixfold-skirt-two-quad-thirds-v1.glb')","load(S/'hem-gap16-v1/m1-sixfold-skirt-hem-gap16-v1.glb')");exec(compile(text,str(src),'exec'),globals())
O=S/'hem-gap16-v1';p=posed(cap['frames'][0]);tri=p[rf];lo=tri.min(1);hi=tri.max(1);pairs=[]
for i in range(len(tri)):
 delta=np.maximum(np.maximum(lo[i]-hi,lo-hi[i]),0);ids=np.flatnonzero(np.linalg.norm(delta,axis=1)<.002)
 for j in ids:
  if j>i and not(set(faces[i])&set(faces[j])):pairs.append([i,int(j)])
pairs=np.array(pairs);a=tri[pairs[:,0]];b=tri[pairs[:,1]];ds=[point_tri(a[:,k],b)for k in range(3)]+[point_tri(b[:,k],a)for k in range(3)]
for i,j in [(0,1),(1,2),(2,0)]:
 for k,l in [(0,1),(1,2),(2,0)]:ds.append(seg_seg(a[:,i],a[:,j],b[:,k],b[:,l]))
ds=np.sqrt(np.min(ds,axis=0));bothPin=np.array([all(int(v)in fixed for v in faces[a])and all(int(v)in fixed for v in faces[b])for a,b in pairs]);failed=np.flatnonzero(ds<.001);eligible=~bothPin
rows=[{'faces':pairs[k].tolist(),'parentFaces':lineage[pairs[k]].tolist(),'distanceMetres':float(ds[k]),'bothFullyPinned':bool(bothPin[k]),'regions':[region(int(x))for x in pairs[k]]}for k in np.argsort(ds)[:20]]
gate=json.loads((O/'geometry-gate.json').read_text());parent=json.loads((A/'geometry-gate.json').read_text());changes=[]
for nr,pr in zip(gate['rows'],parent['rows']):
 for nc,pc in zip(nr['contacts'],pr['contacts']):
  added=sorted(set(map(tuple,nc['pairs']))-set(map(tuple,pc['pairs'])));removed=sorted(set(map(tuple,pc['pairs']))-set(map(tuple,nc['pairs'])))
  if added or removed:changes.append({'label':nr['label'],'name':nc['name'],'parentCount':pc['count'],'count':nc['count'],'added':[{'pair':list(q),'parentFace':int(lineage[q[0]]),'region':region(q[0])}for q in added],'removed':[list(q)for q in removed]})
report={'candidateSha256':gate['candidateSha256'],'basis':'actual58394private standing LBS; all render triangles, no shared simulation vertex','broadphaseRangeMetres':.002,'exactPairCount':len(pairs),'allNonAdjacentMinMetres':float(ds.min()),'allNonAdjacentUnder1mm':len(failed),'officialEligibleMinMetres':float(ds[eligible].min()),'officialEligibleUnder1mm':int(np.sum((ds<.001)&eligible)),'closest':rows,'fourPoseChanges':changes,'admitted':False,'reason':'rise adds body intersections; stop without cloth or parameter scan'}
(O/'clearance-and-parent-comparison.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
