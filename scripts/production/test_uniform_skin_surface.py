"""Exercise actual body/face resources and retry the intact warm material fit."""
import copy
import json
import unittest
from unittest.mock import patch

import numpy as np

import uniform_skin_surface as skin


class WarmSkinFit(unittest.TestCase):
    def setUp(self):
        self.reader = skin.Validator()
        self.target_path = self.reader.url(skin.ASSET_URL + '/body.vrm')
        self.target = skin.BodyReadback(self.reader.pin(self.target_path, skin.TARGET_SHA))

    def test_swapped_body_rejected_and_original_inputs_reproduce_report(self):
        parent = self.reader.pin(skin.PARENT, skin.PARENT_SHA)
        path = (skin.ROOT / self.target_path).resolve()
        with patch.dict(self.reader.cache, {path: (parent, skin.PARENT_SHA)}):
            with self.assertRaisesRegex(ValueError, 'SHA mismatch.*body.vrm'):
                skin.audit(self.reader)
        self.assertEqual(skin.audit(), json.loads(skin.REPORT.read_bytes()))

    def test_skin_uv_transform_and_shade_source_mutations(self):
        material = self.target.vrm['materialProperties'][13]
        for fields, key, replacement in [(material['vectorProperties'], '_MainTex', [0, 1, 1, 1]),
                                         (material['textureProperties'], '_ShadeTexture', 0)]:
            with self.subTest(key=key), patch.dict(fields, {key: replacement}):
                with self.assertRaisesRegex(ValueError, 'Skin UV or shade map changed'):
                    skin.material_surface(self.target, skin.FACE)
        fact, _, _, _ = skin.material_surface(self.target, skin.FACE)
        self.assertEqual(fact['texture'], 19)

    def test_covered_triangle_source_and_retry(self):
        filename, sha = skin.MASKS['topFar']
        rule = json.loads(self.reader.pin(self.reader.url(skin.ASSET_URL + '/' + filename), sha))
        pin = rule['parentCoverage']
        parent = json.loads(self.reader.pin(pin['path'], pin['sha256']))
        catalog = json.loads(self.reader.pin(self.reader.url(skin.ASSET_URL + '/equipment.json'), skin.MANIFEST_SHA))
        top = self.reader.item(catalog, skin.RELEASE_IDS['topFar'])
        primitive = self.target.doc['meshes'][0]['primitives'][0]
        bad = copy.deepcopy(rule)
        bad['selectedTriangles'][0].reverse()
        with self.assertRaisesRegex(ValueError, 'Coverage source'):
            skin.coverage(bad, parent, top, self.target, primitive, set())
        with self.assertRaisesRegex(ValueError, 'hidden head boundary'):
            skin.coverage(rule, parent, top, self.target, primitive, {rule['selectedFaceIds'][0]})
        self.assertEqual(skin.coverage(rule, parent, top, self.target, primitive, set())['drawnBodyTriangles'], 7480)

    def test_lip_weight_at_actual_boundary_sample_rejected(self):
        face, face_part, _, face_image = skin.material_surface(self.target, skin.FACE)
        _, body_part, _, body_image = skin.material_surface(self.target, skin.BODY_MATERIAL)
        edges, _ = skin.matched_edges(skin.boundary(self.target, body_part), skin.boundary(self.target, face_part))
        mask = np.zeros(face_image.shape[:2], dtype=np.uint8)
        uv = edges[0][4]
        x, y = np.floor(uv * face['size'] - .5).astype(int)
        mask[y % mask.shape[0], x % mask.shape[1]] = 1
        with self.assertRaisesRegex(ValueError, 'Outer lip mask reaches'):
            skin.seam(edges, body_image, body_image, face_image, mask, face)
        mask.fill(0)
        self.assertEqual(skin.seam(edges, body_image, body_image, face_image, mask, face)
                         ['edgesAtLowestFaceBodyJoin']['edgeMidpoints'], 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
