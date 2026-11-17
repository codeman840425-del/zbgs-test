"""Publish measured native fit data through the existing glasses registry."""
from pathlib import Path
import hashlib, json
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets-source/native-glasses-fit-v1/generated'
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
registry_path=ROOT/'prototype/src/glasses-temple-fit-manifest.json'
registry=json.loads(registry_path.read_text(encoding='utf-8'))
assert manifest['schema']==registry['schema']=='m1.glasses-temple-fit-manifest.1'
plan=[];merged=list(registry['profiles'])
for entry in manifest['profiles']:
    raw=(source/(entry['body']+'.json')).read_bytes()
    assert len(raw)==entry['bytes'] and hashlib.sha256(raw).hexdigest()==entry['sha256']
    p=json.loads(raw)
    assert p['bodySHA256']==entry['bodySHA256']
    target=ROOT/'prototype/public'/entry['url'].lstrip('/')
    if target.exists() and target.read_bytes()!=raw: raise ValueError('Conflict: '+str(target))
    matches=[e for e in merged if e['bodySHA256']==entry['bodySHA256']]
    if matches and matches!=[entry]: raise ValueError('Conflicting registered fit')
    if not matches: merged.append(entry)
    plan.append((target,raw))
for target,raw in plan:
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists(): target.write_bytes(raw)
registry['profiles']=merged
raw=(json.dumps(registry,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
if registry_path.read_bytes()!=raw: registry_path.write_bytes(raw)
print(json.dumps({'registered':len(plan),'total':len(merged),'sourceFilesUnchanged':True}))
