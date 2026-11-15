"""One offline six-rigid-bone authoring fit, never per-frame point guidance.
Uses fixed269 full geometry to author a candidate target; no asset/body edits.
This is a feasibility specimen, not a pass or a hidden collision solution.
"""
from pathlib import Path
import argparse,gzip,hashlib,json,struct
import numpy as np

R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1'
parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/pose-response-v1');args=parser.parse_args();O=(R/args.out).resolve()
assert R.name=='m1-simple-skirt-worktree' and O.is_relative_to(R) and not O.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
asset=S/'generated-v4/m1-sixfold-skirt-v4.glb';b=asset.read_bytes();assert sha(b)=='cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885'
n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);buf=b[28+n:]
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]);w={'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1}[a['type']]
 return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
skin=doc['skins'][0];names=[doc['nodes'][j]['name']for j in skin['joints']];inverse=read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);rest=np.linalg.inv(inverse);hi=names.index('J_Bip_C_Hips');helpers=[i for i,n in enumerate(names)if 'Skirt'in n]
parts=[];faces=[];js=[];ws=[];offset=0
for p in doc['meshes'][0]['primitives']:
 pos=read(p['attributes']['POSITION']);parts.append(pos);faces.append(read(p['indices']).reshape(-1,3)+offset);js.append(read(p['attributes']['JOINTS_0']));ws.append(read(p['attributes']['WEIGHTS_0']));offset+=len(pos)
p=np.concatenate(parts).astype(float);tri=np.concatenate(faces);joint=np.concatenate(js);weight=np.concatenate(ws);P=np.c_[p,np.ones(len(p))];W=np.zeros((len(p),len(names)))
for k in range(4):np.add.at(W,(np.arange(len(p)),joint[:,k]),weight[:,k])
assert np.max(W[:len(parts[0]),helpers])==0
packed=(S/'input-269/four-poses.json.gz').read_bytes();capture=json.loads(gzip.decompress(packed));frames=capture['frames'];seated=frames[2]
def mat(a):return np.array(a).reshape(4,4).T
def pose_matrices(f):
 m=np.array([mat(f['bones'][name])for name in names])
 for i in helpers:
  parent=names.index('J_Bip_'+('L'if '_L_'in names[i]else'R')+'_UpperLeg')
  m[i]=m[parent]@inverse[parent]@rest[i]
 return m
def skin_points(m):return np.einsum('vj,jab,vb->va',W,m@inverse,P)[:,:3]
def bend(f,side):
 h=np.linalg.inv(mat(f['bones']['J_Bip_C_Hips']));a=(h@mat(f['bones'][f'J_Bip_{side}_UpperLeg']))[:3,3];c=(h@mat(f['bones'][f'J_Bip_{side}_LowerLeg']))[:3,3];d=c-a
 return max(0,float(np.arctan2(-d[2],-d[1])))
base=pose_matrices(seated);basepoints=skin_points(base);hip_points=(P@(base[hi]@inverse[hi]).T)[:,:3]
# Editable authoring design: front lower panels follow the actual thigh frame,
# back hangs in hips frame; lateral transition is continuous in source angle.
# This is NOT assumed clear: exact body/top/chair gate must evaluate the result.
center_x=float((p[:,0].min()+p[:,0].max())/2);center_z=float(np.mean(p[:len(parts[0]),2]));theta=np.arctan2(p[:,2]-center_z,p[:,0]-center_x)
front=np.clip((-np.sin(theta)+0.15)/0.95,0,1);front=front*front*(3-2*front)
lower=np.clip((.979-p[:,1])/(.979-.73),0,1);lower=lower*lower*(3-2*lower)
left=np.clip((center_x-p[:,0])/.16+.5,0,1);left=left*left*(3-2*left)
leg_points=[]
for side in ['L','R']:
 i=names.index(f'J_Bip_{side}_UpperLeg');leg_points.append((P@(base[i]@inverse[i]).T)[:,:3])
