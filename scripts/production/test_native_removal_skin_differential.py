"""Exercise real native streams, including legal reindexing and false-preservation controls."""
import json
from pathlib import Path
import unittest

import numpy as np

from native_import import embedded_glb
from native_mesh_budget import encode
from native_removal_skin_differential import verify_surviving_skin


ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "evidence/m2-garment-group-input-v1/native-removal-control.json"
TYPES = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTH = {"VEC2": 2, "VEC3": 3, "VEC4": 4, "SCALAR": 1, "MAT4": 16}


def stream(doc, binary, i):
    a = doc["accessors"][i]
    view = doc["bufferViews"][a["bufferView"]]
    dtype, width = np.dtype(TYPES[a["componentType"]]), WIDTH[a["type"]]
    return np.ndarray((a["count"], width), dtype=dtype, buffer=binary,
                      offset=a.get("byteOffset", 0) + view.get("byteOffset", 0),
                      strides=(view.get("byteStride", dtype.itemsize * width), dtype.itemsize))


class SkinDifferentialTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = json.loads(SPEC.read_bytes())
        cls.source, cls.reference = [(ROOT / cls.spec[k]["path"]).read_bytes() for k in ("source", "reference")]

    def setUp(self):
        self.doc, data = embedded_glb(self.reference)
        self.binary = bytearray(data)
        self.node = next(n for n in self.doc["nodes"] if n.get("name") == "Body")
        self.skin = self.doc["skins"][self.node["skin"]]
        self.parts = self.doc["meshes"][self.node["mesh"]]["primitives"]
        self.part = next(p for p in self.parts if "Body_00_SKIN" in self.doc["materials"][p["material"]]["name"])
        self.attrs = self.part["attributes"]

    def values(self, key):
        return stream(self.doc, self.binary, self.attrs[key])

    def run_diff(self):
        return verify_surviving_skin(self.source, encode(self.doc, self.binary), self.spec["members"])

    def test_actual_pair_and_discovered_members_agree(self):
        report = self.run_diff()
        self.assertEqual(verify_surviving_skin(self.source, self.reference), report)
        self.assertEqual((report["matchingSurfaces"], report["matchingTriangles"]), (13, 53654))
        body = next(r for r in report["surfaces"] if "Body_00_SKIN" in r["material"])
        self.assertEqual((body["weightedJoints"], body["reorderedWeightedSlots"]), (56, 44))

    def test_permuted_palettes_vertices_faces_influences_and_unused_vertex(self):
        self.skin["joints"].reverse()
        ibm = stream(self.doc, self.binary, self.skin["inverseBindMatrices"])
        ibm[:] = ibm[::-1].copy()
        joints = self.values("JOINTS_0")
        joints[:] = len(self.skin["joints"]) - 1 - joints[:, ::-1].copy()
        weights = self.values("WEIGHTS_0")
        weights[:] = weights[:, ::-1].copy()
        original_count = len(weights)
        for p in self.parts:
            ids = stream(self.doc, self.binary, p["indices"]).reshape(-1, 3)
            ids[:] = original_count - 1 - np.roll(ids[::-1].copy(), 1, axis=1)
        # Replace the shared streams with reversed rows and one extra unreferenced row.
        extra = bytearray()
        for i in self.attrs.values():
            a = self.doc["accessors"][i]
            old = stream(self.doc, self.binary, i)
            chunk = old[::-1].tobytes() + bytes(old[0].nbytes)
            a["bufferView"] = len(self.doc["bufferViews"])
            a["byteOffset"] = 0
            a["count"] += 1
            self.doc["bufferViews"].append({"buffer": 0, "byteOffset": len(self.binary) + len(extra),
                                            "byteLength": len(chunk)})
            extra.extend(chunk)
        self.binary = self.binary + extra
        self.doc["buffers"][0]["byteLength"] = len(self.binary)
        report = self.run_diff()
        body = next(r for r in report["surfaces"] if "Body_00_SKIN" in r["material"])
        self.assertEqual(body["referenceVertexRows"], 8420)
        self.assertEqual(body["sourceDrawnVertices"], body["referenceDrawnVertices"])

    def test_nonzero_weights_swapped_at_one_drawn_vertex(self):
        ids = stream(self.doc, self.binary, self.part["indices"])[:, 0]
        weights = self.values("WEIGHTS_0")
        vertex = next(i for i in ids if weights[i, 0] != weights[i, 1] and weights[i, 1] > 0)
        weights[vertex, [0, 1]] = weights[vertex, [1, 0]]
        with self.assertRaisesRegex(ValueError, "Body/.*changed weightedCorners"):
            self.run_diff()

    def test_active_inverse_bind_changed_with_same_joint_names(self):
        v = stream(self.doc, self.binary, self.part["indices"])[0, 0]
        slot = self.values("JOINTS_0")[v, np.argmax(self.values("WEIGHTS_0")[v])]
        stream(self.doc, self.binary, self.skin["inverseBindMatrices"])[slot, 12] += 0.02
        with self.assertRaisesRegex(ValueError, "changed inverseBinds"):
            self.run_diff()

    def test_changed_owner_frame_and_humanoid_roles(self):
        self.node["translation"] = [0, .01, 0]
        with self.assertRaisesRegex(ValueError, "changed frames: Body"):
            self.run_diff()
        del self.node["translation"]
        roles = self.doc["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"]
        roles["leftEye"], roles["rightEye"] = roles["rightEye"], roles["leftEye"]
        with self.assertRaisesRegex(ValueError, "changed frames: .*Eye"):
            self.run_diff()

    def test_cycle_and_nonfinite_drawn_attribute_refused(self):
        v = stream(self.doc, self.binary, self.part["indices"])[0, 0]
        normal = self.values("NORMAL")
        original = normal[v, 0]
        normal[v, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "non-finite|Non-finite"):
            self.run_diff()
        normal[v, 0] = original
        root = self.skin["skeleton"]
        descendant = self.doc["nodes"][root]["children"][0]
        self.doc["nodes"][descendant].setdefault("children", []).append(root)
        with self.assertRaisesRegex(ValueError, "Cycle|Multiple parents"):
            self.run_diff()


if __name__ == "__main__":
    unittest.main()
