"""Read-only comparison of archived original male, jaw and short-hair inputs."""
from pathlib import Path
import sys,json,hashlib,ast
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'));from glb import GLB
OUT=Path(__file__).resolve().parent
paths={'original':'prototype/public/assets/foundation/base-male-roundtrip.vrm','jaw':'assets-source/m2-male-face-v1/generated/avatar.vrm','hair':'assets-source/m2-male-hairstyle-v1/male-sidepart.glb','hairBuild':'assets-source/m2-male-hairstyle-v1/build-report.json'}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
a=GLB(ROOT/paths['original']);b=GLB(ROOT/paths['jaw']);assert sha(ROOT/paths['original'])=='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';assert sha(ROOT/paths['jaw'])=='25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153'
assert a.doc['nodes']==b.doc['nodes'] and a.doc['materials']==b.doc['materials'] and a.images()==b.images()
assert len(a.doc['skins'])==len(b.doc['skins']) and len(a.doc['meshes'])==len(b.doc['meshes'])
head=next(i for i,n in enumerate(a.doc['nodes'])if n.get('name')=='J_Bip_C_Head');neck=next(i for i,n in enumerate(a.doc['nodes'])if n.get('name')=='J_Bip_C_Neck')
skins=[]
for x,y in zip(a.doc['skins'],b.doc['skins']):
 assert x['joints']==y['joints'] and np.array_equal(a.acc(x['inverseBindMatrices']),b.acc(y['inverseBindMatrices']))
 skins.append({'jointsExact':True,'inverseBindsExact':True,'headInverseBind':a.acc(x['inverseBindMatrices'])[x['joints'].index(head)].tolist()if head in x['joints']else None})
rows=[];shapeRows=[];faceData=None
for mi,(m,n)in enumerate(zip(a.doc['meshes'],b.doc['meshes'])):
 assert len(m['primitives'])==len(n['primitives'])
 for pi,(p,q)in enumerate(zip(m['primitives'],n['primitives'])):
  name=a.doc['materials'][p['material']]['name'];ids=np.unique(a.acc(p['indices']));tri=a.acc(p['indices']).reshape(-1,3);v=a.acc(p['attributes']['POSITION']);w=b.acc(q['attributes']['POSITION']);changed=ids[np.any(v[ids]!=w[ids],axis=1)]
  assert np.array_equal(a.acc(p['indices']),b.acc(q['indices']))
  unchangedAttrs={key:bool(np.array_equal(a.acc(index),b.acc(q['attributes'][key])))for key,index in p['attributes'].items()}
  if mi!=1:assert all(unchangedAttrs.values())
  rows.append({'mesh':mi,'primitive':pi,'material':name,'referencedVertices':len(ids),'changedBasisVertices':changed.tolist(),'maxBasisDisplacementM':float(np.linalg.norm(w[ids]-v[ids],axis=1).max()),'indexExact':True,'allAttributeExact':unchangedAttrs})
  if name=='M00_000_00_Face_00_SKIN':faceData=(p,q,v,w,ids,tri,changed)
p,q,v,w,ids,tri,changed=faceData
assert len(p['targets'])==len(q['targets'])==54
upper=ids[v[ids,1]>=1.565];lateral=ids[(abs(v[ids,0]-.00050883)>=.075)&(v[ids,1]>=1.54)&(v[ids,1]<=1.68)];posterior=ids[v[ids,2]>=0]
assert np.array_equal(v[upper],w[upper])and np.array_equal(v[lateral],w[lateral])and np.array_equal(v[posterior],w[posterior])
for t in range(len(p['targets'])):
 x=v.astype(float)+a.acc(p['targets'][t]['POSITION']);y=w.astype(float)+b.acc(q['targets'][t]['POSITION'])
 shapeRows.append({'target':t,'upperHeadAbsoluteMaxM':float(abs(x[upper]-y[upper]).max()),'lateralEarEnvelopeAbsoluteMaxM':float(abs(x[lateral]-y[lateral]).max()),'posteriorAbsoluteMaxM':float(abs(x[posterior]-y[posterior]).max())})
br=json.loads((ROOT/paths['hairBuild']).read_text(encoding='utf8'));h=np.array(br['candidateWorldPositions']);hairPrim=a.doc['meshes'][0]['primitives'][5];used=np.array(br['originalUsedVertices']);ht=np.searchsorted(used,a.acc(hairPrim['indices']).reshape(-1,3));hairTris=h[ht]
hairGLB=GLB(ROOT/paths['hair']);hp=hairGLB.doc['meshes'][0]['primitives'][0]
assert np.array_equal(ht,hairGLB.acc(hp['indices']).reshape(-1,3))
bind=np.array(br['headBindMatrixColumnMajor']).reshape(4,4).T
actualHairWorld=(np.c_[hairGLB.acc(hp['attributes']['POSITION']),np.ones(len(h))]@bind.T)[:,:3]
hairReportQuantizationMaxM=float(abs(actualHairWorld-h).max());assert hairReportQuantizationMaxM<1e-7
h=actualHairWorld;hairTris=h[ht]
changedTriangles=np.flatnonzero(np.any(np.isin(tri,changed),axis=1));old=v[tri[changedTriangles]];new=w[tri[changedTriangles]];lo=np.minimum(old.min(1),new.min(1));hi=np.maximum(old.max(1),new.max(1));pairs=[];separations=[]
for k,(lower,upperBound)in enumerate(zip(lo,hi)):
 hmin=hairTris.min(1);hmax=hairTris.max(1);gap=np.maximum(np.maximum(lower-hmax,hmin-upperBound),0);separations.append(float(np.linalg.norm(gap,axis=1).min()));hit=np.flatnonzero(np.all(gap==0,axis=1));pairs.extend([[int(changedTriangles[k]),int(i)]for i in hit])
