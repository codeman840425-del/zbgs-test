"""Audit the exact image payloads and bindings of the fixed 7586 pair."""

import argparse
from collections import defaultdict
import io
import json
from pathlib import Path
import re
import struct
import subprocess

from PIL import Image, ImageChops, __version__ as pillow_version

from asset_budget import AssetCost, ref
from native_import import ROOT, confined, digest


EVIDENCE = ROOT / 'evidence/m2-native-short-socks-room-v1'
REPORT = ROOT / 'evidence/m2-native-body-cost-v1/textures/report.json'
DEFAULT_ASSETS = ROOT / 'experiments/m2-native-sock-cfca0dd1/dist'
SOURCE_COMMIT = 'cfca0dd13af69418dc063d6715c43523184195f9'
BUILD_ID = 'fe2e58489bbb'
BODY_SHA = '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
RECORDS_SHA = 'eeb4df1a8fc6ec1de7bac7c394f5028afb90d96e2b491e48a12b832b249e4ebe'
INVENTORY_SHA = 'a8278dabdf7a2e7c58b2011f6d6d3425b5a096cfb71666fcc004c2fac1eaa9f9'
BUDGET_REPORT_SHA = '9a8d2eaff665059cef568c4305c3923cf6a142c1c1c40525f2460ddb33636a4a'
RECORD_IDS = ('native-male-7586-v1-record-a', 'native-crew-7586')
SOURCE_CLOTHES = re.compile(r'_(Tops|Bottoms|Shoes)_|_Accessory_Tie_')
COLOR_SLOTS = {'baseColorTexture', 'emissiveTexture', 'shadeMultiplyTexture',
               'matcapTexture', 'rimMultiplyTexture'}
DATA_SLOTS = {'normalTexture', 'occlusionTexture', 'metallicRoughnessTexture',
              'shadingShiftTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture'}


def checked_bytes(path, sha256, size=None):
    raw = path.read_bytes()
    if digest(raw) != sha256 or (size is not None and len(raw) != size):
        raise ValueError(f'Pinned input mismatch: {path}')
    return raw


def indexed_input(assets, inventory, rel):
    row = inventory[rel]
    path = confined(assets, rel)
    return path, checked_bytes(path, row['sha256'], row['bytes'])


def pixels(raw):
    with Image.open(io.BytesIO(raw)) as image:
        if image.format != 'PNG' or image.mode not in ('RGB', 'RGBA') or image.is_animated:
            raise ValueError('Expected an 8-bit RGB/RGBA PNG in the fixed package')
        if raw[24] != 8:
            raise ValueError('Expected an 8-bit PNG')
        rgba = image.convert('RGBA')
        extrema = rgba.getextrema()
        facts = {
            'encodedMode': image.mode,
            'pngMetadataKeys': sorted(image.info),
            'rgba8PixelSha256': digest(struct.pack('>II', *image.size) + rgba.tobytes()),
            'rgbaExtrema': extrema,
            'constantRgba': [low for low, high in extrema] if all(low == high for low, high in extrema) else None,
        }
    return rgba, facts


def texture_slots(tree, path=()):
    for key, child in tree.items():
        if key == 'extras' or not isinstance(child, dict):
            continue
        if key.endswith('Texture') and 'index' in child:
            if key not in COLOR_SLOTS | DATA_SLOTS:
                raise ValueError(f'Unclassified texture slot: {key}')
            yield path + (key,), child
        else:
            yield from texture_slots(child, path + (key,))


def primitive_refs(doc):
    scenes = doc.get('scenes', [])
    pending = list(ref(scenes, doc.get('scene', 0), 'scene').get('nodes', []))
    reachable = set()
    while pending:
        index = pending.pop()
        if index in reachable:
            continue
        reachable.add(index)
        pending.extend(ref(doc['nodes'], index, 'node').get('children', []))

    groups = defaultdict(list)
    for node_index in sorted(reachable):
        node = doc['nodes'][node_index]
        if 'mesh' not in node:
            continue
        mesh_index = node['mesh']
        mesh = ref(doc['meshes'], mesh_index, 'mesh')
        for primitive_index, primitive in enumerate(mesh['primitives']):
            if 'material' not in primitive:
                continue
            groups[primitive['material']].append({
                'node': node_index, 'nodeName': node.get('name'), 'mesh': mesh_index,
                'meshName': mesh.get('name'), 'primitive': primitive_index,
                'skin': node.get('skin'),
            })
    return groups


