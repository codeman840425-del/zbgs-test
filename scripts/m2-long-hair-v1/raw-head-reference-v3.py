"""One reference-node candidate, sharing the exact immutable rootjoin GLB."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-long-hair-v1/revisions/raw-head-reference-v3'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import local, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()


def plan():
    spec = json.loads((BASE/'source-spec.json').read_bytes())
    require(spec['id'] == 'female-ponytail-headref-v3' and spec['resourceVersion'] == 3 and spec['simulationReference'] == 'raw-head', 'Unknown candidate reference/version')
    sources = {}
    for key in ['sourceFit', 'sourceManifest', 'sourceAsset', 'sourceInventory']:
        ref = spec[key]; data = local(ROOT, ref['path']).read_bytes()
        require(sha(data) == ref['sha256'], 'Original source identity changed: '+ref['path'])
        sources[key] = data
    require(spec['sourceAsset']['sha256'] == '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385', 'Exact original ponytail geometry required')
    for row in json.loads(sources['sourceInventory'])['files']:
        data = local(ROOT, row['path']).read_bytes()
        require(len(data) == row['bytes'] and sha(data) == row['sha256'], 'Frozen original package changed: '+row['path'])
    old_fit = json.loads(sources['sourceFit']); old_manifest = json.loads(sources['sourceManifest'])
    fit = copy.deepcopy(old_fit)
    fit.update(id=spec['id']+'-fit', styleId=spec['id'], version=3)
    fit['dynamics']['simulationReference'] = spec['simulationReference']
    unchanged = copy.deepcopy(fit['dynamics']); del unchanged['simulationReference']
    require(unchanged == old_fit['dynamics'], 'Force/collider configuration changed')
    manifest = copy.deepcopy(old_manifest)
    manifest.update(id=spec['id'], version=3, label='Tied ponytail raw-head reference candidate',
                    fit={'id': fit['id'], 'version': 3, 'url': spec['fitUrl'], 'sha256': sha(encoded(fit))})
    require(manifest['url'] == old_manifest['url'] and manifest['sha256'] == spec['sourceAsset']['sha256'] and manifest['bytes'] == len(sources['sourceAsset']), 'Candidate must reuse exact source GLB')
    return {'fit.json': encoded(fit), 'manifest.json': encoded(manifest),
            'build-report.json': encoded({'sourceSpec': spec, 'generatorSha256': sha(Path(__file__).read_bytes()),
                'unchangedForcesAndColliders': True, 'unchangedAssetBytes': True, 'unchangedOriginalInventory': True,
                'sourcePackageEntriesChecked': 26, 'runtimeAccepted': False})}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--out'); args = parser.parse_args()
    out = local(ROOT, args.out) if args.out else BASE
    require(out == BASE or out.is_relative_to(BASE/'exports'), 'Output must remain inside the candidate source directory')
    result = plan(); require(result == plan(), 'Candidate generation is nondeterministic')
    for name, data in result.items():
        require(not (out/name).exists() or (out/name).read_bytes() == data, 'Existing output differs; choose a fresh --out: '+name)
    for name, data in result.items():
        target = out/name; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists(): target.write_bytes(data)
    print(json.dumps({'candidate': 'female-ponytail-headref-v3', 'fitSha256': sha(result['fit.json']), 'manifestSha256': sha(result['manifest.json']), 'runtimeAccepted': False}))


if __name__ == '__main__': main()
