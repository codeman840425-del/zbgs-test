"""Read-only, pinned original nose landmark/topology study. No edited model export."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,heapq,collections,gzip
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/face-nose-parameters-v1';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sources=json.loads((ROOT/'assets-source/face-parameters-v1/spec.json').read_text())['bodies']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
# Manually reviewed landmark candidates from each source's own vertex table.
# Alar points are stylized sidewall proxies, not nostril/anatomical truth.
landmarks={
 'female':{'T_tip':1619,'U_tipUpper':1620,'B1_lowerBridge':1612,'B2_midBridge':1605,'R_upperBridge':1509,'Aneg_sidewall':1608,'Apos_sidewall':1623,'S_base':1616,'P_philtrum':1636},
 'male':{'T_tip':1050,'U_tipUpper':1051,'B1_lowerBridge':1044,'B2_midBridge':1064,'R_upperBridge':1071,'Aneg_sidewall':1039,'Apos_sidewall':1055,'S_base':1042,'P_philtrum':1059},
}
report={'scope':'Read-only original Face_SKIN measurement; landmarks are manually reviewed model-semantic proxies, not automatic anatomical recognition. No derived model/recipe admission.','coordinateSystem':'Original exported glTF metres: +Y up, -Z forward. Blender Face local uses +Z up,+Y forward.','proposedEndpoint':{'noseTipProtrusionM':.0005,'transitionGeodesicRadiusM':.008,'tipPlateauRadiusM':.002,'formula':'Original Basis graph fixed once. weight=1 for d<=2mm, smoothstep falloff to 0 at d>=8mm; absolute shapes translate by -Z * .5mm * weight.','rangeStatus':'Proposal only; no exported endpoint or signed range validated.'},'bodies':{}}

for sex,source in sources.items():
 path=ROOT/source['sourceVRM'];assert sha(path)==source['sourceVRMSha256'] and sha(ROOT/source['sourceBlend'])==source['sourceBlendSha256'];g=GLB(path);primitives=g.primitives();skin=primitives[source['skinMaterial']];p=g.acc(skin['attributes']['POSITION']).astype(float);tri=g.acc(skin['indices']).reshape(-1,3);ids=np.unique(tri);mi=next(i for i,m in enumerate(g.doc['meshes'])if m['name'].startswith('Face'));mesh=g.doc['meshes'][mi]
 mouth=primitives[source['mouthMaterial']];mouthids=np.unique(g.acc(mouth['indices']));iris=next(v for k,v in primitives.items()if '_EyeIris_'in k);irisids=np.unique(g.acc(iris['indices']));eyeY=float(p[irisids,1].mean());cx=float((p[ids,0].min()+p[ids,0].max())/2)
 edges=collections.Counter(tuple(sorted((int(a),int(b))))for t in tri for a,b in [(t[0],t[1]),(t[1],t[2]),(t[2],t[0])]);graph={int(i):{}for i in ids}
 for a,b in edges:graph[a][b]=graph[b][a]=float(np.linalg.norm(p[a]-p[b]))
 adjacency=collections.defaultdict(set)
 for (a,b),count in edges.items():
  if count==1:adjacency[a].add(b);adjacency[b].add(a)
 boundary=[];seen=set()
 for start in adjacency:
  if start in seen:continue
  todo=[start];seen.add(start);component=[]
  while todo:
   i=todo.pop();component.append(i)
   for j in adjacency[i]:
    if j not in seen:seen.add(j);todo.append(j)
  boundary.append({'vertices':sorted(component),'count':len(component),'bounds':[p[component].min(0).tolist(),p[component].max(0).tolist()],'mean':p[component].mean(0).tolist()})
 tip=landmarks[sex]['T_tip'];assert all(i in graph for i in landmarks[sex].values())
 # Check observed tip independently in central face between mouth and eye planes;
 # this window identifies a landmark, it never defines the edit support.
 search=ids[(np.abs(p[ids,0]-cx)<.012)&(p[ids,1]>p[mouthids,1].mean()+.008)&(p[ids,1]<eyeY)]
 assert int(search[np.argmin(p[search,2])])==tip
 dist={i:float('inf')for i in graph};dist[tip]=0.;queue=[(0.,tip)]
 while queue:
  d,i=heapq.heappop(queue)
  if d!=dist[i]:continue
  for j,length in graph[i].items():
   n=d+length
   if n<dist[j]:dist[j]=n;heapq.heappush(queue,(n,j))
 radius=.008;plateau=.002;weights=np.zeros(len(p))
 for i,d in dist.items():
  t=np.clip((d-plateau)/(radius-plateau),0,1);weights[i]=1-t*t*(3-2*t)
 support=np.flatnonzero(weights>0);assert all(weights[i]==0 for name,i in landmarks[sex].items()if name not in ['T_tip','U_tipUpper'])
 # Actual eye/mouth openings and Face/Body seam are protected independently.
 mt=cKDTree(p[mouthids]);md,midx=mt.query(p[ids]);mouthSeam=ids[md<1e-7];assert len(mouthSeam)==32
 body=next(v for k,v in primitives.items()if '_Body_00_SKIN'in k);bp=g.acc(body['attributes']['POSITION']);bi=np.unique(g.acc(body['indices']));bd,bidx=cKDTree(bp[bi]).query(p[ids]);neck=ids[bd<=.0001]
 # Eye boundary components: above mouth and near iris plane; retain all other
 # surface boundaries too so classification cannot grant deformation to a hole.
 allBoundary=np.array(sorted(adjacency));assert np.all(weights[allBoundary]==0)
 protectedMaterialIds=set().union(*(set(np.unique(g.acc(pr['indices'])).tolist())for name,pr in primitives.items()if name!=source['skinMaterial'] and name.startswith(('F00_000_00_','M00_000_00_'))))
 assert not set(support).intersection(protectedMaterialIds)
 assert np.all(weights[mouthSeam]==0) and np.all(weights[neck]==0)
 oldmap=ROOT/f'assets-source/face-parameters-v1/generated/{sex}-mouth-width-96-v1/mapping.json.gz';mapping=json.loads(gzip.decompress(oldmap.read_bytes()));sp=np.array(mapping['sourcePositions']);sp=sp[:,[0,2,1]];sp[:,2]*=-1;sd,sourceIndex=cKDTree(sp).query(p);assert sd.max()<1e-6
 lm={name:{'exportVertex':i,'sourceBlendVertex':int(sourceIndex[i]),'gltfM':p[i].tolist(),'blenderLocalM':[float(p[i,0]),float(-p[i,2]),float(p[i,1])],'geodesicFromTipM':dist[i],'proposedWeight':float(weights[i]),'neighbors':sorted(graph[i])}for name,i in landmarks[sex].items()}
 shapeRows=[]
 affectedTriangles=tri[np.any(np.isin(tri,support),axis=1)]
 for ti,name in enumerate(mesh['extras']['targetNames']):
  delta=g.acc(skin['targets'][ti]['POSITION']).astype(float);positions=p+delta
  n=np.cross(positions[affectedTriangles[:,1]]-positions[affectedTriangles[:,0]],positions[affectedTriangles[:,2]]-positions[affectedTriangles[:,0]])
  shapeRows.append({'name':name,'tipDisplacementM':float(np.linalg.norm(delta[tip])),'maxProposedSupportDisplacementM':float(np.linalg.norm(delta[support],axis=1).max()),'minimumOriginalAffectedTriangleDoubleAreaM2':float(np.linalg.norm(n,axis=1).min())})
 mouthRecipe=json.loads((ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json').read_text());mouthWeights=np.array(mouthRecipe['weights']);assert np.all(mouthWeights[support]==0)
 boundaryDistance=min(dist[i]for i in adjacency);eyeBandMargin=float((eyeY-.02)-p[support,1].max())
 node=next(n for n in g.doc['nodes']if n.get('mesh')==mi);jointNodes=g.doc['skins'][node['skin']]['joints'];joints=g.acc(skin['attributes']['JOINTS_0'])[support];jw=g.acc(skin['attributes']['WEIGHTS_0'])[support]
 result={'source':source,'faceMeshIndex':mi,'skinVertices':len(ids),'skinTriangles':len(tri),'centerX':cx,'eyeIrisMeanY':eyeY,'landmarks':lm,'boundaryComponents':boundary,'mouthSeamVertices':mouthSeam.tolist(),'neckSeamVertices':neck.tolist(),'allBoundaryMinGeodesicFromTipM':boundaryDistance,'supportVertices':support.tolist(),'supportWeights':[float(weights[i])for i in support],'supportBounds':[p[support].min(0).tolist(),p[support].max(0).tolist()],'affectedTriangles':affectedTriangles.tolist(),'supportCount':len(support),'supportJointPositiveCounts':{g.doc['nodes'][jointNodes[int(k)]]['name']:int(np.any((joints==k)&(jw>0),axis=1).sum())for k in np.unique(joints[jw>0])},'mouthNonzeroIntersection':0,'distanceBelowCurrentGlassesFitEyeBandM':eyeBandMargin,'shapeChecks':shapeRows,'sourceMapping':{'path':oldmap.relative_to(ROOT).as_posix(),'sha256':sha(oldmap),'maximumMappingErrorM':float(sd.max())},'limits':['Alar landmarks are stylized sidewall proxies; no actual nostril hole is asserted.','Geodesic support is proposed from original topology; no geometry is mutated/exported here.','Current glasses fit band excludes this small support if margin positive, but no accessory contact or rendered appearance is certified.']}
 report['bodies'][sex]=result
 print(sex,json.dumps({'supportCount':len(support),'boundaryCount':len(boundary),'boundarySizes':[x['count']for x in boundary],'minBoundaryGeodesicMm':boundaryDistance*1000,'glassesBandMarginMm':eyeBandMargin*1000,'maxAuthoredSupportMotionMm':max(x['maxProposedSupportDisplacementM']for x in shapeRows)*1000,'landmarks':{k:{'id':v['exportVertex'],'distanceMm':round(v['geodesicFromTipM']*1000,3)}for k,v in lm.items()}}))
(OUT/'measurements.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
