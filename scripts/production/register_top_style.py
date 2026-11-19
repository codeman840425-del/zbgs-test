"""Import a source-authored top for the standard male torso as a technical candidate."""
import json
import os
from pathlib import Path
import re
from tempfile import TemporaryDirectory

from flow import GLB, ROOT, Validator, local, require
from native_import import digest, exact_directory
from production_paths import catalog_lock, main_checkout, project_output, publish_new_directory
from variant_matrix import validate_matrix_files


MATRIX_NAME = 'assets-source/variant-matrix-v1/representative-matrix.json'
BASE_MANIFEST = '/assets/m1b/equipment.json'
BASE_BODY = '/assets/foundation/base-male-roundtrip.vrm'
BASE_SHA = '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
BASE_IDS = {'top': 'm1b-uniform-top', 'pants': 'm1b-uniform-pants', 'shoes': 'm1b-uniform-shoes'}
ID = re.compile(r'[a-z][a-z0-9-]{1,76}')


def encoded(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()


def checked(path):
    result = project_output(path, __file__)
    require('..' not in path.parts and result == Path(os.path.abspath(path)), 'Redirected registration path')
    return result


def authored_top(recipe_name, target):
    source = Validator(ROOT)
    recipe_file = local(ROOT, recipe_name)
    raw = recipe_file.read_bytes()
    recipe = json.loads(raw)
    ident = recipe['id']
    require(isinstance(ident, str) and ID.fullmatch(ident) and recipe.get('slot') == 'top'
            and type(recipe.get('version')) is int and recipe['version'] > 0
            and isinstance(recipe.get('name'), str) and recipe['name'].strip(), 'Invalid authored top identity')
    require(recipe_file == ROOT / 'assets-source' / ident / 'recipe.json', 'Expected assets-source/<id>/recipe.json')
    recipe_name = recipe_file.relative_to(ROOT).as_posix()
    recipe_dir = recipe_file.parent.relative_to(ROOT).as_posix()
    receipt = source.json(recipe_dir + '/receipt.json')
    require(receipt['id'] == ident and receipt['slot'] == 'top' and receipt['parentBodySha256'] == BASE_SHA,
            'Authored top receipt belongs to another garment or body')
    filename = ident + '.glb'
    data = source.pin(recipe_dir + '/' + filename, receipt['sha256'], receipt['bytes'])
    base = Validator(target)
    body_path = base.url(BASE_BODY)
    body = GLB(base.pin(body_path, BASE_SHA))
    require(recipe['parentBody'] == [body_path, BASE_SHA], 'Wrong authored torso reference')
    manifest_path = base.url(BASE_MANIFEST)
    manifest_bytes = local(target, manifest_path).read_bytes()
    base_sha = digest(manifest_bytes)
    require(recipe['sourceFit'] == [manifest_path, base_sha], 'Source or target base manifest changed')
    source.pin(*recipe['sourceFit'])
    catalog = json.loads(manifest_bytes)
    require(catalog['schema'] == 'zbgs-equipment-v1', 'Unexpected source catalog')
    source_top = base.item(catalog, BASE_IDS['top'])
    donor = (Path(manifest_path).parent / source_top['url']).as_posix()
    require(recipe['sourceGarment'] == [donor, source_top['sha256']], 'Source shirt differs from the target donor')
    source.pin(*recipe['sourceGarment'], source_top['bytes'])
    require(recipe['sourceReceipt'][0] == 'assets-source/foundation-male/source.json'
            and recipe['sourceTerms'][0] == 'assets-source/foundation-male/LICENSE.md'
            and json.loads(source.pin(*recipe['sourceReceipt'])) == source_top['sourceLicense'], 'Source provenance differs')
    source.pin(*recipe['sourceTerms'])
    for ref in receipt['inputPins']:
        source.pin(ref['path'], ref['sha256'], ref['bytes'])
    for slot, role in [('top','top'), ('bottom','pants'), ('shoes','shoes')]:
        item = base.item(catalog, BASE_IDS[role])
        require(item['slot'] == slot and item['compatibleAvatarSha256'] == BASE_SHA, 'Wrong base outfit member')
        base.pin((Path(manifest_path).parent / item['url']).as_posix(), item['sha256'], item['bytes'])
    require(ident not in {item['id'] for item in catalog['items']} and digest(data) != source_top['sha256'],
            'New garment collides with the base catalog or duplicates the donor')
    new_model = GLB(data)
    extras = new_model.doc.get('extras', {})
    require(extras.get('garmentId') == ident and extras.get('parentGarmentSha256') == source_top['sha256']
            and extras.get('sourceProvenance') == source_top['sourceLicense'], 'GLB garment identity or source differs')
    require(len(new_model.doc.get('buffers', [])) == 1 and 'uri' not in new_model.doc['buffers'][0]
            and all('bufferView' in im and 'uri' not in im for im in new_model.doc.get('images', [])),
            'Expected a self-contained garment GLB')
    # This mechanism retains the shirt block's raw joints. Validate its actual
    # weighted vertices against the target body, before exposing any output.
    entry = {key: source_top[key] for key in ('slot', 'compatibleAvatarSha256', 'preserveOriginalBody',
                                              'requiresRawSkeleton', 'bindings', 'sourceLicense')}
    entry.update(id=ident, styleId=ident, fitId=ident+'-fit', version=recipe['version'], name=recipe['name'],
                 bytes=len(data), sha256=digest(data), url=filename, sourceSpec=recipe_name)
    stats = source.equipment(entry, BASE_SHA, body, recipe_name)
    require(stats['weightedVertices'] > 0 and stats['bones'] > 0, 'Empty garment skin')
    asset_url = '/assets/' + ident
    entry['url'] = asset_url + '/top.glb'
    manifest = encoded({'schema': 'zbgs-equipment-v1', 'items': [entry]})
    manifest_url = asset_url + '/equipment.json'
    sha = digest(manifest)
    member = manifest_url + '#' + ident
    registration = {'baseManifestUrl': BASE_MANIFEST, 'baseManifestSha256': base_sha,
                    'sourceTopId': BASE_IDS['top'], 'pantsId': BASE_IDS['pants'], 'shoesId': BASE_IDS['shoes'],
                    'manifest': {'url': manifest_url, 'sha256': sha}, 'topId': ident,
                    'role': 'pants-' + ident, 'label': recipe['name'] + '、长裤和平底鞋'}
    row = {'bodyType': 'male', 'bodySha256': BASE_SHA, 'bodyAsset': BASE_BODY,
           'recipeSource': recipe_name, 'recipeSha256': digest(raw), 'variantVersion': 'v'+str(recipe['version']),
           'resourceManifest': member, 'resourceManifestSha256': sha,
           'fitManifest': member+'.bindings', 'fitManifestSha256': sha,
           'coverageManifest': member+'.preserveOriginalBody', 'coverageManifestSha256': sha,
           'status': 'candidate', 'outfitRegistration': registration,
           'limits': ['Standard male torso and original pants and flat shoes. Technical candidate.']}
    require(local(target, recipe_name).read_bytes() == raw, 'Target checkout lacks the exact authoring recipe')
    return {'styleId': ident, 'label': recipe['name'], 'variants': [row]}, {'equipment.json': manifest, 'top.glb': data}, stats


def import_top(recipe, *, install=False, target_root=None):
    from register_equipment_style import register
    root = ROOT if target_root is None else Path(os.path.abspath(ROOT / target_root))
    if target_root is not None:
        require('..' not in Path(target_root).parts, 'Traversal in registration root')
    catalog = checked(root / MATRIX_NAME)
    style, files, stats = authored_top(recipe, root)
    ident = style['styleId']
    destination = checked(root / 'prototype/public/assets' / ident)
    for name in files:
        checked(destination / name)
    lock = checked(main_checkout(__file__) / 'output/equipment-style-locks' /
                   (digest(os.path.normcase(str(catalog)).encode()) + '.lock'))

    def assemble(previous):
        matrix = json.loads(previous)
        require(not (errors := validate_matrix_files(matrix, root)), '; '.join(errors))
        existing = [r['outfitRegistration'] for s in matrix['styles'] for r in s['variants']
                    if r['bodyType'] == 'male' and 'outfitRegistration' in r]
        matches = [r for r in existing if r['topId'] == ident]
        require(len(matches) < 2, 'Conflicting top registration')
        # The seven legacy M1B looks reserve indices 0 through 7.
        style['variants'][0]['outfitRegistration']['index'] = (
            matches[0]['index'] if matches else max([7, *(r['index'] for r in existing)]) + 1)
        return register(matrix, style), matrix

    if install:
        with catalog_lock(lock, checked):
            previous = catalog.read_bytes()
            updated, matrix = assemble(previous)
            if destination.exists():
                exact_directory(destination, files)
            if updated != matrix or not destination.exists():
                with TemporaryDirectory(dir=checked(destination.parent), prefix='.top-install-') as scratch:
                    stage = checked(Path(scratch) / 'package')
                    stage.mkdir()
                    for name, data in files.items():
                        checked(stage / name).write_bytes(data)
                    exact_directory(stage, files)
                    staged_matrix = checked(Path(scratch) / 'matrix.json')
                    staged_matrix.write_bytes(encoded(updated))
                    require(catalog.read_bytes() == previous, 'Catalog changed during registration')
                    if not destination.exists():
                        publish_new_directory(stage, checked(destination))
                    # If publication fails here, a retry rechecks the complete
                    # immutable package before making its catalog row visible.
                    require(not (errors := validate_matrix_files(updated, root)), '; '.join(errors))
                    require(catalog.read_bytes() == previous, 'Catalog changed during registration')
                    if updated != matrix:
                        os.replace(staged_matrix, checked(catalog))
    else:
        updated, matrix = assemble(catalog.read_bytes())
        require(updated == matrix, 'Top is not registered; use --install')
        exact_directory(destination, files)
    return {'styleId': ident, 'status': 'candidate', 'bodyType': 'male', 'bodySha256': BASE_SHA,
            'topSha256': digest(files['top.glb']), 'manifestSha256': digest(files['equipment.json']),
            'outfit': style['variants'][0]['outfitRegistration'], 'skin': stats}
