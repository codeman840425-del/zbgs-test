"""Rebuild the publisher VRM0 three-piece outfit. --pants-only reproduces the first specimen."""
import argparse
import json
import re

import numpy as np

from asset_budget import AssetCost, ref
from flow import GLB, ROOT, Validator, require
from garment_source_mapping import json_bytes, select
from native_accessory_batch import load_script
from native_body_intake import active_scene
from native_import import confined, digest
from vrm0_garment_emitter import GarmentSource, emit


EVIDENCE = ROOT / 'evidence/m2-raw-male-equipment-v1'
OUTPUT = ROOT / 'output/m2-raw-male-equipment-v1'
PUBLIC = ROOT / 'prototype/public/assets/raw-male-equipment-v1'
RECIPE = EVIDENCE / 'pants.json'
REPORT = EVIDENCE / 'report.json'
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def source_context(model, selector, sha, provenance, limits):
    doc = model.doc
    owner = ref(doc['nodes'], selector['node'], 'garment owner')
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    require(selector['node'] in doc['scenes'][doc.get('scene', 0)]['nodes'] and selector['node'] not in parents,
            'Garment emitter requires a root mesh owner')
    require(owner.get('matrix', IDENTITY) == IDENTITY
            and owner.get('translation', [0, 0, 0]) == [0, 0, 0]
            and owner.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
            and owner.get('scale', [1, 1, 1]) == [1, 1, 1],
            'Garment mesh owner must be identity in source coordinates')
    skin = ref(doc['skins'], selector['skin'], 'garment skin')
    require(set(skin['joints']) <= active_scene(doc), 'Garment skin joints outside active scene')
    vrm = doc['extensions']['VRM']
    human = {row['node']: row['bone'] for row in vrm['humanoid']['humanBones']}
    return GarmentSource(doc, model.glb.binary, skin, np.asarray(model.accessor(skin['inverseBindMatrices']), dtype='<f4'),
                         parents, human, sha, provenance, limits)


def verify_primitive(model, primitive, context, part, selection):
    doc = model.doc
    attrs, triangles, material = part
    exported = {name: np.asarray(model.accessor(i)) for name, i in primitive['attributes'].items()}
    require(np.array_equal(np.asarray(model.accessor(primitive['indices'])).reshape(-1, 3), triangles),
            'Emitted triangle order differs')
    for name in ('POSITION', 'NORMAL', 'TEXCOORD_0'):
        require(np.array_equal(exported[name], attrs[name]), 'Emitted stream differs: ' + name)
    weights = attrs['WEIGHTS_0']
    expected = weights / weights.sum(axis=1, keepdims=True)
    require(np.array_equal(expected, exported['WEIGHTS_0']), 'Emitted normalized weights differ')
    require(not np.any((expected > 0) & (expected <= 1e-8)), 'Garment contains unsupported negligible nonzero weights')
    skin, = doc['skins']
    joint_names = np.array([doc['nodes'][n]['name'] for n in skin['joints']])
    original_names = np.array([context.document['nodes'][n]['name'] for n in context.skin['joints']])
    affected = expected > 0
    require(np.array_equal(original_names[attrs['JOINTS_0'][affected]], joint_names[exported['JOINTS_0'][affected]]),
            'Emitted joint remap changed weighted bone names')
    src = context.document
    src_material = src['materials'][material]
    new_material = doc['materials'][primitive['material']]
    base = new_material['pbrMetallicRoughness']['baseColorTexture']
    src_base = src_material['pbrMetallicRoughness']['baseColorTexture']
    tex = doc['textures'][base['index']]
    src_tex = src['textures'][src_base['index']]
    def sampler(document, t):
        return document['samplers'][t['sampler']] if 'sampler' in t else None
    require(sampler(src, src_tex) == sampler(doc, tex) and base.get('texCoord', 0) == src_base.get('texCoord', 0) == 0,
            'Emitted garment sampler or UV channel differs')
    require(all(src_material.get(k) == new_material.get(k) for k in ('alphaMode', 'alphaCutoff', 'doubleSided'))
            and new_material['extensions'] == {'KHR_materials_unlit': {}}, 'Emitted material or coverage policy differs')
    image = doc['images'][tex['source']]
    view = doc['bufferViews'][image['bufferView']]
    offset = view.get('byteOffset', 0)
    png = digest(model.binary[offset:offset + view['byteLength']])
    require(png == selection['materialMaps']['pbr.baseColorTexture']['sha256'], 'Emitted base map differs')
    return {'maxWeightNormalizationDelta': float(np.max(np.abs(weights - expected))), 'baseMapSha256': png,
            'baseMapSampler': sampler(doc, tex), 'uvSet': 0, 'rawSourceCoordinates': True}


