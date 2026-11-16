"""Publish exact, source-checked fits; rejected candidates remain out of catalog."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True,type=Path);args=parser.parse_args()
batch=json.loads(args.manifest.read_bytes())
assert batch['schema']=='preset-short-hair-fit-batch-v1'
assert batch['batchManifestSha256']==sha(ROOT/'assets-source/m2-representative-batch-v1/generated/manifest.json')
runtime=json.loads((ROOT/'prototype/public/assets/m2-representative-batch-v1/runtime-index.json').read_bytes())
identities={v['id']:v['profile']['sha256'] for v in runtime['presets']}
published=[]
for result in batch['results']:
    if result['status']!='source-fit-ready':continue
    identifier=result['targetId'];assert identities[identifier]==result['targetBodySha256']
    source=args.manifest.parent/identifier
    for name,expected in result['files'].items():assert sha(source/name)==expected
    manifest=json.loads((source/'manifest.json').read_bytes());fit=json.loads((source/'fit.json').read_bytes())
    assert manifest['compatibleBodies']==[identities[identifier]] and fit['targetBodySha256']==identities[identifier]
    assert manifest['fit']['sha256']==result['files']['fit.json']
    asset=ROOT/'prototype/public'/manifest['url'].lstrip('/')
    assert asset.resolve().is_relative_to((ROOT/'prototype/public/assets').resolve())
    assert sha(asset)==manifest['sha256']==fit['assetSha256']
    folder=ROOT/'prototype/public/assets/m2-preset-short-hair-fits-v1'/identifier;folder.mkdir(parents=True,exist_ok=True)
    for name in ['fit.json','manifest.json']:shutil.copyfile(source/name,folder/name)
    published.append({'id':manifest['id'],'label':manifest['label'],
      'manifestUrl':f'/assets/m2-preset-short-hair-fits-v1/{identifier}/manifest.json',
      'manifestSha256':result['files']['manifest.json'],'assetSha256':manifest['sha256'],
      'sourceMaterial':manifest['sourceMaterial'],'sourceBodySha256':fit['sourceBodySha256'],
      'compatibleBodies':manifest['compatibleBodies'],'legacyImplicitFit':False,'fit':manifest['fit']})
output=ROOT/'prototype/public/assets/m2-preset-short-hair-fits-v1/catalog.json'
output.write_text(json.dumps(published,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'published':len(published),'catalogSHA256':sha(output),'visualAcceptance':'pending'}))
