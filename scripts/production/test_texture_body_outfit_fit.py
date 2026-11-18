import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import texture_body_outfit_fit as fit
from garment_basecolor_release import half_png
from native_mesh_budget import encode
from native_release_textures import splice
from test_diagnostic_output_paths import link_directory


class TextureBodyFitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader = fit.Validator(fit.ROOT)
        cls.parent, cls.witness, cls.garments, cls.proofs = fit.read_parent(cls.reader)
        cls.original = cls.reader.pin(fit.TARGET, fit.PARENT_SHA)
        cls.before = fit.BodyReadback(cls.original)
        png = half_png(fit.view_bytes(cls.before, 15))
        cls.candidate = encode(*splice(cls.before.doc, cls.before.glb.binary, {15: png}))

    def test_other_body_cannot_be_self_approved(self):
        with self.assertRaisesRegex(ValueError, 'exact reviewed texture body SHA'):
            fit.build(fit.ROOT, self.original)

    def test_altered_normal_uv_morph_inverse_bind_or_other_surface_fails(self):
        new = fit.BodyReadback(self.candidate)
        face = new.doc['meshes'][0]['primitives'][0]
        body = new.doc['meshes'][1]['primitives'][0]
        accessors = [body['attributes']['TEXCOORD_0'], face['targets'][0]['POSITION'],
                     new.doc['skins'][0]['inverseBindMatrices'], body['indices']]
        views = [new.doc['accessors'][a]['bufferView'] for a in accessors] + [16]
        binary = new.glb.binary
        for index in views:
            with self.subTest(view=index):
                modified = bytearray(binary)
                modified[new.doc['bufferViews'][index].get('byteOffset', 0)] ^= 1
                new.glb.binary = bytes(modified)
                with self.assertRaisesRegex(ValueError, 'changed bytes'):
                    fit.prove_body(self.before, new, self.witness)

    def test_wrong_material_consumer_and_rig_rejected(self):
        new = fit.BodyReadback(self.candidate)
        new.vrm['materialProperties'][0]['textureProperties']['_MainTex'] = 15
        with self.assertRaisesRegex(ValueError, 'texture consumer'):
            fit.texture_slots(new.doc)
        new = fit.BodyReadback(self.candidate)
        new.doc['nodes'][0]['translation'][1] += .02
        with self.assertRaisesRegex(ValueError, 'glTF or VRM semantics'):
            fit.prove_body(self.before, new, self.witness)

    def test_wrong_shoe_floor_bind_bytes_and_garment_slot_rejected(self):
        new = fit.BodyReadback(self.candidate)
        ident = self.parent['ids']['shoes']
        shoe = self.garments[ident]
        floor = self.parent['sourceFloorY']
        def check(row, role, height):
            return fit.equipment_fit(self.reader, row, role, self.before, new, self.proofs[ident], height)
        with self.assertRaisesRegex(ValueError, 'sole and body floor'):
            check(shoe, 'shoes', floor + .001)
        with self.assertRaisesRegex(ValueError, 'garment slot'):
            check(shoe, 'pants', floor)
        with self.assertRaisesRegex(ValueError, 'SHA mismatch'):
            check(dict(shoe, url=self.garments[self.parent['ids']['pants']]['url']), 'shoes', floor)
        wrong = copy.deepcopy(shoe)
        wrong['bindings'][0]['inverseBindMatrix'][0] += .001
        with self.assertRaisesRegex(ValueError, 'Inverse bind mismatch'):
            check(wrong, 'shoes', floor)

    def paths(self):
        scratch = fit.checked_path(fit.ROOT / 'experiments')
        tmp = Path(self.enterContext(tempfile.TemporaryDirectory(dir=scratch)))
        tool = tmp / 'tool'
        subprocess.run(['git', 'init', '-q', str(tool)], check=True)
        fake_script = tool / 'fit.py'
        fake_script.touch()
        self.enterContext(patch.object(fit, '__file__', fake_script))
        self.enterContext(patch.object(fit, 'REPORT', tool / 'evidence/fit.json'))
        return tool, tmp

    def test_other_checkout_inputs_and_replay_real_assets(self):
        tool, tmp = self.paths()
        candidate = tmp / 'body.vrm'
        candidate.write_bytes(self.candidate)
        stage = tool / 'stage'
        result = fit.run(fit.ROOT, candidate, stage, False)
        self.assertEqual(result, fit.run(fit.ROOT, candidate, stage, True))
        self.assertEqual((stage / 'body.vrm').read_bytes(), self.candidate)
        profile = json.loads((stage / 'profile.json').read_bytes())[fit.PROFILE_ID]
        self.assertEqual(profile['manifestSha256'], result['equipment.json'])
        catalog = json.loads((stage / 'equipment.json').read_bytes())['items']
        self.assertEqual([i['id'] for i in catalog], list(fit.ROLE_IDS.values()))
        self.assertTrue(all(i['compatibleAvatarSha256'] == fit.TARGET_SHA for i in catalog))
        self.assertEqual((tool / 'evidence/fit.json').read_bytes(),
                         (fit.ROOT / 'evidence/m2-cc0-body-release-fit-v1/report.json').read_bytes())

    def test_absolute_drive_traversal_and_junction_fail_before_input_read(self):
        tool, tmp = self.paths()
        outside = tmp / 'other-checkout'
        outside.mkdir()
        link = tool / 'redirect'
        link_directory(link, outside)
        paths = [Path(tmp.anchor) / 'cc0-fit-path-regression', tool / '../other-checkout/stage',
                 outside / 'output', link / 'stage']
        for destination in paths:
            with self.subTest(destination=destination), self.assertRaisesRegex(ValueError, 'main checkout'):
                fit.run(outside, tmp / 'missing-body.vrm', destination, False)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertFalse((tool / 'evidence').exists())


if __name__ == '__main__':
    unittest.main()
