"""Offline source-motion audit of pinned CC0 GLBs; never imports game runtime.

Contact labels are geometric estimates from the actual source foot mesh, not
author-supplied contact markers. All results remain source-side qualification.
"""
import argparse, hashlib, io, json, math, pathlib, struct, zipfile
import numpy as np
from scipy.spatial.transform import Rotation

ROOT=pathlib.Path(__file__).resolve().parent.parent
ZIP_SHA='cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724'
SHAS={'plain':'69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997','rm':'be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01'}
NAMES=['Walk_Loop','Jog_Fwd_Loop','Idle_Loop','Idle_Talking_Loop','Sitting_Idle_Loop','Sitting_Talking_Loop']

def quat_interp(q0,q1,f):
    q0=q0/np.linalg.norm(q0,axis=1)[:,None];q1=q1/np.linalg.norm(q1,axis=1)[:,None]
    dot=np.sum(q0*q1,axis=1);q1=np.where((dot<0)[:,None],-q1,q1);dot=np.clip(abs(dot),0,1)
    angle=np.arccos(dot);s=np.sin(angle);near=s<1e-6;s=np.where(near,1,s)
    a=np.where(near,1-f,np.sin((1-f)*angle)/s);b=np.where(near,f,np.sin(f*angle)/s)
    q=q0*a[:,None]+q1*b[:,None];return q/np.linalg.norm(q,axis=1)[:,None]

