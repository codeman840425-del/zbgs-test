from pathlib import Path
import hashlib,json
import numpy as np
from scipy.spatial.transform import Rotation as R,Slerp
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-forefoot-v4'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen={}
for version,folder in [('v2','video-dance-target-v2'),('v3','video-dance-support-v3')]:
 m=read(ROOT/f'assets-source/{folder}/manifest.json')
 for name,h in m['files'].items():frozen[name]=sha(ROOT/name)==(h if isinstance(h,str) else h['sha256'])
assert all(frozen.values())
fig,axes=plt.subplots(2,2,figsize=(13,7),sharex=True);reports=[]
for bi,body in enumerate(('female','male')):
 d=read(OUT/f'{body}-forefoot-report.json');g=read(OUT/f'{body}-actual-vrm-ground-check.json');base=read(ROOT/f'assets-source/video-dance-support-v3/{body}-cleanup-report.json');oldG=read(ROOT/f'assets-source/video-dance-support-v3/{body}-actual-vrm-ground-check.json');rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');asset=read(ROOT/f'assets-source/video-dance-support-v3/{body}-dance-support-v3.json')
 sampleTimes=np.array([x['time'] for x in g['dense721']]);trackTimes=np.array(d['trackTimes']);local={tr['name'].split('.')[0]:Slerp(trackTimes,R.from_quat(np.array(tr['values']).reshape(73,4)))(sampleTimes) for tr in asset['clip']['tracks'] if tr['name'].endswith('.quaternion')}
 bones=rig['normalizedBones'];rootParent=R.from_matrix(np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T[:3,:3]);wr={}
 def getwr(n):
  if n not in wr:
   p=bones[n]['parentSemantic'];wr[n]=(getwr(p) if p else rootParent)*local[n]
  return wr[n]
 rows=[];speeds={}
 for side in ('left','right'):
  nr=R.from_quat([x['footWorldQuaternions'][side] for x in g['dense721']]);br=getwr(side+'Foot');delta=nr*br.inv();rate=np.rad2deg((nr[1:]*nr[:-1].inv()).magnitude())/np.diff(sampleTimes);addRate=np.rad2deg((delta[1:]*delta[:-1].inv()).magnitude())/np.diff(sampleTimes)
  baseRate=np.rad2deg((br[1:]*br[:-1].inv()).magnitude())/np.diff(sampleTimes)
  speeds[side]={'maximumWorldAngularSpeedDegPerSecond':float(rate.max()),'maximumV3WorldAngularSpeedDegPerSecond':float(baseRate.max()),'maximumAdditionalRotationSpeedVsV3DegPerSecond':float(addRate.max()),'additionalRotationSpeedMaxTime':float(sampleTimes[int(addRate.argmax())]),'sourceKeyRollCorrectionMaximumStepDeg':d['sides'][side]['maxCorrectionStepDeg'],'sourceKeyRollCorrectionMaximumSecondDifferenceDeg':d['sides'][side]['maxCorrectionSecondDifferenceDeg']}
 for row,geom,oldgeom in zip(base['rows'],g['sourceRows'],oldG['sourceRows']):
  frame=row['sourceFrame']
  for side in ('left','right'):
   if row['feet'][side]['supportHypothesis']:
    forefoot=(side=='left' and 153<=frame<=164) or (side=='right' and 204<=frame<=205)
    new=geom['feet'][side];old=oldgeom['feet'][side]
    rows.append({'sourceFrame':frame,'side':side,'label':('manual_forefoot_refinement' if side=='right' and forefoot else row['feet'][side]['observation']),'forefootGeometryEnforced':forefoot,'beforeRuntimeLiftHeight':new['toeSoftMinY'] if forefoot else new['minimumY'],'afterRuntimeLiftHeight':new['afterRuntimeLiftToeSoftMinY'] if forefoot else new['afterRuntimeLiftMinimumY'],'v3AfterRuntimeLiftHeight':old['afterRuntimeLiftToeSoftMinY'] if forefoot else old['afterRuntimeLiftMinimumY']})
 denseForefoot=[]
 for x in g['dense721']:
  frame=138+x['time']/(1001/24000)
  for side,lo,hi in [('left',153,164),('right',204,205)]:
   if lo<=frame<=hi:denseForefoot.append({'sourceFrameFraction':frame,'side':side,'toeSoftMinAfterLift':x['feet'][side]['toeSoftMinY']+g['runtimeGroundLift']})
 worst=max(rows,key=lambda x:abs(x['afterRuntimeLiftHeight']));knownmax=abs(worst['afterRuntimeLiftHeight'])
 failures=d['preliminaryFailures'].copy()
 if knownmax>.010:failures.append('all known supports still exceed10mm: worst '+str(worst['sourceFrame'])+' '+worst['side'])
 if g['minimumAfterRuntimeLiftDense721']<-.002:failures.append('dense721 post-lift floor penetration exceeds2mm')
 report={'body':body,'frozenV2V3Unchanged':True,'accepted':False,'coordinateReplayPassed':g['coordinateReplayPassed'],'runtimeGroundLift':g['runtimeGroundLift'],'invariants':d['invariants'],'allKnownSupportMaximumAfterLift':knownmax,'worstKnownSupport':worst,'enforcedForefootSourceKeyMaxAfterLift':max(abs(x['afterRuntimeLiftHeight']) for x in rows if x['forefootGeometryEnforced']),'enforcedForefootDenseMaxAfterLift':max(abs(x['toeSoftMinAfterLift']) for x in denseForefoot),'minimumAfterRuntimeLiftDense721':g['minimumAfterRuntimeLiftDense721'],'angularData':speeds,'allKnownSupportRows':rows,'denseForefootSamples':denseForefoot,'failures':failures,'scope':'Offline actual VRM only; no game build/recording or visual acceptance. Only two foot tracks change. Unknown transitions stay unlabelled.'}
 reports.append(report)
 ax=axes[bi,0]
 for side,color in [('left','#1769aa'),('right','#d76c18')]:
  ax.plot(range(138,211),d['sides'][side]['anglesDeg'],label=side,color=color)
 ax.set_ylabel('Added toe-down pitch (deg)');ax.set_title(body+' event-authored roll');ax.legend();ax.grid(alpha=.2)
 ax=axes[bi,1]
 for key,color in [('v3AfterRuntimeLiftHeight','#8f8f8f'),('afterRuntimeLiftHeight','#b13f3f')]:
  ax.scatter([x['sourceFrame'] for x in rows],[x[key]*1000 for x in rows],s=14,label=key,color=color)
 ax.axhline(10,color='black',linestyle='--',lw=.7);ax.set_ylabel('Known support residual after lift (mm)');ax.set_title(body+' all manually known supports');ax.legend(fontsize=7);ax.grid(alpha=.2)
 for ax in axes[bi]:
  for a,b in [(141,144),(207,210)]:ax.axvspan(a-.5,b+.5,color='#98d6a0',alpha=.3)
  if bi==1:ax.set_xlabel('Original source frame')
fig.suptitle('Single event roll v4: 205 forefoot improved; whole clip still NOT ACCEPTED\nGreen = original protected flight; no root/leg/ankle or spline changes')
fig.tight_layout();fig.savefig(OUT/'event-roll-comparison.png',dpi=140);plt.close(fig)
(OUT/'acceptance.json').write_text(json.dumps({'frozenChecks':frozen,'results':reports},indent=2),encoding='utf-8')
print(json.dumps([{k:v for k,v in r.items() if k not in ('invariants','allKnownSupportRows','denseForefootSamples')} for r in reports],indent=2))
