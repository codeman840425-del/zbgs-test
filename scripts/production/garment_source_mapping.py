"""Read pinned VRM0 garment selections, then rebuild the selected M1B equipment contract.

Run this script to verify the source mapping and the saved report. --export writes the
verified independent GLB and equipment manifest under output/m2-garment-source-map-v1.
"""
import argparse
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import numpy as np

from asset_budget import AssetCost, COMPONENTS, ref
from flow import ROOT, GLB, Validator, require
from native_accessory_batch import load_script
from native_import import confined, digest


EVIDENCE = ROOT / 'evidence/m2-garment-source-map-v1'
OUTPUT = ROOT / 'output/m2-garment-source-map-v1'
RECIPE = EVIDENCE / 'pants.json'
REPORT = EVIDENCE / 'report.json'


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def select(source, selector):
    """Select a primitive at its explicit owner, irrespective of mesh/material names."""
    doc = source.doc
    node = ref(doc['nodes'], selector['node'], 'garment node')
    require(node.get('mesh') == selector['mesh'] and node.get('skin') == selector['skin'],
            'Garment node does not own the selected mesh and skin')
    mesh = ref(doc['meshes'], selector['mesh'], 'garment mesh')
    skin = ref(doc['skins'], selector['skin'], 'garment skin')
    p = ref(mesh['primitives'], selector['primitive'], 'garment primitive')
    require(p.get('material') == selector['material'], 'Garment primitive material differs from the pinned selection')
    require(p.get('mode', 4) == 4 and not p.get('targets'), 'Expected an indexed garment triangle primitive without morphs')
    require(set(p['attributes']) == {'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'},
            'Unreviewed garment vertex stream')
    indices = np.asarray(source.accessor(p['indices']), dtype=np.uint32).reshape(-1, 3)
    used, mapping = np.unique(indices, return_inverse=True)
    attributes = {}
    for name, index in p['attributes'].items():
        entry = ref(doc['accessors'], index, name)
        dtype = np.dtype('<' + COMPONENTS[entry['componentType']][0])
        attributes[name] = np.asarray(source.accessor(index), dtype=dtype)[used]
    weights, joints = attributes['WEIGHTS_0'], attributes['JOINTS_0']
    require(weights.dtype == np.float32 and np.all(np.abs(weights.sum(axis=1) - 1) < 1e-5) and
            np.all(weights >= 0) and np.all(joints < len(skin['joints'])), 'Invalid garment weights or joint indices')
    binds = np.asarray(source.accessor(skin['inverseBindMatrices']), dtype='<f4')
    require(binds.shape == (len(skin['joints']), 16), 'Garment skin bind count differs')
    used_joints = np.unique(joints[weights > 1e-8])
    names = [doc['nodes'][n]['name'] for n in skin['joints']]
    require(len(set(names)) == len(names), 'Ambiguous raw joint names')
    material = ref(doc['materials'], p['material'], 'garment material')
    legacy = doc['extensions']['VRM']['materialProperties'][p['material']]
    require(legacy['name'] == material['name'], 'VRM0 material properties target another material')
    texture_slots = {f'VRM0.{key}': val for key,val in legacy.get('textureProperties', {}).items() if val != -1}
    for name, definition in [('material', material), ('pbr', material.get('pbrMetallicRoughness', {}))]:
        for key, val in definition.items():
            if key.endswith('Texture') and isinstance(val, dict):
                texture_slots[name + '.' + key] = val['index']
    maps = {}
    for name, tex_index in sorted(texture_slots.items()):
        texture = ref(doc['textures'], tex_index, name)
        image = ref(doc['images'], texture['source'], name + ' image')
        view = ref(doc['bufferViews'], image['bufferView'], name + ' view')
        start, size = view.get('byteOffset', 0), view['byteLength']
        maps[name] = {'texture': tex_index, 'image': texture['source'],
                      'sha256': digest(source.glb.binary[start:start+size])}
    triangles = mapping.reshape(indices.shape).astype(np.uint32)
    stats = {'selector': selector, 'nodeName': node.get('name'), 'meshName': mesh.get('name'),
             'materialName': material['name'], 'materialShader': legacy.get('shader'),
             'triangles': len(indices), 'referencedVertices': len(used),
             'multiBoneVertices': int(np.count_nonzero(np.count_nonzero(weights > .001, axis=1) > 1)),
             'sourceIndicesSha256': digest(indices.astype('<u4').tobytes()),
             'compactIndicesSha256': digest(triangles.astype('<u4').tobytes()),
             'compactStreamSha256': {k: digest(a.tobytes()) for k,a in sorted(attributes.items())},
             'usedBoneInverseBindSha256': {names[j]: digest(binds[j].tobytes()) for j in used_joints},
             'materialMaps': maps}
    return (attributes, triangles, p['material']), stats


