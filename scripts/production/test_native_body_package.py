"""Offline source-to-package regression with the actual two native VRM exports."""
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import native_body_package as package

YUN_CONFIG = package.ROOT / "output/native-removal-fit-intake-v1/yun-config.json"


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

    def test_top_group_needs_exact_ordered_members_without_partial_matches(self):
        prims = self.doc["meshes"][0]["primitives"]
        prims.append({**prims[1], "material": 4})
        self.doc["materials"].append({**self.doc["materials"][1], "name": "Fixture_Tops_02_CLOTH"})
        members = [self.mapping["top"], {**self.mapping["top"], "primitive": 4, "material": 4}]
        for bad in ([members[0]], members[::-1], [*members, members[1]], [members[0], self.mapping["shoes"]],
                    [members[0], {**members[1], "skin": False}]):
            with self.subTest(wrong=bad), self.assertRaisesRegex(ValueError, "top removal members"):
                package.garment_selection(self.doc, self.consumer, self.item, verified_top_members=bad)
        self.item["garmentSelection"] = dict(self.mapping, top=members)
        selections = package.garment_selection(self.doc, self.consumer, self.item, verified_top_members=members)[2]
        self.assertEqual([member["primitive"] for member in selections[0][1]], [1, 4])
        self.assertEqual(selections[1:], [('bottom', 2, 'Bottoms'), ('shoes', 3, 'Shoes')])

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
        for row in self.config["items"]:
            historical = package.DEFAULT / row["id"]
            for path in historical.iterdir():
                actual = (self.output / row["id"] / path.name).read_bytes()
                if path.name in {"extraction.json", "import-spec.json"}:
                    actual = actual.replace(self.output.relative_to(package.ROOT).as_posix().encode(),
                                            package.DEFAULT.relative_to(package.ROOT).as_posix().encode())
                self.assertEqual(package.sha(actual), package.sha(path.read_bytes()), path.name)
        before = snapshot(self.output)
        self.assertEqual(first, package.build(self.config,self.output))
        self.assertEqual(before,snapshot(self.output))
        batch = json.loads((self.output/"import-batch.json").read_bytes())
        report = package.importer.execute(batch,package.ROOT,self.output.parent/"runtime-inputs")
        self.assertTrue(report["passed"],report)
        self.assertEqual([r["bodySha256"] for r in report["items"]],[r["bodySha256"] for r in first["items"]])

    def test_external_recipe_claims_cannot_replace_native_replay(self):
        self.config["items"] = self.config["items"][:1]
        item = self.config["items"][0]
        raw = package.encode({"schema": "native-top-removal-fit-receipt-v1", "status": "native-top-and-skin-verified"})
        path = self.output.parent / "fake.json"
        path.write_bytes(raw)
        item["topRemovalRecipe"] = {"path": path.relative_to(package.ROOT).as_posix(), "sha256": package.sha(raw)}
        del self.config["donor"], self.config["mask"]
        rejected = package.build(self.config, self.output)
        self.assertFalse(rejected["passed"])
        self.assertIn("Unknown native top removal fit recipe", rejected["items"][0]["reason"])
        self.assertFalse(list(self.output.iterdir()))
        item["topRemovalRecipe"]["sha256"] = "0" * 64
        rejected = package.build(self.config, self.output)
        self.assertIn("recipe SHA mismatch", rejected["items"][0]["reason"])

    def test_item_without_removal_proof_still_needs_the_legacy_inputs(self):
        self.config["items"][0]["topRemovalRecipe"] = {"path": "unused.json", "sha256": "0" * 64}
        del self.config["donor"]
        with self.assertRaisesRegex(ValueError, "Missing required package input: donor"):
            package.build(self.config, self.output)
        self.assertFalse(self.output.exists())

    def test_authoring_identity_and_verified_recipe_outputs(self):
        row = self.config["items"][0]
        studio_sha = row["candidate"]["sha256"]
        row["topRemovalRecipe"] = self.config["authoringBatch"]
        donor, masked = b"verified original layout", b"masked"
        templ = self.config["template"]["sha256"]
        saved = "7" * 64
        proof = dict(schema="native-top-removal-fit-receipt-v1", status="native-top-and-skin-verified",
                     donor={"sha256": package.sha(donor), "bytes": len(donor)}, coveredPngSha256=package.sha(masked),
                     sourceSha256=studio_sha, originalEditableSha256=templ, referenceSha256="8" * 64,
                     groupId="test-group", coldGroupReadback=False, members=[{"primitive": 1}])
        with patch("native_top_removal_fit.derive", return_value=(donor, masked, proof)):
            with self.assertRaisesRegex(ValueError, "original editable differs"):
                package.removal_inputs(self.config, row, saved)
            self.config["baseline"] = row["candidate"]
            self.assertEqual(package.removal_inputs(self.config, row, saved), (donor, masked, proof))
            self.config["baseline"] = {"sha256": "0" * 64}
            proof["originalEditableSha256"] = saved
            self.assertEqual(package.removal_inputs(self.config, row, saved)[0], donor)
            proof["sourceSha256"] = "1" * 64
            with self.assertRaisesRegex(ValueError, "source differs"):
                package.removal_inputs(self.config, row, saved)

    @unittest.skipUnless((package.ROOT / "output/native-group-extractor-13/studio-13-nami-yu.vrm").exists(),
                         "Private studio multi-primitive source unavailable")
    def test_real_multi_part_top_with_singleton_bottom_and_shoes(self):
        folder = package.ROOT / "output/native-group-extractor-13"
        source = folder / "studio-13-nami-yu.vrm"
        spec = dict(sourcePath=source.relative_to(package.ROOT).as_posix(),
                    sourceSha256="254fedea6b91273df2f1d6f06670b954f3a77a3aa0d14dc4b679aeda475ee83a",
                    sourceNode=112, sourceNodeName="Body", sourceMesh=1, sourceSkin=1,
                    idPrefix="test-", equipmentId="test-13", limits=["CPU fixture", "Bindings only"])
        members = [dict(node=112, mesh=1, skin=1, primitive=p, material=m) for p, m in ((3, 11), (4, 12))]
        body = package.GLB(source)
        _, _, _, consumer = package.skin.body(body)
        selections = package.garment_selection(body.doc, consumer, {"id": "multi-part-test"},
                                               verified_top_members=members)[2]
        files = package.extract_garments(spec, selections, self.output.parent)
        catalog = json.loads(files["equipment.json"])
        self.assertEqual([e["slot"] for e in catalog["items"]], ["top", "bottom", "shoes"])
        single = package.equipment.extract(dict(spec, primitives=selections[1:]), self.output.parent)
        for entry in catalog["items"]:
            path = self.output.parent / entry["url"]
            path.write_bytes(files[entry["url"]])
            expected = [3, 4] if entry["slot"] == "top" else None
            package.bindings_and_buffers(body, package.GLB(path), entry, expected_primitives=expected)
            if expected is None:
                self.assertEqual(files[entry["url"]], single[entry["url"]])

    @unittest.skipUnless(YUN_CONFIG.exists(), "Private Yun Lan native receipts unavailable")
    def test_relocated_authoring_inputs_keep_the_same_runtime_bytes(self):
        config = json.loads(YUN_CONFIG.read_bytes())
        item, = config["items"]
        first = package.build(config, self.output)
        self.assertTrue(first["passed"], first)
        moved = self.output.parent / "moved-inputs"
        moved.mkdir()
        source = package.pinned(item["candidate"])
        author = json.loads(package.pinned(config["authoringResult"]).read_bytes())
        record, = [r for r in author["items"] if r["id"] == item["id"]]
        shutil.copyfile(source, moved / source.name)
        editable = record["editable"]["path"]
        shutil.copyfile(source.parent / editable, moved / editable)
        item["candidate"]["path"] = (moved / source.name).relative_to(package.ROOT).as_posix()
        recipe = package.pinned(item["topRemovalRecipe"]).read_bytes() + b"\n"
        recipe_path = moved / "reformatted.json"
        recipe_path.write_bytes(recipe)
        item["topRemovalRecipe"] = dict(path=recipe_path.relative_to(package.ROOT).as_posix(), sha256=package.sha(recipe))
        again = self.output.parent / "replayed"
        self.assertEqual(package.build(config, again), first)
        before, after = self.output / item["id"], again / item["id"]
        runtime = json.loads((before / "import-spec.json").read_bytes())["files"]
        self.assertEqual(len(runtime), 7)
        for name in runtime:
            self.assertEqual((before / name).read_bytes(), (after / name).read_bytes(), name)
        lineage = json.loads((after / "manifest.json").read_bytes())["sourceMaskLineage"]
        self.assertEqual(set(lineage), {"sourceSha256", "referenceSha256", "originalEditableSha256", "coveredPngSha256",
                                        "groupId", "members", "coldGroupReadback"})
        self.assertNotEqual((before / "provenance.json").read_bytes(), (after / "provenance.json").read_bytes())

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
