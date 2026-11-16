"""Three exact v2 female targets, unchanged head-reference hair and fresh proxies."""
import copy
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/m2-preset-short-hair-fits-v2'))
from contact import short, pony, audit, evidence_files

BASE = ROOT/'assets-source/m2-preset-ponytail-fits-v2'


def plan(spec):
    short.require(spec['schema'] == 'preset-ponytail-fit-source-v2' and spec['version'] == 2 and spec['publicPrefix'] == '/assets/m2-preset-ponytail-fits-v2/', 'Unknown v2 ponytail contract')
    original_spec = json.loads(pony.checked(spec['sourceSpec']))
    for key in ['styleId', 'sourceBody', 'sourceFit', 'sourceManifest', 'asset']:
        short.require(spec[key] == original_spec[key], 'Original ponytail source identity changed: '+key)
    source = short.GLB(pony.checked(spec['sourceBody'])); asset_bytes = pony.checked(spec['asset']); asset = short.GLB(asset_bytes)
    old_fit = json.loads(pony.checked(spec['sourceFit'])); old_manifest = json.loads(pony.checked(spec['sourceManifest']))
    batch = json.loads(pony.checked(spec['batchManifest'])); rows = [r for r in batch['variants'] if r['status'] == 'source-passed' and r['sex'] == 'female']
    short.require(len(rows) == 3 and [r['id'] for r in rows] == [r['id'] for r in spec['targets']], 'Exact three successful v2 females required')
    for ref in spec['helpers']: pony.checked(ref)
    short.require(old_fit['dynamics']['simulationReference'] == 'raw-head' and old_fit['assetSha256'] == spec['asset']['sha256'], 'Exact old head-reference fit/asset required')
    inv = pony.inverse(source, 'head'); old_colliders, old_trace = pony.hair.proxies(source, inv)
    short.require(old_colliders == old_fit['dynamics']['colliders'], 'Original proxy generator no longer reproduces source fit')
    p = asset.doc['meshes'][0]['primitives'][0]; P = np.array(asset.accessor(p['attributes']['POSITION'])); F = np.array(asset.accessor(p['indices']), int).reshape(-1, 3)
    global_hair = short.apply(P, np.linalg.inv(inv))[F]; head, _ = short.frame(source)
    old_geometry = pony.static_geometry(source, P, F); tails, radii = pony.tail_spheres(asset, old_fit['dynamics']['joints'])
    output = {}; results = []
    for row in rows:
        target = short.GLB(short.pinned(ROOT, row['avatar']['path'], row['avatar']['sha256']))
        dependencies = pony.head_dependencies(source, target)
        colliders, trace = pony.hair.proxies(target, pony.inverse(target, 'head')); static = pony.static_geometry(target, P, F)
        geometry, contacts = audit(source, target, asset, global_hair, head, inv, old_fit['sourceMaterial'])
        margins = []; changes = []
        for old, new, a, b in zip(old_colliders, colliders, old_trace, trace):
            edge = np.array(b['headLocalTail'])-b['headLocalOffset']; start = np.array(b['headLocalOffset'])
            fraction = np.clip((tails-start)@edge/max(edge@edge, 1e-20), 0, 1)
            margin = np.linalg.norm(tails-(start+fraction[:, None]*edge), axis=1)-new['radius']-radii
            margins.append({'bone': new['bone'], 'shape': new['shape'], 'tailSphereMarginsM': margin.tolist(), 'minimumM': float(margin.min())})
            changes.append({'bone': new['bone'], 'shape': new['shape'], 'source': a, 'target': b, 'radiusDeltaM': new['radius']-old['radius']})
        report = {'target': row['avatar'], 'dependencies': dependencies, 'proxyChanges': changes, 'restSpringProxyMargins': margins,
            'sourceStaticGeometry': old_geometry, 'targetStaticGeometry': static,
            'sourceAssetSha256': spec['asset']['sha256'], 'auxiliaryBonesInverseBindsGeometryUnchanged': True,
            'springJointsAndReferenceUnchanged': True, 'runtimeAccepted': False}
        try:
            short.require(all(m['minimumM'] >= 0 for m in margins), 'Recomputed proxy contains rest spring child sphere')
            added = [pair for before, after in zip(old_geometry, static) for pair in after['crossingPairs'] if pair not in before['crossingPairs']]
            measured_neutral = {tuple(pair) for r in geometry['primitives'] for pose in r['poseChecks'] if pose['pose'] == 'neutral' for pair in pose['allIntroducedPairs']}
            short.require(all(tuple(pair) in measured_neutral for pair in added), 'Static added pairs missing fresh complete-endpoint evidence')
            files, evidence = evidence_files(row['id'], row['avatar']['sha256'], spec['asset']['sha256'], geometry, contacts, spec['publicPrefix'])
            report_bytes = short.encoded(report); files['proxy-report.json'] = report_bytes
            evidence_data = json.loads(files['evidence.json']); evidence_data['proxyReport'] = {'url': spec['publicPrefix']+row['id']+'/proxy-report.json', 'sha256': short.sha(report_bytes)}
            files['evidence.json'] = short.encoded(evidence_data); evidence['sha256'] = short.sha(files['evidence.json'])
            fit = copy.deepcopy(old_fit); fit.update(id=spec['styleId']+'-'+row['id']+'-fit-v2', version=2, targetBodySha256=row['avatar']['sha256'], fitEvidence=evidence)
            fit['dynamics']['colliders'] = colliders
            unchanged = copy.deepcopy(fit['dynamics']); unchanged['colliders'] = old_colliders
            short.require(unchanged == old_fit['dynamics'], 'Spring parameters/reference changed')
            manifest = copy.deepcopy(old_manifest); manifest['compatibleBodies'] = [row['avatar']['sha256']]
            manifest['fit'] = {'id': fit['id'], 'version': 2, 'url': spec['publicPrefix']+row['id']+'/fit.json', 'sha256': short.sha(short.encoded(fit))}
            conditional = evidence_data['introducedPairsAcrossEndpoints'] > 0
            if conditional: manifest['status'] = 'source-contact-candidate-not-visually-accepted'
            files['fit.json'] = short.encoded(fit); files['manifest.json'] = short.encoded(manifest)
            status = 'source-contact-candidate-measured-v2' if conditional else 'source-fit-ready-measured-v2'
        except Exception as error:
            status = 'failed'; files = {'FAILED.json': short.encoded({'targetId': row['id'], 'targetBodySha256': row['avatar']['sha256'], 'error': str(error), 'runtimeAccepted': False}),
                'proxy-report.json': short.encoded(report), 'geometry-report.json': short.diagnostic_bytes(geometry), 'contact-report.json': short.diagnostic_bytes(contacts)}
        for name, data in files.items(): output[row['id']+'/'+name] = data
        results.append({'targetId': row['id'], 'targetBodySha256': row['avatar']['sha256'], 'status': status,
            'completeEndpoints': geometry['actualTargetAll55FaceEndpoints'], 'actualGeometryFailure': geometry['failure'],
            'files': {name: short.sha(data) for name, data in files.items()}})
    output['manifest.json'] = short.encoded({'schema': 'preset-ponytail-fit-batch-v2', 'sourceSpec': spec, 'results': results,
        'limits': ['Original source chair-top tail bending and dynamic naturalness limitation remains.', 'Rest geometry plus individual55 endpoints only; no combined/continuous expression or posed/game acceptance.'], 'runtimeAccepted': False})
    return output


def main():
    started = time.perf_counter(); spec = json.loads((BASE/'spec.json').read_bytes()); output = plan(spec)
    short.require(output == plan(spec), 'Repeated exact ponytail fit bytes differ')
    pony.write_plan(BASE/'generated', output)
    print(json.dumps({'results': json.loads(output['manifest.json'])['results'], 'seconds': time.perf_counter()-started}))


if __name__ == '__main__': main()
