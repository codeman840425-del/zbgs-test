"""Register the publisher's three garment GLBs on the exact stripped VRM0 candidate."""

import argparse
import copy
from functools import cached_property, lru_cache
import json
from pathlib import Path
import re

import numpy as np

from asset_budget import AssetCost, COMPONENTS
from flow import GLB, ROOT, Validator, require
from garment_source_mapping import json_bytes, select
from native_accessory_batch import load_script
from native_import import confined, digest
from raw_male_equipment import source_context, verify_output

SOURCE = 'assets-source/foundation-male/Base_Male.vrm'
SOURCE_SHA = 'ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c'
PUBLIC_SOURCE = 'prototype/public/assets/raw-male-equipment-v1'
SOURCE_MANIFEST = PUBLIC_SOURCE + '/equipment.json'
SOURCE_MANIFEST_SHA = 'ea2b8d781b15f2ea66d3229150db4eacd70653b789f15bb121314ccf1bc6552f'
SOURCE_PROOF = 'evidence/m2-raw-male-equipment-v1/outfit-report.json'
SOURCE_PROOF_SHA = '5a31ac6a98349704a06adb375f753792fdc19f3b7d76d8aef77ba0a0bddae507'
TARGET_DIR = 'prototype/public/assets/source-outfit-release-v1'
TARGET = TARGET_DIR + '/body.vrm'
TARGET_MANIFEST = TARGET_DIR + '/equipment.json'
PROOF = 'evidence/m2-source-outfit-release-v1/fit/report.json'
BODY_TYPE = 'source-male-ab9a-release-v1'


class BodyReadback:
    """Resolve table references before comparing streams, surfaces and rest state."""

    def __init__(self, raw):
        self.glb = GLB(raw)
        self.doc = self.glb.doc
        self.vrm = self.doc['extensions']['VRM']
        # Cache once per document. Separate build calls can release both documents.
        self.stream = lru_cache(maxsize=None)(self.stream)
        self.material = lru_cache(maxsize=None)(self.material)
        self.texture = lru_cache(maxsize=None)(self.texture)

    @cached_property
    def skins(self):
        return [{**skin, 'inverseBindMatrices': self.stream(skin['inverseBindMatrices'])}
                for skin in self.doc['skins']]

    def stream(self, index):
        accessor = self.doc['accessors'][index]
        packed = np.asarray(self.glb.accessor(index), dtype='<' + COMPONENTS[accessor['componentType']][0])
        signature = {key: value for key, value in accessor.items() if key not in ('bufferView', 'byteOffset')}
        return {'accessor': signature, 'payloadSha256': digest(packed.tobytes())}

    def texture(self, index):
        texture = self.doc['textures'][index]
        image = self.doc['images'][texture['source']]
        view = self.doc['bufferViews'][image['bufferView']]
        start, length = view.get('byteOffset', 0), view['byteLength']
        require('uri' not in image and view['buffer'] == 0 and 0 <= start < start + length <= len(self.glb.binary),
                'Invalid retained embedded image')
        return {
            'texture': {key: value for key, value in texture.items() if key not in ('source', 'sampler')},
            'image': {key: value for key, value in image.items() if key != 'bufferView'},
            'sampler': self.doc['samplers'][texture['sampler']] if 'sampler' in texture else None,
            'payloadSha256': digest(self.glb.binary[start:start + length]),
        }

    def material(self, index):
        def resolved(value):
            if isinstance(value, dict):
                return {key: ({**item, 'index': self.texture(item['index'])}
                              if key.endswith('Texture') and isinstance(item, dict) and 'index' in item
                              else resolved(item)) for key, item in value.items()}
            if isinstance(value, list):
                return [resolved(item) for item in value]
            return value

        legacy = self.vrm['materialProperties'][index]
        return [resolved(self.doc['materials'][index]), {
            **legacy,
            'textureProperties': {key: self.texture(value) if value >= 0 else value
                                  for key, value in legacy['textureProperties'].items()},
        }]

    def primitive(self, primitive):
        return {
            **primitive,
            'indices': self.stream(primitive['indices']),
            'material': self.material(primitive['material']),
            'attributes': {key: self.stream(value) for key, value in primitive['attributes'].items()},
            **({'targets': [{key: self.stream(value) for key, value in target.items()}
                            for target in primitive['targets']]} if 'targets' in primitive else {}),
        }


