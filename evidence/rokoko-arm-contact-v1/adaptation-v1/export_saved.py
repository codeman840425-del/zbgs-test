"""Rebuild frozen sole result from saved fitted offsets; never rerun optimizer."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1'
import pathlib,json,gzip,hashlib,argparse
import numpy as np
from scipy.spatial.transform import Rotation
from skin_model import Actor,P

def smooth(t,c):
 u=abs(t-c)/.75
 return 0. if u>=1 else 1-(10*u**3-15*u**4+6*u**5)
args=argparse.ArgumentParser();args.add_argument('--out',required=True,type=pathlib.Path);output=args.parse_args().out
output.mkdir(parents=True,exist_ok=False)
report=json.loads((P/'fit-report.json').read_text())
for body in ['female','male']:
 solutions=report['bodies'][body]['solutions']
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
 raw=gzip.decompress((P/f'source-{body}.motion.json.gz').read_bytes()).decode('utf8');decoder=json.JSONDecoder();trackstart=raw.index('"tracks"');cursor=raw.index('[',trackstart)+1;repl=[];unchanged=[]
 while True:
  while raw[cursor].isspace()or raw[cursor]==',':cursor+=1
  if raw[cursor]==']':break
  obj,end=decoder.raw_decode(raw,cursor);name=obj['name'];blob=raw[cursor:end]
  if name.split('.')[0]in changed and name.endswith('.quaternion'):
   vp=blob.index('"values"');left=blob.index('[',vp);_,right=decoder.raw_decode(blob,left);replacement=json.dumps(tracks[name]['values'],separators=(',',':'));repl.append((cursor+left,cursor+right,replacement))
  else:unchanged.append({'name':name,'sha256':hashlib.sha256(blob.encode()).hexdigest()})
  cursor=end
 for lo,hi,text in reversed(repl):raw=raw[:lo]+text+raw[hi:]
 dest=output/f'rokoko-5359146-{body}-arm-local-v1.motion.json';dest.write_bytes(raw.encode());assert hashlib.sha256(dest.read_bytes()).hexdigest()==report['bodies'][body]['motionSha256'];parsed=json.loads(raw);checks=[]
 for before,after in zip(a.clip['clip']['tracks'],parsed['clip']['tracks']):
  assert before['times']==after['times'];name=before['name'];vb=np.array(before['values']);va=np.array(after['values']);isChanged=name.split('.')[0]in changed and name.endswith('.quaternion')
  if not isChanged:assert before==after
  else:
   active=np.array([any(abs(t-s['time'])<.75 for s in solutions)for t in before['times']]);assert np.array_equal(vb.reshape(-1,4)[~active],va.reshape(-1,4)[~active])
   q=va.reshape(-1,4);dq=np.degrees(2*np.arccos(np.clip(abs(np.sum(q[:-1]*q[1:],axis=1)),0,1)));old=vb.reshape(-1,4);od=np.degrees(2*np.arccos(np.clip(abs(np.sum(old[:-1]*old[1:],axis=1)),0,1)));checks.append({'track':name,'maxFrameAngleBeforeDegrees':float(od.max()),'maxFrameAngleAfterDegrees':float(dq.max())})
 print(body, 'exact hash reproduced')
