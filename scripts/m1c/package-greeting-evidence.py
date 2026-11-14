"""Compact fixed greeting/clock evidence; no runtime changes or media retiming."""
from pathlib import Path
import gzip,hashlib,json,shutil,sys
root=Path(__file__).resolve().parents[2]
if len(sys.argv) < 5:
 raise SystemExit('Usage: package-greeting-evidence.py BUILD GREETING_RUN CLOCK_RUN VISUAL_REVIEW_JSON [PEER_RUN]')
build,source,clock,review_path=sys.argv[1:5]
source=root/source;clock=root/clock;out=root/'evidence'/('greeting-'+build)
review=json.loads((root/review_path).read_text(encoding='utf-8'))
assert review['build']==build, 'Visual review must belong to the recorded build'
out.mkdir(parents=True,exist_ok=True)
r=json.loads((source/'report.json').read_text(encoding='utf-8'))
assert r['build']==build
summary={'build':build,'sourceRun':str(source.relative_to(root)),'checks':[], 'visualReview':review, 'limits':['No full garment/hand/face collision CCD','Video includes labeled setup, explicit pause, asset load and accessory contract phases; only marked1x gesture segments are normal-speed evidence','25fps video capture is not target-device performance acceptance']}
for c in r['cases']:
 name=c['config']['name'];dest=out/name;dest.mkdir(exist_ok=True)
 for file in ['greeting-review.webm','stand-front-110.png','sit-side-110.png']:
  shutil.copy2(source/name/file,dest/file)
 summary['checks'].append({'config':c['config'],'count':len(c['checks']),'allPassed':all(x['passed']for x in c['checks']),'errors':c['errors'],'runtimeBuild':c['initialGate']['runtimeBuild'],'avatar':c['initialGate']['primary']})
(out/'raw-report.json.gz').write_bytes(gzip.compress((source/'report.json').read_bytes(),mtime=0))
shutil.copy2(source/'review-summary.json',out/'review-summary.json')
clockReport=json.loads((clock/'report.json').read_text(encoding='utf-8'))
assert clockReport['plan']['build']==build
(out/'dance-clock-report.json.gz').write_bytes(gzip.compress((clock/'report.json').read_bytes(),mtime=0))
summary['danceClock']={k:clockReport[k]for k in ['pauseBefore','pauseAfter','slow','checks','errors','limits']}
summary['danceClock']['sampleCount']=len(clockReport['data']['samples'])
if len(sys.argv)>5:
 peer=root/sys.argv[5]
 pr=json.loads((peer/'report.json').read_text(encoding='utf-8'))
 assert pr['plan']['build']==build
 (out/'peer-ready-report.json.gz').write_bytes(gzip.compress((peer/'report.json').read_bytes(),mtime=0))
 dest=out/'peer-ready';dest.mkdir(exist_ok=True)
 for body in ['female','male']:
  for suffix in ['success-motion-held','ready']:
   file=f'{body}-{suffix}.png';shutil.copy2(peer/file,dest/file)
 records=[]
 for c in pr['records']:
  d=c.get('loaded')
  records.append({'peerBody':c['peerBody'],'outcome':c['outcome'],'passed':c['passed'],'heldFrameCount':len(c['held']['frames']),'allHeldRootsPrimaryOnly':all(f['roots']==c['before']['roots'] for f in c['held']['frames']),'primaryUnchanged':c['after']['primaryUnchanged'],'primaryDisposals':c['after']['primaryDisposals'],'peerDisposalEvents':c['after']['disposalCount']-c['before']['disposalCount'],'remainingRootCount':len(c['after']['roots']),'calibration':None if not d else {'pelvisSamples':d['pelvisSamples'],'feet':[{'side':f['side'],'selectedVertexCount':f['selection']['selectedVertexCount'],'patchCounts':{k:len(v) for k,v in f['selection']['patches'].items()}} for f in d['calibration']]}})
 summary['peerReady']={'passed':pr['passed'],'errors':pr['errors'],'records':records,'retryPrimaryUnchanged':pr['retry']['state']['primaryUnchanged'],'retryFootSelectedCounts':[f['selection']['selectedVertexCount']for f in pr['retry']['calibration']],'limits':pr['plan']['limits']}
(out/'compact-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
files=[p for p in out.rglob('*')if p.is_file()and p.name!='sha256.json']
(out/'sha256.json').write_text(json.dumps({str(p.relative_to(out)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(files)},indent=2),encoding='utf-8')
print(out)