def prove_body(source, target, selectors):
    for key in ('nodes', 'scene', 'scenes'):
        require(source.doc.get(key) == target.doc.get(key), 'Raw node/rest hierarchy differs: ' + key)
    require(source.skins == target.skins, 'Body skin or actual inverse bind payload differs')
    for key in ('humanoid', 'blendShapeMaster', 'secondaryAnimation'):
        require(source.vrm.get(key) == target.vrm.get(key), 'Body VRM mapping differs: ' + key)
    removed = {(row['mesh'], row['primitive']) for row in selectors}
    require(len(selectors) == len(removed) == 4, 'Expected four distinct extracted primitives')
    kept = []
    meshes = zip(source.doc['meshes'], target.doc['meshes'], strict=True)
    for mesh_index, (old, new) in enumerate(meshes):
        require({key: value for key, value in old.items() if key != 'primitives'} ==
                {key: value for key, value in new.items() if key != 'primitives'}, 'Retained mesh metadata differs')
        keep = [(index, row) for index, row in enumerate(old['primitives']) if (mesh_index, index) not in removed]
        require(len(keep) == len(new['primitives']), 'Body retained primitive count differs from the extracted outfit')
        for target_index, ((source_index, old_primitive), new_primitive) in enumerate(zip(keep, new['primitives'], strict=True)):
            prior = source.primitive(old_primitive)
            require(prior == target.primitive(new_primitive), f'Retained surface bytes differ: {mesh_index}/{source_index}')
            kept.append({'mesh': mesh_index, 'sourcePrimitive': source_index, 'targetPrimitive': target_index,
                         'materialName': prior['material'][0]['name'], 'signatureSha256': digest(json_bytes(prior))})
    return {'nodeCount': len(source.doc['nodes']), 'jointSlots': [len(skin['joints']) for skin in source.skins],
            'skinSignaturesSha256': digest(json_bytes(source.skins)), 'retainedPrimitives': kept}


def receipt_selectors(item):
    selection = item['selection']
    return selection if isinstance(selection, list) else [selection]


def verify_source_garment(source, entry, receipt, raw):
    require(entry['compatibleAvatarSha256'] == SOURCE_SHA and receipt['equipment']['sha256'] == entry['sha256'],
            'Original garment receipt identity differs: ' + entry['id'])
    selections = receipt_selectors(receipt)
    selectors = [selected['selector'] for selected in selections]
    parts, proof = zip(*(select(source, selector) for selector in selectors), strict=True)
    require(list(proof) == selections, 'Original garment extraction evidence differs: ' + entry['id'])
    context = source_context(source, selectors[0], SOURCE_SHA, entry['sourceLicense'], entry['limits'])
    actual = verify_output(raw, context, parts, entry, proof)
    require(actual == receipt['verified'], 'User garment differs from exact source extraction: ' + entry['id'])
    extras = GLB(raw).doc['extras']
    require(extras['sourceSha256'] == SOURCE_SHA and extras['sourceProvenance'] == entry['sourceLicense'],
            'Original garment GLB provenance differs: ' + entry['id'])
    return actual


