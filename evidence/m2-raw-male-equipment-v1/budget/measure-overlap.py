"""Read a fixed source/dist closure and map the original outfit bytes retained in it."""

import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from asset_budget import AssetCost, COMPONENTS  # noqa: E402


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_json(path):
    return json.loads(path.read_bytes())


def exact_files(public, dist, record):
    files = []
    for row in record['files']:
        for directory in (public, dist):
            raw = (directory / row['path']).read_bytes()
            if len(raw) != row['bytes'] or sha(raw) != row['sha256']:
                raise ValueError(f"Closure file changed: {directory.name}/{row['path']}")
        files.append({key: row[key] for key in ('path', 'bytes', 'sha256', 'reasons')})
    return files


def material_texture_ids(doc, index):
    def visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key.endswith('Texture') and isinstance(child, dict) and 'index' in child:
                    yield child['index']
                yield from visit(child)
        elif isinstance(value, list):
            for child in value:
                yield from visit(child)

    result = set(visit(doc['materials'][index]))
    legacy = doc['extensions']['VRM']['materialProperties'][index]['textureProperties']
    result.update(texture for texture in legacy.values() if texture >= 0)
    return result


def source_geometry(body, authored):
    doc = body.doc
    observed = []
    for row in authored['items']:
        selection = row['selection']
        for source in selection if isinstance(selection, list) else [selection]:
            selector = source['selector']
            mesh, prim = selector['mesh'], selector['primitive']
            node = doc['nodes'][selector['node']]
            primitive = doc['meshes'][mesh]['primitives'][prim]
            material = doc['materials'][primitive['material']]
            indices_id = primitive['indices']
            indices = body.accessor(indices_id)
            index_stream = doc['accessors'][indices_id]
            position_id = primitive['attributes']['POSITION']
            if not (node['mesh'] == mesh and node['skin'] == selector['skin'] and
                    primitive['material'] == selector['material'] and material['name'] == source['materialName'] and
                    len(indices) == 3 * source['triangles'] and len(set(indices)) == source['referencedVertices']):
                raise ValueError(f"Authored source receipt differs: {row['id']}")
            observed.append({
                'id': row['id'], 'mesh': mesh, 'primitive': prim, 'materialIndex': selector['material'],
                'materialName': material['name'], 'triangles': source['triangles'],
                'positionAccessor': position_id, 'positionAccessorVertices': len(body.accessor(position_id)),
                'referencedVertices': len(set(indices)), 'indexAccessor': indices_id,
                'indexElementPayloadBytes': len(indices) * COMPONENTS[index_stream['componentType']][1],
            })
    return observed


