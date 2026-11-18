"""Exercise the exact real release body and the rejected fit cases in memory."""

import copy
import json
import struct
import unittest

from asset_budget import AssetCost
from flow import GLB, Validator
from native_import import confined, digest
from stripped_outfit_equipment import (
    BodyReadback, PROOF, PUBLIC_SOURCE, ROOT, SOURCE, SOURCE_MANIFEST, SOURCE_PROOF, SOURCE_SHA,
    TARGET, TARGET_MANIFEST, build, prove_body, receipt_selectors, verify_source_garment,
)

TARGET_SHA = 'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4'


class StrippedOutfitEquipmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_bytes = confined(ROOT, SOURCE).read_bytes()
        cls.target_bytes = confined(ROOT, TARGET).read_bytes()
        cls.source_proof = json.loads(confined(ROOT, SOURCE_PROOF).read_bytes())
        cls.selectors = [s['selector'] for item in cls.source_proof['items'] for s in receipt_selectors(item)]

    def test_rebuilds_catalog_for_actual_target_without_copying_glbs(self):
        files = build(TARGET_SHA)
        self.assertEqual(files.keys(), {TARGET_MANIFEST, PROOF})
        for name, data in files.items():
            self.assertEqual(data, confined(ROOT, name).read_bytes())
        rows = json.loads(files[TARGET_MANIFEST])['items']
        self.assertEqual([r['slot'] for r in rows], ['top', 'bottom', 'shoes'])
        self.assertEqual([len(r['bindings']) for r in rows], [10, 9, 6])
        for row in rows:
            self.assertEqual(row['compatibleAvatarSha256'], TARGET_SHA)
            original = confined(ROOT, 'prototype/public' + row['url']).read_bytes()
            self.assertEqual(digest(original), row['sha256'])
            self.assertEqual(GLB(original).doc['extras']['sourceSha256'], SOURCE_SHA)

    def test_rejects_unrelated_body_or_publisher_identity(self):
        with self.assertRaisesRegex(ValueError, 'SHA mismatch: .*body.vrm'):
            build('0' * 64)
        with self.assertRaisesRegex(ValueError, 'distinct exact release body SHA'):
            build(SOURCE_SHA)
        with self.assertRaisesRegex(ValueError, 'retained primitive count'):
            prove_body(BodyReadback(self.source_bytes), BodyReadback(self.source_bytes), self.selectors)

    def test_rejects_changed_target_rest_and_actual_inverse_bind(self):
        source = BodyReadback(self.source_bytes)
        target = BodyReadback(self.target_bytes)
        node = target.doc['nodes'][target.doc['skins'][0]['joints'][0]]
        x, y, z = node.get('translation', [0, 0, 0])
        node['translation'] = [x + 0.02, y, z]
        with self.assertRaisesRegex(ValueError, 'Raw node/rest hierarchy differs'):
            prove_body(source, target, self.selectors)

        target = BodyReadback(self.target_bytes)
        accessor = target.doc['accessors'][target.doc['skins'][0]['inverseBindMatrices']]
        view = target.doc['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0) + 48
        binary = bytearray(target.glb.binary)
        current, = struct.unpack_from('<f', binary, offset)
        struct.pack_into('<f', binary, offset, current + 0.02)
        target.glb.binary = bytes(binary)
        with self.assertRaisesRegex(ValueError, 'actual inverse bind payload differs'):
            prove_body(source, target, self.selectors)

    def test_rejects_wrong_garment_binding_and_unextracted_surface(self):
        entry = json.loads(confined(ROOT, TARGET_MANIFEST).read_bytes())['items'][0]
        entry['bindings'][0]['inverseBindMatrix'][12] += 0.02
        with self.assertRaisesRegex(ValueError, 'Inverse bind mismatch'):
            Validator().equipment(entry, TARGET_SHA, GLB(self.target_bytes), TARGET_MANIFEST)

        removed = copy.deepcopy(self.selectors)
        removed[0]['primitive'] = 0  # Retained body skin in the same mesh.
        with self.assertRaisesRegex(ValueError, 'Retained surface bytes differ'):
            prove_body(BodyReadback(self.source_bytes), BodyReadback(self.target_bytes), removed)

        original = json.loads(confined(ROOT, SOURCE_MANIFEST).read_bytes())['items'][0]
        raw = confined(ROOT, PUBLIC_SOURCE + '/' + original['url']).read_bytes()
        wrong_receipt = copy.deepcopy(self.source_proof['items'][0])
        wrong_receipt['selection'][0]['selector'].update(primitive=0, material=9)
        with self.assertRaisesRegex(ValueError, 'Original garment extraction evidence differs'):
            verify_source_garment(AssetCost(confined(ROOT, SOURCE)), original, wrong_receipt, raw)


if __name__ == '__main__':
    unittest.main()
