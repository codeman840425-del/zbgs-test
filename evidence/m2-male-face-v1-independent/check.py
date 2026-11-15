"""Independent read-only GLB/fit decode; no Blender/runtime or candidate writes."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import json,struct,hashlib,gzip
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent;PKG=ROOT/'assets-source/m2-male-face-v1'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
class File:
 def __init__(self,p):
  raw=p.read_bytes();magic,version,size=struct.unpack_from('<4sII',raw);assert (magic,version,size)==(b'glTF',2,len(raw));chunks={};off=12
  while off<len(raw):
   n,tag=struct.unpack_from('<I4s',raw,off);chunks[tag]=raw[off+8:off+8+n];off+=8+n
  self.j=json.loads(chunks[b'JSON']);self.b=chunks[b'BIN\0']
 def a(self,n):
  a=self.j['accessors'][n];assert 'sparse' not in a;v=self.j['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=self.b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 def prims(self):
  return {(mi,pi):p for mi,m in enumerate(self.j['meshes']) for pi,p in enumerate(m['primitives'])}
 def bind(self):
  return {self.j['nodes'][n]['name']:v for s in self.j['skins'] for n,v in zip(s['joints'],self.a(s['inverseBindMatrices']))}
spec=read(PKG/'spec.json');base=File(ROOT/spec['sourceVRM']);new=File(PKG/'generated/avatar.vrm');expected='25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153'
assert sha(PKG/'generated/avatar.vrm')==expected
assert sha(ROOT/spec['sourceVRM'])==spec['sourceVRMSha256'];assert sha(ROOT/spec['sourceBlend'])==spec['sourceBlendSha256']
assert base.j['nodes']==new.j['nodes'];assert base.j['skins']==new.j['skins'];assert base.j['materials']==new.j['materials'];assert base.j['scenes']==new.j['scenes']
for sa,sb in zip(base.j['skins'],new.j['skins']):assert np.array_equal(base.a(sa['inverseBindMatrices']),new.a(sb['inverseBindMatrices']))
for key in ['humanoid','blendShapeMaster','firstPerson','secondaryAnimation']:assert base.j['extensions']['VRM'][key]==new.j['extensions']['VRM'][key]
assert [{k:v for k,v in g.j['extensions']['VRM']['meta'].items() if k!='title'} for g in [base,new]][0]==[{k:v for k,v in g.j['extensions']['VRM']['meta'].items() if k!='title'} for g in [base,new]][1]
def images(g):
 return [hashlib.sha256(g.b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]).hexdigest() for im in g.j['images'] for v in [g.j['bufferViews'][im['bufferView']]]]
assert images(base)==images(new)
materials=[];byname={};maxMorph=0.;bodyExact=True
assert base.prims().keys()==new.prims().keys()
for key,p in base.prims().items():
 q=new.prims()[key];name=base.j['materials'][p['material']]['name'];assert p['material']==q['material'];assert p['attributes'].keys()==q['attributes'].keys();ix=base.a(p['indices']).ravel();assert np.array_equal(ix,new.a(q['indices']).ravel());ids=np.unique(ix)
 for attr in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(base.a(p['attributes'][attr]),new.a(q['attributes'][attr]))
 a,b=base.a(p['attributes']['POSITION']).astype('f8'),new.a(q['attributes']['POSITION']).astype('f8');change=np.linalg.norm(b-a,axis=1)
 if name!=spec['skinMaterial']:assert np.all(change[ids]==0),name
 if key[0]==0:
  for attr in p['attributes']:assert np.array_equal(base.a(p['attributes'][attr]),new.a(q['attributes'][attr])),(name,attr)
 oldtargets=p.get('targets',[]);newtargets=q.get('targets',[]);assert len(oldtargets)==len(newtargets)
 errors=[]
 for ta,tb in zip(oldtargets,newtargets):
  assert ta.keys()==tb.keys();err=float(np.max(np.abs(base.a(ta['POSITION']).astype('f8')-new.a(tb['POSITION']).astype('f8'))));errors.append(err);assert err<=3e-7
 maxMorph=max(maxMorph,max(errors,default=0));byname[name]=(p,q,a,b,ids)
 materials.append({'name':name,'changedReferencedVertices':int(np.count_nonzero(change[ids]>1e-8)),'maximumDisplacementM':float(change[ids].max()),'targets':len(oldtargets),'maxMorphPositionErrorM':max(errors,default=0)})
for ma,mb in zip(base.j['meshes'],new.j['meshes']):
 assert ma.get('weights')==mb.get('weights');assert ma.get('extras',{}).get('targetNames')==mb.get('extras',{}).get('targetNames')
faces=[m for m in new.j['meshes'] if m['name'].startswith('Face')];assert len(faces)==1;face=faces[0];assert len(face['extras']['targetNames'])==54
skin=byname[spec['skinMaterial']];p,q,a,b,ids=skin;ix=base.a(p['indices']).reshape(-1,3);n0=np.cross(a[ix[:,1]]-a[ix[:,0]],a[ix[:,2]]-a[ix[:,0]]);n1=np.cross(b[ix[:,1]]-b[ix[:,0]],b[ix[:,2]]-b[ix[:,0]]);l0=np.linalg.norm(n0,axis=1);l1=np.linalg.norm(n1,axis=1);valid=l0>1e-12;dots=(n0*n1).sum(axis=1);assert np.all(dots[valid]>0);assert np.all(l1[valid]>1e-12)
def nearest(points,targets):
 return np.concatenate([np.sqrt(np.min(np.sum((block[:,None,:]-targets[None,:,:])**2,axis=2),axis=1)) for block in np.array_split(points,16) if len(block)])
# Compare exported same-space meshes. Their mesh nodes have no local transform.
for node in base.j['nodes']:
 if 'mesh' in node:assert not any(k in node for k in ['matrix','translation','rotation','scale'])
body=byname['M00_001_01_Body_00_SKIN'];neckdist=nearest(a[ids],body[2][body[4]]);neckids=ids[neckdist<=spec['neckSeam']['matchDistanceM']];assert len(neckids)>0;assert np.array_equal(a[neckids],b[neckids])
mouth=byname['M00_000_00_FaceMouth_00_FACE'];mouthdist=nearest(a[ids],mouth[2][mouth[4]]);mouthrim=ids[mouthdist<=.0001];assert np.array_equal(a[mouthrim],b[mouthrim])
inspection=read(PKG/'inspection.json');delta=read(PKG/'generated/build-report.json');source=json.loads(gzip.decompress((PKG/'generated/source-delta.json.gz').read_bytes()));xyz=np.array(source['sourcePositions']);d=np.array(source['delta']);assert np.array_equal(xyz,np.array(inspection['positions']));changed=set(np.flatnonzero(np.linalg.norm(d,axis=1)>1e-9).tolist());assert changed==set(source['changedIds']);assert len(changed)==98
protected=set(delta['protectedAdjacencyIds']);assert not changed&protected
sourceSkin=next(m for m in inspection['materials'] if m['material']==spec['skinMaterial']);assert changed<=set(sourceSkin['ids'])
nonSkin=set().union(*(set(m['ids']) for m in inspection['materials'] if m['material']!=spec['skinMaterial']));assert not changed&nonSkin
eyeMorph=set().union(*(set(s['ids']) for s in inspection['shapeKeys'] if '_EYE_' in s['name']));eyeOverlap=sorted(changed&eyeMorph)
m=spec['mouthProtection'];core=(np.abs(xyz[:,0]-spec['centerX'])<=m['innerX'])&(xyz[:,2]>=m['bottomZ']+m['heightFade'])&(xyz[:,2]<=m['topZ']-m['heightFade'])&(xyz[:,1]>=m['startY']+m['depthFade']);assert np.all(d[core]==0)
equipment=read(PKG/'generated/equipment.json');parent=read(ROOT/'prototype/public/assets/m1b/equipment.json');nb=new.bind();fit=[]
assert len(equipment['items'])==len(parent['items'])==4
for e,o in zip(equipment['items'],parent['items']):
 assert e['compatibleAvatarSha256']==expected and o['compatibleAvatarSha256']==spec['sourceVRMSha256'];assert e['fitId'].startswith(spec['id']);assert 'materialRecipes' not in e
 for k in ['id','styleId','url','sha256','bytes','bindings']:assert e.get(k)==o.get(k)
 resource=ROOT/'prototype/public/assets/m1b'/e['url'];assert sha(resource)==e['sha256'];assert resource.stat().st_size==e['bytes'];gb=File(resource).bind();maxerr=0
 for bind in e['bindings']:
  assert np.array_equal(gb[bind['sourceBone']],nb[bind['targetRawBone']]);maxerr=max(maxerr,float(np.max(np.abs(np.array(bind['inverseBindMatrix'])-nb[bind['targetRawBone']]))));assert maxerr<1e-7
 fit.append({'id':e['id'],'fitId':e['fitId'],'unchangedResourceSha256':e['sha256'],'bindingMatrixMaxError':maxerr})
forearm=read(PKG/'generated/forearm-profile.json');oldforearm=read(ROOT/'prototype/public/assets/forearm-collision-v2/male.json');assert forearm['profiles']==oldforearm['profiles'];assert forearm['bodySHA256']==expected
profile=read(PKG/'generated/profile-entry.json');assert profile['sha256']==expected and profile['referenceBody']=='male';assert profile['manifestUrl']=='/assets/m1b/m2-male-jaw-v1-equipment.json';assert profile['forearmCollision']['sha256']==sha(PKG/'generated/forearm-profile.json')
repeat={f'{folder}/{name}':sha(PKG/folder/name) for folder in ['generated','rebuild'] for name in ['avatar.vrm','repeat-export.vrm']};assert set(repeat.values())=={expected}
report={'candidateSha256':expected,'passedOfflineChecks':True,'materials':materials,'nodesAndSkeletonRestAndAllInverseBindsExact':True,'allBodyAttributesAndIndicesExact':True,'defaultMorphWeightsAnd54NamesUnchanged':True,'vrmExpressionPresetBindingsUnchanged':True,'maxMorphPositionDeltaErrorM':maxMorph,'newBasisGeometryNotScaleOrExpression':True,'protection':{'sourceChangedPoints':len(changed),'protectedSourceAdjacencyPoints':len(protected),'changedProtectedSourcePoints':0,'changedNonSkinSourcePoints':0,'eyeMorphInfluenceOverlapChangedIds':eyeOverlap,'fullyProtectedMouthCoreSourcePoints':int(core.sum()),'changedMouthCorePoints':0,'exportedFaceBodyMatchingPointsWithin100um':len(neckids),'changedMatchingSeamPoints':0,'exportedMouthCoincidentSkinPointsWithin100um':len(mouthrim),'changedCoincidentMouthPoints':0},'basisGeometry':{'newFlippedTriangles':0,'newDegenerateTriangles':0,'maxNormalChangeDegrees':float(np.degrees(np.arccos(np.clip(dots[valid]/(l0[valid]*l1[valid]),-1,1))).max())},'equipment':fit,'forearmProfileRadiiExact':True,'repeatExportFileHashes':repeat,'limits':['No Blender rerun; saved blend semantics reviewed from generation code and source point dump, exported VRMs independently decoded.','Small positive jaw widthIncrease broadens sides; this is not a narrowing variant.','54 morph POSITION deltas preserved does not prove visual anatomy or all expression combinations.','No browser/game, skin-pose contact, clothing-motion or accessory acceptance.','No implicit microphone/glasses/normalized dance/optional shorts material recipe compatibility.']}
HERE.mkdir(parents=True,exist_ok=True);(HERE/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ['candidateSha256','passedOfflineChecks','maxMorphPositionDeltaErrorM','protection','basisGeometry']},indent=2))
