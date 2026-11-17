"""Real package tests: isolation, identity rejection, no overwrite, retry, bind gate."""
import copy
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest
import native_import as imp


class ImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = json.loads((imp.ROOT / 'scripts/production/native-import/batch.json').read_text())
        cls.face = json.loads((imp.ROOT / cls.batch['items'][0]['spec']).read_text())
        (imp.ROOT / 'output').mkdir(exist_ok=True)

    def test_existing_live_packages_remain_byte_identical(self):
        for row in self.batch['items']:
            spec = json.loads((imp.ROOT / row['spec']).read_text())
            files = imp.prepare(spec, imp.ROOT)
            live = imp.ROOT / 'prototype/public/assets' / row['package']
            for name, data in files.items():
                self.assertEqual((live / name).read_bytes(), data, name)

    def test_missing_and_wrong_body_rejected(self):
        broken = copy.deepcopy(self.face)
        del broken['files'][broken['bodyFile']]
        with self.assertRaisesRegex(ValueError, 'Missing explicit body'):
            imp.prepare(broken, imp.ROOT)
        waist = json.loads((imp.ROOT / self.batch['items'][1]['spec']).read_text())
        broken = copy.deepcopy(self.face)
        broken['files'][broken['bodyFile']] = waist['files'][waist['bodyFile']]
        with self.assertRaisesRegex(ValueError, 'Body file pin'):
            imp.prepare(broken, imp.ROOT)

    def test_failure_does_not_block_sibling_and_retry_is_exact(self):
        with tempfile.TemporaryDirectory(dir=imp.ROOT / 'output', prefix='native-import-test-') as tmp:
            root = Path(tmp)
            bad = copy.deepcopy(self.face)
            bad['bodySha256'] = '0' * 64
            bad_path = root / 'bad.json'
            bad_path.write_text(json.dumps(bad))
            batch = copy.deepcopy(self.batch)
            batch['items'][0]['spec'] = bad_path.relative_to(imp.ROOT).as_posix()
            output = root / 'packages'
            first = imp.execute(batch, imp.ROOT, output)
            self.assertEqual([r['state'] for r in first['items']], ['failed', 'prepared'])
            self.assertFalse((output / batch['items'][0]['package']).exists())
            second = imp.execute(self.batch, imp.ROOT, output)
            self.assertEqual([r['state'] for r in second['items']], ['prepared', 'reused-identical'])
            self.assertTrue(second['passed'])
            dest = output / self.batch['items'][0]['package'] / 'manifest.json'
            dest.write_text('wrong previous package')
            third = imp.execute(self.batch, imp.ROOT, output)
            self.assertEqual([r['state'] for r in third['items']], ['failed', 'reused-identical'])
            self.assertEqual(dest.read_text(), 'wrong previous package')

    def test_binding_failure_publishes_no_partial_package(self):
        with tempfile.TemporaryDirectory(dir=imp.ROOT / 'output', prefix='native-import-test-') as tmp:
            batch = copy.deepcopy(self.batch)
            batch['items'] = batch['items'][:1]
            with patch.object(imp, 'bindings', side_effect=ValueError('simulated bind failure')):
                report = imp.execute(batch, imp.ROOT, Path(tmp) / 'packages')
            self.assertFalse(report['passed'])
            self.assertEqual(list((Path(tmp) / 'packages').iterdir()), [])

    def test_real_inverse_binding_corruption_rejected(self):
        with tempfile.TemporaryDirectory(dir=imp.ROOT / 'output', prefix='native-import-test-') as tmp:
            folder = Path(tmp)
            files = imp.prepare(self.face, imp.ROOT)
            equipment = json.loads(files['equipment.json'])
            equipment['items'][0]['bindings'][0]['inverseBindMatrix'][12] += 0.02
            files['equipment.json'] = json.dumps(equipment).encode()
            for name, data in files.items():
                target = folder / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'inverse bind mismatch'):
                imp.bindings(folder, self.face)

    def test_unreferenced_file_cannot_enter_package(self):
        broken = copy.deepcopy(self.face)
        broken['files']['extra.vrm'] = broken['files'][broken['bodyFile']]
        with self.assertRaisesRegex(ValueError, 'package closure'):
            imp.prepare(broken, imp.ROOT)

    def test_duplicate_and_escaping_paths_rejected(self):
        batch = copy.deepcopy(self.batch)
        batch['items'].append(batch['items'][0])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            imp.execute(batch, imp.ROOT, imp.ROOT / 'output/unused-import-test')
        for path in ('../outside', 'C:/outside', 'dir/../../outside', 'dir\\file', '/outside'):
            with self.assertRaises(ValueError):
                imp.confined(imp.ROOT, path)


if __name__ == '__main__':
    unittest.main(verbosity=2)
