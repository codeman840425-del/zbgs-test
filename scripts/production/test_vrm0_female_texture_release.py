"""Exercise the actual Blender round-trip, source references, and CPU output confinement."""

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import vrm0_female_texture_release as release
from test_diagnostic_output_paths import link_directory


class FemaleTextureReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = json.loads(release.SPEC.read_bytes())
        cls.raw = (release.ROOT / cls.spec['source']).read_bytes()
        cls.doc, _ = release.embedded_glb(cls.raw)

    def expect_invalid(self, doc, reason):
        with self.assertRaisesRegex(ValueError, reason):
            release.inspect_document(doc, self.spec)

    def test_unknown_source_and_extension(self):
        with self.assertRaisesRegex(ValueError, 'pinned female source'):
            release.derive(self.raw[:-1], self.spec)
        doc = copy.deepcopy(self.doc)
        doc['materials'][0]['extensions']['EXT_other_texture'] = {'index': 23}
        self.expect_invalid(doc, 'Unreviewed extension')
        doc = copy.deepcopy(self.doc)
        doc['extensions']['VRM']['firstPerson']['otherTexture'] = 23
        self.expect_invalid(doc, 'Unreviewed source document')

    def test_unknown_or_reordered_morph_names(self):
        doc = copy.deepcopy(self.doc)
        doc['meshes'][0]['extras'] = {'targetNames': []}
        self.expect_invalid(doc, 'Unreviewed extras')
        doc = copy.deepcopy(self.doc)
        doc['meshes'][1]['extras']['texture'] = 23
        self.expect_invalid(doc, 'Unreviewed extras')
        doc = copy.deepcopy(self.doc)
        doc['meshes'][1]['primitives'][0]['extras']['targetNames'].reverse()
        self.expect_invalid(doc, 'Primitive morph name/order')

    def test_multifunction_preview_shared_image_and_buffer_view(self):
        doc = copy.deepcopy(self.doc)
        doc['extensions']['VRM']['materialProperties'][0]['textureProperties']['_BumpMap'] = 23
        self.expect_invalid(doc, 'Thumbnail has a material')
        doc = copy.deepcopy(self.doc)
        doc['textures'][3]['source'] = 23
        self.expect_invalid(doc, 'exactly one texture')
        doc = copy.deepcopy(self.doc)
        doc['accessors'][3]['bufferView'] = 161
        self.expect_invalid(doc, 'Image storage is shared')

    def test_body_uv_and_material_or_spring_reference(self):
        doc = copy.deepcopy(self.doc)
        doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['texCoord'] = 1
        self.expect_invalid(doc, 'Wrong body material or UV')
        doc = copy.deepcopy(self.doc)
        del doc['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']
        self.expect_invalid(doc, 'body primitive and UV0')
        doc = copy.deepcopy(self.doc)
        doc['materials'][1]['normalTexture'] = {'index': 0}
        self.expect_invalid(doc, 'three reviewed slots')
        doc = copy.deepcopy(self.doc)
        doc['extensions']['VRM']['secondaryAnimation']['boneGroups'][1]['colliderGroups'].append(99)
        self.expect_invalid(doc, 'Invalid spring')

    def fixture(self):
        base = release.checked(release.OUTPUT)
        base.mkdir(parents=True, exist_ok=True)
        scratch = Path(self.enterContext(tempfile.TemporaryDirectory(dir=base)))
        tool = scratch / 'tool'
        subprocess.run(['git', 'init', '-q', str(tool)], check=True)
        fake = tool / 'export.py'
        fake.touch()
        self.enterContext(patch.object(release, '__file__', fake))
        return tool, scratch

    def test_external_source_checkout_and_exact_independent_repeat(self):
        tool, _ = self.fixture()
        out = tool / 'release'
        report = release.build(release.ROOT, out, False)
        self.assertEqual(report, release.build(release.ROOT, out, True))
        script = release.ROOT / 'scripts/production/vrm0_female_texture_release.py'
        subprocess.run([sys.executable, '-B', str(script), '--output', str(out), '--check'],
                       env={**os.environ, 'PYTHONHASHSEED': '713'}, check=True, capture_output=True)
        self.assertEqual(report['targetSha256'], release.digest((out / 'body.vrm').read_bytes()))
        self.assertEqual(report, json.loads((out / 'report.json').read_bytes()))
        self.assertEqual(report['budget']['after']['violations'], [])
        self.assertEqual(report['productionReadback']['accessors'], 138)
        self.assertEqual(report['productionReadback']['unchangedImageCount'], 22)
        self.assertFalse(report['fitRegistered'])

    def test_root_traversal_and_windows_junction_precede_input_reads(self):
        tool, scratch = self.fixture()
        outside = scratch / 'other'
        outside.mkdir()
        link = tool / 'redirect'
        link_directory(link, outside)
        for out in [Path(scratch.anchor) / 'female-texture-path-regression', outside / 'release',
                    tool / '../other/release', link / 'release']:
            with self.subTest(out=out), self.assertRaisesRegex(ValueError, 'main checkout'):
                release.build(scratch / 'missing-source', out, False)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
