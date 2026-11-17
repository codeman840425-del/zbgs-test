"""Offline, bounded source hand-pose fitting. Never writes runtime/body assets.
Uses original glTF skin weights/FK; final result requires real VRM visual validation.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import time
import numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import least_squares

ROOT = pathlib.Path(__file__).resolve().parents[2]

class GLB:
    def __init__(self, path):
        raw = path.read_bytes(); size = struct.unpack_from('<I', raw, 12)[0]
        self.doc = json.loads(raw[20:20+size]); self.binary = raw[28+size:]
        self.sha = hashlib.sha256(raw).hexdigest()
    def acc(self, i):
        a=self.doc['accessors'][i]; v=self.doc['bufferViews'][a['bufferView']]
        dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]); width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        return np.ndarray((a['count'],width),dtype=dtype,buffer=self.binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()

def unit(x): return x / max(1e-12, np.linalg.norm(x))
def transform(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
    m=np.eye(4); m[:3,:3]=R.from_quat(node.get('rotation',[0,0,0,1])).as_matrix()@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m

def fit(body, seconds):
    path=ROOT/({'female':'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm','male':'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'}[body]);g=GLB(path);d=g.doc
    nodes=d['nodes'];parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])}
    human={bone:value['node'] for bone,value in d['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    # VRM0 names the first two thumb joints Proximal/Intermediate; three-vrm
    # exposes them as the VRM1 Metacarpal/Proximal humanoid semantics.
    for side in ['left','right']:
        # VRM1 already has Metacarpal/Proximal/Distal.  Apply the VRM0
        # aliases only when the canonical VRM1 semantics are absent.
        if side+'ThumbMetacarpal' not in human:
            first=human.pop(side+'ThumbProximal',None);second=human.pop(side+'ThumbIntermediate',None)
            if first is not None:human[side+'ThumbMetacarpal']=first
            if second is not None:human[side+'ThumbProximal']=second
    local=np.array([transform(n) for n in nodes]);world=np.zeros_like(local)
    def evaluate_world(matrices):
        cache={}
        def at(i):
            if i not in cache:cache[i]=(at(parents[i])@matrices[i]) if i in parents else matrices[i]
            return cache[i]
        return np.array([at(i) for i in range(len(nodes))])
    world=evaluate_world(local);rest_world=world.copy();hand_node=human['rightHand'];hand_at=world[hand_node,:3,3]
    fwd=unit(world[human['rightMiddleProximal'],:3,3]-hand_at)
    across=unit(world[human['rightIndexProximal'],:3,3]-world[human['rightLittleProximal'],:3,3]);across=unit(across-fwd*np.dot(across,fwd));normal=unit(np.cross(across,fwd))
    basis=np.column_stack([fwd,across,normal]);length=np.linalg.norm(world[human['rightMiddleProximal'],:3,3]-hand_at)
    skin=d['skins'][0];joints=skin['joints'];inverse=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    selected_names={name:index for name,index in human.items() if name=='rightHand' or name.startswith(('rightThumb','rightIndex','rightMiddle','rightRing','rightLittle'))}
    selected_joints=set(selected_names.values());primitive=next(p for mesh in d['meshes'] for p in mesh['primitives'] if 'Body_' in d['materials'][p['material']]['name'] and 'SKIN' in d['materials'][p['material']]['name'])
    pos=g.acc(primitive['attributes']['POSITION']).astype(float);ji=g.acc(primitive['attributes']['JOINTS_0']).astype(int);weights=g.acc(primitive['attributes']['WEIGHTS_0']).astype(float);weights/=weights.sum(1,keepdims=True)
    vertex_ids=np.unique(g.acc(primitive['indices']));mask=np.sum(weights*np.isin(np.array(joints)[ji],list(selected_joints)),axis=1)>.5;ids=vertex_ids[mask[vertex_ids]]
    p=np.column_stack([pos[ids],np.ones(len(ids))]);j=ji[ids];w=weights[ids]
    family=[]
    semantic={v:k for k,v in selected_names.items()}
    for js,ws in zip(j,w):
        choices=[(weight,semantic.get(joints[joint],'')) for joint,weight in zip(js,ws)];name=max(choices)[1]
        family.append('palm' if name=='rightHand' else next((f for f in ['Thumb','Index','Middle','Ring','Little'] if f in name),'palm'))
    family=np.array(family)
    def skin_points(worlds):
        mats=worlds[np.array(joints)]@inverse
        return np.sum(np.einsum('nvij,nj->nvi',mats[j],p)*w[:,:,None],axis=1)[:,:3]
    rest_points=skin_points(world);rest_hand=(rest_points-hand_at)@basis
    palm=(family=='palm')&(rest_hand[:,0]>.25*length)&(rest_hand[:,0]<1.05*length)
    if np.count_nonzero(palm)<8:raise ValueError('Insufficient real palm skin patch')
    center_forward=.78*length
    band=palm&(np.abs(rest_hand[:,0]-center_forward)<.016)
    if np.count_nonzero(band)<4:band=palm
    # Real palm support plane, not the old fixed +12mm socket offset.
    radius=.013
    support_candidates=palm&(np.abs(rest_hand[:,0]-center_forward)<radius)
    if not np.any(support_candidates):raise ValueError('Palm patch does not overlap grip cylinder')
    # Exact circle support against this skin patch at the selected palm station.
    # max(N + sqrt(r^2 - deltaF^2)) yields tangency without a floating plane gap.
    support=float(np.max(rest_hand[support_candidates,2]+np.sqrt(radius**2-(rest_hand[support_candidates,0]-center_forward)**2)))
    center=np.array([center_forward,float(np.median(rest_hand[band,1])),support+.0005])
    controls=[];initial=[];lower=[];upper=[]
    for finger in ['Index','Middle','Ring','Little','Thumb']:
        segments=['Metacarpal','Proximal','Distal'] if finger=='Thumb' else ['Proximal','Intermediate','Distal']
        for segment in segments:
            name='right'+finger+segment
            if name not in human:continue
            node=human[name];child=next((x for x in nodes[node].get('children',[]) if x in selected_joints),None)
            axis_fwd=unit((world[child,:3,3]-world[node,:3,3]) if child is not None else fwd)
            hinge=unit(np.cross(axis_fwd,normal));axes=[hinge]
            if finger=='Thumb' and segment=='Metacarpal':axes=[normal,hinge,fwd]
            for axis_index,axis in enumerate(axes):
                controls.append({'bone':name,'node':node,'axisWorld':axis,'axisLocal':unit(world[node,:3,:3].T@axis),'kind':('opposition' if finger=='Thumb' and axis_index==0 and segment=='Metacarpal' else 'curl')})
                initial.append(0. if len(axes)>1 else (.6 if segment=='Proximal' else 1.0))
                lower.append(-1.4 if len(axes)>1 else -.15);upper.append(1.4 if len(axes)>1 else 1.8)
    initial=np.array(initial);lower=np.array(lower);upper=np.array(upper)
    # v3 aligns every control to the recorded male v1 parameter by bone, kind,
    # and nearest local axis. Non-thumb controls are then fixed exactly. Thumb
    # controls use the corresponding female semantic control as warm start.
    if body == 'male':
        male_v1 = json.loads((ROOT/'assets-source/native-live-accessory-fit-v1/male-grip.json').read_text())
        female_v1 = json.loads((ROOT/'assets-source/native-live-accessory-fit-v1/female-grip.json').read_text())
        def align(records, control):
            candidates=[(i,r) for i,r in enumerate(records) if r['bone']==control['bone'] and r['kind']==control['kind']]
            if not candidates: raise ValueError(f'No warm control for {control["bone"]}/{control["kind"]}')
            axis=np.array(control['axisLocal'])
            return min(candidates,key=lambda ir: 1.0-float(np.dot(axis,np.array(ir[1]['axisLocal']))))[1]
        male_records=male_v1['parameters']; female_records=female_v1['parameters']
        used_female=[]
        for idx, control in enumerate(controls):
            m=align(male_records,control)
            initial[idx]=m['angleRadians']
            if 'Thumb' not in control['bone']:
                lower[idx]=initial[idx]-1e-12; upper[idx]=initial[idx]+1e-12
            else:
                candidates=[(i,r) for i,r in enumerate(female_records) if r['bone']==control['bone'] and r['kind']==control['kind'] and i not in used_female]
                if not candidates: raise ValueError(f'No female warm control for {control["bone"]}/{control["kind"]}')
                axis=np.array(control['axisLocal'])
                i, f=min(candidates,key=lambda ir: 1.0-float(np.dot(axis,np.array(ir[1]['axisLocal']))))
                used_female.append(i); initial[idx]=f['angleRadians']
    tips={}
    for finger in ['Thumb','Index','Middle','Ring','Little']:
        which=np.where(family==finger)[0];base=world[human['right'+finger+('Metacarpal' if finger=='Thumb' else 'Proximal')],:3,3]
        distances=np.linalg.norm(rest_points[which]-base,axis=1);tips[finger]=which[distances>=np.quantile(distances,.80)]
    def pose(angles):
        matrices=local.copy()
        for value,control in zip(angles,controls):matrices[control['node'],:3,:3]=matrices[control['node'],:3,:3]@R.from_rotvec(control['axisLocal']*value).as_matrix()
        worlds=evaluate_world(matrices);points=skin_points(worlds);return matrices,worlds,(points-hand_at)@basis
    started=time.monotonic();best={'loss':float('inf'),'x':initial.copy()};evaluations=0
    def residual(angles):
        nonlocal evaluations
        if time.monotonic()-started>seconds:raise TimeoutError('bounded-fit-deadline')
        evaluations+=1;_,_,points=pose(angles);rel=points-center;radial=np.linalg.norm(rel[:,[0,2]],axis=1);gap=radial-radius
        in_length=((rel[:,1]>-.075)&(rel[:,1]<.085)).astype(float)
        values=[np.minimum(gap-.0004,0)*in_length*1500]
        for finger,index in tips.items():
            # Pad centroid near cylinder, without placing bone targets inside it.
            pad=rel[index].mean(0);r=np.linalg.norm(pad[[0,2]])
            values.append(np.array([(r-radius-.002)*130]))
            if finger!='Thumb':values.append(np.array([min(pad[2]-.002,0)*120]))
            else:
                # Oppose the index row rather than seeking any contact high on
                # the cylinder (the previous fit reached toward the mic head).
                index_height=np.dot(world[human['rightIndexProximal'],:3,3]-hand_at,across)-center[1]+.003
                values.append(np.array([(pad[1]-index_height)*220]))
        values.append((angles-initial)*.08)
        result=np.concatenate(values);loss=float(np.dot(result,result))
        if loss<best['loss']:best.update(loss=loss,x=angles.copy())
        return result
    try:result=least_squares(residual,initial,bounds=(lower,upper),max_nfev=100,diff_step=1e-4,ftol=1e-5,xtol=1e-5,gtol=1e-5);status=result.message
    except TimeoutError:status='deadline; best finite evaluated pose retained'
    angles=best['x'];matrices,worlds,points=pose(angles);rel=points-center;gap=np.linalg.norm(rel[:,[0,2]],axis=1)-radius
    gap=np.where((rel[:,1]>-.075)&(rel[:,1]<.085),gap,1.)
    normalized={};raw_pose={}
    for name,node in selected_names.items():
        if name=='rightHand':continue
        qraw=R.from_matrix(matrices[node,:3,:3]);qrest=R.from_matrix(local[node,:3,:3]);parent=R.from_matrix(rest_world[parents[node],:3,:3])
        normalized[name]=(parent*qraw*qrest.inv()*parent.inv()).as_quat().tolist();raw_pose[name]=qraw.as_quat().tolist()
    mic_world=hand_at+basis@center;hand_inverse=np.linalg.inv(rest_world[hand_node]);mount=(hand_inverse@np.r_[mic_world,1])[:3]
    mic_basis=np.column_stack([fwd,across,np.cross(fwd,across)]);mountq=R.from_matrix(hand_inverse[:3,:3]@mic_basis).as_quat()
    report={'schema':'native-live-accessory-grip-v3','body':body,'avatarSha256':g.sha,'source':str(path.relative_to(ROOT)).replace('\\','/'),'method':'Original skin weights/FK, real palm support plane, male v1 per-control lock with female semantic thumb warm start','runtimeApplied':False,'seconds':time.monotonic()-started,'evaluations':evaluations,'status':str(status),'loss':best['loss'],'normalizedFingerRotations':normalized,'rawFingerRotations':raw_pose,'micRawHandLocal':{'position':mount.tolist(),'quaternion':mountq.tolist()},'palmFit':{'vertices':int(np.sum(band)),'supportPlane':support,'handLength':length,'radius':radius,'clearance':.0005,'centerInPalmFrame':center.tolist()},'parameters':[{'bone':c['bone'],'axisLocal':c['axisLocal'].tolist(),'kind':c['kind'],'angleRadians':float(v),'bounds':[float(lo),float(hi)]}for c,v,lo,hi in zip(controls,angles,lower,upper)],'metrics':{'handVertices':len(ids),'maxPenetrationMm':float(max(0,-gap.min())*1000),'verticesInsideOver1mm':int(np.sum(gap<-.001)),'nearSurface2mm':int(np.sum(np.abs(gap)<.002)),'groups':{f:{'maxPenetrationMm':float(max(0,-gap[family==f].min())*1000),'inside':int(np.sum(gap[family==f]<-.001)),'near':int(np.sum(np.abs(gap[family==f])<.002))}for f in set(family)}},'limits':['Offline glTF LBS only; normalized retarget equivalence must be compared with actual VRM before accepting.','Cylinder vertex contacts are not complete triangle collision or natural grip acceptance.','No body weights, meshes, source VRM, or production controller changed. V3 locks every non-thumb male control to v1 and warms each thumb control by semantic axis matching.']}
    out=ROOT/'assets-source/native-live-accessory-fit-v3';out.mkdir(parents=True,exist_ok=True);(out/f'{body}-grip.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    expected=(np.column_stack([points@basis.T+hand_at,np.ones(len(points))])@hand_inverse.T)[:,:3]
    hand_weights=np.sum(w*np.isin(np.array(joints)[j],list(selected_joints)),axis=1)
    (out/f'{body}-skin-reference.json').write_text(json.dumps({'avatarSha256':g.sha,'vertexIds':ids.tolist(),'rawHandLocalPoints':expected.tolist(),'rightHandTreeWeight':hand_weights.tolist(),'vertexFamilies':family.tolist()},indent=2)+'\n',encoding='utf8')
    lookup={int(v):i+1 for i,v in enumerate(ids)};tri=g.acc(primitive['indices']).reshape(-1,3);posed=points@basis.T+hand_at
    lines=['# Diagnostic posed original hand; no source topology/weights changed']+[f'v {x:.9f} {y:.9f} {z:.9f}' for x,y,z in posed]
    lines += ['f '+' '.join(str(lookup[int(v)])for v in t) for t in tri if all(int(v)in lookup for v in t)]
    (out/f'{body}-posed-hand.obj').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(json.dumps({k:report[k] for k in ['body','seconds','evaluations','status','metrics']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--body',choices=['female','male','both'],default='both');parser.add_argument('--seconds',type=float,default=40);args=parser.parse_args()
    for body in (['female','male'] if args.body=='both' else [args.body]):fit(body,args.seconds)
