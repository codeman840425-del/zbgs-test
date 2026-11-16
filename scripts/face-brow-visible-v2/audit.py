"""Actual exported geometry audit and common-original-source recipe; no runtime edits."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,gzip,hashlib
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-visible-v2'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
digest=lambda a:hashlib.sha256(a.tobytes()).hexdigest()
spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));reports=[]
for sex,source in spec['bodies'].items():
 folder=BASE/'generated'/f'{sex}-brow-height3-spacing3-v2';old=GLB(ROOT/source['sourceVRM']);new=GLB(folder/'avatar.vrm')
 assert sha(ROOT/source['sourceVRM'])==source['sourceVRMSha256']
 mi=next(i for i,m in enumerate(old.doc['meshes'])if m['name'].startswith('Face'));mesh=old.doc['meshes'][mi];nmesh=new.doc['meshes'][mi]
 p=old.acc(mesh['primitives'][0]['attributes']['POSITION']);pn=new.acc(nmesh['primitives'][0]['attributes']['POSITION'])
 mapping=json.loads(gzip.decompress((folder/'mapping.json.gz').read_bytes()));sp=np.array(mapping['sourcePositions']);sp=sp[:,[0,2,1]];sp[:,2]*=-1
 tree=cKDTree(sp);dist,index=tree.query(p);assert dist.max()<1e-6
 translations=np.array(mapping['translationVectors']);translations=translations[:,[0,2,1]];translations[:,2]*=-1;d=translations[index]
 for pos,delta in zip(p,d):
  choices=tree.query_ball_point(pos,1e-6);assert max(np.linalg.norm(translations[choices]-delta,axis=1))<1e-10
 error=float(np.linalg.norm(p+d-pn,axis=1).max());assert error<3e-7
 brow=next(pr for pr in mesh['primitives']if '_FaceBrow_'in old.doc['materials'][pr['material']]['name']);bids=np.unique(old.acc(brow['indices']));tri=old.acc(brow['indices']).reshape(-1,3)
 changed=np.flatnonzero(np.linalg.norm(d,axis=1)>0);assert np.array_equal(changed,bids)
 assert old.doc['nodes']==new.doc['nodes'] and old.images()==new.images() and old.doc['materials']==new.doc['materials']
 for key in ['humanoid','blendShapeMaster','firstPerson','secondaryAnimation']:
  assert old.doc['extensions']['VRM'][key]==new.doc['extensions']['VRM'][key],key
 assert {k:v for k,v in old.doc['extensions']['VRM']['meta'].items()if k!='title'}=={k:v for k,v in new.doc['extensions']['VRM']['meta'].items()if k!='title'}
 for a,b in zip(old.doc['skins'],new.doc['skins']):
  assert a['joints']==b['joints'] and np.array_equal(old.acc(a['inverseBindMatrices']),new.acc(b['inverseBindMatrices']))
 primitiveChecks=[]
 for m,nm in zip(old.doc['meshes'],new.doc['meshes']):
  assert len(m['primitives'])==len(nm['primitives'])
  for pr,npr in zip(m['primitives'],nm['primitives']):
   assert np.array_equal(old.acc(pr['indices']),new.acc(npr['indices']))
   ids=np.unique(old.acc(pr['indices']));name=old.doc['materials'][pr['material']]['name']
   for attr in ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']:
    assert np.array_equal(old.acc(pr['attributes'][attr]),new.acc(npr['attributes'][attr]))
   if m['name'].startswith('Body'):
    for attr in pr['attributes']:assert np.array_equal(old.acc(pr['attributes'][attr]),new.acc(npr['attributes'][attr]))
   else:
    assert len(pr.get('targets',[]))==source['expectedShapeKeys']-1
    if '_FaceBrow_'not in name:assert np.array_equal(old.acc(pr['attributes']['POSITION'])[ids],new.acc(npr['attributes']['POSITION'])[ids])
   primitiveChecks.append({'material':name,'referencedVertices':len(ids),'indicesUVWeightsEqual':True,'positionsUnchanged':bool(np.array_equal(old.acc(pr['attributes']['POSITION'])[ids],new.acc(npr['attributes']['POSITION'])[ids]))})
 targetChecks=[]
 for ti,name in enumerate(mesh['extras']['targetNames']):
  a=old.acc(mesh['primitives'][0]['targets'][ti]['POSITION']);b=new.acc(nmesh['primitives'][0]['targets'][ti]['POSITION']);err=float(np.linalg.norm(a-b,axis=1).max());assert err<3e-7
  targetChecks.append({'name':name,'relativeDeltaMaxErrorM':err})
 # Independent material-side rigid translations preserve every triangle's edges.
 edgeError=max(float(np.linalg.norm((pn[tri[:,a]]-pn[tri[:,b]])-(p[tri[:,a]]-p[tri[:,b]]),axis=1).max())for a,b in [(0,1),(1,2),(2,0)])
 mouth=json.loads((ROOT/f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json').read_text(encoding='utf-8'))
 assert mouth['baseAvatarSha256']==source['sourceVRMSha256'] and mouth['basePositionSha256']==digest(p)
 assert np.all(np.array(mouth['weights'])[bids]==0)
 h=np.zeros_like(p);h[bids,1]=1;s=np.zeros_like(p);s[bids,0]=np.sign(p[bids,0]-mapping['centerX'])
 # Composition check only: disjoint mouth and brow operators commute on every
 # authored absolute shape. No combined export or runtime qualification.
 composition=0.
 for ti in range(-1,len(mesh['extras']['targetNames'])):
  absolute=p.astype(float)+(old.acc(mesh['primitives'][0]['targets'][ti]['POSITION']) if ti>=0 else 0)
  scale=1+.12*np.array(mouth['weights']);center=mouth['centerX'];first=absolute+d;first[:,0]=center+(first[:,0]-center)*scale
  second=absolute.copy();second[:,0]=center+(second[:,0]-center)*scale;second+=d
  composition=max(composition,float(np.abs(first-second).max()))
 assert composition<1e-10
 recipe={'schema':'character-face-brow-translation-recipe-v1','id':f'{sex}-brow-translation-visible-v2','baseAvatarSha256':source['sourceVRMSha256'],'basePositionSha256':digest(p),'meshIndex':mi,'meshName':mesh['name'],'positionCount':len(p),'parameters':['browHeightM','browHalfSpacingM'],'default':[0,0],'testedCombinedEndpoint':[.003,.003],'rangeStatus':'No full signed range or independent-axis endpoint qualification. Source candidate only.','formula':'Pnew=Poriginal+browHeightM*heightVectors+browHalfSpacingM*spacingVectors; relative expression POSITION deltas unchanged (A=I).','heightVectors':h.tolist(),'spacingVectors':s.tolist(),'sourceVertexMap':index.tolist(),'sourceMappingMaxErrorM':float(dist.max()),'browVertices':bids.tolist(),'sourceSpace':'glTF mesh-local metres','expressionNames':mesh['extras']['targetNames'],'baseNormalSha256':digest(old.acc(mesh['primitives'][0]['attributes']['NORMAL'])),'primitiveIdentities':[{'primitiveIndex':pi,'uvSha256':digest(old.acc(pr['attributes']['TEXCOORD_0'])),'normalSha256':digest(old.acc(pr['attributes']['NORMAL'])),'materialName':old.doc['materials'][pr['material']]['name'],'indexSha256':digest(old.acc(pr['indices'])),'positionSha256':digest(old.acc(pr['attributes']['POSITION'])),'targetCount':len(pr.get('targets',[]))}for pi,pr in enumerate(mesh['primitives'])],'mouthRecipe':{'path':f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json','sha256':sha(ROOT/f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json'),'nonzeroWeightIntersection':0,'allShapesCompositionMaxErrorM':composition},'limits':['This is an offline candidate recipe; no runtime/public catalog changes.','Always evaluate both mouth/brow from immutable common originals, not current mutable vertex buffers. Reset one parameter must preserve others.','Clone per actor; retain expression bindings and eye bones. Recompute composed normals/bounds consistently with existing pipeline.','No eye/skin point displacement, no surface-following or claimed universal skin clearance.','Original metadata/license retained; no automatic original-avatar appearance or gear acceptance for derived geometry.']}
 (BASE/f'{sex}-brow.recipe.json').write_text(json.dumps(recipe,indent=2)+'\n',encoding='utf-8')
 (folder/'expression-map.json').write_text(json.dumps({'targetNames':mesh['extras']['targetNames'],'blendShapeMaster':old.doc['extensions']['VRM']['blendShapeMaster'],'equalToSource':True},indent=2)+'\n',encoding='utf-8')
 report={'sex':sex,'sourceVRMSha256':source['sourceVRMSha256'],'avatarSha256':sha(folder/'avatar.vrm'),'repeatExportByteEqual':sha(folder/'avatar.vrm')==sha(folder/'repeat-export.vrm'),'exportExpectedMaxErrorM':error,'browTriangleEdgeMaxErrorM':edgeError,'bodyAttributesNodesRestInverseBindImagesMaterialsEqual':True,'primitiveChecks':primitiveChecks,'targets':targetChecks,'mouthCompositionMaxErrorM':composition,'noGameAcceptance':True}
 (folder/'audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');reports.append(report)
(BASE/'audit.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:r[k]for k in ['sex','avatarSha256','exportExpectedMaxErrorM','browTriangleEdgeMaxErrorM','mouthCompositionMaxErrorM']}for r in reports],indent=2))