def section(vertices,y):
 segments=[]
 for t in vertices[tri]:
  cuts=[]
  for i in range(3):
   x,z=t[i].astype(float),t[(i+1)%3].astype(float)
   if (x[1]-y)*(z[1]-y)<0:cuts.append(x+(z-x)*((y-x[1])/(z[1]-x[1])))
  if len(cuts)==2:segments.append(np.array(cuts))
 return np.array(segments)
sections=[]
for level in [1.60,1.65,1.70]:
 x,y=section(v,level),section(w,level);assert np.array_equal(x,y)
 sections.append({'worldY':level,'segments':len(x),'sectionSegmentTotalLengthM':float(np.linalg.norm(x[:,1]-x[:,0],axis=1).sum()),'exactBeforeAfter':True,'definition':'Face-skin plane section line-length, not calibrated anatomical circumference'})
oldFit=json.loads((ROOT/'assets-source/m2-male-hairstyle-v1/fit.json').read_text(encoding='utf8'));assert sha(ROOT/paths['hair'])==oldFit['sha256']
historical=json.loads((ROOT/'assets-source/m2-male-hairstyle-v1/head-space-report.json').read_text(encoding='utf8'))
# Reuse the archived strict-intersection diagnostic without executing its
# top-level writer. Only the four changed-region AABB pairs need new testing.
probe=ROOT/'scripts/m2-male-hairstyle-v1/check-head-space.py';tree=ast.parse(probe.read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='segment_hits');space={'np':np};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(probe),'exec'),space);hits=space['segment_hits'];pairChecks=[]
def intersects(x,y):return any(hits(x[i],x[(i+1)%3],y[None])[0]or hits(y[i],y[(i+1)%3],x[None])[0]for i in range(3))
for faceIndex,hairIndex in pairs:
 oldHit=bool(intersects(v[tri[faceIndex]],hairTris[hairIndex]));newHit=bool(intersects(w[tri[faceIndex]],hairTris[hairIndex]));pairChecks.append({'faceTriangle':faceIndex,'hairTriangle':hairIndex,'originalStrictHit':oldHit,'jawStrictHit':newHit,'historicalCandidatePairPresent':[hairIndex,faceIndex]in historical['materials']['M00_000_00_Face_00_SKIN']['candidatePairs']})
report={'scope':'Read-only source preflight; no new fit/asset/export/runtime/visual acceptance','sources':{k:{'path':s,'sha256':sha(ROOT/s)}for k,s in paths.items()},'nodesExact':True,'headNode':head,'neckNode':neck,'skins':skins,'materialsTexturesExact':True,'primitives':rows,'faceChangedBoundsM':[v[changed].min(0).astype(float).tolist(),v[changed].max(0).astype(float).tolist()],'headRegions':{'upperY165':{'thresholdY':1.565,'count':len(upper),'ids':upper.tolist()},'lateralEarEnvelope':{'definition':'abs(x-centerX)>=.075m and 1.54<=Y<=1.68, geometric envelope not semantic ear-root labeling','count':len(lateral),'ids':lateral.tolist()},'posteriorZNonnegative':{'count':len(posterior),'ids':posterior.tolist()}},'headRegionAll54Shapes':shapeRows,'sectionChecks':sections,'hairBoundsM':[h.min(0).tolist(),h.max(0).tolist()],'changedFaceTriangleCount':len(changedTriangles),'hairVsChangedFaceTriangleAABBOverlapPairs':pairs,'minimumAABBSeparationLowerBoundM':min(separations),'hairHeadLocalMountCanRemainIdentity':True,'oldStaticIntersectionLimits':{k:{'old':len(z['sourcePairs']),'hairCandidate':len(z['candidatePairs']),'new':len(z['newPairs'])}for k,z in historical['materials'].items()},'limitations':['Lateral envelope is not an annotated complete anatomical ear mask. No ear bones exist.','AABB result is bind-pose geometric broad phase, not alpha-aware visual fit or all-action contact.','Source equality supports testing reuse, does not register a fit or admit male-jaw hairstyle.']}
for row in shapeRows:assert max(row[k]for k in ['upperHeadAbsoluteMaxM','lateralEarEnvelopeAbsoluteMaxM','posteriorAbsoluteMaxM'])==0
report['changedRegionStrictIntersectionChecks']=pairChecks;report['intersectionProbeSHA256']=sha(probe)
report['actualHairGLBVsBuildReportMaxComponentM']=hairReportQuantizationMaxM
(OUT/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'faceChanged':len(changed),'faceChangedBoundsM':report['faceChangedBoundsM'],'sections':sections,'hairChangedFaceAABBpairs':len(pairs),'minAABBgapM':min(separations),'all54ProtectedHeadExact':True}))
