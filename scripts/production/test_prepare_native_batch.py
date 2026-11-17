import json
from pathlib import Path
import shutil
import tempfile
import unittest

from prepare_native_batch import COMMON, ROOT, prepare


class NativeBatchPreparationTests(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name).resolve()
        self.authoring = self.root / 'authoring'
        shutil.copytree(ROOT / 'assets-source/native-parameter-batch-v2', self.authoring)
        self.result = self.authoring / 'result.json'
        self.recipe = self.authoring / 'batch.json'
        self.output = self.root / 'prepared'
        original = json.loads((ROOT / 'scripts/production/native-body-package-v1.json').read_bytes())
        self.config = self.root / 'shared.json'
        self.write(self.config, {key: original[key] for key in ('schema', *COMMON)})
        batch = json.loads(self.recipe.read_bytes())
        references = [original[key] for key in COMMON]
        references.extend(ref for param in batch['parameters'] for ref in param['observations'])
        for relative in {ref['path'] for ref in references}:
            destination = self.root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)

    def write(self, path, value):
        path.write_text(json.dumps(value), encoding='utf-8')

    def test_enumerates_authoring_results_without_manual_item_pins(self):
        report = prepare(self.result, self.config, self.output, self.root)
        self.assertTrue(report['passed'], report)
        config = json.loads((self.output / 'config.json').read_bytes())
        items = config['items']
        exported = json.loads(self.result.read_bytes())['items']
        self.assertEqual([item['id'] for item in items], [item['id'] for item in exported])
        for item, source in zip(items, exported, strict=True):
            self.assertEqual(item['candidate']['sha256'], source['exported']['sha256'])
            self.assertEqual(item['label'], item['id'])
        with self.assertRaises(FileExistsError):
            prepare(self.result, self.config, self.output, self.root)

    def test_failed_native_item_is_explicit_and_prevents_ready_config(self):
        report = json.loads(self.result.read_bytes())
        report['passed'] = False
        report['items'][1].update(state='failed', reason='Native export failed')
        self.write(self.result, report)
        prepared = prepare(self.result, self.config, self.output, self.root)
        self.assertFalse(prepared['passed'])
        self.assertEqual([row['state'] for row in prepared['items']], ['prepared', 'failed'])
        self.assertEqual(prepared['items'][1]['reason'], 'Native export failed')
        self.assertFalse((self.output / 'config.json').exists())

    def test_edited_export_receipt_is_rejected_even_when_result_says_passed(self):
        capture = next((self.authoring / 'calls').glob('0020-vroid_export_vrm.response.json'))
        record = json.loads(capture.read_bytes())
        content = next(call['result']['content'] for call in record['responses'] if call.get('id') == 2)
        result = json.loads(content[0]['text'])
        result['settings']['materialMode'] = 1
        content[0]['text'] = json.dumps(result)
        self.write(capture, record)
        prepared = prepare(self.result, self.config, self.output, self.root)
        self.assertFalse(prepared['passed'])
        self.assertIn('Native export settings', prepared['items'][0]['reason'])
        self.assertEqual(prepared['items'][1]['state'], 'prepared')
        self.assertFalse((self.output / 'config.json').exists())


if __name__ == '__main__':
    unittest.main()
