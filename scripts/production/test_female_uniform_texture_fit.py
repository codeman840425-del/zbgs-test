"""Targeted rejection checks for the exact female source and fitted outfit."""

from copy import deepcopy
import json
from pathlib import Path
import unittest

import female_uniform_texture_fit as fit
from flow import GLB, Validator
from stripped_outfit_equipment import BodyReadback


class FemaleUniformTextureFitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reader = Validator()
        cls.old = BodyReadback(cls.reader.pin(fit.PARENT, fit.PARENT_SHA))
        cls.target_bytes = fit.TARGET.read_bytes()
        cls.new = BodyReadback(cls.target_bytes)
        cls.near_catalog, cls.far_catalog = (json.loads(cls.reader.pin(*pin)) for pin in fit.CATALOGS)
        recipes = json.loads(cls.reader.pin(*fit.COVERAGE_SPEC))
        [cls.spec] = [r for r in recipes["items"] if r["id"] == fit.ROLES["topFar"][0]]

    def item(self, role):
        return self.reader.item(self.far_catalog if role == "topFar" else self.near_catalog, fit.ROLES[role][0])

    def test_an_old_body_cannot_be_submitted_as_the_release(self):
        with self.assertRaisesRegex(ValueError, "candidate SHA"):
            fit.build(fit.ROOT / fit.PARENT)

    def test_rejects_a_changed_body_position_stream(self):
        changed = BodyReadback(self.target_bytes)
        attrs = changed.doc["meshes"][0]["primitives"][0]["attributes"]
        attrs["POSITION"] = attrs["NORMAL"]
        with self.assertRaisesRegex(ValueError, "glTF or VRM semantics changed"):
            fit.prove_body(self.old, changed)

    def test_rejects_a_changed_body_material(self):
        changed = BodyReadback(self.target_bytes)
        changed.doc["materials"][0]["name"] = "Different Body material"
        with self.assertRaisesRegex(ValueError, "glTF or VRM semantics changed"):
            fit.prove_body(self.old, changed)

    def test_rejects_an_actual_wrong_material_even_with_current_file_hash(self):
        wrong = dict(self.item("pants"), id=fit.ROLES["top"][0], slot="top")
        with self.assertRaisesRegex(ValueError, "Unexpected garment material"):
            fit.fit_item(self.reader, "top", wrong, fit.CATALOGS[0][0], self.old.glb, self.new.glb)

    def test_rejects_an_altered_named_bind_matrix(self):
        item = deepcopy(self.item("shoes"))
        item["bindings"][0]["inverseBindMatrix"][12] += 0.01
        with self.assertRaisesRegex(ValueError, "Inverse bind mismatch"):
            fit.fit_item(self.reader, "shoes", item, fit.CATALOGS[0][0], self.old.glb, self.new.glb)

    def test_rejects_a_wrong_vertex_in_the_252_face_mask(self):
        near, far = self.item("top"), self.item("topFar")
        model = GLB(self.reader.pin(self.reader.url(far["url"]), far["sha256"], far["bytes"]))
        rule = json.loads(self.reader.pin(*fit.FAR_COVERAGE))
        rule["selectedVertices"][0] += 1
        new_item = dict(far, id=fit.RELEASE_IDS["topFar"], compatibleAvatarSha256=fit.TARGET_SHA)
        with self.assertRaisesRegex(ValueError, "Coverage source selection differs: selectedVertices"):
            fit.rebind_coverage(self.reader, "topFar", rule, {}, self.new.glb, model, near, far, new_item, self.spec)

    def test_refuses_output_outside_its_private_stage_before_reading(self):
        with self.assertRaisesRegex(ValueError, "unredirected female fit output"):
            fit.run(Path("nonexistent-body.vrm"), fit.ROOT / "output" / "wrong-fit-path", False)


if __name__ == "__main__":
    unittest.main()
