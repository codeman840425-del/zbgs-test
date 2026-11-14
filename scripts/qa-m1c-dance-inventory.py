"""Bounded existing-source movement coverage; never labels combat clips dances."""
import hashlib, importlib.util, json, math, pathlib, zipfile
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
z=zipfile.ZipFile(ROOT/'analysis/assets/UAL2-Standard.zip');member='Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb';data=z.read(member);g2=m.GLB(data);g1=m.GLB((ROOT/'analysis/assets/UAL1_Standard.glb').read_bytes());out=ROOT/'output/playwright/m1c-source/dance';out.mkdir(parents=True,exist_ok=True)
report={'status':'source-capability-inventory-only','source2Sha256':hashlib.sha256(data).hexdigest(),'source2Member':member,'source2License':'Quaternius CC0-1.0, official ZIP License.txt','source2AllClips':[a['name']for a in g2.j['animations']],'sameRestSkeletonAsUAL1':g2.nodes==g1.nodes,'clips':{},'limits':['No gameplay or visual acceptance','Static and geometric measurements do not prove dance quality','OverhandThrow/combat/jump labels remain original; these are not finished dance choreographies','Jump_Start/Loop/Land names do not establish a continuous grounded sequence']}
groups=[(g1,['Dance_Loop','Jump_Start','Jump_Land']),(g2,['OverhandThrow','Sword_Regular_Combo','NinjaJump_Start','NinjaJump_Land'])]
derivedPath=ROOT/'prototype/public/assets/motion/m1c/dance-technical-v1.glb'
if derivedPath.exists():
    derivedData=derivedPath.read_bytes();derived=m.GLB(derivedData);groups.append((derived,['Dance_Technical_7s_Once_v1']));report['derivedAssetSha256']=hashlib.sha256(derivedData).hexdigest()
for g,names in groups:
 for clip in names:
  d=g.duration(clip);n=math.ceil(d*120);w,_,_=g.evaluate(clip,np.linspace(0,d,n+1));p=lambda b:w[:,g.byname[b],:3,3]
  lateral=p('thigh_l')-p('thigh_r');lateral/=np.linalg.norm(lateral,axis=1)[:,None];shoulder=p('upperarm_l')-p('upperarm_r');shoulder[:,1]=0;shoulder/=np.linalg.norm(shoulder,axis=1)[:,None];torso=p('neck_01')-p('pelvis');sidebend=np.degrees(np.arctan2(np.sum(torso*lateral,axis=1),torso[:,1]));yaw=np.unwrap(np.arctan2(-lateral[:,2],lateral[:,0]));twist=np.degrees(np.arctan2(np.cross(lateral,shoulder)[:,1],np.sum(lateral*shoulder,axis=1)));span=np.sum((p('foot_l')-p('foot_r'))*lateral,axis=1);sur=g.foot_surfaces();height={s:g.skin(w,v)[:,:,1].min(axis=1)for s,v in sur.items()};arms={}
  for side in ['l','r']:
   upper=p('lowerarm_'+side)-p('upperarm_'+side);lower=p('hand_'+side)-p('lowerarm_'+side);upper/=np.linalg.norm(upper,axis=1)[:,None];lower/=np.linalg.norm(lower,axis=1)[:,None];raiseAngle=np.degrees(np.arccos(np.clip(-upper[:,1],-1,1)));flex=np.degrees(np.arccos(np.clip((upper*lower).sum(axis=1),-1,1)));arms[side]={'upperArmRaiseFromDownRangeDeg':[raiseAngle.min(),raiseAngle.max()],'elbowFlexionRangeDeg':[flex.min(),flex.max()]}
  report['clips'][clip]={'library':'UAL1'if g is g1 else'UAL2'if g is g2 else'project-derived','duration':d,'hipRange':np.ptp(p('pelvis'),axis=0),'sideBendRangeDeg':[sidebend.min(),sidebend.max()],'pelvisYawRangeDeg':np.degrees(np.ptp(yaw)),'shoulderRelativeTwistRangeDeg':[twist.min(),twist.max()],'signedFootSpanMin':span.min(),'worldXFootSpanMin':float((p('foot_l')[:,0]-p('foot_r')[:,0]).min()),'arms':arms,'doubleAir20mm':m.intervals((height['l'][:-1]>.02)&(height['r'][:-1]>.02),d),'soleYRange':{s:[v.min(),v.max()]for s,v in height.items()},'firstLastSoleY':{s:[v[0],v[-1]]for s,v in height.items()},'loopSeam':{b:float(np.linalg.norm(p(b)[0]-p(b)[-1]))for b in ['pelvis','hand_l','hand_r','foot_l','foot_r']}}
def enc(v):
 if isinstance(v,np.ndarray):return v.tolist()
 if isinstance(v,np.generic):return v.item()
 raise TypeError(type(v))
(out/'coverage.json').write_text(json.dumps(report,default=enc,indent=2));print(json.dumps(report,default=enc,indent=2))
