"""Summarize the one fixed candidate and verify frozen parent assets."""
from pathlib import Path
import hashlib,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-support-v3';GROUND=ROOT/'assets-source/video-dance-ground-decomposition-v1'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen={}
for version in ('v1','v2'):
 manifest=read(ROOT/f'assets-source/video-dance-target-{version}/manifest.json')
 for path,expected in manifest['files'].items():
  # Existing manifests also include historical scripts; verify all pinned files.
  if isinstance(expected,str):
   actual=sha(ROOT/path);frozen[path]=actual==expected
if not all(frozen.values()):raise ValueError('Frozen parent manifest mismatch')
fig,axes=plt.subplots(2,2,figsize=(13,7),sharex=True,sharey=True)
results=[]
for bi,body in enumerate(('female','male')):
 r=read(OUT/f'{body}-cleanup-report.json');actual=read(OUT/f'{body}-actual-vrm-ground-check.json');old=read(GROUND/f'{body}-decomposition.json')
 a=read(OUT/f'{body}-dance-support-v3.json');p=read(ROOT/f'assets-source/video-dance-target-v2/{body}-dance-normalized-v2.json')
 changed=[n['name'] for n,o in zip(a['clip']['tracks'],p['clip']['tracks']) if n!=o]
 assert len(changed)==9
 assert all(n['times']==o['times'] for n,o in zip(a['clip']['tracks'],p['clip']['tracks']))
 assert r['flightLocalKeysExact'] and r['rootXZMaxDifference']==0 and r['hipsQuaternionExact']
 supports=[]
 for row,geom in zip(r['rows'],actual['sourceRows']):
  for side in ('left','right'):
   if row['feet'][side]['supportHypothesis']:
    g=geom['feet'][side];h=g['afterRuntimeLiftToeSoftMinY'] if 'forefoot' in row['feet'][side]['observation'] else g['afterRuntimeLiftMinimumY']
    supports.append({'sourceFrame':row['sourceFrame'],'side':side,'afterRuntimeLiftSelectedSupportHeight':h})
 summary={'body':body,'only73Frames':True,'frozenParentAllHashesMatch':True,'unchangedTracks':55-len(changed),'changedTracks':changed,'trackTimesExact':True,'rootXZExact':True,'hipsRotationExact':True,'flightKeysExact':True,'runtimeGroundLift':actual['runtimeGroundLift'],'supportAfterLiftMaxM':max(x['afterRuntimeLiftSelectedSupportHeight'] for x in supports),'supportAfterLiftMedianM':float(np.median([x['afterRuntimeLiftSelectedSupportHeight'] for x in supports])),'worstSupport':max(supports,key=lambda x:x['afterRuntimeLiftSelectedSupportHeight']),'dense721MinimumAfterLift':actual['minimumAfterRuntimeLiftDense721'],'coordinateReplayPassed':actual['coordinateReplayPassed'],'accepted':False,'failures':r['preliminaryFailures'],'remainingRisks':['Forefoot heel-raised observation not reproduced: original level world foot orientation preserved.','Pivot/sliding friction and stationary contact XZ not recovered.','Upper-leg/knee changes up to40.61deg and adjacent lower-leg steps up to37.70deg require visual review.','Dense721 finite sample does not prove continuous nonpenetration.','Actual5b78bbd34130 one-shot room playback recorded separately; no visual quality acceptance.'],'supportRows':supports}
 results.append(summary)
 for ai,label in enumerate(('v2 + old runtime lift','v3 + recalibrated runtime lift')):
  ax=axes[bi,ai]
  for side,color in (('left','#1769aa'),('right','#d76c18')):
   values=[x['feet'][side]['afterFullRuntimeLiftMinimumY'] for x in old['sourceRows']] if ai==0 else [x['feet'][side]['afterRuntimeLiftMinimumY'] for x in actual['sourceRows']]
   ax.plot(range(138,211),np.array(values)*1000,label=side,color=color)
   if ai==1:
    ss=[x for x in supports if x['side']==side];ax.scatter([x['sourceFrame'] for x in ss],[x['afterRuntimeLiftSelectedSupportHeight']*1000 for x in ss],s=16,facecolors='none',edgecolors=color)
  for lo,hi in ((141,144),(207,210)):ax.axvspan(lo-.5,hi+.5,color='#98d6a0',alpha=.35)
  ax.axhline(0,color='black',lw=.7);ax.set_title(body+': '+label);ax.set_ylabel('Shoe minimum Y (mm)');ax.grid(alpha=.2);ax.legend(loc='upper right')
  if bi==1:ax.set_xlabel('Original source frame')
fig.suptitle('Single fixed human-annotated cleanup candidate: NOT ACCEPTED\nGreen = protected source flight; circles = explicit support hypotheses; source-key full-mix geometry only')
fig.tight_layout();fig.savefig(OUT/'v2-v3-ground-comparison.png',dpi=140);plt.close(fig)
(OUT/'acceptance.json').write_text(json.dumps({'frozenParentHashChecks':frozen,'results':results},indent=2),encoding='utf-8')
for target,scripts in ((GROUND,['decompose-dance-ground.mjs','summarize-dance-ground.py']),(OUT,['cleanup-dance-support-v3.py','check-dance-support-v3.mjs','report-dance-support-v3.py'])):
 paths=[p for p in target.iterdir() if p.is_file() and p.name!='manifest.json']+[ROOT/'scripts/video-motion'/s for s in scripts]
 (target/'manifest.json').write_text(json.dumps({'scope':'73-frame offline diagnostic/derived candidate; no source videos included','frozenV1V2Verified':all(frozen.values()),'files':{p.relative_to(ROOT).as_posix():{'sha256':sha(p),'bytes':p.stat().st_size} for p in paths}},indent=2),encoding='utf-8')
print(json.dumps([{k:v for k,v in x.items() if k!='supportRows'} for x in results],indent=2))
