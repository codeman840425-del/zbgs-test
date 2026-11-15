from pathlib import Path
import json,math,statistics,hashlib,sys,collections
source=Path(sys.argv[1])if len(sys.argv)>1 else Path('evidence/hand-release-038341558517/perf-after/report.json')
out=Path(sys.argv[2])if len(sys.argv)>2 else Path('evidence/hand-release-038341558517/perf-cause/baseline-groups.json')
r=json.loads(source.read_text(encoding='utf8'));case=next(c for c in r['results']if c['config']['name']=='skirt-sit-hold');rows=case['frames']
keys=['cpuUpdateMs','primarySimulateMs','motionMs','avatarMs','vrmMs','garmentMs','renderSubmitMs','handSurfaceMs']
def stats(a):
 a=sorted(x for x in a if isinstance(x,(float,int))and math.isfinite(x))
 return {'n':len(a),'mean':statistics.mean(a),'p50':a[int(len(a)*.5)],'p95':a[min(len(a)-1,int(len(a)*.95))],'p99':a[min(len(a)-1,int(len(a)*.99))],'max':a[-1]}if a else None
threshold=stats([x['cpuUpdateMs']for x in rows])['p95'];groups={}
for n in sorted({x['calls'].get('primarySimulateMs',0)for x in rows}):
 a=[x for x in rows if x['calls'].get('primarySimulateMs',0)==n]
 groups[n]={'frames':len(a),'share':len(a)/len(rows),'inclusive':{k:stats([x.get(k)for x in a])for k in keys},'exclusive':{k:stats([x['exclusive'].get(k)for x in a])for k in keys},'perSimulationInclusive':{k:stats([x.get(k,0)/n for x in a])for k in ['primarySimulateMs','motionMs','avatarMs','vrmMs','garmentMs']if n},'cpuAtOrAboveOverallP95':sum(x['cpuUpdateMs']>=threshold for x in a),'calls':{k:dict(collections.Counter(x['calls'].get(k,0)for x in a))for k in keys},'unwrappedCpuResidual':stats([x['cpuUpdateMs']-sum(x['exclusive'].values())for x in a])}
result={'build':r['build'],'detail':r['detail'],'source':str(source),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'frames':len(rows),'meanSubsteps':statistics.mean(x['calls']['primarySimulateMs']for x in rows),'overallCpu':stats([x['cpuUpdateMs']for x in rows]),'overallCpuP95Threshold':threshold,'groups':groups,'callConsistency':{'motionMatchesSimulation':all(x['calls'].get('motionMs')==x['calls']['primarySimulateMs']for x in rows),'avatarMatchesSimulation':all(x['calls'].get('avatarMs')==x['calls']['primarySimulateMs']for x in rows),'renderOnce':all(x['calls'].get('renderSubmitMs')==1 for x in rows)},'meanExclusiveShareOfCpu':{k:sum(x['exclusive'].get(k,0)for x in rows)/sum(x['cpuUpdateMs']for x in rows)for k in keys},'lastSubstepHandFit':None}
if r['detail']:
 profiles=[x['lastSubstepHandFit']for x in rows if x.get('lastSubstepHandFit')]
 result['lastSubstepHandFit']={'scope':'Only final simulation substep of each render. Not summed left+right, not full frame, no inferred multiplying into measured totals.','profiles':len(profiles),'fields':{k:stats([x.get(k)for x in profiles])for k in sorted({k for p in profiles for k in p})}}
out.write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items()if k not in ['groups','lastSubstepHandFit']},indent=2))
print('groups',[(n,g['frames'],g['inclusive']['cpuUpdateMs']['p50'],g['cpuAtOrAboveOverallP95'])for n,g in groups.items()])
