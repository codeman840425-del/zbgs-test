"""Exercise the real received bodies, the production planner, and request output boundaries."""
import json
from pathlib import Path
from shutil import copyfile
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from flow import ROOT
from production_paths import project_output


SCRIPT = ROOT / 'scripts/production/received_outfit_request.py'
PLANNER = ROOT / 'scripts/production/variant_batch.py'
BASE = Path('output/m2-first-rule-delivery-v1/request')
RECIPE = Path('assets-source/rule-body-recipe-v1')
RECEIPT = Path('evidence/m2-first-rule-delivery-v1/fit')
PAIRS = [part for label in ('candidate', 'control')
         for part in ('--pair', RECIPE / (label + '.json'), RECEIPT / (label + '.json'))]
CATALOG = Path('prototype/src/source-outfit-profiles.json')
PUBLIC = Path('prototype/public')


class ReceivedOutfitRequestTest(unittest.TestCase):
    def setUp(self):
        parent = project_output(ROOT / BASE, SCRIPT)
        parent.mkdir(parents=True, exist_ok=True)
        self.scratch = Path(self.enterContext(TemporaryDirectory(dir=parent)))
        self.package = self.scratch / 'inputs'

    def cli(self, *args, cwd=ROOT):
        return subprocess.run([sys.executable, '-B', str(SCRIPT), *map(str, args)], cwd=cwd,
                              capture_output=True, text=True, encoding='utf-8', check=False)

    def plan(self, output, request=None, diagnostic=True):
        result = subprocess.run([sys.executable, '-B', str(PLANNER), str(self.package / 'matrix.json'),
                                 str(request or self.package / 'request.json'), '--root', str(ROOT),
                                 '--output', str(output), *(['--diagnostic'] if diagnostic else [])], cwd=ROOT,
                                capture_output=True, text=True, encoding='utf-8', check=False)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return json.loads(result.stdout)

    def test_formal_and_technical_with_isolated_cross_body_rejection(self):
        result = self.cli(*PAIRS, '--output', self.package)
        self.assertEqual(result.returncode, 0, result.stderr)
        accepted = self.plan(self.scratch / 'technical')
        self.assertEqual((accepted['candidateCount'], accepted['acceptedCount']), (2, 0))
        blocked = self.plan(self.scratch / 'formal', diagnostic=False)
        self.assertEqual((blocked['rejectedCount'], blocked['creationBatches']), (2, []))
        self.assertTrue(all('Whole-outfit runtime admission evidence' in item['reason'] for item in blocked['items']))
        good = json.loads((self.package / 'request.json').read_bytes())
        good['items'][0]['outfit']['equipment'][0] = good['items'][1]['outfit']['equipment'][0]
        wrong = self.scratch / 'wrong-body-equipment.json'
        wrong.write_text(json.dumps(good, ensure_ascii=False), encoding='utf-8')
        rejected = self.plan(self.scratch / 'wrong-body', request=wrong)
        self.assertEqual((rejected['candidateCount'], rejected['rejectedCount']), (1, 1))
        self.assertEqual(rejected['items'][0]['reason'], 'No configured outfit contains all requested exact equipment on this body')
        self.assertEqual(rejected['creationBatches'][0]['ids'], [good['items'][1]['stableId']])

    def test_mismatched_recipe_rejects_then_retries_from_another_checkout(self):
        bad = self.cli('--pair', RECIPE / 'control.json', RECEIPT / 'candidate.json', '--output', self.package)
        self.assertEqual(bad.returncode, 1)
        self.assertIn('Recipe differs from received identity', bad.stderr)
        self.assertFalse(self.package.exists())
        self.assertEqual(list(self.scratch.iterdir()), [])
        # An independent checkout is the invocation directory, the tool still owns the output root.
        subprocess.run(['git', 'init', '--quiet', str(self.scratch / 'checkout')], check=True, cwd=ROOT)
        relative = self.package.relative_to(ROOT)
        first = self.cli(*PAIRS, '--output', relative, cwd=self.scratch / 'checkout')
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(json.loads(first.stdout)['status'], 'prepared')
        before = {path: path.read_bytes() for path in self.package.rglob('*.json')}
        retry = self.cli(*PAIRS, '--output', relative, cwd=ROOT.anchor)
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(json.loads(retry.stdout)['status'], 'reused-identical')
        self.assertTrue(all(path.read_bytes() == original for path, original in before.items()))
        self.assertEqual(list(self.scratch.glob('.received-outfit-*')), [])

    def test_import_preflights_both_models_before_registering_and_reuses_outputs(self):
        target = self.scratch / 'isolated-data'
        catalog = json.loads((ROOT / CATALOG).read_bytes())
        source_profile = catalog['source-male-cc0-texture-release-v1']
        source_manifest = json.loads((ROOT / PUBLIC / source_profile['manifestUrl'].lstrip('/')).read_bytes())
        wanted = {source_profile['ids'][part] for part in ('topFar', 'pants', 'shoes')}
        for row in source_manifest['items']:
            if row['id'] in wanted:
                filename = PUBLIC / row['url'].lstrip('/')
                (target / filename).parent.mkdir(parents=True, exist_ok=True)
                copyfile(ROOT / filename, target / filename)
        result_catalog = target / CATALOG
        result_catalog.parent.mkdir(parents=True)
        result_catalog.write_text(json.dumps({source_profile['id']: source_profile}), encoding='utf-8')
        initial_catalog = result_catalog.read_bytes()
        options = ('--target-root', target, '--output', 'request')
        imports = []
        profiles = []
        for label in ('candidate', 'control'):
            proof = json.loads((ROOT / RECEIPT / (label + '.json')).read_bytes())
            body_id = proof['bodyType']
            profiles.append(body_id)
            imports += ['--import', RECIPE / (label + '.json'), ROOT / PUBLIC / 'assets' / body_id / 'body.vrm']
        cwd = ROOT.anchor if sys.platform == 'win32' else ROOT
        bad = self.cli(*imports[:-1], imports[2], *options, cwd=cwd)
        self.assertEqual(bad.returncode, 1)
        self.assertIn('Candidate differs from independent recipe replay', bad.stderr)
        self.assertEqual(result_catalog.read_bytes(), initial_catalog)
        self.assertFalse((target / 'request').exists())
        self.assertTrue(all(not (target / PUBLIC / 'assets' / body_id).exists() for body_id in profiles))

        good = self.cli(*imports, *options, cwd=cwd)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(json.loads(good.stdout), {'status': 'prepared', 'bodyTypes': profiles})
        self.assertEqual(set(json.loads(result_catalog.read_bytes())), {source_profile['id'], *profiles})
        for label, body_id in zip(('candidate', 'control'), profiles, strict=True):
            received = (target / 'request/fits' / (body_id + '.json')).read_bytes()
            self.assertEqual(received, (ROOT / RECEIPT / (label + '.json')).read_bytes())
        before = {file: file.read_bytes() for file in (target / 'request').rglob('*.json')}
        before[result_catalog] = result_catalog.read_bytes()
        retry = self.cli(*imports, *options, cwd=cwd)
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(json.loads(retry.stdout), {'status': 'reused-identical', 'bodyTypes': profiles})
        self.assertTrue(all(file.read_bytes() == saved for file, saved in before.items()))
        self.assertEqual(list(target.glob('.received-outfit-*')), [])
        self.assertEqual(list((target / 'prototype').glob('.texture-install-*')), [])

    @unittest.skipUnless(sys.platform == 'win32', 'Windows drive-root and junction checks')
    def test_drive_root_parent_traversal_and_junction(self):
        drive = Path(ROOT.anchor)
        sentinel = 'm2-received-outfit-outside-' + uuid4().hex
        junction = self.scratch / 'outside'
        subprocess.run(['cmd', '/d', '/c', 'mklink', '/j', str(junction), str(drive)],
                       cwd=ROOT, capture_output=True, check=True)
        try:
            self.assertTrue(junction.is_junction())
            for output in (drive / sentinel, Path('..') / sentinel, junction / sentinel):
                with self.subTest(output=output):
                    result = self.cli(*PAIRS, '--output', output, cwd=drive)
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('inside the production tool main checkout', result.stderr)
                    self.assertFalse((drive / sentinel).exists())
                    imported = self.cli('--import', 'unread-recipe.json', 'unread-vrm.vrm',
                                        '--target-root', output, '--output', 'request', cwd=drive)
                    self.assertEqual(imported.returncode, 1)
                    self.assertIn('inside the production tool main checkout', imported.stderr)
        finally:
            if junction.is_junction():
                junction.rmdir()


if __name__ == '__main__':
    unittest.main()
