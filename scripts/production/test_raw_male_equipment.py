"""CPU regression for the publisher outfit, its provenance and the retained roundtrip outputs."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from asset_budget import AssetCost
from native_accessory_batch import load_script
from native_import import confined, digest
import raw_male_equipment as garment


class RawMaleEquipmentTests(unittest.TestCase):
    def test_outfit_and_single_pants_are_exact_rebuilds(self):
        files, report = garment.build_outfit(json.loads((garment.EVIDENCE / 'outfit.json').read_bytes()))
        self.assertEqual(report, json.loads((garment.EVIDENCE / 'outfit-report.json').read_bytes()))
        manifest = json.loads(files['equipment.json'])
        self.assertEqual([item['slot'] for item in manifest['items']], ['top', 'bottom', 'shoes'])
        self.assertEqual([len(item['bindings']) for item in manifest['items']], [10, 9, 6])
        self.assertEqual(len(report['items'][0]['verified']['primitives']), 2)
        parts, sample = garment.build(json.loads(garment.RECIPE.read_bytes()))
        self.assertEqual(sample, json.loads(garment.REPORT.read_bytes()))
        self.assertEqual(parts[manifest['items'][1]['url']], files[manifest['items'][1]['url']])
        self.assertFalse(report['runtimeAdmission'])

    def test_rejects_nonidentity_mesh_owner(self):
        data = json.loads(garment.RECIPE.read_bytes())
        model, mapping, spec, origin, _ = garment.read_source(data)
        selector = mapping['selections']['source']
        model.doc['nodes'][selector['node']]['translation'] = [0, 0.25, 0]
        with self.assertRaisesRegex(ValueError, 'mesh owner must be identity'):
            garment.source_context(model, selector, spec['sourceSha256'], origin, data['limits'])

    def test_all_three_original_roundtrip_glbs_and_entries_remain_byte_compatible(self):
        exporter = load_script('legacy_roundtrip', 'scripts/m1b-assets/build.py')
        source = AssetCost(confined(garment.ROOT, exporter.SPEC['roundtrip']))
        catalog = json.loads((garment.ROOT / 'prototype/public/assets/m1b/equipment.json').read_bytes())
        with TemporaryDirectory(dir=garment.ROOT / 'output') as tmp:
            exporter.OUT = Path(tmp)
            for identifier, indexes in [
                ('m1b-uniform-top', (1, 2)),
                ('m1b-uniform-pants', (3,)),
                ('m1b-uniform-shoes', (4,)),
            ]:
                entry = next(item for item in catalog['items'] if item['id'] == identifier)
                parts = []
                for i in indexes:
                    material = source.doc['meshes'][0]['primitives'][i]['material']
                    part, _ = garment.select(
                        source, dict(node=67, mesh=0, skin=0, primitive=i, material=material)
                    )
                    parts.append(part)
                rebuilt = exporter.export(identifier, entry['name'], entry['slot'], parts, entry['method'])
                self.assertEqual(rebuilt, entry)
                data = (exporter.OUT / entry['url']).read_bytes()
                self.assertEqual(digest(data), entry['sha256'])
                self.assertEqual(
                    data, (garment.ROOT / 'prototype/public/assets/m1b' / entry['url']).read_bytes()
                )


if __name__ == '__main__':
    unittest.main()
