"""One bounded 3s body/root/contact study; no 720-frame animation export.
World depth is uncalibrated. Two-frame ambiguity repair is explicit, not truth.
"""
import pathlib,json,gzip,hashlib,argparse,numpy as np
from scipy.ndimage import gaussian_filter1d
args=argparse.ArgumentParser();args.add_argument('--depth',choices=['reflect','bridge'],default='reflect');args=args.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/('assets-source/video-dance-v1/turn-study'if args.depth=='reflect'else'assets-source/video-dance-v1/turn-depth-bridge-study');OUT.mkdir(parents=True,exist_ok=True)
rawBytes=gzip.decompress((ROOT/'evidence/dance-video-pose-v1/sequence.raw.json.gz').read_bytes());raw=json.loads(rawBytes);frames=raw['frames'];inds=np.arange(138,211);times=np.array([frames[i]['source_seconds']for i in inds]);n=len(inds)
world=np.array([[[p[c]for c in ['x','y','z']]for p in frames[i]['poses'][0]['world_meters_predicted']]for i in inds]);image=np.array([[[p[c]for c in ['x','y']]for p in frames[i]['poses'][0]['normalized']]for i in inds])*[1280,720];confidence=np.array([[min(p['visibility'],p['presence'])for p in frames[i]['poses'][0]['normalized']]for i in inds])
pair=[(1,4),(2,5),(3,6),(7,8),(9,10)]+[(i,i+1)for i in range(11,33,2)];perm=np.arange(33)
for a,b in pair:perm[a],perm[b]=b,a
corrected=world.copy();xy=image.copy();conf=confidence.copy();provenance=[]
for k,i in enumerate(inds):
 repaired=i in [172,173]
 if repaired:corrected[k]=world[k,perm];corrected[k,:,2]*=-1;xy[k]=image[k,perm];conf[k]=confidence[k,perm]
 provenance.append({'sourceFrameIndex':int(i),'pts':frames[i]['pts'],'seconds':float(times[k]),'bodyPointSource':'model-prediction','labelMapping':'bilateral-swap'if repaired else'identity','predictedDepth':'reflected hypothesis'if repaired else'raw','reason':'Two-frame front/back ambiguity between visually continuous back-view171 and174; explicitly inferred'if repaired else None,'lowConfidenceIndices':np.flatnonzero(conf[k]<.5).tolist()})
if args.depth=='bridge':
 a=int(np.flatnonzero(inds==171)[0]);b=int(np.flatnonzero(inds==174)[0])
 for k in [a+1,a+2]:
  fraction=(times[k]-times[a])/(times[b]-times[a]);corrected[k,:,2]=(1-fraction)*world[a,:,2]+fraction*world[b,:,2]
  provenance[k]['predictedDepth']='imputed from frames171/174, original PTS linear gap fill';provenance[k]['depthBridgeEndpoints']=[171,174]
canonical=corrected*[1,-1,-1];rawCanonical=world*[1,-1,-1]
# Constant fixed camera axes; do not rotate every frame into a fixed facing.
smoothed=gaussian_filter1d(canonical,1,axis=0,mode='nearest',truncate=2)
def heading(p):
 lateral=(p[:,11]-p[:,12])+(p[:,23]-p[:,24]);forward=np.cross(lateral,[0.,1.,0.]);return np.unwrap(np.arctan2(forward[:,0],forward[:,2]))
yawRaw=heading(rawCanonical);yaw=heading(canonical);yawSmooth=heading(smoothed)
hipXY=(xy[:,23]+xy[:,24])/2;shoulderXY=(xy[:,11]+xy[:,12])/2
torsoMetres=np.median(np.linalg.norm((canonical[:,11]+canonical[:,12]-canonical[:,23]-canonical[:,24])/2,axis=1));torsoPixels=np.median(np.linalg.norm(shoulderXY-hipXY,axis=1));pixelsPerMetre=float(torsoPixels/torsoMetres)
contact={};footImage={};footRelative={};legLength=float(np.median(np.concatenate([np.linalg.norm(canonical[:,k]-canonical[:,h],axis=1)+np.linalg.norm(canonical[:,a]-canonical[:,k],axis=1)for h,k,a in [(23,25,27),(24,26,28)]])))
for side,ids in [('left',[27,29,31]),('right',[28,30,32])]:
 fi=xy[:,ids].mean(axis=1);fr=smoothed[:,ids].mean(axis=1);footImage[side]=fi;footRelative[side]=fr
 speed=np.linalg.norm(np.gradient(fi,times,axis=0),axis=1)/pixelsPerMetre
 lowest=np.minimum(smoothed[:,[27,29,31],1].min(axis=1),smoothed[:,[28,30,32],1].min(axis=1));low=smoothed[:,ids,1].min(axis=1)
 candidate=(speed<.18)&((low-lowest)<.04)&(conf[:,ids].min(axis=1)>=.5)
 stable=candidate.copy()
 for k in range(n):stable[k]=candidate[max(0,k-1):min(n,k+2)].all()
 contact[side]={'screenSpeedProxyMetresPerSecond':speed,'heightAboveLowestPredictedFoot':low-lowest,'candidate':candidate,'stable':stable}
