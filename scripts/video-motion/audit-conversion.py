"""Read-only v1 root-cause audit. Does not generate a replacement clip."""
import gzip,json,pathlib,hashlib
import numpy as np
from glb_source import GLB
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-motion-v1/audit';OUT.mkdir(exist_ok=True)
d=json.loads(gzip.decompress((OUT.parent/'raw-sequence.json.gz').read_bytes()));p=np.load(OUT.parent/'processed.npz');t=p['times'];basis=np.array(json.loads((OUT.parent/'conversion-report.json').read_text())['axisBasisColumns']);raw=p['rawWorld']*np.array([1,-1,-1]);raw=raw@basis;filtered=p['filteredCanonical'];conf=p['confidence']
g=GLB((OUT.parent/'video-squat-dvids-v1.glb').read_bytes());w,_,_=g.evaluate('Video_Squat_DVIDS_Once_v1',t)
norm=lambda a:a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-12)
angle=lambda a,b:np.rad2deg(np.arccos(np.clip(np.sum(norm(a)*norm(b),axis=-1),-1,1)))
def intervals(mask):
    result=[];start=None
    for i,v in enumerate(np.r_[mask,False]):
        if v and start is None:start=i
        if not v and start is not None:result.append({'firstIndex':start,'lastIndex':i-1,'sourceSeconds':[float(t[start]+15.015),float(t[i-1]+15.015)],'frames':i-start});start=None
    return result
k=int(np.argmin(abs(t+15.015-18.2)));rows={}
for side,a,b,c in [('l',11,13,15),('r',12,14,16)]:
    rows[side]={}
    for label,x,y,b1,b2 in [('upper',a,b,'upperarm','lowerarm'),('lower',b,c,'lowerarm','hand')]:
        u=w[:,g.byname[b2+'_'+side],:3,3]-w[:,g.byname[b1+'_'+side],:3,3];f=filtered[:,y]-filtered[:,x];r=raw[:,y]-raw[:,x];valid=(conf[:,x]>=.5)&(conf[:,y]>=.5)
        xy=np.array([[(z['normalized'][j]['x']*1024,z['normalized'][j]['y']*576)for j in [x,y]]for z in [fr['poses'][0]for fr in d['frames']]]);xy=xy[:,1]-xy[:,0]
        camera=p['rawWorld'][:,y,:2]-p['rawWorld'][:,x,:2]
        rows[side][label]={'maxExportVsFilteredDeg':float(angle(u,f).max()),'maxRawVsFilteredHighConfidenceDeg':float(angle(r,f)[valid].max()),'lowConfidenceIntervals':intervals(~valid),'highConfidence2DvsWorldXYAngleP50P95':np.quantile(angle(xy,camera)[valid],[.5,.95]).tolist(),'trough':{'sourceSeconds':float(t[k]+15.015),'confidence':[float(conf[k,x]),float(conf[k,y])],'normalizedPixelDirection':xy[k].tolist(),'rawCanonicalDirection':r[k].tolist(),'filteredCanonicalDirection':f[k].tolist(),'exportedBoneDirection':u[k].tolist(),'rawVsFilteredDeg':float(angle(r[k],f[k])),'exportVsFilteredDeg':float(angle(u[k],f[k]))}}
