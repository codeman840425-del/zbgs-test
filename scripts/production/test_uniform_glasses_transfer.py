import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import uniform_glasses_transfer as transfer
from production_paths import project_output


class GlassesTransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = json.loads((transfer.ASSETS / 'recipe.json').read_bytes())
        cls.intake = transfer.replay(transfer.CHECKOUT)

    def candidates(self, recipe):
        return transfer.make_candidates(recipe, transfer.CHECKOUT, self.intake)

    def test_reproduces_both_profiles_and_the_real_validator_accepts_only_the_target_identity(self):
        files = self.candidates(self.recipe)
        transfer.verify(transfer.ASSETS / 'generated', files)
        script = """
          import {readFileSync} from 'node:fs';
          import assert from 'node:assert/strict';
          import {validateTempleProfile} from './prototype/src/glasses-temple-fit.js';
          for (const {candidate, donor, body, frame} of JSON.parse(readFileSync(0))) {
            assert.deepEqual(candidate.controls, donor.controls);
            assert.notEqual(candidate.id, donor.id);
            assert(validateTempleProfile(candidate, body, frame));
            assert(!validateTempleProfile(candidate, donor.bodySHA256, frame));
            assert(!validateTempleProfile(candidate, body, '0'.repeat(64)));
          }
        """
        rows = []
        for request in self.recipe['targets']:
            donor = transfer.CHECKOUT / 'prototype/public/assets/m1c/glasses-fit' / (request['donor'] + '.json')
            rows.append({'candidate':json.loads(files[request['body'] + '.json']), 'donor':json.loads(donor.read_bytes()),
                         'body':request['bodySha256'], 'frame':self.recipe['accessorySha256']})
        subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(rows).encode(),
                       cwd=transfer.CHECKOUT, check=True)

    def test_rejects_changed_frame_look_body_fit_donor_and_elevation_to_exact(self):
        for name, key, value in [('asset', 'accessorySha256', 'a' * 64), ('asset', 'hair', 'bob'),
                                 ('asset', 'neutralFace', False), ('male', 'bodySha256', 'a' * 64),
                                 ('male', 'donorFitSha256', self.recipe['targets'][0]['donorFitSha256']),
                                 ('male', 'donor', 'female'), ('male', 'level', 'exact-parent-transfer-candidate'),
                                 ('male', 'id', self.recipe['targets'][0]['id'])]:
            with self.subTest(key=key):
                recipe = copy.deepcopy(self.recipe)
                (recipe if name == 'asset' else recipe['targets'][1])[key] = value
                with self.assertRaises(ValueError):
                    self.candidates(recipe)

    def test_refusal_leaves_no_partial_pair_and_retry_preserves_existing_output(self):
        parent = project_output(transfer.ROOT / 'experiments', transfer.__file__)
        with tempfile.TemporaryDirectory(dir=parent) as name:
            folder = Path(name)
            output = folder / 'pair'
            recipe_file = folder / 'recipe.json'
            wrong = copy.deepcopy(self.recipe)
            wrong['targets'][1]['bodySha256'] = wrong['targets'][0]['bodySha256']
            recipe_file.write_bytes(transfer.encoded(wrong))
            with self.assertRaisesRegex(ValueError, 'Target body differs'):
                transfer.run(recipe_file, transfer.CHECKOUT, output)
            self.assertFalse(output.exists())
            transfer.run(transfer.ASSETS / 'recipe.json', transfer.CHECKOUT, output)
            first = output / (self.recipe['targets'][0]['body'] + '.json')
            first.write_bytes(b'wrong candidate')
            with self.assertRaisesRegex(ValueError, 'Existing candidate differs'):
                transfer.run(transfer.ASSETS / 'recipe.json', transfer.CHECKOUT, output)
            self.assertEqual(first.read_bytes(), b'wrong candidate')
            self.assertFalse(list(folder.glob('.glasses-*')))

    def test_drive_root_parent_and_directory_link_refused_before_inputs(self):
        missing = transfer.ROOT / 'absent-reference'
        outside = Path(transfer.ROOT.anchor)
        for output in [outside, transfer.ROOT / '..' / 'outside-the-producer' / 'pair']:
            with self.assertRaisesRegex(ValueError, 'inside the production'):
                transfer.run(missing, missing, output)
        parent = project_output(transfer.ROOT / 'experiments', transfer.__file__)
        with tempfile.TemporaryDirectory(dir=parent) as name:
            link = Path(name) / 'redirect'
            if transfer.os.name == 'nt':
                subprocess.run(['cmd', '/d', '/c', 'mklink', '/J', str(link), str(outside)], check=True,
                               stdout=subprocess.DEVNULL)
            else:
                link.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'inside the production'):
                transfer.run(missing, missing, link / 'outside-the-producer')


if __name__ == '__main__':
    unittest.main()
