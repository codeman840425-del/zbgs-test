"""Read-only static resource budgets for complete character records."""
import argparse
import hashlib
import io
import json
import pathlib
import struct
import subprocess
import sys

from PIL import Image

from asset_budget import AssetCost, ROOT, budget_config, check, local, ref, require
from selected_look_budget import AGGREGATE_LIMITS, RECIPE_SOURCE_PINS, aggregate, mip_bytes


SCHEMA = 'zbgs-character-record-budget-result-v1'
BUDGET = ROOT / 'scripts/production/asset-budgets-v1.json'
COLLECTOR = ROOT / 'scripts/runtime-package/record-budget-input.mjs'
REVIEWED_MATERIAL_RUNTIME_SHA = 'a62791de838b3c16c33416158b4081e0bcd8e65f98841172306c75bdfe8156c7'
REVIEWED_RUNTIME_SOURCE = {
    'body-texture-coverage.js': 'e85ed00fa1d24abfb30e228a4f016a48b9a3a90aff81f43a5bfafd6e4bb9239a',
    'native-palette-part.js': '5dc94c4bd1028db53020ac2f8d348b8b24599e99af49655ba01f4eb89c1d39b6',
    'rigid-accessory-layer.js': 'a62eaf2bcb354d3919a06aae672da624d6168989c40add7cf84b59f6fa08d4a6',
    'character-appearance.js': '403b0e524fda85b841ac6e7d43b34dc4a7898ab8878d2f1baa5197a042ffe7c4',
    'hair-spring.js': '9d145d284afda2ed5b33352535018cfe0d79a75ef278ea5b7c795c50711e6cdf',
    'native-hair-attachment.js': 'a19e5a230a808c6fc9967614bfd0886d49265dfff7159b8c7bc886775b725f3d',
}
REVIEWED_SKIN_RUNTIME = {
    'character-appearance.js': 'a35cb965bf37fc28f32027ebef9e839c093f9076861ad0d4669be9d1cbcdaef0',
    'body-texture-coverage.js': '1d1858feadabe84289df7649c6070061e1b4771386c15e42adb50aaa02408764',
    'native-skin-tone.js': '33d04cb0a09815a8c24e94dd66aa7811c985863740076b6ba265909253cd7ff1',
}
REVIEWED_LIP_RUNTIME = {
    **REVIEWED_SKIN_RUNTIME,
    'character-appearance.js': 'bad816e2949768efa8c8c0174f76fe16ee68fad1080089feddd0531274f9f932',
    'native-skin-tone.js': '42687783b79ef12c8f5503297f5e3b7a85f3536a0ba406443761fe97308ff09c',
    'native-lip-color-contract.js': 'b794b1754dc5535b238f74e663207393d10001d2112a759cb3b3990c06467c21',
}
# cfca0dd1 adds a pinned equipment catalog and an uncovered optional sock rule.
# The original mask allocation is unchanged, and the adapter loads the sock only when selected.
REVIEWED_SUPPLEMENT_RUNTIME = {
    'body-texture-coverage.js': '4dffaa50ff155246a89c998edb96f4b434b2cd4efdfd30d9dc41ba6120715315',
    'm1-equipment.js': '48b1c6ee94f8c4daa015496b7f9016b9dee1e2d998d61cb72f9e184b033333a2',
    'equipment.js': '1018d7a58343de05e3110fb8d28137fca978799433b50c2529dd1089d7f59c2b',
}
REVIEWED_LEGACY_CACHE_SOURCE = {
    'src/character-appearance.js': REVIEWED_LIP_RUNTIME['character-appearance.js'],
    'src/facial-palette.js': 'bd62fd6360f5d18955969e5c7162693cdf176b5b25c8f0a96426d6e4e2132bea',
    'src/facial-palette-contract.js': '4cb1e2b3d197390df3543d135cfdad1ad5d5c5527cc675d6ec5c4eaaa8ae70ac',
    'src/hairstyle-catalog.js': '44eddc0f90a3e742ed5dd08814af400ce5221af99e5842c9ad38463ddf93b92f',
    'src/hair-fit-contract.js': 'b9af4047b62a50fa459088d30f9ae674137b0e2d286b62534c0f62c3ee722a4d',
    'src/native-palette-catalog.js': '6e0769fc2f6c992dad647bb5695188ec3f3d4018c21666dcf322d08cb9a1f993',
    'src/native-skin-tone-contract.js': 'd1e8647b50299f6717b9491bd24de341a1428c5bb26272780654bc7502c3e0fc',
    'src/native-lip-color-contract.js': REVIEWED_LIP_RUNTIME['native-lip-color-contract.js'],
    'src/foundation-avatar.js': 'f642605891f4f516881671d67b2cb02857454c269db4850aafb777a4744376c8',
    'src/surface-layers.js': '513b97967ae07428dda6d67387a4de61800d5c72adae640f90bd97b137b77714',
    'package-lock.json': '190e71ef83a8f1d8c94f21caed96b8080bd2e9dcdbcda6bb7b01c5c8fbe5b3a7',
}
REVIEWED_LEGACY_BODY_SHA = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
REVIEWED_LEGACY_BOB_SHA = '3dcf01957d8ab72dfc128c6950f0e9600c2c7b801ea774a612058dc4b5d68110'
FITTED_HEAD_DESCRIPTOR = ROOT / 'scripts/production/fitted-head-budget-v1.json'
FITTED_HEAD_BYTES = FITTED_HEAD_DESCRIPTOR.read_bytes()
FITTED_HEAD_BUDGET = json.loads(FITTED_HEAD_BYTES)
require(FITTED_HEAD_BUDGET['schema'] == 'fitted-head-budget-v1', 'Unsupported fitted head budget descriptor')
LEGACY_PALETTE = {'path':'assets/appearance-color-v3/runtime-manifest.json',
                  'sha256':'2eff13c1d3837c4f8f76b7d97007b219059c212c1031d77e27a2f824715af321'}
