import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import register_uniform_glasses as reg


class UniformGlassesRegistration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = tempfile.TemporaryDirectory(dir=reg.ROOT / 'experiments')
        cls.addClassCleanup(scratch.cleanup)
        cls.root = Path(scratch.name) / 'target'
        subprocess.run(['git', 'clone', '-q', '--shared', '--no-checkout', str(reg.ROOT), str(cls.root)], check=True)
        git = ['git', '-C', str(cls.root)]
        subprocess.run([*git, 'sparse-checkout', 'set', '--cone', 'prototype/src'], check=True)
        subprocess.run([*git, 'checkout', '-q', '--detach', reg.REVIEWED_COMMIT], check=True)
        cls.recipe = json.loads(reg.RECIPE.read_bytes())
        def evidence(key):
            return json.loads((reg.ROOT / cls.recipe['reports'][key]['path']).read_bytes())
        def copy(name):
            dest = cls.root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(reg.ROOT / name, dest)
        for name in [reg.ACCESSORIES, reg.CATALOG, 'prototype/public/assets/m1c/studio-glasses-v1.glb']:
            copy(name)
        candidates = json.loads((cls.root / reg.CATALOG).read_bytes())['profiles']
        for row in evidence('intake')['targets']:
            copy('prototype/public' + row['url'])
            candidate = reg.case(candidates, 'bodyType', row['body'])
            copy('prototype/public' + candidate['url'])
        cls.table = cls.root / reg.GLASSES
        cls.old = cls.table.read_bytes()

    def setUp(self):
        self.table.write_bytes(self.old)
        self.recipe_path = self.root / 'changed-recipe.json'

    def rejected(self, recipe, error):
        self.recipe_path.write_bytes(reg.encoded(recipe))
        with self.assertRaises(error):
            reg.register(self.root, self.recipe_path)
        self.assertEqual(self.table.read_bytes(), self.old)
        self.assertFalse((self.table.parent / 'native-accessory-registration.lock').exists())

    def test_real_inputs_and_repeat_after_test_only_edit(self):
        first = reg.register(self.root)
        frozen = self.table.read_bytes()
        self.assertEqual(first['status'], 'technical-fits-registered')
        query_test = self.root / 'prototype/src/character-production-query.test.mjs'
        before_test = query_test.read_bytes()
        try:
            query_test.write_bytes(before_test + b'\n// Updated expected production query.\n')
            self.assertEqual(reg.register(self.root)['status'], 'already-registered')
        finally:
            query_test.write_bytes(before_test)
        self.assertEqual(self.table.read_bytes(), frozen)
        self.assertEqual(json.loads(frozen)['profiles'], json.loads(self.old)['profiles'] + first['profiles'])
        self.assertEqual([r['headDependency'] for r in first['profiles']], [reg.HEAD, reg.HEAD])

    def test_missing_swapped_incomplete_and_modified_evidence(self):
        for failure in ['missing', 'swapped', 'incomplete', 'hash', 'head']:
            with self.subTest(failure=failure):
                r = json.loads(reg.RECIPE.read_bytes())
                reports = r['reports']
                if failure == 'missing':
                    reports['motion']['path'] += '.missing'
                elif failure == 'swapped':
                    reports['before'], reports['after'] = reports['after'], reports['before']
                elif failure == 'incomplete':
                    actual = reg.ROOT / 'evidence/m2-uniform-glasses-head-v1/after-first-diagnostic/report.json'
                    reports['after'] = {'path':actual.relative_to(reg.ROOT).as_posix(), 'sha256':reg.digest(actual.read_bytes())}
                elif failure == 'hash':
                    reports['posed']['sha256'] = '0' * 64
                else:
                    r['headDependency']['hairStyle'] = 'any'
                self.rejected(r, (ValueError, OSError))

    def test_conflicting_fit_or_failed_publish_preserves_entire_table(self):
        manifest = json.loads(self.old)
        candidate = json.loads((self.root / reg.CATALOG).read_bytes())['profiles'][-1]
        manifest['profiles'].append({'body':candidate['bodyType'], 'bodySHA256':candidate['bodySHA256'], 'url':'/conflict'})
        conflict = reg.encoded(manifest)
        self.table.write_bytes(conflict)
        with self.assertRaisesRegex(ValueError, 'Conflicting registration'):
            reg.register(self.root)
        self.assertEqual(self.table.read_bytes(), conflict)
        self.table.write_bytes(self.old)
        with patch('register_native_accessories.os.replace', side_effect=OSError('simulated write failure')):
            with self.assertRaisesRegex(OSError, 'simulated write failure'):
                reg.register(self.root)
        self.assertEqual(self.table.read_bytes(), self.old)

    def test_swapped_actual_fit_and_missing_posed_image(self):
        registry = json.loads((self.root / reg.CATALOG).read_bytes())
        female, male = [r for r in registry['profiles'] if r['bodyType'] in reg.KINDS]
        target = reg.public_path(self.root, female['url'])
        original = target.read_bytes()
        try:
            target.write_bytes(reg.public_path(self.root, male['url']).read_bytes())
            self.rejected(self.recipe, ValueError)
        finally:
            target.write_bytes(original)
        # A byte-identical report without its linked images cannot authorize registration.
        r = json.loads(reg.RECIPE.read_bytes())
        pin = r['reports']['posed']
        incomplete = self.root / 'posed-report.json'
        shutil.copyfile(reg.ROOT / pin['path'], incomplete)
        pin['path'] = incomplete.relative_to(reg.ROOT).as_posix()
        self.rejected(r, FileNotFoundError)

    def test_output_bounds_and_unreviewed_runtime(self):
        for target in (Path(reg.ROOT.anchor), reg.ROOT / '..' / 'missing-external-target'):
            with self.assertRaisesRegex(ValueError, 'inside the production project'):
                reg.register(target)
        module = self.root / 'prototype/src/glasses-head-dependency.js'
        old = module.read_bytes()
        try:
            module.write_bytes(old + b'\n// modified guard\n')
            with self.assertRaisesRegex(ValueError, 'fixed compatibility runtime'):
                reg.register(self.root)
        finally:
            module.write_bytes(old)
        self.assertEqual(self.table.read_bytes(), self.old)

    @unittest.skipUnless(os.name == 'nt', 'Windows directory junction')
    def test_junction_does_not_expand_the_staging_checkout(self):
        fake = self.root.parent / 'junction-checkout'
        fake.mkdir()
        link = fake / 'prototype'
        subprocess.run(['cmd', '/d', '/c', 'mklink', '/J', str(link), str(self.root / 'prototype')],
                       check=True, stdout=subprocess.DEVNULL)
        try:
            with self.assertRaisesRegex(ValueError, 'escapes package'):
                reg.register(fake)
            self.assertEqual(self.table.read_bytes(), self.old)
        finally:
            link.rmdir()


if __name__ == '__main__':
    unittest.main()
