"""One bounded offline arm adaptation. No runtime/leg/root edits or parameter scan.
Representative geometry solves; smooth compact windows; exact source wrist world orientation.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1'
import json,pathlib,gzip,hashlib,time
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from scipy.optimize import least_squares
from skin_model import Actor,P,bundle

def closest(points,tris):
 # Exact closest point on each supplied finite triangle; caller supplies bounded-nearest set.
 a,b,c=tris[:,0],tris[:,1],tris[:,2];v0=b-a;v1=c-a;v2=points-a
 d00=(v0*v0).sum(1);d01=(v0*v1).sum(1);d11=(v1*v1).sum(1);d20=(v2*v0).sum(1);d21=(v2*v1).sum(1);den=d00*d11-d01*d01
 u=(d11*d20-d01*d21)/np.maximum(den,1e-24);v=(d00*d21-d01*d20)/np.maximum(den,1e-24);proj=a+u[:,None]*v0+v[:,None]*v1
 choices=[proj];valid=(u>=0)&(v>=0)&(u+v<=1);dist=[np.where(valid,((points-proj)**2).sum(1),np.inf)]
 for x,y in [(a,b),(b,c),(c,a)]:
  e=y-x;t=np.clip(((points-x)*e).sum(1)/np.maximum((e*e).sum(1),1e-24),0,1);q=x+t[:,None]*e;choices.append(q);dist.append(((points-q)**2).sum(1))
 pick=np.argmin(np.array(dist),axis=0);return np.array(choices)[pick,np.arange(len(points))]
def point_seg(p,a,b):
 e=b-a;t=np.clip(((p-a)*e).sum(-1)/np.dot(e,e),0,1);return np.linalg.norm(p-a-t[...,None]*e,axis=-1)
def make_problem(a,index):
 base=a.fk(index);skin=a.skin(base);body=a.meshes[0];sem=[a.C[k][0]for k in body['boneNames']]
 def weights(m,terms):
  yes=np.array([any(t==a.C[k][0]or (t.endswith('*')and a.C[k][0].startswith(t[:-1]))for t in terms)for k in m['boneNames']]);return (yes[m['ix']]*m['w']).sum(1)
 armids=[]
 for side in ['left','right']:
  aw=weights(body,[side+'LowerArm',side+'Hand',side+'Thumb*',side+'Index*',side+'Middle*',side+'Ring*',side+'Little*']);ids=np.flatnonzero(aw>.85);armids.append(ids[::max(1,len(ids)//120)])
 allids=np.unique(np.concatenate(armids));tri=[]
 for mi,m in enumerate(a.meshes):
  tw=weights(m,['hips','spine','chest','upperChest','neck']);f=m['faces'];selected=f[np.min(tw[f],axis=1)>.80];tri.extend(skin[mi][selected])
 tri=np.array(tri);norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-20);tree=cKDTree(tri.mean(axis=1))
 def signed(p):
  _,ids=tree.query(p,k=16);ts=tri[ids].reshape(-1,3,3);ps=np.repeat(p,16,axis=0);q=closest(ps,ts).reshape(len(p),16,3);ds=np.sum((p[:,None]-q)**2,axis=2);j=ds.argmin(axis=1);qq=q[np.arange(len(p)),j];n=norm[ids[np.arange(len(p)),j]];return np.sum((p-qq)*n,axis=1)
 radii={}
 for side in ['left','right']:
  aw=weights(body,[side+'LowerArm']);ids=np.flatnonzero(aw>.9);r=point_seg(skin[0][ids],base[side+'LowerArm'][:3,3],base[side+'Hand'][:3,3]);radii[side]=float(np.quantile(r,.9))
 required=radii['left']+radii['right']
 def metrics(x):
  w=a.fk(index,x);ss=a.skin(w);sd=signed(ss[0][allids]);l0,l1=w['leftLowerArm'][:3,3],w['leftHand'][:3,3];r0,r1=w['rightLowerArm'][:3,3],w['rightHand'][:3,3];ts=np.linspace(0,1,13)[:,None];sep=np.r_[point_seg(l0+(l1-l0)*ts,r0,r1),point_seg(r0+(r1-r0)*ts,l0,l1)];return w,ss,sd,sep
 def fun(x):
  w,ss,sd,sep=metrics(x)
  # 1mm clothing clearance is an author target, not new blanket acceptance gate.
  surf=np.maximum(.001-sd,0);pair=np.maximum(required-sep,0)
  wrist=np.concatenate([w[s+'Hand'][:3,3]-base[s+'Hand'][:3,3]for s in ['left','right']])
  return np.r_[surf,pair,x*.006,wrist*.1]
 return fun,metrics,{'sampleVertices':len(allids),'torsoTriangles':len(tri),'forearmRadiusM':radii,'centerlineTargetM':required,'nearestTriangleCandidates':16,'targetClearanceM':.001}
def smooth(t,c):
 # 1.5s compact support, full correction at representative instant; zero velocity/acceleration at bounds.
 u=abs(t-c)/.75
 return 0. if u>=1 else 1-(10*u**3-15*u**4+6*u**5)
def stat(metrics,x):
 w,ss,sd,sep=metrics(x);return {'proxyMaxInsideM':float(max(0,-sd.min())),'proxyInsideSamples':int((sd<0).sum()),'forearmSampleCenterlineMinM':float(sep.min()),'maxLocalRotationDegrees':float(np.max(np.linalg.norm(x.reshape(-1,3),axis=1))*180/np.pi)}
report={'scope':'Bounded isolated two-window candidate. Target-skin finite nearest16 torso approximation and measured forearm capsules guide only; requires actual final skin/visual checks. No full30 acceptance.','settings':{'times':[3,23],'windowHalfWidthS':.75,'boundsEachRotvecComponentDegrees':35,'maxNfev':50,'noParameterSweep':True},'bodies':{}}
for body in ['female','male']:
 start=time.monotonic();solutions=[]
 for t in [3,23]:
  a=Actor(body,t);i=round(t*30);fn,metrics,spec=make_problem(a,i);x0=np.zeros(12);fit=least_squares(fn,x0,bounds=(-np.deg2rad(35),np.deg2rad(35)),max_nfev=50,ftol=1e-8,xtol=1e-8,gtol=1e-8,diff_step=1e-4)
  solutions.append({'time':t,'rotationVectorOffsets':fit.x.tolist(),'success':bool(fit.success),'status':int(fit.status),'nfev':fit.nfev,'before':stat(metrics,x0),'after':stat(metrics,fit.x),'spec':spec});print(body,t,solutions[-1]['before'],solutions[-1]['after'],flush=True)
 a=Actor(body);clip=json.loads(json.dumps(a.clip));tracks={t['name']:t for t in clip['clip']['tracks']};arr={k:np.array(v['values']).reshape(-1,4).copy()for k,v in tracks.items()if k.endswith('.quaternion')};changed=set(a.changed+[s+'Hand'for s in ['left','right']]);maxWrist=0;firstLast=[]
 for i,t in enumerate(a.times):
  x=sum((np.array(s['rotationVectorOffsets'])*smooth(t,s['time'])for s in solutions),np.zeros(12))
  if not np.any(x):continue
  w=a.fk(i,x);orig=a.fk(i)
  for k in changed:
   parent=a.rig[k]['parentSemantic'];local=np.linalg.inv(w[parent][:3,:3])@w[k][:3,:3];q=Rotation.from_matrix(local).as_quat();old=arr[k+'.quaternion'][i];q=q if np.dot(q,old)>=0 else -q;arr[k+'.quaternion'][i]=q
  maxWrist=max(maxWrist,max(float(np.max(abs(w[s+'Hand'][:3,:3]-orig[s+'Hand'][:3,:3])))for s in ['left','right']))
 for k in changed:tracks[k+'.quaternion']['values']=arr[k+'.quaternion'].reshape(-1).tolist()
 # Replace only six values array byte spans in original exact JSON. All other bytes preserved.
 original=pathlib.Path('analysis/rokoko-portable-rebuild-v1/assets/motion/m1c')/f'rokoko-5359146-{body}-v1.motion.json';raw=original.read_text(encoding='utf8');decoder=json.JSONDecoder();trackstart=raw.index('"tracks"');cursor=raw.index('[',trackstart)+1;repl=[];unchanged=[]
 while True:
  while raw[cursor].isspace()or raw[cursor]==',':cursor+=1
  if raw[cursor]==']':break
  obj,end=decoder.raw_decode(raw,cursor);name=obj['name'];blob=raw[cursor:end]
  if name.split('.')[0]in changed and name.endswith('.quaternion'):
   vp=blob.index('"values"');left=blob.index('[',vp);_,right=decoder.raw_decode(blob,left);replacement=json.dumps(tracks[name]['values'],separators=(',',':'));repl.append((cursor+left,cursor+right,replacement))
  else:unchanged.append({'name':name,'sha256':hashlib.sha256(blob.encode()).hexdigest()})
  cursor=end
 for lo,hi,text in reversed(repl):raw=raw[:lo]+text+raw[hi:]
 dest=P/f'rokoko-5359146-{body}-arm-local-v1.motion.json';dest.write_bytes(raw.encode());parsed=json.loads(raw);checks=[]
 for before,after in zip(a.clip['clip']['tracks'],parsed['clip']['tracks']):
  assert before['times']==after['times'];name=before['name'];vb=np.array(before['values']);va=np.array(after['values']);isChanged=name.split('.')[0]in changed and name.endswith('.quaternion')
  if not isChanged:assert before==after
  else:
   active=np.array([any(abs(t-s['time'])<.75 for s in solutions)for t in before['times']]);assert np.array_equal(vb.reshape(-1,4)[~active],va.reshape(-1,4)[~active])
   q=va.reshape(-1,4);dq=np.degrees(2*np.arccos(np.clip(abs(np.sum(q[:-1]*q[1:],axis=1)),0,1)));old=vb.reshape(-1,4);od=np.degrees(2*np.arccos(np.clip(abs(np.sum(old[:-1]*old[1:],axis=1)),0,1)));checks.append({'track':name,'maxFrameAngleBeforeDegrees':float(od.max()),'maxFrameAngleAfterDegrees':float(dq.max())})
 report['bodies'][body]={'solutions':solutions,'elapsedS':time.monotonic()-start,'motionSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sourceMotionSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'avatarSha256':a.clip['avatarSha256'],'unchangedRawTrackHashes':unchanged,'wristWorldRotationMaxMatrixError':maxWrist,'trackChecks':checks};(P/'fit-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('done',flush=True)
