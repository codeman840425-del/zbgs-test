import json
from pathlib import Path
import tempfile
import unittest

from native_accessory_batch import ROOT, run, is_unfitted_glasses_capture


EVIDENCE = ROOT / 'evidence/m2-native-batch-runtime-seam-v1'


class NativeAccessoryBatchTests(unittest.TestCase):
    def test_explicit_unfitted_identity_requires_exact_body_and_accessory(self):
        live = {'fit': {'glassesTempleProfile': {'id':'legacy-glasses-fit-v1', 'sha256':None, 'bodySHA256':'a', 'accessorySHA256':'b', 'verified':False}}}
        self.assertTrue(is_unfitted_glasses_capture(live, 'a', 'b'))
        self.assertFalse(is_unfitted_glasses_capture(live, 'c', 'b'))
        live['fit']['glassesTempleProfile']['sha256'] = 'fitted'
        self.assertFalse(is_unfitted_glasses_capture(live, 'a', 'b'))

    def setUp(self):
        self.recipe = json.loads((EVIDENCE / 'accessory-smoke-recipe.json').read_bytes())
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.output = Path(scratch.name) / 'candidate'

    def test_archived_face_uses_original_temple_solver_and_target_mouth(self):
        target = self.recipe['targets'][0]
        row, = run(self.recipe, self.output)['targets']
        self.assertEqual(row['status'], 'cpu-candidate-only', row.get('error'))
        stage = self.output / target['id']
        prior = ROOT / f"assets-source/native-glasses-fit-v1/generated/{target['id']}.json"
        self.assertEqual((stage / 'glasses.json').read_bytes(), prior.read_bytes())
        mouth = json.loads((stage / 'mouth.json').read_bytes())
        self.assertEqual(mouth['avatarSha256'], target['body']['sha256'])
        pin = row['microphone']['gripEntry']
        self.assertEqual(pin['compatibleAvatarSha256'], target['body']['sha256'])
        self.assertEqual(row['microphone']['presentation']['mouthRawHeadLocal'], mouth['mouthRawHeadLocal'])
        self.assertEqual(row['microphone']['referencedHandTriangleCount'], 1093)
        with self.assertRaises(FileExistsError):
            run(self.recipe, self.output)

    def test_wrong_capture_or_body_pin_cannot_publish_and_valid_sibling_survives(self):
        target = self.recipe['targets'][0]
        self.recipe['targets'].extend([
            {**target, 'id': 'wrong-capture'},
            {**target, 'id': 'wrong-body', 'body': {**target['body'], 'sha256': '0' * 64}},
        ])
        rows = run(self.recipe, self.output)['targets']
        self.assertEqual([r['status'] for r in rows], ['cpu-candidate-only', 'failed', 'failed'])
        self.assertIn('Expected measured, unfitted stand glasses', rows[1]['error'])
        self.assertIn('SHA-256 mismatch', rows[2]['error'])
        self.assertFalse((self.output / 'wrong-capture').exists())
        self.assertFalse((self.output / 'wrong-body').exists())
        self.assertTrue((self.output / target['id'] / 'mouth.json').exists())


if __name__ == '__main__':
    unittest.main()
