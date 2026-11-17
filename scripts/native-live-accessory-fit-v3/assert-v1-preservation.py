"""Check that v3 did not move male v1 non-thumb controls or unmixed points."""
import json, pathlib, struct, numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
def load_json(p): return json.loads((ROOT/p).read_text())
def glb():
 p=ROOT/'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm';b=p.read_bytes();s=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+s]);bin=b[28+s:]
 def acc(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return d,acc
v1=load_json('assets-source/native-live-accessory-fit-v1/male-grip.json');v3=load_json('assets-source/native-live-accessory-fit-v3/male-grip.json')
nonthumb=[n for n in v1['normalizedFingerRotations'] if 'Thumb' not in n]
qerr=max(max(abs(a-b) for a,b in zip(v1['normalizedFingerRotations'][n],v3['normalizedFingerRotations'][n])) for n in nonthumb)
r1=load_json('assets-source/native-live-accessory-fit-v1/male-skin-reference.json');r3=load_json('assets-source/native-live-accessory-fit-v3/male-skin-reference.json');d,a=glb();h={n:v['node'] for n,v in d['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()};thumb={h[n] for n in h if n.startswith('rightThumb')};sk=d['skins'][0];p=d['meshes'][1]['primitives'][0];ji=a(p['attributes']['JOINTS_0']);w=a(p['attributes']['WEIGHTS_0']);w=w/w.sum(1,keepdims=True);ids=[]
for i,(idx,f) in enumerate(zip(r1['vertexIds'],r1['vertexFamilies'])):
 nodes=set(int(x) for x,weight in zip(np.array(sk['joints'])[ji[idx]],w[idx]) if weight>1e-8)
 if f!='Thumb' and not nodes.intersection(thumb): ids.append(i)
p1=np.array(r1['rawHandLocalPoints']);p3=np.array(r3['rawHandLocalPoints']);perr=max(np.linalg.norm(p1[i]-p3[i]) for i in ids)
out={'schema':'native-live-accessory-v3-preservation-check-v1','nonThumbNormalizedQuaternionMaxAbsError':float(qerr),'unmixedNonThumbVertexCount':len(ids),'unmixedNonThumbSkinPointMaxErrorMetres':float(perr),'mixedNonThumbVertexCount':sum(1 for i,f in enumerate(r1['vertexFamilies']) if f!='Thumb')-len(ids),'passed':bool(qerr<1e-9 and perr<1e-9),'limits':['Mixed non-thumb vertices with thumb weights are intentionally reported separately because a thumb-only pose can move them.']}
(ROOT/'assets-source/native-live-accessory-fit-v3/preservation-assertions.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if not out['passed']: raise SystemExit(1)
