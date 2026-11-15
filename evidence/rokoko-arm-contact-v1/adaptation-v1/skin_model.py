import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1'
import json,gzip,pathlib,numpy as np
from scipy.spatial.transform import Rotation
P=pathlib.Path(__file__).resolve().parent
bundle=json.loads(gzip.decompress((P.parent/'arm-inputs.json.gz').read_bytes()))
def mat(a):return np.array(a).reshape(4,4).T
class Actor:
 def __init__(self,body,anchor=3):
  self.body=body;self.data=json.loads(gzip.decompress((P/f'{body}-skin-fixture.json.gz').read_bytes()));self.rig=bundle['targets'][body]['rig']['normalizedBones'];self.clip=bundle['targets'][body]['clip'];self.tracks={t['name']:t for t in self.clip['clip']['tracks']};self.samples=self.data['samples'];self.times=np.array(self.tracks['hips.position']['times']);self.C={};self.meshes=[]
  s=min(self.samples,key=lambda v:abs(v["time"]-anchor))
  for k,b in s['bones'].items():
   ancestor=b['semantic']or b['ancestor']or 'hips';self.C[k]=(ancestor,np.linalg.inv(mat(s['norm'][ancestor]))@mat(b['matrix']))
  for mesh in self.data['meshes']:
   m=dict(mesh);m['p']=np.c_[np.array(m['positions']).reshape(-1,3),np.ones(len(m['positions'])//3)];m['ix']=np.array(m['skinIndex']).reshape(-1,4).astype(int);m['w']=np.array(m['skinWeight']).reshape(-1,4);m['faces']=np.array(m['indices']).reshape(-1,3);m['ib']=np.array([mat(b)for b in m['inverseBind']]);m['bind']=mat(m['bindMatrix']);ss=next(v for v in s['meshes']if v['name']==m['name']);m['post']=mat(ss['world'])@mat(ss['bindInverse']);m['bp']=m['p']@m['bind'].T;self.meshes.append(m)
 def local(self,index):
  return {k:Rotation.from_quat(np.array(self.tracks[k+'.quaternion']['values']).reshape(-1,4)[index]if k+'.quaternion'in self.tracks else b['localQuaternion']).as_matrix()for k,b in self.rig.items()}
 def fk(self,index,delta=None):
  rots=self.local(index);world={};hip=np.array(self.tracks['hips.position']['values']).reshape(-1,3)[index]
  if delta is not None:
   for j,k in enumerate(self.changed):rots[k]=rots[k]@Rotation.from_rotvec(delta[j*3:j*3+3]).as_matrix()
  def one(k):
   if k in world:return world[k]
   b=self.rig[k];par=one(b['parentSemantic'])if b['parentSemantic']else mat(b['actualParentWorldMatrix']);m=np.eye(4);m[:3,:3]=rots[k]*b['localScale'];m[:3,3]=hip if k=='hips'else b['localPosition'];world[k]=par@m;return world[k]
  for k in self.rig:one(k)
  if delta is not None:
   original=self.fk(index)
   # absolute wrist orientation preserved, descendants recomputed from same source local fingers
   for side in ['left','right']:
    hand=side+'Hand';world[hand][:3,:3]=original[hand][:3,:3]
    for k,b in self.rig.items():
     parent=b['parentSemantic']
     if parent and k not in self.changed and k!=hand and k.startswith(side)and any(x in k for x in ['Thumb','Index','Middle','Ring','Little']):
      m=np.eye(4);m[:3,:3]=rots[k]*b['localScale'];m[:3,3]=b['localPosition'];world[k]=world[parent]@m
  return world
 def skin(self,world):
  out=[]
  for m in self.meshes:
   raw=np.array([world[self.C[k][0]]@self.C[k][1]for k in m['boneNames']]);bm=raw@m['ib'];blend=(bm[m['ix']]*m['w'][:,:,None,None]).sum(axis=1);v=np.einsum('nij,nj->ni',blend,m['bp'])@m['post'].T;out.append(v[:,:3])
  return out
 changed=['leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm']
if __name__=='__main__':
 report={}
 for body in ['female','male']:
  a=Actor(body);out=[]
  for sample in a.samples:
   i=round(sample['time']*30);world=a.fk(i);sk=a.skin(world);shift=mat(sample['norm']['hips'])[:3,3]-world['hips'][:3,3]
   out.append({'time':sample['time'],'rawMappingChangeMax':max(float(np.max(abs(np.linalg.inv(mat(sample['norm'][sem]))@mat(sample['bones'][k]['matrix'])-C)))for k,(sem,C)in a.C.items()),'meshes':{m['name']:float(np.max(np.linalg.norm(sk[j]+shift-np.array(sample['meshes'][j]['actual']),axis=1)))for j,m in enumerate(a.meshes)}})
  report[body]=out
 (P/'skin-replay-check.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2))
