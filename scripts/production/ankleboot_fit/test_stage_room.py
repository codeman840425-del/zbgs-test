import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import stage_room as stage


WORKSPACE = Path(__file__).resolve().parents[3]
RECIPE = json.loads((WORKSPACE / stage.DEFAULT_RECIPE).read_bytes())
CASE = json.loads((WORKSPACE / RECIPE['roomCase']['path']).read_bytes())
TARGET = 'prototype/public/assets/' + RECIPE['output']['directory']
ASSET, CATALOG = TARGET + '/' + CASE['id'] + '.glb', TARGET + '/equipment.json'
# Exact Git blob SHA256 pins from 2deb189b, independent of the test checkout.
ORIGINAL_FILES = {ASSET: '7151301ade15e62870524f670de5b7b5d017e3bbeb60dc93aff2a90167381f53',
                  CATALOG: '4b092f194f3252577e6e2645357f6a6bb5c98fa04f522e0a1875bdf29b84dcf1',
                  stage.PROFILES: '09e9885fbc1ff6d7d12933abae6956267767dd1bdff7d67ba5a97898cd77fdec'}


class StageRoomTests(unittest.TestCase):
    def setUp(self):
        parent = stage.project_output(WORKSPACE / 'output', __file__)
        if parent != WORKSPACE / 'output':
            raise ValueError('Redirected test fixture parent')
        parent.mkdir(exist_ok=True)
        sandbox = TemporaryDirectory(dir=parent, prefix='ankleboot-stage-test-')
        self.addCleanup(sandbox.cleanup)
        self.sandbox = Path(sandbox.name).resolve()
        self.main = self.sandbox / 'main'
        self.main.mkdir()
        self.tool = self.main / 'scripts/production/ankleboot_fit/stage_room.py'
        self.tool.parent.mkdir(parents=True)
        self.home = self.main / 'experiments/worktrees'
        self.home.mkdir(parents=True)
        profile = json.loads((WORKSPACE / stage.PROFILES).read_bytes())[stage.BODY]
        catalog_path = 'prototype/public' + profile['manifestUrl']
        catalog = json.loads((WORKSPACE / catalog_path).read_bytes())
        equipment_ids = {stage.FLAT, stage.PANTS, stage.TOP}
        for name in (stage.PROFILES, 'prototype/public' + profile['url'], catalog_path,
                     *('prototype/public' + item['url'] for item in catalog['items'] if item['id'] in equipment_ids)):
            self.copy(name)
        for name in (stage.DEFAULT_RECIPE, stage.AUTHOR,
                     *(RECIPE[key]['path'] for key in ('roomCase', 'asset', 'fitReport', 'readback'))):
            self.copy(name)
        self.git('init', '-q')
        self.git('config', 'core.autocrlf', 'false')
        self.commit()
        self.checkout = self.make_worktree('diagnostic')

    def copy(self, name):
        target = self.main / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(WORKSPACE / name, target)

    def git(self, *args, cwd=None):
        return subprocess.check_output(['git', *args], cwd=cwd or self.main, stderr=subprocess.PIPE)

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
        self.head = self.git('rev-parse', 'HEAD').decode().strip()

    def make_worktree(self, name):
        checkout = self.home / name
        self.git('worktree', 'add', '--detach', str(checkout), self.head)
        return checkout

    def run_stage(self, checkout=None, revision=None, recipe=None):
        with patch.object(stage, '__file__', str(self.tool)):
            return stage.run(checkout or self.checkout, revision or self.head, recipe)

    def test_stage_only_three_files_and_verify_exact_rerun(self):
        initial = (self.checkout / stage.PROFILES).read_bytes()
        result = self.run_stage()
        self.assertEqual(result['sourceCommit'], self.head)
        self.assertEqual(result['changed'], [ASSET, CATALOG, stage.PROFILES])
        self.assertEqual(result['files'], ORIGINAL_FILES)
        self.assertEqual(result['status'], 'diagnostic-only')
        final = json.loads((self.checkout / stage.PROFILES).read_bytes())
        body = final[stage.BODY]
        outfit = body['extraOutfits'].pop()
        self.assertEqual((outfit['index'], outfit['role'], outfit['equipmentRoles']),
                         (3, CASE['role'], ['topFar', 'ankleBoot', 'pants']))
        self.assertEqual(body['ids'].pop('ankleBoot'), CASE['id'])
        self.assertEqual(body['additionalEquipmentManifests'].pop(), {
            'url': '/assets/ankle-boot-fit-v1/equipment.json', 'sha256': result['files'][CATALOG]})
        self.assertEqual(final, json.loads(initial))
        data = json.loads((self.checkout / CATALOG).read_bytes())
        self.assertEqual(data['schema'], 'zbgs-equipment-v1')
        item, = data['items']
        self.assertEqual((item['id'], item['slot'], item['sha256'], item['compatibleAvatarSha256']),
                         (CASE['id'], 'shoes', CASE['sha256'], stage.BODY_SHA))
        self.assertEqual(item['sourceLicense']['author'], 'MargaretToigo')
        self.assertEqual(len(item['bindings']), 6)
        timestamps = {}
        for name, pin in result['files'].items():
            path = self.checkout / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), pin)
            timestamps[name] = path.stat().st_mtime_ns
        self.assertEqual(self.run_stage()['changed'], [])
        self.assertTrue(all((self.checkout / name).stat().st_mtime_ns == stamp for name, stamp in timestamps.items()))
        self.assertEqual((self.main / stage.PROFILES).read_bytes(), initial)
        self.assertFalse((self.main / TARGET).exists())
        self.assertEqual(self.git('rev-parse', 'HEAD', cwd=self.checkout).decode().strip(), self.head)

    def test_reject_other_worktrees_paths_and_output_link(self):
        foreign = self.home / 'foreign'
        self.git('init', '-q', str(foreign))
        outside = self.sandbox / 'outside'
        outside.mkdir()
        for checkout, reason in ((foreign, 'registered to this project'), (self.main, 'inside the production tool main checkout'),
                                 (outside, 'inside the production tool main checkout'),
                                 (Path(self.main.anchor), 'inside the production tool main checkout')):
            with self.subTest(checkout=checkout), self.assertRaisesRegex(ValueError, reason):
                self.run_stage(checkout)
        target = self.checkout / TARGET
        if os.name == 'nt':
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(target), str(outside)],
                           check=True, capture_output=True)
        else:
            target.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'inside the production tool main checkout'):
            self.run_stage()
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual((self.checkout / stage.PROFILES).read_bytes(), (self.main / stage.PROFILES).read_bytes())

    def test_reject_unrelated_existing_changes_and_wrong_pinned_body(self):
        other = self.checkout / 'unrelated.txt'
        other.write_text('do not change', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'unrelated or staged changes'):
            self.run_stage()
        self.assertFalse((self.checkout / TARGET).exists())
        other.unlink()
        conflict = self.checkout / CATALOG
        conflict.parent.mkdir()
        conflict.write_bytes(b'{"previous":true}\n')
        with self.assertRaisesRegex(ValueError, 'Existing diagnostic destination differs'):
            self.run_stage()
        self.assertEqual(conflict.read_bytes(), b'{"previous":true}\n')
        self.assertFalse((self.checkout / ASSET).exists())
        path = self.main / 'prototype/public/assets/cc0-body-release-v1/body.vrm'
        with path.open('ab') as stream:
            stream.write(b'wrong body')
        self.commit()
        wrong = self.make_worktree('wrong-body')
        with self.assertRaisesRegex(ValueError, 'SHA mismatch: .*body.vrm'):
            self.run_stage(wrong)
        self.assertFalse((wrong / TARGET).exists())

    def test_rehashing_a_false_cuff_receipt_cannot_install(self):
        evidence = self.main / RECIPE['readback']['path']
        cuff = json.loads(evidence.read_bytes())
        cuff['cuffs']['left']['boundary']['bareShin']['outsideLayerOrder'] = 0
        evidence.write_bytes(stage.encoded(cuff))
        recipe = json.loads((self.main / stage.DEFAULT_RECIPE).read_bytes())
        recipe['readback']['sha256'] = hashlib.sha256(evidence.read_bytes()).hexdigest()
        config = self.main / stage.DEFAULT_RECIPE
        config.write_bytes(stage.encoded(recipe))
        with self.assertRaisesRegex(ValueError, 'Cuff readback does not match measured'):
            self.run_stage(recipe=config)
        self.assertFalse((self.checkout / TARGET).exists())

    def test_original_evidence_cannot_claim_a_paired_variant(self):
        recipe = json.loads((self.main / stage.DEFAULT_RECIPE).read_bytes())
        recipe.pop('readback')
        recipe['bottom'] = {'id': 'cc0-texture-release-boot-trousers-v2', 'equipmentRole': 'ankleBootPants',
                            'name': 'Pair test', 'fitId': 'pair-test-fit', 'version': 2, 'asset': recipe['asset']}
        config = self.main / stage.DEFAULT_RECIPE
        config.write_bytes(stage.encoded(recipe))
        with self.assertRaisesRegex(ValueError, 'Room case does not match'):
            self.run_stage(recipe=config)
        self.assertFalse((self.checkout / TARGET).exists())

    def test_real_paired_candidate_uses_both_verified_assets(self):
        relative = 'assets-source/ankle-boot-layers-v2/stage-room-v2.json'
        data = json.loads((WORKSPACE / relative).read_bytes())
        for name in (relative, 'prototype/src/outfit-selection.js', data['bottom']['asset']['path'],
                     *(data[key]['path'] for key in ('roomCase', 'asset', 'fitReport'))):
            self.copy(name)
        self.commit()
        checkout = self.make_worktree('paired')
        result = self.run_stage(checkout, recipe=self.main / relative)
        base = 'prototype/public/assets/ankle-boot-layers-v2/'
        shoe_file = base + 'toigo-cc0-male-ankle-boot-layers-v2.glb'
        pants_file = base + data['bottom']['id'] + '.glb'
        manifest_file = base + 'equipment.json'
        self.assertEqual(result['status'], 'diagnostic-only')
        self.assertEqual(result['changed'], [shoe_file, pants_file, manifest_file, stage.PROFILES])
        self.assertEqual(result['files'][shoe_file], data['asset']['sha256'])
        self.assertEqual(result['files'][pants_file], data['bottom']['asset']['sha256'])
        self.assertEqual(result['files'][manifest_file], '16182f8b0560db735fd634762ac09321ce3d5a205747cd11be6a4261f91ebc1c')
        manifest = json.loads((checkout / manifest_file).read_bytes())
        self.assertEqual([(entry['slot'], entry['compatibleAvatarSha256']) for entry in manifest['items']],
                         [('shoes', stage.BODY_SHA), ('bottom', stage.BODY_SHA)])
        profile = json.loads((checkout / stage.PROFILES).read_bytes())[stage.BODY]
        outfit = profile['extraOutfits'][-1]
        self.assertEqual((outfit['bottomRole'], outfit['bottomEquipmentRole'], outfit['equipmentRoles']),
                         ('pants', 'ankleBootPants', ['topFar', 'ankleBoot', 'ankleBootPants']))
        self.assertEqual(self.run_stage(checkout, recipe=self.main / relative)['changed'], [])


if __name__ == '__main__':
    unittest.main()
