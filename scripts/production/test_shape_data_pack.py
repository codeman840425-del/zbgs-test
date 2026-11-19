"""Independent package reconstruction, disk boundary and retry checks on real VRM data."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.dont_write_bytecode = True
import shape_data_pack as pack
from flow import ROOT, read_json
from production_paths import project_output


SOURCE = ROOT / 'assets-source/rule-body-recipe-v1'
STAGE = ROOT / 'output/m2-first-rule-delivery-v1/data-pack'


class DataPackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        project_output(STAGE, __file__).mkdir(parents=True, exist_ok=True)
        cls.recipe = read_json(SOURCE / 'candidate.json')
        cls.body, _ = pack.generate(cls.recipe)
        cls.files = pack.assemble(cls.recipe, cls.body)

    def test_only_frozen_parent_inputs_needed(self):
        with TemporaryDirectory(dir=STAGE) as tmp:
            workspace = Path(tmp)
            source = project_output(workspace / 'frozen-authoring', __file__)
            source.mkdir()
            subprocess.run(['git', 'init', '-q', str(source)], check=True, env=dict(os.environ, TMP=tmp, TEMP=tmp))
            contract = read_json(pack.CONTRACTS)['templates'][self.recipe['template']['sha256']]
            template = read_json(ROOT / self.recipe['template']['path'])
            fit = json.loads(self.files['fit.json'])
            paths = {row['path'] for row in fit['inputs']}
            paths.update([self.recipe['template']['path'], template['shapeEndpoint']['path'],
                          template['sourceBody']['path'], template['provenance']['path']])
            for name in paths:
                dest = project_output(source / name, __file__)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, dest)
            catalog = project_output(source / 'prototype/src/source-outfit-profiles.json', __file__)
            catalog.parent.mkdir(parents=True)
            parent = contract['parent']
            reference = pack.json_bytes({parent: read_json(ROOT / catalog.relative_to(source))[parent]})
            catalog.write_bytes(reference)
            first = pack.build(self.recipe, self.body, workspace / 'one', source)
            second = pack.build(dict(reversed(self.recipe.items())), self.body, workspace / 'two', source)
            self.assertEqual(first, second)
            self.assertEqual(first, pack.verify(workspace / 'two', first['indexSha256'], source))
            self.assertEqual(catalog.read_bytes(), reference)
            self.assertFalse((source / 'prototype/public/assets' / first['bodyType']).exists())
            self.assertEqual({p.relative_to(source).as_posix() for p in (source / 'prototype').rglob('*')
                              if p.is_file()}, {p for p in paths if p.startswith('prototype/')} | {catalog.relative_to(source).as_posix()})

    def test_rejects_rehashed_fit_or_profile_extra_files_and_wrong_body(self):
        with TemporaryDirectory(dir=STAGE) as tmp:
            out = Path(tmp) / 'package'
            with self.assertRaisesRegex(ValueError, 'independent recipe replay'):
                pack.build(self.recipe, self.body[:-1], out)
            self.assertFalse(out.exists())
            result = pack.build(self.recipe, self.body, out)
            with self.assertRaisesRegex(ValueError, 'External index digest differs'):
                pack.verify(out, '0'*64)
            for name, field, value in [('fit.json', 'scope', 'approved'), ('profile.json', 'url', 'https://example.invalid/other.vrm')]:
                bad = dict(json.loads(self.files[name]), **{field:value})
                raw = pack.json_bytes(bad)
                pin = pack.payload_pin(name, raw)
                idx = json.loads(self.files['index.json'])
                idx[Path(name).stem] = pin
                idx['files'] = [pin if row['path'] == name else row for row in idx['files']]
                (out / name).write_bytes(raw)
                (out / 'index.json').write_bytes(pack.json_bytes(idx))
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Content differs'):
                    pack.verify(out, pack.digest(pack.json_bytes(idx)))
                (out / name).write_bytes(self.files[name])
                (out / 'index.json').write_bytes(self.files['index.json'])
            extra = out / 'runtime.js'
            extra.write_text('unrequested', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Unexpected payload'):
                pack.verify(out)
            extra.unlink()
            garment_name = next(k for k in self.files if k.endswith('.glb'))
            garment = out / garment_name
            garment.unlink()
            with self.assertRaisesRegex(ValueError, 'Missing package payload'):
                pack.verify(out)
            garment.write_bytes(self.files[garment_name])
            self.assertEqual(pack.verify(out), result)

    def test_failed_publication_retry_and_bounds(self):
        with TemporaryDirectory(dir=STAGE) as tmp:
            work = Path(tmp)
            out = work / 'package'
            with patch.object(pack, 'publish_new_directory', side_effect=OSError('unavailable')):
                with self.assertRaisesRegex(OSError, 'unavailable'):
                    pack.build(self.recipe, self.body, out)
            self.assertEqual(list(work.iterdir()), [])
            self.assertEqual(pack.build(self.recipe, self.body, out), pack.build(self.recipe, self.body, out))
            marker = 'pack-' + uuid4().hex
            for unsafe in (ROOT / 'prototype/src' / marker, Path(ROOT.anchor) / marker,
                           work / '..' / marker, ROOT / 'output'):
                with self.subTest(path=unsafe), self.assertRaises(ValueError):
                    pack.destination(unsafe)
            if os.name == 'nt':
                junction = work / 'junction'
                subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(Path(ROOT.anchor))],
                               check=True, capture_output=True, env=dict(os.environ, TMP=tmp, TEMP=tmp))
                try:
                    with self.assertRaises(ValueError):
                        pack.build(self.recipe, self.body, junction / marker)
                finally:
                    junction.rmdir()
            self.assertFalse((Path(ROOT.anchor) / marker).exists())


if __name__ == '__main__':
    unittest.main()
