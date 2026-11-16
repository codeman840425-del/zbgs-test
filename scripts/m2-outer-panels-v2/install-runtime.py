"""Stage the exact editable-source export as a runtime candidate, preserving old items."""
from pathlib import Path
import copy, hashlib, json

root=Path(__file__).resolve().parents[2]
source=root/'assets-source/m2-outer-panels-v2/generated'
catalog_path=root/'prototype/public/assets/m1b/equipment.json'
destination=root/'prototype/public/assets/m2-outer-panels-v2'
author=json.loads((source/'author-equipment.json').read_text(encoding='utf-8'))
entry=copy.deepcopy(author['items'][0])
data=(source/'author-export.glb').read_bytes()
assert hashlib.sha256(data).hexdigest()==entry['sha256'] and len(data)==entry['bytes']
assert entry['compatibleAvatarSha256']=='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
assert entry['admission']=='static-source-candidate-runtime-pending'
catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
entry['url']='/assets/m2-outer-panels-v2/author-export.glb'
existing=next((item for item in catalog['items'] if item['id']==entry['id']),None)
if existing is not None and existing!=entry:
    raise RuntimeError('Existing runtime entry differs; use an explicit new fit/version')
output=destination/'author-export.glb'
if output.exists() and output.read_bytes()!=data:
    raise RuntimeError('Refusing to replace an existing different runtime export')
legacy=[item for item in catalog['items'] if item['id']!=entry['id']]
legacy_hash=hashlib.sha256(json.dumps(legacy,separators=(',',':')).encode()).hexdigest()
destination.mkdir(exist_ok=True)
output.write_bytes(data)
if existing is None:
    catalog['items'].append(entry)
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
after=json.loads(catalog_path.read_text(encoding='utf-8'))
assert [item for item in after['items'] if item['id']!=entry['id']]==legacy
print(json.dumps({'status':'staged-runtime-candidate','id':entry['id'],'sha256':entry['sha256'],
    'legacyItemsUnchanged':len(legacy),'legacySemanticSha256':legacy_hash,
    'limitations':'No runtime/action/visual admission implied by this packaging step.'}))
