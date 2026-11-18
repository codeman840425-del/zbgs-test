import json
import unittest

import garment_basecolor_runtime as stage


class PublishedGarmentFits(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        specs = json.loads(stage.RECIPE.read_bytes())['items']
        cls.female = next(s for s in specs if s['directory'] == 'female')
        cls.male = next(s for s in specs if s['directory'] == 'male')
        cls.near = stage.Validator().item(
            json.loads(stage.pinned(cls.female['nearCatalog'])), cls.female['nearId']
        )
        cls.body = stage.GLB(stage.pinned(cls.female['body']))
        cls.far = json.loads((stage.PACKAGE / 'female/equipment.json').read_bytes())['items'][0]
        cls.model = stage.GLB(stage.input_path(stage.Validator().url(cls.far['url'])).read_bytes())

    def test_female_mask_rejects_wrong_fit_or_moved_top(self):
        with self.assertRaisesRegex(ValueError, 'exact parent top'):
            stage.coverage(
                self.body,
                self.model,
                self.near,
                dict(self.far, compatibleAvatarSha256=self.male['body']['sha256']),
                self.female,
            )
        bad = stage.GLB(stage.input_path(stage.Validator().url(self.far['url'])).read_bytes())
        prim = bad.doc['meshes'][0]['primitives'][0]
        prim['attributes']['POSITION'] = prim['attributes']['NORMAL']
        with self.assertRaisesRegex(ValueError, 'witness'):
            stage.coverage(self.body, bad, self.near, self.far, self.female)

    def test_mismatched_inverse_binds_and_swapped_bodies_are_refused(self):
        args = (self.female['body']['sha256'], self.body, 'unused-for-absolute-url')
        row = dict(self.far, bindings=[dict(b) for b in self.far['bindings']])
        row['bindings'][0]['inverseBindMatrix'] = [0] * 16
        with self.assertRaisesRegex(ValueError, 'Inverse bind mismatch'):
            stage.Validator().equipment(row, *args)
        with self.assertRaisesRegex(ValueError, 'Wrong body fit'):
            stage.Validator().equipment(
                self.far,
                self.male['body']['sha256'],
                stage.GLB(stage.pinned(self.male['body'])),
                'unused-for-absolute-url',
            )

    def test_rebuild_checks_registered_assets_and_all_coverage_witnesses(self):
        report = stage.build(check_only=True)
        self.assertEqual(report[self.female['id']]['coverage']['restSurfaceHits'], 1764)
        self.assertEqual(report[self.male['id']]['far']['bones'], 10)
        self.assertEqual(report[self.female['id']]['far']['bones'], 16)


if __name__ == '__main__':
    unittest.main()