def build(expected_target_sha, root=ROOT):
    require(re.fullmatch(r'[a-f0-9]{64}', expected_target_sha) and expected_target_sha != SOURCE_SHA,
            'Expected a distinct exact release body SHA')
    reader = Validator(root)
    source_raw = reader.pin(SOURCE, SOURCE_SHA)
    target_raw = reader.pin(TARGET, expected_target_sha)
    manifest = json.loads(reader.pin(SOURCE_MANIFEST, SOURCE_MANIFEST_SHA))
    proof = json.loads(reader.pin(SOURCE_PROOF, SOURCE_PROOF_SHA))
    source_entries = manifest['items']
    require(manifest['schema'] == 'zbgs-equipment-v1' and [entry['slot'] for entry in source_entries] == ['top', 'bottom', 'shoes']
            and proof['bodySha256'] == SOURCE_SHA and proof['equipmentManifestSha256'] == SOURCE_MANIFEST_SHA
            and [item['id'] for item in proof['items']] == [entry['id'] for entry in source_entries],
            'Expected only the three exactly extracted garments')
    source_model = AssetCost(confined(root, SOURCE))
    require(source_model.raw == source_raw, 'Publisher body changed during readback')
    source, target = BodyReadback(source_raw), BodyReadback(target_raw)
    selectors = [s['selector'] for item in proof['items'] for s in receipt_selectors(item)]
    body_proof = prove_body(source, target, selectors)
    entries, receipts = [], []
    for entry, source_receipt in zip(source_entries, proof['items'], strict=True):
        filename = entry['url']
        require(Path(filename).name == filename and filename == entry['id'] + '.glb', 'Expected exact publisher garment filename')
        raw = reader.pin(f'{PUBLIC_SOURCE}/{filename}', entry['sha256'], entry['bytes'])
        extraction = verify_source_garment(source_model, entry, source_receipt, raw)
        identifier = 'source-outfit-release-' + entry['id'].removeprefix('raw-male-ab9a-')
        release = copy.deepcopy(entry)
        release.update(id=identifier, fitId=identifier + '-fit', compatibleAvatarSha256=expected_target_sha,
                       url='/assets/raw-male-equipment-v1/' + filename,
                       limits=['Fit verified only for the exact stripped publisher-derived body. Original VRM0 coordinates and raw skeleton retained.',
                               *entry['limits'][1:]])
        bound = reader.equipment(release, expected_target_sha, target.glb, TARGET_MANIFEST)
        entries.append(release)
        receipts.append({**bound, 'sourceEquipmentId': entry['id'], 'releaseFitId': release['fitId'],
                         'assetSha256': release['sha256'], 'assetUrl': release['url'], 'rawSourceExtraction': extraction})
    data = json_bytes({'schema': 'zbgs-equipment-v1', 'items': entries})
    report = {'schema': 'source-outfit-release-fit-v1', 'bodyType': BODY_TYPE,
              'sourceBodySha256': SOURCE_SHA, 'targetBodySha256': expected_target_sha,
              'bodyProof': body_proof, 'removedSourcePrimitiveSelectors': selectors,
              'items': receipts, 'equipmentManifestSha256': digest(data), 'inputs': reader.observed,
              'scope': 'Exact raw body/garment fit, source extraction and retained surfaces; pose, contact, visual and release admission are separate.'}
    return {TARGET_MANIFEST: data, PROOF: json_bytes(report)}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--body-sha256', required=True)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--write-new', action='store_true')
    args = cli.parse_args()
    files = build(args.body_sha256)
    for relative, raw in files.items():
        target = confined(ROOT, relative)
        require(target == ROOT / relative, 'Output resolves to a different project location: ' + relative)
        require(not target.exists() or (target.is_file() and target.read_bytes() == raw), 'Existing output differs: ' + relative)
        require(not args.check or target.is_file(), 'Missing output: ' + relative)
    if args.write_new:
        writer = load_script('safe_stripped_equipment_output', 'scripts/native-vroid-equipment-extract.py')
        for relative in (PROOF, TARGET_MANIFEST):
            target = confined(ROOT, relative)
            require(target == ROOT / relative, 'Output resolves to a different project location: ' + relative)
            writer.write_outputs({target.name: files[relative]}, target.parent)
    print(json.dumps({name: digest(raw) for name, raw in files.items()}))


if __name__ == '__main__':
    main()
