"""Rebuild the one pinned pants sample and reject its neighbour at the same mesh."""
import copy
import json
import unittest

import garment_source_mapping as mapping


class GarmentSourceMappingTests(unittest.TestCase):
    def setUp(self):
        self.recipe = json.loads(mapping.RECIPE.read_bytes())

    def test_layouts_and_rebuilt_equipment(self):
        files, report = mapping.build(self.recipe)
        self.assertEqual(report, json.loads(mapping.REPORT.read_bytes()))
        before, after = report['sources']['source'], report['sources']['roundtrip']
        self.assertNotEqual(before['selector']['mesh'], after['selector']['mesh'])
        self.assertNotEqual(before['selector']['primitive'], after['selector']['primitive'])
        self.assertEqual((before['triangles'], after['triangles']), (1624, 1624))
        self.assertEqual((before['referencedVertices'], after['referencedVertices']), (1095, 1096))
        self.assertTrue(report['selectionComparison']['changedInverseBinds'])
        output = report['roundtripOutput']
        self.assertEqual(mapping.digest(files[output['url']]), output['sha256'])
        self.assertEqual(json.loads(files['equipment.json'])['items'][0]['compatibleAvatarSha256'], after['sha256'])
        self.assertEqual(report['originalOutput']['status'], 'source-selection-only')
        self.assertFalse(report['runtimeAdmission'])

    def test_other_primitive_with_same_skin_rejected(self):
        wrong = copy.deepcopy(self.recipe)
        wrong['selections']['roundtrip']['primitive'] = 4
        with self.assertRaisesRegex(ValueError, 'Garment primitive material differs'):
            mapping.build(wrong)


if __name__ == '__main__':
    unittest.main()
