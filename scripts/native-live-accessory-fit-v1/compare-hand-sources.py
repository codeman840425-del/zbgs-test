"""CPU identity check for hand grip reuse across native source VRMs."""
import hashlib, json, pathlib, struct, numpy as np
from scipy.spatial.transform import Rotation
ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCES = {
    "female843ac": ROOT / "assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm",
    "femaleFace": ROOT / "assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm",
    "femaleWaist": ROOT / "assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm",
    "male7586": ROOT / "assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm",
}

def load(path):
    raw = path.read_bytes(); size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + size]); binary = raw[28 + size:]
    def acc(index):
        a = doc["accessors"][index]; view = doc["bufferViews"][a["bufferView"]]
        dtype = np.dtype({5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]])
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = view.get("byteStride", width * dtype.itemsize)
        return np.ndarray((a["count"], width), dtype=dtype, buffer=binary,
                          offset=offset, strides=(stride, dtype.itemsize)).copy()
    return raw, doc, acc

def main():
    loaded = {key: load(path) for key, path in SOURCES.items()}
    base_raw, base, base_acc = loaded["female843ac"]
    human = {name: item["node"] for name, item in base["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"].items()}
    base_skin = base["skins"][0]
    hand_semantics = [name for name in human if name == "rightHand" or name.startswith(("rightThumb", "rightIndex", "rightMiddle", "rightRing", "rightLittle"))]
    selected_nodes = [human[name] for name in hand_semantics]
    joint_ids = base_skin["joints"]
    primitive = base["meshes"][1]["primitives"][0]
    base_pos = base_acc(primitive["attributes"]["POSITION"])
    base_joints = base_acc(primitive["attributes"]["JOINTS_0"])
    base_weights = base_acc(primitive["attributes"]["WEIGHTS_0"])
    base_weights = base_weights / base_weights.sum(1, keepdims=True)
    selected = np.unique(base_acc(primitive["indices"]))
    selected = selected[np.sum(base_weights[selected] * np.isin(np.array(joint_ids)[base_joints[selected]], selected_nodes), axis=1) > .5]
    result = {"schema": "native-live-accessory-hand-source-comparison-v1", "reference": {
        "id": "female843ac", "sha256": hashlib.sha256(base_raw).hexdigest(),
        "handVertexCount": int(len(selected)), "selectedNodeSemantics": hand_semantics
    }, "rows": []}
    def rest_worlds(doc):
        parents = {child: i for i, node in enumerate(doc["nodes"]) for child in node.get("children", [])}
        cache = {}
        def at(index):
            if index not in cache:
                node = doc["nodes"][index]
                if "matrix" in node:
                    local = np.array(node["matrix"], dtype=float).reshape(4, 4).T
                else:
                    local = np.eye(4)
                    local[:3, :3] = Rotation.from_quat(node.get("rotation", [0, 0, 0, 1])).as_matrix() @ np.diag(node.get("scale", [1, 1, 1]))
                    local[:3, 3] = node.get("translation", [0, 0, 0])
                cache[index] = (at(parents[index]) if index in parents else np.eye(4)) @ local
            return cache[index]
        return np.array([at(i) for i in range(len(doc["nodes"]))])
    for key, path in SOURCES.items():
        raw, doc, acc = loaded[key]
        skin = doc["skins"][0]; p = doc["meshes"][1]["primitives"][0]
        pos, joints, weights = acc(p["attributes"]["POSITION"]), acc(p["attributes"]["JOINTS_0"]), acc(p["attributes"]["WEIGHTS_0"])
        weights = weights / weights.sum(1, keepdims=True)
        ibm = acc(skin["inverseBindMatrices"])
        row_human = {name: item["node"] for name, item in doc["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"].items()}
        row_hand_semantics = [name for name in row_human if name == "rightHand" or name.startswith(("rightThumb", "rightIndex", "rightMiddle", "rightRing", "rightLittle"))]
        row_nodes = [row_human[name] for name in row_hand_semantics]
        own_selected = np.unique(acc(p["indices"]))
        own_selected = own_selected[np.sum(weights[own_selected] * np.isin(np.array(skin["joints"])[joints[own_selected]], row_nodes), axis=1) > .5]
        influence_node_ids = sorted(set(int(item) for item in np.array(skin["joints"])[joints[own_selected]].reshape(-1)))
        worlds = rest_worlds(doc)
        named_influence_nodes = {name: row_human[name] for name in row_human if row_human[name] in influence_node_ids}
        ibm = acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        result["rows"].append({
            "id": key, "source": str(path.relative_to(ROOT)).replace("\\", "/"), "sha256": hashlib.sha256(raw).hexdigest(),
            "skinIndex": 0, "jointCount": len(skin["joints"]), "inverseBindSha256": hashlib.sha256(ibm.tobytes()).hexdigest(),
            "positionAccessor": p["attributes"]["POSITION"], "positionCount": len(pos),
            "handPositionMaxDiffMetres": float(np.max(np.linalg.norm(pos[selected] - base_pos[selected], axis=1))) if key != "male7586" else None,
            "handPositionSameAsFemale843ac": bool(key == "female843ac" or (key != "male7586" and np.array_equal(pos[selected], base_pos[selected]))),
            "jointsSameAsFemale843ac": bool(np.array_equal(joints, base_joints)),
            "weightsSameAsFemale843ac": bool(np.array_equal(weights, base_weights)),
            "selectedHandVertexCount": int(np.sum(np.sum(weights[selected] * np.isin(np.array(skin["joints"])[joints[selected]], row_nodes), axis=1) > .5)),
            "influenceNodeIds": influence_node_ids,
            "influenceHumanoidSemantics": named_influence_nodes,
            "influenceInverseBindBySemantic": {name: ibm[skin["joints"].index(node)].tolist() for name, node in named_influence_nodes.items()},
            "influenceRestWorldBySemantic": {name: worlds[node].tolist() for name, node in named_influence_nodes.items()},
            "jointRestNodeIds": {name: doc["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"][name]["node"] for name in ("rightHand", "rightIndexProximal", "rightMiddleProximal", "rightRingProximal", "rightLittleProximal", "rightThumbMetacarpal")},
        })
    out = ROOT / "assets-source/native-live-accessory-fit-v1/hand-source-comparison.json"
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
