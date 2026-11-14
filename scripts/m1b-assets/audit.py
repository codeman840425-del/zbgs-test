"""Offline male-source/gear binding and dimension audit; no runtime approval."""
import pathlib,json,struct,hashlib
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'assets-source/m1b/spec.json').read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
class GLB:
 def __init__(self,path):
  data=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',data)
  assert magic==b'glTF' and version==2 and total==len(data)
  length,kind=struct.unpack_from('<I4s',data,12);assert kind==b'JSON'
  self.doc=json.loads(data[20:20+length]);self.bin=data[28+length:]
  self.parents={c:i for i,n in enumerate(self.doc['nodes']) for c in n.get('children',[])};self.cache={}
 def acc(self,index):
  a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']]
  dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],width),dtype=dtype,buffer=self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
 def world(self,index):
  if index in self.cache:return self.cache[index]
  n=self.doc['nodes'][index]
  if 'matrix' in n:m=np.array(n['matrix']).reshape((4,4),order='F')
  else:
   x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4)
   m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  self.cache[index]=self.world(self.parents[index])@m if index in self.parents else m
  return self.cache[index]
 def image_hashes(self):
  hashes=[]
  for image in self.doc.get('images',[]):
   assert 'uri' not in image,'External image dependency'
   v=self.doc['bufferViews'][image['bufferView']];start=v.get('byteOffset',0);hashes.append(hashlib.sha256(self.bin[start:start+v['byteLength']]).hexdigest())
  return hashes

body_path=ROOT/SPEC['roundtrip'];assert sha(body_path)==SPEC['roundtripSha256']
body=GLB(body_path);j=body.doc
sem={b['bone']:b['node'] for b in j['extensions']['VRM']['humanoid']['humanBones']}
raw_positions={name:body.world(index)[:3,3] for name,index in sem.items()}
runtime_positions={name:pos*np.array([-1,1,-1]) for name,pos in raw_positions.items()}
distance=lambda a,b:float(np.linalg.norm(raw_positions[a]-raw_positions[b]))
measurements={'hipsHeight':float(raw_positions['hips'][1]),'shoulderSpan':distance('leftUpperArm','rightUpperArm'),'ankleSpacing':distance('leftFoot','rightFoot'),'legs':{side:{'upper':distance(side+'UpperLeg',side+'LowerLeg'),'lower':distance(side+'LowerLeg',side+'Foot'),'ankleHeight':float(raw_positions[side+'Foot'][1]),'footToToe':distance(side+'Foot',side+'Toes')} for side in ['left','right']}}
source_bind={}
for skin in j['skins']:
 for node,inverse in zip(skin['joints'],body.acc(skin['inverseBindMatrices'])):
  source_bind[j['nodes'][node]['name']]=inverse
manifest=json.loads((ROOT/'prototype/public/assets/m1b/equipment.json').read_text(encoding='utf8'));checks=[]
for entry in manifest['items']:
 path=ROOT/'prototype/public/assets/m1b'/entry['url'];assert sha(path)==entry['sha256'] and path.stat().st_size==entry['bytes']
 assert entry['compatibleAvatarSha256']==SPEC['roundtripSha256']
 g=GLB(path);d=g.doc;skin=d['skins'][0];ibm=g.acc(skin['inverseBindMatrices']);names=[d['nodes'][i]['name'] for i in skin['joints']]
 assert len(entry['bindings'])==len(names)
 for name,inverse,binding in zip(names,ibm,entry['bindings']):
  assert name==binding['sourceBone']==binding['targetRawBone']
  assert np.max(np.abs(inverse-source_bind[name]))<1e-7
  assert np.max(np.abs(inverse-np.array(binding['inverseBindMatrix'])))<1e-7
 worst_weight=0.;worst_rest=0.;vertices=0;triangles=0
 for p in d['meshes'][0]['primitives']:
  a={name:g.acc(i) for name,i in p['attributes'].items()};w=a['WEIGHTS_0'];js=a['JOINTS_0'];pos=a['POSITION']
  assert np.all(np.isfinite(pos)) and np.all(w>=0) and np.all(js<len(names))
  worst_weight=max(worst_weight,float(np.max(np.abs(w.sum(1)-1))))
  palette=[g.world(node)@inv.reshape((4,4),order='F') for node,inv in zip(skin['joints'],ibm)]
  homogeneous=np.c_[pos,np.ones(len(pos))];deformed=np.zeros_like(homogeneous)
  for k in range(4):deformed+=np.einsum('nij,nj->ni',np.array([palette[int(i)] for i in js[:,k]]),homogeneous)*w[:,k,None]
  worst_rest=max(worst_rest,float(np.max(np.linalg.norm(deformed[:,:3]-pos,axis=1))))
  vertices+=len(pos);triangles+=len(g.acc(p['indices']))//3
 assert worst_weight<1e-5 and worst_rest<2e-6
 assert set(g.image_hashes())<=set(body.image_hashes()),'Changed/untracked texture source'
 checks.append({'id':entry['id'],'sha256':entry['sha256'],'vertices':vertices,'triangles':triangles,'bindings':len(names),'maxWeightSumError':worst_weight,'maxRestSkinPositionErrorMeters':worst_rest,'texturesByteIdenticalToBodySource':True})

