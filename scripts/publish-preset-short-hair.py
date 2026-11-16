"""Publish exact, source-checked fits; rejected candidates remain out of catalog."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True,type=Path);parser.add_argument('--kind',choices=['short','ponytail'],default='short');parser.add_argument('--conditional-manifest',type=Path);args=parser.parse_args()
batch=json.loads(args.manifest.read_bytes())
prefix='m2-preset-short-hair-fits-v1' if args.kind=='short' else 'm2-preset-ponytail-fits-v1'
if args.kind=='short':
    assert batch['schema']=='preset-short-hair-fit-batch-v1'
    assert batch['batchManifestSha256']==sha(ROOT/'assets-source/m2-representative-batch-v1/generated/manifest.json')
    results=[dict(r,source=args.manifest.parent/r['targetId'],relative=r['targetId']) for r in batch['results']]
    if args.conditional_manifest:
        conditional=json.loads(args.conditional_manifest.read_bytes())
        assert conditional['schema']==batch['schema']
        assert conditional['batchManifestSha256']==batch['batchManifestSha256']
        results += [dict(r,source=args.conditional_manifest.parent/r['targetId'],relative='conditional/'+r['targetId']) for r in conditional['results']]
else:
    assert batch['schema']=='preset-ponytail-fits-v1' and batch['repeatBytesIdentical']
    assert batch['sourceSpec']['batchManifest']['sha256']==sha(ROOT/'assets-source/m2-representative-batch-v1/generated/manifest.json')
    assert not args.conditional_manifest
    results=[{'targetId':r['id'],'targetBodySha256':r['targetBodySha256'],'source':args.manifest.parent/r['id'],'relative':r['id'],
      'status':'source-fit-ready' if r['status']=='source-passed' else 'failed',
      'files':{'fit.json':r['fitSha256'],'manifest.json':r['manifestSha256']}} for r in batch['variants']]
runtime=json.loads((ROOT/'prototype/public/assets/m2-representative-batch-v1/runtime-index.json').read_bytes())
identities={v['id']:v['profile']['sha256'] for v in runtime['presets']}
published=[];pending=[];seen=set()
for result in results:
    if result['status'] not in ['source-fit-ready','source-contact-candidate']:continue
    identifier=result['targetId'];assert identities[identifier]==result['targetBodySha256']
    assert identifier not in seen;seen.add(identifier)
    source=result['source'];relative=result['relative']
    for name,expected in result['files'].items():assert sha(source/name)==expected
    manifest=json.loads((source/'manifest.json').read_bytes());fit=json.loads((source/'fit.json').read_bytes())
    assert manifest['compatibleBodies']==[identities[identifier]] and fit['targetBodySha256']==identities[identifier]
    assert manifest['fit']['sha256']==result['files']['fit.json']
    assert manifest['fit']['url']==f'/assets/{prefix}/{relative}/fit.json'
    asset=ROOT/'prototype/public'/manifest['url'].lstrip('/')
    assert asset.resolve().is_relative_to((ROOT/'prototype/public/assets').resolve())
    assert sha(asset)==manifest['sha256']==fit['assetSha256']
    names=['fit.json','manifest.json']
    if result['status']=='source-contact-candidate':
        assert args.kind=='short' and args.conditional_manifest
        contact=json.loads((source/'contact-report.json').read_bytes())
        assert contact['policy']=='transparent-source-texels'
        assert contact['targetBodySha256']==identities[identifier] and contact['sourceAssetSha256']==manifest['sha256']
        assert fit['contactEvidence']['sha256']==result['files']['contact-report.json']
        assert fit['contactEvidence']['url']==f'/assets/{prefix}/{relative}/contact-report.json'
        assert contact['records'] and len({r['pose'] for r in contact['records']})==55
        for record in contact['records']:
            assert record['summary']['allPositiveDepthPatchesTransparent']
            for measurement in record['measurements']:
                if measurement['targetProjectedPlaneDepthM']>0:
                    footprints=measurement['positiveDepthTextureFootprints']
                    assert {p['flipV'] for p in footprints}=={True,False}
                    assert all(p['maxAlpha0To255']==0 for p in footprints)
        names.append('contact-report.json')
    pending.append((source,ROOT/'prototype/public/assets'/prefix/relative,names))
    label='长束发 · 当前体型适配候选' if args.kind=='ponytail' else ('齐颈短发 · 当前体型适配候选' if manifest['id']=='female-bob-v1' else '偏侧短发 · 当前体型适配候选')
    published.append({'id':manifest['id'],'label':label,
      'manifestUrl':f'/assets/{prefix}/{relative}/manifest.json',
      'manifestSha256':result['files']['manifest.json'],'assetSha256':manifest['sha256'],
      'sourceMaterial':manifest['sourceMaterial'],'sourceBodySha256':fit['sourceBodySha256'],
      'compatibleBodies':manifest['compatibleBodies'],'legacyImplicitFit':False,'fit':manifest['fit']})
for source,folder,names in pending:
    folder.mkdir(parents=True,exist_ok=True)
    for name in names:shutil.copyfile(source/name,folder/name)
output=ROOT/'prototype/public/assets'/prefix/'catalog.json'
output.write_text(json.dumps(published,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'published':len(published),'catalogSHA256':sha(output),'visualAcceptance':'pending'}))
