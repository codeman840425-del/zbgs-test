"""Run the actual publisher in private roots with real fixed v2 source inputs."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BODY = 'assets-source/m2-representative-batch-v2/generated/manifest.json'
INDEX = 'prototype/public/assets/m2-representative-batch-v2/runtime-index.json'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
read = lambda path: json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT)
    parser.add_argument('--producer-commit', required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    snapshot = (ROOT/'scripts/publish-preset-short-hair.py').read_bytes()
    scratch = Path(tempfile.mkdtemp(prefix='hair-v2-', dir=OUT))
    checks = []
    inputs = {}

    def copy_input(case, name):
        target = case/name
        if target.exists():
            return
        origin = source/name
        target.parent.mkdir(parents=True, exist_ok=True)
        if origin.suffix in ['.vrm', '.glb']:
            os.link(origin, target)
        else:
            shutil.copyfile(origin, target)
        inputs[name] = sha(origin.read_bytes())

    def setup(name):
        case = scratch/name
        (case/'scripts').mkdir(parents=True)
        (case/'scripts/publish-preset-short-hair.py').write_bytes(snapshot)
        for relative in [BODY, INDEX]:
            copy_input(case, relative)
        for kind in ['short-hair', 'ponytail']:
            prefix = 'm2-preset-'+kind+'-fits-v2'
            package = 'assets-source/'+prefix
            shutil.copytree(source/package, case/package)
            spec = read(case/package/'spec.json')
            for original in [source/package/'spec.json', *(source/package/'generated').rglob('*')]:
                if original.is_file():
                    inputs[original.relative_to(source).as_posix()] = sha(original.read_bytes())
            for helper in spec['helpers']:
                copy_input(case, helper['path'])
            families = spec['families'].values() if kind == 'short-hair' else []
            for family in families:
                for field in ['body', 'asset', 'manifest']:
                    copy_input(case, family[field])
                manifest = read(case/family['manifest'])
                copy_input(case, 'prototype/public'+manifest['url'])
            if kind == 'ponytail':
                for key in ['sourceBody', 'asset', 'sourceFit', 'sourceManifest']:
                    copy_input(case, spec[key]['path'])
                for helper in spec['helpers']:
                    copy_input(case, helper['path'])
                manifest = read(case/spec['sourceManifest']['path'])
                copy_input(case, 'prototype/public'+manifest['url'])
            output = case/'prototype/public/assets'/prefix
            output.mkdir(parents=True)
            (output/'previous.txt').write_text('previous diagnostic output\n', encoding='utf-8')
        for row in read(case/BODY)['variants']:
            if row['status'] == 'source-passed':
                copy_input(case, row['avatar']['path'])
        for row in read(case/INDEX)['presets']:
            copy_input(case, 'prototype/public'+row['profile']['url'])
        return case

    def output_state(case):
        return {p.relative_to(case).as_posix(): sha(p.read_bytes()) for kind in ['short-hair', 'ponytail']
                for p in (case/'prototype/public/assets'/('m2-preset-'+kind+'-fits-v2')).rglob('*') if p.is_file()}

    def run(name, kind='short', mutate=None, expected=True):
        case = setup(name)
        prefix = 'm2-preset-'+('short-hair' if kind == 'short' else 'ponytail')+'-fits-v2'
        batch_path = case/'assets-source'/prefix/'generated/manifest.json'
        batch = read(batch_path)
        entry = batch['results'][0]
        folder = batch_path.parent/entry['targetId']
        documents = {n: read(folder/n) for n in entry['files']}
        if mutate:
            mutate(documents, entry)
            evidence = documents.get('evidence.json')
            if evidence:
                for key, filename in [('geometryReport','geometry-report.json'),('contactReport','contact-report.json'),('proxyReport','proxy-report.json')]:
                    if key in evidence:
                        write(folder/filename, documents[filename])
                        evidence[key]['sha256'] = sha((folder/filename).read_bytes())
                write(folder/'evidence.json', evidence)
                documents['fit.json']['fitEvidence']['sha256'] = sha((folder/'evidence.json').read_bytes())
            write(folder/'fit.json', documents['fit.json'])
            documents['manifest.json']['fit']['sha256'] = sha((folder/'fit.json').read_bytes())
            write(folder/'manifest.json', documents['manifest.json'])
            entry['files'] = {n: sha((folder/n).read_bytes()) for n in entry['files']}
            write(batch_path, batch)
        before = output_state(case)
        command = [sys.executable, str(case/'scripts/publish-preset-short-hair.py'), '--revision', '2', '--kind', kind, '--manifest', str(batch_path)]
        process = subprocess.run(command, cwd=case, capture_output=True, text=True, encoding='utf-8')
        accepted = process.returncode == 0
        after = output_state(case)
        passed = accepted == expected and (accepted or before == after)
        row = {'name': name, 'kind': kind, 'expectedAccepted': expected, 'accepted': accepted, 'passed': passed,
               'failedInputPreservedPreviousPublicBytes': before == after if not accepted else None,
               'stdout': process.stdout.strip(), 'error': process.stderr.strip().splitlines()[-1] if process.stderr.strip() else None}
        if accepted:
            catalog = case/'prototype/public/assets'/prefix/'catalog.json'
            row['publishedCount'] = len(read(catalog))
            row['passed'] &= row['publishedCount'] == (6 if kind == 'short' else 3)
            times = {p.relative_to(case).as_posix(): p.stat().st_mtime_ns for p in catalog.parent.rglob('*') if p.is_file()}
            repeated = subprocess.run(command, cwd=case, capture_output=True, text=True, encoding='utf-8')
            row['idempotentRepeatBytesAndMtimes'] = repeated.returncode == 0 and after == output_state(case) and times == {p.relative_to(case).as_posix():p.stat().st_mtime_ns for p in catalog.parent.rglob('*') if p.is_file()}
            row['passed'] &= row['idempotentRepeatBytesAndMtimes']
        checks.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    run('actual-six-short')
    run('actual-three-ponytail', 'ponytail')
    run('wrong-evidence-target', mutate=lambda d,r:d['evidence.json'].update(targetBodySha256='0'*64), expected=False)
    run('wrong-source-texture', mutate=lambda d,r:d['contact-report.json'].update(sourceTextureSha256='0'*64), expected=False)
    run('old-head-unchanged-claim', mutate=lambda d,r:d['evidence.json'].update(originalHeadSurfaceUnchanged=True), expected=False)
    run('female-wrong-55-endpoint-summary', mutate=lambda d,r:d['evidence.json'].update(faceEndpointCountIncludingNeutral=55), expected=False)
    run('empty-geometry-primitives', mutate=lambda d,r:d['geometry-report.json'].update(primitives=[]), expected=False)
    def missing_endpoint(d, r):
        next(p for p in d['geometry-report.json']['primitives'] if p['morphEndpoints'] > 0)['poseChecks'].pop()
    run('missing-real-authored-endpoint', mutate=missing_endpoint, expected=False)
    def wrong_endpoint(d, r):
        d['geometry-report.json']['primitives'][0]['poseChecks'][0]['targetPositionSha256'] = '0'*64
    run('wrong-actual-endpoint-bytes', mutate=wrong_endpoint, expected=False)
    run('missing-head-change-points', mutate=lambda d,r:d['geometry-report.json'].update(neutralHeadChanges=[]), expected=False)
    run('wrong-fit-frame', 'ponytail', lambda d,r:d['fit.json']['dynamics'].update(simulationReference='avatar-scene'), False)
    run('empty-conditional-measurements', 'ponytail', lambda d,r:d['contact-report.json']['records'][0].update(measurements=[]), False)
    def change_measurement(d, r, field, value):
        d['contact-report.json']['records'][0]['measurements'][0][field] = value
    run('zero-conditional-depth', 'ponytail', lambda d,r:change_measurement(d,r,'targetProjectedPlaneDepthM',0), False)
    run('nan-conditional-depth', 'ponytail', lambda d,r:change_measurement(d,r,'targetProjectedPlaneDepthM',float('nan')), False)
    def footprint(d, r, key, value):
        d['contact-report.json']['records'][0]['measurements'][0]['positiveDepthTextureFootprints'][0][key] = value
    run('zero-conditional-footprint', 'ponytail', lambda d,r:footprint(d,r,'conservativeTexelFootprint',0), False)
    run('opaque-conditional-footprint', 'ponytail', lambda d,r:footprint(d,r,'maxAlpha0To255',1), False)
    run('single-v-orientation', 'ponytail', lambda d,r:footprint(d,r,'flipV',d['contact-report.json']['records'][0]['measurements'][0]['positiveDepthTextureFootprints'][1]['flipV']), False)
    def consistent_false_depth(d, r):
        record = d['contact-report.json']['records'][0]
        for measurement in record['measurements']:
            measurement['targetProjectedPlaneDepthM'] = .0001
        record['summary']['maxProjectedPlaneDepthM'] = .0001
    run('positive-but-false-depth', 'ponytail', consistent_false_depth, False)
    run('positive-but-false-footprint-count', 'ponytail', lambda d,r:footprint(d,r,'conservativeTexelFootprint',1), False)
    def false_collider(d, r):
        d['fit.json']['dynamics']['colliders'][0]['radius'] += .001
    run('fit-collider-differs-from-target-measurement', 'ponytail', false_collider, False)
    run('failed-target-no-publication', mutate=lambda d,r:r.update(status='failed'), expected=False)
    stable = all(sha((source/name).read_bytes()) == expected for name, expected in inputs.items())
    integration_commit = subprocess.run(['git','rev-parse','HEAD'], cwd=source, capture_output=True, check=True).stdout.decode('ascii').strip()
    producer_names = [name for name in inputs if not name.startswith('prototype/public/assets/m2-representative-batch-v2/')]
    integration_names = [name for name in inputs if name not in producer_names]
    def match_commit(commit, names):
        tree = subprocess.run(['git','ls-tree','-rz',commit,'--',*names], cwd=source, capture_output=True, check=True).stdout
        expected_blobs = {entry.split(b'\t',1)[1].decode('utf-8'):entry.split(b'\t',1)[0].split()[-1].decode('ascii') for entry in tree.split(b'\0') if entry}
        actual_blobs = subprocess.run(['git','hash-object','--no-filters','--',*names], cwd=source, capture_output=True, check=True).stdout.decode('ascii').splitlines()
        return all(expected_blobs.get(name) == blob for name, blob in zip(names, actual_blobs)) and len(actual_blobs) == len(names)
    exact_commit = match_commit(args.producer_commit, producer_names)
    exact_integration = match_commit(integration_commit, integration_names)
    report = {'status':'passed' if stable and exact_commit and exact_integration and all(c['passed'] for c in checks) else 'failed', 'producerCommit': args.producer_commit,
              'publisherSha256': sha(snapshot), 'cases': checks, 'inputFiles': [{'path':k,'sha256':v} for k,v in inputs.items()],
              'sourceInputsStable': stable, 'sourceInputsMatchExactProducerCommit': exact_commit, 'integrationCommit': integration_commit, 'runtimeInputsMatchExactIntegrationCommit': exact_integration, 'integrationInputPaths': integration_names, 'scope':'Actual publisher CLI in private roots. Binary inputs are read-only hardlinks, mutations only replace private JSON. No primary public publication or GPU.'}
    write(OUT/'v2-results.json', report)
    # One native filesystem API removes only this explicitly verified private root.
    assert scratch.resolve().parent == OUT.resolve() and scratch.name.startswith('hair-v2-')
    shutil.rmtree(scratch)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