def scan_model(cost, classification, expected):
    doc = cost.doc
    measured = cost.measure()
    if measured['metrics'] != expected:
        raise ValueError(f'Asset metrics disagree with fixed selected budget: {cost.path}')
    if doc.get('extensions', {}).get('VRM'):
        raise ValueError('VRM 0.x material and thumbnail bindings require a separate audit')
    bindings = defaultdict(list)
    placements = primitive_refs(doc)
    for index, material in enumerate(doc.get('materials', [])):
        mtoon = material.get('extensions', {}).get('VRMC_materials_mtoon', {})
        primitives = placements[index]
        name = material.get('name', '')
        state = 'not-in-default-scene'
        if primitives:
            source_clothes = classification == 'body' and SOURCE_CLOTHES.search(name)
            state = 'hidden-by-equipment-controller' if source_clothes and all(p['skin'] is not None for p in primitives) else 'material-in-scene'
        for path, info in texture_slots(material):
            transform = info.get('extensions', {}).get('KHR_texture_transform', {})
            bindings[info['index']].append({
                'material': index, 'materialName': name, 'slot': '.'.join(path),
                'shaderColorEncoding': 'sRGB' if path[-1] in COLOR_SLOTS else 'linear-data',
                'alphaMode': material.get('alphaMode', 'OPAQUE'),
                'alphaCutoff': material.get('alphaCutoff', 0.5) if material.get('alphaMode') == 'MASK' else None,
                'outlineWidthMode': mtoon.get('outlineWidthMode', 'none'),
                'texCoord': transform.get('texCoord', info.get('texCoord', 0)),
                'textureInfo': info, 'bindingState': state, 'primitivePlacements': primitives,
            })

    rows = []
    thumbnail = doc.get('extensions', {}).get('VRMC_vrm', {}).get('meta', {}).get('thumbnailImage')
    textures = defaultdict(list)
    for index, texture in enumerate(doc.get('textures', [])):
        sampler = ref(doc.get('samplers', []), texture.get('sampler'), 'texture sampler')
        if sampler != {'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497}:
            raise ValueError(f'Unexpected sampler in fixed input: {sampler}')
        textures[texture['source']].append({
            'texture': index, 'name': texture.get('name'), 'sampler': texture['sampler'],
            'samplerParams': sampler, 'materialSlots': bindings[index],
        })
    for row in measured['images']:
        index = row['index']
        image = doc['images'][index]
        data = cost.view_bytes(image['bufferView'])
        _, facts = pixels(data)
        references = textures[index]
        states = sorted({b['bindingState'] for t in references for b in t['materialSlots']})
        rows.append({
            **row, **facts, 'locator': f'{cost.path.name}#image{index}',
            'name': image.get('name'), 'mimeType': image['mimeType'],
            'encodedRangeInBin': [doc['bufferViews'][image['bufferView']].get('byteOffset', 0), len(data)],
            'vrmThumbnail': index == thumbnail, 'bindingStates': states,
            'rgba8LinearPerTextureDefinitionBytes': row['rgba8Bytes'] * len(references),
            'materialBoundRgba8LinearPerTextureDefinitionBytes': row['rgba8Bytes'] * sum(bool(t['materialSlots']) for t in references),
            'textureDefinitions': references,
        })
    spans = sorted(set(tuple(row['encodedRangeInBin']) for row in rows))
    if any(offset + size > next_offset for (offset, size), (next_offset, _) in zip(spans, spans[1:])):
        raise ValueError('Partially overlapping image payloads')
    return rows, sum(size for _, size in spans)


def coverage_comparison(cost, rows, manifest, coverage_raw):
    hits = [(row, t) for row in rows for t in row['textureDefinitions']
            if any(b['materialName'] == manifest['materialName'] and b['slot'] == 'pbrMetallicRoughness.baseColorTexture'
                   for b in t['materialSlots'])]
    if len(hits) != 1:
        raise ValueError('Expected one precise Body baseColor binding')
    base, texture = hits[0]
    if base['sha256'] != manifest['basePngSha256'] or digest(coverage_raw) != manifest['covered']['sha256']:
        raise ValueError('Body base/covered identity mismatch')
    if {b['slot'].split('.')[-1] for b in texture['materialSlots']} != {'baseColorTexture', 'shadeMultiplyTexture'}:
        raise ValueError('Unexpected Body map consumers')
    base_pixels, _ = pixels(cost.view_bytes(cost.doc['images'][base['index']]['bufferView']))
    covered, covered_facts = pixels(coverage_raw)
    if base_pixels.size != covered.size or covered.size != (manifest['width'], manifest['height']):
        raise ValueError('Body coverage dimensions mismatch')
    rgb_equal = not ImageChops.difference(base_pixels.convert('RGB'), covered.convert('RGB')).getbbox()
    if not rgb_equal or manifest['rgbPreserved'] is not True:
        raise ValueError('Body coverage must preserve every RGB pixel')
    alpha_delta = ImageChops.difference(base_pixels.getchannel('A'), covered.getchannel('A')).histogram()
    return {
        **covered_facts, 'base': base['locator'], 'basePngSha256': base['sha256'],
        'coveredPngSha256': digest(coverage_raw), 'coveredEncodedBytes': len(coverage_raw),
        'width': covered.width, 'height': covered.height, 'alphaCutoff': manifest['alphaTest'],
        'rgbEqual': rgb_equal, 'alphaChangedPixelCount': covered.width * covered.height - alpha_delta[0],
        'alphaUnchangedPixelCount': alpha_delta[0], 'baseAlphaHistogram': nonzero_histogram(base_pixels),
        'coveredAlphaHistogram': nonzero_histogram(covered), 'rgba8LinearPerSourceBytes': covered.width * covered.height * 4,
        'bodyBindings': [b['slot'] for b in texture['materialSlots']],
    }


def nonzero_histogram(rgba):
    return {str(level): count for level, count in enumerate(rgba.getchannel('A').histogram()) if count}


def duplicate_groups(rows, key):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row[key]].append(row)
    return [{
        'sha256': sha256, 'locators': [r['locator'] for r in group],
        'encodedVariants': len({r['sha256'] for r in group}),
        'encodedBytesAcrossOccurrences': sum(r['encodedBytes'] for r in group),
        'linearRgba8BytesPerOccurrence': group[0]['rgba8Bytes'],
    } for sha256, group in sorted(grouped.items()) if len(group) > 1]


