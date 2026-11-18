"""Check fixed asset removal, semantic roundtrip and refusal of unknown or live dependencies."""

import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import stripped_outfit_body as release


class SourceBodyReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = json.loads(release.RECIPE.read_bytes())
        cls.raw = release.pinned(cls.recipe['body'])
        cls.output, cls.report = release.build(cls.recipe)
        receipt = json.loads(release.pinned(cls.recipe['equipmentReport']))
        cls.selectors = [
            s['selector']
            for item in receipt['items']
            for s in (item['selection'] if isinstance(item['selection'], list) else [item['selection']])
        ]

    def test_actual_release_repeats_and_exclusive_payloads_are_absent(self):
        self.assertEqual(release.TARGET.read_bytes(), self.output)
        self.assertEqual(self.output, release.strip(self.raw, self.selectors)[0])
        old, old_bin = release.embedded_glb(self.raw)
        reduced, reduced_bin = release.embedded_glb(self.output)
        self.assertEqual(len(old['meshes'][1]['primitives']) - len(reduced['meshes'][1]['primitives']), 4)
        self.assertEqual({entry['index'] for entry in self.report['removedImages']}, {17, 18, 19, 20})
        for index in (17, 18, 19, 20):
            self.assertNotIn(release.view_data(old, old_bin, old['images'][index]['bufferView']), reduced_bin)
        self.assertEqual(len(reduced['materials']), 11)
        self.assertEqual(len(reduced['images']), 21)

    def test_legacy_only_texture_consumer_survives_and_first_person_mesh_indices_are_stable(self):
        doc, binary = release.embedded_glb(self.raw)
        vrm = doc['extensions']['VRM']
        vrm['materialProperties'][14]['textureProperties']['_SphereAdd'] = 19
        vrm['firstPerson']['meshAnnotations'] = [{'mesh': 1, 'firstPersonFlag': 'ThirdPersonOnly'}]
        input_raw = release.encode(doc, binary)
        raw, maps, removed = release.strip(input_raw, self.selectors)
        release.verify(input_raw, raw, maps, removed)
        target, _ = release.embedded_glb(raw)
        new_vrm = target['extensions']['VRM']
        self.assertEqual(len(target['images']), 22)
        self.assertEqual(
            new_vrm['materialProperties'][maps['materials'][14]]['textureProperties']['_SphereAdd'],
            maps['textures'][19],
        )
        self.assertEqual(new_vrm['firstPerson']['meshAnnotations'], vrm['firstPerson']['meshAnnotations'])

    def test_live_expression_material_or_unknown_extension_prevents_pruning(self):
        doc, binary = release.embedded_glb(self.raw)
        group = doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'][0]
        group['materialValues'] = [
            {
                'materialName': doc['materials'][10]['name'],
                'propertyName': '_Color',
                'targetValue': [1, 1, 1, 1],
            }
        ]
        with self.assertRaisesRegex(ValueError, 'Expression binds a removed'):
            release.strip(release.encode(doc, binary), self.selectors)
        doc['extensions']['Unknown'] = {'skinTexture': 19}
        with self.assertRaisesRegex(ValueError, 'Expected source VRM0 extensions'):
            release.strip(release.encode(doc, binary), self.selectors)

    def test_redirected_evidence_target_ancestors_and_leaf_cannot_write(self):
        with TemporaryDirectory(dir=release.physical(release.EVIDENCE)) as temp:
            base = Path(temp)
            actual = base / 'original'
            actual.mkdir()
            link = base / 'redirect'
            if os.name == 'nt':
                subprocess.run(
                    ['cmd', '/d', '/c', 'mklink', '/J', str(link), str(actual)],
                    capture_output=True,
                    check=True,
                )
            else:
                link.symlink_to(actual, target_is_directory=True)
            try:
                with patch.object(release, 'EVIDENCE', link), self.assertRaisesRegex(
                    ValueError, 'Redirected'
                ):
                    release.measure(self.output, self.recipe['body']['path'])
                for suffix in ('', 'body.vrm', 'assets/section/body.vrm', 'a/b/c/d/body.vrm'):
                    with self.subTest(suffix=suffix), patch.object(release, 'TARGET', link / suffix), patch(
                        'sys.argv', ['stripped_outfit_body']
                    ), self.assertRaisesRegex(ValueError, 'Redirected'):
                        release.main()
                self.assertEqual(list(actual.iterdir()), [])
            finally:
                if os.name == 'nt':
                    link.rmdir()
                else:
                    link.unlink()

    def test_negative_or_boolean_dependencies_are_rejected(self):
        for field in ('node', 'mesh', 'skin', 'primitive', 'material'):
            selectors = [dict(s) for s in self.selectors]
            selectors[0][field] = -1
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.strip(self.raw, selectors)
        doc, binary = release.embedded_glb(self.raw)
        for index in (-1, True):
            doc['meshes'][1]['primitives'][0]['attributes']['NORMAL'] = index
            with self.subTest(index=index), self.assertRaisesRegex(
                ValueError, 'accessors must be an integer'
            ):
                release.strip(release.encode(doc, binary), self.selectors)

    def test_check_fails_when_retained_primitives_are_reordered(self):
        data, maps, removed = release.strip(self.raw, self.selectors)
        doc, binary = release.embedded_glb(data)
        primitives = doc['meshes'][1]['primitives']
        primitives[0], primitives[1] = primitives[1], primitives[0]
        with self.assertRaisesRegex(ValueError, 'Retained primitive'):
            release.verify(self.raw, release.encode(doc, binary), maps, removed)

    def test_same_source_bytes_from_another_path_do_not_match_the_publisher_spec(self):
        with TemporaryDirectory(dir=release.physical(release.EVIDENCE)) as temp:
            copy = Path(temp) / 'different-source.vrm'
            copy.write_bytes(self.raw)
            recipe = dict(
                self.recipe, body=dict(self.recipe['body'], path=copy.relative_to(release.ROOT).as_posix())
            )
            with self.assertRaisesRegex(ValueError, 'Authoring body mismatch'):
                release.build(recipe)


if __name__ == '__main__':
    unittest.main()
