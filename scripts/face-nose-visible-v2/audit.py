"""Read actual original/raw/final exports; independently verify geometry and normals."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,gzip,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-nose-visible-v2'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
digest=lambda a:hashlib.sha256(a.tobytes()).hexdigest()
spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));measurement=json.loads((BASE/'measurements.json').read_text(encoding='utf-8'));reports=[];recipes=[]
def geometric_normals(p,tri):
 # Independent of finalizer's np.add.at implementation. Cross product vectors
 # accumulate with bincount, matching area-weighted complete-Face adjacency.
 t=p[tri];a=t[:,1]-t[:,0];b=t[:,2]-t[:,0];c=np.column_stack([a[:,1]*b[:,2]-a[:,2]*b[:,1],a[:,2]*b[:,0]-a[:,0]*b[:,2],a[:,0]*b[:,1]-a[:,1]*b[:,0]])
 n=np.column_stack([sum(np.bincount(tri[:,j],weights=c[:,k],minlength=len(p))for j in range(3))for k in range(3)]);length=np.sqrt((n*n).sum(1));valid=length>1e-20;n[valid]/=length[valid,None];return n
def geom(old,new,tri):
 edges=np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0)
 l0=np.linalg.norm(old[edges[:,0]]-old[edges[:,1]],axis=1);l1=np.linalg.norm(new[edges[:,0]]-new[edges[:,1]],axis=1);ratio=l1[l0>1e-7]/l0[l0>1e-7]
 normal=lambda q:np.cross(q[tri[:,1]]-q[tri[:,0]],q[tri[:,2]]-q[tri[:,0]])
 n0,n1=normal(old),normal(new);a0=np.linalg.norm(n0,axis=1);a1=np.linalg.norm(n1,axis=1);valid=a0>1e-12;dot=np.sum(n0*n1,axis=1)/np.maximum(a0*a1,1e-30)
 return {'edgeRatioMin':float(ratio.min()),'edgeRatioMax':float(ratio.max()),'areaRatioMin':float((a1[valid]/a0[valid]).min()),'areaRatioMax':float((a1[valid]/a0[valid]).max()),'maxFaceNormalChangeDegrees':float(np.degrees(np.arccos(np.clip(dot[valid],-1,1))).max()),'sourceTinyTriangles':int((~valid).sum()),'newDegenerateTriangles':int((valid&(a1<=1e-12)).sum()),'newNormalReversals':int((valid&(dot<=0)).sum())}
def angle(a,b):return float(np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1)/np.maximum(np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1),1e-30),-1,1))).max())
for sex,source in spec['bodies'].items():
 folder=BASE/'generated'/f'{sex}-nose-{spec["sampleId"]}';old=GLB(ROOT/source['sourceVRM']);raw=GLB(folder/'addon-export.vrm');new=GLB(folder/'avatar.vrm');assert sha(ROOT/source['sourceVRM'])==source['sourceVRMSha256'];m=measurement['bodies'][sex];mi=m['faceMeshIndex'];om=old.doc['meshes'][mi];nm=new.doc['meshes'][mi];op=om['primitives'][0];np0=nm['primitives'][0];rp=raw.doc['meshes'][mi]['primitives'][0]
 pos=old.acc(op['attributes']['POSITION']);pnew=new.acc(np0['attributes']['POSITION']);N0=old.acc(op['attributes']['NORMAL']);N1=new.acc(np0['attributes']['NORMAL']);rawN=raw.acc(rp['attributes']['NORMAL']);tri=np.concatenate([old.acc(p['indices']).reshape(-1,3)for p in om['primitives']])
 changed=np.array(m['supportVertices']);weights=np.zeros(len(pos));weights[changed]=m['supportWeights'];translation=np.zeros_like(pos,dtype=float);translation[:,2]=-spec['endpoint']*weights
 protected=np.setdiff1d(np.arange(len(pos)),changed);neighborhood=np.unique(tri[np.any(np.isin(tri,changed),axis=1)]);fixedNormals=np.setdiff1d(np.arange(len(pos)),neighborhood)
 assert np.array_equal(np.flatnonzero(np.linalg.norm(pnew-pos,axis=1)>1e-8),changed);error=float(np.linalg.norm((pos+translation)-pnew,axis=1).max());assert error<3e-7
 assert np.array_equal(pnew,raw.acc(rp['attributes']['POSITION']))and np.array_equal(pnew[protected],pos[protected])
 assert old.doc['nodes']==new.doc['nodes']and old.doc['materials']==new.doc['materials']and old.images()==new.images()
 for k in ['humanoid','blendShapeMaster','firstPerson','secondaryAnimation']:assert old.doc['extensions']['VRM'][k]==new.doc['extensions']['VRM'][k]
 assert {k:v for k,v in old.doc['extensions']['VRM']['meta'].items()if k!='title'}=={k:v for k,v in new.doc['extensions']['VRM']['meta'].items()if k!='title'}
 for a,b in zip(old.doc['skins'],new.doc['skins']):assert a['joints']==b['joints']and np.array_equal(old.acc(a['inverseBindMatrices']),new.acc(b['inverseBindMatrices']))
 primitiveRows=[]
 for omesh,nmesh in zip(old.doc['meshes'],new.doc['meshes']):
  for a,b in zip(omesh['primitives'],nmesh['primitives']):
   ids=np.unique(old.acc(a['indices']));assert np.array_equal(old.acc(a['indices']),new.acc(b['indices']))
   for k in ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']:assert np.array_equal(old.acc(a['attributes'][k]),new.acc(b['attributes'][k]))
   if omesh['name'].startswith('Body'):
    for k in a['attributes']:assert np.array_equal(old.acc(a['attributes'][k]),new.acc(b['attributes'][k]))
   else:
    assert old.acc(a['attributes']['POSITION']).shape==pos.shape
    assert np.array_equal(new.acc(b['attributes']['POSITION']),pnew)
    for ti,t in enumerate(b['targets']):assert np.array_equal(new.acc(t['NORMAL']),new.acc(np0['targets'][ti]['NORMAL']))
   primitiveRows.append({'material':old.doc['materials'][a['material']]['name'],'changedReferencedPositions':int((np.linalg.norm(new.acc(b['attributes']['POSITION'])[ids]-old.acc(a['attributes']['POSITION'])[ids],axis=1)>1e-8).sum()),'indicesUVWeightsEqual':True})
 shapes=[];absoluteReference=[]
 for ti,name in enumerate(['Basis']+om['extras']['targetNames']):
  d0=old.acc(op['targets'][ti-1]['POSITION'])if ti else np.zeros_like(pos);d1=new.acc(np0['targets'][ti-1]['POSITION'])if ti else np.zeros_like(pos);targetN=new.acc(np0['targets'][ti-1]['NORMAL'])if ti else np.zeros_like(N1)
  q0=pos.astype(float)+d0;q1=pnew.astype(float)+d1;assert np.array_equal(d0[protected],d1[protected]);deltaerr=float(np.linalg.norm(d0-d1,axis=1).max());assert deltaerr<3e-7
  assert np.array_equal(q0[protected],q1[protected]);geometry=geom(q0,q1,tri);assert geometry['newDegenerateTriangles']==0 and geometry['newNormalReversals']==0
  expected=N0.astype(float).copy();calculated=geometric_normals(q1,tri);expected[neighborhood]=calculated[neighborhood];actual=N1.astype(float)+targetN;normalerror=float(np.linalg.norm(expected-actual,axis=1).max());assert normalerror<2e-7 and np.isfinite(actual).all();assert np.array_equal(actual[fixedNormals],N0[fixedNormals]);absoluteReference.append(actual)
  shapes.append({'name':name,'relativePositionDeltaMaxErrorM':deltaerr,'protectedPositionMaxErrorM':0.,'normalIndependentRecomputeMaxError':normalerror,'maxExportedNormalLengthError':float(abs(np.linalg.norm(actual,axis=1)-1).max()),'normalOutsideNeighborhoodExact':True,'maxNormalAngleVsAuthoredDegrees':angle(actual[neighborhood],N0[neighborhood]),**geometry})
 assert om['extras']['targetNames']==nm['extras']['targetNames'];expressionMap=old.doc['extensions']['VRM']['blendShapeMaster'];mapping=json.loads(gzip.decompress((folder/'mapping.json.gz').read_bytes()));sourceMap=mapping['sourceVertexMap']
 mouthPath=ROOT/f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json';mouth=json.loads(mouthPath.read_text(encoding='utf-8'));assert np.all(np.array(mouth['weights'])[changed]==0)
 protectedBrow=set(i for name,p in old.primitives().items()if '_FaceBrow_'in name for i in np.unique(old.acc(p['indices'])));assert not set(neighborhood).intersection(protectedBrow)
 recipe={'schema':'character-face-geometry-displacement-recipe-v1','id':f'{sex}-nose-tip-visible-v2','sampleId':spec['sampleId'],'sourceSpace':'glTF mesh-local metres','baseAvatarSha256':source['sourceVRMSha256'],'basePositionSha256':digest(pos),'baseNormalSha256':digest(N0),'meshIndex':mi,'meshName':om['name'],'positionCount':len(pos),'parameter':'noseTipProtrusionM','default':0,'fixedEndpoint':.002,'supportedSamples':['none',spec['sampleId']],'rangeStatus':'Only zero and fixed +2mm endpoint; no signed/continuous range admission.','direction':[0,0,-1],'weights':weights.tolist(),'translationVectors':translation.tolist(),'sourceVertexMap':sourceMap,'changedVertices':changed.tolist(),'protectedVertices':protected.tolist(),'normalNeighborhoodVertices':neighborhood.tolist(),'expressionNames':om['extras']['targetNames'],'sourceMorphPositionSha256':[digest(old.acc(t['POSITION']))for t in op['targets']],'expressionMappingSha256':hashlib.sha256(json.dumps(expressionMap,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'primitiveIdentities':[{'primitiveIndex':i,'materialName':old.doc['materials'][p['material']]['name'],'indexSha256':digest(old.acc(p['indices'])),'positionSha256':digest(old.acc(p['attributes']['POSITION'])),'normalSha256':digest(old.acc(p['attributes']['NORMAL'])),'uvSha256':digest(old.acc(p['attributes']['TEXCOORD_0'])),'targetCount':len(p.get('targets',[]))}for i,p in enumerate(om['primitives'])],'finalEndpointSha256':sha(folder/'avatar.vrm'),'rawAddonEndpointSha256':sha(folder/'addon-export.vrm'),'positionRule':'A_i=I, same fixed t_i for Basis and every absolute shape; source relative POSITION deltas remain unchanged within exported float precision.','normalRule':'Independently compute complete Face area-weighted normal for Basis and every absolute shape; replace only active triangle-neighborhood vertices, preserve original authored normals elsewhere; relative NORMAL=absoluteShapeNormal-newBasisNormal. For mouth+nose use neighborhood union and both deformations from immutable originals.','mouthRecipeSha256':sha(mouthPath),'mouthNonzeroIntersection':0,'limits':['Offline exact-base recipe, not direct registration in existing runtime schema.','Final VRM includes a mandatory deterministic normal export step after editable blend native addon export; raw and final identities differ.','Clone mutable arrays per actor; never accumulate on current buffers or erase other active parameters during reset.','No game visual or glasses-contact acceptance inherited.']}
 recipePath=BASE/f'{sex}-nose.recipe.json';recipePath.write_text(json.dumps(recipe,indent=2)+'\n',encoding='utf-8');recipes.append({'id':recipe['id'],'file':recipePath.name,'sha256':sha(recipePath),'baseAvatarSha256':source['sourceVRMSha256']})
 (folder/'expression-map.json').write_text(json.dumps({'targetNames':nm['extras']['targetNames'],'blendShapeMaster':expressionMap,'equalToSource':True,'sourceTargetAttributes':['POSITION'],'rawTargetAttributes':['POSITION'],'finalTargetAttributes':['POSITION','NORMAL']},indent=2)+'\n',encoding='utf-8')
 report={'sex':sex,'sourceSha256':source['sourceVRMSha256'],'rawAddonSha256':sha(folder/'addon-export.vrm'),'finalAvatarSha256':sha(folder/'avatar.vrm'),'expectedChangedVertices':len(changed),'actualChangedVertices':int((np.linalg.norm(pnew-pos,axis=1)>1e-8).sum()),'endpointPositionMaxErrorM':error,'normalNeighborhoodVertices':len(neighborhood),'normalOutsideNeighborhoodExact':True,'baseFinalVsRawNormalAngleMaxDegrees':angle(N1[neighborhood],rawN[neighborhood]),'primitiveChecks':primitiveRows,'bodyNodesRestInverseBindUVWeightsImagesMaterialsEqual':True,'shapes':shapes,'runtimeStatus':'Source offline checks only; visual and actual accessory checks not performed.'}
 (folder/'audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
(BASE/'audit.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8');(BASE/'recipe-manifest.json').write_text(json.dumps({'schema':'face-nose-fixed-samples-v1','recipes':recipes},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'sex':r['sex'],'changed':r['actualChangedVertices'],'positionErrorM':r['endpointPositionMaxErrorM'],'minEdgeRatio':min(s['edgeRatioMin']for s in r['shapes']),'maxEdgeRatio':max(s['edgeRatioMax']for s in r['shapes']),'maxTriangleNormalDegrees':max(s['maxFaceNormalChangeDegrees']for s in r['shapes']),'maxIndependentNormalError':max(s['normalIndependentRecomputeMaxError']for s in r['shapes']),'maxAuthoredNormalAngleDegrees':max(s['maxNormalAngleVsAuthoredDegrees']for s in r['shapes'])}for r in reports],indent=2))
