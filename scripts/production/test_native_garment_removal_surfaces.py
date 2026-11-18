import copy
import unittest

import numpy as np

from native_garment_removal_surfaces import compare, surface_hash


class RemovalSurfaceTest(unittest.TestCase):
    def test_face_and_vertex_reindexing_preserves_winding_and_multiplicity(self):
        pos = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], dtype="<f4")
        uv = pos[:, :2]
        faces = np.array([[0, 1, 2], [0, 2, 3]], dtype="<u4")
        original = surface_hash(pos, uv, faces)
        reordered = np.array([[0, 3, 1], [2, 1, 3]], dtype="<u2")
        self.assertEqual(original, surface_hash(pos[::-1], uv[::-1], reordered))
        self.assertNotEqual(original, surface_hash(pos, uv, faces[:, ::-1]))
        self.assertNotEqual(original, surface_hash(pos, uv, np.concatenate([faces, faces[:1]])))

    def test_exact_two_member_removal_and_wrong_body_guards(self):
        names = ["skin", "outer", "lining"]
        source = {("Body", name): {
            "selector": dict(node=5, mesh=1, skin=1, primitive=i, material=i + 2),
            "triangles": 1, "surfaceSha256": name,
        } for i, name in enumerate(names)}
        after = {("Body", "skin"): copy.deepcopy(source[("Body", "skin")])}
        members = [source[("Body", n)]["selector"] for n in names[1:]]
        self.assertEqual(len(compare(source, after, members)["removed"]), 2)
        with self.assertRaisesRegex(ValueError, "differ"):
            compare(source, after, members[:1])
        with self.assertRaisesRegex(ValueError, "Repeated"):
            compare(source, after, [*members, members[0]])
        with self.assertRaisesRegex(ValueError, "Invalid"):
            compare(source, after, [dict(members[0], skin=True)])
        with self.assertRaisesRegex(ValueError, "Unexpected new"):
            compare(source, {**after, ("Body", "other"): {}}, members)
        after[("Body", "skin")]["surfaceSha256"] = "different"
        with self.assertRaisesRegex(ValueError, "changed"):
            compare(source, after, members)
