import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import lip_anchor
import production_paths


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'evidence/m2-lip-anchor-intake-v1'
FACE_EVIDENCE = ROOT / 'evidence/m2-native-batch-runtime-seam-v1/microphone-final-v1'
UNIFORM = [
    ('female', 'female-uniform-texture-release-v1',
     '1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c',
     1, 0, 'F00_000_00_FaceMouth_00_FACE', 37,
     '60310ab76f0e08bee0a01fa1d80833b7e13f6da19062c5b90298bb090a9c0714'),
    ('male', 'cc0-body-release-v1',
     '2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617',
     0, 1, 'M00_000_00_FaceMouth_00_FACE', 28,
     '53baab07ac706c301c7046daec0ae4ab7c074fe7b320443d310f43909a43b39d'),
]
NATIVE = {
    'native-contour-roundness-a-v1': '79ad06efe7d41164a0f5624ccfd6baae5519e7b12f2ef7f4287f4d1b1dc7be03',
    'native-contour-cheek-b-v1': 'e010b9d6603fa22e90c97f44aec532ca1b873dd1fb383023733594fbbb5d69bd',
}
NATIVE_MOUTH = 'N00_000_00_FaceMouth_00_FACE (Instance)'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def body(asset):
    return ROOT / 'prototype/public/assets' / asset / 'body.vrm'


def changed_glb(raw, edit):
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    edit(doc['extensions'])
    header = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    header += b' ' * (-len(header) % 4)
    payload = raw[20 + length:]
    return struct.pack('<4sIII4s', b'glTF', 2, 20 + len(header) + len(payload), len(header), b'JSON') + header + payload