# These selectors index explicit per-body registrations. The texture-allocation
# code and loader are still checked against the independently reviewed originals.
REVIEWED_FITTED_HEAD_ROUTES = {
    'src/hairstyle-catalog.js': 'ec8b933b683adb63688077e732cf6ba344ee64138f8e79b12e0fb890da58f58d',
    'src/facial-palette-contract.js': '89d7f0808bf91b501effe3c13b67dd5746ac869a1dbe3378d93bc2e25f3ad1c1',
    'src/appearance-color-policy.js': '623667517b90fe9419a4b55a93b5577960b0ef04e1441a3b55faa7ef46762fbf',
    'src/fitted-head-appearance.js': '7c0ed6f97f7493075e9e17e7b4fa331cc2027d8763981db90f9a4337d6adfc29',
}
# Two distinct original Texture wrappers per part in the reviewed VRM0 loader.
# Their source PNG is shared, while each derived wrapper gets a new Source.
REVIEWED_LEGACY_TEXTURES = FITTED_HEAD_BUDGET['textureBindingProfiles']['vrm0-female-head-v1']
SKIN_IMAGE_PREFIX = 'Selected native skin tone PNG: '
LIP_IMAGE_PREFIX = 'Selected native lip color PNG: '
SKIN_IMAGE_USAGES = {
    'face': 'native-skin-face',
    'eyeline': 'native-skin-eyeline',
    'body': 'native-skin-body-base',
    'covered body': 'native-skin-body-covered',
}
NATIVE_LIP_PACKAGE = 'assets/native-facecontour-lip-package-v1'
NATIVE_SKIN_PACKAGE = 'assets/native-skin-tone-package-v1'
NATIVE_LIP_TONES = {'original', 'native-warm-v1'}
IMAGE_FORMATS = {'.png': 'PNG', '.jpeg': 'JPEG', '.jpg': 'JPEG'}
AGGREGATE_METRICS = ('fileBytes', 'rgba8MipBytes', 'textureObjects')


