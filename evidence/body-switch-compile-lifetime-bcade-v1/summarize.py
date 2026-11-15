import json,pathlib,hashlib
p=pathlib.Path(__file__).resolve().parent
r=json.loads((p/'report.json').read_text(encoding='utf8'))
def programs(x):return {a['cacheKey']:a['usedTimes'] for a in x['programs']}
def compact(x):return {'body':x['body'],'outfit':x['state']['outfit'],'memory':x['memory'],'programCount':len(x['programs']),'usedTimesSum':sum(a['usedTimes']for a in x['programs'])}
s={'build':r['build'],'initial':compact(r['initial']),'cycles':[],'recovery':[compact(x['after'])for x in r['recovery']]}
for c in r['cycles']:
 s['cycles'].append({'round':c['round'],'compiled':compact(c['afterRealCompile']),'after':compact(c['after']),'programKeyUsedTimesExactlyInitial':programs(c['after'])==programs(r['initial']),'memoryExactlyInitial':c['after']['memory']==r['initial']['memory']})
assert all(c['programKeyUsedTimesExactlyInitial'] and c['memoryExactlyInitial'] for c in s['cycles'])
(p/'summary.json').write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf8')
files=[{'path':f.relative_to(p).as_posix(),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in sorted(p.rglob('*'))if f.is_file() and f.name!='manifest.json']
(p/'manifest.json').write_text(json.dumps({'build':r['build'],'files':files},indent=2),encoding='utf8')
print(json.dumps(s,ensure_ascii=False,indent=2))
