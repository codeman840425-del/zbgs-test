"""Deterministic video pose -> existing UAL1 clip; no game controller changes."""
import gzip, hashlib, json, pathlib, shutil
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation as R
from glb_source import GLB
from glb_pack import pack

ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-source/video-motion-v1'
OUT.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=(ROOT/'evidence/real-video-pose-v1/results/sequence.json').read_bytes()
d=json.loads(raw); frames=d['frames']; times=np.array([f['source_seconds'] for f in frames]); times-=times[0]
assert len(frames)==240 and np.all(np.diff(times)>0)
source=(ROOT/'prototype/public/assets/motion/UAL1_Standard.glb').read_bytes()
assert sha(source)=='69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997'
g=GLB(source); names=g.byname; n=len(times)
rest,rr,rt=g.evaluate(None,np.array([0.])); idle,ir,it=g.evaluate('Idle_Loop',np.array([0.]))
pos=np.array([[[p[c] for c in ['x','y','z']] for p in f['poses'][0]['world_meters_predicted']] for f in frames])
confidence=np.array([[min(p['presence'],p['visibility']) for p in f['poses'][0]['world_meters_predicted']] for f in frames])
# Fill only low-confidence coordinates from surrounding valid PTS. No extra frames.
repaired=pos.copy(); low=confidence<.5
for j in range(33):
    good=~low[:,j]
    if good.sum()<2: raise ValueError(f'Insufficient landmark {j}')
    for c in range(3): repaired[:,j,c]=np.interp(times,times[good],pos[good,j,c])
# Symmetric 5-frame-scale smoothing; no time warping or invented dance events.
filtered=gaussian_filter1d(repaired,1.,axis=0,mode='nearest',truncate=2.)
filtered*=np.array([1,-1,-1])
# One fixed initial heading from anatomical L-R hips, not per-frame facing.
lat=np.mean(filtered[:30,23]-filtered[:30,24],axis=0);lat[1]=0;lat/=np.linalg.norm(lat)
up=np.array([0.,1.,0.]);forward=np.cross(lat,up); basis=np.column_stack([lat,up,forward])
points=filtered@basis
unit=lambda a:a/max(np.linalg.norm(a),1e-12)
def align(a,b):
    a=unit(a);b=unit(b);dot=np.clip(a@b,-1,1)
    if dot>1-1e-12:return R.identity()
    if dot<-.999999:
        axis=np.cross(a,[1,0,0]);axis=axis if np.linalg.norm(axis)>.01 else np.cross(a,[0,1,0]);return R.from_rotvec(unit(axis)*np.pi)
    q=np.r_[np.cross(a,b),1+dot];return R.from_quat(q/np.linalg.norm(q))
rot=[np.repeat(q,n,axis=0) for q in ir];trans=[np.repeat(t,n,axis=0) for t in rt]
world=np.zeros((len(g.nodes),4,4))
def update(k):
    done=set()
    def visit(i):
        if i in done:return world[i]
        nd=g.nodes[i];m=np.eye(4);m[:3,:3]=R.from_quat(rot[i][k]).as_matrix()*np.array(nd.get('scale',[1,1,1]))[None,:];m[:3,3]=trans[i][k]
        if 'matrix'in nd:m=np.array(nd['matrix']).reshape(4,4).T
        world[i]=(visit(g.parents[i]) if i in g.parents else np.eye(4))@m;done.add(i);return world[i]
    for i in range(len(g.nodes)):visit(i)
def setworld(k,i,q):
    parent=R.from_matrix(world[g.parents[i],:3,:3]) if i in g.parents else R.identity()
    rot[i][k]=(parent.inv()*q).as_quat()
def boneaim(k,a,b,v):
    i,j=names[a],names[b];setq=align(world[j,:3,3]-world[i,:3,3],v)*R.from_matrix(world[i,:3,:3]);setworld(k,i,setq);update(k)
footSurface=g.foot_surfaces();feet={};lengths={}; offsets={}
for side in ['l','r']:
    feet[side]=rest[0,names['foot_'+side],:3,3].copy()
    feet[side][1]-=g.skin(rest,footSurface[side])[0,:,1].min()
    ids=[names[b+'_'+side] for b in ['thigh','calf','foot']]
    lengths[side]=[np.linalg.norm(rest[0,ids[b+1],:3,3]-rest[0,ids[b],:3,3]) for b in range(2)]
    offsets[side]=rest[0,ids[0],:3,3]-rest[0,names['pelvis'],:3,3]
