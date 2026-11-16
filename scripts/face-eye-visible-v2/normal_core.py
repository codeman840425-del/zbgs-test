"""Deterministic complete-Face area-weighted normal evaluation and GLB writing."""
import json,struct
import numpy as np
def normals(position,triangles):
 result=np.zeros_like(position,dtype=np.float64)
 t=position[triangles];cross=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
 for corner in range(3):np.add.at(result,triangles[:,corner],cross)
 length=np.linalg.norm(result,axis=1);valid=length>1e-20;result[valid]/=length[valid,None]
 return result
def append_vec3(doc,blob,values):
 values=np.asarray(values,dtype='<f4');assert values.ndim==2 and values.shape[1]==3 and np.isfinite(values).all()
 blob.extend(b'\0'*(-len(blob)%4));offset=len(blob);data=values.tobytes();blob.extend(data)
 bv=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data),'target':34962})
 acc=len(doc['accessors']);doc['accessors'].append({'bufferView':bv,'byteOffset':0,'componentType':5126,'count':len(values),'type':'VEC3'})
 return acc
def write_glb(path,doc,blob):
 doc['buffers'][0]['byteLength']=len(blob);j=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*(-len(j)%4);blob+=b'\0'*(-len(blob)%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
 path.write_bytes(result)
