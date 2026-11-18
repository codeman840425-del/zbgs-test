import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from native_body_normal_pins import ROOT, build, extract_normal


class BodyNormalPinsTest(unittest.TestCase):
    batch = ROOT / 'assets-source/native-parameter-game-packages-v1/import-batch.json'

    def test_factory_input_reproduces_runtime_table(self):
        current = json.loads((ROOT / 'prototype/src/native-body-normal-source-pins.json').read_bytes())
        self.assertEqual(build([self.batch], ROOT), current)

    def test_wrong_body_does_not_publish_any_bindings(self):
        items = json.loads(self.batch.read_bytes())['items']
        wrong = {**items[1], 'spec':items[0]['spec']}
        with TemporaryDirectory() as tmp:
            batch = Path(tmp) / 'batch.json'
            batch.write_text(json.dumps({'schema':'native-factory-import-batch-v1','items':[items[0],wrong]}))
            with self.assertRaisesRegex(ValueError,'Body specification mismatch'):
                build([batch],ROOT)

    def test_missing_exact_material_rejected(self):
        item = json.loads(self.batch.read_bytes())['items'][0]
        spec = json.loads((ROOT / item['spec']).read_bytes())
        body = (ROOT / spec['files'][spec['bodyFile']][0]).read_bytes()
        with self.assertRaisesRegex(ValueError,'one exact coverage material'):
            extract_normal(body,{'materialName':'not-a-body-material'})
