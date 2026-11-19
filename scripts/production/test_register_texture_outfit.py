import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import register_texture_outfit as register
from test_diagnostic_output_paths import link_directory


class TextureRegistrationTests(unittest.TestCase):
    def setUp(self):
        scratch = register.checked(register.ROOT / 'experiments')
        self.scratch = Path(self.enterContext(tempfile.TemporaryDirectory(dir=scratch)))
        self.project = self.scratch / 'tool'
        subprocess.run(['git', 'init', '-q', str(self.project)], check=True)
        script = self.project / 'register.py'
        script.touch()
        self.enterContext(patch.object(register, '__file__', script))
        self.public = self.project / 'prototype/public'
        self.catalog = self.project / register.CATALOG
        self.catalog.parent.mkdir(parents=True)
        self.seed = b'{\n  "earlier": {"id":"earlier"}\n}\n'
        self.catalog.write_bytes(self.seed)
        for stage in register.STAGES.values():
            rows = json.loads((stage / 'equipment.json').read_bytes())['items']
            for row in rows:
                relative = row['url'].lstrip('/')
                target = self.public / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(register.ROOT / 'prototype/public' / relative, target)

    def test_real_producers_install_both_then_check_and_repeat(self):
        deployed = (register.ROOT / register.CATALOG).read_bytes()
        previous = self.seed
        for group, producer in register.PRODUCERS.items():
            first = register.register(group, root=self.project)
            self.assertEqual(first, register.register(group, root=self.project, check=True))
            self.assertEqual(first, register.register(group, root=self.project))
            current = self.catalog.read_bytes()
            generated = json.loads(current)[producer.PROFILE_ID]
            self.assertEqual(register.next_catalog(deployed, generated), deployed,
                             'A shoe extension must not modify the registered producer profile')
            self.assertTrue(current.startswith(previous.rstrip()[:-1].rstrip() + b',\n'))
            previous = current
            self.assertEqual(first['bodyType'], producer.PROFILE_ID)
            package = self.public / producer.ASSET_URL.lstrip('/')
            self.assertEqual(sorted(p.name for p in package.iterdir()), first['runtimeFiles'])
            for name in first['runtimeFiles']:
                self.assertEqual((package / name).read_bytes(), (register.STAGES[group] / name).read_bytes())
        self.assertEqual(len(list((self.project / 'output/texture-outfit-locks').glob('*.lock'))), 1)

    def test_conflicting_id_or_missing_staged_menu_and_mask_rejected(self):
        group, producer = 'female', register.female
        corrupt = register.json_bytes({producer.PROFILE_ID: {'id': producer.PROFILE_ID}})
        self.catalog.write_bytes(corrupt)
        with self.assertRaisesRegex(ValueError, 'different production data'):
            register.register(group, root=self.project)
        self.assertEqual(self.catalog.read_bytes(), corrupt)
        self.assertFalse((self.public / producer.ASSET_URL.lstrip('/')).exists())
        stage = self.project / 'stage'
        shutil.copytree(register.STAGES[group], stage)
        saved = (stage / 'profile.json').read_bytes()
        profile = json.loads(saved)
        del profile[producer.PROFILE_ID]['workbenchLabel']
        (stage / 'profile.json').write_bytes(register.json_bytes(profile))
        with self.assertRaisesRegex(ValueError, 'Missing generated profile fields: workbenchLabel'):
            register.register(group, root=self.project, stage=stage)
        (stage / 'profile.json').write_bytes(saved)
        (stage / 'coverage-top-1k.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing producer file: coverage-top-1k.json'):
            register.register(group, root=self.project, stage=stage)
        self.assertEqual(self.catalog.read_bytes(), corrupt)

    def test_catalog_failure_leaves_only_a_complete_retryable_package(self):
        with patch.object(register.os, 'replace', side_effect=PermissionError('busy')):
            with self.assertRaisesRegex(PermissionError, 'busy'):
                register.register('male', root=self.project)
        package = self.public / register.male.ASSET_URL.lstrip('/')
        self.assertEqual(self.catalog.read_bytes(), self.seed)
        self.assertEqual(sorted(p.name for p in package.iterdir()), sorted(register.RUNTIME_FILES['male']))
        result = register.register('male', root=self.project)
        self.assertEqual(result, register.register('male', root=self.project, check=True))

    def test_escapes_and_junction_rejected_before_missing_inputs(self):
        outside = self.scratch / 'other'
        outside.mkdir()
        redirect = self.project / 'redirect'
        link_directory(redirect, outside)
        for root in [Path(self.project.anchor), outside, self.project / '../other', redirect]:
            with self.subTest(out=root), self.assertRaisesRegex(ValueError, 'main checkout'):
                register.register('female', root=root, stage=self.scratch / 'missing')
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