def build(recipe):
    require(recipe['schema'] == 'm2-garment-source-map-v1', 'Unknown garment map')
    reader = Validator()
    def read(entry):
        return reader.pin(entry['path'], entry['sha256'])
    spec = json.loads(read(recipe['bodySpec']))
    export = json.loads(read(recipe['roundtripReceipt']))
    require(spec['sourceSha256'] == export['sourceVRMSha256'] and spec['roundtripSha256'] == export['roundtripSha256']
            and spec['editableSourceSha256'] == export['editableSourceSha256'] and export['exportedFromSavedBlend'],
            'Body roundtrip provenance mismatch')
    reader.pin(spec['editableSource'], spec['editableSourceSha256'])
    catalog = json.loads(read(recipe['equipmentCatalog']))
    origin = json.loads(read(recipe['publisherReceipt']))
    read(recipe['sourceTerms'])
    entry = reader.item(catalog, recipe['equipmentId'])
    require(origin['vrmSHA256'] == spec['sourceSha256'] and entry['sourceLicense'] == origin,
            'Published source or equipment provenance differs')
    require(entry['compatibleAvatarSha256'] == spec['roundtripSha256'], 'Current equipment body differs')
    item_path = (Path(recipe['equipmentCatalog']['path']).parent / entry['url']).as_posix()
    original = reader.pin(item_path, entry['sha256'], entry['bytes'])
    require(re.fullmatch(r'[a-z0-9-]+', entry['id']) and entry['url'] == entry['id'] + '.glb',
            'Expected a single local equipment filename')
    records = {}
    for key in ('source', 'roundtrip'):
        sha = spec[key + 'Sha256']
        body = AssetCost(confined(ROOT, spec[key]))
        require(digest(body.raw) == sha, 'Garment source identity mismatch: ' + key)
        body.measure()  # Validate topology, skin, accessors and embedded texture indices before selection.
        part, stats = select(body, recipe['selections'][key])
        records[key] = {'path': spec[key], 'sha256': sha, **stats}
        if key == 'roundtrip':
            roundtrip, garment_part = body, part
    # The preserved M1B exporter is bound to this exact roundtrip, skin and material table.
    # Its original primitive-name search is intentionally bypassed: pass only our mapped arrays.
    builder = load_script('mapped_m1b_builder', 'scripts/m1b-assets/build.py')
    require(builder.SPEC['roundtripSha256'] == spec['roundtripSha256'] and
            builder.skin == roundtrip.doc['skins'][recipe['selections']['roundtrip']['skin']],
            'Preserved emitter does not support this body and skin')
    scratch_root = confined(ROOT, 'output')
    scratch_root.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=scratch_root) as scratch:
        builder.OUT = Path(scratch)
        actual = builder.export(entry['id'], entry['name'], entry['slot'], [garment_part], entry['method'])
        glb = (builder.OUT / actual['url']).read_bytes()
    require(actual == entry and glb == original, 'Mapped export differs from the reference equipment bytes or bindings')
    bound = reader.equipment(entry, spec['roundtripSha256'], GLB(roundtrip.raw), recipe['equipmentCatalog']['path'])
    manifest = {'schema': catalog['schema'], 'items': [actual]}
    before, after = records['source'], records['roundtrip']
    binds_a, binds_b = before['usedBoneInverseBindSha256'], after['usedBoneInverseBindSha256']
    check = {'schema': 'm2-garment-source-map-report-v1', 'item': entry['id'], 'sources': records,
             'origin': {'publisher': origin['publisher'], 'sourcePage': origin['publisherPage'], 'limits': origin['limits']},
             'selectionComparison': {'equalReferencedBoneNames': set(binds_a) == set(binds_b),
                                     'changedInverseBinds': sorted(k for k in set(binds_a) & set(binds_b) if binds_a[k] != binds_b[k]),
                                     'equalBaseColorImageBytes': before['materialMaps']['pbr.baseColorTexture']['sha256'] ==
                                         after['materialMaps']['pbr.baseColorTexture']['sha256']},
             'roundtripOutput': {'url': entry['url'], 'sha256': digest(glb), 'bytes': len(glb),
                                 'bodySha256': entry['compatibleAvatarSha256'], 'bindingsVerified': bound,
                                 'referenceByteEqual': True, 'referenceItemEqual': True},
             'originalOutput': {'status': 'source-selection-only',
                                'reason': 'The M1B emitter and retained equipment fit bind to the saved Blender roundtrip. The publisher VRM has its own skin, material table and SHA; no exact equipment fit for it was supplied.'},
             'materialPolicy': 'Existing M1B unlit conversion retains the source base-color image. Source normal/emissive and VRM0 shader inputs are inventoried but are not in the historical garment output.',
             'runtimeAdmission': False, 'inputs': reader.observed}
    return {entry['url']: glb, 'equipment.json': json_bytes(manifest)}, check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--recipe', default=RECIPE.relative_to(ROOT).as_posix())
    args = parser.parse_args()
    files, result = build(json.loads(confined(ROOT, args.recipe).read_bytes()))
    require(result == json.loads(REPORT.read_bytes()), 'Source mapping report differs')
    if args.export:
        writer = load_script('equipment_writer', 'scripts/native-vroid-equipment-extract.py')
        writer.write_outputs(files, confined(ROOT, OUTPUT.relative_to(ROOT).as_posix()))
    print(json.dumps(result['roundtripOutput'], ensure_ascii=True))


if __name__ == '__main__':
    main()
