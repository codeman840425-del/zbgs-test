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

from asset_budget import ROOT, budget_config, check, local, require
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


def image_cost(source, public, row, enc_format):
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


def totals_for(rows, images, *, final):
    totals = aggregate(rows)
    totals['placedNodeTriangles'] = sum(row['placements'] * row['cost']['metrics']['nodeTriangles'] for row in rows)
    totals['standaloneEncodedImageBytes'] = sum(row['encodedBytes'] for row in images)
    totals['mergedExternalImageBytes'] = sum(row['encodedBytes'] for row in images
                                            if row['usage'] != 'gltf-image-counted-in-model')
    totals['fileBytes'] += totals['externalImageBytes'] + totals['mergedExternalImageBytes']
    totals['textureObjects'] = totals['textures'] + sum(row['addedTextureObjectUpperBound'] for row in images)
    totals['rgba8MipBytes'] += sum(row['addedRgba8EstimateBytes'] for row in images)
    return {'scope':'selected-look' if final else 'startup-and-selected-models',
            'totals':totals,
            'aggregateExcesses':[{'metric':metric, 'actual':totals[metric], 'limit':AGGREGATE_LIMITS[metric]}
                                 for metric in AGGREGATE_METRICS if totals[metric] > AGGREGATE_LIMITS[metric]]}


def measure_record(source, record, config):
    if record['hairColor'] != 'original':
        raise UnsupportedBudget('unsupported-hair-color-budget',
                                f"{record['id']} uses {record['hairColor']} hair color. This preset allocates "
                                "derived Canvas/Texture cache entries for hair and eyebrow maps. "
                                "A cost model for those entries is unavailable.")
    public = source / 'prototype/public'
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
            images.append(image_cost(source, public, row, IMAGE_FORMATS[suffix]))
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
    visible = totals_for(selected, images, final=True)
    resident = totals_for(models, images, final=False)
    status = 'over-budget' if visible['aggregateExcesses'] or resident['aggregateExcesses'] or any(
        model['assetExcesses'] for model in models) else 'within-static-limits'
    return {**record, 'status':status, 'models':models, 'standaloneImages':images, 'materialRecipes':materials,
            **({'nativeSkinToneCache':skin} if skin else {}),
            **({'nativeAppearanceTextureCache':native_appearance} if native_appearance else {}),
            'selectedCost':visible, 'startupAndSelectedCost':resident,
            'closureSourceBytes':sum(row['bytes'] for row in record['files'])}


def measure(input_file, source, version):
    config = budget_config(BUDGET, version)
    collected = collected_records(source, input_file)
    records = [measure_record(source, row, config) for row in collected['records']]
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
