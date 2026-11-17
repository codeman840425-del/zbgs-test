"""Prepare native microphone grip/mouth and measured glasses profiles from a pinned recipe."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import tempfile

import numpy as np

from native_dependency_delta import Export, ROOT, read_pinned


def load_script(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check(condition, message):
    if not condition:
        raise ValueError(message)


def pinned(entry):
    path = (ROOT / entry['path']).resolve()
    check(path.is_relative_to(ROOT), 'Accessory inputs must be inside this project')
    identity, raw = read_pinned(path, entry['sha256'])
    return path, identity, raw


def encode(document):
    return (json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def write(path, document):
    data = encode(document)
    with path.open('xb') as output:
        output.write(data)
    return dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))


def hand_dependencies(export):
    doc = export.doc
    (mesh_index, primitive), = [
        (i, primitive) for i, mesh in enumerate(doc['meshes']) for primitive in mesh['primitives']
        if re.search(r'Body_.*SKIN', export.name('materials', primitive['material']))
    ]
    check(not primitive.get('targets'), 'Body skin morph targets require separate grip verification')
    consumer, = [i for i, node in enumerate(doc['nodes']) if node.get('mesh') == mesh_index]
    skin = doc['skins'][doc['nodes'][consumer]['skin']]
    human = export.vrm['humanoid']['humanBones']
    semantics = ('rightHand', *(name for name in sorted(human) if name.startswith(
        ('rightThumb', 'rightIndex', 'rightMiddle', 'rightRing', 'rightLittle'))))
    check(len(semantics) == 16, 'Expected right hand and 15 VRM1 finger semantics')
    semantic_nodes = [human[name]['node'] for name in semantics]
    weights = export.accessor(primitive['attributes']['WEIGHTS_0'])[0]
    joints = export.accessor(primitive['attributes']['JOINTS_0'])[0]
    bind_nodes = np.array(skin['joints'])
    total = weights.sum(axis=1)
    check(np.all(total > 0), 'Body skin contains a vertex without skin weights')
    hand = np.sum(weights * np.isin(bind_nodes[joints], semantic_nodes), axis=1) > .5 * total
    faces = export.accessor(primitive['indices'])[0].reshape(-1, 3)
    hand_faces = faces[np.any(hand[faces], axis=1)]
    ids = np.unique(hand_faces)
    check(len(ids) > 0, 'No referenced right-hand skin')
    live_indices = np.unique(joints[ids][weights[ids] != 0])
    influence_nodes = bind_nodes[live_indices].tolist()
    ancestors = {child: parent for parent, node in enumerate(doc['nodes'])
                 for child in node.get('children', [])}
    nodes = doc['nodes']
    relevant = set()
    for index in [consumer, *semantic_nodes, *influence_nodes]:
        while index is not None and index not in relevant:
            relevant.add(index)
            index = ancestors.get(index)
    rest = {
        nodes[i]['name']: {
            'parent': nodes[ancestors[i]]['name'] if i in ancestors else None,
            **{key: nodes[i][key] for key in ('matrix', 'translation', 'scale', 'rotation')
               if key in nodes[i]},
        } for i in sorted(relevant)
    }
    return {
        'semantics': [(s, nodes[i]['name']) for s, i in zip(semantics, semantic_nodes, strict=True)],
        'rest': rest,
        'influences': [nodes[i]['name'] for i in influence_nodes],
        'handTriangles': hand_faces,
        'positions': export.accessor(primitive['attributes']['POSITION'])[0][ids],
        'jointIndices': joints[ids],
        'weights': weights[ids],
        'inverseBindMatrices': export.accessor(skin['inverseBindMatrices'])[0][live_indices],
    }


def microphone(body, path, target, target_sha, recipe, output, url):
    _, body_ref, body_raw = pinned(recipe['referenceBody'])
    _, grip_ref, grip_raw = pinned(recipe['referenceGrip'])
    _, presentation_ref, presentation_raw = pinned(recipe['referencePresentation'])
    _, mic_ref, _ = pinned(recipe['accessory'])
    grip = json.loads(grip_raw)
    presentation = json.loads(presentation_raw)
    check(grip['schema'] == 'zbgs-grip-profile-v1' and grip['accessoryId'] == 'studio-microphone-v1'
          and grip['compatibleAvatarSha256'] == presentation['targetBodySha256'] == body_ref['sha256']
          and grip['compatibleAccessorySha256'] == presentation['microphoneReference']['sha256']
          == mic_ref['sha256'], 'Grip reference body, accessory or presentation identity differs')
    quaternions = grip['normalizedFingerRotations']
    check(len(quaternions) == 15 and all(len(q) == 4 and abs(np.linalg.norm(q) - 1) <= 1e-4
          for q in [grip['micRawHandLocal']['quaternion'], *quaternions.values()]),
          'Reference must contain 15 normalized finger rotations and a normalized grip rotation')
    first, second = hand_dependencies(Export(body_raw)), hand_dependencies(target)
    check(set(quaternions) == {name for name, _ in first['semantics'] if name != 'rightHand'},
          'Reference grip does not match the full right finger semantics')
    changed = [key for key, before in first.items() if not (
        np.array_equal(before, second[key]) if isinstance(before, np.ndarray) else before == second[key])]
    check(not changed, f'Right hand needs separate grip fit. Dependencies changed: {", ".join(changed)}')

    mouth_owners = [
        index for index, node in enumerate(target.doc['nodes']) if 'mesh' in node and any(
            'FaceMouth' in target.name('materials', primitive['material'])
            for primitive in target.doc['meshes'][node['mesh']]['primitives'])
    ]
    aa, = target.vrm['expressions']['preset']['aa']['morphTargetBinds']
    check(mouth_owners == [aa['node']] and aa['weight'] == 1,
          'Expected one full-weight AA morph on the measured mouth mesh')
    source = load_script('native_mouth', 'scripts/native-live-accessory-fit-v1/mouth.py')
    mouth_file = output / 'mouth.json'
    mouth = source.one(body, path, mouth_file)
    check(mouth['avatarSha256'] == target_sha, 'Body bytes changed during mouth extraction')
    mouth_sha = hashlib.sha256(mouth_file.read_bytes()).hexdigest()
    grip_id = 'native-' + body + '-grip-v1'
    profile = {
        'schema': grip['schema'], 'id': grip_id,
        'compatibleAvatarSha256': target_sha,
        'accessoryId': grip['accessoryId'], 'compatibleAccessorySha256': mic_ref['sha256'],
        'fitVersion': grip['fitVersion'], 'micRawHandLocal': grip['micRawHandLocal'],
        'normalizedFingerRotations': grip['normalizedFingerRotations'],
        'method': 'Pinned source grip transferred after exact right-hand dependency comparison',
        'sourceGripSha256': grip_ref['sha256'], 'status': 'cpu-candidate-only',
    }
    grip_pin = write(output / 'grip.json', profile)
    fit = {
        'id': 'native-microphone-use-' + body + '-v1', 'bodySha256': target_sha,
        'microphoneSha256': mic_ref['sha256'], 'anchorSourceSha256': mouth_sha,
        'mouthRawHeadLocal': mouth['mouthRawHeadLocal'],
        'capsuleLocal': presentation['microphoneReference']['grilleFrontPoleLocal'],
        'speakingTipOffset': [-.035, -.055, .09], 'carryWristChestOffset': [-.22, -.18, .24],
        'transitionRate': 10,
    }
    write(output / 'microphone-presentation.json', fit)
    return {
        'status': 'cpu-candidate-only', 'referenceGrip': grip_ref, 'referenceBody': body_ref,
        'referencePresentation': presentation_ref, 'mic': mic_ref,
        'handDependencies': sorted(first), 'referencedHandTriangleCount': len(first['handTriangles']),
        'mouthSha256': mouth_sha, 'presentation': fit,
        'gripEntry': {'id': grip_id, 'compatibleAvatarSha256': target_sha,
                      'accessoryId': grip['accessoryId'], 'accessorySha256': mic_ref['sha256'],
                      'url': url + '/grip.json', **grip_pin},
    }


def glasses(body, target_sha, capture_pin, output, url):
    source_path, source, raw = pinned(capture_pin)
    capture = json.loads(gzip.decompress(raw))
    live = capture['live']
    builder = load_script('native_glasses', 'scripts/build-native-glasses-fit.py')
    check(capture['pose'] == 'stand' and live['bodyType'] == body
          and live['avatarSha256'] == target_sha
          and live['fit']['eyeFitMethod'] == 'rendered-iris-centers-and-face-front-band'
          and live['fit']['glassesTempleProfile'] is None
          and live['accessories']['glasses']['loaded']
          and live['accessories']['glasses']['sha256'] == builder.EXPECTED_ACCESSORY,
          'Expected measured, unfitted stand glasses for this exact body and accessory')
    check(source_path.name == body + '-stand.json.gz', 'Capture filename must match its body and pose')
    with tempfile.TemporaryDirectory(dir=output) as scratch:
        built = Path(scratch) / 'built'
        builder.BODIES = [body]
        builder.build(source_path.parent, built)
        profile = json.loads((built / (body + '.json')).read_bytes())
    check(profile['sourceCapture']['sha256'] == source['sha256'], 'Capture changed during temple fitting')
    return {
        'status': 'cpu-candidate-only', 'capture': source,
        'templeEntry': {'body': body, 'bodySHA256': target_sha,
                        'url': url + '/glasses.json', **write(output / 'glasses.json', profile)},
    }


def run(recipe, output):
    check(recipe['schema'] == 'native-accessory-batch-v1', 'Unsupported accessory batch recipe')
    url = recipe['publicUrlRoot']
    check(re.fullmatch(r'/assets/[a-z0-9/-]+', url) and not url.endswith('/') and '//' not in url,
          'Expected a stable public asset URL root')
    targets = recipe['targets']
    names = [item['id'] for item in targets]
    check(names and len(names) == len(set(names)) and all(re.fullmatch('[a-z0-9-]+', name) for name in names),
          'Expected unique URL-safe body IDs')
    output = output.resolve()
    output.mkdir(exist_ok=False)
    rows = []
    for item in targets:
        body = item['id']
        try:
            path, identity, raw = pinned(item['body'])
            target = Export(raw)
            check('microphone' in recipe or 'glassesStandCapture' in item, 'No fit requested')
            with tempfile.TemporaryDirectory(dir=output) as scratch:
                stage = Path(scratch) / body
                stage.mkdir()
                row = {'id': body, 'body': identity, 'status': 'cpu-candidate-only'}
                if 'microphone' in recipe:
                    row['microphone'] = microphone(body, path, target, identity['sha256'],
                                                   recipe['microphone'], stage, f'{url}/{body}')
                if 'glassesStandCapture' in item:
                    row['glasses'] = glasses(body, identity['sha256'], item['glassesStandCapture'],
                                             stage, f'{url}/{body}')
                stage.rename(output / body)
        except (ValueError, OSError, KeyError, AssertionError) as error:
            row = {'id': body, 'status': 'failed', 'error': str(error) or type(error).__name__}
        rows.append(row)
    report = {'schema': 'native-accessory-batch-result-v1', 'targets': rows,
              'scope': 'CPU candidate data for separate runtime fit and contact verification'}
    write(output / 'result.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        report = run(json.loads(args.recipe.read_bytes()), args.output)
    except (ValueError, OSError, KeyError) as error:
        print(error, file=sys.stderr)
        return 1
    print(json.dumps([{key: value for key, value in row.items() if key in {'id', 'status', 'error'}}
                      for row in report['targets']], ensure_ascii=False))
    return int(any(row['status'] == 'failed' for row in report['targets']))


if __name__ == '__main__':
    raise SystemExit(main())
