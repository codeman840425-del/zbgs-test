"""Produce SHA-pinned, half-size opaque base color candidates from existing standalone garments."""

import argparse
import copy
import io
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from asset_budget import budget_config, check, ref
from flow import ROOT, require
from garment_source_mapping import json_bytes
from native_accessory_batch import load_script
from native_import import digest, embedded_glb
from native_mesh_budget import encode
from stripped_outfit_body import check_checkout, input_path, physical, pinned, view_data

ASSETS = ROOT / 'assets-source/garment-basecolor-release-v1'
RECIPE = ASSETS / 'recipe.json'
REPORT = ROOT / 'evidence/m2-garment-basecolor-release-v1/report.json'
OPERATION = 'opaque-srgb-basecolor-2x2-linear-mean-png-v1'


def image_view(doc, selector):
    s = selector
    require(
        doc['asset']['version'] == '2.0'
        and doc['extensionsUsed'] == ['KHR_materials_unlit']
        and not doc.get('extensions')
        and not doc.get('extensionsRequired'),
        'Unsupported garment extensions',
    )
    node = ref(doc['nodes'], s['node'], 'node')
    ref(doc['skins'], s['skin'], 'skin')
    mesh = ref(doc['meshes'], s['mesh'], 'mesh')
    prim = ref(mesh['primitives'], s['primitive'], 'primitive')
    material = ref(doc['materials'], s['material'], 'material')
    texture = ref(doc['textures'], s['texture'], 'texture')
    image = ref(doc['images'], s['image'], 'image')
    ref(doc['bufferViews'], s['bufferView'], 'image view')
    require(
        node.get('skin') == s['skin']
        and node.get('mesh') == s['mesh']
        and prim['material'] == s['material']
        and 'TEXCOORD_0' in prim['attributes']
        and sum(n.get('mesh') == s['mesh'] for n in doc['nodes']) == 1
        and sum(p.get('material') == s['material'] for m in doc['meshes'] for p in m['primitives']) == 1,
        'Selected material does not have the exact skinned primitive owner',
    )
    require(
        material['name'] == s['materialName']
        and material.get('alphaMode', 'OPAQUE') in ('MASK', 'OPAQUE')
        and material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1] * 4)[3] == 1,
        'Unexpected selected material or opacity',
    )
    for m in doc['materials']:
        require(
            m.get('extensions') == {'KHR_materials_unlit': {}}
            and set(m)
            <= {'name', 'extensions', 'alphaMode', 'alphaCutoff', 'pbrMetallicRoughness', 'doubleSided'}
            and set(m['pbrMetallicRoughness'])
            <= {'baseColorFactor', 'baseColorTexture', 'roughnessFactor', 'metallicFactor'},
            'Only isolated unlit base color textures are supported',
        )
        slot = m['pbrMetallicRoughness']['baseColorTexture']
        require(
            set(slot) <= {'index', 'texCoord'} and slot.get('texCoord', 0) == 0,
            'Expected plain UV0 base color',
        )
        ref(doc['textures'], slot['index'], 'material texture')
    slots = [m['pbrMetallicRoughness']['baseColorTexture']['index'] for m in doc['materials']]
    require(
        slots[s['material']] == s['texture'] and slots.count(s['texture']) == 1,
        'Selected base color has another or different material reference',
    )
    if s['sampler'] is not None:
        ref(doc.get('samplers', []), s['sampler'], 'sampler')
    require(
        all(set(t) <= {'sampler', 'source'} for t in doc['textures'])
        and texture.get('sampler') == s['sampler']
        and texture['source'] == s['image']
        and sum(t['source'] == s['image'] for t in doc['textures']) == 1,
        'Selected texture source or sampler differs or is shared',
    )
    require(
        all(set(im) <= {'name', 'bufferView', 'mimeType'} for im in doc['images'])
        and image['mimeType'] == 'image/png'
        and image['bufferView'] == s['bufferView']
        and sum(im['bufferView'] == s['bufferView'] for im in doc['images']) == 1
        and all(a.get('bufferView') != s['bufferView'] and 'sparse' not in a for a in doc['accessors']),
        'Expected an exclusively owned embedded PNG view',
    )
    return s['bufferView']


