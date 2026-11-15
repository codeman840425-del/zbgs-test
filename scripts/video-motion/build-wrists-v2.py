"""Bounded v2: image-matched Hands palm frames, explicit neutral fallback.
Only UAL hand_l/r rotation tracks change. No hand swap by category label.
"""
import pathlib,json,gzip,hashlib,itertools
import numpy as np
from scipy.spatial.transform import Rotation as R
from glb_source import GLB
from glb_pack import pack
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/video-motion-v1';OUT=ROOT/'assets-source/video-motion-v2';OUT.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=(BASE/'video-squat-dvids-v1.glb').read_bytes();assert sha(blob)=='c459ea7a1a5a8f89d162143c80e53843e7cdd19db97e87f8c33c5da6fc8a8845'
g=GLB(blob);raw=gzip.decompress((BASE/'raw-sequence.json.gz').read_bytes());seq=json.loads(raw);fs=seq['frames'];times=np.array([f['clip_seconds']for f in fs]);world,rot,trans=g.evaluate('Video_Squat_DVIDS_Once_v1',times);rest,_,_=g.evaluate(None,np.array([0.]));basis=np.array(json.loads((BASE/'conversion-report.json').read_text())['axisBasisColumns'])
# Copy original stored channels instead of resampling float32 keys at double
# precision PTS. This keeps all unrelated channel values byte-equivalent.
originalAnimation=g.animation('Video_Squat_DVIDS_Once_v1')
for ch in originalAnimation['channels']:
    path=ch['target']['path'];node=ch['target']['node'];sam=originalAnimation['samplers'][ch['sampler']]
    if path=='rotation':rot[node]=g.acc(sam['output']).astype(float).copy()
    elif path=='translation':trans[node]=g.acc(sam['output']).astype(float).copy()
cfg={'schema':'video-wrist-adapter-v2','wristMatchMaximumPixels':25.,'wristMatchAmbiguityPixels':10.,'poseWristMinimumConfidence':.5,'handednessMinimumClassification':.8,'worldXYImageDirectionMaximumDegrees':45.,'maximumFlexionDegrees':65.,'temporalQuaternionFilterWeights':[1,2,3,2,1],'fallback':'neutral wrist aligned with actual v1 forearm; source-rest palm twist transported from rest forearm, no reference Idle local hand rotation','sourceFrameAxes':'Hands predicted world camera axes -> [x,-y,-z] -> same fixed v1 canonical yaw','fingers':'v1 reference finger rotations retained; fist/open-hand recognition not implemented'}
unit=lambda x:x/max(np.linalg.norm(x),1e-12)
def align(a,b):
    a=unit(a);b=unit(b);v=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
    if np.linalg.norm(v)<1e-8:raise ValueError('antipodal neutral arm')
    return R.from_quat(v/np.linalg.norm(v))
def frame(forward,across):
    y=unit(forward);x=unit(across-y*(across@y));z=unit(np.cross(x,y));return np.column_stack([x,y,z])
def deg(a,b):return float(np.rad2deg(np.arccos(np.clip(unit(a)@unit(b),-1,1))))
records=[];candidates={s:[]for s in ['l','r']};neutrals={s:[]for s in ['l','r']}
for k,f in enumerate(fs):
    pose=f['poses'][0];wr=np.array([[pose['normalized'][i][c]for c in ['x','y']]for i in [15,16]])*[1024,576]
    hands=f['hands'];hw=np.array([[h['normalized'][0][c]for c in ['x','y']]for h in hands])*[1024,576]
    costs=np.linalg.norm(hw[:,None,:]-wr[None,:,:],axis=2)
    assignments=min(itertools.permutations(range(2),len(hands)),key=lambda a:sum(costs[j,s]for j,s in enumerate(a)))
    row={'index':k,'sourceSeconds':f['source_seconds'],'pts':f['pts'],'left':{},'right':{}}
    for side,si,pi in [('l',0,15),('r',1,16)]:
        handId=g.byname['hand_'+side];foreId=g.byname['lowerarm_'+side]
        restForward=rest[0,g.byname['middle_01_'+side],:3,3]-rest[0,handId,:3,3]
        restAcross=rest[0,g.byname['index_01_'+side],:3,3]-rest[0,g.byname['pinky_01_'+side],:3,3]
        restFrame=frame(restForward,restAcross);restFore=rest[0,handId,:3,3]-rest[0,foreId,:3,3];fore=world[k,handId,:3,3]-world[k,foreId,:3,3]
        transported=align(restFore,fore);neutralFrame=frame(fore,transported.apply(restAcross));neutral=R.from_matrix(neutralFrame@restFrame.T@rest[0,handId,:3,:3]);neutrals[side].append(neutral.as_quat());q=neutral
        rec={'mode':'neutral-fallback','reasons':[],'perPointConfidence':'not supplied by Hands API','poseWristConfidence':min(pose['normalized'][pi]['visibility'],pose['normalized'][pi]['presence'])}
        match=next((j for j,s in enumerate(assignments)if s==si),None)
        if match is None:rec['reasons'].append('no uniquely assigned hand')
        else:
            h=hands[match];rec.update({'handArrayIndex':match,'handedness':h['handedness'],'wristPixelDistance':float(costs[match,si]),'otherWristPixelDistance':float(costs[match,1-si])})
            if costs[match,si]>cfg['wristMatchMaximumPixels']:rec['reasons'].append('wrist image distance')
            if costs[match,1-si]-costs[match,si]<cfg['wristMatchAmbiguityPixels']:rec['reasons'].append('ambiguous image wrist')
            if rec['poseWristConfidence']<.5:rec['reasons'].append('low pose wrist visibility/presence')
            if h['handedness'][0]['score']<.8:rec['reasons'].append('low classification score (not point confidence)')
            hp=np.array([[p[c]for c in ['x','y','z']]for p in h['world_meters_predicted']]);hn=np.array([[p[c]for c in ['x','y']]for p in h['normalized']])*[1024,576]
            proj=deg(hp[9,:2]-hp[0,:2],hn[9]-hn[0]);rec['worldXYvsImageDirectionDeg']=proj
            if proj>45:rec['reasons'].append('world/image direction disagreement')
            pp=(hp*[1,-1,-1])@basis;fw=pp[9]-pp[0];across=pp[5]-pp[17];rec['predictedPalmLengthMetres']=float(np.linalg.norm(fw));rec['predictedPalmWidthMetres']=float(np.linalg.norm(across));rec['rawFlexionDeg']=deg(fw,fore)
            if np.linalg.norm(np.cross(unit(fw),unit(across)))<.2:rec['reasons'].append('degenerate palm frame')
            if not(.025<np.linalg.norm(fw)<.16):rec['reasons'].append('implausible predicted palm scale')
            if rec['rawFlexionDeg']>65:rec['reasons'].append('predicted wrist flexion exceeds declared bound')
            if not rec['reasons']:q=R.from_matrix(frame(fw,across)@restFrame.T@rest[0,handId,:3,:3]);rec['mode']='matched-hands-model-prediction'
        candidates[side].append(q.as_quat());row['left'if si==0 else'right']=rec
    records.append(row)
