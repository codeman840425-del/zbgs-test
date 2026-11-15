"""Actual fixed private skin palette identity; read-only, no source pose edits."""
from pathlib import Path
import gzip,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'private-layer-initial'
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]);w={'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
  return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return b,d,read
b,d,read=load(S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb');bodyRaw,bodyDoc,_=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);rest=np.linalg.inv(inverse);cap=json.loads(gzip.decompress((O/'capture.json.gz').read_bytes()));mat=lambda a:np.array(a).reshape(4,4).T
def local(node):
 if 'matrix'in node:return mat(node['matrix'])
 x,y,z,w=node.get('rotation',[0,0,0,1]);q=np.eye(4);q[:3,:3]=[[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]];q[:3,:3]*=np.array(node.get('scale',[1,1,1]));q[:3,3]=node.get('translation',[0,0,0]);return q
controls=[]
for c in cap['frames'][0]['controls']:
 name=c['name'];i=names.index(name);parentName='J_Bip_'+('L'if '_L_'in name else'R')+'_UpperLeg';parent=names.index(parentName);expected=inverse[parent]@rest[i];node=next(n for n in bodyDoc['nodes']if n.get('name')==name);runtime=mat(c['inferredCreationLocal']);changes=[float(abs(mat(next(x for x in f['controls']if x['name']==name)['inferredCreationLocal'])-runtime).max())for f in cap['frames']]
 controls.append({'name':name,'runtimeCreationLocal':runtime.T.reshape(-1).tolist(),'sourceInverseParentLocalMaximumElementError':float(abs(runtime-expected).max()),'originalVRMNodeLocalMaximumElementError':float(abs(runtime-local(node)).max()),'creationLocalConstancyAcrossFourFramesMax':max(changes)})
frames=[]
for frame in cap['frames']:
 world=np.array([mat(frame['bones'][n])for n in names])
 for c in frame['controls']:world[names.index(c['name'])]=mat(c['privateWorld'])
 palette=world@inverse;primitives=[]
 for i,p in enumerate(d['meshes'][0]['primitives']):
  pos=read(p['attributes']['POSITION']);P=np.c_[pos,np.ones(len(pos))];js=read(p['attributes']['JOINTS_0']);ws=read(p['attributes']['WEIGHTS_0']);out=np.zeros((len(P),4))
  for k in range(4):out+=np.einsum('nij,nj->ni',palette[js[:,k]],P)*ws[:,k,None]
  actual=np.array(frame['skirt'][i]['positions']).reshape(-1,3);error=np.linalg.norm(actual-out[:,:3],axis=1);primitives.append({'name':frame['skirt'][i]['name'],'vertices':len(pos),'maximumReadbackErrorMetres':float(error.max()),'worstVertex':int(error.argmax())})
 frames.append({'label':frame['label'],'primitives':primitives})
report={'build':cap['identity']['runtimeBuild']['shortId'],'sourceSha256':hashlib.sha256(b).hexdigest(),'bodySha256':hashlib.sha256(bodyRaw).hexdigest(),'controls':controls,'frames':frames,'limits':['Proves actual creation constant and current actual final LBS identity only, not contact or cloth stability.','Original raw helper/spring pose is deliberately not substituted.']}
(O/'palette-readback.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'creationLocalMaxError':max(c['sourceInverseParentLocalMaximumElementError']for c in controls),'originalVRMMaxError':max(c['originalVRMNodeLocalMaximumElementError']for c in controls),'fourFrameConstancyMax':max(c['creationLocalConstancyAcrossFourFramesMax']for c in controls),'readbackMaxMetres':max(p['maximumReadbackErrorMetres']for f in frames for p in f['primitives'])}))
