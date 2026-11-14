"""Bake one bounded, original technical choreography on the CC0 UAL1 rig.

Not professional dance/mocap. No combat clip is relabeled or included.
"""
import argparse,hashlib,importlib.util,json,math,pathlib
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=pathlib.Path(__file__).resolve().parent.parent
def module(file,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
m=module('qa-m1c-source.py','source');packer=module('qa-m1c-glb-pack.py','packer')
p=argparse.ArgumentParser();p.add_argument('--config',default='prototype/public/assets/motion/m1c/dance-technical-v1.config.json');p.add_argument('--output',default='prototype/public/assets/motion/m1c');args=p.parse_args()
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
cfg={'schema':1,'duration':7.2,'hz':120,'referenceClip':'Idle_Loop','sourceSha256':'69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997','source':'prototype/public/assets/motion/UAL1_Standard.glb','crossHipDrop':.035,'crossFootX':.19,'crossFootForward':.19,'crossStepLift':.13,'hopHeight':.08,'hopFlight':[5.85,6.13],'upperArmRaiseDeg':136,'sideBendDeg':11,'bodyTwistDeg':25,'intent':'Original technical choreography, not professional dance; UAL1 rig and idle pose reference'}
configPath=ROOT/args.config
if configPath.exists():cfg=json.loads(configPath.read_text())
else:configPath.parent.mkdir(parents=True,exist_ok=True);configPath.write_text(json.dumps(cfg,indent=2))
source=(ROOT/cfg['source']).read_bytes();sha=hashlib.sha256(source).hexdigest();assert sha==cfg['sourceSha256'];g=m.GLB(source);name=g.byname
duration=cfg['duration'];n=round(duration*cfg['hz']);times=np.linspace(0,duration,n+1);base,baseR,baseT=g.evaluate(cfg['referenceClip'],np.array([0.]));rest,_,_=g.evaluate(None,np.array([0.]));rot=[np.repeat(q,n+1,axis=0)for q in baseR];trans=[np.repeat(t,n+1,axis=0)for t in baseT];world=np.empty((len(times),len(g.nodes),4,4));surface=g.foot_surfaces();sourceMesh={side:g.skin(base,surface[side])[0]for side in ['l','r']};identity=np.eye(4);reach=[];contactFlags={side:np.ones(n+1,dtype=bool)for side in ['l','r']};targetFeet={side:np.zeros((n+1,3))for side in ['l','r']}
def s(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def ramp(t,a,b):return s((t-a)/(b-a))
def curve(t,knots):
    for (a,x),(b,y)in zip(knots[:-1],knots[1:]):
        if t<=b:return x+(y-x)*ramp(t,a,b)
    return knots[-1][1]
def update(k):
    done=set()
    def visit(i):
        if i in done:return world[k,i]
        local=np.eye(4);local[:3,:3]=Rotation.from_quat(rot[i][k]).as_matrix()*np.array(g.nodes[i].get('scale',[1,1,1]))[None,:];local[:3,3]=trans[i][k]
        if'matrix'in g.nodes[i]:local=np.array(g.nodes[i]['matrix']).reshape(4,4).T
        world[k,i]=(visit(g.parents[i])if i in g.parents else identity)@local;done.add(i);return world[k,i]
    for i in range(len(g.nodes)):visit(i)
def setq(k,i,q):
    parent=Rotation.from_matrix(world[k,g.parents[i],:3,:3])if i in g.parents else Rotation.identity();rot[i][k]=(parent.inv()*q).as_quat()
def align(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);dot=np.clip(a@b,-1,1)
    if dot>1-1e-12:return Rotation.identity()
    axis=np.cross(a,b)
    if dot<-1+1e-8:axis=np.cross(a,[1,0,0]);axis=axis if np.linalg.norm(axis)>.1 else np.cross(a,[0,1,0]);return Rotation.from_rotvec(axis/np.linalg.norm(axis)*np.pi)
    return Rotation.from_quat(np.r_[axis,1+dot]/np.linalg.norm(np.r_[axis,1+dot]))
baseHip=base[0,name['pelvis'],:3,3];baseFoot={side:base[0,name['foot_'+side],:3,3].copy()for side in ['l','r']};floor={side:float(sourceMesh[side][:,1].min())for side in ['l','r']}
for side in baseFoot:
    baseFoot[side][1]-=floor[side]
    # UAL1 Idle's initial feet are staggered; authored neutral stance is an
    # explicit derivative, using source bind-pose ankle X/Z and real sole Y.
    baseFoot[side][[0,2]]=rest[0,name['foot_'+side],:3,3][[0,2]]
legLength={side:[np.linalg.norm(base[0,name[b],:3,3]-base[0,name[a],:3,3])for a,b in [('thigh_'+side,'calf_'+side),('calf_'+side,'foot_'+side)]]for side in ['l','r']}
for k,t in enumerate(times):
    update(k);hip=baseHip.copy();arm=curve(t,[(0,0),(.6,0),(1.3,1),(2.2,1),(2.8,.42),(4.2,.42),(4.8,.62),(5.4,.3),(5.9,.7),(6.4,.35),(7.0,0),(7.2,0)])
    lean=np.deg2rad(cfg['sideBendDeg'])*math.sin(2*np.pi*(t-.8)/1.6)*(ramp(t,.7,1.)*(1-ramp(t,2.1,2.5)))
    twist=np.deg2rad(cfg['bodyTwistDeg'])*math.sin(2*np.pi*(t-4.1)/1.3)*(ramp(t,4.1,4.3)*(1-ramp(t,5.1,5.4)))
    hip[0]+=curve(t,[(0,0),(2.2,0),(2.7,.06),(3.2,.06),(3.8,0),(7.2,0)])+.015*math.sin(2*np.pi*t/1.6)*ramp(t,.7,1.)*(1-ramp(t,2.1,2.5))
    hip[1]+=curve(t,[(0,0),(5.4,0),(5.7,-.055),(5.85,0),(6.13,0),(6.26,-.045),(6.55,0),(7.2,0)])
    hip[1]-=cfg.get('crossHipDrop',.035)*curve(t,[(0,0),(2.3,0),(2.9,1),(3.3,1),(3.9,0),(7.2,0)])
    takeoff,landing=cfg['hopFlight'];inFlight=takeoff<t<landing
    hop=4*cfg['hopHeight']*((t-takeoff)/(landing-takeoff))*(1-(t-takeoff)/(landing-takeoff))if inFlight else 0
    hip[1]+=hop
    trans[name['pelvis']][k]=(np.linalg.inv(world[k,g.parents[name['pelvis']]])@np.r_[hip,1])[:3];update(k)
    pelvisQ=Rotation.from_rotvec([0,twist*.3,lean*.2])*Rotation.from_matrix(base[0,name['pelvis'],:3,:3]);setq(k,name['pelvis'],pelvisQ);update(k)
    # Bending only the top chest rotates the arms but barely bends the torso.
    # The lumbar chain owns the actual side bend; upper chest follows it.
    lumbarQ=Rotation.from_rotvec([0,twist*.5,lean*1.35])*Rotation.from_matrix(base[0,name['spine_01'],:3,:3]);setq(k,name['spine_01'],lumbarQ);update(k)
    chestQ=Rotation.from_rotvec([0,twist,lean*1.35])*Rotation.from_matrix(base[0,name['spine_03'],:3,:3]);setq(k,name['spine_03'],chestQ);update(k)
    for side in ['l','r']:
        target=baseFoot[side].copy();target[1]+=hop;moving=False
        if side=='r':
            cross=baseFoot[side].copy();cross[0]=cfg['crossFootX'];cross[2]+=cfg['crossFootForward']
            if 2.4<t<3.0:
                u=(t-2.4)/.6;target=(1-s(u))*baseFoot[side]+s(u)*cross;target[1]+=cfg['crossStepLift']*math.sin(np.pi*u)**2;moving=True
            elif 3.0<=t<=3.3:target=cross.copy()
            elif 3.3<t<3.9:
                u=(t-3.3)/.6;target=(1-s(u))*cross+s(u)*baseFoot[side];target[1]+=cfg['crossStepLift']*math.sin(np.pi*u)**2;moving=True
        contactFlags[side][k]=not(inFlight or moving);targetFeet[side][k]=target
        upper,lower,foot=[name[b+'_'+side]for b in ['thigh','calf','foot']];a,b=legLength[side];h=world[k,upper,:3,3].copy();vec=target-h;distance=np.linalg.norm(vec);reach.append(max(0,float(distance-a-b)));dist=np.clip(distance,abs(a-b)+1e-6,(a+b)*.99995);direction=vec/distance
        originalUpper=world[k,upper].copy();originalLower=world[k,lower].copy();originalFoot=world[k,foot].copy()
        # A continuous anatomical pole avoids hemisphere switches while the
        # crossing ankle passes the standing leg; foot crossover is retained.
        pole=np.array([.05 if side=='l'else-.05,0,1.]);pole-=direction*(pole@direction)
        pole/=np.linalg.norm(pole);along=(a*a+dist*dist-b*b)/(2*dist);height=np.sqrt(max(0,a*a-along*along));knee=h+direction*along+pole*height
        setq(k,upper,align(originalLower[:3,3]-h,knee-h)*Rotation.from_matrix(originalUpper[:3,:3]));update(k)
        setq(k,lower,align(originalFoot[:3,3]-originalLower[:3,3],target-knee)*Rotation.from_matrix(originalLower[:3,:3]));update(k)
        setq(k,foot,Rotation.from_matrix(base[0,foot,:3,:3]));update(k);setq(k,name['ball_'+side],Rotation.from_matrix(base[0,name['ball_'+side],:3,:3]));update(k)
    torsoRotation=Rotation.from_rotvec([0,twist,lean*1.35])
    for side,sign in [('l',1),('r',-1)]:
        upper,lower,hand=[name[b+'_'+side]for b in ['upperarm','lowerarm','hand']];origUpper=world[k,upper].copy();origLower=world[k,lower].copy();origHand=world[k,hand].copy();neutralUpper=base[0,lower,:3,3]-base[0,upper,:3,3];neutralUpper/=np.linalg.norm(neutralUpper);neutralLower=base[0,hand,:3,3]-base[0,lower,:3,3];neutralLower/=np.linalg.norm(neutralLower)
        angle=np.deg2rad(cfg['upperArmRaiseDeg']);elevatedUpper=np.array([sign*.95*np.sin(angle),-np.cos(angle),np.sqrt(1-.95**2)*np.sin(angle)]);elevatedLower=np.array([-sign*.33,.78,.32]);elevatedLower/=np.linalg.norm(elevatedLower)
        u=(1-arm)*neutralUpper+arm*elevatedUpper;u=torsoRotation.apply(u/np.linalg.norm(u));v=(1-arm)*neutralLower+arm*elevatedLower;v=torsoRotation.apply(v/np.linalg.norm(v))
        setq(k,upper,align(origLower[:3,3]-origUpper[:3,3],u)*Rotation.from_matrix(origUpper[:3,:3]));update(k)
        setq(k,lower,align(origHand[:3,3]-origLower[:3,3],v)*Rotation.from_matrix(origLower[:3,:3]));update(k)
# Exact generated first pose repeated at end; runtime crossfades to its own idle.
for values in rot+trans:values[-1]=values[0]
clip='Dance_Technical_7s_Once_v1';blob=packer.pack(g,baked={'name':clip,'times':times,'rotations':rot,'translations':trans});asset=out/'dance-technical-v1.glb';asset.write_bytes(blob);reference=packer.pack(g,animations=[g.animation('Dance_Loop')]);(out/'dance-source-reference.glb').write_bytes(reference)
exported=m.GLB(blob);checkTimes=np.linspace(0,duration,round(duration*240)+1);ew,_,_=exported.evaluate(clip,checkTimes);report={'config':cfg,'assetSha256':hashlib.sha256(blob).hexdigest(),'maxIKReachExcess':max(reach),'feet':{},'status':'source-numeric-candidate-not-visual-pass'}
def is_contact(t,side):return not(cfg['hopFlight'][0]<t<cfg['hopFlight'][1]or(side=='r'and(2.4<t<3.0 or 3.3<t<3.9)))
for side in ['l','r']:
    points=exported.skin(ew,exported.foot_surfaces()[side]);low=points[:,:,1].min(axis=1);contact=np.array([is_contact(t,side)for t in checkTimes]);ids=points[1:,:,1].argmin(axis=1);ix=np.arange(len(ids));v=(points[1:][ix,ids]-points[:-1][ix,ids])/(checkTimes[1]-checkTimes[0]);mask=contact[:-1]&contact[1:];speed=np.linalg.norm(v[:,[0,2]],axis=1);ankle=ew[:,name['foot_'+side],:3,3]
    report['feet'][side]={'actualSoleYRange':[float(low.min()),float(low.max())],'contactSoleYRange':[float(low[contact].min()),float(low[contact].max())],'contactMaterialSpeedP95':float(np.quantile(speed[mask],.95)),'contactMaterialSpeedMax':float(speed[mask].max()),'contactMaterialIntegratedTravel':float(speed[mask].sum()*(checkTimes[1]-checkTimes[0])),'maxAnkleStep240Hz':float(np.linalg.norm(np.diff(ankle,axis=0),axis=1).max()),'endVsStartAnkle':float(np.linalg.norm(ankle[-1]-ankle[0]))}
report['minimumWorldLeftMinusRightFootX']=float((ew[:,name['foot_l'],0,3]-ew[:,name['foot_r'],0,3]).min());report['maxPelvisStep240Hz']=float(np.linalg.norm(np.diff(ew[:,name['pelvis'],:3,3],axis=0),axis=1).max())
report['checks']={'reachable':max(reach)<.002,'soleNotBelowMinus2mm':all(v['actualSoleYRange'][0]>=-.002 for v in report['feet'].values()),'contactSoleWithin2mm':all(max(abs(x)for x in v['contactSoleYRange'])<.002 for v in report['feet'].values()),'contactMaterialMaxBelow3cmPerSecond':all(v['contactMaterialSpeedMax']<.03 for v in report['feet'].values()),'ankleStepBelow2cmAt240Hz':all(v['maxAnkleStep240Hz']<.02 for v in report['feet'].values()),'actualWorldCrossover':report['minimumWorldLeftMinusRightFootX']<0}
profile={'schema':'m1.motion-import-list.1','sourceSha256':sha,'license':'CC0-1.0 source; project technical choreography derivative','entries':[{'id':'ual1-dance-reference','file':'dance-source-reference.glb','sha256':hashlib.sha256(reference).hexdigest(),'clip':'Dance_Loop','duration':g.duration('Dance_Loop'),'playback':'loop','origin':'Unmodified Quaternius Dance_Loop reference','rootTranslationOwner':'clip hips only; no path locomotion','space':'local stationary','heldPropsAllowed':False},{'id':'dance-technical-once-v1','file':asset.name,'sha256':report['assetSha256'],'clip':clip,'duration':duration,'playback':'once-then-idle','origin':'Original technical choreography, UAL1 idle reference/rig; not professional dance or mocap','rootTranslationOwner':'clip hips local weight-shift/jump; no path locomotion','space':'local footprint, no root-group displacement','heldPropsAllowed':False,'segments':[{'time':[.6,2.4],'intent':'raised arms, elbow bend, side bend'},{'time':[2.4,3.9],'intent':'right foot crosses in front of left then returns'},{'time':[4.1,5.4],'intent':'torso twist'},{'time':[5.4,6.55],'intent':'anticipate, small hop, land, absorb'},{'time':[6.55,7.2],'intent':'return to initial generated idle pose; runtime exit blend required'}],'contactWindows':{'l':[[0,5.85],[6.13,7.2]],'r':[[0,2.4],[3.0,3.3],[3.9,5.85],[6.13,7.2]]},'sourceQAOnly':True,'limits':['No live avatar/garment or visual acceptance','Prop must be stowed before full-body choreography','Crossing is intentional; no never-cross constraint','Runtime must preserve genuine jump vertical motion and release both feet during flight']}]}
for entry in profile['entries']:
    entry['rootPolicy']='local-displacement'
    entry['space']={'kind':'local-footprint','radiusSourceM':.9,'scaleBy':'target/sourceRestHipRatio','includes':'source body reservation; target clothes/hair need live envelope validation','navigationAllowedDuringPlayback':False}
(out/'dance-technical-v1.config.json').write_text(json.dumps(cfg,indent=2));(out/'dance-imports.json').write_text(json.dumps(profile,indent=2));evidence=(ROOT/'output/playwright/m1c-source/dance-technical')if out==(ROOT/'prototype/public/assets/motion/m1c')else out/'qa';evidence.mkdir(parents=True,exist_ok=True);(evidence/'source-qa.json').write_text(json.dumps(report,indent=2));np.savez_compressed(evidence/'trajectories.npz',times=checkTimes,world=ew)
samples=[]
for t in [0,1.3,2.,2.7,3.15,3.6,4.8,5.7,5.98,6.3,7.2]:
    sw,_,_=exported.evaluate(clip,np.array([t]));samples.append({'clip':clip,'phase':t/duration,'time':t,'joints':{b:sw[0,name[b],:3,3].tolist()for b in ['pelvis','hand_l','hand_r','foot_l','foot_r']},'footMinY':{side:float(exported.skin(sw,exported.foot_surfaces()[side])[:,:,1].min())for side in ['l','r']}})
(evidence/'source-analysis.json').write_text(json.dumps({'crosscheckSamples':samples},indent=2));print(json.dumps(report,indent=2))
if not all(report['checks'].values()):raise RuntimeError('Technical choreography source checks failed; do not mark accepted')
