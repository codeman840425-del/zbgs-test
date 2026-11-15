from pathlib import Path
import json,gzip,math
E=Path(__file__).resolve().parent
for suffix in ['', '-silent']:
 a=json.loads(gzip.decompress((E/('sit-trigger'+suffix+'-baseline')/'trace.json.gz').read_bytes()))
 b=json.loads(gzip.decompress((E/('sit-trigger'+suffix+'-candidate')/'trace.json.gz').read_bytes()))
 result={'builds':[a['build'],b['build']],'speaking':not bool(suffix),'steps':len(a['frames']),'timeDiff':0,'rootDiff':0,'jogPhaseDiff':0,'stages':{},'contact':{}}
 previous=None
 def put(s,k,v,f):
  if k not in s or v>s[k]['value']:s[k]={'value':v,'time':f['time'],'stageTick':f['stageTick']}
 for x,y in zip(a['frames'],b['frames']):
  assert (x['stage'],x['stageTick'])==(y['stage'],y['stageTick'])
  for key,va in [('timeDiff',abs(x['time']-y['time'])),('rootDiff',math.dist(x['root'],y['root'])),('jogPhaseDiff',abs(x['jogPhase']-y['jogPhase']))]:result[key]=max(result[key],va)
  s=result['stages'].setdefault(x['stage'],{})
  for i,side in enumerate(['left','right']):
   put(s,side+'WristDiff',math.dist(x['wrists'][i]['p'],y['wrists'][i]['p']),y)
   if previous:
    old=math.dist(previous[0]['wrists'][i]['p'],x['wrists'][i]['p']);new=math.dist(previous[1]['wrists'][i]['p'],y['wrists'][i]['p'])
    put(s,side+'StepIncrease',new-old,y);put(s,side+'NewStep',new,y);put(s,side+'OldStep',old,y)
  if x['mic'] and y['mic']:put(s,'micTipDiff',math.dist(x['mic']['tip'],y['mic']['tip']),y)
  previous=x,y
 for label,data in [('old',a),('new',b)]:
  peak=max(data['frames'],key=lambda f:max([h.get('garmentProjection',0)or 0 for h in f['handContacts']]+[0]))
  result['contact'][label]={'samples':len(data['rows']),'maxPairs':data['maxHits'],'peakProjectionPose':peak,'snapshots':[{k:r[k]for k in ['stage','t','sitProgress','mode']}|{'pairs':len(r['hits'])}for r in data['rows']if r['stage']in ['run-complete-before-sit','sit-half','sit-complete','seated-talk-final']]}
 (E/('trigger'+suffix+'-comparison.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in result.items()if k!='contact'},indent=2))
