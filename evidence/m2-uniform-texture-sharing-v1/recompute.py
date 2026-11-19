"""Reconcile the signed uniform pair with its fixed model texture declarations."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from production_paths import project_output


EVIDENCE = ROOT / 'evidence/m2-uniform-skin-v1'
GAME = ROOT / 'experiments/worktrees/warm-d96411eb'
PROTOTYPE = GAME / 'prototype'
COMMIT = 'd96411ebef27a0e255bab3eaa49bf9addab48e8a'
PINS = {
    EVIDENCE / 'signed-pair.json': '852afbd11132afa0801a27fa8eec0b67713026cc2fb7f83c2445f210950ff1d9',
    EVIDENCE / 'budget-signed-pair.json': '81109b5a514cd49b727cc9e219dd90f9593b4631a079d08cc1ec4af7bd9a3c01',
    EVIDENCE / 'inventory.json': '51e924f770b8d85ca6fc84c136865490896a740768b8cc4b43fda9299cf21b2b',
    EVIDENCE / 'budget-concurrent-proof.json': '45f916328f8f34fb8baeb6ee16af331dd2635ccd1bed6c538676aa20820d4f8f',
    EVIDENCE / 'development-budget/report.json': 'cc145532564a0ce5a4db5fe88bec13cf464a4300f25394b48f3ba4f837549aaf',
    PROTOTYPE / 'dist/build-info.json': '8f523fc5b45808e10606bec04160e0f199bf766926e07357163c39d5d70893d1',
    PROTOTYPE / 'src/character-appearance.js': '69c148a39bcaba827e43e4295f52c902b4f97ca924d01aa32f6f8ad5284cf87b',
    PROTOTYPE / 'src/facial-palette.js': 'bd62fd6360f5d18955969e5c7162693cdf176b5b25c8f0a96426d6e4e2132bea',
    PROTOTYPE / 'src/facial-palette-contract.js': 'cd60a4df1636b9c3bb4398e93480a4fc3093e9ca1a09945eff44e4113edc89ba',
    PROTOTYPE / 'src/foundation-avatar.js': 'f642605891f4f516881671d67b2cb02857454c269db4850aafb777a4744376c8',
    PROTOTYPE / 'src/fitted-head-appearances.json': '4bf5efc41b75e86a96fcc1f7fd60b895e2fdd61221ba0fbca13c2ff91b8a1f08',
    PROTOTYPE / 'src/native-body-normal-source-pins.json': 'a9df9e3bdd73fd7441f4f5ede5cfc7e475bc68fe2c7b7d2e37bf23ed86b90a5a',
    PROTOTYPE / 'src/shared-body-normal-source.js': '1d9671c84dd75d919abc6ac588f5d89a8c84dc7bac00dec41f69345abeaef2f2',
    PROTOTYPE / 'src/record-consumer-demo.js': '281a67c3f1764f915b2dd79c4f43e1937547787efadc85311b3973c451fb1cce',
    PROTOTYPE / 'node_modules/three/src/renderers/webgl/WebGLTextures.js': '954bb7dcbc2f508f6d995a649787d1a147b5a0692bb1f0b38362b9a906fe6ab4',
    ROOT / 'scripts/production/asset_budget.py': '4ba613606522009304afe98cde144cf9aacaea16b14394f520304e981355f447',
    ROOT / 'scripts/production/asset-budgets-v1.json': 'b5f792da80d061aa8dfac1045e2f69e699207dd5d4a05b5ea9959ef532dc9d63',
    ROOT / 'scripts/production/flow.py': 'd9b7d1b2ceb24622a92abe1af8737da08d93f00a3e51113f5155487af789b1ba',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_bytes())


def format_json(value, depth=0):
    if depth == 4 or not value or not isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, dict):
        begin, end = '{', '}'
        items = [f'{json.dumps(key)}: {format_json(item, depth + 1)}' for key, item in value.items()]
    else:
        begin, end = '[', ']'
        items = [format_json(item, depth + 1) for item in value]
    padding = '  ' * (depth + 1)
    return begin + '\n' + padding + (',\n' + padding).join(items) + '\n' + '  ' * depth + end


def verify_inputs():
    git = lambda *args: subprocess.check_output(['git', '-C', str(GAME), *args], text=True).strip()
    if git('rev-parse', 'HEAD') != COMMIT or git('status', '--porcelain', '--untracked-files=normal'):
        raise ValueError('Use the clean fixed game checkout')
    for path, expected in PINS.items():
        if digest(path.read_bytes()) != expected:
            raise ValueError(f'Pinned input changed: {path}')


def inspect_model(row):
    from asset_budget import AssetCost

    asset = AssetCost(PROTOTYPE / 'dist' / row['path'])
    assert digest(asset.raw) == row['sha256']
    doc = asset.doc
    images, external_bytes = asset.images()
    assert external_bytes == 0
    vrm = doc.get('extensions', {}).get('VRM', {})
    textures = []
    for index, texture in enumerate(doc.get('textures', [])):
        image = images[texture['source']]
        slots = []
        for material in doc.get('materials', []):
            standard_slots = material | material.get('pbrMetallicRoughness', {})
            for name, value in standard_slots.items():
                if name.endswith('Texture') and value.get('index') == index:
                    slots.append(f"{material['name']}.{name}")
        for material in vrm.get('materialProperties', []):
            for name, value in material['textureProperties'].items():
                if value == index:
                    slots.append(f"{material['name']}.{name}")
        if vrm.get('meta', {}).get('texture') == index:
            slots.append('VRM.meta.texture (preview)')
        textures.append({'index': index, 'imageIndex': image['index'], 'imageSha256': image['sha256'],
                         'size': [image['width'], image['height']], 'encodedBytes': image['encodedBytes'],
                         'sourceSampler': doc['samplers'][texture['sampler']] if 'sampler' in texture else 'glTF defaults',
                         'oldFullMipBytes': image['rgba8MipBytes'], 'sourceSlots': slots})
    cost = row['cost']['metrics']
    assert len(textures) == cost['textures']
    assert sum(texture['oldFullMipBytes'] for texture in textures) == cost['rgba8MipBytes']
    return {'id': row['id'], 'path': row['path'], 'sha256': row['sha256'],
            'textureObjectsPerActor': cost['textures'], 'oldFullMipBytesPerActor': cost['rgba8MipBytes'],
            'textures': textures}


def report():
    verify_inputs()
    signed = read_json(EVIDENCE / 'signed-pair.json')
    budget = read_json(EVIDENCE / 'budget-signed-pair.json')
    proof = read_json(EVIDENCE / 'budget-concurrent-proof.json')['concurrentSelectedActorReference']
    runtime = read_json(EVIDENCE / 'inventory.json')['runtime']
    build = read_json(PROTOTYPE / 'dist/build-info.json')
    assert (runtime['sourceCommit'], runtime['sourceDigest'], runtime['buildId']) == (COMMIT, build['sourceDigest'], build['shortId'])
    actors = budget['records']
    assert len(actors) == len(signed) == 2
    assert actors[0]['models'] == actors[1]['models'] and actors[0]['files'] == actors[1]['files']
    assert actors[0]['standaloneImages'] == actors[1]['standaloneImages']
    closure = []
    for row in actors[0]['files']:
        asset = (PROTOTYPE / 'dist' / row['path']).read_bytes()
        assert len(asset) == row['bytes'] and digest(asset) == row['sha256']
        assert asset == (PROTOTYPE / 'public' / row['path']).read_bytes()
        closure.append({key: row[key] for key in ['path', 'bytes', 'sha256']})
    assert len(closure) == budget['closureUnionFileCount']
    assert sum(row['bytes'] for row in closure) == budget['closureUnionSourceBytes']
    models = [inspect_model(model) for model in actors[0]['models'] if model['selected']]
    body = next(row for row in models if row['id'] == 'body')
    body_images = {row['imageSha256']: row['index'] for row in body['textures']}
    cross_model_aliases = [{'model': model['id'], 'texture': texture['index'],
                            'bodyTexture': body_images[texture['imageSha256']], 'sameEncodedPngSha256': texture['imageSha256']}
                           for model in models if model is not body for texture in model['textures']
                           if texture['imageSha256'] in body_images]
    groups = actors[0]['reviewedLegacyAppearanceCache']['groups']
    assert groups == actors[1]['reviewedLegacyAppearanceCache']['groups']
    reactions = {
        'hair': 'Grayscale canvas retains alpha and uses max(R,G,B). Blonde tint is a per-material RGB/shade factor.',
        'brow': 'Same grayscale operator as hair, with its own source image and smaller canvas. Blonde is a material factor.',
        'iris': 'Brown is baked into each canvas via the pinned iris mask and neutral map, with source alpha preserved.',
        'lips': 'Coral is baked into each canvas via the pinned outer-lip mask and source RGB, with alpha preserved.',
    }
    derived = {}
    for channel, row in groups.items():
        source = body['textures'][row['sourceTextureIndex']]
        assert source['imageSha256'] == row['sourceImageSha256']
        assert source['size'] == [row['width'], row['height']]
        per_texture = row['width'] * row['height'] * 4
        assert per_texture * row['distinctDerivedTextures'] == row['logicalTextureRgba8Bytes']
        derived[channel] = row | {'roles': ['map', 'shadeMultiplyTexture'], 'rgba8BytesPerRole': per_texture,
                                  'twoActorOldEstimateBytes': 2 * row['logicalTextureRgba8Bytes'],
                                  'pixelOperation': reactions[channel]}
    signed_actors = []
    for record, actor in zip(signed, actors):
        assert (record['identity']['id'], record['integrity']['recordSha256']) == (actor['id'], actor['recordSha256'])
        recipe = record['appearanceRecipe']
        signed_actors.append({'id': actor['id'], 'recordSha256': actor['recordSha256'],
                              'appearance': recipe['appearance'], 'paletteVersion': recipe['paletteVersion']})
        assert actor['reviewedLegacyAppearanceCache']['skinTone']['additionalTextureObjects'] == 0
        assert not actor['materialRecipes']
        assert actor['selectedCost']['totals'] == actor['startupAndSelectedCost']['totals']
    first, second = [row['appearanceRecipe'] for row in signed]
    assert {key for key in first if first[key] != second[key]} == {'paletteVersion', 'appearance'}
    assert {key for key in first['appearance'] if first['appearance'][key] != second['appearance'][key]} == {'skinTone'}
    assert first['base']['sha256'] not in read_json(PROTOTYPE / 'src/native-body-normal-source-pins.json')['avatars']
    old = budget['sumAcrossSelectedActors']
    limit = budget['temporaryAggregateLimits']['rgba8MipBytes']
    assert old == proof['sumAcrossSelectedActors']
    model_bytes = sum(row['oldFullMipBytesPerActor'] for row in models)
    model_count = sum(row['textureObjectsPerActor'] for row in models)
    derived_bytes = sum(row['logicalTextureRgba8Bytes'] for row in groups.values())
    derived_count = sum(row['distinctDerivedTextures'] for row in groups.values())
    assert old['rgba8MipBytes'] == 2 * (model_bytes + derived_bytes)
    assert old['textureObjects'] == 2 * (model_count + derived_count)
    assert all(row['addedTextureObjectUpperBound'] == row['addedRgba8EstimateBytes'] == 0
               for row in actors[0]['standaloneImages'])
    target = derived['hair']
    estimated = old['rgba8MipBytes'] - target['logicalTextureRgba8Bytes']
    assert old['rgba8MipBytes'] - target['rgba8BytesPerRole'] > limit >= estimated
    browser = read_json(EVIDENCE / 'development-budget/report.json')
    return {
        'schema': 'uniform-texture-sharing-cost-input-v1',
        'status': 'fixed-input-static-projection',
        'runtime': runtime,
        'pinnedInputs': {path.relative_to(ROOT).as_posix(): sha for path, sha in PINS.items()},
        'records': signed_actors,
        'body': first['base'], 'hairFit': first['hairFit'],
        'archivedCost': {'selectedPerActor': {'modelObjects': model_count, 'modelFullMipBytes': model_bytes,
                                            'derivedObjects': derived_count, 'derivedLinearBytes': derived_bytes,
                                            'totalObjects': model_count + derived_count, 'totalBytes': model_bytes + derived_bytes},
                         'twoActors': old, 'temporaryLimitBytes': limit, 'excessBytes': old['rgba8MipBytes'] - limit,
                         'textureEstimateScope': budget['textureEstimateScope']},
        'closure': {'files': closure, 'uniqueFiles': len(closure), 'encodedBytes': budget['closureUnionSourceBytes']},
        'embeddedModelCandidates': models,
        'matchingEncodedImagesBetweenModels': cross_model_aliases,
        'derivedCanvasCandidates': derived,
        'standalonePaletteReferences': actors[0]['standaloneImages'],
        'skinTreatment': [actor['reviewedLegacyAppearanceCache']['skinTone'] for actor in actors],
        'interpretation': [
            'Embedded entries count every declared texture, including the VRM thumbnail and source clothing with equipment selected. The full mip convention is used even for the linear body and Bob declarations.',
            'The fixed legacy Bob path replaces imported materials with clones of the body hair material and immediately disposes imported materials and textures. The three Bob GLB image declarations (11,185,148 old full-mip bytes) establish source and transfer cost only for this assessment. Visible Bob uses the body-derived maps and unchanged body hair auxiliary maps.',
            'Body, top and shoes are duplicate package inputs across actors. Equal encoded images across containers alone do not establish runtime sharing or savings. The exact body has no pin in the existing body-normal Source pool.',
            'The current body color and shade factors are per material. The warm recipe adds no textures, and its version suffix carries skin identity rather than an input to the hair grayscale operator.',
            'Mask and neutral PNGs support CPU composition. The old texture estimate includes the generated maps once each and separately reports decoded references, canvas payload, retained ImageData/original arrays and transient scratch. These are different accounting quantities.',
        ],
        'minimumTarget': {
            'scope': 'Exact admitted uniform body and female-bob-v1 pair. Reuse one immutable neutral hair Source per role across the two actors on the same renderer. Keep actor-local Texture wrappers and tint factors.',
            'sourceTextureIndex': target['sourceTextureIndex'], 'sourceImageSha256': target['sourceImageSha256'],
            'roles': target['roles'], 'bytesPerRole': target['rgba8BytesPerRole'],
            'oneRoleProjectionBytes': old['rgba8MipBytes'] - target['rgba8BytesPerRole'],
            'projectedDuplicateBytesAvoided': target['logicalTextureRgba8Bytes'],
            'projectedTwoActorTextureEquivalentCount': old['textureObjects'] - target['distinctDerivedTextures'],
            'projectedTwoActorBytes': estimated, 'projectedHeadroomBytes': limit - estimated,
            'requiredMatch': 'Pinned body/embedded PNG, exact grayscale operator, effective source decode and per-role Three.js upload/cache settings. Keep separate base/shade roles and retain reference ownership until the last user releases.',
            'budgetChange': 'Counterfactual RGBA8-equivalent and texture count projection. Actor-local wrapper count and the archived calculator remain 76 across the pair; no shared-source deduction has been applied to a measured budget.',
        },
        'priorDevelopmentCounts': [{'ids': case['ids'], 'loadedTextures': case['loaded']['textures'],
                                    'releasedTextures': case['released']['textures']} for case in browser['cases']],
        'measurementScope': 'Fixed-file and source analysis. Shared-source lifetime, WebGL uploads, physical VRAM, target-device performance and visual parity require runtime evidence.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = project_output(Path(__file__).with_name('cost-input.json'), __file__)
    data = (format_json(report()) + '\n').encode('utf-8')
    if args.write:
        with path.open('xb') as stream:
            stream.write(data)
    elif path.read_bytes() != data:
        raise SystemExit('Cost input differs from the fixed-source recomputation')
    print(path)