def measure():
    fixed = ROOT / 'experiments/worktrees/raw-male-source-outfit-v1/prototype'
    public, dist = fixed / 'public', fixed / 'dist'
    build = read_json(dist / 'build-info.json')
    closure = read_json(HERE / 'record-closure.json')
    budget = read_json(HERE / 'record-budget.json')
    authored = read_json(HERE.parent / 'outfit-report.json')
    source_record, = closure['records']
    budget_record, = budget['records']
    if not (source_record['recordSha256'] == budget_record['recordSha256'] and
            budget['sourceCommit'] == closure['sourceCommit'] and
            budget['inputSha256'] == closure['inputSha256']):
        raise ValueError('Closure and budget identities differ')
    files = exact_files(public, dist, source_record)
    models = {}
    for row in budget_record['models']:
        model = AssetCost(public / row['path'])
        result = model.measure()
        if result['sha256'] != row['sha256'] or result['metrics'] != row['cost']['metrics']:
            raise ValueError(f"Model measurement changed: {row['id']}")
        models[row['id']] = (model, result)
    for row in authored['items']:
        if models[row['id']][1]['sha256'] != row['equipment']['sha256']:
            raise ValueError(f"Authored garment receipt differs: {row['id']}")
    body, body_cost = models['body']
    if body_cost['sha256'] != authored['bodySha256']:
        raise ValueError('Authored body receipt differs')
    original = source_geometry(body, authored)
    selected = {(row['mesh'], row['primitive']) for row in original}
    material_indices = {row['materialIndex'] for row in original}
    remaining_primitives = [primitive for mesh, row in enumerate(body.doc['meshes'])
                            for index, primitive in enumerate(row['primitives']) if (mesh, index) not in selected]
    retained_materials = {primitive['material'] for primitive in remaining_primitives}
    retained_positions = {primitive['attributes']['POSITION'] for primitive in remaining_primitives}
    retained_textures = {texture for material in retained_materials for texture in material_texture_ids(body.doc, material)}
    retained_images = {body.doc['textures'][texture]['source'] for texture in retained_textures}
    thumbnail = body.doc['extensions']['VRM']['meta'].get('texture', -1)
    if thumbnail >= 0:
        retained_images.add(body.doc['textures'][thumbnail]['source'])
    original_textures = {texture for material in material_indices for texture in material_texture_ids(body.doc, material)}
    original_images = {body.doc['textures'][texture]['source'] for texture in original_textures}
    duplicates = []
    for identifier, (_, cost) in models.items():
        if identifier == 'body':
            continue
        for image in cost['images']:
            source = [row['index'] for row in body_cost['images'] if row['sha256'] == image['sha256']]
            if source:
                duplicates.append({'equipmentId': identifier, 'bodyImageIndices': source,
                                   'referencesOutsideOriginalOutfit': bool(set(source) & retained_images), **image})
    sources = {index for row in duplicates for index in row['bodyImageIndices']}
    return {
        'schema': 'raw-male-default-outfit-resource-overlap-v1', 'buildId': build['shortId'],
        'sourceDigest': build['sourceDigest'], 'sourceCommit': closure['sourceCommit'],
        'recordSha256': source_record['recordSha256'], 'budgetVersion': budget['budgetVersion'],
        'closedResourceFilesRecheckedInDist': len(files), 'closureBytes': sum(row['bytes'] for row in files),
        'files': files,
        'models': {identifier: {key: cost[key] for key in ('metrics', 'images', 'textureObjects', 'sha256')}
                   for identifier, (_, cost) in models.items()},
        'originalOutfitGeometry': {
            'primitives': original,
            'triangles': sum(row['triangles'] for row in original),
            'declaredPrimitiveVertices': sum(row['positionAccessorVertices'] for row in original),
            'referencedVerticesSummedPerPrimitive': sum(row['referencedVertices'] for row in original),
            'indexElementPayloadBytes': sum(row['indexElementPayloadBytes'] for row in original),
            'positionAccessorsAlsoUsedByRetainedPrimitives': sorted({row['positionAccessor'] for row in original} & retained_positions),
        },
        'imageOverlap': {
            'duplicateEquipmentImages': duplicates,
            'duplicateEquipmentEncodedBytes': sum(row['encodedBytes'] for row in duplicates),
            'duplicateEquipmentImageFullMipEstimateBytes': sum(row['rgba8MipBytes'] for row in duplicates),
            'bodyImageIndicesUsedByOriginalOutfit': sorted(original_images),
            'bodyImageIndicesUsedExclusivelyByOriginalOutfit': sorted(original_images - retained_images),
            'duplicatedBodyImageIndicesUsedExclusivelyByOriginalOutfit': sorted(sources - retained_images),
        },
        'limits': [
            'File lengths are uncompressed source/dist bytes. Motion closure includes the on-demand greeting.',
            'Original garment primitives remain embedded in Base_Male.vrm. Fixed m1-equipment.js hides them after initial equipment commit.',
            'Included-image bytes and original index element payload are exact. Removing references alone would not remove buffer bytes.',
            'Full mip estimates assume independent texture objects and do not measure decoded browser surfaces or GPU allocation.',
            'The resource closure excludes entry HTML and bundles. It does not approve a game export.',
        ],
    }


if __name__ == '__main__':
    print(json.dumps(measure(), indent=2, sort_keys=True))
