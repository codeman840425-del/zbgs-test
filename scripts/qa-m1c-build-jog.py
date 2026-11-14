"""Bake a CC0 UAL1-derived short-stride jog candidate. No game source edits.

This is a newly authored lower-body adaptation, not untouched source animation.
The original continuous upper-body tracks remain the motion source. Contact
and stride data travel with this asset; the runtime must not guess by clip name.
"""
import argparse, copy, hashlib, importlib.util, json, math, pathlib, struct
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('m1c_source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=argparse.ArgumentParser();p.add_argument('--config',default='prototype/public/assets/motion/m1c/jog-ordinary-derived-v1.config.json');p.add_argument('--output',default='prototype/public/assets/motion/m1c');args=p.parse_args()
defaults={'version':1,'source':'prototype/public/assets/motion/UAL1_Standard.glb','sourceSha256':'69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997','sourceClip':'Jog_Fwd_Loop','clipName':'Jog_Ordinary_Derived_v1','bakeHz':120,'cycleDistance':2.4,'stanceFraction':.34,'swingHeight':.22,'pelvisMeanY':.795,'pelvisSourceVerticalScale':.25,'pelvisLateralScale':.6,'sourcePhaseOffset':.05,'landingPitchRad':.13,'pushPitchRad':.45,'upperBodySeamCorrection':'distributed quaternion endpoint correction'}
configPath=ROOT/args.config
if configPath.exists():cfg=json.loads(configPath.read_text())
else:configPath.parent.mkdir(parents=True,exist_ok=True);configPath.write_text(json.dumps(defaults,indent=2));cfg=defaults
source=(ROOT/cfg['source']).read_bytes();assert hashlib.sha256(source).hexdigest()==cfg['sourceSha256'];g=m.GLB(source);duration=g.duration(cfg['sourceClip']);n=round(duration*cfg['bakeHz']);times=np.linspace(0,duration,n+1);phases=np.arange(n+1)/n
assert 0<cfg['stanceFraction']<.5 and cfg['cycleDistance']>0
rest,restR,restT=g.evaluate(None,np.array([0.]));surfaces=g.foot_surfaces();endW,endR,_=g.evaluate(cfg['sourceClip'],np.array([0.,duration]));srcTimes=((phases+cfg['sourcePhaseOffset'])%1)*duration
originalW,rot,trans=g.evaluate(cfg['sourceClip'],srcTimes);originalRot=[q.copy()for q in rot]
# Distributed seam correction keeps this derivative loop closed instead of
# concealing the source's 4 mm hand endpoint difference at a phase wrap.
for i in range(len(rot)):
    delta=Rotation.from_quat(endR[i][0])*Rotation.from_quat(endR[i][1]).inv()
    correction=Rotation.from_rotvec((srcTimes/duration)[:,None]*delta.as_rotvec())
    rot[i]=(correction*Rotation.from_quat(rot[i])).as_quat()
name=g.byname;identity=np.eye(4);world=np.zeros((n+1,len(g.nodes),4,4));ankleTargets={};pivots={};contacts={};reachExcess=[]
def smooth(t):return t*t*(3-2*t)
def matrix(q,t,scale=None):
    a=np.eye(4);a[:3,:3]=Rotation.from_quat(q).as_matrix();a[:3,3]=t
    if scale is not None:a[:3,:3]*=np.array(scale)[None,:]
    return a
def update_frame(frame):
    done=set()
    def visit(i):
        if i in done:return world[frame,i]
        local=matrix(rot[i][frame],trans[i][frame],g.nodes[i].get('scale',[1,1,1]))
        if 'matrix'in g.nodes[i]:local=np.array(g.nodes[i]['matrix']).reshape(4,4).T
        world[frame,i]=(visit(g.parents[i])if i in g.parents else identity)@local;done.add(i);return world[frame,i]
    for i in range(len(g.nodes)):visit(i)
def set_world_q(frame,i,q):
    parent=Rotation.from_matrix(world[frame,g.parents[i],:3,:3])if i in g.parents else Rotation.identity()
    rot[i][frame]=(parent.inv()*q).as_quat()
def align(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);dot=np.clip(a@b,-1,1)
    if dot>1-1e-12:return Rotation.identity()
    if dot<-1+1e-9:
        axis=np.cross(a,[1,0,0]);axis=axis if np.linalg.norm(axis)>.1 else np.cross(a,[0,1,0]);return Rotation.from_rotvec(axis/np.linalg.norm(axis)*np.pi)
    axis=np.cross(a,b);return Rotation.from_quat(np.r_[axis,1+dot]/np.linalg.norm(np.r_[axis,1+dot]))
sourceHip=originalW[:,name['pelvis'],:3,3];sourceHipMean=float(sourceHip[:-1,1].mean());legLengths={}
for side in ['l','r']:
    mesh=g.skin(rest,surfaces[side])[0];ankle=rest[0,name['foot_'+side],:3,3];pitch=Rotation.from_rotvec([cfg['landingPitchRad'],0,0]);pitched=(pitch.apply(mesh-ankle)+ankle)
    pivot=int(np.argmin(pitched[:,1]));push=Rotation.from_rotvec([cfg['pushPitchRad'],0,0]);pushPivot=int(np.argmin(push.apply(mesh-ankle)[:,1]));deltaPoint=mesh[pushPivot]-mesh[pivot];switch=math.atan2(deltaPoint[1],deltaPoint[2]);pivots[side]={'surfaceIndex':pivot,'restPoint':mesh[pivot],'offsetFromAnkle':mesh[pivot]-ankle,'mesh':mesh,'ankle':ankle,'pushSurfaceIndex':pushPivot,'switchPitch':switch,'switchOffset':Rotation.from_rotvec([switch,0,0]).apply(deltaPoint)}
    legLengths[side]=[float(np.linalg.norm(rest[0,name[b],:3,3]-rest[0,name[a],:3,3]))for a,b in [('thigh_'+side,'calf_'+side),('calf_'+side,'foot_'+side)]]
    ankleTargets[side]=np.zeros((n+1,3));contacts[side]=np.zeros(n+1,dtype=bool)
for frame,phase in enumerate(phases):
    update_frame(frame)
    hip=sourceHip[frame].copy();hip[0]*=cfg['pelvisLateralScale'];hip[1]=cfg['pelvisMeanY']+(sourceHip[frame,1]-sourceHipMean)*cfg['pelvisSourceVerticalScale']
    parent=world[frame,g.parents[name['pelvis']]];trans[name['pelvis']][frame]=(np.linalg.inv(parent)@np.r_[hip,1])[:3];update_frame(frame)
    for side,offset in [('l',0),('r',.5)]:
        ph=(phase-offset)%1;stance=cfg['stanceFraction'];stride=cfg['cycleDistance'];pivot=pivots[side];center=pivot['restPoint'][2];front=center+stride*stance/2;rear=center-stride*stance/2;contact=ph<=stance;contacts[side][frame]=contact
        if contact:
            # Constant-speed material point relative to path-owned root.
            z=front-stride*ph;y=0.;t=ph/stance
            pitch=cfg['landingPitchRad']+(cfg['pushPitchRad']-cfg['landingPitchRad'])*smooth(np.clip((t-.65)/.35,0,1))
        else:
            t=(ph-stance)/(1-stance);h00=2*t**3-3*t*t+1;h10=t**3-2*t*t+t;h01=-2*t**3+3*t*t;h11=t**3-t*t
            z=h00*rear+h10*(-stride*(1-stance))+h01*front+h11*(-stride*(1-stance));y=cfg['swingHeight']*math.sin(np.pi*t)**2
            pitch=cfg['pushPitchRad']+(cfg['landingPitchRad']-cfg['pushPitchRad'])*smooth(t)
            # Modest dorsiflexion during flight, zero at each contact boundary.
            pitch-=.55*math.sin(np.pi*t)**2
        qPitch=Rotation.from_rotvec([pitch,0,0]);footQ=qPitch*Rotation.from_matrix(rest[0,name['foot_'+side],:3,:3]);usingPush=pitch>pivot['switchPitch'];pivotOffset=(pivot['mesh'][pivot['pushSurfaceIndex']]-pivot['ankle'])if usingPush else pivot['offsetFromAnkle'];anchorShift=pivot['switchOffset']if usingPush else np.zeros(3)
        target=np.array([pivot['restPoint'][0]+anchorShift[0],y,z+anchorShift[2]])-qPitch.apply(pivotOffset)
        # Actual convex sole support switches from forefoot to toe-tip while
        # rolling. At the switch both material points have equal floor height;
        # preserve the new point's world location instead of dragging it.
        target[1]=y-float(qPitch.apply(pivot['mesh']-pivot['ankle'])[:,1].min());ankleTargets[side][frame]=target
        upper,lower,foot=[name[b+'_'+side]for b in ['thigh','calf','foot']];a,b=legLengths[side];h=world[frame,upper,:3,3].copy();vec=target-h;distance=np.linalg.norm(vec);reachExcess.append(max(0,float(distance-a-b)));dist=np.clip(distance,abs(a-b)+1e-6,(a+b)*.9999);direction=vec/distance
        # Anatomical forward pole; mild authored lateral plane remains. This
        # does not prohibit legitimate leg overlap or clamp foot left/right.
        pole=np.array([.08 if side=='l'else-.08,0,1.]);pole-=direction*(pole@direction);pole/=np.linalg.norm(pole)
        along=(a*a+dist*dist-b*b)/(2*dist);height=np.sqrt(max(0,a*a-along*along));knee=h+direction*along+pole*height
        originalUpper=world[frame,upper].copy();originalLower=world[frame,lower].copy();originalFoot=world[frame,foot].copy()
        upperQ=align(originalLower[:3,3]-h,knee-h)*Rotation.from_matrix(originalUpper[:3,:3]);set_world_q(frame,upper,upperQ);update_frame(frame)
        lowerQ=align(originalFoot[:3,3]-originalLower[:3,3],target-knee)*Rotation.from_matrix(originalLower[:3,:3]);set_world_q(frame,lower,lowerQ);update_frame(frame)
        set_world_q(frame,foot,footQ);update_frame(frame)
        # Toe bending is replaced by forefoot pivot, not simultaneously applied.
        ball=name['ball_'+side];set_world_q(frame,ball,qPitch*Rotation.from_matrix(rest[0,ball,:3,:3]));update_frame(frame)

# Export a compact GLB retaining the actual source mannequin and all skin data,
# but only this derivative's sampled clip. Static constant channels are retained.
j=copy.deepcopy(g.j);j['animations']=[];j['accessors']=[];j['bufferViews']=[];binary=bytearray();copied={}
def add_accessor(values,componentType,kind,metadata=None):
    values=np.asarray(values,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}[componentType]);pad=(-len(binary))%4;binary.extend(b'\0'*pad);start=len(binary);binary.extend(values.tobytes());view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':values.nbytes});a={'bufferView':view,'componentType':componentType,'count':len(values),'type':kind}
    if metadata:
        for key in ['normalized','min','max']: 
            if key in metadata:a[key]=metadata[key]
    index=len(j['accessors']);j['accessors'].append(a);return index
