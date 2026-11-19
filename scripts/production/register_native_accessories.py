"""Register pinned native accessory candidates in the source catalogs."""
import argparse
import gzip
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile

from native_import import ROOT, confined, digest
from native_accessory_batch import is_unfitted_glasses_capture
from production_paths import main_checkout, resolve_output_path


GRIPS = 'prototype/public/assets/m1c/grips/manifest.json'
GLASSES = 'prototype/src/glasses-temple-fit-manifest.json'
PRESENTATION = 'prototype/src/native-microphone-presentation-fits.json'
ACCESSORIES = 'prototype/public/assets/m1c/accessories.json'
BODIES = 'prototype/src/native-production-catalog.json'
STATUS = 'cpu-candidate-only'


def check(condition, message):
    if not condition:
        raise ValueError(message)


def public_path(root, url):
    check(isinstance(url, str) and re.fullmatch(r'/assets/[a-z0-9/_.-]+', url),
          f'Invalid public asset URL: {url!r}')
    return confined(confined(root, 'prototype/public'), url[1:])


def read_pin(path, pin):
    raw = path.read_bytes()
    check(type(pin['bytes']) is int and len(raw) == pin['bytes'] and digest(raw) == pin['sha256'],
          f'Byte count or SHA-256 mismatch: {path}')
    return raw


def source(root, pin):
    path = confined(root, pin['path'])
    return path, read_pin(path, pin)


def vector(value, count):
    return (isinstance(value, list) and len(value) == count
            and all(type(x) in {int, float} and math.isfinite(x) for x in value))


def registration_target(root, entry, body, name):
    path = public_path(root, entry['url'])
    check(entry['url'].endswith(f'/{body}/{name}'), 'Fit URL does not match body and resource filename')
    return path


def registered_asset(root, assets, asset_id):
    entry, = [row for row in assets if row['id'] == asset_id]
    path = public_path(root, entry['url'])
    read_pin(path, entry)
    return path, entry['sha256']


def validate_microphone(root, folder, body, sha, row, asset):
    path, mic_sha = asset
    source_path, _ = source(root, row['mic'])
    check(row['status'] == STATUS and source_path == path and row['mic']['sha256'] == mic_sha,
          'Microphone candidate does not use the registered accessory')
    _, reference_grip = source(root, row['referenceGrip'])
    _, reference_presentation = source(root, row['referencePresentation'])
    source(root, row['referenceBody'])
    reference_grip = json.loads(reference_grip)
    reference_presentation = json.loads(reference_presentation)
    check(reference_grip['compatibleAvatarSha256'] == reference_presentation['targetBodySha256']
          == row['referenceBody']['sha256']
          and reference_grip['compatibleAccessorySha256'] == reference_presentation['microphoneReference']['sha256']
          == mic_sha, 'Microphone reference identities disagree')

    entry = row['gripEntry']
    check(set(entry) == {'id', 'compatibleAvatarSha256', 'accessoryId', 'accessorySha256',
                         'url', 'sha256', 'bytes'}
          and entry['compatibleAvatarSha256'] == sha
          and entry['accessoryId'] == 'studio-microphone-v1' and entry['accessorySha256'] == mic_sha,
          'Grip registry entry does not match the target body and microphone')
    grip_raw = read_pin(confined(folder, 'grip.json'), entry)
    grip = json.loads(grip_raw)
    check(grip['schema'] == 'zbgs-grip-profile-v1' and grip['id'] == entry['id']
          and grip['compatibleAvatarSha256'] == sha and grip['accessoryId'] == entry['accessoryId']
          and grip['compatibleAccessorySha256'] == mic_sha
          and grip['sourceGripSha256'] == row['referenceGrip']['sha256']
          and all(grip[key] == reference_grip[key] for key in (
              'fitVersion', 'micRawHandLocal', 'normalizedFingerRotations')),
          'Grip bytes do not match the candidate and pinned source')

    mouth_raw = confined(folder, 'mouth.json').read_bytes()
    mouth = json.loads(mouth_raw)
    presentation = json.loads(confined(folder, 'microphone-presentation.json').read_bytes())
    check(presentation == row['presentation']
          and presentation['bodySha256'] == mouth['avatarSha256'] == sha and mouth['body'] == body
          and presentation['anchorSourceSha256'] == row['mouthSha256'] == digest(mouth_raw)
          and presentation['microphoneSha256'] == mic_sha
          and mouth['schema'] == 'native-live-accessory-mouth-v1'
          and presentation['mouthRawHeadLocal'] == mouth['mouthRawHeadLocal']
          and presentation['capsuleLocal'] == reference_presentation['microphoneReference']['grilleFrontPoleLocal']
          and all(vector(presentation[key], 3) for key in (
              'mouthRawHeadLocal', 'capsuleLocal', 'speakingTipOffset', 'carryWristChestOffset'))
          and type(presentation['transitionRate']) in {int, float}
          and math.isfinite(presentation['transitionRate']) and presentation['transitionRate'] > 0,
          'Microphone presentation does not match the measured mouth and accessory')
    return entry, presentation, registration_target(root, entry, body, 'grip.json'), grip_raw


