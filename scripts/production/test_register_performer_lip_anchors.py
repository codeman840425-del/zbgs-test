import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import register_performer_lip_anchors as registrar


class LipRegistrationTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(dir=registrar.ROOT / 'output')
        self.addCleanup(temp.cleanup)
        self.workspace = Path(temp.name)
        self.catalog = self.workspace / registrar.CATALOG
        self.catalog.parent.mkdir(parents=True)
        self.catalog.write_bytes(b'{}\n')

    def test_exact_retry_and_preflight_before_adding_other_body(self):
        male, female = '2' * 64, '1' * 64
        pins = registrar.install(self.workspace, {male: b'original'})
        original = self.catalog.read_bytes()
        self.assertEqual(registrar.install(self.workspace, {male: b'original'}, check=True), pins)
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            registrar.install(self.workspace, {female: b'other', male: b'different'})
        folder = self.workspace / 'prototype/public' / registrar.URL_ROOT.lstrip('/')
        self.assertEqual([p.name for p in folder.iterdir()], [male + '.json'])
        self.assertEqual(self.catalog.read_bytes(), original)
        (folder / (male + '.json')).unlink()
        with self.assertRaisesRegex(ValueError, 'Missing published'):
            registrar.install(self.workspace, {male: b'original'}, check=True)
        self.assertEqual(registrar.install(self.workspace, {male: b'original'}), pins)
        self.assertEqual(self.catalog.read_bytes(), original)

    def test_runtime_asset_key_cannot_escape(self):
        with self.assertRaisesRegex(ValueError, 'body SHA'):
            registrar.install(self.workspace, {'../../outside': b'bad'})
        self.assertEqual(self.catalog.read_bytes(), b'{}\n')
        with self.assertRaises(ValueError):
            registrar.checked(registrar.ROOT.parent / 'unexpected-role-output')

    def test_recompute_detects_valid_looking_changed_ring(self):
        path = self.workspace / 'bad.json'
        source = (registrar.ROOT / 'evidence/m2-lip-anchor-intake-v1/uniform-lite-male.json').read_bytes()
        data = json.loads(source)
        data['reference']['neutralCentroid'][1] += .001
        path.write_text(json.dumps(data), encoding='utf-8')
        batch = self.workspace / 'input.json'
        batch.write_text(json.dumps({'schema': 'performer-lip-anchor-intake-v1', 'entries': [
            {'bodyType': 'source-male-cc0-texture-release-v1', 'descriptor': path.name}]}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'differs from the registered body'):
            registrar.prepare(batch)
