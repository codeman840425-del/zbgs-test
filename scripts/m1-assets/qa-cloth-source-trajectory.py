"""Native BVH of initial sim/render surfaces and every fully pinned source pose.
No physics or browser: failures here are impossible pin constraints, not cloth.
"""
import json,pathlib,time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=pathlib.Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';O=R/'assets-source/m1/offline-corrective/local-sim-v1';m=json.loads((O/'simulation-mesh.json').read_text(encoding='utf8'));trajectory=json.loads((O/'trajectory.json').read_text(encoding='utf8'));C=R/trajectory['capture'];c=json.loads((C/'capture.json').read_text(encoding='utf8'));top=json.loads((S/'top-edit.json').read_text(encoding='utf8'));pin=np.fromfile(O/'pin-targets.f32',dtype='<f4').reshape(270,m['simulationVertices'],3);colliders=np.fromfile(C/'colliders.f32',dtype='<f4').reshape(270,-1,3);faces=np.array(m['simulationTriangles']);original=np.array(m['originalWeldedTriangles']);refs=np.array(m['sourcePinReferenceHipLocal']);fully=np.flatnonzero(np.array(m['pinWeights'])>=1-1e-12);pinFaces=faces[np.all(np.isin(faces,fully),axis=1)];allEdges=sorted(set(tuple(sorted((int(a),int(b))))for t in faces for a,b in zip(t,np.roll(t,-1))));pinEdges=[e for e in allEdges if all(i in fully for i in e)];topology=[];offset=0
for info in c['topology']['colliders']:
 n=info['vertexCount'];f=np.array(info['triangles']).reshape(-1,3)
 if info['name']=='m1-uniform-top_1':f=np.delete(f,top['removedOriginalFaces'],axis=0)
 topology.append((info['name'],offset,n,f));offset+=n
assert offset==colliders.shape[1];started=time.monotonic();records=[];initial=[];minBody=None
for frame,meta in enumerate(c['frames']):
 p=pin[frame];tree=BVHTree.FromPolygons(p.tolist(),pinFaces.tolist(),all_triangles=True)if len(pinFaces)else None;contacts=[]
 for name,start,n,f in topology:
  if name not in ['Bodybaked','m1-uniform-top_1']:continue
  other=colliders[frame,start:start+n];bt=BVHTree.FromPolygons(other.tolist(),f.tolist(),all_triangles=True);pairs=tree.overlap(bt)if tree else [];edgeHits=[]
  for a,b in pinEdges:
   direction=p[b]-p[a];length=float(np.linalg.norm(direction))
   if length<1e-10:continue
   q,normal,face,distance=bt.ray_cast(Vector(p[a]),Vector(direction/length),length)
   if q is not None and distance is not None and 1e-7<distance<length-1e-7:edgeHits.append({'edge':[a,b],'face':face,'distance':distance})
  if pairs or edgeHits:contacts.append({'name':name,'pairs':pairs,'fixedEdgeCrossings':edgeHits})
  if frame==0:
   for label,ff in [('simulation',faces),('original-render-remap',original)]:
    st=BVHTree.FromPolygons(p.tolist(),ff.tolist(),all_triangles=True);initial.append({'surface':label,'collider':name,'pairs':st.overlap(bt)})
  if name=='Bodybaked':
   negative=[]
   for i in fully:
    q,normal,face,distance=bt.find_nearest(Vector(p[i]))
    if distance is not None and(minBody is None or distance<minBody['distance']):minBody={'frame':frame+1,'pinVertex':int(i),'bodyFace':face,'distance':distance,'normalSigned':float((Vector(p[i])-q).dot(normal))}
    if distance is not None and float((Vector(p[i])-q).dot(normal))<-.00001:negative.append({'vertex':int(i),'bodyFace':face,'normalSigned':float((Vector(p[i])-q).dot(normal))})
   if negative:contacts.append({'name':name,'pairs':[],'fixedEdgeCrossings':[],'negativeNearestNormalCandidates':negative,'qualification':'Conservative unresolved inside-side candidate; not a closed-solid point-in-volume proof'})
 records.append({'frame':frame+1,'mode':meta['mode'],'sitProgress':meta['sitProgress'],'pinnedSurfaceContacts':contacts})
report={'status':'source-trajectory-ready-for-bounded-cloth'if not any(x['pairs']for x in initial)and not any(x['pinnedSurfaceContacts']for x in records)else'rejected-source-pin-or-initial-intersection','captureBuild':trajectory['captureBuild'],'frames':270,'seconds':time.monotonic()-started,'fullPinVertices':len(fully),'fullPinTriangles':len(pinFaces),'fixedEdges':len(pinEdges),'pinDefinition':m['pinDefinition'],'minimumPinnedVertexToBody':minBody,'initial':initial,'records':records,'limits':['Fully pinned vertices/edges/faces checked over full trajectory; partially weighted/unpinned body contacts need actual simulation','No collision thickness guarantee for later frames','Historical source trajectory, not final game acceptance']}
(O/'source-trajectory-check.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'status':report['status'],'seconds':report['seconds'],'fullPinVertices':len(fully),'fullPinTriangles':len(pinFaces),'initialPairs':sum(len(x['pairs'])for x in initial),'pinConflictFrames':sum(bool(x['pinnedSurfaceContacts'])for x in records),'minimumPinnedVertexToBody':minBody}))
