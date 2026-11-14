"""Bounded source-only greeting on the pinned CC0 UAL rig.
No runtime/public edits. Uses editable parameters, real arm lengths and source
open-hand bone rotations; exports and re-reads an independent GLB clip.
"""
import argparse,hashlib,importlib.util,json,math,pathlib
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=pathlib.Path(__file__).resolve().parents[2]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=module('source_glb','scripts/qa-m1c-source.py');packer=module('glb_pack','scripts/qa-m1c-glb-pack.py')
p=argparse.ArgumentParser();p.add_argument('--config',default='assets-source/m1c-gesture/wave-left-v1.config.json');p.add_argument('--output',default='assets-source/m1c-gesture/generated');args=p.parse_args()
cfg=json.loads((ROOT/args.config).read_text());data=(ROOT/cfg['source']).read_bytes();assert hashlib.sha256(data).hexdigest()==cfg['sourceSha256'];g=m.GLB(data);names=g.byname
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
duration=cfg['duration'];times=np.linspace(0,duration,round(duration*cfg['hz'])+1);count=len(times)
base,baseR,baseT=g.evaluate(cfg['referenceClip'],np.array([0.]));rest,restR,_=g.evaluate(None,np.array([0.]));rot=[np.repeat(q,count,axis=0)for q in baseR];trans=[np.repeat(t,count,axis=0)for t in baseT]
world=np.empty((count,len(g.nodes),4,4));identity=np.eye(4)
def update(k):
 done=set()
 def visit(i):
  if i in done:return world[k,i]
  n=g.nodes[i];local=np.eye(4);local[:3,:3]=Rotation.from_quat(rot[i][k]).as_matrix()*np.array(n.get('scale',[1,1,1]))[None,:];local[:3,3]=trans[i][k]
  if 'matrix'in n:local=np.array(n['matrix']).reshape(4,4).T
  world[k,i]=(visit(g.parents[i])if i in g.parents else identity)@local;done.add(i);return world[k,i]
 for i in range(len(g.nodes)):visit(i)
def setq(k,i,q):
 parent=Rotation.from_matrix(world[k,g.parents[i],:3,:3])if i in g.parents else Rotation.identity();rot[i][k]=(parent.inv()*q).as_quat()
def unit(v):return v/np.linalg.norm(v)
def align(a,b):
 a,b=unit(a),unit(b);dot=np.clip(a@b,-1,1)
 if dot>1-1e-10:return Rotation.identity()
 assert dot>-.99999,'Unreviewed 180 degree arm alignment'
 q=np.r_[np.cross(a,b),1+dot];return Rotation.from_quat(q/np.linalg.norm(q))
def smooth(x):x=np.clip(x,0,1);return x*x*x*(x*(x*6-15)+10)
upper,lower,hand=[names[n+'_l']for n in ['upperarm','lowerarm','hand']]
fingerNames=[f'{finger}_0{i}_l'for finger in ['index','middle','ring','pinky','thumb']for i in [1,2,3]]
mask=[upper,lower,hand]+[names[n]for n in fingerNames]
bp=lambda n:base[0,n,:3,3];rp=lambda n:rest[0,names[n],:3,3]
lengthA=np.linalg.norm(bp(lower)-bp(upper));lengthB=np.linalg.norm(bp(hand)-bp(lower))
forward=unit(rp('middle_01_l')-rp('hand_l'));across=rp('index_01_l')-rp('pinky_01_l');across=unit(across-forward*(across@forward));normal=np.cross(forward,across)
restBasis=Rotation.from_matrix(np.column_stack([forward,across,normal]));desiredBasis=Rotation.from_matrix(np.column_stack([[0,1,0],[-1,0,0],[0,0,1]]));handOrientation=desiredBasis*restBasis.inv()*Rotation.from_matrix(rest[0,hand,:3,:3])
reachExcess=[]
for k,t in enumerate(times):
 envelope=smooth(t/cfg['raiseEnd'])*(1-smooth((t-cfg['lowerStart'])/(duration-cfg['lowerStart'])))
 u=np.clip((t-cfg['raiseEnd'])/(cfg['lowerStart']-cfg['raiseEnd']),0,1)
 wave=math.sin(2*math.pi*cfg['waveCycles']*u)*math.sin(math.pi*u)**2
 target=bp(upper)+np.array(cfg['wristFromShoulderMeters']);target[0]+=cfg['forearmSwayMeters']*wave
 vector=target-bp(upper);wanted=np.linalg.norm(vector);reachExcess.append(max(0,wanted-lengthA-lengthB));d=np.clip(wanted,abs(lengthA-lengthB)+1e-6,lengthA+lengthB-1e-6);direction=unit(vector)
 pole=np.array(cfg['elbowPoleWorld']);pole=unit(pole-direction*(pole@direction));along=(lengthA**2-lengthB**2+d*d)/(2*d);height=math.sqrt(max(0,lengthA**2-along**2));elbow=bp(upper)+direction*along+pole*height
 update(k);setq(k,upper,align(bp(lower)-bp(upper),elbow-bp(upper))*Rotation.from_matrix(base[0,upper,:3,:3]));update(k)
 setq(k,lower,align(bp(hand)-bp(lower),target-elbow)*Rotation.from_matrix(base[0,lower,:3,:3]));update(k)
 setq(k,hand,Rotation.from_rotvec([0,0,np.deg2rad(cfg['wristWaveDegrees'])*wave])*handOrientation)
 for name in fingerNames:rot[names[name]][k]=restR[names[name]][0]
 for i in mask:rot[i][k]=m.quat_interp(baseR[i],rot[i][k:k+1],np.array([envelope]))[0]
 update(k)
