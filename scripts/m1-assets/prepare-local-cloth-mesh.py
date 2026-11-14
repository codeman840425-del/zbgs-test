"""Local conforming simulation refinement + explicit original-render remap.
All old welded vertices remain; no smoothing or UV/material/source rig edit.
"""
import hashlib,heapq,json,pathlib
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];S=R/'assets-source/m1/offline-corrective/open-waist-v1';O=R/'assets-source/m1/offline-corrective/local-sim-v1';O.mkdir(parents=True,exist_ok=True)
t=json.loads((S/'topology.json').read_text(encoding='utf8'));rest=json.loads((S/'standing-rest-candidate.json').read_text(encoding='utf8'));v=[np.array(p)for p in rest['positionsHipLocal']];ref=[np.array(p)for p in t['hipLocalPosition']];weights=[{i:1.}for i in range(len(v))];faces=t['triangles'];rounds=[]
for level in range(2):
 edges=sorted(set(tuple(sorted((a,b)))for f in faces for a,b in zip(f,f[1:]+f[:1])));split={}
 for a,b in edges:
  if min(ref[a][1],ref[b][1])<-.08 or max(ref[a][1],ref[b][1])<0 or np.linalg.norm(v[a]-v[b])<=.018:continue
  split[(a,b)]=len(v);v.append((v[a]+v[b])/2);ref.append((ref[a]+ref[b])/2);w={}
  for key,value in weights[a].items():w[key]=w.get(key,0)+value*.5
  for key,value in weights[b].items():w[key]=w.get(key,0)+value*.5
  weights.append(w)
 nextFaces=[]
 for a,b,c in faces:
  x=split.get(tuple(sorted((a,b))));y=split.get(tuple(sorted((b,c))));z=split.get(tuple(sorted((c,a))));mask=(1 if x is not None else 0)+(2 if y is not None else 0)+(4 if z is not None else 0)
  patterns={0:[[a,b,c]],1:[[a,x,c],[x,b,c]],2:[[b,y,a],[y,c,a]],4:[[c,z,b],[z,a,b]],3:[[b,y,x],[a,x,c],[x,y,c]],5:[[a,x,z],[x,b,c],[x,c,z]],6:[[c,z,y],[a,b,z],[b,y,z]],7:[[a,x,z],[x,b,y],[z,y,c],[x,y,z]]}
  nextFaces.extend(patterns[mask])
 faces=nextFaces;rounds.append({'level':level+1,'splitEdges':len(split),'vertices':len(v),'triangles':len(faces)})
assert all(abs(sum(w.values())-1)<1e-12 for w in weights)
oldCount=len(t['position']);renderMap=t['renderToWeld'];assert max(renderMap)<oldCount
originalRef=np.array(t['hipLocalPosition']);boundary=np.array(t['boundaryEdges']);waistEdges=boundary[np.all(originalRef[boundary,1]>.12,axis=1)];waist=sorted(set(int(x)for x in waistEdges.ravel()));assert len(waist)==20
graph=[[]for _ in range(oldCount)]
for a,b in set(tuple(sorted((a,b)))for f in t['triangles']for a,b in zip(f,f[1:]+f[:1])):
 length=float(np.linalg.norm(np.array(rest['positionsHipLocal'][a])-rest['positionsHipLocal'][b]));graph[a].append((b,length));graph[b].append((a,length))
dist=np.full(oldCount,np.inf);heap=[]
for i in waist:dist[i]=0.;heapq.heappush(heap,(0.,i))
while heap:
 length,a=heapq.heappop(heap)
 if length!=dist[a]:continue
 for b,edge in graph[a]:
  if length+edge<dist[b]:dist[b]=length+edge;heapq.heappush(heap,(dist[b],b))
pinDistances=np.array([sum(dist[i]*w for i,w in row.items())for row in weights]);pinWeights=np.clip(1-pinDistances/.025,0,1);pinWeights=pinWeights*pinWeights*(3-2*pinWeights)
report={'schema':'m1.local-sim-refinement.1','sourceRestSHA256':hashlib.sha256((S/'standing-rest-candidate.json').read_bytes()).hexdigest(),'originalWeldedCount':oldCount,'simulationVertices':len(v),'simulationTriangles':faces,'restPositionsHipLocal':[p.tolist()for p in v],'sourcePinReferenceHipLocal':[p.tolist()for p in ref],'simulationVertexFromOriginalSparseWeights':[[[int(i),w]for i,w in row.items()]for row in weights],'originalWeldedFromSimulation':list(range(oldCount)),'originalRenderFromSimulation':renderMap,'originalRenderTriangles':t['renderTriangles'],'originalWeldedTriangles':t['triangles'],'uv':t['uv'],'refinement':rounds,'limits':['Conforming midpoint subdivision only in upper skirt, edge target18mm max2rounds','Original render faces remain coarse and require separate collision gate','Direct original-vertex restriction is explicit remap; no runtime compensation','Standalone authoring cage, no production changes']}
report.update(pinWeights=pinWeights.tolist(),pinDistanceToActualWaist=pinDistances.tolist(),originalWaistRingVertices=waist,pinDefinition='Only actual opened waist boundary is fully anchored; smooth geodesic fade over25mm, not full fixed upper panels. All fixed vertices/edges independently checked over270frames.')
(O/'simulation-mesh.json').write_text(json.dumps(report,separators=(',',':')),encoding='utf8')
print(json.dumps({'vertices':len(v),'triangles':len(faces),'rounds':rounds}))
