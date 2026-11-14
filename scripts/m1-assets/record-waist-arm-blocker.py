"""Exact historical capture frame and source bone identity for runtime owner.
No animation edits, browser, or collider removal.
"""
import collections,json,pathlib,struct
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];L=R/'assets-source/m1/offline-corrective/local-sim-v1';O=R/'assets-source/m1/offline-corrective/ring-cage-v1';C=R/'experiments/skirt-offline-corrective/capture-ca72ada827d2';capture=json.loads((C/'capture.json').read_text(encoding='utf8'));mesh=json.loads((L/'simulation-mesh.json').read_text(encoding='utf8'));rows=capture['topology']['colliders'];count=sum(m['vertexCount']for m in rows);positions=np.memmap(C/'colliders.f32',dtype='<f4',mode='r',shape=(270,count,3));pins=np.memmap(L/'pin-targets.f32',dtype='<f4',mode='r',shape=(270,mesh['simulationVertices'],3));offset=0
for m in rows:
 if m['name']=='Bodybaked':body=m;break
 offset+=m['vertexCount']
indices=np.array(body['triangles']).reshape(-1,3);source=R/'prototype/public/assets/foundation/base-female-roundtrip.vrm';raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize))
match=None
for meshIndex,m in enumerate(d['meshes']):
 for p in m['primitives']:
  ii=acc(p['indices']).reshape(-1,3)
  if ii.shape==indices.shape and np.array_equal(ii,indices):match=(meshIndex,p)
assert match,'Source primitive does not exactly match capture'
index,p=match;node=next(n for n in d['nodes']if n.get('mesh')==index);names=[d['nodes'][i]['name']for i in d['skins'][node['skin']]['joints']];j=acc(p['attributes']['JOINTS_0']);w=acc(p['attributes']['WEIGHTS_0']);faces=[3556,3557,3792,3794];boneRows=[]
for f in faces:
 totals=collections.Counter()
 for k,weight in zip(j[indices[f]].ravel(),w[indices[f]].ravel()):
  if weight>.001:totals[names[int(k)]]+=float(weight)
 boneRows.append({'bodyFace':f,'sourceVertexIndices':indices[f].tolist(),'meanBoneWeights':{k:v/3 for k,v in totals.items()}})
frames=[]
for frame in [76,77,78]:
 meta=capture['frames'][frame-1];xyz=positions[frame-1,offset:offset+body['vertexCount']];frames.append({'frame':frame,'time':meta['time'],'sitProgress':meta['sitProgress'],'hipWorld':meta['hipWorld'],'fixedWaistEdges':[{'simVertexIds':[a,b],'worldEndpoints':pins[frame-1,[a,b]].tolist()}for a,b in [(341,760),(343,763)]],'bodyForearmFaces':[{'face':f,'worldVertices':xyz[indices[f]].tolist()}for f in faces]})
result={'schema':'m1.source-waist-left-forearm-blocker.1','captureBuild':'ca72ada827d2','pinReferenceMesh':'local-sim-v1 original-waist boundary; IDs are not ring-cage-v1 IDs','bodySHA256':capture['identity']['primary']['actualSha256'],'colliderPositionsSHA256':capture['colliders.f32']['sha256'],'exactSourcePrimitiveIndexMatch':True,'boneEvidence':boneRows,'frames':frames,'interpretation':'Historical sit transition left forearm sweeps fixed waist boundary. Fixed pin-edge intersections plus inward-side nearest normals; not a cloth simulation failure. Do not remove arm collider or skip frame. Correct actual arm trajectory/garment relation and recapture for dynamic qualification.',
 'reproduceCaptureCommand':"$env:QA_M1_BUILD='ca72ada827d2'\n$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'\nnode scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/m1-assets/capture-skirt-corrective.cjs left-arm-repro",
 'reproduceAnalysis':['python scripts/m1-assets/prepare-local-cloth-mesh.py','python scripts/m1-assets/prepare-cloth-trajectory.py','Blender 4.5.9 --background --factory-startup --threads 2 --python scripts/m1-assets/qa-cloth-source-trajectory.py'],
 'limits':['Capture command requires exclusive assigned browser window; not executed again by this script','Repro uses fixed historical build, not current development code','New capture label refuses overwrite; analysis defaults documented original capture until explicit reviewed path change']}
(O/'source-arm-blocker.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'file':str(O/'source-arm-blocker.json'),'frame77WaistEdges':frames[1]['fixedWaistEdges'],'boneEvidence':boneRows}))
