import json,re,hashlib
from pathlib import Path
P=Path(__file__).resolve().parent
raw=(P/'report.json').read_bytes(); q=json.loads(raw)['data']
ready=next(s for s in q['snapshots'] if s['kind']=='compile-ready')
programs={p['glId']:p for p in ready['programs']}
rows=[]
for l in q['links']:
 pid=l['glId']; queries=[x for x in q['queries'] if x['glId']==pid]
 completed=[x for x in queries if x['name']=='getProgramParameter' and x.get('pname')==37297 and x.get('result') is True]
 logs=[x for x in queries if x['name']=='getProgramInfoLog']
 rows.append({'glId':pid,'linkPhase':l['phase'],'linkTime':l['t'],'shaderIdentity':re.findall(r'#define SHADER_(?:TYPE|NAME) .*',l['shaders'][0]['source']),'program':programs.get(pid),'completionTrue':completed,'infoLog':[dict(x,cpuMs=x['end']-x['t'])for x in logs]})
s={'sourceSha256':hashlib.sha256(raw).hexdigest(),'command':q['command'],'compileReadyTime':ready['t'],'rows':rows,'longestRender':max(q['renders'],key=lambda x:x['end']-x['t']),'limitations':['No driver cache reset','No profiler/video','Draw detail wrapper retained only initial four frames before actual edited draw; program identity conclusion uses complete GL link/query log, not missing draw records','CPU wrapper timings not GPU elapsed']}
(P/'summary.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
print([(r['glId'],r['linkPhase'],len(r['completionTrue']),[round(x['cpuMs'],2)for x in r['infoLog']])for r in rows])
