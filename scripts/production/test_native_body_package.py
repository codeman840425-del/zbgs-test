"""Offline source-to-package regression with the actual two native VRM exports."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import native_body_package as package


def snapshot(folder):
    return {p.relative_to(folder).as_posix():(package.sha(p.read_bytes()),p.stat().st_mtime_ns)
            for p in sorted(folder.rglob("*")) if p.is_file()}


class GarmentSelectionTests(unittest.TestCase):
    """Authored selector fixtures use only project-local synthetic data."""

    def setUp(self):
        names = ["Fixture_Body_00_SKIN", "Fixture_Tops_01_CLOTH", "Fixture_Bottoms_01_CLOTH", "Fixture_Shoes_01_CLOTH"]
        self.doc = {
            'nodes': [{'name': 'Root', 'children': [1]}, {'name': 'Fixture Body', 'mesh': 0, 'skin': 0}],
            'meshes': [{'primitives': [dict(material=i, indices=0, attributes={'POSITION': 1, 'JOINTS_0': 2, 'WEIGHTS_0': 3})
                                       for i in range(len(names))]}],
            'materials': [dict(name=name, extensions={'VRMC_materials_mtoon': {}}) for name in names],
            'skins': [{}],
        }
        self.item = {'id': 'editable-selection-fixture'}
        self.consumer = {'mesh': 0, 'primitive': 0, 'material': 0}
        self.mapping = {slot: dict(node=1, mesh=0, skin=0, primitive=i, material=i)
                        for i, slot in enumerate(('top', 'bottom', 'shoes'), start=1)}

    def select(self):
        return package.garment_selection(self.doc, self.consumer, self.item)

    def assert_incompatible(self, *fragments):
        with self.assertRaises(ValueError) as raised:
            self.select()
        message = str(raised.exception)
        self.assertIn(self.item['id'], message)
        for fragment in fragments:
            self.assertIn(fragment, message)

    def test_exact_three_slot_mapping_preserves_legacy_selection(self):
        automatic = self.select()
        self.assertEqual(automatic[2], [('top', 1, 'Tops'), ('bottom', 2, 'Bottoms'), ('shoes', 3, 'Shoes')])
        self.item['garmentSelection'] = self.mapping
        self.assertEqual(self.select(), automatic)

    def test_missing_slot_includes_inspected_body_primitives(self):
        self.doc['materials'][1]['name'] = 'Unassigned_CLOTH'
        self.assert_incompatible("missing slot 'top'", "node[1] 'Fixture Body'",
                                 'mesh[0] primitive[1] material[1]', 'Unassigned_CLOTH')

    def test_multiple_candidates_list_both_primitives_even_with_an_explicit_map(self):
        primitives = self.doc['meshes'][0]['primitives']
        primitives.append(copy.deepcopy(primitives[1]))
        self.item['garmentSelection'] = self.mapping
        self.assert_incompatible("multiple candidates for slot 'top'", "node[1] 'Fixture Body'",
                                 'mesh[0] primitive[1] material[1]', 'mesh[0] primitive[4] material[1]')

    def test_same_primitive_cannot_claim_two_slots(self):
        self.doc['materials'][1]['name'] = 'Fixture_Tops_Bottoms_CLOTH'
        self.assert_incompatible('one primitive claims multiple slots: top, bottom', "node[1] 'Fixture Body'",
                                 'mesh[0] primitive[1] material[1]')

    def test_one_piece_rejects_even_when_all_three_standard_slots_exist(self):
        extras = copy.deepcopy(self.doc['materials'][1])
        extras['name'] = 'Fixture_OnePiece_01_CLOTH'
        self.doc['materials'].append(extras)
        primitives = self.doc['meshes'][0]['primitives']
        primitives.append({**primitives[1], 'material': 4})
        self.assert_incompatible('onePiece requires an explicit same-body donor', 'mesh[0] primitive[4] material[4]')

    def test_separate_part_with_a_unique_slot_cannot_be_moved_onto_the_body(self):
        shoes = self.doc['meshes'][0]['primitives'].pop()
        self.doc['meshes'].append({'primitives': [shoes]})
        self.doc['nodes'].append({'name': 'Separate Shoes', 'mesh': 1, 'skin': 0})
        self.assert_incompatible("slot 'shoes' is outside", "node[2] 'Separate Shoes'", 'mesh[1] primitive[0] material[3]')

    def test_recipe_rejects_same_primitive_wrong_anchor_and_unsupported_slots(self):
        for field, mapping, fragments in (
            ('duplicate', {**self.mapping, 'bottom': self.mapping['top']},
             ('assigns the same primitive to multiple slots', 'mesh[0] primitive[1] material[1]')),
            ('skin', {**self.mapping, 'top': {**self.mapping['top'], 'skin': 4}},
             ("'top' differs from the verified primitive", 'skin[4]', 'skin[0]')),
            ('onePiece', {**self.mapping, 'onePiece': self.mapping['top']},
             ('requires exactly top, bottom and shoes', 'onePiece are unsupported')),
        ):
            with self.subTest(field=field):
                self.item['garmentSelection'] = mapping
                self.assert_incompatible(*fragments)


class NativePackageTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(package.CONFIG.read_bytes())
        (package.ROOT/"output").mkdir(exist_ok=True)
        scratch = tempfile.TemporaryDirectory(dir=package.ROOT/"output")
        self.addCleanup(scratch.cleanup)
        self.output = Path(scratch.name)/"sources"

    def test_rebuilds_and_shared_import(self):
        first = package.build(self.config, self.output)
        self.assertTrue(first["passed"], first)
        before = snapshot(self.output)
        self.assertEqual(first, package.build(self.config,self.output))
        self.assertEqual(before,snapshot(self.output))
        batch = json.loads((self.output/"import-batch.json").read_bytes())
        report = package.importer.execute(batch,package.ROOT,self.output.parent/"runtime-inputs")
        self.assertTrue(report["passed"],report)
        self.assertEqual([r["bodySha256"] for r in report["items"]],[r["bodySha256"] for r in first["items"]])

    def test_wrong_source_identity_isolated_then_retried(self):
        wrong = copy.deepcopy(self.config)
        wrong["items"][0]["candidate"] = wrong["items"][1]["candidate"]
        result = package.build(wrong,self.output)
        self.assertEqual([r["state"] for r in result["items"]],["failed","ready"])
        a,b = [self.output/r["id"] for r in result["items"]]
        self.assertFalse(a.exists())
        self.assertFalse((self.output/"import-batch.json").exists())
        self.assertIn("Wrong delta",result["items"][0]["reason"])
        before = snapshot(b)
        self.assertTrue(package.build(self.config,self.output)["passed"])
        self.assertEqual(before,snapshot(b))
        (a/"body.vrm").write_bytes(b"existing-user-bytes")
        broken = snapshot(a)
        self.assertEqual([r["state"] for r in package.build(self.config,self.output)["items"]],["failed","ready"])
        self.assertEqual(broken,snapshot(a))

    def test_unsupported_delta_with_matching_hashes_cannot_enter_packager(self):
        config = copy.deepcopy(self.config)
        row = config["items"][0]
        delta = json.loads(package.pinned(row["delta"]).read_bytes())
        why = 'candidate: textures[0].name missing; used by materials[0].pbrMetallicRoughness.baseColorTexture'
        delta.update(status='unsupported', reason=why)
        path = self.output.parent / 'unsupported-delta.json'
        path.write_text(json.dumps(delta), encoding='utf8')
        row["delta"] = {"path": path.relative_to(package.ROOT).as_posix(), "sha256": package.sha(path.read_bytes())}
        result = package.build(config, self.output)
        self.assertEqual([r['state'] for r in result['items']], ['failed', 'ready'])
        self.assertIn(why, result['items'][0]['reason'])
        self.assertFalse((self.output / row['id']).exists())
        self.assertFalse((self.output / 'import-batch.json').exists())

    def test_wrong_covered_png_is_rejected_even_with_correct_sha(self):
        wrong = copy.deepcopy(self.config)
        wrong["mask"] = wrong["template"]
        result = package.build(wrong,self.output)
        self.assertTrue(all(r["state"]=="failed" and "covered Body PNG differs" in r["reason"] for r in result["items"]))
        self.assertFalse(list(self.output.iterdir()))

    def test_bad_garment_mapping_fails_before_packing_any_bytes(self):
        config = copy.deepcopy(self.config)
        config['items'] = [config['items'][0]]
        item = config['items'][0]
        selector = dict(node=131, mesh=1, skin=1, primitive=3, material=11)
        item['garmentSelection'] = dict(top=selector, bottom=selector, shoes=selector)
        with patch.object(Path, 'write_bytes', side_effect=AssertionError('wrote before garment preflight')) as write:
            result = package.build(config, self.output)
        write.assert_not_called()
        self.assertFalse(result['passed'])
        self.assertIn(f"Native body {item['id']!r}", result['items'][0]['reason'])
        self.assertIn('assigns the same primitive to multiple slots', result['items'][0]['reason'])
        self.assertIn('node[131]', result['items'][0]['reason'])
        self.assertIn('mesh[1] primitive[3] material[11]', result['items'][0]['reason'])
        self.assertEqual(list(self.output.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
