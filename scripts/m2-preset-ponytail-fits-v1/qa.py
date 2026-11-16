"""Source-author readback, actual repeated fit plan and bounded refusal checks."""
import copy
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build


def main():
    spec = json.loads((build.BASE/'spec.json').read_bytes())
    expected = build.plan(spec); out = build.BASE/'generated'
    for name, data in expected.items():
        build.require((out/name).read_bytes() == data, 'Repeated plan/output mismatch: '+name)
    before_times = {name: (out/name).stat().st_mtime_ns for name in expected}
    build.write_plan(out, expected)
    build.require(before_times == {name: (out/name).stat().st_mtime_ns for name in expected}, 'Idempotent writer replaced existing files')
    original = json.loads(build.checked(spec['sourceFit']))
    report = json.loads(expected['report.json']); rows = []
    build.require(all(row['status'] == 'source-passed' for row in report['variants']), 'Not all four fits passed')
    for row in report['variants']:
        folder = out/row['id']; fit = json.loads((folder/'fit.json').read_bytes())
        manifest = json.loads((folder/'manifest.json').read_bytes()); detail = json.loads((folder/'report.json').read_bytes())
        build.require(build.sha((folder/'fit.json').read_bytes()) == manifest['fit']['sha256'] == row['fitSha256'], 'Fit hash mismatch')
        comparable = copy.deepcopy(fit)
        for key in ['id', 'version', 'targetBodySha256']: comparable[key] = original[key]
        comparable['dynamics']['colliders'] = original['dynamics']['colliders']
        build.require(comparable == original, 'Changed source fit beyond explicit identity/recomputed proxies')
        build.require(manifest['compatibleBodies'] == [fit['targetBodySha256']] and manifest['sha256'] == fit['assetSha256'], 'Manifest target/asset mismatch')
        build.require(all(not r['pairs'] for r in detail['newCrossingPairs']), 'New rest geometry intersection')
        build.require(all(r['minimumM'] >= 0 for r in detail['restSpringProxyMargins']), 'Rest proxy contains a spring child sphere')
        rows.append({'id': row['id'], 'fitSha256': row['fitSha256'], 'passed': True})
    negatives = []
    for label, ref in [('bad-source-sha', spec['sourceFit']), ('bad-target-sha', spec['targets'][0]['avatar'])]:
        bad = {**ref, 'sha256': '0'*64}
        try: build.checked(bad)
        except Exception as error:
            build.require(ref['path'] in str(error), 'Refusal did not locate input')
            negatives.append({'case': label, 'rejected': True, 'reason': str(error)})
        else: raise ValueError('Bad SHA was accepted')
    bad = copy.deepcopy(spec); bad['schema'] = 'unknown'
    try: build.plan(bad)
    except Exception as error: negatives.append({'case': 'unknown-source-schema', 'rejected': True, 'reason': str(error)})
    else: raise ValueError('Unknown schema accepted')
    # Exercise the production writer with a conflict after a new-file entry.
    conflict = b'conflicting existing output\n'; sentinel = build.BASE/'qa-conflict/fit.json'
    sentinel.parent.mkdir(exist_ok=True); sentinel.write_bytes(conflict)
    try:
        build.write_plan(sentinel.parent, {'new.json': b'not written\n', 'fit.json': expected[report['variants'][0]['id']+'/fit.json']})
    except Exception as error: negatives.append({'case': 'differing-output', 'rejected': True, 'reason': str(error)})
    else: raise ValueError('Output conflict accepted')
    build.require(sentinel.read_bytes() == conflict and not (sentinel.parent/'new.json').exists(), 'Output conflict wrote files')
    sentinel.unlink(); sentinel.parent.rmdir()
    inventory = [{'path': (out/name).relative_to(build.ROOT).as_posix(), 'sha256': build.sha(data), 'bytes': len(data)} for name, data in sorted(expected.items())]
    result = {'passed': True, 'reviewRole': 'source-author CPU checks, not independent review', 'recomputedPlanByteIdentical': True, 'idempotentWriterMtimesUnchanged': True,
              'variants': rows, 'negativeChecks': negatives, 'files': inventory, 'GPUUsed': False, 'runtimeAccepted': False}
    (build.BASE/'qa-report.json').write_bytes(build.encoded(result)); print(json.dumps(result, indent=2))


if __name__ == '__main__': main()
