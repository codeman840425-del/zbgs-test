import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

import receive_rule_body as intake
from production_paths import main_checkout


class RuleBodyIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = intake.read_json(intake.ROOT / 'assets-source/rule-body-recipe-v1/candidate.json')
        cls.body, _ = intake.generate(cls.recipe)

    def test_two_bodies_and_three_rest_fits(self):
        for weight in (.625, .375):
            recipe = dict(self.recipe, weight=weight)
            data = self.body if weight == .625 else intake.generate(recipe)[0]
            profile, files, proof = intake.prepare(recipe, data)
            self.assertEqual(profile['sha256'], intake.digest(data))
            self.assertEqual(set(profile['ids']), {'pants', 'shoes', 'top'})
            self.assertEqual(proof['affectedTriangles'], 268)
            self.assertGreater(proof['equipment']['top']['restSweptBoundsLowerDistanceM'], .003)
            self.assertEqual({row['compatibleAvatarSha256'] for row in json.loads(files['equipment.json'])['items']},
                             {profile['sha256']})

    def test_wrong_template_model_and_separation_refused(self):
        with self.assertRaisesRegex(ValueError, 'Unregistered'):
            intake.prepare(dict(self.recipe, template={'sha256':'0' * 64}), self.body)
        with self.assertRaisesRegex(ValueError, 'independent recipe replay'):
            intake.prepare(self.recipe, self.body[:-1])
        triangle = np.array([[[0.,0.,0.], [1.,0.,0.], [0.,1.,0.]]])
        with self.assertRaisesRegex(ValueError, 'separate fit'):
            intake.rest_clearance((triangle.min(1), triangle.max(1)), triangle)

    def test_receipt_is_atomic_local_and_cannot_alias_runtime(self):
        root = main_checkout(intake.__file__)
        for target in [Path(root.anchor) / 'role-fit.json', root / 'prototype/public/assets/foo/fit.json',
                       root / 'output/../prototype/src/x.json']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                intake.fit_receipt_path(target)
        with tempfile.TemporaryDirectory(dir=root / 'output') as tmp:
            dst = intake.fit_receipt_path(Path(tmp) / 'fit.json')
            with patch.object(intake.os,'link',side_effect=PermissionError):
                with self.assertRaises(PermissionError):
                    intake.save_fit_receipt(dst, {'ok':True})
            self.assertEqual(list(dst.parent.iterdir()), [])
            intake.save_fit_receipt(dst, {'ok':True})
            intake.save_fit_receipt(dst, {'ok':True})
            with self.assertRaisesRegex(ValueError, 'differs'):
                intake.save_fit_receipt(dst, {'ok':False})


if __name__ == '__main__':
    unittest.main()
