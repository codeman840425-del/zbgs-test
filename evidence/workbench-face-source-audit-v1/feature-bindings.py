"""Read-only exported Face skinning inventory. No Blender or source mutation."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import json, struct, hashlib
import numpy as np
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
def accessor(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']]
 d=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 assert 'sparse' not in a
 return np.ndarray((a['count'],w),dtype=d,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*d.itemsize),d.itemsize)).copy()
result={}
for sex in ['female','male']:
 p=ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm';raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=raw[28+n:];rows=[]
 for node in j['nodes']:
  if 'mesh' not in node:continue
  mesh=j['meshes'][node['mesh']]
  if not mesh['name'].startswith('Face'):continue
  bones=j['skins'][node['skin']]['joints']
  for prim in mesh['primitives']:
   ids=np.unique(accessor(j,b,prim['indices']));a=prim['attributes'];joints=accessor(j,b,a['JOINTS_0'])[ids];weights=accessor(j,b,a['WEIGHTS_0'])[ids]
   rows.append({'material':j['materials'][prim['material']]['name'],'positiveWeightVertexCounts':{j['nodes'][bones[int(k)]]['name']:int(np.any((joints==k)&(weights>0),axis=1).sum()) for k in np.unique(joints[weights>0])}})
 result[sex]={'sourceSha256':hashlib.sha256(raw).hexdigest(),'faceMaterials':rows,'eyeNodes':[{'name':v['name'],'translation':v.get('translation')} for v in j['nodes'] if v.get('name','') in ['J_Adj_L_FaceEye','J_Adj_R_FaceEye']]}
(HERE/'feature-bindings.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
