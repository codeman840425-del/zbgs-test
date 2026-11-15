"""Read-only original eye layers, bindings, rest pivots and all blink targets."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,collections,io,heapq
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-parameters-v1';BASE.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=json.loads((ROOT/'assets-source/face-parameters-v1/spec.json').read_text())['bodies']
report={'scope':'Read-only pinned original geometry, no new model/recipe or runtime admission. Ring-chain and nearest-point closure diagnostics are explicitly source-semantic hypotheses.','coordinates':'Original exported glTF metres; Y up, front -Z. Side labels use source X sign, not an inferred actor left/right.','bodies':{}}
for sex,source in sources.items():
 assert sha(ROOT/source['sourceVRM'])==source['sourceVRMSha256']and sha(ROOT/source['sourceBlend'])==source['sourceBlendSha256']
 g=GLB(ROOT/source['sourceVRM']);mi=next(i for i,m in enumerate(g.doc['meshes'])if m['name'].startswith('Face'));mesh=g.doc['meshes'][mi];skin=next(p for p in mesh['primitives']if '_Face_00_SKIN'in g.doc['materials'][p['material']]['name']);pos=g.acc(skin['attributes']['POSITION']).astype(float);tri=g.acc(skin['indices']).reshape(-1,3);skinids=np.unique(tri);cx=(pos[skinids,0].min()+pos[skinids,0].max())/2
 edges=collections.Counter(tuple(sorted((int(a),int(b))))for t in tri for a,b in [(t[0],t[1]),(t[1],t[2]),(t[2],t[0])]);adj=collections.defaultdict(set)
 for (a,b),count in edges.items():
  if count==1:adj[a].add(b);adj[b].add(a)
 comps=[];seen=set()
 for start in adj:
  if start in seen:continue
  todo=[start];seen.add(start);vertices=[]
  while todo:
   i=todo.pop();vertices.append(i)
   for j in adj[i]:
    if j not in seen:seen.add(j);todo.append(j)
  comps.append(vertices)
 rings=[c for c in comps if len(c)==24];assert len(rings)==2
 parents={c:i for i,n in enumerate(g.doc['nodes'])for c in n.get('children',[])}
 def world(i):
  n=g.doc['nodes'][i];m=np.eye(4)
  if 'matrix'in n:m=np.array(n['matrix']).reshape(4,4).T
  else:m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  return world(parents[i])@m if i in parents else m
 bones={b['bone']:b['node']for b in g.doc['extensions']['VRM']['humanoid']['humanBones']};head=bones['head'];eyes={b:{'nodeIndex':bones[b],'name':g.doc['nodes'][bones[b]]['name'],'localTRS':{k:g.doc['nodes'][bones[b]].get(k)for k in ['translation','rotation','scale']},'restGlobalMatrix':world(bones[b]).tolist(),'restGlobalPivot':world(bones[b])[:3,3].tolist()}for b in ['leftEye','rightEye']}
 node=next(n for n in g.doc['nodes']if n.get('mesh')==mi);jointNodes=g.doc['skins'][node['skin']]['joints'];layers={}
 for pi,p in enumerate(mesh['primitives']):
  material=g.doc['materials'][p['material']];name=material['name'];ids=np.unique(g.acc(p['indices']));joints=g.acc(p['attributes']['JOINTS_0'])[ids];weights=g.acc(p['attributes']['WEIGHTS_0'])[ids]
  layers[name]={'primitiveIndex':pi,'vertexIds':ids.tolist(),'referencedVertices':len(ids),'triangles':len(g.acc(p['indices']))//3,'alphaMode':material.get('alphaMode','OPAQUE'),'doubleSided':material.get('doubleSided',False),'bindings':{g.doc['nodes'][jointNodes[int(k)]]['name']:int(np.any((joints==k)&(weights>0),axis=1).sum())for k in np.unique(joints[weights>0])},'bounds':[pos[ids].min(0).tolist(),pos[ids].max(0).tolist()]}
  texture=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
  if texture and any(v in name for v in ['Eye','Eyel']):
   image=g.doc['images'][g.doc['textures'][texture['index']]['source']];view=g.doc['bufferViews'][image['bufferView']];raw=g.bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];rgba=np.array(Image.open(io.BytesIO(raw)).convert('RGBA'));uv=g.acc(p['attributes']['TEXCOORD_0']);t=g.acc(p['indices']).reshape(-1,3);sample=np.concatenate([uv[ids],uv[t].mean(1)]);height,width=rgba.shape[:2];xy=np.clip(sample,0,1)*[width-1,height-1];lo=np.floor(xy).astype(int);hi=np.minimum(lo+1,[width-1,height-1]);f=xy-lo;alpha=((1-f[:,0])*(1-f[:,1])*rgba[lo[:,1],lo[:,0],3]+f[:,0]*(1-f[:,1])*rgba[lo[:,1],hi[:,0],3]+(1-f[:,0])*f[:,1]*rgba[hi[:,1],lo[:,0],3]+f[:,0]*f[:,1]*rgba[hi[:,1],hi[:,0],3])/255
   layers[name]['alphaSample']={'textureSha256':hashlib.sha256(raw).hexdigest(),'dimensions':[width,height],'testedVerticesAndCentroids':len(sample),'atLeastHalf':int((alpha>=.5).sum()),'below1over255':int((alpha<1/255).sum()),'meaning':'Bilinear source texture subset, not a visibility/occlusion test or modified material cutoff.'}
 blinkGroups=[v for v in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']if 'blink'in v.get('presetName','').lower()]
 eyeTargets=[(i,n)for i,n in enumerate(mesh['extras']['targetNames'])if '_EYE_'in n or '_Eye_'in n]
 closeTargets=[(i,n)for i,n in eyeTargets if 'Close'in n];assert len(closeTargets)==3
 sideReports={};eyesBySign={int(np.sign(v['restGlobalPivot'][0]-cx)):k for k,v in eyes.items()}
 for ring in rings:
  ring=np.array(ring);side=int(np.sign(pos[ring,0].mean()-cx));amin=int(ring[np.argmin(pos[ring,0])]);amax=int(ring[np.argmax(pos[ring,0])]);assert all(len(adj[int(i)])==2 for i in ring)
  paths=[]
  for first in sorted(adj[amin]):
   chain=[amin,first]
   while chain[-1]!=amax:
    nxt=next(j for j in adj[chain[-1]]if j!=chain[-2]);assert nxt not in chain;chain.append(nxt)
   paths.append(chain)
  upper,lower=sorted(paths,key=lambda c:pos[c,1].mean(),reverse=True);center=(pos[amin]+pos[amax])/2;eyeBone=eyesBySign[side];pivot=np.array(eyes[eyeBone]['restGlobalPivot']);closure=[];layerRelations={}
  for name,l in layers.items():
   if not any(k in name for k in ['EyeWhite','EyeIris','EyeHighlight','EyeExtra','FaceEyelash','FaceEyeline']):continue
   ids=np.array(l['vertexIds']);ids=ids[np.sign(pos[ids,0]-cx)==side];tree=cKDTree(pos[ids]);d,j=tree.query(pos[ring]);layerRelations[name]={'sideVertices':ids.tolist(),'ringNearestDistancesM':d.tolist(),'ringExactPairsBelow1um':[[int(ring[k]),int(ids[j[k]])]for k in np.flatnonzero(d<1e-6)],'sideBounds':[pos[ids].min(0).tolist(),pos[ids].max(0).tolist()],'sideBoundsCenter':((pos[ids].min(0)+pos[ids].max(0))/2).tolist()}
  for ti,name in closeTargets:
   delta=g.acc(skin['targets'][ti]['POSITION']).astype(float);p=pos+delta;u=np.array(upper[1:-1]);l=np.array(lower[1:-1]);d,j=cKDTree(p[l]).query(p[u]);pairs=[[int(a),int(l[b])]for a,b in zip(u,j)]
   segments=p[np.array(lower)];ab=segments[1:]-segments[:-1];ap=p[u,None,:]-segments[None,:-1,:];parameter=np.clip(np.sum(ap*ab,axis=2)/np.maximum(np.sum(ab*ab,axis=1),1e-20),0,1);near=segments[None,:-1,:]+parameter[:,:,None]*ab;segmentDistance=np.linalg.norm(p[u,None,:]-near,axis=2).min(1)
   exactpairs=[pair for lname,rel in layerRelations.items()if 'EyeWhite'in lname for pair in rel['ringExactPairsBelow1um']];pairgap=max(float(np.linalg.norm(p[a]-p[b]))for a,b in exactpairs)
   closure.append({'index':ti,'name':name,'ringMaxDisplacementM':float(np.linalg.norm(delta[ring],axis=1).max()),'upperInteriorCount':len(u),'lowerInteriorCount':len(l),'nearestLowerForUpperPairs':pairs,'nearestClosureDistanceMinM':float(d.min()),'nearestClosureDistanceMaxM':float(d.max()),'nearestClosureDistanceMedianM':float(np.median(d)),'upperToLowerPolylineMaxM':float(segmentDistance.max()),'skinWhiteMatchedSeamMaxGapM':pairgap,'closedRingBounds':[p[ring].min(0).tolist(),p[ring].max(0).tolist()]})
  graph={int(i):{}for i in skinids}
  for a,b in edges:graph[a][b]=graph[b][a]=float(np.linalg.norm(pos[a]-pos[b]))
  distance={int(i):0. for i in ring};queue=[(0.,int(i))for i in ring];heapq.heapify(queue)
  while queue:
   d,i=heapq.heappop(queue)
   if d!=distance[i]:continue
   for j,length in graph[i].items():
    candidate=d+length
    if candidate<.008 and candidate<distance.get(j,float('inf')):distance[j]=candidate;heapq.heappush(queue,(candidate,j))
  iris=next(v for k,v in layerRelations.items()if 'EyeIris'in k);iriscenter=np.array(iris['sideBoundsCenter']);irispoints=pos[iris['sideVertices']];A=np.diag([1.01,1,1]);commute=[]
  for yaw in [-12,-8,8,12]:
   R=Rotation.from_euler('y',yaw,degrees=True).as_matrix();differences=((R@A-A@R)@(irispoints-pivot).T).T
   commute.append({'diagnosticYawDegrees':yaw,'maxLinearCommutatorErrorM':float(np.linalg.norm(differences,axis=1).max())})
  sideReports[str(side)]={'eyeBone':eyeBone,'ringVertices':ring.tolist(),'minimumXCorner':amin,'maximumXCorner':amax,'upperChain':upper,'lowerChain':lower,'apertureCornerMidpoint':center.tolist(),'apertureWidthM':float(pos[amax,0]-pos[amin,0]),'pivotToApertureCenterM':(center-pivot).tolist(),'layerRelations':layerRelations,'blinkClosureDiagnostics':closure,'proposed8mmSkinTransitionVertices':sorted(distance),'skinTransitionGeodesicDistancesM':{str(i):d for i,d in distance.items()},'onePercentCornerDisplacementM':float((pos[amax,0]-pos[amin,0])*.005),'irisBoundsCenterVsApertureM':(iriscenter-center).tolist(),'wholeAssemblyWidthScalingRisk':{'factor':1.01,'irisCenterShiftIfScaledAboutApertureM':float((iriscenter[0]-center[0])*.01),'fixedPivotRotationLinearNoncommutation':commute,'meaning':'Algebraic counterexample on source vectors, not a new model or engine gaze trace. Nonuniform width scaling does not commute with eye rotation; independent head/eye layers cannot be treated as one rigid eye.'}}
 shapeRows=[]
 for ti,name in enumerate(mesh['extras']['targetNames']):
  delta=g.acc(skin['targets'][ti]['POSITION']).astype(float);rows=[]
  for lname,layer in layers.items():
   ids=np.array(layer['vertexIds']);rows.append({'material':lname,'movedVerticesAbove1um':int((np.linalg.norm(delta[ids],axis=1)>1e-6).sum()),'maxDisplacementM':float(np.linalg.norm(delta[ids],axis=1).max()),'deltaBounds':[delta[ids].min(0).tolist(),delta[ids].max(0).tolist()]})
  shapeRows.append({'index':ti,'name':name,'materials':rows})
 allpairs=[pair for side in sideReports.values()for lname,layer in side['layerRelations'].items()if 'EyeWhite'in lname for pair in layer['ringExactPairsBelow1um']];pairArray=np.array(allpairs)
 seamRows=[]
 for ti,name in enumerate(mesh['extras']['targetNames']):
  p=pos+g.acc(skin['targets'][ti]['POSITION']);seamRows.append({'name':name,'skinWhiteExactPairMaxGapM':float(np.linalg.norm(p[pairArray[:,0]]-p[pairArray[:,1]],axis=1).max())})
 mouthRecipe=json.loads((ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json').read_text());noseRecipe=json.loads((ROOT/f'assets-source/face-nose-parameters-v1/{sex}-nose.recipe.json').read_text());support=set().union(*(set(s['proposed8mmSkinTransitionVertices'])for s in sideReports.values()));skinSupport=np.array(sorted(support));left=set(sideReports['-1']['proposed8mmSkinTransitionVertices']);right=set(sideReports['1']['proposed8mmSkinTransitionVertices']);otherBoundaries=set().union(*(set(c)for c in comps if len(c)!=24))
 protection={'leftRightSkinTransitionIntersection':len(left&right),'mouthActiveVertexIntersection':int((np.array(mouthRecipe['weights'])[skinSupport]>0).sum()),'noseActiveVertexIntersection':int((np.array(noseRecipe['weights'])[skinSupport]>0).sum()),'otherSkinBoundaryIntersection':len(support&otherBoundaries)}
 assert all(v==0 for v in protection.values())
 report['bodies'][sex]={'source':source,'faceMeshIndex':mi,'centerX':cx,'layers':layers,'eyeRest':eyes,'headRestGlobalMatrix':world(head).tolist(),'lookAt':g.doc['extensions']['VRM']['firstPerson'],'blinkGroups':blinkGroups,'sides':sideReports,'allShapeLayerMotion':shapeRows,'eyeSpecificTargetIndices':[i for i,n in eyeTargets],'allShapeSkinWhiteSeamChecks':seamRows,'proposedSkinDomainProtection':protection,'sourceMorphCount':len(mesh['extras']['targetNames']),'limits':['Closest-point ring closure is not an authored upper/lower vertex correspondence map or proof of occlusion.','Aperture midpoint, visible iris bounds center and eye bone pivot are distinct reference points.','No model deformation, normal change, skinning change or gaze playback was performed.']}
 print(sex,json.dumps({'eyes':{s:{'bone':v['eyeBone'],'widthMm':v['apertureWidthM']*1000,'pivotOffsetMm':(np.array(v['pivotToApertureCenterM'])*1000).tolist(),'ring':len(v['ringVertices']),'upper':len(v['upperChain']),'lower':len(v['lowerChain']),'closed':[{'name':x['name'].split('_EYE_')[-1],'ringMoveMm':x['ringMaxDisplacementM']*1000,'nearestMaxMm':x['nearestClosureDistanceMaxM']*1000}for x in v['blinkClosureDiagnostics']]}for s,v in sideReports.items()}}))
(BASE/'measurements.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
