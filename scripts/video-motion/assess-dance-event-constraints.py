"""Read-only geometric/kinematic assessment; exports no motion or tuned candidate."""
from pathlib import Path
import csv,hashlib,json,math
import numpy as np
from scipy.optimize import brentq
from scipy.spatial.transform import Rotation as R
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-event-feasibility-v1';OUT.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
dt=1001/24000;T=2*dt;reports=[]
for body in ('female','male'):
 ground=read(ROOT/f'assets-source/video-dance-ground-decomposition-v1/{body}-decomposition.json')
 table={r['sourceFrame']:r for r in ground['sourceRows']}
 csvrows=list(csv.DictReader((ROOT/f'assets-source/video-dance-ground-decomposition-v1/{body}-per-time.csv').open(encoding='utf-8')))
 row205=next(r for r in csvrows if r['sourceFrame']=='205')
 D=-float(row205['right_rootDeltaYUpperReachBound'])
 y=np.array([table[f]['assetHipsY'] for f in range(200,211)])
 bound={'duration205to207Seconds':T,'fixedLevelFootFullReachMinimumRootLowering205M':D,
 'minimumMeanCorrectionVelocity205to207MPerS':D/T,
 'originalTargetMeanRootVelocity205to207MPerS':(table[207]['assetHipsY']-table[205]['assetHipsY'])/T,
 'correctedMeanRootVelocity205to207NecessaryLowerBoundMPerS':(table[207]['assetHipsY']-table[205]['assetHipsY']+D)/T,
 'correctionPeakAbsoluteAccelerationLowerBoundIfZeroCorrectionVelocityAt207':2*D/T**2,
 'correctionPeakAccelerationLowerBoundIfZeroCorrectionVelocityBoth205And207':4*D/T**2,
 'illustrativeZeroEndVelocityCubic':{'peakCorrectionVelocity':1.5*D/T,'peakCorrectionAcceleration':6*D/T**2},
 'originalTarget207to208RootVelocityMPerS':(table[208]['assetHipsY']-table[207]['assetHipsY'])/dt,
 'totalRootPeakAbsoluteAccelerationLowerBoundIfMatch207to208ForwardVelocity':2*((table[207]['assetHipsY']-table[205]['assetHipsY']+D)/T-(table[208]['assetHipsY']-table[207]['assetHipsY'])/dt)/T,
 'originalTargetRootY200to210M':y.tolist(),
 'boundaryCaveat':'With endpoint positions alone there is no nonzero acceleration lower bound: constant velocity can connect them. First acceleration bound additionally requires zero correction velocity at207 to join unchanged flight C1. Zero correction velocity at205 is illustrative, not required by contact. Pelvis root is not center of mass; raw projected root is not metric truth.'}
 rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');ref=read(ROOT/f'assets-source/video-dance-target-v2/{body}-world-reference.json');bones=rig['normalizedBones'];idx={s:i for i,s in enumerate(ref['names'])};W=np.array(ref['world'][205-138]);rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()}
 vertices=rig['footwear']['skinSamples']['right'];ankle=W[idx['rightFoot'],:3,3].copy()
 forward=(W[idx['rightFoot'],:3,:3]@rest['rightFoot'][:3,:3].T)@np.array([0.,0.,1.]);axis=np.cross([0.,1.,0.],forward);axis/=np.linalg.norm(axis)
 footZ=rig['lengths']['right']['ankleRest'][2]
 regions={kind:[i for i,v in enumerate(vertices) if (v['world'][2]<=footZ+.015 if kind=='heel' else v['world'][2]>=footZ+.015)] for kind in ('heel','toe')}
 patches={kind:[i for i in inds if vertices[i]['world'][1]<min(vertices[j]['world'][1] for j in inds)+.012] for kind,inds in regions.items()}
 def evaluate(theta):
  delta=R.from_rotvec(axis*theta).as_matrix();ww=W.copy()
  for name in ('rightFoot','rightToes'):
   ww[idx[name],:3,:3]=delta@W[idx[name],:3,:3];ww[idx[name],:3,3]=ankle+delta@(W[idx[name],:3,3]-ankle)
  vs=[]
  for v in vertices:
   p=np.zeros(3)
   for inf in v['influences']:
    if inf['weight']>0:
     s=inf['semantic'];p+=inf['weight']*(ww[idx[s]]@np.linalg.inv(rest[s])@np.r_[v['world'],1])[:3]
   vs.append(p)
  vs=np.array(vs);out={'allVertexMinimumY':float(vs[:,1].min())}
  for kind,inds in patches.items():
   ys=vs[inds,1];w=np.exp(-(ys-ys.min())/.001);out[kind+'SoftMinY']=float(ys@w/w.sum());out[kind+'MinimumY']=float(ys.min())
  return out
 a,b=0.,math.radians(60);fa,fb=evaluate(a)['toeMinimumY'],evaluate(b)['toeMinimumY']
 roll={'method':'One scalar geometry root for toe-patch minimumY=0 at source205, bracket0..60deg; not angle scan or motion optimization. Root/ankleXYZ, leg bones and original turn unchanged. Rotate foot/toes rigidly about current ankle lateral axis; retain actual calf skin influence.','atZero':evaluate(0),'bracketEnd':evaluate(b),'axisWorld':axis.tolist(),'ankleWorld':ankle.tolist(),'bracketHasRoot':fa*fb<=0}
 if fa*fb<=0:
  angle=brentq(lambda t:evaluate(t)['toeMinimumY'],a,b,xtol=1e-12)
  roll.update({'toeContactAngleDeg':math.degrees(angle),'atContact':evaluate(angle),'angleRelease205to207MeanDegPerS':math.degrees(angle)/T,'physicalHumanAngleRecovered':False,'limits':['This is a single target-shoe configuration, not a temporal clip, not an acceptance result.','Ankle XZ preserved but rotating shoe changes toe contact XZ; no no-slip anchor assumed.','Level foot fallback is relaxed; heel lift matches qualitative push-off, exact human foot pitch remains unknown.','Does not yet test joint limits, shoes/leg collision or continuity of the whole73frame segment.']})
 reports.append({'body':body,'fixedLevelFootKinematics':bound,'singleConfigurationRollFeasibility':roll})
inputs=[ROOT/'assets-source/video-dance-twist-study-v1/support-observations.json']+[ROOT/f'assets-source/video-dance-support-v3/{b}-dance-support-v3.json' for b in ('female','male')]
result={'schema':'read-only-event-constraint-feasibility.1','noMotionExported':True,'noParameterSweep':True,'inputs':{p.relative_to(ROOT).as_posix():sha(p) for p in inputs},'results':reports}
(OUT/'feasibility.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(reports,indent=2))
