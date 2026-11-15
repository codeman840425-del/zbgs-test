"""Read-only 900-sample proportion/FK audit. No IK, contact inference or output motion."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1';os.environ['MKL_NUM_THREADS']='1'
import argparse,pathlib,json,hashlib,gzip,math,time
import numpy as np
O=pathlib.Path(__file__).resolve().parent
SEM=['hips']+[s+k for s in ['left','right']for k in ['UpperLeg','LowerLeg','Foot','Toes']]
SIDES=['left','right'];CHAINS={s:['hips']+[s+k for k in ['UpperLeg','LowerLeg','Foot','Toes']]for s in SIDES}
def sha(b):return hashlib.sha256(b).hexdigest()
def write(name,data): (O/name).write_text(json.dumps(data,indent=2,allow_nan=False)+'\n',encoding='utf8')
def qmul(a,b):
 x,y,z,w=a;X,Y,Z,W=b;return np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])
def qinv(a):a=np.array(a);return np.r_[-a[:3],a[3]]/np.dot(a,a)
def rot(q,v):q=np.array(q)/np.linalg.norm(q);u=q[:3];v=np.array(v);return v+2*np.cross(u,np.cross(u,v)+q[3]*v)
def matrix(q,p,scale=(1,1,1)):
 m=np.eye(4);m[:3,:3]=np.column_stack([rot(q,np.eye(3)[j])*scale[j]for j in range(3)]);m[:3,3]=p;return m

def prepare(pilot):
 manifest={};raw={}
 names={'source':'source-world-samples.json','report':'retarget-report.json','adapter':'retarget-rokoko.mjs'}
 for b in ['female','male']:
  names[b+'Rig']=f'reference/assets-source/video-target-adaptation-v1/{b}-normalized-rig.json'
  names[b+'Clip']=f'candidate-rokoko-v1/assets/motion/m1c/rokoko-5359146-{b}-v1.motion.json'
 for key,rel in names.items():
  buf=(pilot/rel).read_bytes();manifest[key]={'path':rel,'sha256':sha(buf),'bytes':len(buf)}
  if key!='adapter':raw[key]=json.loads(buf)
 src=raw['source'];bundle={'schema':'rokoko-proportion-audit-input.1','inputFiles':manifest,'source':{'rest':{k:src['rest'][k]for k in SEM},'samples':[{'time':s['time'],'bones':{k:s['bones'][k]for k in SEM}}for s in src['samples']]},'retargetReport':raw['report'],'targets':{}}
 for b in ['female','male']:
  rig=raw[b+'Rig'];clip=raw[b+'Clip'];bundle['targets'][b]={'rig':{k:v for k,v in rig.items()if k in ['body','avatarSha256','basis','metaVersion']},'bones':{k:rig['normalizedBones'][k]for k in SEM},'clipIdentity':{k:v for k,v in clip.items()if k!='clip'},'clip':{'name':clip['clip']['name'],'duration':clip['clip']['duration'],'tracks':[t for t in clip['clip']['tracks']if t['name'].split('.')[0]in SEM]}}
  assert clip['normalizedRigSha256']==manifest[b+'Rig']['sha256']
  assert clip['sourceClipSha256']==raw['report']['sourceSha256']
  assert clip['coordinateSpace']=='three-vrm-3.5.5-normalized-local-absolute'
 buf=json.dumps(bundle,separators=(',',':')).encode();(O/'input-extract.json.gz').write_bytes(gzip.compress(buf,mtime=0));write('input-manifest.json',{'files':manifest,'extractSha256':sha((O/'input-extract.json.gz').read_bytes()),'scope':'Exact selected leg/hips numerical channels from originals; no new motion asset or license grant. No movie/FBX copied. Source at t0 replaced by t1/30 in supplied samples; original reference rest is retained separately.'});return bundle

def stat(a,times):
 a=np.array(a);i=int(np.argmax(a));return {'min':float(a.min()),'median':float(np.median(a)),'p95':float(np.quantile(a,.95)),'rms':float(np.sqrt(np.mean(a*a))),'max':float(a[i]),'maxIndex':i,'maxTime':float(times[i])}
def fk(bones,qs,hip):
 world={}
 for k in SEM:
  bone=bones[k];p=bone['parentSemantic'];parent=world[p]if p else np.array(bone['actualParentWorldMatrix']).reshape(4,4).T
  world[k]=parent@matrix(qs[k],hip if k=='hips'else bone['localPosition'],bone['localScale'])
 return {k:m[:3,3].copy()for k,m in world.items()},world

def audit(d):
 started=time.monotonic();src=d['source'];frames=src['samples'];times=np.array([f['time']for f in frames]);N=len(frames);assert N==900 and np.max(np.abs(times-np.arange(N)/30))<1e-9
 rest={k:np.array(v['p'])for k,v in src['rest'].items()};sq={k:np.array(v['q'])for k,v in src['rest'].items()};SP={k:np.array([f['bones'][k]['p']for f in frames])for k in SEM};SQ={k:np.array([f['bones'][k]['q']for f in frames])for k in SEM}
 report={'schema':'rokoko-proportion-audit.1','inputExtractSha256':sha((O/'input-extract.json.gz').read_bytes()),'sourceRestHipHeightSourceUnits':float(rest['hips'][1]),'sampleCount':N,'times':{'first':float(times[0]),'last':float(times[-1]),'fps':30,'noRetime':True},'source':{},'targets':{},'limits':['All measurements are bone origins/FK. Not actual skinned shoe soles, contact labels, penetration or visual naturalness.','No gameplay groundLift/entryExit blend applied. Current runtime uniform groundLift is external and cannot remove time-varying FK errors.','Original t0 reference frame is not a dance observation: supplied samples0 and1 are held same first valid source pose; final 30s endpoint not included in the900 original-index comparison.','No IK/root correction/foot locking/contactWindows inferred or written.','Uniform comparison is source position scaled by reported hip-height factor and translated to target rest hips. It is a proportional reference, not a target anatomical ground truth.','Source numeric unit is reported as exported units; source trajectory can be read in each target metre scale without assuming FBX units.']}
 trajectories={'times':times.tolist(),'source':{k:v.tolist()for k,v in SP.items()},'targets':{}}
 for s in SIDES:
  chain=CHAINS[s];lens=[float(np.linalg.norm(rest[b]-rest[a]))for a,b in zip(chain,chain[1:])]
  row={'restSegmentsSourceUnits':dict(zip(['hipOffset','thigh','shank','footToToe'],lens)),'thighShankRatio':lens[1]/lens[2],'dynamicSegments':{}}
  for a,b in zip(chain,chain[1:]):row['dynamicSegments'][a+'->'+b]=stat(np.linalg.norm(SP[b]-SP[a],axis=1),times)
  for k in chain[2:]:
   row[k+'StepSourceUnits']=stat(np.linalg.norm(np.diff(SP[k],axis=0),axis=1),times[1:]);row[k+'AccelerationSourceUnitsPerSec2']=stat(np.linalg.norm(np.diff(SP[k],n=2,axis=0),axis=1)*900,times[2:])
  knee=np.degrees(np.arccos(np.clip(np.sum((SP[chain[1]]-SP[chain[2]])*(SP[chain[3]]-SP[chain[2]]),axis=1)/(np.linalg.norm(SP[chain[1]]-SP[chain[2]],axis=1)*np.linalg.norm(SP[chain[3]]-SP[chain[2]],axis=1)),-1,1)))
  row['kneeAngleDegrees']=stat(knee,times);ki=int(np.argmax(np.abs(np.diff(knee))))+1;row['kneeAngleAdjacentMax']={'degrees':float(abs(knee[ki]-knee[ki-1])),'fromDegrees':float(knee[ki-1]),'toDegrees':float(knee[ki]),'fromIndex':ki-1,'toIndex':ki,'fromSeconds':float(times[ki-1]),'toSeconds':float(times[ki])}
  report['source'][s]=row
 for body,t in d['targets'].items():
  bones=t['bones'];tracks={x['name']:x for x in t['clip']['tracks']};factor=bones['hips']['worldPosition'][1]/rest['hips'][1];TP={k:[]for k in SEM};restq={k:bones[k]['localQuaternion']for k in SEM};rp,rm=fk(bones,restq,bones['hips']['localPosition']);restError=max(np.linalg.norm(rp[k]-np.array(bones[k]['worldPosition']))for k in SEM)
  vals={};timesErr=0
  for k,tr in tracks.items():
   timesErr=max(timesErr,float(np.max(np.abs(np.array(tr['times'][:N])-times))));vals[k]=np.array(tr['values']).reshape(-1,3 if k.endswith('.position')else 4)
  assert timesErr<1e-6
  qWorldError=0;rootError=0
  for i in range(N):
   qs={k:vals[k+'.quaternion'][i]for k in SEM};pos,world=fk(bones,qs,vals['hips.position'][i])
   for k in SEM:
    TP[k].append(pos[k]);dq=qmul(SQ[k][i],qinv(sq[k]));expectedQ=qmul(dq,bones[k]['worldQuaternion']);expectedR=matrix(expectedQ,[0,0,0])[:3,:3];qWorldError=max(qWorldError,float(np.max(np.abs(world[k][:3,:3]-expectedR))))
   rootExpected=(SP['hips'][i]-rest['hips'])*factor+rp['hips'];rootError=max(rootError,float(np.linalg.norm(pos['hips']-rootExpected)))
  TP={k:np.array(v)for k,v in TP.items()};REF={k:(SP[k]-rest['hips'])*factor+rp['hips']for k in SEM};out={'avatarSha256':t['rig']['avatarSha256'],'motionSha256':d['inputFiles'][body+'Clip']['sha256'],'hipHeightFactorTargetMetresPerSourceUnit':factor,'restHipHeightM':float(rp['hips'][1]),'restFkMaxErrorM':float(restError),'timeTrackMaxErrorSeconds':timesErr,'rootFormulaMaxErrorM':rootError,'worldRotationMatrixMaxError':qWorldError,'sides':{}}
  for s in SIDES:
   chain=CHAINS[s];rsl=np.array([np.linalg.norm(rest[b]-rest[a])for a,b in zip(chain,chain[1:])])*factor;rtl=np.array([np.linalg.norm(rp[b]-rp[a])for a,b in zip(chain,chain[1:])]);srow={'restSegmentsM':dict(zip(['hipOffset','thigh','shank','footToToe'],rtl.tolist())),'uniformReferenceSegmentsM':dict(zip(['hipOffset','thigh','shank','footToToe'],rsl.tolist())),'segmentTargetOverUniformRatio':dict(zip(['hipOffset','thigh','shank','footToToe'],(rtl/rsl).tolist())),'thighShankRatio':float(rtl[1]/rtl[2]),'hipJointOffsetWorldM':(rp[chain[1]]-rp['hips']).tolist(),'boneMetrics':{}}
   decomposition=np.zeros((N,3))
   for a,b in zip(chain,chain[1:]):
    mismatch=(rp[b]-rp[a])-factor*(rest[b]-rest[a]);decomposition+=np.array([rot(qmul(SQ[a][i],qinv(sq[a])),mismatch)for i in range(N)])
    err=TP[b]-REF[b];delta=np.diff(TP[b],axis=0);refdelta=np.diff(REF[b],axis=0)
    srow['boneMetrics'][b]={'errorM':stat(np.linalg.norm(err,axis=1),times),'errorXYZRangeM':[err.min(axis=0).tolist(),err.max(axis=0).tolist()],'targetYRangeM':[float(TP[b][:,1].min()),float(TP[b][:,1].max())],'uniformReferenceYRangeM':[float(REF[b][:,1].min()),float(REF[b][:,1].max())],'targetAdjacentStepM':stat(np.linalg.norm(delta,axis=1),times[1:]),'uniformReferenceAdjacentStepM':stat(np.linalg.norm(refdelta,axis=1),times[1:]),'stepDifferenceM':stat(np.linalg.norm(delta-refdelta,axis=1),times[1:]),'restVectorMismatchPredictionResidualM':stat(np.linalg.norm(err-decomposition,axis=1),times)}
   out['sides'][s]=srow
  width=np.linalg.norm(TP['leftFoot']-TP['rightFoot'],axis=1);rw=np.linalg.norm(REF['leftFoot']-REF['rightFoot'],axis=1);out['ankleSeparation']={'targetM':stat(width,times),'uniformReferenceM':stat(rw,times),'signedDifferenceRangeM':[float((width-rw).min()),float((width-rw).max())]}
  report['targets'][body]=out;trajectories['targets'][body]={'actualFK':{k:v.tolist()for k,v in TP.items()},'uniformReference':{k:v.tolist()for k,v in REF.items()}}
 report['elapsedSeconds']=time.monotonic()-started;write('report.json',report);(O/'trajectories.json.gz').write_bytes(gzip.compress(json.dumps(trajectories,separators=(',',':')).encode(),mtime=0));print(json.dumps({'seconds':report['elapsedSeconds'],'sourceHip':report['sourceRestHipHeightSourceUnits'],'targets':{b:{'restError':r['restFkMaxErrorM'],'rootError':r['rootFormulaMaxErrorM'],'rotationError':r['worldRotationMatrixMaxError'],'leftLengths':r['sides']['left']['restSegmentsM'],'leftRatios':r['sides']['left']['segmentTargetOverUniformRatio'],'leftFootError':r['sides']['left']['boneMetrics']['leftFoot']['errorM'],'leftFootResidual':r['sides']['left']['boneMetrics']['leftFoot']['restVectorMismatchPredictionResidualM']}for b,r in report['targets'].items()}},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--pilot',type=pathlib.Path);a=p.parse_args();d=prepare(a.pilot)if a.pilot else json.loads(gzip.decompress((O/'input-extract.json.gz').read_bytes()));audit(d)
