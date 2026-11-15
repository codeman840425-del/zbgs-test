"""One isolated point counterfactual, not a third garment or new gate."""
from pathlib import Path
import runpy,json,struct
import numpy as np
from mathutils import Vector
ctx=runpy.run_path(str(Path(__file__).with_name('classify-standing.py')))
G=ctx['G'];frame=ctx['frame'];tree=ctx['tree'];records=ctx['records']
b=(G/'m1-sixfold-skirt-v2.glb').read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length]);binary=b[28+length:]
def read(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];w={'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5123:'<u2',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
prim=doc['meshes'][0]['primitives'][0];p=read(prim['attributes']['POSITION']);j=read(prim['attributes']['JOINTS_0']);w=read(prim['attributes']['WEIGHTS_0']);skin=doc['skins'][0];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
palette=np.array([np.array(frame['bones'][doc['nodes'][n]['name']]).reshape(4,4).T for n in skin['joints']])@inverse
cfg=json.loads((G/'build-report.json').read_text(encoding='utf-8'));sections=cfg['sectionRecords'];data=[]
for record in records:
 i=record['candidateVertex'];row=i//121
 if row>=len(sections):continue
 t=sections[row]['fraction'];u=min(1,t/.19);blend=u*u*(3-2*u)
 if blend==1:continue
 angle=(i%121)/120*2*np.pi;section=sections[row];broad=np.array(section['centerXZ'])+np.array(section['axes'])*np.array([np.cos(angle),np.sin(angle)])
 delta=(1-blend)*(broad-p[i%121,[0,2]])
 q=p[i].astype(float).copy();q[[0,2]]+=delta
 point=np.array(frame['sourceBind']).reshape(4,4).T@np.r_[q,1]
 world=sum(w[i,k]*(palette[j[i,k]]@point)for k in range(4))[:3]
 nearest,n,face,distance=tree.find_nearest(Vector(world))
 data.append({'candidateVertex':i,'row':row,'sourceWaistHoldBlend':blend,'sourceXZDeltaMetres':delta.tolist(),'sameWeightsOriginalSignedNormalMetres':record['signedNearestNormalMetres'],'fullObservedSectionSignedNormalMetres':float((Vector(world)-nearest).dot(n)),'originalBodyFace':record['bodyFace'],'diagnosticBodyFace':face})
out={'diagnostic':'remove only source waist-radius hold at identical sampled vertices; keep pose/weights/margins','count':len(data),'becameNonnegative':sum(d['fullObservedSectionSignedNormalMetres']>=0 for d in data),'records':data,'limits':['No new mesh generated. This is a point counterfactual, not a full triangle/contact gate.','Does not solve the unchanged top layer or absent seated garment authoring.','No production source or frozen candidate modified.']}
(G/'waist-hold-diagnosis.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in out.items()if k!='records'},indent=2))
