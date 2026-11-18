import copy
import io
import json
import unittest

from PIL import Image

import garment_basecolor_release as release


class GarmentBasecolorReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = json.loads(release.RECIPE.read_bytes())
        report = json.loads(release.REPORT.read_bytes())
        cls.rows = report['items']
        cls.item = cls.recipe['items'][0]
        cls.raw = release.input_path(cls.rows[0]['sourcePath']).read_bytes()

    def test_two_source_assets_reproduce_distinct_candidates_and_budgets(self):
        rebuilt = release.build(check_only=True)
        self.assertEqual(len(set(rebuilt.values())), 2)
        for row in self.rows:
            self.assertEqual(row['sha256'], rebuilt[row['id']])
            self.assertNotEqual(row['sourceSha256'], row['sha256'])
            self.assertEqual(row['budget']['source']['metrics']['rgba8MipBytes'], 22_719_144)
            self.assertEqual(row['budget']['candidate']['metrics']['rgba8MipBytes'], 5_941_928)
            self.assertEqual(row['readback']['unchangedImages'][0]['index'], 1)

    def test_incorrect_source_png_or_source_garment_hash_is_refused(self):
        for key, reason in [('sourceSha256', 'Source garment SHA'), ('sourcePngSha256', 'Selected PNG SHA')]:
            item = dict(self.item, **{key: '0' * 64})
            with self.subTest(field=key), self.assertRaisesRegex(ValueError, reason):
                release.derive(self.raw, item, self.rows[0]['sourceLicense'])

    def test_normal_texture_shared_material_image_view_and_wrong_selector_are_refused(self):
        source, _ = release.embedded_glb(self.raw)
        for case in [
            'normal',
            'other material',
            'image alias',
            'view alias',
            'wrong primitive',
            'negative image',
        ]:
            doc = copy.deepcopy(source)
            s = dict(self.item['selector'])
            if case == 'normal':
                doc['materials'][0]['normalTexture'] = {'index': 0}
            elif case == 'other material':
                doc['materials'][1]['pbrMetallicRoughness']['baseColorTexture']['index'] = 0
            elif case == 'image alias':
                doc['textures'][1]['source'] = 0
            elif case == 'view alias':
                doc['accessors'][0]['bufferView'] = s['bufferView']
            elif case == 'wrong primitive':
                s['primitive'] = 1
            else:
                s['image'] = -1
            with self.subTest(case=case), self.assertRaises(ValueError):
                release.image_view(doc, s)

    def test_single_transparent_texel_and_wrong_size_are_refused(self):
        for size, alpha, message in [(2048, 254, 'entirely opaque'), (1024, 255, '2048 by 2048')]:
            im = Image.new('RGBA', (size, size), (1, 2, 3, 255))
            im.putpixel((size - 1, size - 1), (1, 2, 3, alpha))
            png = io.BytesIO()
            im.save(png, format='PNG')
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, message):
                release.half_png(png.getvalue())

    def test_readback_rejects_changed_skin_or_tie_image(self):
        target = release.input_path(self.rows[0]['path']).read_bytes()
        doc, binary = release.embedded_glb(target)
        slot = self.item['selector']['bufferView']
        png = release.view_data(doc, binary, slot)
        lineage = doc['extras']['garmentBasecolorRelease']
        doc['skins'][0]['joints'].reverse()
        with self.assertRaisesRegex(ValueError, 'binding'):
            release.readback(self.raw, release.encode(doc, binary), slot, png, lineage)
        doc['skins'][0]['joints'].reverse()
        tie = doc['bufferViews'][doc['images'][1]['bufferView']]
        damaged = bytearray(binary)
        damaged[tie['byteOffset']] ^= 1
        with self.assertRaisesRegex(ValueError, 'outside'):
            release.readback(self.raw, release.encode(doc, damaged), slot, png, lineage)


if __name__ == '__main__':
    unittest.main()
