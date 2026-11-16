"""Read-only aggregate cost measurement for a small set of explicit looks."""
import argparse
import hashlib
import io
import json
import pathlib
import sys

from PIL import Image

from asset_budget import AssetCost, ROOT, budget_config, check, local, read_json, require


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
    for recipe in look.get('materialRecipes', []):
        dep = read_dependency({**recipe, 'kind': 'material-recipe'})
        if dep['path'] not in seen_dependencies:
            dependencies.append(dep); seen_dependencies.add(dep['path'])
        textures = []
        for texture in recipe.get('textureFiles', []):
            require(texture.get('path') not in [x['path'] for x in textures], 'Duplicate recipe texture path: '+str(texture.get('path')))
            texture_path = local(ROOT, texture['path'])
            observed = recipe_texture(texture_path)
            require(observed['sha256'] == texture.get('sha256'), 'Recipe texture SHA mismatch: '+texture['path'])
            textures.append(observed)
            recipe_objects.append({**observed, 'recipeId': recipe.get('id')})
        recipe_rows.append({'id': recipe.get('id'), 'path': dep['path'], 'sha256': dep['sha256'],
                            'textureFiles': textures, 'textureObjects': len(textures)})
    totals = aggregate(asset_rows)
    encoded_images = sum(image['encodedBytes'] for row in asset_rows for image in row['cost']['images']) + sum(x['encodedBytes'] for x in recipe_objects)
    texture_objects = totals['textures'] + len(recipe_objects)
    all_payloads = [(image['sha256'], image['encodedBytes'], image['rgba8MipBytes'], 'GLB/VRM')
                    for row in asset_rows for image in row['cost']['images']]
    all_payloads += [(image['sha256'], image['encodedBytes'], image['rgba8MipBytes'], 'material-recipe') for image in recipe_objects]
    unique = {}
    for image_sha, encoded, mip, kind in all_payloads:
        unique.setdefault(image_sha, {'encodedBytes': encoded, 'rgba8MipBytes': mip, 'kinds': set()})['kinds'].add(kind)
    totals.update({'encodedImageBytes': encoded_images, 'textureObjects': texture_objects,
                   'recipeTextureObjects': len(recipe_objects), 'dependencyBytes': sum(x['bytes'] for x in dependencies),
                   'uniqueImagePayloadBytesInformational': sum(x['encodedBytes'] for x in unique.values()),
                   'uniqueImageRgba8MipBytesInformational': sum(x['rgba8MipBytes'] for x in unique.values()),
                   'crossAssetDuplicatePayloadBytesInformational': encoded_images - sum(x['encodedBytes'] for x in unique.values())})
    legacy = [row['id'] for row in asset_rows if row['assetStatus'] == 'legacy-observation']
    return {'schema': 'zbgs-selected-look-budget-result-v1', 'lookId': look['id'],
            'role': look.get('role'), 'bodyType': look.get('bodyType'),
            'assetRows': asset_rows, 'dependencies': dependencies, 'materialRecipes': recipe_rows,
            'totals': totals, 'legacyObservationAssets': legacy,
            'temporaryAggregateLimits': AGGREGATE_LIMITS,
            'status': 'legacy-observation' if legacy else 'measured-unadmitted-temporary-limit',
            'ordinaryPCPerformance': 'unmeasured',
            'limitations': ['Cross-GLB image hash dedupe is informational only and never reduces texture-object or RGBA8 estimates.',
                            'Material recipe texture files are counted as additional texture objects when explicitly declared.',
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
    except (ValueError, KeyError, IndexError, TypeError, OSError, ImportError) as error:
        print(json.dumps({'schema': 'zbgs-selected-look-budget-result-v1', 'look': args.look,
                          'status': 'invalid', 'error': str(error), 'ordinaryPCPerformance': 'unmeasured'}, ensure_ascii=False, indent=2))
        return 2


if __name__ == '__main__':
    sys.exit(main())
