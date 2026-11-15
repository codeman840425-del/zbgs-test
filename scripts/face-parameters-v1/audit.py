"""Read original/exported VRM and prepare exact-identity runtime recipe data.
No public/runtime/source edits. The recipe itself is not runtime integration.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,gzip,hashlib
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-parameters-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
digest=lambda a:hashlib.sha256(a.tobytes()).hexdigest()
spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
reports=[];recipes=[]

def bounds(p):return [p.min(0).tolist(),p.max(0).tolist()]
def shape_geometry(old,new,tri):
 edges=np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0)
 length=lambda p:np.linalg.norm(p[edges[:,1]]-p[edges[:,0]],axis=1)
 l0,l1=length(old),length(new);valid_e=l0>1e-7;ratios=l1[valid_e]/l0[valid_e]
 normal=lambda p:np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
 a,b=normal(old),normal(new);aa,ab=np.linalg.norm(a,axis=1),np.linalg.norm(b,axis=1)
 valid=aa>1e-12;dot=np.sum(a*b,axis=1)/np.maximum(aa*ab,1e-30)
 return {'edgeRatioMin':float(ratios.min()),'edgeRatioMax':float(ratios.max()),'areaRatioMin':float((ab[valid]/aa[valid]).min()),'areaRatioMax':float((ab[valid]/aa[valid]).max()),'maxNormalChangeDegrees':float(np.degrees(np.arccos(np.clip(dot[valid],-1,1))).max()),'originalTinyTriangles':int((~valid).sum()),'newDegenerateTriangles':int((valid&(ab<=1e-12)).sum()),'newNormalReversals':int((valid&(dot<=0)).sum())}

for sex,source in spec['bodies'].items():
 parent_path=ROOT/source['sourceVRM'];old=GLB(parent_path)
 assert sha(parent_path)==source['sourceVRMSha256']
 mi=next(i for i,m in enumerate(old.doc['meshes'])if m['name'].startswith('Face'))
 mesh=old.doc['meshes'][mi];pr=mesh['primitives'][0];pos=old.acc(pr['attributes']['POSITION'])
 mapping=json.loads(gzip.decompress((BASE/'generated'/f'{sex}-mouth-width-96-v1/mapping.json.gz').read_bytes()))
 source_pos=np.array(mapping['sourcePositions']);converted=source_pos[:,[0,2,1]].copy();converted[:,2]*=-1
 tree=cKDTree(converted);dist,index=tree.query(pos);assert dist.max()<1e-6
 source_weights=np.array(mapping['sourceVertexWeights']);w=source_weights[index]
 # Duplicate source seam positions must not choose different operator coefficients.
 for p,weight in zip(pos,w):
  choices=tree.query_ball_point(p,1e-6)
  assert choices and max(abs(source_weights[choices]-weight))<1e-10
 cx=mapping['centerX'];cx_array=np.array([cx,0,0])
 rim_source=mapping['mouthSeamVertices'];mouth_source=mapping['mouthVertices']
 mouth_prim=next(p for p in mesh['primitives']if 'FaceMouth' in old.doc['materials'][p['material']]['name'])
 skin_prim=next(p for p in mesh['primitives']if 'Face_00_SKIN' in old.doc['materials'][p['material']]['name'])
 skinids=np.unique(old.acc(skin_prim['indices']));mouthids=np.unique(old.acc(mouth_prim['indices']))
 mt=cKDTree(pos[mouthids]);md,midx=mt.query(pos[skinids]);pairs=np.column_stack([skinids[md<1e-7],mouthids[midx[md<1e-7]]]);assert len(pairs)==32
 protected=np.flatnonzero(w==0)
 recipe={'schema':'character-face-geometry-recipe-v1','id':f'{sex}-mouth-width-v1','baseAvatarSha256':sha(parent_path),'parameter':'mouthWidth','range':[-.04,.04],'default':0,'sourceAxis':'glTF mesh-local X','formula':'xNew = centerX + (xOriginal-centerX)*(1+parameter*weight); deltaXNew=deltaXOriginal*(1+parameter*weight); y/z unchanged','expressionRule':'fixed coefficients from Basis; same affine on all absolute target shapes; relative deltas multiplied, not translated','centerX':cx,'weights':w.tolist(),'sourceVertexMap':index.tolist(),'sourceMappingMaxErrorM':float(dist.max()),'meshIndex':mi,'meshName':mesh['name'],'positionCount':len(pos),'basePositionSha256':digest(pos),'primitiveIdentities':[{'primitiveIndex':i,'materialName':old.doc['materials'][p['material']]['name'],'indexSha256':digest(old.acc(p['indices'])),'positionSha256':digest(old.acc(p['attributes']['POSITION'])),'uvSha256':digest(old.acc(p['attributes']['TEXCOORD_0'])),'targetCount':len(p.get('targets',[]))}for i,p in enumerate(mesh['primitives'])],'mouthBoundaryPairs':pairs.tolist(),'protectedVertices':protected.tolist(),'limits':['Endpoints checked against independent Blender exports; no game visual acceptance.','Must clone all mutable base and morph attributes per actor; derive each parameter from originals, not previous result.','Keep original topology/UV/weights and material groups. Recompute base and each absolute morph normal, then relative normal deltas if renderer consumes them; endpoint normal agreement is a separate check.','New runtime geometry is original base SHA plus recipe SHA plus parameter, not original-avatar geometry identity.','No automatic prop/gear/normalized dance SHA compatibility inheritance.']}
 recipe_path=BASE/f'{sex}-mouth-width.recipe.json';recipe_path.write_text(json.dumps(recipe,indent=2),encoding='utf-8')
 recipes.append({'id':recipe['id'],'file':recipe_path.name,'sha256':sha(recipe_path),'baseAvatarSha256':recipe['baseAvatarSha256']})
 for factor in spec['factors']:
  identifier=f'{sex}-mouth-width-{round(factor*100)}-v1';folder=BASE/'generated'/identifier
  new=GLB(folder/'avatar.vrm');nmesh=new.doc['meshes'][mi];npr=nmesh['primitives'][0]
  pnew=new.acc(npr['attributes']['POSITION']);scales=1+(factor-1)*w
  expected=pos.copy().astype(float);expected[:,0]=cx+(expected[:,0]-cx)*scales
  error=float(np.linalg.norm(expected-pnew,axis=1).max());assert error<3e-7
  assert old.doc['nodes']==new.doc['nodes'];assert old.images()==new.images();assert old.doc['materials']==new.doc['materials']
  assert old.doc['extensions']['VRM']['humanoid']==new.doc['extensions']['VRM']['humanoid']
  assert old.doc['extensions']['VRM']['blendShapeMaster']==new.doc['extensions']['VRM']['blendShapeMaster']
  assert {k:v for k,v in old.doc['extensions']['VRM']['meta'].items()if k!='title'}=={k:v for k,v in new.doc['extensions']['VRM']['meta'].items()if k!='title'}
  for a,b in zip(mesh['primitives'],nmesh['primitives']):
   assert np.array_equal(old.acc(a['attributes']['POSITION']),pos) and np.array_equal(new.acc(b['attributes']['POSITION']),pnew)
   for i,(ta,tb)in enumerate(zip(a['targets'],b['targets'])):
    assert np.array_equal(old.acc(ta['POSITION']),old.acc(pr['targets'][i]['POSITION']))
    assert np.array_equal(new.acc(tb['POSITION']),new.acc(npr['targets'][i]['POSITION']))
  for a,b in zip(old.doc['skins'],new.doc['skins']):
   assert a['joints']==b['joints'];assert np.array_equal(old.acc(a['inverseBindMatrices']),new.acc(b['inverseBindMatrices']))
  for om,nm in zip(old.doc['meshes'],new.doc['meshes']):
   for a,b in zip(om['primitives'],nm['primitives']):
    assert np.array_equal(old.acc(a['indices']),new.acc(b['indices']))
    for k in ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']:assert np.array_equal(old.acc(a['attributes'][k]),new.acc(b['attributes'][k]))
    if not om['name'].startswith('Face'):
     for k in a['attributes']:assert np.array_equal(old.acc(a['attributes'][k]),new.acc(b['attributes'][k]))
  triangles=np.concatenate([old.acc(p['indices']).reshape(-1,3)for p in mesh['primitives']])
  shapes=[];targets=[None]+pr['targets'];newtargets=[None]+npr['targets'];names=['Basis']+mesh['extras']['targetNames']
  for name,ta,tb in zip(names,targets,newtargets):
   do=np.zeros_like(pos) if ta is None else old.acc(ta['POSITION']);dn=np.zeros_like(pos) if tb is None else new.acc(tb['POSITION'])
   de=do.copy().astype(float);de[:,0]*=scales
   derr=float(abs(de-dn).max());assert derr<3e-7
   oldq,newq=pos+do,pnew+dn
   protected_error=float(np.linalg.norm(newq[protected]-oldq[protected],axis=1).max());assert protected_error<3e-7
   oldgap=oldq[pairs[:,0]]-oldq[pairs[:,1]];newgap=newq[pairs[:,0]]-newq[pairs[:,1]]
   expectedgap=oldgap.copy();expectedgap[:,0]*=factor
   gaperr=float(np.linalg.norm(expectedgap-newgap,axis=1).max());assert gaperr<3e-7
   geom=shape_geometry(oldq,newq,triangles)
   shapes.append({'name':name,'maxAffineDeltaErrorM':derr,'protectedMaxErrorM':protected_error,'maxDisplacementM':float(np.linalg.norm(newq-oldq,axis=1).max()),'mouthPairGapBeforeM':float(np.linalg.norm(oldgap,axis=1).max()),'mouthPairGapAfterM':float(np.linalg.norm(newgap,axis=1).max()),'mouthPairAffineErrorM':gaperr,**geom})
  repeat=[folder/'avatar.vrm',folder/'repeat-export.vrm',BASE/'rebuild'/identifier/'avatar.vrm',BASE/'rebuild'/identifier/'repeat-export.vrm']
  hashes=[sha(p)for p in repeat];assert len(set(hashes))==1
  expression={'baseAvatarSha256':sha(parent_path),'avatarSha256':hashes[0],'targetNames':nmesh['extras']['targetNames'],'blendShapeMaster':new.doc['extensions']['VRM']['blendShapeMaster'],'unchangedMapping':True,'targetAttributeSets':sorted({tuple(t.keys())for p in nmesh['primitives']for t in p['targets']})}
  (folder/'expression-map.json').write_text(json.dumps(expression,indent=2),encoding='utf-8')
  r={'id':identifier,'avatarSha256':hashes[0],'parentAvatarSha256':sha(parent_path),'recipeSha256':sha(recipe_path),'factor':factor,'endpointRecipeMaxPositionErrorM':error,'changedBasisVertices':int((np.linalg.norm(pnew-pos,axis=1)>1e-8).sum()),'maxBasisDisplacementM':float(np.linalg.norm(pnew-pos,axis=1).max()),'fullBodyAttributesUnchanged':True,'nodesBindUVWeightsMaterialsTexturesUnchanged':True,'expressionMappingUnchanged':True,'mouthSeamPairs':len(pairs),'shapes':shapes,'repeatExportHashes':hashes,'sourceStatus':'Source endpoints and affine semantics checked; visual/runtime acceptance pending'}
  (folder/'audit-report.json').write_text(json.dumps(r,indent=2),encoding='utf-8');reports.append(r)
(BASE/'audit-report.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
(BASE/'recipe-manifest.json').write_text(json.dumps({'schema':'character-face-geometry-recipes-v1','recipes':recipes},indent=2),encoding='utf-8')
manifest={'schema':'face-parameter-endpoints-v1','specSha256':sha(BASE/'spec.json'),'generatorSha256':sha(ROOT/'scripts/face-parameters-v1/build.py'),'auditScriptSha256':sha(Path(__file__)),'recipes':recipes,'endpoints':[]}
for r in reports:
 f=BASE/'generated'/r['id']
 manifest['endpoints'].append({'id':r['id'],'parameter':r['factor']-1,'parentAvatarSha256':r['parentAvatarSha256'],'avatar':str((f/'avatar.vrm').relative_to(BASE)).replace('\\','/'),'avatarSha256':r['avatarSha256'],'blend':str((f/'editable.blend').relative_to(BASE)).replace('\\','/'),'blendSha256':sha(f/'editable.blend'),'expressionMapSha256':sha(f/'expression-map.json'),'auditSha256':sha(f/'audit-report.json')})
(BASE/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps([{'id':r['id'],'sha256':r['avatarSha256'],'changed':r['changedBasisVertices'],'maxBasisMm':r['maxBasisDisplacementM']*1000,'maxAffineErrorM':r['endpointRecipeMaxPositionErrorM'],'flips':sum(s['newNormalReversals']for s in r['shapes']),'newDegenerate':sum(s['newDegenerateTriangles']for s in r['shapes']),'maxEdgeRatio':max(s['edgeRatioMax']for s in r['shapes'])}for r in reports],indent=2))