# Symmetric quaternion mean: includes fallback samples and is explicitly
# recorded. No time rescaling or cross-arm copying. Not raw observation.
for side,key in [('l','left'),('r','right')]:
    qs=np.array(candidates[side]);weights=np.array(cfg['temporalQuaternionFilterWeights'],float)
    for k in range(len(times)):
        ix=np.clip(np.arange(k-2,k+3),0,len(times)-1);samples=qs[ix].copy();samples[(samples@qs[k])<0]*=-1;q=R.from_quat(np.sum(samples*weights[:,None],axis=0))
        i=g.byname['hand_'+side];parent=g.parents[i];rot[i][k]=(R.from_matrix(world[k,parent,:3,:3]).inv()*q).as_quat()
        records[k][key]['filterSourceIndices']=ix.tolist();records[k][key]['filterIncludesFallback']=any(records[z][key]['mode']=='neutral-fallback'for z in ix)
clip='Video_Squat_DVIDS_Wrists_Once_v2';new=pack(g,baked={'name':clip,'times':times,'rotations':rot,'translations':trans});name='video-squat-dvids-wrists-v2.glb';(OUT/name).write_bytes(new)
ng=GLB(new);nw,nr,nt=ng.evaluate(clip,times);ow,orr,ott=g.evaluate('Video_Squat_DVIDS_Once_v1',times)
handIds={g.byname['hand_l'],g.byname['hand_r']};unchanged=[i for i in range(len(g.nodes))if i not in handIds]
localError=max(float(np.max(abs(nr[i]-orr[i])))for i in unchanged);translationError=max(float(np.max(abs(nt[i]-ott[i])))for i in range(len(g.nodes)))
report={'status':'isolated wrist candidate, not game acceptance','baseV1Sha256':sha(blob),'sha256':sha(new),'clip':clip,'duration':float(times[-1]),'frames':len(times),'unchangedNonHandLocalQuaternionMaxError':localError,'unchangedAllLocalTranslationMaxError':translationError,'bodyWorldMaxError':float(np.max(abs(nw[:,[g.byname[b]for b in ['pelvis','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','foot_l','foot_r']],:3,3]-ow[:,[g.byname[b]for b in ['pelvis','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','foot_l','foot_r']],:3,3]))),'hands':{}}
newAnimation=ng.animation(clip);channelChecks=[]
for old,newch in zip(originalAnimation['channels'],newAnimation['channels']):
    assert old['target']==newch['target']
    if old['target']['node']in handIds and old['target']['path']=='rotation':continue
    a=g.acc(originalAnimation['samplers'][old['sampler']]['output']);b=ng.acc(newAnimation['samplers'][newch['sampler']]['output']);channelChecks.append(bool(np.array_equal(a,b)))
report['unchangedOtherChannelValuesExact']=all(channelChecks);report['checkedUnchangedChannels']=len(channelChecks);assert all(channelChecks)
for s,key in [('l','left'),('r','right')]:
    i=g.byname['hand_'+s];qs=R.from_matrix(nw[:,i,:3,:3]);delta=(qs[:-1].inv()*qs[1:]).magnitude();report['hands'][s]={'matchedPredictionFrames':sum(r[key]['mode']=='matched-hands-model-prediction'for r in records),'fallbackFrames':sum(r[key]['mode']=='neutral-fallback'for r in records),'maximumFrameAngleDeg':float(np.rad2deg(delta.max())),'p95FrameAngleDeg':float(np.rad2deg(np.quantile(delta,.95))),'trough':records[95][key]}
assert localError<1e-6 and translationError<1e-6 and report['bodyWorldMaxError']<1e-6
for fn,obj in [('config.json',cfg),('frame-provenance.json',records),('report.json',report)]: (OUT/fn).write_text(json.dumps(obj,indent=2),encoding='utf-8')
entry=json.loads((BASE/'dance-imports.entry.json').read_text());entry.update({'id':'video-squat-dvids-wrists-v2','file':name,'sha256':sha(new),'clip':clip,'origin':'Same DVIDS squat PTS/body as v1; image wrist-matched independent Hands palm orientation plus declared neutral fallback; not measured mocap'})
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