class GLB:
    def __init__(self,data):
        assert data[:4]==b'glTF';n,kind=struct.unpack_from('<I4s',data,12);assert kind==b'JSON'
        self.j=json.loads(data[20:20+n]);size,kind=struct.unpack_from('<I4s',data,20+n);assert kind==b'BIN\0';self.bin=data[28+n:28+n+size]
        self.nodes=self.j['nodes'];self.byname={n['name']:i for i,n in enumerate(self.nodes) if 'name'in n};self.parents={c:i for i,n in enumerate(self.nodes)for c in n.get('children',[])};self.cache={}
    def acc(self,i):
        if i in self.cache:return self.cache[i]
        a=self.j['accessors'][i];assert 'sparse'not in a;v=self.j['bufferViews'][a['bufferView']]
        dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}[a['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',width*dtype.itemsize)
        result=np.ndarray((a['count'],width),dtype=dtype,buffer=self.bin,offset=start,strides=(stride,dtype.itemsize)).copy()
        if a.get('normalized') and dtype.kind in'ui':result=result.astype(float)/np.iinfo(dtype).max
        self.cache[i]=result;return result
    def animation(self,name):return next(a for a in self.j['animations']if a['name']==name)
    def duration(self,name):return max(float(self.acc(s['input'])[-1,0])for s in self.animation(name)['samplers'])
    def evaluate(self,name,times):
        count=len(times);trans=[np.broadcast_to(n.get('translation',[0,0,0]),(count,3)).copy() for n in self.nodes];rot=[np.broadcast_to(n.get('rotation',[0,0,0,1]),(count,4)).copy()for n in self.nodes];scales=[np.broadcast_to(n.get('scale',[1,1,1]),(count,3)).copy()for n in self.nodes]
        if name:
            anim=self.animation(name)
            for c in anim['channels']:
                s=anim['samplers'][c['sampler']];ts=self.acc(s['input'])[:,0];values=self.acc(s['output']).astype(float);i=c['target']['node'];prop=c['target']['path'];interp=s.get('interpolation','LINEAR');assert interp in ['LINEAR','STEP']
                k=np.clip(np.searchsorted(ts,times,side='right')-1,0,max(0,len(ts)-2));k1=np.minimum(k+1,len(ts)-1);den=ts[k1]-ts[k];f=np.clip(np.divide(times-ts[k],den,out=np.zeros(count),where=den>0),0,1)
                if interp=='STEP':f[:]=0
                value=quat_interp(values[k],values[k1],f)if prop=='rotation'else values[k]*(1-f[:,None])+values[k1]*f[:,None]
                {'translation':trans,'rotation':rot,'scale':scales}[prop][i]=value
        local=[]
        for i,n in enumerate(self.nodes):
            if 'matrix'in n:
                assert not name or not any(c['target']['node']==i for c in self.animation(name)['channels']);m=np.broadcast_to(np.array(n['matrix']).reshape(4,4).T,(count,4,4)).copy()
            else:
                m=np.broadcast_to(np.eye(4),(count,4,4)).copy();m[:,:3,:3]=Rotation.from_quat(rot[i]).as_matrix()*scales[i][:,None,:];m[:,:3,3]=trans[i]
            local.append(m)
        world=[None]*len(self.nodes)
        def resolve(i):
            if world[i]is None:world[i]=resolve(self.parents[i])@local[i]if i in self.parents else local[i]
            return world[i]
        for i in range(len(world)):resolve(i)
        return np.stack(world,axis=1),rot,trans
    def foot_surfaces(self,bone_names=None):
        result={'l':[],'r':[]}
        for node in self.nodes:
            if 'mesh'not in node or 'skin'not in node:continue
            skin=self.j['skins'][node['skin']];joint_names=[self.nodes[i]['name']for i in skin['joints']];ibm=self.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
            for primitive in self.j['meshes'][node['mesh']]['primitives']:
                attrs=primitive['attributes'];pos=self.acc(attrs['POSITION']);joints=self.acc(attrs['JOINTS_0']).astype(int);weights=self.acc(attrs['WEIGHTS_0']).astype(float)
                refs=np.unique(self.acc(primitive['indices']).reshape(-1))if'indices'in primitive else np.arange(len(pos))
                for side in result:
                    selected=np.array([n in (bone_names[side]if bone_names else ['foot_'+side,'ball_'+side])for n in joint_names]);mask=np.sum(selected[joints[refs]]*weights[refs],axis=1)>=.5;ids=refs[mask]
                    result[side].append({'position':np.column_stack([pos[ids],np.ones(len(ids))]),'joints':np.array(skin['joints'])[joints[ids]],'skinJoints':joints[ids],'weights':weights[ids],'inverseBind':ibm,'indices':ids})
        return result
    def skin(self,world,surfaces):
        result=[]
        for s in surfaces:
            points=np.zeros((len(world),len(s['position']),4))
            for k in range(4):
                matrices=world[:,s['joints'][:,k]]@s['inverseBind'][s['skinJoints'][:,k]][None,:,:,:]
                points+=np.einsum('fvij,vj->fvi',matrices,s['position'])*s['weights'][None,:,k,None]
            result.append(points[:,:,:3])
        return np.concatenate(result,axis=1)

def intervals(mask,duration):
    n=len(mask);result=[]
    if np.all(mask):return [{'startPhase':0,'endPhase':1,'duration':duration,'wrap':False}]
    for start in np.flatnonzero(mask&~np.roll(mask,1)):
        length=1
        while length<n and mask[(start+length)%n]:length+=1
        end=start+length;result.append({'startPhase':float(start/n),'endPhase':float(1 if end==n else(end%n)/n),'duration':float(length/n*duration),'wrap':bool(end>n)})
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',default='analysis/assets/UAL-Standard.zip');p.add_argument('--output',default='output/playwright/m1c-source');p.add_argument('--hz',type=int,default=240);p.add_argument('--ratio',type=float,default=1);args=p.parse_args()
    assert args.hz>=120 and math.isfinite(args.ratio) and args.ratio>0
    
    archive=(ROOT/args.archive).read_bytes();assert hashlib.sha256(archive).hexdigest()==ZIP_SHA;z=zipfile.ZipFile(io.BytesIO(archive));models={}
    for key,filename in [('plain','UAL1_Standard.glb'),('rm','UAL1_Standard_RM.glb')]:
        data=z.read('Universal Animation Library[Standard]/Unreal-Godot/'+filename);assert hashlib.sha256(data).hexdigest()==SHAS[key];models[key]=GLB(data)
    plain,rm=models['plain'],models['rm'];assert plain.nodes==rm.nodes,'RM/no-root rest skeleton differs';rest,_,_=plain.evaluate(None,np.array([0.]));surfaces=plain.foot_surfaces()
    def pos(world,name):return world[:,plain.byname[name],:3,3]
    def json_value(obj):
        if isinstance(obj,np.ndarray):return obj.tolist()
        if isinstance(obj,np.generic):return obj.item()
        raise TypeError(type(obj))
    report={'archive':args.archive,'archiveSha256':ZIP_SHA,'glbSha256':SHAS,'targetHipRatio':args.ratio,'samplingHzRequested':args.hz,'method':'glTF TRS + shortest-path quaternion slerp; all joint ancestors evaluated; actual indexed source foot skin vertices selected by >=.5 same-side foot/ball weight. Contact is a geometric estimate; no author contact markers.','axes':{},'clips':{},'limits':['Source mannequin and source geometry only; not VRM target or live game acceptance','Support/air thresholds are estimates with reported sensitivity; not force/contact metadata','Material-point RM speed measures real source-mesh movement; zero root delta does not imply feet planted','Keep root motion and path-owned displacement mutually exclusive']}
    lateral=pos(rest,'thigh_l')[0]-pos(rest,'thigh_r')[0];lateral/=np.linalg.norm(lateral);forward=np.cross(lateral,[0,1,0]);root=plain.byname['root'];anc=[];i=root
    while i in plain.parents:i=plain.parents[i];anc.append(plain.nodes[i])
    report['axes']={'rootNode':plain.nodes[root],'rootAncestors':anc,'sameRestNodesAndSkinLayoutRMNoRoot':True,'leftFromRightWorld':lateral,'inferredForwardWorld':forward,'sourceRestHipWorld':pos(rest,'pelvis')[0],'restFootSoleMinY':{s:float(plain.skin(rest,surfaces[s])[:,:,1].min())for s in surfaces},'footVertexCounts':{s:sum(len(x['indices'])for x in surfaces[s])for s in surfaces},'localBoneDirections':{name:Rotation.from_matrix(rest[0,plain.byname[name],:3,:3]).as_matrix().T@(pos(rest,child)[0]-pos(rest,name)[0])for name,child in [('thigh_l','calf_l'),('calf_l','foot_l'),('foot_l','ball_l'),('upperarm_l','lowerarm_l'),('lowerarm_l','hand_l')]}}
    report['currentBodyRestRatios']={}
    for body in ['female','male']:
        filepath=ROOT/f'prototype/public/assets/foundation/base-{body}-roundtrip.vrm'
        if not filepath.exists():continue
        data=filepath.read_bytes();target=GLB(data);tw,_,_=target.evaluate(None,np.array([0.]));ext=target.j['extensions']
        hip=next(b['node']for b in ext['VRM']['humanoid']['humanBones']if b['bone']=='hips')if'VRM'in ext else ext['VRMC_vrm']['humanoid']['humanBones']['hips']['node']
        height=float(tw[0,hip,1,3]);ratio=height/float(pos(rest,'pelvis')[0,1])
        report['currentBodyRestRatios'][body]={'path':str(filepath.relative_to(ROOT)),'sha256':hashlib.sha256(data).hexdigest(),'targetHipWorldY':height,'sourceHipWorldY':float(pos(rest,'pelvis')[0,1]),'ratio':ratio,'method':'Original GLB rest world hips above identity scene floor; VRM0 rotateVRM0 changes X/Z only. Normalized humanoid preserves rest joint world origins. Crosscheck with current runtime before integration.','jogOfficialTargetCycleDistance':5*ratio,'jogOfficialTargetNativeSpeed':5/plain.duration('Jog_Fwd_Loop')*ratio}
    arrays={}
    for name in NAMES:
        duration=plain.duration(name);n=math.ceil(duration*args.hz);times=np.linspace(0,duration,n+1);world,local_rot,translations=plain.evaluate(name,times);rmworld,_,_=rm.evaluate(name,times);root_path=pos(rmworld,'root');delta=root_path[-1]-root_path[0]
        foot_data={};feet_height={};arrays[name]={'times':times,'world':world,'rotations':local_rot}
        for side in ['l','r']:
            mesh=plain.skin(world,surfaces[side]);rmesh=rm.skin(rmworld,surfaces[side]);low=np.min(mesh[:,:,1],axis=1);feet_height[side]=low
            ids=np.argmin(mesh[1:,:,1],axis=1);ix=np.arange(n);velocity=(mesh[1:][ix,ids]-mesh[:-1][ix,ids])/(duration/n);rvelocity=(rmesh[1:][ix,ids]-rmesh[:-1][ix,ids])/(duration/n)
            support=(low[:-1]<.02)&(low[1:]<.02);horizontal=np.linalg.norm(rvelocity[:,[0,2]],axis=1)
            foot_data[side]={'surfaceMinimumYRange':[float(low.min()),float(low.max())],'footOriginRange':np.ptp(pos(world,'foot_'+side),axis=0),'toeOriginRange':np.ptp(pos(world,'ball_'+side),axis=0),'frontMostFootPhase':float(np.argmax(pos(world,'foot_'+side)[:-1,2])/n),'contactPhaseByThreshold':{},'rmContactMaterialHorizontalSpeed':{'median':float(np.median(horizontal[support]))if support.any()else None,'p95':float(np.quantile(horizontal[support],.95))if support.any()else None},'noRootContactMaterialBackwardSpeedMedian':float(np.median(-velocity[support,2]))if support.any()else None}
            foot_data[side]['speedSensitivity']={}
            for threshold in [.01,.015,.02,.03]:
                events=intervals(low[:-1]<=threshold,duration);foot_data[side]['contactPhaseByThreshold'][str(threshold)]=events
                selected=(low[:-1]<=threshold)&(low[1:]<=threshold)
                largest=max(events,key=lambda e:e['duration'])if events else None
                core=np.zeros(n,dtype=bool)
                if largest:
                    start=largest['startPhase'];length=largest['duration']/duration;phase=(np.arange(n)/n-start)%1
                    core=selected&(phase>=length*.25)&(phase<=length*.75)
                def speed_stats(mask):
                    if not mask.any():return None
                    backward=-velocity[mask,2];best=float(np.median(backward));residual=velocity[mask][:,[0,2]].copy();residual[:,1]+=best
                    return {'samples':int(mask.sum()),'noRootBackwardMedian':best,'noRootBackwardP10P90':np.quantile(backward,[.1,.9]),'impliedCycleDistanceMedian':best*duration,'officialRMHorizontalMedian':float(np.median(horizontal[mask])),'officialRMHorizontalP95':float(np.quantile(horizontal[mask],.95)),'bestConstantForwardSpeedResidualMedian':float(np.median(np.linalg.norm(residual,axis=1))),'bestConstantForwardSpeedResidualP95':float(np.quantile(np.linalg.norm(residual,axis=1),.95))}
                foot_data[side]['speedSensitivity'][str(threshold)]={'nearFloor':speed_stats(selected),'middleHalfOfLongestInterval':speed_stats(core)}
            arrays[name][side+'MinY']=low;arrays[name][side+'FootZ']=pos(world,'foot_'+side)[:,2];arrays[name][side+'RMContactSpeed']=horizontal
        joint_ranges={}
        for bone in ['pelvis','spine_01','spine_02','spine_03','neck_01','Head','clavicle_l','upperarm_l','lowerarm_l','hand_l','clavicle_r','upperarm_r','lowerarm_r','hand_r','thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r']:
            index=plain.byname[bone];q=local_rot[index];angular=2*np.arccos(np.clip(abs(q@q[0]),0,1))*180/np.pi
            joint_ranges[bone]={'worldPositionRange':np.ptp(pos(world,bone),axis=0),'maxWorldDisplacementFromFirst':float(np.linalg.norm(pos(world,bone)-pos(world,bone)[0],axis=1).max()),'localRotationMaxAngleFromFirstDeg':float(angular.max()),'localTranslationRange':np.ptp(translations[index],axis=0)}
        channels=[]
        for c in plain.animation(name)['channels']:
            sampler=plain.animation(name)['samplers'][c['sampler']];values=plain.acc(sampler['output']);node=plain.nodes[c['target']['node']]['name'];prop=c['target']['path']
            spread=float(np.ptp(values,axis=0).max());channels.append({'node':node,'path':prop,'keys':len(values),'interpolation':sampler.get('interpolation','LINEAR'),'componentRangeMax':spread,'nonConstant':spread>1e-5})
        report['clips'][name]={'duration':duration,'sampleIntervals':n,'rootMotion':{'start':root_path[0],'end':root_path[-1],'netDelta':delta,'cycleDistance':float(np.linalg.norm(delta)),'pathLength':float(np.linalg.norm(np.diff(root_path,axis=0),axis=1).sum()),'nativeAverageSpeed':float(np.linalg.norm(delta)/duration),'targetCycleDistance':float(np.linalg.norm(delta)*args.ratio),'targetNativeAverageSpeed':float(np.linalg.norm(delta)*args.ratio/duration)},'feet':foot_data,'airborneByThreshold':{str(h):intervals((feet_height['l'][:-1]>h)&(feet_height['r'][:-1]>h),duration)for h in [.01,.015,.02,.03]},'joints':joint_ranges,'channels':channels,'loopSeam':{bone:float(np.linalg.norm(pos(world,bone)[0]-pos(world,bone)[-1]))for bone in ['pelvis','hand_l','hand_r','foot_l','foot_r']}}
    
    # Compare normalized phase, keeping authored relative limb movement. This is a
    # phase recommendation, never a claim that blending the two poses is seamless.
    phases=np.arange(360)/360;poses={};features={}
    for name in ['Walk_Loop','Jog_Fwd_Loop']:
        world,rot,_=plain.evaluate(name,phases*plain.duration(name));poses[name]=(world,rot)
        z=np.column_stack([pos(world,'foot_l')[:,2],pos(world,'foot_r')[:,2]]);features[name]=(z-z.mean(axis=0))/np.maximum(z.std(axis=0),1e-9)
    errors=[float(np.sqrt(np.mean((features['Walk_Loop']-np.roll(features['Jog_Fwd_Loop'],-shift,axis=0))**2)))for shift in range(360)];best=int(np.argmin(errors))
    report['walkJogPhaseAlignment']={'mapping':'jogPhase = (walkPhase + offset) % 1','normalizedFootForeAftBestOffset':best/360,'zShapeRMSErrorAtZero':errors[0],'zShapeRMSErrorAtBest':errors[best],'caution':'Fore-aft phase correlation only. Confirm actual foot contact events, preserve existing support until release, and evaluate blend visually; walk double-support differs from jog flight.'}
    report['walkJogPhaseAlignment']['sameSideLongestContactStartOffsets']={}
    for threshold in ['0.01','0.015','0.02','0.03']:
        report['walkJogPhaseAlignment']['sameSideLongestContactStartOffsets'][threshold]={s:(max(report['clips']['Jog_Fwd_Loop']['feet'][s]['contactPhaseByThreshold'][threshold],key=lambda e:e['duration'])['startPhase']-max(report['clips']['Walk_Loop']['feet'][s]['contactPhaseByThreshold'][threshold],key=lambda e:e['duration'])['startPhase'])%1 for s in ['l','r']}
    for shift,label in [(0,'zero'),(best,'bestZ')]:
        angles={}
        for bone in ['pelvis','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r']:
            i=plain.byname[bone];qa=poses['Walk_Loop'][1][i];qb=np.roll(poses['Jog_Fwd_Loop'][1][i],-shift,axis=0);angles[bone]=float(np.sqrt(np.mean((2*np.arccos(np.clip(abs(np.sum(qa*qb,axis=1)),0,1))*180/np.pi)**2)))
        report['walkJogPhaseAlignment'][label+'LocalJointAngleRMSDeg']=angles
    
    report['crosscheckSamples']=[]
    report['talkingBasePoseDifference']={}
    for talk,base in [('Idle_Talking_Loop','Idle_Loop'),('Sitting_Talking_Loop','Sitting_Idle_Loop')]:
        tw,tr,_=plain.evaluate(talk,np.array([0.]));bw,br,_=plain.evaluate(base,np.array([0.]))
        report['talkingBasePoseDifference'][talk]={bone:{'worldOriginDistance':float(np.linalg.norm(pos(tw,bone)-pos(bw,bone))),'localRotationAngleDeg':float(2*np.arccos(np.clip(abs(np.sum(tr[plain.byname[bone]]*br[plain.byname[bone]])),0,1))*180/np.pi)}for bone in ['pelvis','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','hand_l','hand_r']}
    for name in ['Walk_Loop','Jog_Fwd_Loop','Idle_Talking_Loop','Sitting_Talking_Loop']:
        phases=np.array([0,.13,.5,.89,1.]);world,_,_=plain.evaluate(name,phases*plain.duration(name));surface={s:plain.skin(world,surfaces[s])for s in surfaces}
        for sample,phase in enumerate(phases):report['crosscheckSamples'].append({'clip':name,'phase':phase,'time':phase*plain.duration(name),'joints':{bone:pos(world,bone)[sample]for bone in ['pelvis','hand_l','hand_r','foot_l','foot_r']},'footMinY':{s:float(surface[sample,:,1].min())for s,surface in surface.items()}})
    
    out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True);(out/'source-analysis.json').write_text(json.dumps(report,default=json_value,indent=2),encoding='utf8')
    np.savez_compressed(out/'source-trajectories.npz',**{name+'__'+key:value for name,a in arrays.items()for key,value in a.items()if key not in ['world','rotations']})
    print(json.dumps({'axes':report['axes'],'rootMotion':{n:v['rootMotion']for n,v in report['clips'].items()},'phaseAlignment':report['walkJogPhaseAlignment']},default=json_value,indent=2));print('Evidence:',out)

if __name__=="__main__":main()
