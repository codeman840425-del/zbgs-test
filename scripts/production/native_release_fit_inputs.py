"""Prove the pinned 7586 prefix derivative's offline inputs for the two released looks.

Run unmodified to compare the committed evidence; --write updates that one report.
The canonical prefix is regenerated in memory when its diagnostic VRM is absent.
"""
import argparse
import gzip
import json
from pathlib import PurePosixPath

import numpy as np

from flow import GLB, ROOT, Validator, local, require
from native_accessory_batch import hand_dependencies, is_unfitted_glasses_capture, load_script
from native_body_normal_pins import extract_normal
from native_dependency_delta import Export
from native_import import body_image, digest
from native_mesh_budget import SELECTED, SOURCE_SHA, verify
from native_mesh_budget_prefix import derive_prefix
from native_uniform_normal import pins_for_body


RECORDS = ROOT / 'evidence/m2-native-short-socks-room-v1/records.json'
TARGET = ROOT / 'evidence/m2-native-body-cost-v1/mesh/prefix-body.vrm'
TARGET_SHA = 'ca4ab17f4a8afebd5ac796387491cc4a23e966f12dc57916deb8ce97684f1756'
REPORT = ROOT / 'evidence/m2-native-mesh-room-v1/fit-inputs/report.json'
BUDGET_SHA = '9a8d2eaff665059cef568c4305c3923cf6a142c1c1c40525f2460ddb33636a4a'
PUBLIC = 'prototype/public/'
MOUTH_PIN = '9c953e55981dd1c1cf0b579e57ab691d0be16d8c46121219b2e96273895f07a0'


def fixed_json(reader, path, sha):
    return json.loads(reader.pin(path.relative_to(ROOT).as_posix(), sha))


def single(rows):
    item, = rows
    return item