def copy_acc(index):
    if index not in copied:
        a=g.j['accessors'][index];copied[index]=add_accessor(g.acc(index),a['componentType'],a['type'],a)
    return copied[index]
for mesh in j['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes']={key:copy_acc(index)for key,index in primitive['attributes'].items()}
        if'indices'in primitive:primitive['indices']=copy_acc(primitive['indices'])
        for target in primitive.get('targets',[]):
            for key,index in target.items():target[key]=copy_acc(index)
for skin in j['skins']:skin['inverseBindMatrices']=copy_acc(skin['inverseBindMatrices'])
assert not j.get('images'),'This pinned mannequin has no images; audit exporter before expanding source'
timeAcc=add_accessor(times[:,None],5126,'SCALAR',{'min':[0.],'max':[duration]});anim={'name':cfg['clipName'],'channels':[],'samplers':[]}
for i,node in enumerate(g.nodes):
    if'matrix'in node:continue
    for prop,values,kind in [('translation',trans[i],'VEC3'),('rotation',rot[i],'VEC4'),('scale',np.broadcast_to(node.get('scale',[1,1,1]),(n+1,3)),'VEC3')]:
        values=values.copy();values[-1]=values[0]
        if prop=='rotation':
            for frame in range(1,len(values)):
                if values[frame-1]@values[frame]<0:values[frame]*=-1
        output=add_accessor(values,5126,kind);sampler=len(anim['samplers']);anim['samplers'].append({'input':timeAcc,'output':output,'interpolation':'LINEAR'});anim['channels'].append({'sampler':sampler,'target':{'node':i,'path':prop}})