class LipAnchorTest(unittest.TestCase):
    def setUp(self):
        scratch = TemporaryDirectory(dir=EVIDENCE)
        self.addCleanup(scratch.cleanup)
        self.scratch = Path(scratch.name)
        self.female = UNIFORM[0]

    def test_uniform_outputs_regenerate_byte_for_byte_and_retry_in_place(self):
        for sex, asset, pin, mesh, primitive, material, morph, ring in UNIFORM:
            with self.subTest(sex=sex):
                args = (body(asset), pin, mesh, primitive, material)
                first, repeat = self.scratch / (sex + '-first.json'), self.scratch / (sex + '-repeat.json')
                row = lip_anchor.run(*args, first)
                lip_anchor.run(*args, repeat)
                self.assertEqual(first.read_bytes(), repeat.read_bytes())
                self.assertEqual(first.read_bytes(), (EVIDENCE / f'uniform-lite-{sex}.json').read_bytes())
                with patch.object(lip_anchor.os, 'link', side_effect=AssertionError('Unexpected replacement')):
                    self.assertEqual(lip_anchor.run(*args, first), row)
                self.assertEqual(row['source']['preset'], 'a')
                self.assertEqual(row['source']['bind'], {'mesh': mesh, 'index': morph, 'weight': 100})
                self.assertEqual(len(row['rimVertexIds']), 32)
                self.assertEqual(row['rimVertexIdsSha256'], ring)
                self.assertNotEqual(row['reference']['neutralCentroid'], row['reference']['fullVowelCentroid'])

    def test_facecontour_legacy_bytes_and_new_measurement(self):
        legacy = lip_anchor.load_measurement()
        for asset, expected in NATIVE.items():
            with self.subTest(asset=asset):
                archived = (FACE_EVIDENCE / asset / 'mouth.json').read_bytes()
                old = json.loads(archived)
                previous = self.scratch / (asset + '-legacy.json')
                legacy.one(asset, old['source'], previous)
                self.assertEqual(sha(archived), expected)
                self.assertEqual(previous.read_bytes(), archived)
                candidate = self.scratch / (asset + '.json')
                row = lip_anchor.run(body(asset), old['avatarSha256'], 0, 0, NATIVE_MOUTH, candidate)
                self.assertEqual(candidate.read_bytes(), (EVIDENCE / (asset + '.json')).read_bytes())
                self.assertEqual(row['source']['preset'], 'aa')
                self.assertEqual(row['source']['bind'], {'node': 130, 'index': 39, 'weight': 1})
                self.assertEqual(len(row['rimVertexIds']), 32)
                self.assertEqual(row['rimVertexIdsSha256'],
                                 '8318948f06b9cda6d54d39e8e0388d21030ea814c074a91fd362946fe7219ea0')
                self.assertEqual(row['reference']['neutralCentroid'], old['mouthRawHeadLocal'])
                self.assertEqual(row['reference']['fullVowelCentroid'], old['aaMouthRawHeadLocal'])

    def test_wrong_pin_or_primitive_rejected_before_creating_output(self):
        _, asset, pin, mesh, primitive, material, *_ = self.female
        dest = self.scratch / 'new' / 'anchor.json'
        with self.assertRaisesRegex(ValueError, 'Body SHA-256 mismatch'):
            lip_anchor.run(body(asset), '0' * 64, mesh, primitive, material, dest)
        with self.assertRaisesRegex(ValueError, 'exact, unique FaceMouth'):
            lip_anchor.run(body(asset), pin, mesh, primitive + 1, material, dest)
        with self.assertRaisesRegex(ValueError, 'exact, unique FaceMouth'):
            lip_anchor.run(body(asset), pin, mesh, primitive, material + ' (unreviewed)', dest)
        self.assertFalse(dest.parent.exists())

    def test_rehashed_unexpected_vrm0_and_vrm1_binds_cannot_publish(self):
        _, asset, _, mesh, primitive, material, *_ = self.female
        def update_vrm0(extensions):
            groups = extensions['VRM']['blendShapeMaster']['blendShapeGroups']
            next(row for row in groups if row['presetName'] == 'a')['binds'][0]['weight'] = 50

        def wrong_owner(extensions):
            extensions['VRMC_vrm']['expressions']['preset']['aa']['morphTargetBinds'][0]['node'] = 10

        def wrong_target(extensions):
            extensions['VRMC_vrm']['expressions']['preset']['aa']['morphTargetBinds'][0]['index'] = 0

        native = next(iter(NATIVE))
        for source, location, edit, error in [
            (body(asset), (mesh, primitive, material), update_vrm0, 'full-weight FaceMouth a'),
            (body(native), (0, 0, NATIVE_MOUTH), wrong_owner, 'VRM1 aa bind on the FaceMouth owner'),
            (body(native), (0, 0, NATIVE_MOUTH), wrong_target, 'authored FaceMouth A target'),
        ]:
            with self.subTest(case=edit.__name__):
                alternate = changed_glb(source.read_bytes(), edit)
                dest = self.scratch / 'new' / 'anchor.json'
                with patch.object(Path, 'read_bytes', return_value=alternate), self.assertRaisesRegex(ValueError, error):
                    lip_anchor.run(source, sha(alternate), *location, dest)
                self.assertFalse(dest.parent.exists())

    def test_output_boundary_precedes_source_read(self):
        args = (Path('absent.vrm'), '0' * 64, 0, 0, 'absent')
        outputs = [Path(ROOT.anchor), ROOT / '..' / 'lip-anchor-outside.json']
        checkout = self.scratch / 'main'
        checkout.mkdir()
        if os.name == 'nt':
            junction = checkout / 'redirected'
            subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(ROOT.parent)],
                           check=True, capture_output=True)
            self.addCleanup(junction.rmdir)
            outputs.append(junction / 'lip-anchor-outside.json')
        with patch.object(lip_anchor, 'build', side_effect=AssertionError('Unexpected input access')):
            for dest in outputs:
                with self.subTest(dest=dest), self.assertRaisesRegex(ValueError, 'inside the production tool main checkout'):
                    lip_anchor.run(*args, dest)
        self.assertEqual(list(self.scratch.iterdir()), [checkout])
        self.assertEqual(list(checkout.iterdir()), [junction] if os.name == 'nt' else [])

    def test_outside_input_and_in_project_fail_retry_and_no_overwrite(self):
        _, asset, pin, mesh, primitive, material, *_ = self.female
        args = (body(asset), pin, mesh, primitive, material)
        checkout = self.scratch / 'main'
        checkout.mkdir()
        dest = checkout / 'anchor.json'
        with (
            patch.object(lip_anchor, 'main_checkout', return_value=checkout),
            patch.object(production_paths, 'main_checkout', return_value=checkout),
        ):
            with (
                patch.object(lip_anchor.os, 'link', side_effect=OSError('fixture write failure')),
                self.assertRaisesRegex(OSError, 'fixture write failure'),
            ):
                lip_anchor.run(*args, dest)
            self.assertEqual(list(checkout.iterdir()), [])
            row = lip_anchor.run(*args, dest)
            self.assertEqual(row['source']['path'], 'body.vrm')
            dest.write_bytes(b'existing evidence')
            with self.assertRaisesRegex(ValueError, 'Existing lip anchor differs'):
                lip_anchor.run(*args, dest)
            self.assertEqual(dest.read_bytes(), b'existing evidence')


if __name__ == '__main__':
    unittest.main()
