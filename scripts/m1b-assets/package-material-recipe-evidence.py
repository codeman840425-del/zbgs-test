"""Compact immutable fixed-build material evidence; copies, never relabels."""
import gzip,hashlib,json,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];SOURCE=Path(sys.argv[1]).resolve()
raw=(SOURCE/'report.json').read_bytes();report=json.loads(raw);build=report['build']
assert build=='abdb18defd26' and len(report['variants'])==2
OUT=ROOT/'evidence'/('material-recipe-'+build);OUT.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
summary={'build':build,'sourceDigest':report['variants'][0]['initialGate']['runtimeBuild']['sourceDigest'],
 'status':'fixed-runtime-api-gpu-observation-passed-visual-candidate-not-user-accepted',
 'sourceReportSha256':sha(raw),'variants':[],
 'visualReview':{'method':'Full-duration2FPS sheets,57+56 samples,10sheets reviewed plus full-resolution standing/seated images.',
  'observed':'Standing: the candidate reduces the dark high-contrast baked wrinkle appearance on the front panel. Shape, cuff and crotch silhouette remain unchanged. No white shader failure, disappearing garment, long-trouser contamination or failed restore seen.',
  'limits':'Room view gives small garment pixels during motion; cannot claim natural fine folds, exact all-frame contact or user acceptance. Source/candidate videos are two separate actual-clock runs, not pixel-aligned animation phases.'},
 'limits':['Setup briefly paused for same-pose geometry/alpha comparisons; all logged action frames real1x rAF, no reset/teleport/advance/simulate calls.',
  'Console/pageerror capture and visible playback checked; gl.getError timer queries and target-PC performance not measured.',
  'Not a body/cloth collision or geometry repair. No save migration/UI acceptance.']}
for v in report['variants']:
 assert v['collectionComplete'] and not v['errors'] and not v['frameGateFailures']
 assert v['beforeMaterial']['geometry']==v['afterMaterial']['geometry']
 assert v['beforeMaterial']['maps']==v['afterMaterial']['maps']==v['afterRestore']['maps']
 cameras={json.dumps(f['camera'],sort_keys=True)for f in v['frames']}
 assert len(cameras)==1 and v['frames'][0]['camera']['position']==[5.8,4.5,7.8]
 dest=OUT/v['variant'];dest.mkdir(exist_ok=True)
 for filename in ['normal-chain.webm','standing.png','seated.png','restored-original-long.png']:
  shutil.copyfile(SOURCE/v['variant']/filename,dest/filename)
 timeline=json.loads((SOURCE/v['variant']/'normal-chain-review/manifest.json').read_text(encoding='utf-8'))
 summary['variants'].append({'variant':v['variant'],'initialIdentity':v['initialGate'],'finalIdentity':v['finalGate'],
  'actualMaterialSelection':v['materialSelection'],'samePoseGeometryAndWeightsUnchanged':True,
  'originalMapAlphaUnchanged':True,'mapEvidence':v['beforeMaterial']['maps'],
  'restore':{k:v['afterRestore'][k]for k in ['counts','originalMaterialReferencesRestored','originalMapAndAlphaPropertiesRetained']},
  'actions':[{'requestId':x['requestId'],'finalState':x['result']['state'],'simulationDuration':x['result']['endedAt']-x['result']['startedAt']}for x in v['checks']if'result'in x],
  'loggedRafFrames':len(v['frames']),'loggedWallSeconds':(v['frames'][-1]['wall']-v['frames'][0]['wall'])/1000,
  'fixedCamera':v['frames'][0]['camera'],'distinctCameraStates':len(cameras),
  'frameGateFailures':len(v['frameGateFailures']),'runtimeErrors':v['errors'],
  'fullTimelineReview':{'samplingFPS':timeline['samplingFPS'],'frames':timeline['frames'],'sheets':len(timeline['sheets'])}})
(OUT/'report.json.gz').write_bytes(gzip.compress(raw,compresslevel=6,mtime=0))
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
shutil.copyfile(ROOT/'scripts/m1b-assets/qa-material-recipe-fixed.cjs',OUT/'qa-material-recipe-fixed.cjs')
shutil.copyfile(ROOT/'experiments/m1-material-recipe-1/dist/build-info.json',OUT/'build-info.json')
shutil.copyfile(ROOT/'experiments/m1-material-recipe-1/dist/assets/material-recipes/m1b-shorts-cloth-v4-review1.json',OUT/'recipe.json')
manifest={'build':build,'files':{str(p.relative_to(OUT)).replace('\\','/'):sha(p.read_bytes())for p in OUT.rglob('*')if p.is_file()and p.name!='manifest.json'},'originalReportSha256':sha(raw)}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(OUT)