for a in rot:a[-1]=a[0]
clip='Greeting_Wave_Left_Once_v1';blob=packer.pack(g,baked={'name':clip,'times':times,'rotations':rot,'translations':trans});asset=out/'greeting-wave-left-v1.glb';asset.write_bytes(blob)
exported=m.GLB(blob);checkTimes=np.linspace(0,duration,round(duration*240)+1);ew,er,et=exported.evaluate(clip,checkTimes)
changed=[]
for i in range(len(g.nodes)):
 q=er[i];angle=2*np.arccos(np.clip(abs(q@q[0]),0,1))
 if angle.max()>1e-5:changed.append(g.nodes[i]['name'])
static=['root','pelvis','thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r','upperarm_r','lowerarm_r','hand_r']
errors={name:float(np.linalg.norm(ew[:,names[name],:3,3]-ew[0,names[name],:3,3],axis=1).max())for name in static}
handPath=ew[:,hand,:3,3];fwd=ew[:,names['middle_01_l'],:3,3]-handPath;fwd/=np.linalg.norm(fwd,axis=1,keepdims=True);across=ew[:,names['index_01_l'],:3,3]-ew[:,names['pinky_01_l'],:3,3];across-=fwd*np.sum(across*fwd,axis=1,keepdims=True);across/=np.linalg.norm(across,axis=1,keepdims=True);palm=np.cross(fwd,across);hold=(checkTimes>=cfg['raiseEnd'])&(checkTimes<=cfg['lowerStart'])
assert set(changed)<=set(g.nodes[i]['name']for i in mask)
report={'kind':'source numeric candidate; not runtime/visual acceptance','config':cfg,'glbSha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'sourceNodeCount':len(g.nodes),'animationChannelCount':len(exported.animation(clip)['channels']),'actuallyChangingRotationNodes':changed,'maxReachExcessMeters':max(reachExcess),'staticWorldOriginMaximumDisplacementMeters':errors,'handOriginRangeXYZ':np.ptp(handPath,axis=0).tolist(),'raisedPalmForwardZMinimum':float(palm[hold,2].min()),'raisedFingerUpYMinimum':float(fwd[hold,1].min()),'maximumWristFrameStep240Hz':float(np.linalg.norm(np.diff(handPath,axis=0),axis=1).max()),'endStartWristDistance':float(np.linalg.norm(handPath[-1]-handPath[0])),'limits':['Source mannequin only; real female/male target hands, clothing and face clearance require runtime validation','Left-hand empty only; right-hand microphone combination not yet approved','Only designated left arm and finger rotations should layer over locomotion/talking; do not play all constant source tracks over the body controller']}
assert max(errors.values())<1e-7 and report['maxReachExcessMeters']==0 and report['raisedPalmForwardZMinimum']>.9 and report['endStartWristDistance']<1e-7
(out/'source-qa.json').write_text(json.dumps(report,indent=2)+'\n');np.savez_compressed(out/'trajectory.npz',time=checkTimes,world=ew,palmNormal=palm)
semantics=['leftUpperArm','leftLowerArm','leftHand']+[f'left{f}{segment}'for f in ['Index','Middle','Ring','Little']for segment in ['Proximal','Intermediate','Distal']]+['leftThumbMetacarpal','leftThumbProximal','leftThumbDistal']
profile={'schema':'zbgs-gesture-import-candidate-v1','id':cfg['id'],'file':asset.name,'sha256':report['glbSha256'],'bytes':len(blob),'clip':clip,'duration':duration,'playback':'once-then-underlying-authored-pose','sourceRig':'UAL1 semantic mapping already present; runtime adapter not yet implemented','sourceSha256':cfg['sourceSha256'],'license':'CC0 source; new project authored pose sequence','rootPolicy':'none','layerMask':semantics,'sourceRotationNodes':[g.nodes[i]['name']for i in mask],'excluded':['root translation/rotation','hips','legs','spine/chest','right arm and fingers','face expressions'],'requiredEmptyHands':['left'],'rightHandMicrophone':'unverified combination; preserve mic layer ownership and test before enabling','interruptPolicySuggestion':'Crossfade to current underlying authored pose over 0.2s; repeated same request must not restart unless explicitly requested','status':'source-only; no served asset or game integration'}
(out/'gesture-import.json').write_text(json.dumps(profile,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['glbSha256','bytes','actuallyChangingRotationNodes','maxReachExcessMeters','raisedPalmForwardZMinimum','raisedFingerUpYMinimum','maximumWristFrameStep240Hz']},indent=2))