def git_pin():
    path = 'prototype/src/native-body-normal-source-pins.json'
    raw = subprocess.check_output(['git', 'show', f'{SOURCE_COMMIT}:{path}'], cwd=ROOT)
    return json.loads(raw)['avatars'], digest(raw)


def build(assets):
    inventory_doc = json.loads(checked_bytes(EVIDENCE / 'inventory.json', INVENTORY_SHA))
    signed = json.loads(checked_bytes(EVIDENCE / 'records.json', RECORDS_SHA))
    budget = json.loads(checked_bytes(EVIDENCE / 'selected-budget-verified.json', BUDGET_REPORT_SHA))
    inventory = {row['path']: row for row in inventory_doc['files']}
    runtime = inventory_doc['runtime']
    if (runtime['sourceCommit'], runtime['buildId'], budget['sourceCommit'], budget['inputSha256']) != (
        SOURCE_COMMIT, BUILD_ID, SOURCE_COMMIT, RECORDS_SHA
    ):
        raise ValueError('Wrong fixed build or budget input')
    if tuple(row['identity']['id'] for row in signed) != RECORD_IDS or tuple(row['id'] for row in budget['records']) != RECORD_IDS:
        raise ValueError('Wrong pair of fixed records')
    model_placements = defaultdict(list)
    model_budget = {}
    coverage_rows = []
    for actor, record in zip(signed, budget['records']):
        if actor['appearanceRecipe']['base']['sha256'] != BODY_SHA or record['avatarSha256'] != BODY_SHA:
            raise ValueError('Wrong body on the fixed record')
        if actor['integrity']['recordSha256'] != record['recordSha256']:
            raise ValueError('Record hash mismatch')
        for model in record['models']:
            if not model['selected']:
                continue
            rel = model['path']
            if inventory[rel]['sha256'] != model['sha256'] or (rel in model_budget and model_budget[rel] != model):
                raise ValueError(f'Model identity or cost changed: {rel}')
            model_placements[rel].append(record['id'])
            model_budget[rel] = model
        cover, = record['standaloneImages']
        if cover['usage'] != 'native-body-coverage' or cover['sha256'] != inventory[cover['path']]['sha256']:
            raise ValueError('Wrong coverage image for fixed record')
        coverage_rows.append(cover)

    models = []
    coverage_path = coverage_rows[0]['path']
    if coverage_rows[0] != coverage_rows[1]:
        raise ValueError('Expected identical coverage inputs for the pair')
    manifest_rel = str(Path(coverage_path).with_name('manifest.json').as_posix())
    _, manifest_raw = indexed_input(assets, inventory, manifest_rel)
    manifest = json.loads(manifest_raw)
    _, covered_raw = indexed_input(assets, inventory, coverage_path)
    if manifest['avatarSha256'] != BODY_SHA or manifest['covered']['url'] != Path(coverage_path).name:
        raise ValueError('Coverage manifest is not for the pinned avatar and image')

    for model_rel, record_ids in sorted(model_placements.items()):
        model = model_budget[model_rel]
        path = confined(assets, model_rel)
        cost = AssetCost(path)
        if digest(cost.raw) != model['sha256'] or len(cost.raw) != inventory[model_rel]['bytes']:
            raise ValueError(f'Pinned model asset mismatch: {model_rel}')
        role = 'body' if model['sha256'] == BODY_SHA else model['class']
        rows, payload_bytes = scan_model(cost, role, model['cost']['metrics'])
        if role == 'body':
            coverage = coverage_comparison(cost, rows, manifest, covered_raw)
        models.append({
            'path': model_rel, 'sha256': model['sha256'], 'role': role, 'records': record_ids,
            'fileBytes': len(cost.raw), 'embeddedImagePayloadBytes': payload_bytes,
            'allOtherFileBytes': len(cost.raw) - payload_bytes, 'images': rows,
        })

    images = [row for model in models for row in model['images']]
    if len({row['locator'] for row in images}) != len(images):
        raise ValueError('Nonunique image locator')
    covered_row = {
        'locator': Path(coverage_path).name, 'sha256': coverage['coveredPngSha256'],
        'encodedBytes': coverage['coveredEncodedBytes'], 'rgba8Bytes': coverage['rgba8LinearPerSourceBytes'],
        'rgba8PixelSha256': coverage['rgba8PixelSha256'],
    }
    total_rows = []
    for record, cover in zip(budget['records'], coverage_rows):
        actor_images = [row for model in models if record['id'] in model['records'] for row in model['images']]
        all_mips = sum(row['rgba8MipBytes'] * len(row['textureDefinitions']) for row in actor_images)
        static_with_cover = all_mips + cover['addedRgba8EstimateBytes']
        if record['selectedCost']['totals']['rgba8MipBytes'] != static_with_cover:
            raise ValueError('Static selected total does not reconcile')
        total_rows.append({
            'id': record['id'], 'embeddedFullMipBudgetBytes': all_mips,
            'embeddedLinearAllTextureDefinitionsBytes': sum(r['rgba8LinearPerTextureDefinitionBytes'] for r in actor_images),
            'embeddedLinearMaterialBoundDefinitionsBytes': sum(r['materialBoundRgba8LinearPerTextureDefinitionBytes'] for r in actor_images),
            'embeddedLinearSceneMaterialDefinitionsBytes': sum(r['rgba8LinearPerTextureDefinitionBytes'] for r in actor_images if 'material-in-scene' in r['bindingStates']),
            'coveredRgba8LinearPerSourceBytes': cover['decodedRgba8Bytes'],
            'coverageUpperBoundFromStaticBudgetBytes': cover['addedRgba8EstimateBytes'],
            'selectedStaticBudgetEstimateBytes': static_with_cover,
        })

    pins, pins_sha = git_pin()
    return {
        'schema': 'native-7586-texture-cost-v1', 'sourceCommit': SOURCE_COMMIT, 'buildId': BUILD_ID,
        'signedRecordsSha256': RECORDS_SHA, 'packageInventorySha256': INVENTORY_SHA,
        'selectedBudgetReportSha256': BUDGET_REPORT_SHA, 'pillowVersion': pillow_version,
        'pixelHashDefinition': 'SHA256 of big-endian uint32 width then height followed by decoded RGBA8 in row order; exact alpha and hidden RGB retained',
        'records': total_rows, 'models': models,
        'coverage': {**coverage, 'assetPath': coverage_path, 'manifestPath': manifest_rel, 'manifestSha256': digest(manifest_raw)},
        'encodedDuplicateGroups': duplicate_groups([*images, covered_row], 'sha256'),
        'decodedDuplicateGroups': duplicate_groups([*images, covered_row], 'rgba8PixelSha256'),
        'normalSharing': {'pinFileSha256': pins_sha, '7586Pin': pins.get(BODY_SHA), 'fixedBuildPins': pins},
        'limits': [
            'Scene material references follow the default glTF scene and fixed m1-equipment.js embedded-clothing hide rule.',
            'One linear RGBA8 allocation per texture definition is an accounting lens, not a count of loader wrappers or WebGL allocations.',
            'Image payloads count each BIN byte range once. Reported encoded duplicates span files without multiplying bytes by actor placements.',
            'Thumbnail is VRM metadata and has no material reference. Keep its metadata role with any new release derivation.',
            'CPU static audit only. No uploads, browser, asset modification, budget change or admission.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-root', type=Path, default=DEFAULT_ASSETS,
                        help='existing fixed dist or 38-file game package root')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='require byte-identical checked-in JSON')
    mode.add_argument('--write-new', action='store_true', help='write report only when absent')
    args = parser.parse_args()
    data = (json.dumps(build(args.assets_root.resolve()), indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    if args.check:
        if REPORT.read_bytes() != data:
            raise SystemExit('Texture audit differs from the fixed report')
    else:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        with REPORT.open('xb') as output:
            output.write(data)
    print(f'{REPORT.relative_to(ROOT)} {digest(data)}')


if __name__ == '__main__':
    main()