def verify_output(raw, context, parts, entry, selections):
    model = GLB(raw)
    doc = model.doc
    require(doc['extras']['sourceSha256'] == entry['compatibleAvatarSha256'] == context.sha256,
            'Emitted GLB/fit body identity differs')
    mesh, = doc['meshes']
    rows = [verify_primitive(model, primitive, context, part, selection)
            for primitive, part, selection in zip(mesh['primitives'], parts, selections, strict=True)]
    binds = model.bind_by_name()
    expected_names = {name for selection in selections for name in selection['usedBoneInverseBindSha256']}
    require(set(binds) == expected_names, 'Emitted bind set differs')
    original_names = np.array([context.document['nodes'][n]['name'] for n in context.skin['joints']])
    declarations = {binding['targetRawBone']: binding for binding in entry['bindings']}
    for name, matrix in binds.items():
        idx, = np.flatnonzero(original_names == name)
        source_index = context.skin['joints'][idx]
        declaration = declarations[name]
        require(np.array_equal(matrix, context.inverse_binds[idx]) and list(matrix) == declaration['inverseBindMatrix']
                and declaration['sourceBone'] == name and declaration['humanoidSemantic'] == context.humanoid.get(source_index),
                'Emitted raw inverse bind or humanoid semantic differs: ' + name)
    # This exporter preserves source ancestors rather than baking a skeleton-axis conversion.
    src = context.document
    parents = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    source_named = {node['name']: i for i, node in enumerate(src['nodes'])}
    for i, node in enumerate(doc['nodes']):
        if 'mesh' in node:
            continue
        original = source_named[node['name']]
        require(all(node.get(k) == src['nodes'][original].get(k) for k in ('matrix', 'translation', 'rotation', 'scale')),
                'Emitted ancestor rest transform differs')
        source_parent = context.parents.get(original)
        require((None if i not in parents else doc['nodes'][parents[i]]['name']) ==
                (None if source_parent is None else src['nodes'][source_parent]['name']), 'Emitted ancestor hierarchy differs')
    return {'restHierarchyNodes': len(doc['nodes']) - 1, 'weightedBones': len(binds),
            **(rows[0] if len(rows) == 1 else {'primitives': rows})}


def read_source(recipe):
    reader = Validator()
    def read(entry):
        return reader.pin(entry['path'], entry['sha256'])
    mapping = json.loads(read(recipe['sourceMapping']))
    body_spec = json.loads(read(mapping['bodySpec']))
    receipt = json.loads(read(mapping['publisherReceipt']))
    read(mapping['sourceTerms'])
    source_sha = recipe['bodySha256']
    require(body_spec['sourceSha256'] == source_sha == receipt['vrmSHA256'] and source_sha != body_spec['roundtripSha256'],
            'Expected the pinned publisher source')
    model = AssetCost(confined(ROOT, body_spec['source']))
    require(digest(model.raw) == source_sha, 'Publisher body SHA mismatch')
    model.measure()
    return model, mapping, body_spec, receipt, reader.observed


def make_item(recipe, selectors, model, body_spec, receipt, source_receipts):
    source_sha = body_spec['sourceSha256']
    owner_keys = {(s['node'], s['mesh'], s['skin']) for s in selectors}
    require(len(owner_keys) == 1 and len({s['primitive'] for s in selectors}) == len(selectors),
            'One garment requires distinct primitives on the same verified owner and skin')
    parts, selections = zip(*(select(model, s) for s in selectors), strict=True)
    context = source_context(model, selectors[0], source_sha, receipt, recipe['limits'])
    identifier = recipe['id']
    require(re.fullmatch(r'[a-z0-9-]+', identifier) and recipe['slot'] in ('bottom', 'top', 'shoes'), 'Invalid garment ID or slot')
    raw, entry = emit(context, identifier, recipe['name'], recipe['slot'], parts, recipe['method'],
                      generator='gamemake source-mapped VRM0 garment v1', preserve_base_sampler=True)
    entry.update(fitId=identifier + '-fit', styleId=recipe['styleId'], version=1, restMatrix=IDENTITY)
    verified = verify_output(raw, context, parts, entry, selections)
    manifest = {'schema': 'zbgs-equipment-v1', 'items': [entry]}
    files = {entry['url']: raw, 'equipment.json': json_bytes(manifest)}
    report = {'schema': 'raw-vrm0-garment-cpu-readback-v1', 'id': identifier,
              'source': {'path': body_spec['source'], 'sha256': source_sha},
              'differentRoundtripSha256': body_spec['roundtripSha256'], 'selection': selections[0] if len(selections) == 1 else list(selections),
              'equipment': {'path': entry['url'], 'sha256': entry['sha256'], 'bytes': len(raw),
                            'fitId': entry['fitId'], 'bodySha256': entry['compatibleAvatarSha256'],
                            'manifestSha256': digest(files['equipment.json'])},
              'verified': verified, 'sourceReceipts': source_receipts, 'limits': recipe['limits'],
              'runtimeAdmission': False}
    return files, entry, report