def half_png(payload):
    with Image.open(io.BytesIO(payload)) as im:
        require(
            im.format == 'PNG' and im.mode in ('RGB', 'RGBA') and not im.is_animated and not im.info,
            'Expected plain RGB or RGBA PNG without color profile overrides',
        )
        require(im.size == (2048, 2048), 'Expected a 2048 by 2048 source image')
        a = np.asarray(im.convert('RGBA'))
    require(np.all(a[..., 3] == 255), 'Base color is not entirely opaque')
    x = np.arange(256, dtype=np.float64) / 255
    linear = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    avg = linear[a[..., :3]].reshape(1024, 2, 1024, 2, 3).mean(axis=(1, 3))
    color = np.rint(255 * np.where(avg <= 0.0031308, 12.92 * avg, 1.055 * avg ** (1 / 2.4) - 0.055)).astype(
        'uint8'
    )
    output = io.BytesIO()
    Image.fromarray(color).save(output, format='PNG', compress_level=6)
    return output.getvalue()


def readback(source, candidate, slot, png, lineage):
    old, before = embedded_glb(source)
    new, after = embedded_glb(candidate)
    expected = copy.deepcopy(old)
    expected['extras']['garmentBasecolorRelease'] = lineage
    views = expected['bufferViews']
    start = views[slot]['byteOffset']
    before_end = (start + views[slot]['byteLength'] + 3) & ~3
    after_end = (start + len(png) + 3) & ~3
    require(
        after[:start] == before[:start]
        and after[after_end:] == before[before_end:]
        and after[start + len(png) : after_end] == bytes(-len(png) % 4),
        'Bytes outside the selected image changed',
    )
    shift = after_end - before_end
    expected['buffers'][0]['byteLength'] += shift
    for i, view in enumerate(views):
        payload = png if i == slot else view_data(old, before, i)
        require(view_data(new, after, i) == payload, f'Published bufferView {i} differs')
        if view.get('byteOffset', 0) >= before_end:
            view['byteOffset'] += shift
    views[slot]['byteLength'] = len(png)
    require(expected == new, 'Published geometry, binding, material or source identity changed')
    return {
        'comparedViews': len(views),
        'comparedAccessors': len(old['accessors']),
        'skinJointCounts': [len(s['joints']) for s in old['skins']],
        'unchangedImages': [
            {'index': i, 'sha256': digest(view_data(old, before, im['bufferView']))}
            for i, im in enumerate(old['images'])
            if im['bufferView'] != slot
        ],
    }


def derive(raw, item, license_data):
    require(digest(raw) == item['sourceSha256'], 'Source garment SHA differs')
    doc, binary = embedded_glb(raw)
    require(
        doc['extras']['sourceSha256'] == item['bodySha256']
        and doc['extras']['sourceProvenance'] == license_data
        and license_data
        and 'garmentBasecolorRelease' not in doc['extras'],
        'Source provenance or authoring body differs',
    )
    slot = image_view(doc, item['selector'])
    original = view_data(doc, binary, slot)
    require(digest(original) == item['sourcePngSha256'], 'Selected PNG SHA differs')
    png = half_png(original)
    require(digest(png) == item['targetPngSha256'], 'Derived PNG SHA differs')
    lineage = {
        key: item[key]
        for key in (
            'id',
            'sourceEquipmentId',
            'sourceSha256',
            'bodySha256',
            'sourcePngSha256',
            'targetPngSha256',
            'selector',
        )
    }
    lineage.update(operation=OPERATION, status='cpu-candidate')
    doc['extras']['garmentBasecolorRelease'] = lineage
    require(doc['buffers'] == [{'byteLength': len(binary)}], 'Expected one embedded buffer')
    # Retain all existing view payloads, order and aligned padding outside the selected PNG block.
    old_offset = doc['bufferViews'][slot].get('byteOffset', 0)
    end = old_offset + len(original)
    padded_end = (end + 3) & ~3
    require(
        old_offset % 4 == 0 and binary[end:padded_end] == bytes(padded_end - end), 'Unexpected image padding'
    )
    replacement = png + bytes(-len(png) % 4)
    blob = binary[:old_offset] + replacement + binary[padded_end:]
    shift = len(blob) - len(binary)
    for i, view in enumerate(doc['bufferViews']):
        start = view.get('byteOffset', 0)
        if i == slot:
            view['byteLength'] = len(png)
        elif start >= padded_end:
            view['byteOffset'] = start + shift
        else:
            require(start + view['byteLength'] <= old_offset, 'Selected image overlaps another view')
    doc['buffers'][0]['byteLength'] = len(blob)
    result = encode(doc, blob)
    return result, readback(raw, result, slot, png, lineage)


