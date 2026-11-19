"""Register the two measured original-hair glasses fits for internal character records."""
import argparse
import json
from pathlib import Path
import subprocess

from native_import import ROOT, confined, digest
from production_paths import main_checkout, project_output, resolve_output_path
from register_native_accessories import ACCESSORIES, GLASSES, check, merge, public_path, publish, read_pin, registered_asset
from stage_glasses_preview import CATALOG
from uniform_glasses_transfer import ASSETS, KINDS, encoded

RECIPE = ASSETS / 'technical-registration.json'
HEAD = {'hairStyle': 'original', 'faceGeometry': 'neutral'}
REVIEWED_COMMIT = 'da9cae259fe5ebb1c718b4d17fc10312592834cd'


def pinned(path, sha):
    raw = path.read_bytes()
    check(digest(raw) == sha, f'SHA mismatch: {path}')
    return raw


def case(rows, field, body):
    row, = [item for item in rows if item[field] == body]
    return row


def check_head_run(run, mode, build, spec, frame_sha, bob_sha, folder):
    body = spec['bodyType']
    check(run['schema'] == 'uniform-glasses-head-v1' and run['mode'] == mode
          and run['status'] == ('reproduced' if mode == 'before' else 'passed')
          and run['build']['sourceDigest'] == build and run['diagnosticMode'] == 'glassesFit=candidate',
          f'Missing completed {mode} compatibility run')
    row = case(run['cases'], 'bodyType', body)
    check(not row.get('failure') and row['pageErrors'] == [] and row['build']['sourceDigest'] == build
          and row['sourcePins']['fit']['sha256'] == spec['fitSHA256']
          and row['sourcePins']['asset']['sha256'] == frame_sha, 'Compatibility inputs differ: ' + body)
    steps = row['steps']
    restored = [s['result'].get('recordSha256') for s in steps if 'operation' not in s]
    check(spec['recordSha256'] in restored, 'Signed original differs')
    controls = [s for s in steps if s['state']['hair']['effective'] == 'original'
                and s['state']['glasses']['loaded'] and s['result']['applied']]
    check(controls and all(s['state']['glasses']['identity']['fit']['sha256'] == spec['fitSHA256'] for s in controls),
          'Original-hair control missing')
    if bob_sha in restored:
        # The fixture interacts in both orders. Its pinned browser report already
        # verifies preserved meshes and exact refusal reasons after each command.
        if mode == 'before':
            incompatible = [s for s in steps if s['state']['hair']['effective'] != 'original' and s['state']['glasses']['loaded']]
        else:
            incompatible = [s for s in steps if s['result']['applied'] is False]
        outcomes = [s['operation']['type'] for s in incompatible]
        check(sorted(outcomes) == ['accessory', 'appearance'], 'Incomplete two-way head compatibility evidence')
    for step in steps:
        if 'image' in step:
            image = step['image']
            pinned(confined(folder, image['file']), image['sha256'])
    return bob_sha in restored


def check_poses(posed, motion, fit, spec, recipe, folders):
    body = spec['bodyType']
    geometry = [{'mesh': c['mesh'], 'sourcePositionSHA256': c['positionSHA256'], 'vertices': c['vertices'],
                 'rings': [r['indices'] for r in c['rings']], 'earCrestAccessoryLocal': c['earCrestAccessoryLocal']}
                for c in fit['controls']]
    check({c['mesh'] for c in geometry} == {'Temple1', 'Temple-1'} and len(geometry) == 2
          and all(len(c['rings']) == 4 for c in geometry), 'Both four-ring temples are required')
    check(posed['errors'] == motion['errors'] == [] and posed['signedInput'] == motion['signedRestore']
          and posed['signedInput']['recordSha256'] == spec['recordSha256'] and posed['signedInput']['hair'] == 'original'
          and posed['fit'] == motion['glasses']['fit'] and posed['fit']['id'] == fit['id']
          and posed['fit']['sha256'] == spec['fitSHA256'] and posed['fit']['bodySHA256'] == spec['bodySHA256']
          and posed['fit']['accessorySHA256'] == fit['accessorySHA256'], 'Different posed or motion identities: ' + body)
    for observed in (posed['geometry']['standing'], posed['geometry']['seated'], motion['geometryBefore'], motion['geometryAfter']):
        check(observed['temples'] == geometry, 'Measured four-ring temple source differs: ' + body)
    for pose in ('stand', 'sit'):
        views = posed['closeups'][pose]
        check(views, 'Missing pose views: ' + pose)
        for view in views:
            name = view['file']
            pinned(confined(folders['posed'], name), recipe['posedImages'][name])
    tasks = [(t['kind'], t['state']) for t in motion['tasks']]
    check(tasks == [(k, 'completed') for k in ('walk', 'sit', 'stand')] and
          any(f['sitProgress'] == 1 and f['loaded'] and f['fitSHA256'] == spec['fitSHA256'] for f in motion['frames']),
          'Missing completed walk/sit/stand and settled sample with this fit: ' + body)
    film = motion['film']
    read_pin(confined(folders['motion'], film['file']), film)


