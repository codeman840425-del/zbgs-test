"""Read-only posed lower-top outward-support rays, no candidate or collision exclusions."""
from pathlib import Path
import ast,json,gzip,struct,hashlib
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'top-hem-corrective-v1';O.mkdir(exist_ok=True)
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed']);a=asset(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));e=json.loads((S/'top-hem-fit-v1/source-fit-evidence.json').read_text());F=a['F'];core=e['coreFailedFaces'];ids=np.array([q['topVertex']for q in e['nearestSourceCorrespondences']]);rows=[]
for k in [18,28,34,59]:
 fr=cap['frames'][k];P=posed(a,fr);body=next(x for x in fr['colliders']if x['name']=='Bodybaked');BP=np.array(body['positions']).reshape(-1,3);BF=np.array(body['triangles']).reshape(-1,3);bt=BVHTree.FromPolygons(BP.tolist(),BF.tolist(),all_triangles=True);records=[]
 for fi in core:
  tri=P[F[fi]];n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);n/=np.linalg.norm(n)
  samples=np.concatenate([tri,(tri+tri[[1,2,0]])*.5,tri.mean(0)[None,:]])
  for si,p in enumerate(samples):
   q,no,face,near=bt.find_nearest(p);signed=float(np.dot(p-q,no));offset=0.;hits=[]
   for it in range(8):
    hit,hn,hf,dist=bt.ray_cast(p+n*offset,n,.06-offset)
    if hit is None:break
    hits.append({'bodyFace':hf,'distanceMetres':float(dist+offset),'exitOrientationDot':float(np.dot(hn,n))});offset+=dist+1e-6
    if offset>=.06:break
   exiting=[h for h in hits if h['exitOrientationDot']>0]
   records.append({'topFace':fi,'sample':si,'world':p.tolist(),'outward':n.tolist(),'nearestSignedMetres':signed,'nearestBodyFace':face,'nearestDistanceMetres':near,'hitsWithin60mm':hits,'firstExitDistanceMetres':exiting[0]['distanceMetres']if exiting else None})
 rows.append({'frame':k+1,'records':records,'nearestSignedMinMetres':min(x['nearestSignedMetres']for x in records),'maxFirstExitMetres':max([x['firstExitDistanceMetres']for x in records if x['firstExitDistanceMetres']is not None]or[0]),'insideWithoutOutwardExit':sum(x['nearestSignedMetres']<0 and x['firstExitDistanceMetres']is None for x in records)})
report={'sourceSha256':a['sha'],'scope':'No fitting: original24 failedtopfaces at4actualposes; vertices/midpoints/centroids outwardrays','domainSourceYBelow':.98,'domainVertexCount':len(ids),'domainSourceBounds':[a['P'][ids].min(0).tolist(),a['P'][ids].max(0).tolist()],'rows':rows,'limits':['Signed nearest and ray orientation of visual mesh are local diagnostics, not solid containment.','No body faces removed, no target or topology created.','60mm ray limit is measurement range, not permission for displacement.','Some samepoint samples repeat across faces, counts not unique vertices.']};(O/'body-space-rays.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k]for k in ['domainSourceBounds','domainVertexCount']}));print(json.dumps([{k:r[k]for k in ['frame','nearestSignedMinMetres','maxFirstExitMetres','insideWithoutOutwardExit']}for r in rows]))
