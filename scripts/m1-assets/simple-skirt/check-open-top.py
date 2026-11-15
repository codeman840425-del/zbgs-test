"""Use the existing exact open-top GLB at the same captured269 pose. No fit edits."""
from pathlib import Path
import json,gzip,struct,hashlib
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';G=S/'generated-v3'
def mesh(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def a(i):
  q=d['accessors'][i];v=d['bufferViews'][q['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[q['type']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[q['componentType']]);return np.ndarray((q['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+q.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 p=d['meshes'][0]['primitives'][0];s=d['skins'][0]
 return {'sha256':hashlib.sha256(b).hexdigest(),'p':a(p['attributes']['POSITION']),'j':a(p['attributes']['JOINTS_0']),'w':a(p['attributes']['WEIGHTS_0']),'uv':a(p['attributes']['TEXCOORD_0']),'f':a(p['indices']).reshape(-1,3),'names':[d['nodes'][i]['name']for i in s['joints']],'inverse':a(s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)}
frame=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()))['frames'][0];old=next(m for m in frame['colliders']if m['name']=='m1-uniform-top_1');opened=mesh(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');edit=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'));assert opened['sha256']==edit['resultSha256']
palette=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in opened['names']])@opened['inverse'];p=np.c_[opened['p'],np.ones(len(opened['p']))]@np.array(frame['sourceBind']).reshape(4,4);world=np.zeros_like(p)
for k in range(4):world+=np.einsum('nij,nj->ni',palette[opened['j'][:,k]],p)*opened['w'][:,k,None]
mapping=np.array(edit['resultRenderVertexToOriginal']);expected=np.array(old['positions']).reshape(-1,3)[mapping];error=float(np.linalg.norm(world[:,:3]-expected,axis=1).max());assert error<2e-6
geometry=json.loads(gzip.decompress((G/'four-pose-geometry.json.gz').read_bytes()));points=np.array(geometry['poses'][0]);tri=np.array(geometry['triangles']);skirt=BVHTree.FromPolygons(points.tolist(),tri.tolist(),all_triangles=True);top=BVHTree.FromPolygons(world[:,:3].tolist(),opened['f'].tolist(),all_triangles=True);pairs=skirt.overlap(top)
survivors=[i for i in range(len(old['triangles'])//3)if i not in edit['removedOriginalFaces']];mapped=[(a,survivors[b])for a,b in pairs];previous=json.loads((G/'four-pose-gate.json').read_text(encoding='utf-8'));body=next(c for c in previous['poses'][0]['collisions']if c['name']=='Bodybaked');former=next(c for c in previous['poses'][0]['collisions']if c['name']=='m1-uniform-top_1');assert set(mapped)=={tuple(p)for p in former['otherPairs']}
result={'status':'standing-open-top-existing-source-check-still-failed','build':'269a73423c97','candidateSha256':geometry['candidateSha256'],'openedTopSha256':opened['sha256'],'samePoseSurvivingVertexMaximumErrorMetres':error,'removedOriginalCapFaces':edit['removedOriginalFaces'],'topClosedPairs':former['candidatePairCount'],'topOpenPairs':len(pairs),'topPairsMappedToOriginalFaces':mapped,'unchangedBodyPairs':body['candidatePairs'],'sourcePositionsUVWeightsUnchanged':True,'limits':['Exact existing open-top only, no new garment radius/weight/collider changes.','Cap removal is explicit existing source repair, not hiding arbitrary intersections.','Remaining296 side-surface pairs need alpha/exposure review; numbers alone are not severity.']}
(G/'open-top-gate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in result.items()if k not in ['topPairsMappedToOriginalFaces','unchangedBodyPairs']},indent=2))