def build(recipe):
    require(recipe['schema'] == 'raw-vrm0-pants-recipe-v1', 'Unknown pants recipe')
    model, mapping, body_spec, receipt, provenance = read_source(recipe)
    files, _, report = make_item(recipe, [mapping['selections']['source']], model, body_spec, receipt, provenance)
    return files, report


def build_outfit(recipe):
    require(recipe['schema'] == 'raw-vrm0-outfit-recipe-v1', 'Unknown outfit recipe')
    pin = recipe['pantsRecipe']
    raw = confined(ROOT, pin['path']).read_bytes()
    require(digest(raw) == pin['sha256'], 'Pants recipe changed')
    pants = json.loads(raw)
    model, mapping, body_spec, receipt, provenance = read_source(pants)
    items = [recipe['top'], dict(pants, selectors=[mapping['selections']['source']]), recipe['shoes']]
    require([r['slot'] for r in items] == ['top', 'bottom', 'shoes'] and len({r['id'] for r in items}) == 3,
            'Invalid three-piece outfit roles')
    files, entries, reports = {}, [], []
    for item in items:
        generated, entry, evidence = make_item(item, item['selectors'], model, body_spec, receipt, provenance)
        if item['slot'] == 'bottom':
            require(evidence == json.loads(REPORT.read_bytes()), 'Pants baseline changed')
        files[entry['url']] = generated[entry['url']]
        entries.append(entry)
        reports.append(evidence)
    files['equipment.json'] = json_bytes({'schema': 'zbgs-equipment-v1', 'items': entries})
    return files, {'schema': 'raw-vrm0-outfit-cpu-readback-v1', 'bodySha256': body_spec['sourceSha256'],
                   'equipmentManifestSha256': digest(files['equipment.json']), 'items': reports,
                   'runtimeAdmission': False}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true', help='compare with existing generated package files')
    mode = cli.add_mutually_exclusive_group()
    mode.add_argument('--pants-only', action='store_true', help='reproduce the original one-item package')
    mode.add_argument('--stage-runtime', action='store_true', help='stage the fixed source VRM and complete outfit for the game')
    args = cli.parse_args()
    if args.pants_only:
        files, report = build(json.loads(RECIPE.read_bytes()))
        expected, out = REPORT, OUTPUT / 'pants-only'
    else:
        files, report = build_outfit(json.loads((EVIDENCE / 'outfit.json').read_bytes()))
        expected, out = EVIDENCE / 'outfit-report.json', OUTPUT
    require(json.loads(expected.read_bytes()) == report, 'Pinned garment CPU report differs')
    if args.stage_runtime:
        source, = {row['source']['path'] for row in report['items']}
        body = confined(ROOT, source).read_bytes()
        require(digest(body) == report['bodySha256'], 'Body changed before runtime staging')
        files = {**files, 'Base_Male.vrm': body}
        out = PUBLIC
        for name in files:
            target = out / name
            require(confined(ROOT, target.relative_to(ROOT).as_posix()) == target,
                    'Runtime staging path was redirected: ' + name)
    writer = load_script('safe_equipment_output', 'scripts/native-vroid-equipment-extract.py')
    writer.write_outputs(files, confined(ROOT, out.relative_to(ROOT).as_posix()), check=args.check)
    print(json.dumps({'output': out.relative_to(ROOT).as_posix(), 'files': {k: digest(v) for k, v in files.items()}}))


if __name__ == '__main__':
    main()
