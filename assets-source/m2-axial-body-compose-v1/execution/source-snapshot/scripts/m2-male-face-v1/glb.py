import json,struct,hashlib
import numpy as np
class GLB:
 def __init__(self,p):
  raw=p.read_bytes();magic,version,length=struct.unpack_from('<4sII',raw);assert magic==b'glTF'and version==2 and length==len(raw);n,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON';self.doc=json.loads(raw[20:20+n]);self.bin=raw[28+n:]
 def acc(self,i):
  a=self.doc['accessors'][i];assert'sparse'not in a;v=self.doc['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 def images(self):
  return [hashlib.sha256(self.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]).hexdigest()for im in self.doc['images']for v in [self.doc['bufferViews'][im['bufferView']]]]
 def primitives(self):return {self.doc['materials'][p['material']]['name']:p for m in self.doc['meshes']for p in m['primitives']}