# Root X follows hip image motion in a fixed weak-perspective scale. Root Y is
# floor alignment only when a support candidate exists. Root Z is inferred by
# support-foot continuity and carried when no support is established; not depth.
root=np.zeros((n,3));root[:,0]=(hipXY[:,0]-hipXY[0,0])/pixelsPerMetre
anchors={};states=[];lastY=-min(smoothed[0,[27,28,29,30,31,32],1]);lastZ=0.
for k in range(n):
 supports=[s for s in ['left','right']if contact[s]['stable'][k]]
 zCandidates=[];yCandidates=[]
 for s in supports:
  if k==0 or not contact[s]['stable'][k-1]:anchors[s]=footRelative[s][k]+np.array([root[k,0],lastY,lastZ])
  zCandidates.append(anchors[s][2]-footRelative[s][k,2]);ids=[27,29,31]if s=='left'else[28,30,32];yCandidates.append(-float(smoothed[k,ids,1].min()))
 if supports:lastY=float(np.mean(yCandidates));lastZ=float(np.mean(zCandidates))
 root[k,1]=lastY;root[k,2]=lastZ
 states.append({'frame':int(inds[k]),'seconds':float(times[k]),'left':'support-inferred'if'left'in supports else('swing-or-uncertain'),'right':'support-inferred'if'right'in supports else('swing-or-uncertain'),'rootX':'weak-perspective image displacement estimate','rootY':'predicted-foot floor estimate'if supports else'last support height held (unknown)','rootZ':'support continuity estimate'if supports else'held (unknown)','rootXYZ':root[k].tolist()})
before=np.linalg.norm(np.diff(rawCanonical,axis=0),axis=2);after=np.linalg.norm(np.diff(canonical,axis=0),axis=2);a=int(np.flatnonzero(inds==171)[0]);b=a+1
report={'schema':'dance-turn-study-v1','status':'inferred short-segment candidate, not mocap/animation acceptance','rawSequenceSha256':hashlib.sha256(rawBytes).hexdigest(),'sourceFrameRange':[138,210],'seconds':[float(times[0]),float(times[-1])],'frameCount':n,'changedSourceFrames':[172,173],'rawHeadingDeg':np.rad2deg(yawRaw).tolist(),'correctedHeadingDeg':np.rad2deg(yaw).tolist(),'smoothedHeadingDeg':np.rad2deg(yawSmooth).tolist(),'critical171to172':{'rawNoseStepM':float(before[a,0]),'candidateNoseStepM':float(after[a,0]),'rawAll33MaxStepM':float(before[a].max()),'candidateAll33MaxStepM':float(after[a].max()),'rawHeadingStepDeg':float(np.rad2deg(yawRaw[b]-yawRaw[a])),'candidateHeadingStepDeg':float(np.rad2deg(yaw[b]-yaw[a]))},'maximumWholeSegmentStepM':{'raw':float(before.max()),'candidate':float(after.max())},'headingNetChangeDeg':float(np.rad2deg(yaw[-1]-yaw[0])),'rootRangeMinMax':[root.min(axis=0).tolist(),root.max(axis=0).tolist()],'rootMaxFrameStepM':float(np.linalg.norm(np.diff(root,axis=0),axis=1).max()),'scale':{'method':'median predicted torso metres / image torso pixels, weak-perspective; not calibrated camera','pixelsPerMetre':pixelsPerMetre,'predictedLegLengthM':legLength},'contacts':{s:{'supportFrames':int(c['stable'].sum()),'thresholds':{'imageSpeedProxyMps':.18,'relativeFootHeightM':.04,'poseConfidence':.5},'notMeasured':True}for s,c in contact.items()},'unknownSupportFrames':sum(s['left']!='support-inferred'and s['right']!='support-inferred'for s in states),'limitations':['Two-frame depth reflection is a bounded ambiguity hypothesis supported by adjacent images, not recovered metric depth.','No force/ground camera calibration; support labels remain inferred. Swing-or-uncertain does not prove flight.','Root forward displacement cannot be observed metrically from hip-centered points; support continuity introduces drift and transitions.','No foot locking applied to skeleton points; this stage diagnoses root/contact before target IK.','Wrist/finger stages not used; no whole720-frame export.']}
report['depthMethod']=args.depth
if args.depth=='bridge':report['limitations'][0]='Two-frame depth is imputed from171/174 at original PTS; endpoint reliability is only a continuity hypothesis, not recovered metric depth.'
mx=np.unravel_index(after.argmax(),after.shape);report['largestCandidateStep']={'fromFrame':int(inds[mx[0]]),'toFrame':int(inds[mx[0]+1]),'landmark':raw['metadata']['pose_names'][mx[1]],'distanceMetres':float(after[mx]),'endpointConfidence':[float(conf[mx[0],mx[1]]),float(conf[mx[0]+1,mx[1]])]}
for file,obj in [('report.json',report),('frame-provenance.json',provenance),('root-contact-states.json',states)]: (OUT/file).write_text(json.dumps(obj,indent=2),encoding='utf-8')
np.savez_compressed(OUT/'study.npz',indices=inds,times=times,rawCanonical=rawCanonical,correctedCanonical=canonical,filteredCanonical=smoothed,imageRaw=image,imageCorrected=xy,root=root,yaw=yaw,yawRaw=yawRaw,confidence=conf,leftSupport=contact['left']['stable'],rightSupport=contact['right']['stable'])
print(json.dumps({k:v for k,v in report.items()if 'Heading'not in k},indent=2))
