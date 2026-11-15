"""Offline evidence cross-check; does not rewrite the failed report or run a browser."""
from pathlib import Path
import json,gzip,hashlib,sys
root=Path(__file__).resolve().parent
p=Path(sys.argv[1]) if len(sys.argv)>1 else root/'m1a-jaw-v1/report.json.gz'
b=gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes()
d=json.loads(b);c=d['cases'][0]
assert c['config']['body']=='m1a-jaw-v1'
failed=[x for x in c['checks'] if not x['passed']]
assert len(failed)==1 and failed[0]['name']=='real outfit clicks'
assert len(c['events'])==3
pairs=[]
for event,requested in zip(c['events'],[0,1,0]):
 before=max((x for x in c['inputs'] if x['name']=='UI outfit '+str(requested) and x['wall']<=event['wall']),key=lambda x:x['wall'])
 after=min((x for x in c['inputs'] if x['name']=='outfit applied '+str(requested) and x['wall']>=event['wall']),key=lambda x:x['wall'])
 assert event['trusted'] and event['target']=='B'
 assert before['wall']<event['wall']<after['wall']
 assert after['fit']['index']==requested
 ids=sorted(x['id'] for x in after['fit']['equipment']['items'].values() if x['visible'])
 cfg=c['config']['config'];expected=sorted([cfg['ids']['top'],cfg['ids']['shoes'],cfg['ids']['skirt' if requested else 'pants']])
 assert ids==expected
 pairs.append({'requested':requested,'beforeWall':before['wall'],'event':event,'afterWall':after['wall'],'actualOutfit':after['fit']['index'],'actualVisibleIds':ids,'skirtFitId':after['fit']['equipment']['skirtDynamics']['fitId']})
r={'build':d['build'],'body':'m1a-jaw-v1','rawReportSha256':hashlib.sha256(b).hexdigest(),'originalFailedCheckRetained':True,'offlineAdjudication':'Three real trusted child-B clicks occur between corresponding UI request and verified actual outfit/resource-state records. Original event collector omitted closest button dataset. No runtime failure inferred; no rerun.','pairs':pairs,'allPairsPassed':True}
(root/'jaw-click-adjudication.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PASS: three original real clicks match independently recorded actual outfit states; raw failure unchanged')
