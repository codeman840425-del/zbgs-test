from pathlib import Path
import struct,json,hashlib,numpy as np
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(path):
 b=Path(path).read_bytes();n=struct.unpack_from("<I",b,12)[0];d=json.loads(b[20:20+n]);bn=b[28+n:]
 def acc(i):
  a=d["accessors"][i];v=d["bufferViews"][a["bufferView"]];dt={5121:"u1",5123:"<u2",5125:"<u4",5126:"<f4"}[a["componentType"]];w={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}[a["type"]];return np.ndarray((a["count"],w),dt,bn,v.get("byteOffset",0)+a.get("byteOffset",0),(v.get("byteStride",w*np.dtype(dt).itemsize),np.dtype(dt).itemsize)).copy()
 return b,d,acc
pairs=[("female-round-waist-to-unmasked","assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm","assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm"),("male-native-to-unmasked","assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm","assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm"),("female-expression-Joy","evidence/vroid-expression-study-v1/native-single-expression-v1/expression-study-baseline.vrm","evidence/vroid-expression-study-v1/native-single-expression-v1/expression-study-candidate.vrm")]
for label,x,y in pairs:
 bx,dx,ax=load(x);by,dy,ay=load(y);diff=[]
 for i in range(min(len(dx["accessors"]),len(dy["accessors"]))):
  a,b=ax(i),ay(i)
  if a.shape!=b.shape or not np.array_equal(a,b):diff.append(i)
 print(json.dumps({"label":label,"sourceSHA":sha(bx),"candidateSHA":sha(by),"accessorDiffs":diff,"nodes":[len(dx["nodes"]),len(dy["nodes"])],"skins":[len(dx["skins"]),len(dy["skins"])],"meshes":[len(dx["meshes"]),len(dy["meshes"])]}))
