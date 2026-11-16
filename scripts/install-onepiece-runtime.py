"""Install the exact editable-source export, preserving unrelated equipment.

Rerunning identical input is a no-op. Changed resources need a new asset version;
this script does not overwrite an existing different runtime asset.
"""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-source/m2-onepiece-v1/generated'
DEST=ROOT/'prototype/public/assets/m2-onepiece-v1'
MANIFEST=ROOT/'prototype/public/assets/m1b/equipment.json'

def digest(raw): return hashlib.sha256(raw).hexdigest()

def install():
    record=json.loads((SOURCE/'author-equipment.json').read_text(encoding='utf-8'))
    assert record['schema']=='zbgs-equipment-v1' and len(record['items'])==1
    entry=record['items'][0]
    assert entry['id']=='m2-male-training-onepiece-v1' and entry['slot']=='onePiece'
    assert entry['compatibleAvatarSha256']=='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
    asset=(SOURCE/'author-export.glb').read_bytes()
    fitBytes=(SOURCE/'fit.json').read_bytes();fit=json.loads(fitBytes)
    assert digest(asset)==entry['sha256']==fit['assetSha256'] and len(asset)==entry['bytes']
    assert fit['targetBodySha256']==entry['compatibleAvatarSha256']
    assert entry['fitId']==fit['id'] and entry['styleId']==fit['styleId']
    assert fit['sourceSpecSha256']==digest((SOURCE.parent/'spec.json').read_bytes())
    assert fit['occupies']==['top','bottom'] and not fit['bodyCoverageMasks']
    entry['url']='/assets/m2-onepiece-v1/author-export.glb'
    entry['fitResource']={'url':'/assets/m2-onepiece-v1/fit.json','sha256':digest(fitBytes)}
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert manifest['schema']=='zbgs-equipment-v1'
    existing=[item for item in manifest['items'] if item['id']==entry['id']]
    if existing and existing!=[entry]: raise ValueError('Existing equipment version differs; do not overwrite its identity')
    files={'author-export.glb':asset,'fit.json':fitBytes}
    for name,raw in files.items():
        target=DEST/name
        if target.exists() and target.read_bytes()!=raw: raise ValueError('Existing runtime file differs: '+name)
    DEST.mkdir(parents=True,exist_ok=True)
    for name,raw in files.items():
        if not (DEST/name).exists(): (DEST/name).write_bytes(raw)
    if not existing:
        manifest['items'].append(entry)
        temporary=MANIFEST.with_suffix('.install.tmp')
        temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        assert json.loads(temporary.read_text(encoding='utf-8'))==manifest
        temporary.replace(MANIFEST)
    return {'assetId':entry['id'],'assetSha256':digest(asset),'fitSha256':digest(fitBytes),'alreadyRegistered':bool(existing),
            'source':'assets-source/m2-onepiece-v1/generated/author-export.glb','runtime':'prototype/public/assets/m2-onepiece-v1/author-export.glb',
            'scope':'Original male only; no body removal or animation acceptance claimed'}

if __name__=='__main__': print(json.dumps(install(),ensure_ascii=False))