primitive_audit=[];shoe_profile={}
for node in j['nodes']:
 if 'mesh' not in node:continue
 for p in j['meshes'][node['mesh']]['primitives']:
  material=j['materials'][p['material']]['name'];used=np.unique(body.acc(p['indices']));pos=body.acc(p['attributes']['POSITION'])[used]
  primitive_audit.append({'material':material,'vertices':len(pos),'triangles':len(body.acc(p['indices']))//3,'bounds':[pos.min(0).tolist(),pos.max(0).tolist()],'morphTargets':len(p.get('targets',[]))})
  if '_Shoes_' not in material:continue
  skin=j['skins'][node['skin']];js=body.acc(p['attributes']['JOINTS_0'])[used];w=body.acc(p['attributes']['WEIGHTS_0'])[used];runtime_pos=pos*np.array([-1,1,-1])
  for side in ['left','right']:
   allowed={skin['joints'].index(sem[side+part]) for part in ['Foot','Toes','LowerLeg']};own=np.sum(np.where(np.isin(js,list(allowed)),w,0),axis=1)>.999
   selected=runtime_pos[own];foot=runtime_positions[side+'Foot'];patches={}
   for kind in ['heel','toe']:
    region=selected[selected[:,2]<=foot[2]+.015] if kind=='heel' else selected[selected[:,2]>=foot[2]+.015]
    low=region[region[:,1]<region[:,1].min()+.012]
    patches[kind]={'vertices':len(low),'centerRootSpace':low.mean(0).tolist(),'minimumY':float(low[:,1].min())}
   shoe_profile[side]={'selectedVertices':len(selected),'boundsRootSpace':[selected.min(0).tolist(),selected.max(0).tolist()],'patches':patches}

profile={'assetId':'beta-base-male-m1b','url':'/assets/foundation/base-male-roundtrip.vrm','sha256':SPEC['roundtripSha256'],'equipmentManifestUrl':'/assets/m1b/equipment.json','materialRoles':{'body':'^M00_001_01_Body_00_SKIN$','sourceClothes':'_(Tops|Bottoms|Shoes)_|_Accessory_Tie_','hair':'_HAIR$','face':'^M00_000_00_(Face|Eye)'},'rawSourceCoordinates':'VRM0 rest; Y up, display forward requires rotateVRM0. Raw left leg is negative X.','runtimeRootCoordinates':'After rotateVRM0 at root identity: raw source X/Z negated; Y unchanged. All numbers below are measured, not fitted gameplay constants.','measurementsMeters':measurements,'runtimeRestBones':{k:v.tolist() for k,v in runtime_positions.items() if k in ['hips','leftUpperLeg','leftLowerLeg','leftFoot','leftToes','rightUpperLeg','rightLowerLeg','rightFoot','rightToes','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand']},'shoeCalibrationReference':shoe_profile,'seatProfile':'No female constants copied. Derive seated pelvis/hand/trouser clearances from this body and current room chair in runtime tests; rest-only audit cannot approve them.','suggestedAdaptiveFlag':{'deriveSeatFromBody':True},'noSkirt':True}
out=ROOT/'assets-source/m1b'
(out/'profile-measurements.json').write_text(json.dumps(profile,indent=2)+'\n',encoding='utf8')
report={'sourceSha256':SPEC['roundtripSha256'],'equipment':checks,'sourcePrimitiveAudit':primitive_audit,'skinTriangles':sum(p['triangles'] for p in primitive_audit if '_Body_00_SKIN' in p['material']),'faceMorphTargets':max(p['morphTargets'] for p in primitive_audit),'status':'offline structure/rest-bind passed; browser/runtime and visual actions not tested'}
assert report['skinTriangles']==7340 and report['faceMorphTargets']==54
(out/'audit-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'measurements':measurements,'equipment':checks,'bodySkinTriangles':report['skinTriangles'],'faceMorphs':report['faceMorphTargets']},indent=2))