def validate_glasses(root, folder, body, sha, row, asset):
    _, glasses_sha = asset
    _, capture_raw = source(root, row['capture'])
    capture = json.loads(gzip.decompress(capture_raw))
    live = capture['live']
    check(row['status'] == STATUS and capture['pose'] == 'stand'
          and live['avatarSha256'] == sha and live['bodyType'] == body
          and live['fit']['eyeFitMethod'] == 'rendered-iris-centers-and-face-front-band'
          and is_unfitted_glasses_capture(live, sha, glasses_sha)
          and live['accessories']['glasses']['loaded']
          and live['accessories']['glasses']['sha256'] == glasses_sha,
          'Glasses capture does not match the exact unfitted body and accessory')
    entry = row['templeEntry']
    check(set(entry) == {'body', 'bodySHA256', 'url', 'sha256', 'bytes'}
          and entry['body'] == body and entry['bodySHA256'] == sha,
          'Temple registry entry does not match the target body')
    raw = read_pin(confined(folder, 'glasses.json'), entry)
    profile = json.loads(raw)
    check(profile['schema'] == 'm1.glasses-temple-fit.1' and profile['id'] == f'{body}-temple-v1'
          and profile['bodySHA256'] == sha and profile['accessorySHA256'] == glasses_sha
          and profile['sourceCapture'] == {key: row['capture'][key] for key in ('path', 'sha256')},
          'Glasses fit bytes do not match the body, accessory and measured capture')
    return entry, registration_target(root, entry, body, 'glasses.json'), raw


def merge(rows, entry, fields):
    collisions = [old for old in rows if any(old[key] == entry[key] for key in fields)]
    check(not collisions or collisions == [entry], f'Conflicting registration: {entry["url"]}')
    if not collisions:
        rows.append(entry)


def snapshot(path):
    return path.read_bytes() if path.exists() else None


def queue_asset(assets, path, raw):
    check(path not in assets or assets[path] == raw, f'Conflicting output path: {path}')
    assets[path] = raw


def publish(root, changes):
    """Replace manifests after installing resources. Roll back completed writes on failure."""
    parent_dirs = []
    applied = []
    with tempfile.TemporaryDirectory(prefix='.native-accessories-', dir=root) as directory:
        pending = []
        for i, (path, before, after) in enumerate(changes):
            staged = Path(directory) / f'{i}-new'
            staged.write_bytes(after)
            previous = None
            if before is not None:
                previous = Path(directory) / f'{i}-old'
                previous.write_bytes(before)
            pending.append((path, before, staged, previous))

        def make_parent(path):
            if not path.exists():
                make_parent(path.parent)
                path.mkdir()
                parent_dirs.append(path)

        try:
            for path, before, staged, previous in pending:
                check(snapshot(path) == before, f'Registration destination changed: {path}')
                make_parent(path.parent)
                if before is None:
                    os.link(staged, path)
                else:
                    os.replace(staged, path)
                applied.append((path, previous))
        except (OSError, ValueError, KeyboardInterrupt):
            for path, previous in reversed(applied):
                if previous is None:
                    path.unlink()
                else:
                    os.replace(previous, path)
            for parent in reversed(parent_dirs):
                if not any(parent.iterdir()):
                    parent.rmdir()
            raise


