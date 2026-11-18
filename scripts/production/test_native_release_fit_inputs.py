"""Regression checks for the pinned prefix proof and its primitive-local mouth indices."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import native_release_fit_inputs as proof
from native_mesh_budget import fixed_input


class ReleaseFitInputsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, _, _, cls.source = fixed_input()
        cls.target = proof.derive_prefix(proof.GLB(cls.source))[0]

    def test_exact_regeneration_without_the_ignored_vrm(self):
        with patch.object(proof, 'TARGET', proof.REPORT.parent / 'intentionally-absent.vrm'):
            outcome = proof.build()
        self.assertFalse(outcome['runtimeAdmission'])
        self.assertEqual([record['liveEnabled'] for record in outcome['records']], [['mic', 'glasses'], []])
        self.assertEqual(outcome['accessories']['microphone']['rimVertices'], 32)
        self.assertEqual(outcome['accessories']['glasses']['sourceCaptureBodySha256'], proof.SOURCE_SHA)
        self.assertEqual(outcome['body']['changedPrimitive']['derivedPositionCount'], 1053)
        self.assertEqual(len(outcome['garments']), 4)
        self.assertEqual(outcome, json.loads(proof.REPORT.read_bytes()))

    def test_unmodified_source_is_not_the_target(self):
        with self.assertRaisesRegex(ValueError, 'pinned prefix'):
            proof.prove_body(self.source, self.source)

    def test_historical_mouth_files_rebuild_byte_for_byte(self):
        mouth = proof.load_script('production_mouth', 'scripts/native-live-accessory-fit-v1/mouth.py')
        pins = json.loads((proof.ROOT / 'evidence/native-live-accessory-fit-v1/report.json').read_bytes())['sourcePins']
        fixtures = {'female-mouth.json': 'femaleMouth', 'male-mouth.json': 'maleMouth',
                    'female-face-mouth.json': 'femaleFaceMouth', 'female-waist-mouth.json': 'femaleWaistMouth'}
        with TemporaryDirectory(dir=proof.REPORT.parent) as directory:
            for filename, key in fixtures.items():
                old = (proof.ROOT / 'assets-source/native-live-accessory-fit-v1' / filename).read_bytes()
                sample = json.loads(old)
                destination = Path(directory) / filename
                mouth.one(sample['body'], sample['source'], destination)
                self.assertEqual(proof.digest(old), pins[key])
                self.assertEqual(destination.read_bytes(), old)

    def test_altered_binary_under_same_declarations_is_rejected(self):
        damaged = self.target[:-1] + bytes([self.target[-1] ^ 1])
        with self.assertRaisesRegex(ValueError, 'pinned prefix'):
            proof.prove_body(self.source, damaged)

    def test_production_cli_measurement_uses_primitive_local_indices(self):
        mouth = proof.load_script('production_mouth', 'scripts/native-live-accessory-fit-v1/mouth.py')
        with TemporaryDirectory(dir=proof.REPORT.parent) as directory:
            root = Path(directory)
            output = root / 'assets-source/native-live-accessory-fit-v1'
            output.mkdir(parents=True)
            (root / 'source.vrm').write_bytes(self.source)
            (root / 'derived.vrm').write_bytes(self.target)
            with patch.object(mouth, 'ROOT', root):
                old = mouth.one('test', 'source.vrm')
                pinned = (output / 'test-mouth.json').read_bytes()
                with self.assertRaisesRegex(ValueError, 'Existing mouth evidence differs'):
                    mouth.one('test', 'derived.vrm')
                self.assertEqual(pinned, (output / 'test-mouth.json').read_bytes())
                new = mouth.one('test', 'derived.vrm', 'derived-mouth.json')
            self.assertNotEqual(old['avatarSha256'], new['avatarSha256'])
            self.assertEqual(len(new['rimVertexIds']), 32)
            for key in ('rimVertexIds', 'boundaryComponents', 'neutralRimRawHeadLocal',
                        'aaMouthRawHeadLocal', 'adjacentFaceAreaWeightedNormalRawHeadLocal'):
                self.assertEqual(old[key], new[key])

    def test_displaced_face_surface_cannot_validate_a_mouth_rim(self):
        mouth = proof.load_script('production_mouth', 'scripts/native-live-accessory-fit-v1/mouth.py')
        model = proof.Export(self.target).glb
        face = next(p for m in model.doc['meshes'] for p in m['primitives']
                    if '_Face_' in model.doc['materials'][p['material']]['name'])
        face_position = face['attributes']['POSITION']
        read = model.acc

        def displaced(index):
            points = read(index)
            return points + 1 if index == face_position else points

        with patch.object(model, 'acc', displaced), self.assertRaisesRegex(ValueError, '32-point FaceMouth seam'):
            mouth.measure(model)


if __name__ == '__main__':
    unittest.main()
