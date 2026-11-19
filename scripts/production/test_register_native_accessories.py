import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import register_native_accessories as registration


class NativeAccessoryRegistrationTests(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory(dir=registration.ROOT / 'experiments')
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.source_result = Path('evidence/m2-native-batch-runtime-seam-v1/accessory-smoke/result.json')
        self.copy(self.source_result)
        self.result_path = self.root / self.source_result
        self.result = json.loads(self.result_path.read_bytes())
        self.row, = self.result['targets']
        self.body = self.row['id']
        self.sha = self.row['body']['sha256']
        for name in ('glasses.json', 'grip.json', 'mouth.json', 'microphone-presentation.json'):
            self.copy(self.source_result.parent / self.body / name)
        for pin in [self.row['body'], self.row['glasses']['capture'], *(
            self.row['microphone'][key] for key in ('referenceBody', 'referenceGrip', 'referencePresentation', 'mic')
        )]:
            self.copy(Path(pin['path']))
        self.copy(Path(registration.ACCESSORIES))
        self.copy(Path('prototype/public/assets/m1c/studio-glasses-v1.glb'))
        self.write(registration.BODIES, {
            'schema': 'native-production-catalog-v1', 'entries': [{'bodyType': self.body, 'profile': {
                'url': '/' + self.row['body']['path'].removeprefix('prototype/public/'),
                'sha256': self.sha,
            }}],
        })
        for name, field, key in [(registration.GRIPS, 'items', 'compatibleAvatarSha256'),
                                 (registration.GLASSES, 'profiles', 'bodySHA256')]:
            manifest = json.loads((registration.ROOT / name).read_bytes())
            manifest[field] = [row for row in manifest[field] if row[key] != self.sha]
            self.write(name, manifest)
        self.old_grips = (self.root / registration.GRIPS).read_bytes()
        self.old_glasses = (self.root / registration.GLASSES).read_bytes()
        self.grip_path = registration.public_path(self.root, self.row['microphone']['gripEntry']['url'])
        self.glasses_path = registration.public_path(self.root, self.row['glasses']['templeEntry']['url'])

    def copy(self, path):
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(registration.ROOT / path, destination)

    def write(self, path, document):
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(document), encoding='utf-8')

    def assert_unchanged(self):
        self.assertEqual((self.root / registration.GRIPS).read_bytes(), self.old_grips)
        self.assertEqual((self.root / registration.GLASSES).read_bytes(), self.old_glasses)
        self.assertFalse((self.root / registration.PRESENTATION).exists())
        self.assertFalse(self.grip_path.exists())
        self.assertFalse(self.glasses_path.exists())

    def test_external_checkout_is_rejected_before_reading_the_result(self):
        external = registration.ROOT.parent
        with self.assertRaisesRegex(ValueError, 'checkout must be inside the production project'):
            registration.register(external / 'missing-fit-receipt.json', external)

    def test_separate_results_and_idempotence(self):
        mic_only = self.source_result.with_name('mic-result.json')
        glasses_only = self.source_result.with_name('glasses-result.json')
        self.write(mic_only, {**self.result, 'targets': [{key: val for key, val in self.row.items() if key != 'glasses'}]})
        self.write(glasses_only, {**self.result, 'targets': [{key: val for key, val in self.row.items() if key != 'microphone'}]})
        self.assertEqual(registration.register(self.root / mic_only, self.root)['status'], 'source-candidate-registered')
        self.assertEqual((self.root / registration.GLASSES).read_bytes(), self.old_glasses)
        results = json.loads((self.root / registration.PRESENTATION).read_bytes())
        self.assertEqual(results, {self.sha: self.row['microphone']['presentation']})
        self.assertEqual(registration.register(self.root / glasses_only, self.root)['status'], 'source-candidate-registered')
        before = [p.read_bytes() for p in (self.grip_path, self.glasses_path)]
        self.assertEqual(registration.register(self.result_path, self.root)['status'], 'already-registered')
        self.assertEqual([p.read_bytes() for p in (self.grip_path, self.glasses_path)], before)

    def test_modified_glasses_bytes_reject_entire_batch(self):
        path = self.result_path.parent / self.body / 'glasses.json'
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            registration.register(self.result_path, self.root)
        self.assert_unchanged()

    def test_existing_grip_id_conflict_preserves_registry_and_resources(self):
        manifest = json.loads(self.old_grips)
        manifest['items'][0]['id'] = self.row['microphone']['gripEntry']['id']
        self.write(registration.GRIPS, manifest)
        self.old_grips = (self.root / registration.GRIPS).read_bytes()
        with self.assertRaisesRegex(ValueError, 'Conflicting registration'):
            registration.register(self.result_path, self.root)
        self.assert_unchanged()

    def test_replacement_failure_rolls_back_completed_writes(self):
        original = registration.os.replace

        def fail_glasses_manifest(source, target):
            if target == self.root / registration.GLASSES:
                raise OSError('injected glasses registry write failure')
            original(source, target)

        with patch.object(registration.os, 'replace', side_effect=fail_glasses_manifest):
            with self.assertRaisesRegex(OSError, 'injected glasses registry write failure'):
                registration.register(self.result_path, self.root)
        self.assert_unchanged()

    def test_modified_final_body_rejects_entire_batch(self):
        path = self.root / self.row['body']['path']
        with path.open('ab') as body:
            body.write(b' ')
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            registration.register(self.result_path, self.root)
        self.assert_unchanged()


if __name__ == '__main__':
    unittest.main()