leg=left[:,None]*leg_points[0]+(1-left[:,None])*leg_points[1]
target=hip_points+(leg-hip_points)*(front*lower)[:,None]
target[:len(parts[0])]=basepoints[:len(parts[0])]
# Source ring duplicates are exact skin and unchanged; target at those points is
# likewise pinned. No point outside new lower mesh is eligible for fitting.
target[len(parts[0]):len(parts[0])+20]=basepoints[len(parts[0]):len(parts[0])+20]
effective=base@inverse
history=[]
for iteration in range(6):
 for j in helpers:
  mask=W[:,j]>.005;x=p[mask];w=W[mask,j];allposed=np.einsum('vj,jab,vb->va',W,effective,P)[:,:3]
  current=(P@effective[j].T)[:,:3];desired=(target-allposed+W[:,j,None]*current)[mask]/w[:,None]
  fitw=w*w;fitw/=fitw.sum();xc=(x*fitw[:,None]).sum(0);yc=(desired*fitw[:,None]).sum(0)
  u,_,vt=np.linalg.svd((x-xc).T@(fitw[:,None]*(desired-yc)));rotation=vt.T@u.T
  if np.linalg.det(rotation)<0:vt[-1]*=-1;rotation=vt.T@u.T
  m=np.eye(4);m[:3,:3]=rotation;m[:3,3]=yc-rotation@xc;effective[j]=m
 error=np.linalg.norm(np.einsum('vj,jab,vb->va',W,effective,P)[:,:3]-target,axis=1);history.append({'iteration':iteration+1,'rmsMetres':float(np.sqrt(np.mean(error**2))),'maxMetres':float(error.max())})
fitted=effective@rest;corrections={names[j]:np.linalg.inv(base[j])@fitted[j]for j in helpers}
def interpolate(m,t):
 r=m[:3,:3];angle=float(np.arccos(np.clip((np.trace(r)-1)/2,-1,1)));out=np.eye(4);out[:3,3]=m[:3,3]*t
 if angle>1e-8:
  axis=np.array([r[2,1]-r[1,2],r[0,2]-r[2,0],r[1,0]-r[0,1]])/(2*np.sin(angle));x,y,z=axis;k=np.array([[0,-z,y],[z,0,-x],[-y,x,0]]);out[:3,:3]=np.eye(3)+np.sin(angle*t)*k+(1-np.cos(angle*t))*(k@k)
 return out
angles={side:bend(seated,side)for side in ['L','R']};arrays=[];rows=[]
for f in frames:
 m=pose_matrices(f);bends={side:bend(f,side)for side in ['L','R']}
 for j in helpers:
  side='L'if '_L_'in names[j]else'R';t=np.clip(bends[side]/angles[side],0,1);t=t*t*(3-2*t);m[j]=m[j]@interpolate(corrections[names[j]],float(t))
 posed=skin_points(m);arrays.append(posed.tolist());rows.append({'label':f['label'],'bendRadians':bends,'maxNewDisplacementMetres':float(np.linalg.norm(posed-skin_points(pose_matrices(f)),axis=1).max())})
O.mkdir(parents=True)
config={'schema':'single-garment-six-bone-response-v1','garmentSha256':sha(b),'captureGzipSha256':sha(packed),'qualified':False,'method':'Six bounded offline alternating rigid least-squares sweeps to one editable seated target; no runtime fitting, body projection or old guide','limits':['Author target itself is not admitted; body/top/chair gate pending','Six rigid helpers may not express curved support; residual retained','Standing source failures not addressed'],'targetDesign':{'waistY':.979,'hemY':.73,'frontAngularStart':-.15,'frontAngularSpan':.95,'sourceCenterXZ':[center_x,center_z],'helperWeightThreshold':.005,'iterations':6},'referenceBendRadians':angles,'controls':[{'source':name,'parentSemantic':'leftUpperLeg'if '_L_'in name else'rightUpperLeg','localCorrectionMatrix':m.T.reshape(-1).tolist(),'translationMetres':float(np.linalg.norm(m[:3,3])),'rotationRadians':float(np.arccos(np.clip((np.trace(m[:3,:3])-1)/2,-1,1)))}for name,m in corrections.items()],'fitHistory':history,'poses':rows}
(O/'six-bone-response.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
(O/'four-pose-geometry.json.gz').write_bytes(gzip.compress(json.dumps({'schema':'simple-skirt-pose-response-samples-v1','positions':arrays,'triangles':tri.tolist(),'labels':[f['label']for f in frames],'seatedAuthorTarget':target.tolist()}).encode(),mtime=0))
print(json.dumps({'output':str(O),'fitHistory':history,'controls':[{k:v for k,v in c.items()if k!='localCorrectionMatrix'}for c in config['controls']],'poses':rows},indent=2))
