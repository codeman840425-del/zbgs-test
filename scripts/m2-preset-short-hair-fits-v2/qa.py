"""Author readback of all exact fits, their transitive evidence and failure history."""
import copy
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from contact import ROOT, short, evidence_files


def main():
    results = []
    for name, expected in [('short-hair', 6), ('ponytail', 3)]:
        base = ROOT/('assets-source/m2-preset-'+name+'-fits-v2'); spec = json.loads((base/'spec.json').read_bytes())
        manifest = json.loads((base/'generated/manifest.json').read_bytes())
        short.require(len(manifest['results']) == expected, 'Wrong fit count')
        def resource(ref):
            relative = ref['url'].removeprefix(spec['publicPrefix'])
            short.require(relative != ref['url'] and not relative.startswith('/') and '..' not in Path(relative).parts, 'Evidence URL outside package')
            data = (base/'generated'/relative).read_bytes(); short.require(short.sha(data) == ref['sha256'], 'Evidence hash mismatch: '+relative)
            return json.loads(data)
        for row in manifest['results']:
            folder = base/'generated'/row['targetId']
            short.require('lean' not in row['targetId'] and 'slender' not in row['targetId'], 'Failed lean target admitted')
            for file, digest in row['files'].items(): short.require(short.sha((folder/file).read_bytes()) == digest, 'Recorded file hash mismatch')
            if row['status'] == 'failed':
                short.require(not (folder/'fit.json').exists(), 'Failure has an admitted fit'); results.append({'id': row['targetId'], 'style': name, 'status': 'retained-failed'}); continue
            fit = json.loads((folder/'fit.json').read_bytes()); style = json.loads((folder/'manifest.json').read_bytes())
            short.require(style['fit']['sha256'] == short.sha((folder/'fit.json').read_bytes()) and fit['targetBodySha256'] == row['targetBodySha256'], 'Fit body/hash identity mismatch')
            e = resource(fit['fitEvidence']); geometry = resource(e['geometryReport']); contact = resource(e['contactReport'])
            short.require(e['targetBodySha256'] == fit['targetBodySha256'] and e['assetSha256'] == fit['assetSha256'], 'Evidence identity mismatch')
            short.require(e['allAuthoredEndpointsMeasured'] and geometry['failure'] is None and geometry['actualTargetAll55FaceEndpoints'], 'Incomplete geometry evidence')
            expected_poses = 57 if row['targetId'].startswith('female') else 55
            short.require(e['faceEndpointCountIncludingNeutral'] == expected_poses, 'Wrong actual authored endpoint count')
            count = 0
            for primitive in geometry['primitives']:
                short.require(len(primitive['poseChecks']) == primitive['morphEndpoints']+1, 'Truncated primitive endpoint checks')
                for pose in primitive['poseChecks']:
                    added = pose['allIntroducedPairs']; count += len(added)
                    if not added: continue
                    record = next(r for r in contact['records'] if r['material'] == primitive['material'] and r['pose'] == pose['pose'])
                    pairs = {(r['hairTriangle'], r['targetTriangle']) for r in record['measurements']}
                    short.require(pairs == {tuple(p) for p in added}, 'Missing actual pair contact evidence')
                    for measured in record['measurements']:
                        footprints = measured['positiveDepthTextureFootprints']
                        short.require(len(footprints) == 2 and {p['flipV'] for p in footprints} == {False, True}, 'Missing source UV orientation footprints')
                        short.require(all(p['conservativeTexelFootprint'] > 0 and p['maxAlpha0To255'] == 0 for p in footprints), 'Contact touches nontransparent source pixels')
            short.require(count == e['introducedPairsAcrossEndpoints'], 'Added pair ledger mismatch')
            short.require(bool(count) == ('source-contact-candidate' in row['status']), 'Conditional contact status is ambiguous')
            short.require(not count or bool(contact['records']), 'Empty transparent contact exception')
            if name == 'ponytail':
                proxy = resource(e['proxyReport']); original = json.loads(short.pinned(ROOT, spec['sourceFit']['path'], spec['sourceFit']['sha256']))
                actual = copy.deepcopy(fit['dynamics']); actual['colliders'] = original['dynamics']['colliders']
                short.require(actual == original['dynamics'], 'Ponytail spring/reference parameters changed')
                short.require(all(r['minimumM'] >= 0 for r in proxy['restSpringProxyMargins']), 'Negative rest proxy margin')
            results.append({'id': row['targetId'], 'style': name, 'status': row['status'], 'allAuthoredEndpointsMeasured': expected_poses, 'newPairOccurrences': count,
                'manifestSha256': short.sha((folder/'manifest.json').read_bytes()), 'fitSha256': short.sha((folder/'fit.json').read_bytes())})
    negative_checks = []
    try: short.pinned(ROOT, 'assets-source/m2-representative-batch-v2/generated/manifest.json', '0'*64)
    except Exception as error: negative_checks.append({'case': 'wrong-input-sha', 'rejected': True, 'reason': str(error)})
    else: raise ValueError('Wrong input SHA accepted')
    try: evidence_files('probe', '0'*64, '0'*64, {'actualTargetAll55FaceEndpoints': False, 'failure': None}, {}, '/assets/probe/')
    except Exception as error: negative_checks.append({'case': 'incomplete-endpoints', 'rejected': True, 'reason': str(error)})
    else: raise ValueError('Incomplete endpoints admitted')
    result = {'status': 'source-author-readback-passed', 'reviewRole': 'source author, not independent reviewer', 'results': results, 'negativeChecks': negative_checks,
        'limits': ['Original v2 face intent remains projected. Individual authored endpoints and rest proxies do not establish combined/continuous motion or visual acceptance.'], 'runtimeAccepted': False, 'GPUUsed': False}
    for name in ['short-hair', 'ponytail']:
        base = ROOT/('assets-source/m2-preset-'+name+'-fits-v2'); (base/'qa-report.json').write_bytes(short.encoded(result))
        scripts = ROOT/('scripts/m2-preset-'+name+'-fits-v2')
        files = [p for directory in [base, scripts] for p in directory.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name != 'package-files.json']
        (base/'package-files.json').write_bytes(short.encoded({'files': [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': short.sha(p.read_bytes())} for p in sorted(files)]}))
    print(json.dumps(result, indent=2))


if __name__ == '__main__': main()