j['animations']=[anim];j['asset']['extras']={'derivedFrom':cfg['sourceSha256'],'license':'CC0-1.0','author':'Quaternius; lower-body adaptation by project','candidateOnly':True};j['buffers']=[{'byteLength':len(binary)}];text=json.dumps(j,separators=(',',':')).encode();text+=b' '*((-len(text))%4);binary.extend(b'\0'*((-len(binary))%4));glb=struct.pack('<4sII',b'glTF',2,12+8+len(text)+8+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True);asset=out/'jog-ordinary-derived-v1.glb';asset.write_bytes(glb);exported=m.GLB(glb)
checkTimes=np.linspace(0,duration,round(duration*240)+1);ew,_,_=exported.evaluate(cfg['clipName'],checkTimes);dt=checkTimes[1]-checkTimes[0];report={'sourceSha256':cfg['sourceSha256'],'assetSha256':hashlib.sha256(glb).hexdigest(),'config':cfg,'duration':duration,'nativeSpeed':cfg['cycleDistance']/duration,'maxIKReachExcess':max(reachExcess),'foot':{},'caution':'Source-side generated candidate only; not VRM retarget/game/visual acceptance. Actual source foot skin geometry measured; exported clip evaluated independently of target arrays.'}
for side,offset in [('l',0),('r',.5)]:
    points=exported.skin(ew,exported.foot_surfaces()[side]);phase=(checkTimes/duration-offset)%1;stance=phase<cfg['stanceFraction'];pivot=pivots[side]['surfaceIndex'];movingPoints=points.copy();movingPoints[:,:,2]+=checkTimes[:,None]*report['nativeSpeed'];mask=stance[:-1]&stance[1:]&(np.abs(np.diff(phase))<.5);ids=points[1:,:,1].argmin(axis=1);ix=np.arange(len(ids));v=(movingPoints[1:][ix,ids]-movingPoints[:-1][ix,ids])/dt;horizontal=np.linalg.norm(v[:,[0,2]],axis=1);ankle=ew[:,name['foot_'+side],:3,3];low=points[:,:,1].min(axis=1)
    report['foot'][side]={'pivotSurfaceIndex':pivot,'pushPivotSurfaceIndex':pivots[side]['pushSurfaceIndex'],'pivotSwitchPitch':pivots[side]['switchPitch'],'pivotRestPoint':pivots[side]['restPoint'].tolist(),'contactFraction':cfg['stanceFraction'],'contactOffset':offset,'actualSkinMinYRange':[float(low.min()),float(low.max())],'supportMaterialHorizontalSpeedMedian':float(np.median(horizontal[mask])),'supportMaterialHorizontalSpeedP95':float(np.quantile(horizontal[mask],.95)),'supportMaterialHorizontalSpeedMax':float(horizontal[mask].max()),'supportMaterialIntegratedTravel':float(np.sum(horizontal[mask])*dt),'maxAnkleFrameStep240Hz':float(np.linalg.norm(np.diff(ankle,axis=0),axis=1).max()),'loopAnkleError':float(np.linalg.norm(ankle[0]-ankle[-1])),'actualSkinMinYRangeInSupport':[float(low[stance].min()),float(low[stance].max())]}
