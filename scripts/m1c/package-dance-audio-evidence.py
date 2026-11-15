"""Archive completed audio QA only; no browser, retiming or audio/video mux."""
from pathlib import Path
import gzip,hashlib,json,shutil,sys
root=Path(__file__).resolve().parents[2]
build,before,after=sys.argv[1:4];out=root/'evidence'/f'dance-audio-{build}';out.mkdir(parents=True,exist_ok=True)
summary={'build':build,'runs':{},'limits':['Clock estimate is not acoustic synchronization','Internal graph audio is not speaker capture','Video and audio intentionally separate; no fabricated synchronized movie','Short quarter-rate segment has no complete audible beat cycle']}
for label,relative in [('before',before),('after',after)]:
 source=root/relative;report=json.loads((source/'report.json').read_text(encoding='utf-8'))
 assert report['initialGate']['runtimeBuild']['shortId']==build
 assert report['finalGate']['runtimeBuild']['shortId']==build
 dest=out/label;dest.mkdir(exist_ok=True)
 for name in ['playback-review.webm','internal-graph-audio.webm','normal-loop.png','offline-review.json']:
  shutil.copy2(source/name,dest/name)
 (dest/'raw-report.json.gz').write_bytes(gzip.compress((source/'report.json').read_bytes(),mtime=0))
 record={k:report[k] for k in ['checks','driftEstimate','errors','listening']}
 record['sourceRun']=relative
 record['offlineReview']=json.loads((source/'offline-review.json').read_text(encoding='utf-8'))
 record['qaSourceHashes']=report.get('qaSourceHashes','Not captured in first run; preserved original report, not substituted current hashes')
 record['readinessGate']=report['data'].get('readinessGate')
 times={x['name']:x['performanceNow']for x in report['inputs']};s=report['data']['samples'];record['settledWindows']={}
 for name,start,end in [('pause',times['pause']+80,times['quarter-resume']),('quarter',times['quarter-resume']+40,times['positive-offset']),('exit',times['exit']+100,float('inf'))]:
  group=[x for x in s if start<=x['wallMs']<end]
  record['settledWindows'][name]={'sampleCount':len(group),'danceClockRange':[min(x['dance']['time']for x in group),max(x['dance']['time']for x in group)],'rmsMaximum':max(x['rms']for x in group),'sourceActiveValues':sorted(set(x['sourceActive']for x in group))}
 summary['runs'][label]=record
(out/'compact-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
shutil.copy2(root/'assets-source/m1c-audio-qa/source.json',out/'original-pcm-source.json')
paths=[p for p in out.rglob('*')if p.is_file() and p.name!='sha256.json']
hashes={str(p.relative_to(out)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(paths)}
(out/'sha256.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
for name,h in hashes.items():assert hashlib.sha256((out/name).read_bytes()).hexdigest()==h['sha256']
print(out,len(hashes),'files',sum(x['bytes']for x in hashes.values()),'bytes')
