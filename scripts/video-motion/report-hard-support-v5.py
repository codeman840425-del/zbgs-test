from pathlib import Path
import hashlib,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-hard-support-v5'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
cfg=read(OUT/'fixed-problem.json');frozen={}
for folder in ('video-dance-support-v3','video-dance-forefoot-v4'):
 for name,h in read(ROOT/f'assets-source/{folder}/manifest.json')['files'].items():frozen[name]=sha(ROOT/name)==(h if isinstance(h,str) else h['sha256'])
assert all(frozen.values())
fig,axes=plt.subplots(2,2,figsize=(13,7));reports=[]
for bi,body in enumerate(('female','male')):
 d=read(OUT/f'{body}-hard-support-report.json');g=read(OUT/f'{body}-actual-vrm-ground-check.json');contact=[]
 for x in g['dense721']:
  f=138+x['time']/(1001/24000)
  for side in ('left','right'):
   if any(a-1e-8<=f<=b+1e-8 for a,b in cfg['supportIntervals'][side]):
    forefoot=any(a-1e-8<=f<=b+1e-8 for a,b in cfg['forefootIntervals'][side]);height=x['feet'][side]['toeRegionMinimumY' if forefoot else 'minimumY']
    contact.append({'sourceFrameFraction':f,'side':side,'forefoot':forefoot,'selectedRegionHeight':height,'afterRuntimeLiftHeight':height+g['runtimeGroundLift']})
 worstContact=max(contact,key=lambda r:abs(r['afterRuntimeLiftHeight']));worstBefore=max(contact,key=lambda r:abs(r['selectedRegionHeight']));worstFloor=min(g['dense721'],key=lambda r:r['afterRuntimeLiftMinY']);worstSource=138+worstFloor['time']/(1001/24000)
 report={'body':body,'accepted':False,'classification':'Hard-contact positions feasible at the fixed solve samples; pose continuity and runtime interpolation fail. No next candidate or game recording.',
 'originalVideoFrames':73,'derivedActionSamplesNotVideoFrames':289,'denseCurveChecks':721,'flightCurveDenseChecks':g['flightCurveDenseSamples'],'coordinateReplayPassed':g['coordinateReplayPassed'],
 'flightCurveMatrixMaxDifference':g['flightCurveMatrixMaxDifference'],'flightCurvePositionErrorM':g['flightCurvePositionMaxErrorM'],'footWorldOrientationDenseMaxDifferenceVsV4Deg':float(np.rad2deg(g['footWorldOrientationDenseMaxDifferenceVsV4Rad'])),
 'hardContactSolveMaximumErrorM':d['allKnownSupportAbsoluteMax'],'hardContactDenseBeforeLiftMaximumErrorM':max(abs(r['selectedRegionHeight']) for r in contact),'worstContactBeforeLift':worstBefore,'hardContactDenseAfterLiftMaximumErrorM':abs(worstContact['afterRuntimeLiftHeight']),'worstContactAfterLift':worstContact,
 'runtimeGroundLift':g['runtimeGroundLift'],'denseMinimumAfterLift':worstFloor['afterRuntimeLiftMinY'],'denseMinimumSourceFrameFraction':worstSource,'originalIntervalLeftLowerLegMaximumDeg':d['localMaxOriginalIntervalStepDeg']['leftLowerLeg'],
 'rootExtraLoweringMaximumM':-min(x['rootDeltaY'] for x in d['rows']),'allKnownSupportDenseRows':contact,
 'failures':['170->171 knee pose discontinuity far exceeds45deg original-interval gate','170.6 unknown interval violates hard nonpenetration after actual runtime calibration','known-support interpolation before lift also exceeds1mm tolerance','runtime whole-clip lift shifts known hard supports above1mm tolerance'],
 'limits':['289 samples are fixed action-solve interpolation, no additional source video information.','World matrices match original flight at62 dense times; finite checks are not an analytic proof at every real time.','The root/ankle position QP does not constrain knee-plane temporal state or joint angular change.','Minimum curvature plus very weak displacement regularization allows unjustified147mm root sag; this objective choice is not a human-motion measurement.','No solver retry, label/weight/node changes, game build, video recording or v6.']}
 reports.append(report)
 ax=axes[bi,0];ax.plot([r['sourceFrameFraction'] for r in d['rows']],[r['rootDeltaY']*1000 for r in d['rows']],color='#b03742');ax.set_title(body+' root correction relative to frozen v4');ax.set_ylabel('Root Y correction (mm)');ax.grid(alpha=.2)
 ax=axes[bi,1];ax.plot([138+r['time']/(1001/24000) for r in g['dense721']],[r['afterRuntimeLiftMinY']*1000 for r in g['dense721']],color='#315c9c',label='dense721 min shoe');ax.axhline(0,color='black',lw=.7);ax.scatter([worstSource],[worstFloor['afterRuntimeLiftMinY']*1000],color='#b03742',s=40);ax.set_title(body+' actual VRM + runtime lift');ax.set_ylabel('Lowest shoe point (mm)');ax.grid(alpha=.2);ax.legend()
 for ax in axes[bi]:
  for a,b in ((141,144),(207,210)):ax.axvspan(a-.5,b+.5,color='#98d6a0',alpha=.3)
  if bi==1:ax.set_xlabel('Original source frame / derived action sub-time')
fig.suptitle('Whole-segment hard-support v5 FAILED: knee jump + root sag + interpolation penetration\nGreen = original protected flight; no game playback or full30s expansion')
fig.tight_layout();fig.savefig(OUT/'failed-hard-support-overview.png',dpi=140);plt.close(fig)
(OUT/'acceptance.json').write_text(json.dumps({'frozenV3V4HashChecks':frozen,'results':reports},indent=2),encoding='utf-8')
print(json.dumps([{k:v for k,v in r.items() if k!='allKnownSupportDenseRows'} for r in reports],indent=2))