def register(result_path, root=ROOT):
    root = resolve_output_path(root)
    check(root.is_relative_to(main_checkout(__file__)), 'Registration checkout must be inside the production project')
    result_path = result_path.resolve()
    check(result_path.is_relative_to(root), 'Expected result file inside the target checkout')
    result = json.loads(result_path.read_bytes())
    check(result['schema'] == 'native-accessory-batch-result-v1' and result['targets'], 'Invalid fit result')
    catalog = json.loads(confined(root, BODIES).read_bytes())
    check(catalog['schema'] == 'native-production-catalog-v1', 'Invalid native body catalog')
    accessories = json.loads(confined(root, ACCESSORIES).read_bytes())
    check(accessories['schema'] == 'zbgs-accessory-candidate-v1', 'Invalid accessory manifest')
    targets = result['targets']
    names = [row['id'] for row in targets]
    check(all(isinstance(name, str) and re.fullmatch(r'[a-z][a-z0-9-]{0,100}', name) for name in names)
          and len(set(names)) == len(names), 'Expected unique target body IDs')
    has_mic = any('microphone' in row for row in targets)
    has_glasses = any('glasses' in row for row in targets)

    lock = confined(root, 'prototype/src/native-accessory-registration.lock')
    with lock.open('x', encoding='utf-8') as stream:
        stream.write('native-accessory-registration\n')
    try:
        originals = {}
        manifests = {}
        for name, schema in [(GRIPS, 'zbgs-grip-profile-manifest-v1'),
                             (GLASSES, 'm1.glasses-temple-fit-manifest.1'), (PRESENTATION, None)]:
            path = confined(root, name)
            old = snapshot(path)
            manifest = json.loads(old) if old is not None else {}
            check(isinstance(manifest, dict) and (schema is None or manifest.get('schema') == schema),
                  f'Unexpected registry schema: {name}')
            originals[path] = old
            manifests[name] = manifest
        mic_asset = registered_asset(root, accessories['items'], 'studio-microphone-v1') if has_mic else None
        glasses_asset = registered_asset(root, accessories['items'], 'studio-glasses-v1') if has_glasses else None
        assets = {}
        for row in targets:
            body = row['id']
            sha = row['body']['sha256']
            check(row['status'] == STATUS and ('microphone' in row or 'glasses' in row),
                  f'Fit result is incomplete or failed for {body}')
            profile, = [entry['profile'] for entry in catalog['entries'] if entry['bodyType'] == body]
            body_source, _ = source(root, row['body'])
            final_body = public_path(root, profile['url'])
            check(profile['sha256'] == sha and final_body.suffix == '.vrm', f'Body catalog binding differs: {body}')
            if body_source != final_body:
                read_pin(final_body, row['body'])
            folder = confined(result_path.parent, body)
            if 'microphone' in row:
                grip, fit, dest, raw = validate_microphone(root, folder, body, sha, row['microphone'], mic_asset)
                merge(manifests[GRIPS]['items'], grip, ('id', 'compatibleAvatarSha256', 'url'))
                check(sha not in manifests[PRESENTATION] or manifests[PRESENTATION][sha] == fit,
                      f'Conflicting microphone presentation for {body}')
                check(all(key == sha or value['id'] != fit['id'] for key, value in manifests[PRESENTATION].items()),
                      f'Microphone presentation ID already exists: {fit["id"]}')
                manifests[PRESENTATION][sha] = fit
                queue_asset(assets, dest, raw)
            if 'glasses' in row:
                entry, dest, raw = validate_glasses(root, folder, body, sha, row['glasses'], glasses_asset)
                merge(manifests[GLASSES]['profiles'], entry, ('body', 'bodySHA256', 'url'))
                queue_asset(assets, dest, raw)

        changes = []
        for path, raw in assets.items():
            before = snapshot(path)
            check(before is None or before == raw, f'Existing fit bytes differ: {path}')
            if before is None:
                changes.append((path, before, raw))
        for name, enabled in [(GRIPS, has_mic), (PRESENTATION, has_mic), (GLASSES, has_glasses)]:
            if enabled:
                path = confined(root, name)
                before = originals[path]
                document = manifests[name]
                if before is None or json.loads(before) != document:
                    after = (json.dumps(document, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()
                    changes.append((path, before, after))
        if changes:
            publish(root, changes)
    finally:
        lock.unlink()
    return {'status': 'source-candidate-registered' if changes else 'already-registered',
            'bodies': names, 'changed': [path.relative_to(root).as_posix() for path, _, _ in changes]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', required=True, type=Path)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        print(json.dumps(register(args.result, args.root), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