# Rest-world FK predicts target ankle width for a rotation-only retarget; hips
# local translation is one shared vector and cancels in left-right subtraction.
rest,_,_=g.evaluate(None,np.array([0.]));rig={'leftUpperLeg':'thigh_l','leftLowerLeg':'calf_l','leftFoot':'foot_l','rightUpperLeg':'thigh_r','rightLowerLeg':'calf_r','rightFoot':'foot_r','hips':'pelvis'}
anchors=json.loads((ROOT/'evidence/mic-mouth-target/source-anchors.json').read_text());bodies={}
for body in anchors['bodies']:
    b=GLB((ROOT/body['source']).read_bytes());bw,_,_=b.evaluate(None,np.array([0.]));hum={h['bone']:h['node']for h in b.j['extensions']['VRM']['humanoid']['humanBones']}
    trace=json.loads(gzip.decompress((ROOT/f"evidence/video-motion-room-5d848494cce5/{body['body']}.trace.json.gz").read_bytes()))
    samples=[]
    for at in [.7,3.1698333333,6.3]:
        tr=min([f for f in trace['frames']if f['mode']=='dance'],key=lambda f:abs(f['motion']['dance']['time']-at));tm=tr['motion']['dance']['time'];sw,_,_=g.evaluate('Video_Squat_DVIDS_Once_v1',np.array([tm]));pred={}
        for side,letter in [('left','l'),('right','r')]:
            hip=bw[0,hum[side+'UpperLeg'],:3,3]-bw[0,hum['hips'],:3,3]
            # VRM0 rest faces -Z; existing loader flips X/Z into room +Z.
            hip=hip*np.array([-1,1,-1]);si=g.byname['pelvis'];val=sw[0,si,:3,:3]@np.linalg.inv(rest[0,si,:3,:3])@hip
            for aa,bb in [('UpperLeg','LowerLeg'),('LowerLeg','Foot')]:
                targetVector=(bw[0,hum[side+bb],:3,3]-bw[0,hum[side+aa],:3,3])*np.array([-1,1,-1]);si=g.byname[rig[side+aa]];val+=sw[0,si,:3,:3]@np.linalg.inv(rest[0,si,:3,:3])@targetVector
            pred[side]=val
        actual=np.array(tr['joints']['leftFoot'])-tr['joints']['rightFoot'];expected=pred['left']-pred['right'];sourceDiff=sw[0,g.byname['foot_l'],:3,3]-sw[0,g.byname['foot_r'],:3,3]
        samples.append({'time':tm,'sourceAnkleDelta':sourceDiff.tolist(),'restGeometryPredictedAnkleDelta':expected.tolist(),'actualGameAnkleDelta':actual.tolist(),'actualMinusPredictionMetres':float(np.linalg.norm(actual-expected)),'hipCorrection':tr['motion']['hipCorrection'],'danceMix':tr['motion']['danceMix']})
    bodies[body['body']]={'sourceHipWidth':float(np.linalg.norm(rest[0,g.byname['thigh_l'],:3,3]-rest[0,g.byname['thigh_r'],:3,3])),'targetHipWidth':float(np.linalg.norm(bw[0,hum['leftUpperLeg'],:3,3]-bw[0,hum['rightUpperLeg'],:3,3])),'samples':samples}
wrists={}
for side,wr,ix,pi in [('l',15,19,17),('r',16,20,18)]:
    predictedForward=filtered[k,ix]-filtered[k,wr];predictedNormal=np.cross(predictedForward,filtered[k,pi]-filtered[k,wr]);hand=w[k,g.byname['hand_'+side],:3,3];exForward=w[k,g.byname['middle_01_'+side],:3,3]-hand;exNormal=np.cross(w[k,g.byname['index_01_'+side],:3,3]-hand,w[k,g.byname['pinky_01_'+side],:3,3]-hand)
    wrists[side]={'sourceSeconds':float(t[k]+15.015),'confidenceWristIndexPinky':conf[k,[wr,ix,pi]].tolist(),'predictedIndexDirectionVsUALMiddleDeg':float(angle(predictedForward,exForward)),'unorientedPalmPlaneDifferenceDeg':float(np.rad2deg(np.arccos(np.clip(abs(norm(predictedNormal)@norm(exNormal)),0,1)))),'reason':'v1 retains reference hand/finger local rotations. Palm plane/twist is not reconstructed. Pose33 hand landmarks are themselves model predictions, not validated hand capture.'}
report={'schema':'video-motion-conversion-audit-v1','sourceSeconds':float(t[k]+15.015),'arm':rows,'wrists':wrists,'feet':bodies,'projectionCaveat':'World XY vs image direction is not a calibrated reprojection. It only diagnoses gross sign/swap mistakes; cannot establish metric depth accuracy.','basisDeterminant':float(np.linalg.det(basis))}
(OUT/'root-cause.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
