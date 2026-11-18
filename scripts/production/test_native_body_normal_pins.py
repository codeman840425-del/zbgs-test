import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from native_body_normal_pins import ROOT, build, extract_normal


class BodyNormalPinsTest(unittest.TestCase):
    batch = ROOT / 'assets-source/native-parameter-game-packages-v1/import-batch.json'
    source = ROOT / 'assets-source/native-vroid-male-body-texture-fit-v1/normal-source.json'

    def test_factory_input_reproduces_runtime_table(self):
        current = json.loads((ROOT / 'prototype/src/native-body-normal-source-pins.json').read_bytes())
        result = build([self.batch], ROOT, [self.source])
        self.assertEqual(result, current)
        factory_only = build([self.batch], ROOT)['avatars']
        male = result['avatars']['7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81']
        self.assertEqual(male, {
            'material': 8,
            'texture': 12,
            'image': 12,
            'pngSha256': '87c59675bc87f6abd33e719c3c9b117c6d738d9f9bdcb30ee86d110f21c5c6e9',
        })
        self.assertNotIn(male['pngSha256'], [pin['pngSha256'] for pin in factory_only.values()])

    def test_standalone_source_rejects_wrong_pins_and_cross_body_coverage(self):
        pins = json.loads(self.source.read_bytes())
        item = json.loads(self.batch.read_bytes())['items'][0]
        spec = json.loads((ROOT / item['spec']).read_bytes())
        with TemporaryDirectory(dir=ROOT / 'experiments') as tmp:
            source = Path(tmp) / 'normal-source.json'
            for key in ('body', 'coverage'):
                with self.subTest(key=key):
                    source.write_text(json.dumps({**pins, key:[pins[key][0], '0' * 64]}), encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, 'file identity mismatch'):
                        build([], ROOT, [source])
            source.write_text(json.dumps({**pins, 'coverage':spec['files']['manifest.json']}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'coverage/body mismatch'):
                build([], ROOT, [source])

    def test_wrong_body_does_not_publish_any_bindings(self):
        items = json.loads(self.batch.read_bytes())['items']
        wrong = {**items[1], 'spec':items[0]['spec']}
        with TemporaryDirectory(dir=ROOT / 'experiments') as tmp:
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