def prove_body(source_raw, target_raw):
    require(digest(source_raw) == SOURCE_SHA, 'Unexpected source body')
    source, target = GLB(source_raw), GLB(target_raw)
    expected, remaps = derive_prefix(source)
    require(target_raw == expected and digest(target_raw) == TARGET_SHA,
            'Target differs from the pinned prefix derivation')
    rows = verify(source, target, remaps)
    cropped = single(row for row in rows if row['sourcePositionCount'] != row['derivedPositionCount'])
    require('FaceMouth' in cropped['material'] and cropped['derivedPositionCount'] == cropped['sourceIndexMax'] + 1
            and source.binary == target.binary, 'Expected a FaceMouth-only suffix crop with identical BIN')
    require(source.bind_by_name() == target.bind_by_name(), 'Body inverse bind matrices changed')
    return {'sourceSha256': SOURCE_SHA, 'targetSha256': TARGET_SHA, 'binarySha256': digest(target.binary),
            'primitives': len(rows), 'triangleCorners': sum(row['corners'] for row in rows),
            'comparedCornerAttributeBytes': sum(row['comparedCornerAttributeBytes'] for row in rows),
            'changedPrimitive': cropped, 'rawBindBones': len(target.bind_by_name()),
            'springChains': len(target.doc['extensions']['VRMC_springBone']['springs']),
            'humanoidSemantics': len(target.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'])}


def live_inputs(reader, records, by_sha, source, target):
    live = records[0]['liveAccessories']
    require(all(v['enabled'] for v in live['selections'].values()) and
            all(v == {'enabled': False, 'identity': None}
                for v in records[1]['liveAccessories']['selections'].values()), 'Unexpected live selections')
    identities = {k: v['identity'] for k, v in live['selections'].items()}
    docs = {}
    for key, identity in identities.items():
        fit = identity['fit']
        require(fit['bodySHA256'] == identity['bodySHA256'] == SOURCE_SHA and
                fit['accessorySHA256'] == identity['accessorySHA256'], 'Stale source fit contract')
        docs[key] = json.loads(by_sha(fit['sha256']))
        require(docs[key]['id'] == fit['id'], 'Fit identifier differs')
    grip, temples = docs['mic'], docs['glasses']
    require(grip['compatibleAvatarSha256'] == temples['bodySHA256'] == SOURCE_SHA and
            grip['compatibleAccessorySha256'] == identities['mic']['accessorySHA256'] and
            temples['accessorySHA256'] == identities['glasses']['accessorySHA256'], 'Wrong source fit')
    hand, other = hand_dependencies(source), hand_dependencies(target)
    for key in hand:
        same = np.array_equal(hand[key], other[key]) if isinstance(hand[key], np.ndarray) else hand[key] == other[key]
        require(same, 'Changed right-hand geometry, binding or pose: ' + key)
    require(set(grip['normalizedFingerRotations']) == {s for s, _ in hand['semantics'] if s != 'rightHand'},
            'Grip finger semantics differ')
    anchor = live['microphonePresentation']
    presentation = fixed_json(reader, ROOT / 'assets-source/native-live-accessory-fit-v1/presentation/male-7586.json',
                              anchor['anchorSourceSha256'])
    reference = fixed_json(reader, ROOT / 'assets-source/native-live-accessory-fit-v1/male-mouth.json', MOUTH_PIN)
    history = fixed_json(reader, ROOT / 'evidence/native-live-accessory-fit-v1/report.json',
                         'c29b04c6db3ac25565d093f47f836127515b751cd526f720e21be33e6045c966')
    old_pins = history['sourcePins']
    require(old_pins['maleMouth'] == MOUTH_PIN, 'Legacy mouth output pin changed')
    script = 'scripts/native-live-accessory-fit-v1/mouth.py'
    measure = load_script('release_mouth', script)
    original, derived = [measure.measure(m.glb) for m in (source, target)]
    require(original == derived, 'Skinned mouth seam or aa response changed')
    for key, value in original.items():
        require(value == reference[key], 'Reference seam drift: ' + key)
    mic_path = local(ROOT, presentation['microphoneReference']['source'])
    mic = measure.mod.GLB(mic_path)
    require(mic.sha == identities['mic']['accessorySHA256'], 'Wrong microphone GLB')
    grille_index, grille = single((i, n) for i, n in enumerate(mic.doc['nodes']) if n.get('name') == 'Grille')
    positions = np.concatenate([mic.acc(p['attributes']['POSITION'])
                                for p in mic.doc['meshes'][grille['mesh']]['primitives']])
    points = (np.c_[positions, np.ones(len(positions))] @ measure.worlds(mic)[grille_index].T)[:, :3]
    pole = (points.min(axis=0) + points.max(axis=0)) * .5
    pole[1] = points[:, 1].max()
    require(anchor['bodySha256'] == presentation['targetBodySha256'] == reference['avatarSha256'] == SOURCE_SHA and
            anchor['microphoneSha256'] == presentation['microphoneReference']['sha256'] == grip['compatibleAccessorySha256']
            and np.allclose(anchor['mouthRawHeadLocal'], derived['mouthRawHeadLocal'], rtol=0, atol=1e-12)
            and np.allclose(pole, anchor['capsuleLocal'], rtol=0, atol=1e-12)
            and anchor['capsuleLocal'] == presentation['microphoneReference']['grilleFrontPoleLocal'],
            'Recorded mouth, capsule or identity differs')
    capture = temples['sourceCapture']
    captured = json.loads(gzip.decompress(reader.pin(capture['path'], capture['sha256'])))
    require(captured['pose'] == 'stand' and captured['live']['avatarSha256'] == SOURCE_SHA and
            is_unfitted_glasses_capture(captured['live'], SOURCE_SHA, temples['accessorySHA256']),
            'Expected unfitted glasses capture on original body')
    glasses = GLB(by_sha(temples['accessorySHA256']))
    for control in temples['controls']:
        mesh = single(m for m in glasses.doc['meshes'] if m['name'] == control['mesh'])
        rows = np.array(glasses.accessor(mesh['primitives'][0]['attributes']['POSITION']), dtype='<f4')
        require(len(rows) == control['vertices'] and digest(rows.tobytes()) == control['positionSHA256'],
                'Temple positions differ')
    return {
        'microphone': {'gripId': grip['id'], 'rightHandTriangles': len(hand['handTriangles']),
                       'mouthGenerator': {'path': script, 'sha256': digest((ROOT / script).read_bytes()),
                                          'historicalCommit': 'e7999bec01828e59b530d024a458f36d9a3b9e76',
                                          'historicalSha256': old_pins['mouthScript'], 'historicalOutputSha256': MOUTH_PIN},
                       'weightedHandVertices': len(hand['positions']), 'fingerRotations': len(grip['normalizedFingerRotations']),
                       'rimVertices': len(derived['rimVertexIds']), 'neutralRawHeadLocal': derived['mouthRawHeadLocal'],
                       'aaRawHeadLocal': derived['aaMouthRawHeadLocal'], 'normal': derived['adjacentFaceAreaWeightedNormalRawHeadLocal'],
                       'capsuleLocal': anchor['capsuleLocal'], 'needs': 'Target grip, presentation and anchor identity; carry, speak, finger contact and transition footage.'},
        'glasses': {'sourceFit': temples['id'], 'temples': [c['mesh'] for c in temples['controls']],
                    'sourceCaptureSha256': capture['sha256'], 'sourceCaptureBodySha256': captured['live']['avatarSha256'],
                    'needs': 'Unfitted stand capture on the derived body, fresh temple fit, turn/seat and contact readback.'}}


def build():
    reader = Validator()
    budget = fixed_json(reader, SELECTED, BUDGET_SHA)
    records = fixed_json(reader, RECORDS, budget['inputSha256'])
    files = {}
    for rec, selected in zip(records, budget['records'], strict=True):
        require(rec['identity']['id'] == selected['id'] and rec['integrity']['recordSha256'] == selected['recordSha256']
                and rec['appearanceRecipe']['base']['sha256'] == selected['avatarSha256'] == SOURCE_SHA,
                'Selected record or body mismatch')
        for row in selected['files']:
            data = reader.pin(PUBLIC + row['path'], row['sha256'], row['bytes'])
            files[row['path']] = (row['sha256'], data)
    require(len(files) == budget['closureUnionFileCount'], 'Incomplete source file closure')

    def by_sha(sha):
        return single(data for actual, data in files.values() if actual == sha)

    def by_suffix(suffix):
        return single((path, json.loads(data)) for path, (_, data) in files.items() if path.endswith(suffix))

    source_raw = by_sha(SOURCE_SHA)
    target_raw = TARGET.read_bytes() if TARGET.is_file() else derive_prefix(GLB(source_raw))[0]
    body = prove_body(source_raw, target_raw)
    source, target = Export(source_raw), Export(target_raw)
    base = GLB(source_raw)
    coverage_path, coverage = by_suffix('texture-fit-v1/generated/manifest.json')
    cover_png = (PurePosixPath(coverage_path).parent / coverage['covered']['url']).as_posix()
    require(coverage['avatarSha256'] == SOURCE_SHA and body_image(source_raw, coverage) == body_image(target_raw, coverage)
            and files[cover_png][0] == coverage['covered']['sha256'],
            'Unverified body coverage textures')
    normal = extract_normal(target_raw, coverage)
    flat = pins_for_body(target_raw, TARGET_SHA)['avatars'][TARGET_SHA]
    for name, observed in [('native-body-normal-source-pins', normal), ('native-uniform-normal-pins', flat)]:
        pins = reader.json('prototype/src/' + name + '.json')['avatars']
        require(pins[SOURCE_SHA] == observed and observed, 'Normal ownership mismatch: ' + name)
    equipment = {}
    looks = []
    for record in records:
        recipe = record['appearanceRecipe']
        require(set(recipe['appearance'].values()) == {'original'} and recipe['hairFit'] is None and
                recipe['hairAssetSha256'] is None and all(s['selection'] == 'none' for s in recipe['accessories'].values())
                and all(v in (0, None, 'none') for v in recipe['geometry'].values()), 'Unverified surface, accessory or geometry')
        for palette in recipe['paletteVersion'].split('|'):
            name, sha = palette.split(':')
            manifest = json.loads(reader.pin(f'prototype/public/assets/{name}/manifest.json', sha))
            require(manifest['avatarSha256'] == SOURCE_SHA, 'Palette body differs')
        items = recipe['equipment']['resources']
        for slot, item in items.items():
            catalog = ('assets/native-crew-template-v1/equipment.json' if slot == 'socks'
                       else recipe['equipment']['manifestUrl'].lstrip('/'))
            entry = reader.item(json.loads(files[catalog][1]), item['id'])
            require(entry == item, 'Garment contract differs from source record')
            if item['id'] not in equipment:
                bound = reader.equipment(item, SOURCE_SHA, base, PUBLIC + catalog)
                for binding in item['bindings']:
                    name = binding['targetRawBone']
                    semantic = binding['humanoidSemantic']
                    if semantic:
                        require(target.name('nodes', target.vrm['humanoid']['humanBones'][semantic]['node']) == name,
                                'Wrong target humanoid semantic')
                equipment[item['id']] = dict(slot=slot, assetSha256=item['sha256'], bones=bound['bones'],
                                              weightedVertices=bound['weightedVertices'], sourceContractBody=SOURCE_SHA)
        for row in coverage['equipment']:
            require(any(it['sha256'] == row['sha256'] and it['id'] == row['id'] for it in items.values()),
                    'Coverage garment mismatch')
        if 'socks' in items:
            for key, slot in [('shoes', 'shoes'), ('lower', 'shorts')]:
                require({'id': items[slot]['id'], 'sha256': items[slot]['sha256']} in items['socks']['pairedWith'][key],
                        'Sock pairing identity mismatch')
        materials = record.get('equipmentMaterials', {}).get('selections', [])
        for mat in materials:
            require(mat['selection'] is None and any(it['id'] == mat['equipmentId'] and it['sha256'] == mat['garmentSha256']
                        for it in items.values()), 'Unverified garment material override')
        looks.append({'id': record['identity']['id'], 'sourceRecordSha256': record['integrity']['recordSha256'],
                      'equipment': [x['id'] for x in items.values()], 'surfaces': recipe['appearance'],
                      'liveEnabled': [k for k,v in record['liveAccessories']['selections'].items() if v['enabled']],
                      'ears': 'none', 'hat': 'none', 'overrides': [], 'paletteVersion': recipe['paletteVersion']})
    motion_path, motion = by_suffix('native-male-7586-v1.motion.json')
    require(motion['avatarSha256'] == SOURCE_SHA and motion['footwearSha256'] in {it['assetSha256'] for it in equipment.values()},
            'Motion target or footwear differs')
    live = live_inputs(reader, records, by_sha, source, target)
    hair_fit = json.loads(reader.pin('prototype/public/assets/native-hairset001-v1/fit.json',
                                     'c4b5f72aca522712256578cc30928ee80453945728e84e50411bed9954b0fb79'))
    hair_materials = [name for name in target.names['materials'] if '_HAIR' in name]
    require(hair_fit['targetBodySha256'] == SOURCE_SHA and
            hair_materials == hair_fit['hideOriginal']['materialNames'], 'Expected original hair materials')
    return {'schema': 'native-release-fit-inputs-v1', 'status': 'static-input-proof', 'runtimeAdmission': False,
            'records': looks, 'body': body, 'garments': equipment, 'accessories': live,
            'hair': {'selected': 'embedded-original', 'materials': hair_materials,
                     'unselectedExternalStyle': hair_fit['styleId'], 'oldFitTarget': hair_fit['targetBodySha256'],
                     'needs': 'External hair would require a target-specific fit and spring/collider playback.'},
            'surfaces': {'coverageMaterial': coverage['materialName'], 'basePng': coverage['basePngSha256'],
                         'coveredPng': coverage['covered']['sha256'], 'bodyNormal': normal, 'faceNormal': flat,
                         'unchangedEmbeddedImages': len(target.image_hashes),
                         'needs': 'Coverage manifest and optional uncovered sock pairing, normal pins and original palette contract bound to target SHA. Alternate colors and hair were not selected.'},
            'motion': {'bodyPinnedClip': motion_path, 'normalizedRigSha256': motion['normalizedRigSha256'],
                       'springNames': sorted({s['name'] for s in target.spring['springs']}),
                       'needs': 'Explicit target clip/rig/shoe identity and actual playback, including garment secondary motion.'},
            'pending': ['Explicit record/provenance and garment bindings for target SHA.',
                        'Target walk, sit, floor, shoe/sock contact, mouth speech and frustum culling.',
                        'Cold restore for both records and exact game bundle. No outfit admission or device performance claim.'],
            'sourceFilesRead': sorted(reader.observed, key=lambda row: row['path'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = json.dumps(build(), indent=2, ensure_ascii=False, allow_nan=False) + '\n'
    if args.write:
        path = local(ROOT, REPORT.relative_to(ROOT).as_posix())
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(result.encode())
    else:
        require(json.loads(REPORT.read_bytes()) == json.loads(result), 'Saved evidence differs')
    print(f'{TARGET_SHA}: verified two source records; runtime admission pending')


if __name__ == '__main__':
    main()
