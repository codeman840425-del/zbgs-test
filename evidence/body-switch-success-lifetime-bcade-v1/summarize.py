import json,pathlib,hashlib
p=pathlib.Path(__file__).resolve().parent
r=json.loads((p/'report.json').read_text(encoding='utf8'))
def keys(x):return {v['cacheKey']:v['usedTimes'] for v in x['programs']}
def small(x):return {'body':x['body'],'outfit':x['state']['outfit'],'memory':x['memory'],'programs':len(x['programs']),'usedTimesSum':sum(v['usedTimes']for v in x['programs'])}
s={'build':r['build'],'initial':small(r['initial']),'rounds':[]}
previous={}
for a in r['rounds']:
 out={'round':a['round'],'states':[]}
 for v in a['states']:
  b=v['body'];x=v['sample'];q=small(x)
  q['exactProgramMapEqualPreviousSameBody']=None if b not in previous else keys(x)==keys(previous[b])
  q['memoryEqualPreviousSameBody']=None if b not in previous else x['memory']==previous[b]['memory']
  if b in previous:assert q['exactProgramMapEqualPreviousSameBody'] and q['memoryEqualPreviousSameBody']
  previous[b]=x;out['states'].append(q)
 s['rounds'].append(out)
(p/'summary.json').write_text(json.dumps(s,indent=2),encoding='utf8')
files=[{'path':f.relative_to(p).as_posix(),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in sorted(p.rglob('*'))if f.is_file() and f.name!='manifest.json']
(p/'manifest.json').write_text(json.dumps({'build':r['build'],'files':files},indent=2),encoding='utf8')
print(json.dumps(s,indent=2))
