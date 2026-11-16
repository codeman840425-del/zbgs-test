"""Read-only aggregate cost measurement for a small set of explicit looks."""
import argparse
import hashlib
import io
import json
import math
import pathlib
import struct
import sys

from PIL import Image

from asset_budget import AssetCost, ROOT, budget_config, check, local, read_json, require

RECIPE_IMPLEMENTATION = 'cloth-normal-v4-review1'
RECIPE_SOURCE_PINS = {
    'prototype/src/material-recipes.js': 'be6ab537823b6c74ca68bef889cfe2e887bf19eeceed4ea49243ac16902ab1cd',
    'prototype/src/cloth-material.js': '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565',
}


AGGREGATE_LIMITS = {
    'status': 'temporary-unmeasured',
    'fileBytes': 64 * 1024 * 1024,
    'rgba8MipBytes': 256 * 1024 * 1024,
    'textureObjects': 96,
    'ordinaryPCPerformance': 'unmeasured',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mip_bytes(width, height):
    total = 0
    while True:
        total += width * height * 4
        if width == height == 1:
            return total
        width, height = max(1, width // 2), max(1, height // 2)


def recipe_texture(path):
    data = path.read_bytes()
    with Image.open(io.BytesIO(data)) as image:
        require(image.format in ['PNG', 'JPEG'], 'Recipe texture must be PNG/JPEG: '+str(path))
        require(not getattr(image, 'is_animated', False), 'Animated recipe texture unsupported: '+str(path))
        image.verify()
        width, height = image.size
    return {'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': sha(path),
            'encodedBytes': len(data), 'width': width, 'height': height,
            'rgba8MipBytes': mip_bytes(width, height)}


def read_dependency(row):
    require(isinstance(row, dict) and isinstance(row.get('path'), str) and isinstance(row.get('sha256'), str),
            'Dependency requires path and sha256')
    path = local(ROOT, row['path'])
    data = path.read_bytes()
    require(sha(path) == row['sha256'], 'Dependency SHA mismatch: '+row['path'])
    if 'bytes' in row:
        require(row['bytes'] == len(data), 'Dependency byte mismatch: '+row['path'])
    return {'path': row['path'].replace('\\', '/'), 'sha256': row['sha256'], 'bytes': len(data),
            'kind': row.get('kind', 'metadata')}


def asset_path(entry):
    path = local(ROOT, entry['path'])
    require(path.suffix.lower() in ['.glb', '.vrm'], 'Selected asset must be GLB/VRM: '+entry['path'])
    return path


def aggregate(metrics):
    names = ['fileBytes', 'externalImageBytes', 'uniquePositionVertices', 'primitiveVertices', 'triangles',
             'nodeTriangles', 'primitives', 'skins', 'jointSlots', 'morphAccessorBytes', 'materials',
             'textures', 'images', 'rgba8MipBytes', 'springJoints', 'colliders']
    return {name: sum(row['cost']['metrics'][name] for row in metrics) for name in names}


def add_recipe_texture_cost(totals, recipe_objects):
    """Keep the texture count, encoded payload and mip estimate in one operation."""
    totals['recipeTextureObjects'] = len(recipe_objects)
    totals['recipeTextureEncodedBytes'] = sum(row['encodedBytes'] for row in recipe_objects)
    totals['recipeTextureRgba8MipBytes'] = sum(row['rgba8MipBytes'] for row in recipe_objects)
    totals['textureObjects'] = totals['textures'] + totals['recipeTextureObjects']
    totals['rgba8MipBytes'] += totals['recipeTextureRgba8MipBytes']


def validate_recipe(selection, asset_rows, dependencies):
    """Mirror the one current runtime recipe and its clone/shared-map behavior."""
    recipe = read_json(local(ROOT, selection['path']))
    allowed = {'schema', 'id', 'version', 'status', 'fit', 'implementation', 'materialNames', 'settings', 'preserves', 'limits'}
    require(isinstance(recipe, dict) and set(recipe) == allowed, 'Recipe fields unsupported: '+selection['path'])
    impl = recipe['implementation']
    require(recipe['schema'] == 'zbgs-garment-material-recipe-v1' and recipe['id'] == selection['id'] and
            type(recipe['version']) is int and recipe['version'] == 1 and
            impl == {'id': RECIPE_IMPLEMENTATION, 'sha256': RECIPE_SOURCE_PINS['prototype/src/cloth-material.js'], 'threeRevision': '187'},
            'Recipe version/implementation unsupported: '+selection['path'])
    # The reviewed implementation clones materials and reuses their original
    # map references. It has no external texture fetch or texture-file field.
    require(selection.get('textureFiles', []) == [], 'Recipe implementation declares no external textures: '+selection['path'])
    fit = recipe['fit']
    matching = [row for row in asset_rows if row['id'] == fit.get('equipmentId')]
    bodies = [row for row in asset_rows if row['class'] == 'body']
    require(len(matching) == len(bodies) == 1 and matching[0]['sha256'] == fit.get('garmentSha256') and
            bodies[0]['sha256'] == fit.get('avatarSha256'), 'Recipe selected garment/body mismatch')
    manifests = [read_json(local(ROOT, dep['path'])) for dep in dependencies if dep['path'].endswith('.json')]
    entries = [entry for manifest in manifests if manifest.get('schema') == 'zbgs-equipment-v1'
               for entry in manifest['items'] if entry['id'] == fit['equipmentId']]
    require(len(entries) == 1, 'Recipe requires one pinned equipment manifest entry')
    entry = entries[0]
    require(fit == {'equipmentId': entry['id'], 'garmentSha256': entry['sha256'],
                    'avatarSha256': entry['compatibleAvatarSha256'], 'fitId': entry['fitId'], 'styleId': entry['styleId']},
            'Recipe manifest fit mismatch')
    refs = [row for row in entry.get('materialRecipes', []) if row['id'] == recipe['id']]
    require(len(refs) == 1 and refs[0]['sha256'] == selection['sha256'] and
            refs[0]['bytes'] == local(ROOT, selection['path']).stat().st_size and
            selection['path'] == 'prototype/public'+refs[0]['url'], 'Recipe manifest resource pin mismatch')
    garment = AssetCost(local(ROOT, matching[0]['path'])).doc
    names = [garment['materials'][primitive['material']]['name'] for mesh in garment['meshes'] for primitive in mesh['primitives']]
    require(sorted(names) == sorted(recipe['materialNames']), 'Recipe material names mismatch')
    settings = recipe['settings']
    require(set(settings) <= {'linearColor', 'fabricStart'}, 'Recipe texture/settings fields unsupported')
    for name, default, length in [('linearColor', [.025, .032, .055], 3), ('fabricStart', [.17, .21], 2)]:
        values = settings.get(name, default)
        require(isinstance(values, list) and len(values) == length and
                all(type(value) in [int, float] and math.isfinite(value) and 0 <= value <= 1 for value in values),
                'Recipe settings invalid: '+name)
    bounds = settings.get('fabricStart', [.17, .21])
    require(bounds[0] < bounds[1], 'Recipe fabricStart must increase')
    return {'id': recipe['id'], 'path': selection['path'], 'sha256': selection['sha256'],
            'textureFiles': [], 'textureObjects': 0, 'externalTextureDependencyValidation': 'complete for pinned current implementation',
            'implementation': impl, 'materialClones': len(names), 'sourceTextureReferences': 'shared original garment maps; no new texture fetch'}


def measure_look(look, config):
    require(look.get('schema') == 'zbgs-selected-look-budget-v1', 'Look schema unsupported')
    require(isinstance(look.get('assets'), list) and look['assets'], 'Look assets must be nonempty')
    asset_rows = []
    asset_ids = set()
    for entry in look['assets']:
        require(entry.get('id') not in asset_ids, 'Duplicate selected asset ID: '+str(entry.get('id')))
        asset_ids.add(entry.get('id'))
        path = asset_path(entry)
        expected = entry.get('sha256')
        require(isinstance(expected, str), 'Selected asset SHA required: '+str(entry.get('id')))
        require(sha(path) == expected, 'Selected asset SHA mismatch: '+str(entry.get('id')))
        asset_class = entry.get('class')
        require(asset_class in config['classes'], 'Selected asset class unsupported: '+str(asset_class))
        cost = check(path, asset_class, config)
        asset_status = 'legacy-observation' if cost['status'] == 'rejected' else 'admitted-by-single-asset-budget'
        asset_rows.append({'id': entry['id'], 'role': entry.get('role'), 'class': asset_class,
                           'path': entry['path'].replace('\\', '/'), 'sha256': cost['sha256'],
                           'assetStatus': asset_status, 'violations': cost['violations'], 'cost': cost})
    dependencies = []
    seen_dependencies = set()
    for row in look.get('dependencies', []):
        dep = read_dependency(row)
        if dep['path'] not in seen_dependencies:
            dependencies.append(dep); seen_dependencies.add(dep['path'])
    recipe_rows = []
    recipe_objects = []
    recipe_ids = set()
    for recipe in look.get('materialRecipes', []):
        require(set(recipe) <= {'id', 'path', 'sha256', 'bytes', 'textureFiles'}, 'Recipe selection fields unsupported')
        require(recipe.get('id') not in recipe_ids, 'Duplicate selected recipe ID: '+str(recipe.get('id')))
        recipe_ids.add(recipe.get('id'))
        dep = read_dependency({**recipe, 'kind': 'material-recipe'})
        if dep['path'] not in seen_dependencies:
            dependencies.append(dep); seen_dependencies.add(dep['path'])
        recipe_rows.append(validate_recipe(recipe, asset_rows, dependencies))
    if recipe_rows:
        for path, expected in RECIPE_SOURCE_PINS.items():
            dependencies.append(read_dependency({'path': path, 'sha256': expected, 'kind': 'recipe-implementation-source'}))
    totals = aggregate(asset_rows)
    add_recipe_texture_cost(totals, recipe_objects)
    encoded_images = sum(image['encodedBytes'] for row in asset_rows for image in row['cost']['images']) + sum(x['encodedBytes'] for x in recipe_objects)
    all_payloads = [(image['sha256'], image['encodedBytes'], image['rgba8MipBytes'], 'GLB/VRM')
                    for row in asset_rows for image in row['cost']['images']]
    all_payloads += [(image['sha256'], image['encodedBytes'], image['rgba8MipBytes'], 'material-recipe') for image in recipe_objects]
    unique = {}
    for image_sha, encoded, mip, kind in all_payloads:
        unique.setdefault(image_sha, {'encodedBytes': encoded, 'rgba8MipBytes': mip, 'kinds': set()})['kinds'].add(kind)
    totals.update({'encodedImageBytes': encoded_images, 'dependencyBytes': sum(x['bytes'] for x in dependencies),
                   'uniqueImagePayloadBytesInformational': sum(x['encodedBytes'] for x in unique.values()),
                   'uniqueImageRgba8MipBytesInformational': sum(x['rgba8MipBytes'] for x in unique.values()),
                   'crossAssetDuplicatePayloadBytesInformational': encoded_images - sum(x['encodedBytes'] for x in unique.values())})
    legacy = [row['id'] for row in asset_rows if row['assetStatus'] == 'legacy-observation']
    excesses = [{'metric': name, 'actual': totals[name], 'limit': AGGREGATE_LIMITS[name]}
                for name in ['fileBytes', 'rgba8MipBytes', 'textureObjects'] if totals[name] > AGGREGATE_LIMITS[name]]
    return {'schema': 'zbgs-selected-look-budget-result-v1', 'lookId': look['id'],
            'budgetVersion': config['version'],
            'role': look.get('role'), 'bodyType': look.get('bodyType'),
            'assetRows': asset_rows, 'dependencies': dependencies, 'materialRecipes': recipe_rows,
            'totals': totals, 'legacyObservationAssets': legacy,
            'temporaryAggregateLimits': AGGREGATE_LIMITS,
            'aggregateLimitExcesses': excesses,
            'status': 'legacy-observation' if legacy else 'measured-unadmitted-temporary-limit',
            'ordinaryPCPerformance': 'unmeasured',
            'limitations': ['Cross-GLB image hash dedupe is informational only and never reduces texture-object or RGBA8 estimates.',
                            'Only the pinned current cloth-normal-v4-review1 recipe implementation is supported; it shares source maps and fetches no additional textures.',
                            'Renderer clone/cache/ sampler allocation and browser GPU memory are unmeasured.',
                            'Aggregate limits are temporary and do not admit a look or override single-asset legacy status.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['measure'])
    parser.add_argument('look')
    parser.add_argument('--look-id')
    parser.add_argument('--budget-version', required=True)
    parser.add_argument('--budget', default='scripts/production/asset-budgets-v1.json')
    args = parser.parse_args()
    try:
        config = budget_config(local(ROOT, args.budget), args.budget_version)
        look = read_json(local(ROOT, args.look))
        if look.get('schema') == 'zbgs-selected-look-inputs-v1':
            choices = [row for row in look['looks'] if args.look_id is None or row['id'] == args.look_id]
            require(len(choices) == 1, 'look-id must select exactly one representative look')
            look = choices[0]
        result = measure_look(look, config)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, KeyError, IndexError, TypeError, AttributeError, OSError, ImportError, struct.error) as error:
        print(json.dumps({'schema': 'zbgs-selected-look-budget-result-v1', 'look': args.look,
                          'status': 'invalid', 'error': str(error), 'ordinaryPCPerformance': 'unmeasured'}, ensure_ascii=False, indent=2))
        return 2


if __name__ == '__main__':
    sys.exit(main())