class UnsupportedBudget(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def sha(data):
    return hashlib.sha256(data).hexdigest()


def collected_records(source, record_file):
    response = subprocess.run(
        ['node', str(COLLECTOR), str(source), str(record_file)],
        capture_output=True, encoding='utf-8', check=False,
    )
    if response.returncode:
        raise ValueError(response.stderr.strip() or 'Record dependency collection failed')
    return json.loads(response.stdout)


def checked_data(public, row):
    data = local(public, row['path']).read_bytes()
    require(len(data) == row['bytes'] and sha(data) == row['sha256'],
            'Dependency changed after collection: '+row['path'])
    return data


def model_roles(reasons, ear_selection):
    result = []
    for reason in reasons:
        if reason == 'Exact foundation body':
            result.append(('body', 'body', 1))
        elif reason == 'Selected hairstyle model':
            result.append(('hair', 'hair', 1))
        elif reason in ('Selected ears model', 'Selected hat model'):
            placements = 2 if reason == 'Selected ears model' and ear_selection == 'pair' else 1
            result.append(('accessory', reason.split()[1], placements))
        elif reason.startswith('Selected live prop: '):
            result.append(('accessory', reason.split(': ', 1)[1], 1))
        elif reason.startswith(('Startup outfit: ', 'Selected outfit: ')):
            result.append(('garment', reason.split(': ', 1)[1], 1))
    return list(dict.fromkeys(result))


def require_implementation(condition, message):
    if not condition:
        raise UnsupportedBudget('unsupported-runtime-implementation', message)


def runtime_source_sha(source, filename):
    return sha(local(source, 'prototype/src/' + filename).read_bytes())


def require_reviewed_source(source, filename):
    actual = runtime_source_sha(source, filename)
    if filename == 'body-texture-coverage.js' and actual == REVIEWED_SUPPLEMENT_RUNTIME[filename]:
        for dependency, expected in REVIEWED_SUPPLEMENT_RUNTIME.items():
            require_implementation(runtime_source_sha(source, dependency) == expected,
                                   'Unsupported runtime resource implementation: prototype/src/' + dependency)
        return
    require_implementation(actual in (REVIEWED_RUNTIME_SOURCE.get(filename), REVIEWED_SKIN_RUNTIME.get(filename),
                                      REVIEWED_LIP_RUNTIME.get(filename)),
                           'Unsupported runtime resource implementation: prototype/src/' + filename)


def require_native_appearance_source(source, *, lip):
    reviewed = REVIEWED_LIP_RUNTIME if (source / 'prototype/src/native-lip-color-contract.js').is_file() else REVIEWED_SKIN_RUNTIME
    require(not lip or reviewed is REVIEWED_LIP_RUNTIME, 'Native lip color requires a reviewed lip runtime')
    coverage = 'body-texture-coverage.js'
    if reviewed is REVIEWED_LIP_RUNTIME and runtime_source_sha(source, coverage) == REVIEWED_SUPPLEMENT_RUNTIME[coverage]:
        reviewed = {**reviewed, **REVIEWED_SUPPLEMENT_RUNTIME}
    for filename, expected in reviewed.items():
        require_implementation(runtime_source_sha(source, filename) == expected,
                               'Unsupported native skin tone resource implementation: ' + filename)


def native_texture_binding(field, usage, width, height):
    per_object = width * height * 4
    return {'field':field, 'usage':usage, 'textureObjectLowerBound':1, 'textureObjectUpperBound':4,
            'rgba8LowerBoundBytes':per_object, 'rgba8UpperBoundBytes':4 * per_object,
            'imageBitmapRgba8Bytes':per_object}


def summarize_native_bindings(bindings):
    return {'decodedImageBitmaps':len(bindings),
            **{key:sum(binding[key] for binding in bindings) for key in
               ('textureObjectLowerBound', 'textureObjectUpperBound', 'rgba8LowerBoundBytes',
                'rgba8UpperBoundBytes', 'imageBitmapRgba8Bytes')}}


def hair_physics(source, public, record, model, metrics):
    fit_rows = [row for row in record['files'] if 'Selected hairstyle body fit' in row['reasons']]
    require(len(fit_rows) <= 1, 'Multiple fit files for the selected hairstyle')
    fit_row = next(iter(fit_rows), None)
    fit = json.loads(checked_data(public, fit_row)) if fit_row else {}
    if fit.get('schema') == 'character-hair-fit-v3':
        require_reviewed_source(source, 'native-hair-attachment.js')
        native = fit['nativeSpring']
        require(metrics['colliders'] == native['colliderCount'] and
                0 < native['expectedJointCount'] <= metrics['springJoints'],
                'Native hair fit disagrees with embedded spring metrics')
        return {'source':'embedded-model', 'springJoints':metrics['springJoints'],
                'colliders':metrics['colliders'], 'expectedRuntimeManagerJointCount':native['expectedJointCount']}
    if fit.get('schema') != 'character-hair-fit-v2':
        require(not fit.get('dynamics'), 'Unsupported hair dynamics descriptor')
        return {'source':'embedded-model' if metrics['springJoints'] or metrics['colliders'] else 'none',
                'springJoints':metrics['springJoints'], 'colliders':metrics['colliders']}
    require_reviewed_source(source, 'character-appearance.js')
    require_reviewed_source(source, 'hair-spring.js')
    # The collector validated the fit and dynamics through validateHairFitData.
    # The legacy GLTFLoader reads the mesh and createHairSpring builds its own manager.
    require(fit['physics'] == 'vrm-spring' and fit['assetSha256'] == model['sha256'] and
            not metrics['springJoints'] and not metrics['colliders'],
            'Unsupported combination of sidecar and embedded hair dynamics')
    dynamics = fit['dynamics']
    metrics['springJoints'] = len(dynamics['joints'])
    metrics['colliders'] = len(dynamics['colliders'])
    return {'source':'hair-fit-sidecar', 'path':fit_row['path'], 'sha256':fit_row['sha256'],
            'springJoints':metrics['springJoints'], 'colliders':metrics['colliders'],
            'environmentColliderObjectsPerProxy':metrics['springJoints']}


def image_cost(source, public, row, enc_format, *, legacy_references=()):
    data = checked_data(public, row)
    with Image.open(io.BytesIO(data)) as image:
        require(image.format == enc_format and not getattr(image, 'is_animated', False),
                'Unsupported standalone image format: '+row['path'])
        width, height = image.size
        image.verify()
    reason = row['reasons']
    fields = [label[len(SKIN_IMAGE_PREFIX):] for label in reason if label.startswith(SKIN_IMAGE_PREFIX)]
    lips = [label[len(LIP_IMAGE_PREFIX):] for label in reason if label.startswith(LIP_IMAGE_PREFIX)]
    skin_bindings, lip_binding = [], None
    if fields:
        require(enc_format == 'PNG' and len(fields) == len(reason) and len(fields) == len(set(fields)) and
                all(field in SKIN_IMAGE_USAGES for field in fields), 'Unsupported native skin tone image roles')
        require_native_appearance_source(source, lip=False)
        # Each field decodes its own bitmap and clones its distinct source textures.
        # Main and outline each expose base and shade maps. Both Body states are cached.
        per_object = width * height * 4
        skin_bindings = [native_texture_binding(field, SKIN_IMAGE_USAGES[field], width, height) for field in fields]
        usage = skin_bindings[0]['usage'] if len(fields) == 1 else 'native-skin-shared-file'
        object_limit = 4 * len(fields)
    elif lips:
        require(enc_format == 'PNG' and len(reason) == 1 and len(lips) == 1 and
                lips[0] in NATIVE_LIP_TONES and (width, height) == (1024, 1024),
                'Unsupported native lip color image roles')
        require_native_appearance_source(source, lip=True)
        usage, object_limit, per_object = 'native-lip-face', 4, width * height * 4
        lip_binding = native_texture_binding(lips[0], usage, width, height)
    elif 'Startup native body coverage PNG' in reason:
        require_reviewed_source(source, 'body-texture-coverage.js')
        usage, object_limit, per_object = 'native-body-coverage', 4, width * height * 4
    elif any(label.startswith('Selected native palette color PNG: ') for label in reason):
        require_reviewed_source(source, 'native-palette-part.js')
        usage, object_limit, per_object = 'native-palette-color', 4, mip_bytes(width, height)
    elif any(label.startswith('Selected native palette source PNG: ') for label in reason):
        usage, object_limit, per_object = 'native-palette-reference', 0, 0
    elif row['path'] in legacy_references:
        usage, object_limit, per_object = 'legacy-facial-palette-reference', 0, 0
    elif all(label.startswith('External glTF resource of ') for label in reason):
        usage, object_limit, per_object = 'gltf-image-counted-in-model', 0, 0
    else:
        raise ValueError('Unsupported standalone image budget mapping: '+row['path'])
    return {'path':row['path'], 'sha256':row['sha256'], 'encodedBytes':len(data), 'width':width, 'height':height,
            'decodedRgba8Bytes':width * height * 4, 'usage':usage, 'addedTextureObjectUpperBound':object_limit,
            'addedRgba8EstimateBytes':object_limit * per_object,
            **({'nativeSkinBindings':skin_bindings} if skin_bindings else {}),
            **({'nativeLipBinding':lip_binding} if lip_binding else {})}


def skin_cache(images):
    bindings = [binding for image in images for binding in image.get('nativeSkinBindings', [])]
    if not bindings:
        return None
    require(sorted(binding['field'] for binding in bindings) == sorted(SKIN_IMAGE_USAGES),
            'Native skin tone budget requires all four distinct fields')
    return {**summarize_native_bindings(bindings),
            'lifetime':'All four fields remain allocated after switching outfit or resetting to original until actor disposal.',
            'accounting':'Texture upper bounds are included in actor totals. Decoded ImageBitmap RGBA8 equivalents are separate.'}


def require_legacy_cache(condition, message):
    if not condition:
        raise UnsupportedBudget('unsupported-reviewed-appearance-cache', message)


def legacy_texture_groups(body, appearance, bindings=REVIEWED_LEGACY_TEXTURES):
    doc = body.doc
    require_legacy_cache(set(bindings) == {'hair', 'brow', 'iris', 'lips'}, 'Unreviewed procedural head texture roles')
    participating = {m['name'] for m in doc['materials'] if '_HAIR' in m['name'] or '_FaceBrow_' in m['name']}
    require_legacy_cache(participating == {bindings[k][0] for k in ('hair', 'brow')},
                         'Unreviewed source hair or brow materials')
    material_properties = doc['extensions']['VRM']['materialProperties']
    groups = {}
    for role, (name, index, (width, height), digest) in bindings.items():
        matches = [i for i, material in enumerate(doc['materials']) if material['name'] == name]
        require_legacy_cache(len(matches) == 1, 'Missing or ambiguous appearance material: '+name)
        material = doc['materials'][matches[0]]
        properties = ref(material_properties, matches[0], 'VRM0 material properties')
        require_legacy_cache(properties['name'] == name and properties['shader'] == 'VRM/MToon' and
                             properties['textureProperties'].get('_MainTex') == index and
                             properties['textureProperties'].get('_ShadeTexture') == index and
                             material['pbrMetallicRoughness']['baseColorTexture']['index'] == index,
                             'Unreviewed base or shade texture binding: '+name)
        texture = ref(doc['textures'], index, 'Appearance source texture')
        sampler = ref(doc['samplers'], texture['sampler'], 'Appearance source sampler')
        require_legacy_cache(sampler.get('minFilter') == sampler.get('magFilter') == 9729 and not texture.get('extensions'),
                             'Unreviewed appearance sampler or mip policy: '+name)
        image = ref(doc['images'], texture['source'], 'Appearance source image')
        require_legacy_cache(image.get('mimeType') == 'image/png' and 'bufferView' in image and 'uri' not in image,
                             'Unreviewed appearance source encoding: '+name)
        raw = body.view_bytes(image['bufferView'])
        with Image.open(io.BytesIO(raw)) as decoded:
            require_legacy_cache(decoded.format == 'PNG' and decoded.mode == 'RGBA' and decoded.size == (width,height) and
                                 not getattr(decoded, 'is_animated', False) and sha(raw) == digest,
                                 'Unreviewed appearance image identity, format or dimensions: '+name)
            decoded.verify()
        field = {'hair':'hairColor', 'brow':'hairColor', 'iris':'eyeColor', 'lips':'lipColor'}[role]
        count = 0 if appearance[field] == 'original' else 2
        canvas = count * width * height * 4
        palette = role in {'iris', 'lips'}
        groups[role] = {'materialName':name, 'sourceTextureIndex':index, 'sourceImageSha256':digest,
                        'width':width, 'height':height, 'field':field, 'selection':appearance[field],
                        'format':'RGBA8-equivalent', 'generateMipmaps':False, 'minFilter':'linear',
                        'distinctDerivedTextures':count, 'logicalTextureRgba8Bytes':canvas,
                        'derivedCanvasRgba8Bytes':canvas, 'retainedImageDataBytes':canvas if palette else 0,
                        'retainedOriginalPixelArrayBytes':canvas if palette else 0,
                        'transientImageDataAllocationBytes':0 if palette else canvas}
    return groups


def legacy_palette_references(public, files, appearance, avatar_sha, groups, palette):
    if appearance['eyeColor'] == appearance['lipColor'] == 'original':
        return []
    reason = 'Selected facial palette manifest'
    manifest_row = [row for row in files if reason in row['reasons']]
    require_legacy_cache(len(manifest_row) == 1 and manifest_row[0]['path'] == palette['path'] and
                         manifest_row[0]['sha256'] == palette['sha256'],
                         'Unreviewed legacy facial palette manifest')
    manifest = json.loads(checked_data(public, manifest_row[0]))
    parts, = [row['parts'] for row in manifest['variants'] if row['avatarSha256'] == avatar_sha]
    paths = []
    for role in ('iris', 'lips'):
        group = groups[role]
        part = parts[role]
        size = [group['width'], group['height']]
        require_legacy_cache(part['materialName'] == group['materialName'] and part['mapSize'] == size and
                             part['sourceMapSha256'] == group['sourceImageSha256'], 'Legacy palette source mismatch: '+role)
        references = [(part['maskUrl'], part['maskSha256'], 'Facial palette mask: '+role, 'L')]
        if role == 'iris':
            references.append((part['neutralMapUrl'], part['neutralMapSha256'], 'Facial palette iris neutral map', 'RGBA'))
        for url, digest, label, mode in references:
            relative = url.removeprefix('/')
            rows = [row for row in files if row['path'] == relative and row['reasons'] == [label]]
            require_legacy_cache(len(rows) == 1 and rows[0]['sha256'] == digest, 'Missing or changed legacy palette input: '+relative)
            with Image.open(io.BytesIO(checked_data(public, rows[0]))) as decoded:
                require_legacy_cache(decoded.format == 'PNG' and decoded.mode == mode and list(decoded.size) == size and
                                     not getattr(decoded, 'is_animated', False), 'Legacy palette input format or dimensions differ: '+relative)
                decoded.verify()
            paths.append(relative)
    return paths


def matches_legacy_appearance_family(recipe):
    appearance = recipe['appearance']
    return (recipe['base'] == {'bodyType':'female','sha256':REVIEWED_LEGACY_BODY_SHA} and
            recipe.get('hairAssetSha256') == REVIEWED_LEGACY_BOB_SHA and
            not recipe.get('surface', {}).get('layers') and
            not recipe.get('skinToneManifestSha256') and not recipe.get('lipColorManifestSha256') and
            appearance.get('eyebrowColor', 'original') == 'original')


def fitted_head_family(recipe):
    rows = [row for row in FITTED_HEAD_BUDGET['families'] if row['base']['sha256'] == recipe['base']['sha256']]
    require_legacy_cache(len(rows) <= 1, 'Ambiguous fitted head budget registration')
    return rows[0] if rows else None


def validate_fitted_head_recipe(recipe, family):
    fit = family['fit']
    require_legacy_cache(
        recipe['base'] == family['base'] and recipe['schema'] == family['recipeSchema'] and
        recipe['rulesVersion'] == family['rulesVersion'] and recipe['appearance'] in family['reviewedLooks'] and
        recipe['appearance']['skinTone'] == recipe['appearance'].get('eyebrowColor', 'original') == 'original' and
        recipe.get('hairAssetSha256') == family['model']['sha256'] and
        recipe.get('hairFit') == {'kind':'explicit-fit-v1', 'id':fit['id'], 'version':fit['version'], 'sha256':fit['sha256']} and
        recipe.get('paletteVersion') == family['palette']['version'] and
        not recipe.get('surface', {}).get('layers') and
        not recipe.get('skinToneManifestSha256') and not recipe.get('lipColorManifestSha256'),
        'Unreviewed fitted head rules, fit, palette version, or appearance selection')


def reviewed_legacy_appearance_cache(source, public, record, recipe, family=None):
    appearance = recipe['appearance']
    body_sha = recipe['base']['sha256']
    if family:
        validate_fitted_head_recipe(recipe, family)
    pins = REVIEWED_LEGACY_CACHE_SOURCE
    if family or runtime_source_sha(source, 'hairstyle-catalog.js') == REVIEWED_FITTED_HEAD_ROUTES['src/hairstyle-catalog.js']:
        pins = {**pins, **REVIEWED_FITTED_HEAD_ROUTES}
        registry = json.loads(local(source, 'prototype/src/fitted-head-appearances.json').read_bytes())
        entries = [row for row in registry if row['bodySha256'] == body_sha]
        if family:
            require_legacy_cache(len(entries) == 1 and
                                 all(appearance[key] in entries[0]['colors'][key] for key in ('hairColor','eyeColor','lipColor')) and
                                 entries[0]['hair']['sourceBodySha256'] == family['sourceBodySha256'] and
                                 entries[0]['palette']['version'] == recipe['paletteVersion'],
                                 'Unreviewed fitted head registration')
        else:
            require_legacy_cache(not entries, 'Fitted head registration overrides the reviewed legacy body')
    for filename, expected in pins.items():
        require_implementation(sha(local(source, 'prototype/'+filename).read_bytes()) == expected,
                               'Unsupported legacy appearance cache implementation: prototype/'+filename)
    files = record['files']
    selected = {}
    if family:
        resources = [('Exact foundation body', family['bodyPath'], body_sha)]
        for key, label in [('model','Selected hairstyle model'), ('manifest','Selected hairstyle manifest'),
                           ('fit','Selected hairstyle body fit')]:
            resources.append((label, family[key]['path'], family[key]['sha256']))
        bindings = FITTED_HEAD_BUDGET['textureBindingProfiles'][family['textureBindingProfile']]
        palette = family['palette']
    else:
        resources = [
            ('Exact foundation body', 'assets/foundation/base-female-roundtrip.vrm', REVIEWED_LEGACY_BODY_SHA),
            ('Selected hairstyle model', 'assets/m2-hairstyle-v1/female-bob.glb', REVIEWED_LEGACY_BOB_SHA),
            ('Selected hairstyle manifest', 'assets/m2-hairstyle-v1/manifest.json',
             '98bc1b0874658a22f696834eb622e03aff92f499d41943d285c825a4fe7ee908'),
        ]
        bindings, palette = REVIEWED_LEGACY_TEXTURES, LEGACY_PALETTE
    for label, path, expected in resources:
        rows = [row for row in files if label in row['reasons']]
        require_legacy_cache(len(rows) == 1 and rows[0]['path'] == path and rows[0]['sha256'] == expected,
                             'Unreviewed legacy cache resource path or identity: '+label)
        selected[label] = rows[0]
    manifest = json.loads(checked_data(public, selected['Selected hairstyle manifest']))
    require_legacy_cache(manifest.get('schema') == 'character-hairstyle-v1' and manifest['physics'] == 'rigid' and
                         manifest['id'] == appearance['hairStyle'] and manifest['sha256'] == recipe['hairAssetSha256'] and
                         manifest['sourceMaterial'] == bindings['hair'][0],
                         'Unreviewed hairstyle material cloning contract')
    asset = AssetCost(local(public, selected['Exact foundation body']['path']))
    require_legacy_cache(sha(asset.raw) == body_sha, 'Appearance body changed after collection')
    groups = legacy_texture_groups(asset, appearance, bindings)
    references = legacy_palette_references(public, files, appearance, body_sha, groups, palette)
    totals = {key:sum(part[key] for part in groups.values()) for key in (
        'distinctDerivedTextures', 'logicalTextureRgba8Bytes', 'derivedCanvasRgba8Bytes',
        'retainedImageDataBytes', 'retainedOriginalPixelArrayBytes', 'transientImageDataAllocationBytes',
    )}
    totals['retainedPixelPayloadUpperBoundBytes'] = sum(totals[key] for key in (
        'derivedCanvasRgba8Bytes', 'retainedImageDataBytes', 'retainedOriginalPixelArrayBytes'))
    return {'schema':'reviewed-legacy-appearance-cache-v1', 'recordSha256':record['recordSha256'],
            'scope':'fresh-actor-pixel-payload-static-diagnostic-only', 'runtimeReconciliation':'not-linked',
            'runtimeAdmission':False, 'groups':groups, 'totals':totals, 'paletteReferencePaths':references,
            **({'resourceFamily':family['id'], 'explicitHairFit':recipe['hairFit'], 'paletteVersion':recipe['paletteVersion'],
                'budgetDescriptorSha256':sha(FITTED_HEAD_BYTES)} if family else {}),
            'skinTone':{'selection':appearance['skinTone'], 'additionalTextureObjects':0, 'materialFactorsOnly':True},
            'sharing':'Bob and hidden original hair use the same original map keys within an actor. Base and shade keys are distinct. Face outline reuses the face keys. Derived Sources are actor-local.',
            'excluded':'Mask-analysis scratch, index/weight arrays, native renderer allocations, prior palette visits and actual CPU heap/VRAM are not measured.'}


def pinned_appearance_manifest(public, entry, package, schema):
    manifest_url = entry.get('manifestUrl', f"/{package}/{entry['bodyType']}/manifest.json")
    data = local(public, manifest_url.lstrip('/')).read_bytes()
    value = json.loads(data)
    require(sha(data) == entry['manifestSha256'] and value.get('schema') == schema and
            value.get('avatarSha256') == entry['bodySha256'] and value.get('version') == 1,
            'Native appearance manifest identity mismatch')
    return value


def native_appearance_cache(source, public, record, images):
    registry = public / NATIVE_LIP_PACKAGE / 'registry.json'
    if not registry.is_file():
        return None
    lip_registry = json.loads(registry.read_bytes())
    require(lip_registry.get('schema') == 'native-facecontour-lip-registry-v1', 'Unexpected native lip registry')
    lip_entries = [item for item in lip_registry['entries'] if item['bodySha256'] == record['avatarSha256']]
    if not lip_entries:
        return None
    require_native_appearance_source(source, lip=True)
    require(len(lip_entries) == 1, 'Budget supports one reviewed native lip choice per body')
    lip_entry, = lip_entries
    skin_registry = json.loads((public / NATIVE_SKIN_PACKAGE / 'registry.json').read_bytes())
    skin_entries = [item for item in skin_registry['entries'] if item['bodySha256'] == record['avatarSha256']]
    require(len(skin_entries) == 1, 'Native lip budget requires one exact warm skin entry')
    skin_entry, = skin_entries
    require(lip_entry['bodyType'] == skin_entry['bodyType'] == record['bodyType'] and
            skin_entry['manifestSha256'] == lip_entry['skinManifestSha256'],
            'Native lip budget requires the paired skin and body registrations')
    skin = pinned_appearance_manifest(public, skin_entry, NATIVE_SKIN_PACKAGE, 'native-skin-tone-package-v1')
    lip = pinned_appearance_manifest(public, lip_entry, NATIVE_LIP_PACKAGE, 'native-facecontour-lip-package-v1')
    require(skin['toneId'] == 'native-warm-v1' and lip['skinManifestSha256'] == skin_entry['manifestSha256'] and
            lip['lipId'] == lip_entry['lipId'] and set(lip['tones']) == NATIVE_LIP_TONES,
            'Native lip budget requires the reviewed four look states')
    variants = {
        'warm-face': (skin['face']['authored'], SKIN_IMAGE_PREFIX + 'face'),
        'warm-eyeline': (skin['eyeline']['authored'], SKIN_IMAGE_PREFIX + 'eyeline'),
        'warm-body-base': (skin['body']['authored'], SKIN_IMAGE_PREFIX + 'body'),
        'warm-body-covered': (skin['body']['coveredAuthored'], SKIN_IMAGE_PREFIX + 'covered body'),
        'original-lip-face': (lip['tones']['original']['authored'], LIP_IMAGE_PREFIX + 'original'),
        'warm-lip-face': (lip['tones']['native-warm-v1']['authored'], LIP_IMAGE_PREFIX + 'native-warm-v1'),
    }
    paths = {field:descriptor['url'].lstrip('/') for field, (descriptor, _) in variants.items()}
    require(len(set(paths.values())) == len(paths) and
            len({variants[field][0]['sha256'] for field in ('warm-face','original-lip-face','warm-lip-face')}) == 3,
            'Budget expects three separately cached Face images and three warm environment images')
    measured = {image['path']:image for image in images if 'nativeSkinBindings' in image or 'nativeLipBinding' in image}
    bindings = {}
    for field, (descriptor, reason) in variants.items():
        path = paths[field]
        actual = measured.get(path)
        if actual is None:
            raw = local(public, path)
            actual = image_cost(source, public, {'path':path, 'sha256':descriptor['sha256'],
                                                'bytes':raw.stat().st_size, 'reasons':[reason]}, 'PNG')
        require(actual['sha256'] == descriptor['sha256'], 'Native appearance image identity mismatch')
        binding = actual['nativeLipBinding'] if reason.startswith(LIP_IMAGE_PREFIX) else actual['nativeSkinBindings'][0]
        require(binding['field'] == reason.split(': ', 1)[1], 'Native appearance image has wrong collected role')
        bindings[field] = binding

    warm_environment = ['warm-eyeline', 'warm-body-base', 'warm-body-covered']
    states = {'original-plain':[], 'original-lip':['original-lip-face'],
              'warm-plain':['warm-face', *warm_environment], 'warm-lip':['warm-lip-face', *warm_environment]}
    matches = [name for name, fields in states.items() if set(measured) == {paths[field] for field in fields}]
    require(len(matches) == 1, 'Selected native appearance closure differs from the reviewed four states')
    cold_state, = matches
    resource_reasons = {reason for item in record['files'] for reason in item['reasons']}
    require(('Selected native skin tone manifest' in resource_reasons) == cold_state.startswith('warm-') and
            ('Selected native lip color manifest' in resource_reasons) == cold_state.endswith('-lip'),
            'Native appearance manifest and cold image closure disagree')
    costs = {name:{'cacheKeys':fields, **summarize_native_bindings([bindings[field] for field in fields])}
             for name, fields in states.items()}
    return {
        'coldState':cold_state,
        'coldLoad':costs[cold_state],
        'coldLoadByState':costs,
        'retainedAfterVisitingAllFourStates':{
            'cacheKeys':list(bindings), **summarize_native_bindings(list(bindings.values())),
        },
        'lifetime':'Cache entries for prepared Face images are keyed by image SHA. Warm Eyeline and both Body states share one cache group. Successful preparations remain allocated until actor disposal, including after resetting selectors or changing outfit.',
        'accounting':'Actor totals include the selected cold texture upper bound only. Retained entries and decoded ImageBitmap equivalents are separate static estimates. The record does not store prior visits.',
    }


def material_cost(source, public, directory, models):
    recipes = []
    for row in directory:
        bindings = [reason.split(': ', 1)[1] for reason in row['reasons'] if reason.startswith(
            'Selected garment material: ')]
        if not bindings:
            continue
        for file, expected in {**RECIPE_SOURCE_PINS,
                               'prototype/src/material-recipes.js':REVIEWED_MATERIAL_RUNTIME_SHA}.items():
            require_implementation(sha(local(source, file).read_bytes()) == expected,
                                   'Unsupported garment material implementation source: '+file)
        recipe = json.loads(checked_data(public, row))
        for identifier in bindings:
            require(any(model['id'] == identifier and model['selected'] for model in models),
                    'Material recipe has no selected garment: '+identifier)
            require(set(recipe['settings']) <= {'linearColor', 'fabricStart'}, 'Unsupported cloth recipe settings')
            recipes.append({'id':recipe['id'], 'equipmentId':identifier, 'path':row['path'],
                            'sha256':row['sha256'], 'declaredMaterialClones':len(recipe['materialNames']),
                            'additionalTextureObjects':0, 'sourceMaps':'shared with original garment material'})
    return recipes


def totals_for(rows, images, *, final, appearance_cache=None):
    totals = aggregate(rows)
    totals['placedNodeTriangles'] = sum(row['placements'] * row['cost']['metrics']['nodeTriangles'] for row in rows)
    totals['standaloneEncodedImageBytes'] = sum(row['encodedBytes'] for row in images)
    totals['mergedExternalImageBytes'] = sum(row['encodedBytes'] for row in images
                                            if row['usage'] != 'gltf-image-counted-in-model')
    totals['fileBytes'] += totals['externalImageBytes'] + totals['mergedExternalImageBytes']
    totals['textureObjects'] = totals['textures'] + sum(row['addedTextureObjectUpperBound'] for row in images)
    totals['rgba8MipBytes'] += sum(row['addedRgba8EstimateBytes'] for row in images)
    if appearance_cache:
        totals['textureObjects'] += appearance_cache['totals']['distinctDerivedTextures']
        totals['rgba8MipBytes'] += appearance_cache['totals']['logicalTextureRgba8Bytes']
    return {'scope':'selected-look' if final else 'startup-and-selected-models',
            'totals':totals,
            'aggregateExcesses':[{'metric':metric, 'actual':totals[metric], 'limit':AGGREGATE_LIMITS[metric]}
                                 for metric in AGGREGATE_METRICS if totals[metric] > AGGREGATE_LIMITS[metric]]}


def measure_record(source, record, config, recipe):
    public = source / 'prototype/public'
    appearance_cache = None
    uses_hair_cache = record['hairColor'] != 'original'
    uses_legacy_palette = any('Selected facial palette manifest' in row['reasons'] for row in record['files'])
    family = fitted_head_family(recipe)
    if family and any(value != 'original' for value in recipe['appearance'].values()):
        appearance_cache = reviewed_legacy_appearance_cache(source, public, record, recipe, family)
    elif (uses_hair_cache or uses_legacy_palette) and matches_legacy_appearance_family(recipe):
        appearance_cache = reviewed_legacy_appearance_cache(source, public, record, recipe)
    elif uses_hair_cache:
        raise UnsupportedBudget('unsupported-hair-color-budget',
                                f"{record['id']} uses {record['hairColor']} hair color. This preset allocates "
                                "derived Canvas/Texture cache entries for hair and eyebrow maps. "
                                "The hair resource family is outside the reviewed static model.")
    palette_references = appearance_cache['paletteReferencePaths'] if appearance_cache else ()
    models, images = [], []
    for row in record['files']:
        relative = row['path']
        suffix = pathlib.PurePosixPath(relative).suffix.lower()
        roles = model_roles(row['reasons'], record['earSelection'])
        if roles:
            asset = local(public, relative)
            for asset_class, identifier, placements in roles:
                if identifier == 'ears':
                    require_reviewed_source(source, 'rigid-accessory-layer.js')
                result = check(asset, asset_class, config)
                require(result['sha256'] == row['sha256'] and result['metrics']['fileBytes'] == row['bytes'],
                        'Model changed after collection: '+relative)
                metrics = result['metrics']
                model = {'id':identifier, 'path':relative, 'sha256':row['sha256'], 'class':asset_class,
                         'selected':asset_class != 'garment' or identifier in record['equipmentIds'],
                         'placements':placements, 'cost':{'metrics':metrics}}
                if asset_class == 'hair':
                    model['hairPhysics'] = hair_physics(source, public, record, model, metrics)
                model['assetExcesses'] = [
                    {'metric':metric, 'actual':metrics[metric], 'limit':limit}
                    for metric, limit in config['classes'][asset_class].items() if metrics[metric] > limit
                ]
                models.append(model)
        elif relative.startswith('assets/motion/'):
            continue
        elif suffix in IMAGE_FORMATS:
            images.append(image_cost(source, public, row, IMAGE_FORMATS[suffix], legacy_references=palette_references))
        else:
            require(suffix == '.json', 'Unsupported resource budget format: '+relative)
            checked_data(public, row)
    selected = [row for row in models if row['selected']]
    require(sum(row['class'] == 'body' for row in models) == 1 and
            sorted(row['id'] for row in selected if row['class'] == 'garment') == sorted(record['equipmentIds']),
            'Collected models do not cover the complete body and selected outfit')
    materials = material_cost(source, public, record['files'], selected)
    native_appearance = native_appearance_cache(source, public, record, images)
    has_lip = any('nativeLipBinding' in image for image in images)
    skin = skin_cache(images) if not has_lip else None
    require(not has_lip or native_appearance, 'Native lip color requires a reviewed appearance cache')
    if not native_appearance:
        require(bool(skin) == any('Selected native skin tone manifest' in row['reasons'] for row in record['files']),
                'Native skin tone manifest and budgeted bindings disagree')
    visible = totals_for(selected, images, final=True, appearance_cache=appearance_cache)
    resident = totals_for(models, images, final=False, appearance_cache=appearance_cache)
    status = 'over-budget' if visible['aggregateExcesses'] or resident['aggregateExcesses'] or any(
        model['assetExcesses'] for model in models) else 'within-static-limits'
    return {**record, 'status':status, 'models':models, 'standaloneImages':images, 'materialRecipes':materials,
            **({'nativeSkinToneCache':skin} if skin else {}),
            **({'nativeAppearanceTextureCache':native_appearance} if native_appearance else {}),
            **({'reviewedLegacyAppearanceCache':appearance_cache} if appearance_cache else {}),
            'selectedCost':visible, 'startupAndSelectedCost':resident,
            'closureSourceBytes':sum(row['bytes'] for row in record['files'])}


def measure(input_file, source, version):
    config = budget_config(BUDGET, version)
    collected = collected_records(source, input_file)
    raw = input_file.read_bytes()
    require(sha(raw) == collected['inputSha256'], 'Record input changed after dependency collection')
    data = json.loads(raw)
    input_records = data if isinstance(data, list) else [data]
    recipes = {record['integrity']['recordSha256']: record['appearanceRecipe'] for record in input_records}
    records = [measure_record(source, row, config, recipes[row['recordSha256']]) for row in collected['records']]
    measured_legacy = any('reviewedLegacyAppearanceCache' in row for row in records)
    shared_files = {}
    for record in records:
        for row in record['files']:
            key = row['path']
            require(key not in shared_files or shared_files[key] == (row['sha256'], row['bytes']),
                    'Dependency changed between record measurements: '+key)
            shared_files[key] = row['sha256'], row['bytes']
    totals = ['rgba8MipBytes', 'textureObjects', 'placedNodeTriangles']
    return {
        'schema':SCHEMA, 'readOnly':True, 'sourceCommit':collected['sourceCommit'],
        'inputSha256':collected['inputSha256'], 'budgetVersion':config['version'],
        'budgetFileSha256':sha(BUDGET.read_bytes()),
        'status':'over-budget' if any(row['status'] == 'over-budget' for row in records) else 'within-static-limits',
        'ordinaryPCPerformance':'unmeasured', 'temporaryAggregateLimits':AGGREGATE_LIMITS,
        **({'accountingMode':'reviewed-legacy-appearance-cache-v1', 'runtimeAdmission':False} if measured_legacy else {}),
        'textureEstimateScope':{
            'metrics':['textureObjects', 'rgba8MipBytes'],
            'included':['image textures declared by measured models', 'supported derived image textures'],
            'unmodeledRendererAllocations':['bone data textures', 'morph data array textures',
                                           'renderer-specific texture, source and sampler allocation'],
        },
        'records':records, 'closureUnionFileCount':len(shared_files),
        'closureUnionSourceBytes':sum(size for _, size in shared_files.values()),
        'sumAcrossSelectedActors':{name:sum(row['selectedCost']['totals'][name] for row in records) for name in totals},
        'limitations':[
            'RGBA8 estimates use standalone model texture objects and full mip chains except for the reviewed linear-only native cover, skin and lip maps.',
            'Record totals start from a fresh actor. Native appearance cache estimates show the effect of prior selections separately from cold totals, where reviewed.',
            'Native cover and palette additions allow up to four source texture clones per actor and field, derived from two materials and two maps. Source-only palette references contribute no texture objects.',
            'All parsed model mesh definitions contribute to the estimate. Hidden source geometry, animation, renderer allocations, prior looks and in-flight preparation need runtime measurement.',
            'Paired ear placements share their one parsed model and source textures by the rigid accessory implementation. Their placed triangles count both instances.',
            'Transfer closure bytes count each path once. Actor texture estimates sum the per-record values.',
            'Procedural legacy palette and surface texturing, compressed buffers and unrecognized standalone resources need another budget model.',
            'Hair sidecar collider totals cover authored body colliders. Runtime room proxies allocate separate collider objects per joint.',
            'Native hair retains the existing embedded authored joint metric. Its fit separately declares the expected active manager joint count.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['measure'])
    parser.add_argument('records', type=pathlib.Path)
    parser.add_argument('--source-root', required=True, type=pathlib.Path)
    parser.add_argument('--budget-version', required=True)
    args = parser.parse_args()
    try:
        result = measure(args.records.resolve(), args.source_root.resolve(), args.budget_version)
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
        return 1 if result['status'] == 'over-budget' else 0
    except UnsupportedBudget as error:
        print(json.dumps({'schema':SCHEMA, 'status':'unsupported', 'code':error.code, 'error':str(error),
                          'ordinaryPCPerformance':'unmeasured'}))
        return 2
    except (ValueError, KeyError, IndexError, TypeError, OSError, ImportError, struct.error, Image.DecompressionBombError) as error:
        print(json.dumps({'schema':SCHEMA, 'status':'invalid', 'error':str(error), 'ordinaryPCPerformance':'unmeasured'}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
