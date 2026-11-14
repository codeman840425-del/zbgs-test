"""Read-only native BVH diagnosis of captured cloth initial condition (Blender)."""
import json,pathlib,numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
R=pathlib.Path(__file__).resolve().parents[2]; folder=R/'experiments/skirt-offline-corrective/capture-ca72ada827d2'
c=json.loads((folder/'capture.json').read_text(encoding='utf8'));t=json.loads((R/'experiments/skirt-offline-corrective/source-topology.json').read_text(encoding='utf8'))
s=np.fromfile(folder/'source.f32',dtype='<f4').reshape(len(c['frames']),-1,3)[0];body=np.fromfile(folder/'colliders.f32',dtype='<f4').reshape(len(c['frames']),-1,3)[0]
mp=np.array(t['renderToWeld']);w=np.zeros((len(t['position']),3));np.add.at(w,mp,s);w/=np.bincount(mp)[:,None];tri=t['triangles'];tree=BVHTree.FromPolygons(w.tolist(),tri,all_triangles=True)
rows=[];offset=0
for m in c['topology']['colliders']:
 n=m['vertexCount'];pts=body[offset:offset+n];offset+=n;ts=np.array(m['triangles']).reshape(-1,3).tolist();bt=BVHTree.FromPolygons(pts.tolist(),ts,all_triangles=True)
 near=[]
 for i,p in enumerate(w):
  q,normal,face,distance=bt.find_nearest(Vector(p))
  if distance is not None and distance<.015:near.append({'vertex':i,'distance':distance,'normalSigned':float((Vector(p)-q).dot(normal)),'hipLocalY':t['hipLocalPosition'][i][1]})
 overlaps=tree.overlap(bt)
 rows.append({'name':m['name'],'intersectingTrianglePairs':overlaps,'within15mm':near})
selfpairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(tri[a])&set(tri[b]))]
out={'captureBuild':c['identity']['runtimeBuild']['shortId'],'method':'Initial source surface BVH triangle intersections + nearest oriented surface distance; open garment signed distance is not an inside/outside proof. No simulation/no visual approval.','colliders':rows,'nonadjacentSelfIntersectionPairs':selfpairs}
p=folder/'initial-contact-diagnosis.json';p.write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps({'file':str(p),'selfPairs':len(selfpairs),'colliders':[{'name':r['name'],'trianglePairs':len(r['intersectingTrianglePairs']),'near15mm':len(r['within15mm']),'negativeNear':sum(v['normalSigned']<0 for v in r['within15mm'])}for r in rows]}))