metadata={'schema':'m1.motion-profile.1','id':'ual1-jog-ordinary-derived-v1','file':asset.name,'sha256':report['assetSha256'],'sourceSha256':cfg['sourceSha256'],'sourceClip':cfg['sourceClip'],'clip':cfg['clipName'],'license':'CC0-1.0','duration':duration,'cycleDistance':cfg['cycleDistance'],'sourceRestHipY':float(rest[0,name['pelvis'],1,3]),'translationOwner':'path','stance':{side:{'startPhase':offset,'endPhase':offset+cfg['stanceFraction'],'pivotSourceSurfaceIndex':pivots[side]['surfaceIndex']}for side,offset in [('l',0),('r',.5)]},'airbornePhaseIntervals':[[cfg['stanceFraction'],.5],[.5+cfg['stanceFraction'],1]],'status':'candidate-source-qa-only','modifications':['Shorter C1 fore-aft foot trajectories; genuine flight, not sped-up walk','Source pelvis vertical range scaled with new mean; source upper-body rotations retained with distributed loop-seam correction','Offline two-bone IK; fixed forefoot material pivot in support; moderate flight dorsiflexion','Source toe rotation replaced with explicit forefoot pivot']}
report['actualPelvisYRange']=[float(ew[:,name['pelvis'],1,3].min()),float(ew[:,name['pelvis'],1,3].max())]
report['checks']={'reachWithin3mm':max(reachExcess)<=.003,'sourceSoleAboveMinus1mm':all(v['actualSkinMinYRange'][0]>=-.001 for v in report['foot'].values()),'contactTravelBelow5mmPerSupport':all(v['supportMaterialIntegratedTravel']<.005 for v in report['foot'].values()),'ankleStepBelow25mmAt240Hz':all(v['maxAnkleFrameStep240Hz']<.025 for v in report['foot'].values()),'closedAnkleLoop':all(v['loopAnkleError']<1e-5 for v in report['foot'].values())}
metadata['rollingPivotNote']='Source forefoot surface 87 to toe-tip 48 at ~0.16622 rad pitch. These are source QA indices, never valid target-body vertex identifiers.'
(out/'jog-ordinary-derived-v1.profile.json').write_text(json.dumps(metadata,indent=2));(out/'jog-ordinary-derived-v1.config.json').write_text(json.dumps(cfg,indent=2));evidence=(ROOT/'output/playwright/m1c-source/derived')if out==(ROOT/'prototype/public/assets/motion/m1c')else out/'qa';evidence.mkdir(parents=True,exist_ok=True);(evidence/'source-qa.json').write_text(json.dumps(report,indent=2));np.savez_compressed(evidence/'trajectories.npz',times=checkTimes,world=ew)
samples=[]
for phase in [0,.13,.25,.34,.5,.7,.84,.99,1.]:
    sw,_,_=exported.evaluate(cfg['clipName'],np.array([phase*duration]));samples.append({'clip':cfg['clipName'],'phase':phase,'time':phase*duration,'joints':{bone:sw[0,name[bone],:3,3].tolist()for bone in ['pelvis','hand_l','hand_r','foot_l','foot_r']},'footMinY':{side:float(exported.skin(sw,exported.foot_surfaces()[side])[:,:,1].min())for side in ['l','r']}})
(evidence/'source-analysis.json').write_text(json.dumps({'crosscheckSamples':samples},indent=2))
print(json.dumps(report,indent=2))
if not all(report['checks'].values()):raise RuntimeError('Generated source candidate failed its bounded numerical checks; inspect source-qa.json')
