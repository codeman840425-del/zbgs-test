"""Exact v2 target short-hair check, preserving every strict refusal."""
import json
import copy
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
from contact import ROOT, short, audit, evidence_files

BASE = ROOT/'assets-source/m2-preset-short-hair-fits-v2'


def plan(spec):
    short.require(spec['schema'] == 'preset-short-hair-fit-source-v2' and spec['version'] == 2 and spec['publicPrefix'] == '/assets/m2-preset-short-hair-fits-v2/', 'Unknown v2 source contract')
    original_spec = json.loads(short.pinned(ROOT, spec['sourceSpec']['path'], spec['sourceSpec']['sha256']))
    short.require(spec['families'] == original_spec['families'], 'Only the exact existing short-hair families are supported')
    for ref in spec['helpers']: short.pinned(ROOT, ref['path'], ref['sha256'])
    batch_bytes = short.pinned(ROOT, spec['batchManifest']['path'], spec['batchManifest']['sha256']); batch = json.loads(batch_bytes)
    targets = [r for r in batch['variants'] if r['status'] == 'source-passed']; short.require(len(targets) == 6, 'Exact six successful v2 targets required')
    results = []; output = {}
    for row in targets:
        family = spec['families'][row['sex']]; original, manifest, triangles, head, inverse = short.family(family)
        target = short.GLB(short.pinned(ROOT, row['avatar']['path'], row['avatar']['sha256']))
        asset = short.GLB(short.pinned(ROOT, family['asset'], family['assetSha256']))
        geometry, contacts = audit(original, target, asset, triangles, head, inverse, family['material'])
        try:
            files, evidence = evidence_files(row['id'], row['avatar']['sha256'], family['assetSha256'], geometry, contacts, spec['publicPrefix'])
            fit = {'schema': 'character-hair-fit-v1', 'id': family['styleId']+'-'+row['id']+'-fit-v2', 'version': 2,
                'styleId': family['styleId'], 'targetBodySha256': row['avatar']['sha256'], 'sourceBodySha256': family['bodySha256'],
                'assetSha256': family['assetSha256'], 'sourceMaterial': family['material'], 'rawBone': original.doc['nodes'][head]['name'], 'physics': 'rigid', 'geometryReuse': True,
                'attachment': {'bone': 'head', 'space': 'raw-head-bind-local', 'position': [0, 0, 0], 'quaternion': [0, 0, 0, 1], 'scale': [1, 1, 1]},
                'hideOriginal': {'materialNames': [family['material']], 'hideWholeBody': False}, 'fitEvidence': evidence, 'runtimeAccepted': False}
            manifest = copy.deepcopy(manifest); manifest.update(version=2, compatibleBodies=[row['avatar']['sha256']],
                fit={'id': fit['id'], 'version': 2, 'url': spec['publicPrefix']+row['id']+'/fit.json', 'sha256': short.sha(short.encoded(fit))})
            conditional = json.loads(files['evidence.json'])['introducedPairsAcrossEndpoints'] > 0
            if conditional: manifest['status'] = 'source-contact-candidate-not-visually-accepted'
            files['fit.json'] = short.encoded(fit); files['manifest.json'] = short.encoded(manifest)
            status = 'source-contact-candidate-measured-v2' if conditional else 'source-fit-ready-measured-v2'
        except Exception as error:
            status = 'failed'; files = {'FAILED.json': short.encoded({'targetId': row['id'], 'error': str(error), 'runtimeAccepted': False}),
                'geometry-report.json': short.diagnostic_bytes(geometry), 'contact-report.json': short.diagnostic_bytes(contacts)}
        for name, data in files.items(): output[row['id']+'/'+name] = data
        results.append({'targetId': row['id'], 'targetBodySha256': row['avatar']['sha256'], 'status': status,
            'completeEndpoints': geometry['actualTargetAll55FaceEndpoints'], 'actualGeometryFailure': geometry['failure'],
            'protectedDependencyChangedPoses': len(geometry['sourceProtectedDependencyChanges']), 'files': {name: short.sha(data) for name, data in files.items()}})
    output['manifest.json'] = short.encoded({'schema': 'preset-short-hair-fit-batch-v2', 'spec': spec, 'batchManifestSha256': short.sha(batch_bytes),
        'results': results, 'runtimeAccepted': False})
    return output


def main():
    started = time.perf_counter(); spec = json.loads((BASE/'spec.json').read_bytes()); output = plan(spec)
    short.require(output == plan(spec), 'Repeated endpoint calculation changed output bytes')
    out = BASE/'generated'
    for name, data in output.items(): short.require(not (out/name).exists() or (out/name).read_bytes() == data, 'Conflicting output: '+name)
    for name, data in output.items():
        path = out/name; path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists(): path.write_bytes(data)
    print(json.dumps({'results': json.loads(output['manifest.json'])['results'], 'seconds': time.perf_counter()-started}))


if __name__ == '__main__': main()