def entries(root, recipe):
    check(recipe['schema'] == 'uniform-glasses-technical-registration-v1' and recipe['scope'] == 'internal-character-records'
          and recipe['headDependency'] == HEAD, 'Unsupported technical registration scope')
    reports, folders = {}, {}
    pins = recipe['reports']
    for key, pin in pins.items():
        file = confined(ROOT, pin['path'])
        reports[key] = json.loads(pinned(file, pin['sha256']))
        folders[key] = file.parent
    builds = recipe['builds']
    posed, motion = reports['posed'], reports['motion']
    check(builds['before'] != builds['after'] and posed['status'] == motion['status'] == 'candidate-only'
          and posed['errors'] == [] and posed['inputs']['build'] == motion['build']
          and motion['build']['sourceDigest'] == reports['cases']['sourceDigest'] == builds['before'],
          'Posed, motion and original candidate builds differ')
    for phase in ('before', 'after'):
        run = reports[phase]
        for key, link in [('cases', 'originalCases'), ('records', 'originalRecords'), ('bob', 'bobRecord')]:
            check(run[link]['sha256'] == pins[key]['sha256'], f'{phase} input differs: {key}')
    specs = reports['cases']['cases']
    check(len(specs) == len(KINDS) and {s['bodyType'] for s in specs} == set(KINDS), 'Expected the measured uniform pair')
    registry = json.loads(confined(root, CATALOG).read_bytes())
    check(registry['status'] == 'candidate-only', 'Expected the measured candidate source')
    assets = json.loads(confined(root, ACCESSORIES).read_bytes())['items']
    _, frame_sha = registered_asset(root, assets, 'studio-glasses-v1')
    check(reports['intake']['accessory']['sha256'] == frame_sha, 'Different glasses frame')
    result = []
    bob_runs = []
    for spec in specs:
        body, sha = spec['bodyType'], spec['bodySHA256']
        target = case(reports['intake']['targets'], 'body', body)
        check(target['bodySha256'] == sha, 'Different intake body')
        pinned(public_path(root, target['url']), sha)
        ref = case(registry['profiles'], 'bodyType', body)
        check(ref['headDependency'] == HEAD and ref['bodySHA256'] == sha and ref['sha256'] == spec['fitSHA256']
              and ref['status'] == 'cpu-candidate-only', 'Different candidate or head restriction: ' + body)
        fit = json.loads(read_pin(public_path(root, ref['url']), ref))
        check(fit['bodySHA256'] == sha and fit['accessorySHA256'] == frame_sha, 'Different body or frame in fit')
        record, = [r for r in reports['records'] if r['integrity']['recordSha256'] == spec['recordSha256']]
        look = record['appearanceRecipe']
        check(look['base'] == {'bodyType':body, 'sha256':sha} and look['appearance']['hairStyle'] == 'original'
              and look['geometry']['mouthWidth'] == 0 and all(look['geometry'][k+'Sample'] == 'none' for k in ('brow','nose','eye')),
              'Signed original head differs')
        check_poses(case(posed['cases'], 'bodyType', body), case(motion['cases'], 'bodyType', body), fit, spec, recipe, folders)
        for mode in ('before', 'after'):
            if check_head_run(reports[mode], mode, builds[mode], spec, frame_sha,
                              reports['bob']['integrity']['recordSha256'], folders[mode]):
                bob_runs.append((mode, body))
        result.append({'body':body, **{k:ref[k] for k in ('bodySHA256', 'url', 'sha256', 'bytes', 'headDependency')}})
    bob_body = reports['bob']['appearanceRecipe']['base']['bodyType']
    check(bob_runs == [('before', bob_body), ('after', bob_body)], 'Both runs must restore the signed bob')
    return result


def register(root, recipe_path=RECIPE):
    root = resolve_output_path(root)
    check(root.is_relative_to(main_checkout(__file__)), 'Registration checkout must be inside the production project')
    table = project_output(confined(root, GLASSES), __file__)
    lock = project_output(confined(root, 'prototype/src/native-accessory-registration.lock'), __file__)
    recipe = json.loads(recipe_path.read_bytes())
    commit = recipe['sourceCommit']
    check(commit == REVIEWED_COMMIT, 'Unknown compatibility runtime')
    git = ['git', '--no-optional-locks', '-C', str(root)]
    top = subprocess.check_output([*git, 'rev-parse', '--show-toplevel'], text=True).strip()
    check(Path(top).resolve() == root, 'Expected the root of an independent target checkout')
    # Compare runtime behavior. Test-only edits can change the separately recorded build digest.
    paths = ['prototype/src', ':!'+GLASSES, ':(exclude,glob)prototype/src/**/*.test.mjs']
    check(subprocess.run([*git, 'merge-base', '--is-ancestor', commit, 'HEAD']).returncode == 0 and
          subprocess.run([*git, 'diff', '--quiet', commit, '--', *paths]).returncode == 0,
          'Target differs from the fixed compatibility runtime for this recipe')
    with lock.open('x'):
        pass
    try:
        rows = entries(root, recipe)
        before = table.read_bytes()
        document = json.loads(before)
        check(document['schema'] == 'm1.glasses-temple-fit-manifest.1', 'Unexpected formal glasses table')
        for row in rows:
            merge(document['profiles'], row, ('body', 'bodySHA256', 'url'))
        after = before
        if document != json.loads(before):
            after = encoded(document)
            if b'\r\n' in before:
                after = after.replace(b'\n', b'\r\n')
            publish(table.parent, [(table, before, after)])
        return {'status':'already-registered' if after == before else 'technical-fits-registered',
                'table':str(table), 'beforeSha256':digest(before), 'afterSha256':digest(after),
                'scope':recipe['scope'], 'limits':recipe['limits'], 'profiles':rows}
    finally:
        lock.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(register(args.checkout), ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