rootTargets=[];reach=[]
for k in range(n):
    update(k)
    # Constant bone lengths convert each observed thigh/calf direction into
    # hip height/backward travel relative to the assumed planted ankle.
    candidates=[]
    for side,hip,knee,ankle in [('l',23,25,27),('r',24,26,28)]:
        a,b=lengths[side];u=unit(points[k,knee]-points[k,hip]);v=unit(points[k,ankle]-points[k,knee])
        candidates.append(feet[side]-a*u-b*v-offsets[side])
    root=np.mean(candidates,axis=0);root[0]=0
    rootTargets.append(root.tolist());i=names['pelvis'];trans[i][k]=(np.linalg.inv(world[g.parents[i]])@np.r_[root,1])[:3];update(k)
    # Torso tilt from hip->shoulder center. No reliable twist/finger capture
    # inferred from these 33 landmarks; twist remains reference.
    torso=(points[k,11]+points[k,12]-points[k,23]-points[k,24])*.5
    boneaim(k,'spine_01','spine_03',torso)
    for side,sh,el,wr in [('l',11,13,15),('r',12,14,16)]:
        boneaim(k,'upperarm_'+side,'lowerarm_'+side,points[k,el]-points[k,sh])
        boneaim(k,'lowerarm_'+side,'hand_'+side,points[k,wr]-points[k,el])
    for side,hip,kne,ank in [('l',23,25,27),('r',24,26,28)]:
        a,b=lengths[side];upper,lower,foot=[names[x+'_'+side] for x in ['thigh','calf','foot']]
        origin=world[upper,:3,3].copy();target=feet[side];delta=target-origin;dist=np.linalg.norm(delta);reach.append(max(0.,dist-a-b));di=unit(delta)
        pole=points[k,kne]-points[k,hip];pole-=di*(pole@di)
        if np.linalg.norm(pole)<.01:pole=np.array([0.,0.,1.])-di*di[2]
        pole=unit(pole);dd=np.clip(dist,abs(a-b)+1e-6,a+b-1e-6);along=(a*a+dd*dd-b*b)/(2*dd);knee=origin+di*along+pole*np.sqrt(max(0,a*a-along*along))
        boneaim(k,'thigh_'+side,'calf_'+side,knee-origin)
        boneaim(k,'calf_'+side,'foot_'+side,target-world[lower,:3,3])
        setworld(k,foot,R.from_matrix(rest[0,foot,:3,:3]));update(k)
        setworld(k,names['ball_'+side],R.from_matrix(rest[0,names['ball_'+side],:3,:3]));update(k)
clip='Video_Squat_DVIDS_Once_v1';blob=pack(g,baked={'name':clip,'times':times,'rotations':rot,'translations':trans})
asset=OUT/'video-squat-dvids-v1.glb';asset.write_bytes(blob)
(OUT/'raw-sequence.json.gz').write_bytes(gzip.compress(raw,mtime=0))
for file in ['dvids-squat-source.json','dvids-copyright.html','dvids-source.html']:
    shutil.copyfile(ROOT/'evidence/real-video-pose-v1'/file,OUT/file)
np.savez_compressed(OUT/'processed.npz',times=times,rawWorld=pos,confidence=confidence,filteredCanonical=points,rootTargets=np.array(rootTargets),rotations=np.array(rot),translations=np.array(trans))
export=GLB(blob);ew,_,_=export.evaluate(clip,times);fr={}
for side in ['l','r']:
    skin=export.skin(ew,export.foot_surfaces()[side]);ankle=ew[:,names['foot_'+side],:3,3]
    fr[side]={'allFootVerticesYRange': [float(skin[:,:,1].min()),float(skin[:,:,1].max())], 'lowestFootVertexYRange':[float(skin[:,:,1].min(axis=1).min()),float(skin[:,:,1].min(axis=1).max())], 'ankleTargetErrorMax':float(np.linalg.norm(ankle-feet[side],axis=1).max()),'footVertexSingleFrameTravelMax':float(np.linalg.norm(np.diff(skin,axis=0),axis=2).max())}
entry={'id':'video-squat-dvids-v1','file':asset.name,'sha256':sha(blob),'clip':clip,'duration':float(times[-1]),'playback':'once-then-idle','rootPolicy':'local-displacement','rootTranslationOwner':'clip hips only; planted-foot reconstruction, no path locomotion','heldPropsAllowed':False,'space':{'kind':'local-footprint','radiusSourceM':.9,'scaleBy':'target/sourceRestHipRatio','navigationAllowedDuringPlayback':False},'origin':'DVIDS Body Weight Squat 15.015–22.989633s; MediaPipe predicted 33 points; explicitly processed offline, not measured mocap or dance acceptance','sourceQAOnly':True}
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
report={'status':'offline-candidate-awaits-game-and-visual-validation','sequenceSha256':sha(raw),'skeletonSha256':sha(source),'assetSha256':sha(blob),'frames':n,'duration':float(times[-1]),'timestampMaxFloat32Error':float(np.max(abs(times.astype(np.float32)-times))),'lowConfidenceSamples':int(low.sum()),'lowConfidenceByLandmark':dict(zip(d['metadata']['pose_names'],low.sum(axis=0).tolist())),'hipYRange': [float(ew[:,names['pelvis'],1,3].min()),float(ew[:,names['pelvis'],1,3].max())],'maxReachExcess':max(reach),'feet':fr,'allFinite':bool(np.isfinite(ew).all()),'maxBonePositionRoundtripError':float(np.max(np.abs(ew[:,names['pelvis'],:3,3]-rootTargets))),'axisBasisColumns':basis.tolist(),'rules':{'confidenceThreshold':.5,'filter':'symmetric Gaussian sigma1 frame truncate2; coordinates only; original PTS retained','root':'mean fixed-length hip-to-ankle chains; fixed support ankles; lateral hip0; forward/back and vertical retained','missingDetail':'hand/finger/head reference idle, no inferred face/gesture; no axial limb twist measurement','globalTravel':'none available; stationary squat assumption from observed video'}}
(OUT/'conversion-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
