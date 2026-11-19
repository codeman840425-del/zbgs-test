"""Stage the pinned ankle-boot diagnostic in an in-project detached worktree.

Re-run with the same checkout and commit to verify the three installed files.
The committed profile and plain uniform inputs remain the baseline for every run.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flow import GLB, Validator, require
from native_mesh_budget import accessor
from production_paths import main_checkout, project_output
from register_native_accessories import publish
from readback import neutral_skin_error, radial_gaps, rim_vertices
from surfaces import triangles


BODY = 'source-male-cc0-texture-release-v1'
BODY_SHA = '2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617'
FLAT = 'cc0-texture-release-flat-shoes-v1'
FLAT_SHA = '9c69190ffd2efc29f8e9b4d04cccef631b78c1fa744689fa57af1f416e70e756'
PANTS = 'cc0-texture-release-uniform-pants-v1'
PANTS_SHA = '849d1b87cbe08dbec1b8d76cda4dd329cd76151df2e0320de803a6e982fd7de0'
TOP = 'cc0-texture-release-uniform-top-1k-v1'
AUTHOR_SHA = '6198722db7ed4195c90c6d437547727af59daa3efdb1cff06f639bbc58f9b266'
ORIGINAL_BOOT = 'toigo-cc0-male-ankle-boot-fit-v1'
ORIGINAL_BOOT_SHA = '7151301ade15e62870524f670de5b7b5d017e3bbeb60dc93aff2a90167381f53'
ORIGINAL_BOOT_PATH = 'assets-source/ankle-boot-fit-v1/generated/' + ORIGINAL_BOOT + '.glb'
DEFAULT_RECIPE = 'assets-source/ankle-boot-fit-v1/stage-room-v1.json'
PROFILES = 'prototype/src/source-outfit-profiles.json'
AUTHOR = 'evidence/m2-footwear-author-intake-v1/selected-source.json'
IDENT = re.compile(r'[a-z][a-z0-9-]{1,95}')
EQUIPMENT_ROLE = re.compile(r'ankleBoot[A-Za-z0-9]{0,25}')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value, newline=b'\n'):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode().replace(b'\n', newline)


def checked(path):
    actual = project_output(path, __file__)
    require(actual == path, f'Redirected ankle-boot path: {path}')
    return actual


def fixed_checkout(checkout, main, revision, assets):
    require(re.fullmatch(r'[a-fA-F0-9]{7,40}', revision), 'Provide the exact source commit (at least seven hex digits)')
    require(checkout.is_relative_to(main / 'experiments' / 'worktrees') and
            checkout != main / 'experiments' / 'worktrees', 'Expected a registered worktree under experiments/worktrees')
    env = os.environ.copy()
    variables = subprocess.check_output(['git', 'rev-parse', '--local-env-vars'], cwd=main).splitlines()
    for name in variables:
        env.pop(os.fsdecode(name), None)
    env['GIT_OPTIONAL_LOCKS'] = '0'

    def git(cwd, *args):
        return subprocess.check_output(['git', *args], cwd=cwd, env=env)

    listing = git(main, 'worktree', 'list', '--porcelain', '-z').split(b'\0')
    detached = matches = False
    for field in listing:
        if field.startswith(b'worktree '):
            matches = Path(os.fsdecode(field[9:])).resolve() == checkout
        elif field == b'detached' and matches:
            detached = True
    require(detached, 'Expected a detached worktree registered to this project')
    require(Path(os.fsdecode(git(checkout, 'rev-parse', '--show-toplevel').strip())).resolve() == checkout,
            'Checkout root differs from the registered worktree')
    common = lambda cwd: Path(os.fsdecode(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').strip())).resolve()
    require(common(checkout) == common(main), 'Checkout Git metadata belongs to another project')
    head = git(checkout, 'rev-parse', 'HEAD').decode().strip()
    require(head == git(main, 'rev-parse', '--verify', '--end-of-options', revision + '^{commit}').decode().strip(),
            'Worktree HEAD differs from the requested fixed commit')
    status = git(checkout, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames')
    allowed = {b' M ' + PROFILES.encode(), *(b'?? ' + name.encode() for name in assets)}
    require(all(row in allowed for row in status.split(b'\0') if row), 'Worktree has unrelated or staged changes')
    return head, git(checkout, 'show', 'HEAD:' + PROFILES)


def pinned(reader, descriptor, prefixes):
    require(isinstance(descriptor, dict) and set(descriptor) == {'path', 'sha256'} and
            isinstance(descriptor['path'], str) and descriptor['path'].startswith(prefixes),
            'Expected a pinned project input')
    return reader.pin(descriptor['path'], descriptor['sha256'])


def configuration(main, recipe):
    recipe = checked(Path(os.path.abspath(recipe))) if recipe is not None else checked(main / DEFAULT_RECIPE)
    raw = recipe.read_bytes()
    data = json.loads(raw)
    require(data['schema'] == 'ankleboot-room-staging-v1' and
            set(data) <= {'schema', 'roomCase', 'asset', 'fitReport', 'readback', 'output', 'bottom'},
            'Unsupported ankle-boot staging recipe')
    case = json.loads(pinned(Validator(main), data['roomCase'], 'assets-source/'))
    case_fields = {'schema', 'label', 'bodySha256', 'outfitIndex', 'role', 'equipmentRole', 'id', 'sha256'}
    bottom = data.get('bottom')
    if bottom is not None:
        case_fields.add('pairedPants')
    require(set(case) == case_fields and
            case['schema'] == 'footwear-room-case-v1' and IDENT.fullmatch(case['label']) and case['bodySha256'] == BODY_SHA and
            type(case['outfitIndex']) is int and 3 <= case['outfitIndex'] <= 99 and
            IDENT.fullmatch(case['role']) and case['role'].startswith('pants-top-far-ankleboot') and
            EQUIPMENT_ROLE.fullmatch(case['equipmentRole']) and IDENT.fullmatch(case['id']) and
            case['id'].startswith('toigo-cc0-male-ankle-boot-') and case['sha256'] == data['asset']['sha256'],
            'Room case does not match the 1K male ankle-boot mechanism')
    output = data['output']
    require(set(output) == {'directory', 'name', 'outfitLabel', 'fitId', 'version'} and
            IDENT.fullmatch(output['directory']) and output['directory'].startswith('ankle-boot-') and
            IDENT.fullmatch(output['fitId']) and type(output['version']) is int and output['version'] >= 1 and
            all(isinstance(output[key], str) and output[key].strip() for key in ('name', 'outfitLabel')),
            'Invalid diagnostic output settings')
    if bottom is not None:
        require(set(bottom) == {'asset', 'id', 'equipmentRole', 'name', 'fitId', 'version'} and
                IDENT.fullmatch(bottom['id']) and bottom['id'].startswith('cc0-texture-release-') and bottom['id'] != PANTS and
                EQUIPMENT_ROLE.fullmatch(bottom['equipmentRole']) and bottom['equipmentRole'] != case['equipmentRole'] and
                IDENT.fullmatch(bottom['fitId']) and type(bottom['version']) is int and bottom['version'] >= 1 and
                isinstance(bottom['name'], str) and bottom['name'].strip(), 'Invalid paired trousers settings')
        require(case['pairedPants'] == {'reference': {'id': PANTS, 'sha256': PANTS_SHA},
                                      'candidate': {'id': bottom['id'], 'sha256': bottom['asset']['sha256']}},
                'Paired trousers settings differ from the room case')
    return data, case, sha(raw)


def primitive(glb):
    mesh, = glb.doc['meshes']
    result, = mesh['primitives']
    return result


def verify_shared_pattern(original, derived):
    first, next_ = primitive(original), primitive(derived)
    require(first.get('mode', 4) == next_.get('mode', 4) == 4 and first.get('material') == next_.get('material'),
            'Derived pattern changes the triangle primitive or its material')
    before = original.doc['accessors'][first['attributes']['POSITION']]
    after = accessor(derived, next_['attributes']['POSITION'])
    require(after.shape == (before['count'], 3) and np.isfinite(after).all(), 'Derived pattern changes the position stream shape')
    for stream in ('TEXCOORD_0', 'WEIGHTS_0', 'JOINTS_0'):
        require(accessor(original, first['attributes'][stream]).tobytes() ==
                accessor(derived, next_['attributes'][stream]).tobytes(), 'Derived pattern differs in ' + stream)
    require(accessor(original, first['indices']).tobytes() == accessor(derived, next_['indices']).tobytes(),
            'Derived pattern topology differs')
    require(original.bind_by_name() == derived.bind_by_name(), 'Derived pattern inverse binds differ')
    for field in ('materials', 'textures', 'samplers'):
        require(original.doc.get(field) == derived.doc.get(field), 'Derived pattern changes ' + field)

    def pictures(glb):
        for image in glb.doc.get('images', []):
            view = glb.doc['bufferViews'][image['bufferView']]
            offset = view.get('byteOffset', 0)
            yield image['mimeType'], glb.binary[offset:offset + view['byteLength']]

    require(list(pictures(original)) == list(pictures(derived)), 'Derived pattern texture bytes differ')


def verify_cuffs(boot, body, pants, cuff, boot_sha):
    require(cuff['schema'] == 'ankleboot-target-cuff-readback-v1' and cuff['assetSha256'] == boot_sha and
            set(cuff['cuffs']) == {'left', 'right'}, 'Wrong cuff readback identity')
    part = primitive(boot)
    attrs = part['attributes']
    rings = rim_vertices(accessor(boot, attrs['POSITION']), accessor(boot, part['indices']).reshape(-1, 3))
    bare = np.concatenate([triangles(body, face) for face in body.doc['meshes'][1]['primitives']
                           if 'Body_00_SKIN' in body.doc['materials'][face['material']]['name']])
    surfaces = {'bareShin': bare, 'pants': triangles(pants, primitive(pants))}
    measured = {'left' if ring[:, 0].mean() < 0 else 'right': radial_gaps(ring, surfaces) for ring in rings}

    def matches(actual, reported):
        if isinstance(actual, dict):
            return set(actual) == set(reported) and all(matches(value, reported[key]) for key, value in actual.items())
        if isinstance(actual, list):
            return len(actual) == len(reported) and all(matches(a, b) for a, b in zip(actual, reported))
        if isinstance(actual, float):
            return isinstance(reported, (int, float)) and math.isclose(actual, reported, rel_tol=0, abs_tol=1e-8)
        return type(actual) is type(reported) and actual == reported

    displacement = neutral_skin_error(boot, attrs)
    require(0 <= displacement < 1e-6 and matches(displacement, cuff['maxNeutralSkinnedDisplacementM']) and
            matches(measured, cuff['cuffs']), 'Cuff readback does not match measured boot, bare shin and trousers')


def build_candidate(main, checkout, profiles, data, case):
    source, target = Validator(main), Validator(checkout)
    fit = json.loads(pinned(source, data['fitReport'], 'assets-source/'))
    author = json.loads(source.pin(AUTHOR, AUTHOR_SHA))
    raw = pinned(source, data['asset'], 'assets-source/')
    boot = GLB(raw)
    boot_id = case['id']
    boot_sha = case['sha256']
    require(boot.doc['meshes'][0]['name'] == boot_id, 'Boot mesh owner differs from the room case')
    require(fit['runtimeAccepted'] is False and author['catalogLicense'] == author['embeddedMeshAndFitLicense'] == 'CC0',
            'Expected the pinned diagnostic and authored CC0 source')

    profile = profiles[BODY]
    body_path = target.url(profile['url'])
    require(profile['id'] == BODY and profile['sha256'] == BODY_SHA, 'Wrong target body profile')
    body = GLB(target.pin(body_path, BODY_SHA))
    ids = profile['ids']
    require([ids[k] for k in ('topFar', 'shoes', 'pants')] == [TOP, FLAT, PANTS], 'Wrong 1K outfit inputs')
    existing = profile['extraOutfits']
    baseline, = (row for row in existing if row['index'] == 1)
    require(baseline['role'] == 'pants-top-far' and baseline['bottomRole'] == 'pants' and
            baseline['equipmentRoles'] == ['topFar', 'shoes', 'pants'], 'Wrong original outfit selection')
    require(all(row['index'] != case['outfitIndex'] and row['role'] != case['role'] for row in existing) and
            case['equipmentRole'] not in ids and boot_id not in ids.values(), 'The committed profile already uses the diagnostic selection')

    base = json.loads(target.pin(target.url(profile['manifestUrl']), profile['manifestSha256']))
    require(base['schema'] == 'zbgs-equipment-v1', 'Wrong base equipment schema')
    flat = target.item(base, FLAT)
    pants = target.item(base, PANTS)
    top = target.item(base, TOP)
    for item, kind in ((flat, 'shoes'), (pants, 'bottom'), (top, 'top')):
        require(item['slot'] == kind and item['compatibleAvatarSha256'] == BODY_SHA, 'Wrong 1K equipment body or slot')
        target.pin(target.url(item['url']), item['sha256'], item['bytes'])
    require(flat['sha256'] == FLAT_SHA and pants['sha256'] == PANTS_SHA, 'Flat shoe or pants differ from fixed inputs')
    original_pants = GLB(target.pin(target.url(pants['url']), PANTS_SHA, pants['bytes']))
    output = data['output']
    folder = '/assets/' + output['directory'] + '/'
    bottom = data.get('bottom')

    def entry(asset, glb, name, settings, slot, original, style_id, license_, method, limits):
        bindings = glb.bind_by_name()
        require(set(bindings) == {row['sourceBone'] for row in original['bindings']},
                'Derived item differs in the raw bone set')
        row = {'id': name, 'name': settings['name'], 'slot': slot,
               'url': folder + name + '.glb', 'sha256': asset['sha256'], 'bytes': len(source.pin(asset['path'], asset['sha256'])),
               'fitId': settings['fitId'], 'styleId': style_id, 'version': settings['version'],
               'compatibleAvatarSha256': BODY_SHA, 'preserveOriginalBody': True, 'requiresRawSkeleton': True,
               'bindings': [{k: binding[k] for k in ('sourceBone', 'targetRawBone', 'humanoidSemantic')} |
                            {'inverseBindMatrix': bindings[binding['sourceBone']]} for binding in original['bindings']],
               'sourceLicense': license_, 'method': method, 'limits': limits}
        asset_path = Path(asset['path'])
        audit = source.equipment(row | {'url': asset_path.name}, BODY_SHA, body, asset['path'])
        return row, audit

    limits = ['Diagnostic only. Cuff intersections with the bare shin and long pants are known.',
              'No runtime or formal outfit admission.']
    paired_pants = original_pants
    items = []
    files = {'prototype/public' + folder + boot_id + '.glb': raw}
    if bottom is None:
        require(fit['schema'] == 'ankleboot-target-rest-fit-v1' and fit['assetSha256'] == boot_sha and fit['bytes'] == len(raw) and
                fit['source'] == author['asset'] and [body_path, BODY_SHA] == fit['body'] and
                [target.url(flat['url']), FLAT_SHA] == fit['flatReference'] and [target.url(pants['url']), PANTS_SHA] == fit['pants'],
                'Original rest-fit report differs from the pinned boot and uniform')
        cuff = json.loads(pinned(source, data['readback'], ('evidence/', 'assets-source/')))
    else:
        require(fit['schema'] == 'ankleboot-paired-layer-fit-v2' and fit['bodySha256'] == BODY_SHA and 'readback' not in data,
                'Paired trousers require the exact paired fit report and its cuff readback')
        pants_raw = pinned(source, bottom['asset'], 'assets-source/')
        paired_pants = GLB(pants_raw)
        for row, identifier, spec, pin, bytes_, previous in (
            (fit['boot'], boot_id, output, boot_sha, raw, ORIGINAL_BOOT_SHA),
            (fit['pants'], bottom['id'], bottom, bottom['asset']['sha256'], pants_raw, PANTS_SHA),
        ):
            require((row['id'], row['fitId'], row['sha256'], row['bytes'], row['sourceSha256']) ==
                    (identifier, spec['fitId'], pin, len(bytes_), previous), 'Paired fit identities differ')
        require(bottom['equipmentRole'] not in ids and bottom['id'] not in ids.values() and
                paired_pants.doc['meshes'][0]['name'] == bottom['id'], 'Paired trousers conflict with the committed profile or mesh')
        verify_shared_pattern(original_pants, paired_pants)
        limits = ['Diagnostic only. Cuff readback measures the bare shin and this paired trousers asset.',
                  'No runtime or formal outfit admission.']
        pants_entry, _ = entry(bottom['asset'], paired_pants, bottom['id'], bottom, 'bottom', pants,
                              pants['styleId'], pants['sourceLicense'], 'Pinned paired diagnostic with the original trousers topology and target raw binds.', limits)
        items.append(pants_entry)
        files['prototype/public' + pants_entry['url']] = pants_raw
        cuff = fit['cuffReadback']

    verify_shared_pattern(GLB(source.pin(ORIGINAL_BOOT_PATH, ORIGINAL_BOOT_SHA)), boot)
    verify_cuffs(boot, body, paired_pants, cuff, boot_sha)
    shoe, audit = entry(data['asset'], boot, boot_id, output, 'shoes', flat, 'toigo-ankle-boots-male',
                        {'catalog': author['catalog'], 'author': author['author'], 'license': author['catalogLicense'],
                         'receiptSha256': AUTHOR_SHA}, 'Pinned diagnostic boot with the author UVs and six target raw bone binds.', limits)
    require(audit['bones'] == 6 and (bottom is not None or audit['weightedVertices'] == fit['renderVertices']),
            'Boot geometry differs from the CPU fit report')
    catalog = 'prototype/public' + folder + 'equipment.json'
    files[catalog] = encoded({'schema': base['schema'], 'items': [shoe, *items]})
    readback_sha = data['readback']['sha256'] if bottom is None else sha(encoded(cuff))
    return files, catalog, readback_sha


def verify_paired_selector(checkout, ids, outfit):
    selector = checked(checkout / 'prototype/src/outfit-selection.js')
    result = subprocess.run(['node', '--input-type=module', '-e', """
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {outfitSelection} = await import(pathToFileURL(process.argv[1]));
const {ids, outfit} = JSON.parse(readFileSync(0, 'utf8'));
const look = outfitSelection({ids, outfits:[outfit]}, outfit.index);
assert.equal(look.bottomRole, 'pants');
assert.equal(look.bottomEquipmentRole, outfit.bottomEquipmentRole);
assert.deepEqual(look.ids, outfit.equipmentRoles.map(role => ids[role]));
""", str(selector)], cwd=checkout, input=encoded({'ids': ids, 'outfit': outfit}), capture_output=True, check=False)
    require(result.returncode == 0, 'Fixed checkout cannot select the paired trousers: ' + result.stderr.decode('utf-8', 'replace').strip())


def run(checkout, revision, recipe=None):
    main = main_checkout(__file__)
    checkout = checked(Path(os.path.abspath(checkout)))
    data, case, recipe_sha = configuration(main, recipe)
    base = 'prototype/public/assets/' + data['output']['directory'] + '/'
    artifacts = [base + case['id'] + '.glb', base + 'equipment.json']
    bottom = data.get('bottom')
    if bottom is not None:
        artifacts.append(base + bottom['id'] + '.glb')
    paths = {name: checked(checkout / name) for name in (*artifacts, PROFILES)}
    temp_root = checked(main / 'experiments')
    head, committed = fixed_checkout(checkout, main, revision, artifacts)
    profiles = json.loads(committed)
    expected, catalog, readback_sha = build_candidate(main, checkout, profiles, data, case)
    profile = profiles[BODY]
    additions = profile.setdefault('additionalEquipmentManifests', [])
    manifest_url = catalog.removeprefix('prototype/public')
    require(all(row['url'] != manifest_url for row in additions), 'The committed profile already references the diagnostic manifest')
    additions.append({'url': manifest_url, 'sha256': sha(expected[catalog])})
    profile['ids'][case['equipmentRole']] = case['id']
    bottom_role = 'pants'
    if bottom is not None:
        bottom_role = bottom['equipmentRole']
        profile['ids'][bottom_role] = bottom['id']
    outfit = {'index': case['outfitIndex'], 'role': case['role'], 'bottomRole': 'pants',
              'equipmentRoles': ['topFar', case['equipmentRole'], bottom_role],
              'label': data['output']['outfitLabel']}
    if bottom is not None:
        outfit['bottomEquipmentRole'] = bottom_role
        verify_paired_selector(checkout, profile['ids'], outfit)
    profile['extraOutfits'].append(outfit)

    before = paths[PROFILES].read_bytes()
    newline = b'\r\n' if b'\r\n' in before else b'\n'
    expected[PROFILES] = encoded(profiles, newline)
    changes = []
    for name, payload in expected.items():
        path = paths[name]
        current = path.read_bytes() if path.exists() else None
        baseline = (current is not None and current.replace(b'\r\n', b'\n') == committed.replace(b'\r\n', b'\n')) if name == PROFILES else current is None
        require(current == payload or baseline, f'Existing diagnostic destination differs: {name}')
        if current != payload:
            changes.append((path, current, payload))
    if changes:
        fixed_checkout(checked(checkout), main, head, artifacts)
        for path, _, _ in changes:
            checked(path)
        publish(checked(temp_root), changes)
    return {'status': 'diagnostic-only', 'sourceCommit': head, 'checkout': str(checkout), 'bodySha256': BODY_SHA,
            'recipeSha256': recipe_sha, 'roomCaseSha256': data['roomCase']['sha256'], 'fitReportSha256': data['fitReport']['sha256'],
            'readbackSha256': readback_sha,
            'changed': [path.relative_to(checkout).as_posix() for path, _, _ in changes],
            'files': {name: sha(raw) for name, raw in expected.items()}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--recipe', type=Path, help='Project-local staging recipe (defaults to stage-room-v1.json)')
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.checkout, args.commit, args.recipe), ensure_ascii=False))
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