def budget(path, config):
    row = check(path, 'garment', config)
    row['metrics'] = dict(sorted(row['metrics'].items()))
    row['violations'] = sorted(row['violations'], key=lambda v: v['metric'])
    return {k: row[k] for k in ('sha256', 'budgetVersion', 'budgetSha256', 'status', 'violations', 'metrics')}


def build(check_only):
    check_checkout()
    recipe_bytes = physical(RECIPE).read_bytes()
    recipe = json.loads(recipe_bytes)
    physical(REPORT)
    require(
        recipe['schema'] == 'garment-basecolor-release-v1' and recipe['operation'] == OPERATION,
        'Unsupported garment release recipe',
    )
    config = budget_config(input_path('scripts/production/asset-budgets-v1.json'), 'm2-technical-v1')
    outputs = {}
    rows = []
    for item in recipe['items']:
        require(
            re.fullmatch('[a-z0-9-]+', item['id']) and item['id'] != item['sourceEquipmentId'],
            'Invalid candidate ID',
        )
        target = physical(ASSETS / (item['id'] + '.glb'))
        require(target not in outputs, 'Duplicate candidate ID')
        catalog = json.loads(pinned(item['catalog']))
        matches = [x for x in catalog['items'] if x['id'] == item['sourceEquipmentId']]
        require(
            catalog['schema'] == 'zbgs-equipment-v1' and len(matches) == 1,
            'Missing or ambiguous source equipment',
        )
        entry = matches[0]
        require(
            entry['slot'] == 'top'
            and entry['sha256'] == item['sourceSha256']
            and entry['compatibleAvatarSha256'] == item['bodySha256']
            and entry['url'] == entry['id'] + '.glb'
            and Path(entry['url']).name == entry['url'],
            'Source garment catalog mismatch',
        )
        source = input_path((Path(item['catalog']['path']).parent / entry['url']).as_posix())
        raw = source.read_bytes()
        require(len(raw) == entry['bytes'], 'Source garment size differs')
        result, proof = derive(raw, item, entry['sourceLicense'])
        with TemporaryDirectory(dir=physical(ASSETS)) as temp:
            scratch = physical(Path(temp) / target.name)
            scratch.write_bytes(result)
            costs = {'source': budget(source, config), 'candidate': budget(scratch, config)}
        require(
            costs['source']['sha256'] == digest(raw) and costs['candidate']['sha256'] == digest(result),
            'Budget inputs differ from verified garments',
        )
        outputs[target] = result
        rows.append(
            {
                **item,
                'path': target.relative_to(ROOT).as_posix(),
                'sha256': digest(result),
                'bytes': len(result),
                'sourcePath': source.relative_to(ROOT).as_posix(),
                'sourceLicense': entry['sourceLicense'],
                'readback': proof,
                'budget': costs,
            }
        )
    require(bool(rows), 'Recipe has no garments')
    report = {
        'schema': 'garment-basecolor-release-results-v1',
        'status': 'cpu-candidate',
        'recipeSha256': digest(recipe_bytes),
        'operation': OPERATION,
        'items': rows,
        'runtimeAdmission': False,
        'ordinaryPCPerformance': 'unmeasured',
    }
    outputs[physical(REPORT)] = json_bytes(report)
    writer = load_script('garment_basecolor_output', 'scripts/native-vroid-equipment-extract.py')
    for path, data in outputs.items():
        if physical(path).exists() or check_only:
            writer.write_outputs({path.name: data}, path.parent, check=True)
    if not check_only:
        for path, data in outputs.items():
            writer.write_outputs({path.name: data}, physical(path).parent)
    return {row['id']: row['sha256'] for row in rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    print(json.dumps(build(parser.parse_args().check)))
