import json
from pathlib import Path
import shutil
import tempfile
import unittest

from stage_glasses_preview import ASSETS, CATALOG, ROOT, install


class PreviewStagingTests(unittest.TestCase):
    def test_intact_retry_and_partial_input_failure(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'experiments') as tmp:
            root = Path(tmp)
            source = root / 'source'
            shutil.copytree(ASSETS / 'generated', source)
            path = root / CATALOG
            path.parent.mkdir(parents=True)
            registry = json.loads((ROOT / CATALOG).read_bytes())
            rows = json.loads((source / 'provenance.json').read_bytes())['candidates']
            body_shas = {row['targetSha256'] for row in rows}
            registry['profiles'] = [old for old in registry['profiles'] if old['bodySHA256'] not in body_shas]
            before = json.dumps(registry).encode()
            path.write_bytes(before)
            second = source / rows[1]['file']
            original = second.read_bytes()
            second.write_bytes(original + b' ')
            with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
                install(source, root)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(path.parent.iterdir()), [path])
            second.write_bytes(original)
            self.assertEqual(len(install(source, root)), 3)
            self.assertEqual(install(source, root), [])
            saved = json.loads(path.read_bytes())
            self.assertEqual(saved['profiles'][:-2], registry['profiles'])
            for entry, row in zip(saved['profiles'][-2:], rows, strict=True):
                self.assertEqual(entry['bodySHA256'], row['targetSha256'])
                self.assertEqual((root / 'prototype/public' / entry['url'][1:]).read_bytes(),
                                 (source / row['file']).read_bytes())
            self.assertFalse((root / 'prototype/src/glasses-temple-fit-manifest.json').exists())
