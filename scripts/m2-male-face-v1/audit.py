import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import pathlib,json,hashlib,struct
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m2-male-face-v1';SPEC=json.loads((OUT/'spec.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
class GLB:
 def __init__(self,p):
  raw=p.read_bytes();magic,version,length=struct.unpack_from('<4sII',raw);assert magic==b'glTF'and version==2 and length==len(raw);n,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON';self.doc=json.loads(raw[20:20+n]);self.bin=raw[28+n:]
 def acc(self,i):
  a=self.doc['accessors'][i];assert'sparse'not in a;v=self.doc['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 def images(self):
  return [hashlib.sha256(self.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]).hexdigest()for im in self.doc['images']for v in [self.doc['bufferViews'][im['bufferView']]]]
 def primitives(self):return {self.doc['materials'][p['material']]['name']:p for m in self.doc['meshes']for p in m['primitives']}
base=GLB(ROOT/SPEC['sourceVRM']);new=GLB(OUT/'generated/avatar.vrm');assert base.images()==new.images();assert base.doc['nodes']==new.doc['nodes'];assert base.doc['materials']==new.doc['materials'];assert base.doc['extensions']['VRM']['humanoid']==new.doc['extensions']['VRM']['humanoid'];assert base.doc['extensions']['VRM']['blendShapeMaster']==new.doc['extensions']['VRM']['blendShapeMaster'];assert {k:v for k,v in base.doc['extensions']['VRM']['meta'].items()if k!='title'}=={k:v for k,v in new.doc['extensions']['VRM']['meta'].items()if k!='title'}
for a,b in zip(base.doc['skins'],new.doc['skins']):
 assert a['joints']==b['joints'];assert np.array_equal(base.acc(a['inverseBindMatrices']),new.acc(b['inverseBindMatrices']))
report={'id':SPEC['id'],'parentAvatarSha256':sha(ROOT/SPEC['sourceVRM']),'avatarSha256':sha(OUT/'generated/avatar.vrm'),'nodesSkinBindTopologyUVWeightsTexturesMaterialsHumanoidUnchanged':True,'sourcePermissionMetadataRetained':True,'expressionMappingUnchanged':True,'materials':[],'maxMorphPositionDeltaErrorM':0,'geometry':{},'runtimeStatus':'Not yet loaded in game. No inherited gear/prop/visual acceptance.'}
for name,a in base.primitives().items():
 b=new.primitives()[name];assert np.array_equal(base.acc(a['indices']),new.acc(b['indices']));assert a['attributes'].keys()==b['attributes'].keys()
 for k in ['JOINTS_0','WEIGHTS_0','TEXCOORD_0']:assert np.array_equal(base.acc(a['attributes'][k]),new.acc(b['attributes'][k]))
 oldp=base.acc(a['attributes']['POSITION']);newp=new.acc(b['attributes']['POSITION']);ix=base.acc(a['indices']).reshape(-1,3);used=np.unique(ix);delta=np.linalg.norm(newp-oldp,axis=1);changed=int((delta[used]>1e-8).sum());maxd=float(delta[used].max());assert np.isfinite(newp).all()
 if name!=SPEC['skinMaterial']:assert maxd==0,(name,maxd)
 targetErrors=[]
 for ta,tb in zip(a.get('targets',[]),b.get('targets',[])):
  if'POSITION'in ta:
   err=float(np.abs(base.acc(ta['POSITION'])-new.acc(tb['POSITION'])).max());targetErrors.append(err);report['maxMorphPositionDeltaErrorM']=max(report['maxMorphPositionDeltaErrorM'],err);assert err<3e-7
 report['materials'].append({'name':name,'changedVertices':changed,'maxDisplacementM':maxd,'targetCount':len(targetErrors),'indicesSha256':hashlib.sha256(ix.astype('<u4').tobytes()).hexdigest()})
 if name==SPEC['skinMaterial']:
  edges=np.unique(np.sort(np.concatenate([ix[:,[0,1]],ix[:,[1,2]],ix[:,[2,0]]]),axis=1),axis=0);length=lambda p:np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);ratio=length(newp)/np.maximum(length(oldp),1e-15);normal=lambda p:np.cross(p[ix[:,1]]-p[ix[:,0]],p[ix[:,2]]-p[ix[:,0]]);n0,n1=normal(oldp),normal(newp);area0,area1=np.linalg.norm(n0,axis=1),np.linalg.norm(n1,axis=1);valid=area0>1e-12;dot=(n0*n1).sum(1)/np.maximum(area0*area1,1e-30);assert not np.any(dot[valid]<=0);assert not np.any(area1[valid]<1e-12)
  report['geometry']={'edgeRatioMin':float(ratio.min()),'edgeRatioMax':float(ratio.max()),'maxTriangleNormalChangeDegrees':float(np.degrees(np.arccos(np.clip(dot[valid],-1,1))).max()),'newFlippedTriangles':0,'newDegenerateTriangles':0,'changedBoundsGltf':[[float(x)for x in oldp[delta>1e-8].min(0)],[float(x)for x in oldp[delta>1e-8].max(0)]]}
expression=[]
for group in new.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']:
 binds=[]
 for bind in group.get('binds',[]):
  m=new.doc['meshes'][bind['mesh']];names=m.get('extras',{}).get('targetNames',[]);assert 0<=bind['index']<len(names);binds.append({'mesh':m['name'],'targetIndex':bind['index'],'targetName':names[bind['index']],'weight':bind['weight']})
 expression.append({'name':group['name'],'preset':group['presetName'],'isBinary':group.get('isBinary',False),'binds':binds})
(OUT/'expression-map.json').write_text(json.dumps({'avatarSha256':report['avatarSha256'],'sameAsParent':True,'groups':expression,'sourceTargetNames':next(m for m in new.doc['meshes']if m['name'].startswith('Face'))['extras']['targetNames']},indent=2),encoding='utf8')
report['repeatHashes']={str(p.relative_to(OUT)):sha(p)for p in [OUT/folder/name for folder in ['generated','rebuild']for name in ['avatar.vrm','repeat-export.vrm']]};assert len(report['repeatHashes'])==4 and len(set(report['repeatHashes'].values()))==1;assert sha(ROOT/SPEC['sourceBlend'])==SPEC['sourceBlendSha256'];assert sha(ROOT/SPEC['sourceVRM'])==SPEC['sourceVRMSha256'];(OUT/'audit-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2))
