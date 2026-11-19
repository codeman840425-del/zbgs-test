"""Produce two original-hair, neutral-face glasses candidates from the fixed fit intake."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from flow import ROOT, Validator, require
from production_paths import project_output, publish_new_directory

ASSETS = ROOT / 'assets-source/uniform-glasses-transfer-v1'
CHECKOUT = ROOT / 'experiments/worktrees/live-pair-1239c0e2'
COMMIT = '1239c0e2a7c2ecaa226fdb8a40bd4e12f710b068'
INTAKE = 'evidence/m2-uniform-live-fit-intake-v1'
REPORT_SHA = 'bb26805e78ff4353dedc177db6aa1fdcd401c629ae88e04d50e6212f3b5d26b5'
COMPARE_SHA = '2c5670e11d4899a1f60759f430ce018be48116086c7f6aa2f70ad422d68ddb0a'
KINDS = {'source-female-uniform-texture-v1': ('female', 'exact-parent-transfer-candidate'),
         'source-male-cc0-texture-release-v1': ('male', 'neutral-surface-diagnostic-candidate')}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode()


def replay(checkout):
    reader = Validator()
    reader.pin(INTAKE + '/compare-glasses.mjs', COMPARE_SHA)
    raw = reader.pin(INTAKE + '/glasses.json', REPORT_SHA)
    commit = subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip()
    require(commit == COMMIT, 'Unexpected reference checkout commit')
    command = ['node', str(ROOT / INTAKE / 'compare-glasses.mjs'), str(checkout)]
    actual = subprocess.check_output(command, env={**os.environ, 'NODE_DISABLE_COMPILE_CACHE': '1'})
    require(json.loads(actual) == json.loads(raw), 'Fixed body, frame or measured geometry differs from intake')
    return json.loads(raw)


def make_candidates(recipe, checkout, intake):
    require(set(recipe) == {'schema', 'referenceCommit', 'neutralFace', 'hair', 'accessoryId', 'accessorySha256', 'targets'}
            and recipe['schema'] == 'uniform-glasses-transfer-v1' and recipe['referenceCommit'] == COMMIT
            and recipe['neutralFace'] is True and recipe['hair'] == 'original', 'Unsupported transfer scope')
    accessory = intake['accessory']
    require((recipe['accessoryId'], recipe['accessorySha256']) == (accessory['id'], accessory['sha256']),
            'Glasses frame differs from intake')
    rows = recipe['targets']
    require(len(rows) == len(KINDS) and {r['body'] for r in rows} == set(KINDS), 'Expected both 1K targets')
    reader = Validator(checkout)
    manifest = json.loads(reader.pin('prototype/src/glasses-temple-fit-manifest.json', intake['registrySha256']))
    files, provenance, ids = {}, [], set()
    for row in rows:
        body = row['body']
        donor, level = KINDS[body]
        require(set(row) == {'body','bodySha256','donor','donorFitSha256','id','level'} and
                (row['donor'], row['level']) == (donor, level), 'Wrong donor or candidate level for ' + body)
        target, = [t for t in intake['targets'] if t['body'] == body]
        require(row['bodySha256'] == target['bodySha256'], 'Target body differs from intake')
        compare, = [c for c in target['comparisons'] if c['donor'] == donor]
        exact = level == 'exact-parent-transfer-candidate'
        require(compare['reuseEligible'] == exact and compare['provenParent'] == exact, 'Donor evidence changed')
        entry, = [r for r in manifest['profiles'] if r['body'] == donor]
        require(entry['sha256'] == compare['fitSha256'] == row['donorFitSha256'] and
                entry['bodySHA256'] == compare['donorSha256'], 'Donor body or fit identity differs')
        source = json.loads(reader.pin(reader.url(entry['url']), entry['sha256'], entry['bytes']))
        require(source['bodySHA256'] == entry['bodySHA256'] and source['accessorySHA256'] == accessory['sha256'],
                'Source profile identities differ')
        new_id = row['id']
        require(isinstance(new_id, str) and re.fullmatch(r'[a-z][a-z0-9-]{1,79}', new_id) and
                new_id not in ids and new_id not in {d['fitId'] for d in intake['donors']}, 'Invalid or reused fit ID')
        ids.add(new_id)
        basis = ('Source and target have identical original head-fit inputs.' if exact else
                 'Diagnostic transfer from a different rig; only neutral original-hair surfaces were compared.')
        candidate = {**source, 'id':new_id, 'bodySHA256':target['bodySha256'], 'limits':[
            basis, 'The ear bounds and crest in the controls are donor measurements.',
            'Target loading, posed ear support and visual review remain pending.']}
        name = body + '.json'
        files[name] = encoded(candidate)
        provenance.append({'body':body, 'targetSha256':target['bodySha256'], 'level':level,
            'donor':compare, 'donorFitId':source['id'], 'file':name, 'fitId':new_id,
            'sha256':hashlib.sha256(files[name]).hexdigest(), 'bytes':len(files[name])})
    files['provenance.json'] = encoded({'schema':'uniform-glasses-transfer-provenance-v1', 'referenceCommit':COMMIT,
        'intake':{'path':INTAKE + '/glasses.json', 'sha256':REPORT_SHA}, 'hair':'original', 'neutralFace':True,
        'accessory':accessory, 'posedTargetMeasured':False, 'runtimeAdmission':False, 'candidates':provenance})
    return files


def verify(directory, files):
    require(directory.is_dir() and {p.name for p in directory.iterdir()} == set(files), 'Candidate file set differs')
    for name, data in files.items():
        path = directory / name
        require(project_output(path, __file__) == path and path.is_file() and path.read_bytes() == data,
                'Existing candidate differs: ' + name)


def run(recipe, checkout, output, check_only=False):
    destination = project_output(output, __file__)
    require(destination == Path(output).absolute(), 'Redirected candidate output')
    files = make_candidates(json.loads(recipe.read_bytes()), checkout.resolve(), replay(checkout.resolve()))
    if check_only or destination.exists():
        verify(destination, files)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.glasses-', dir=destination.parent) as folder:
        staged = Path(folder) / 'generated'
        staged.mkdir()
        for name, data in files.items():
            (staged / name).write_bytes(data)
        try:
            publish_new_directory(staged, destination)
        except FileExistsError:
            verify(destination, files)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--recipe', type=Path, default=ASSETS / 'recipe.json')
    cli.add_argument('--checkout', type=Path, default=CHECKOUT)
    cli.add_argument('--output', type=Path, default=ASSETS / 'generated')
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    try:
        run(args.recipe, args.checkout, args.output, args.check)
        print('Verified two target-specific glasses candidates.')
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        cli.error(str(error))
