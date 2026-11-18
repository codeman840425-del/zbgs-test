"""Recover the source Body PNG from a pinned native removal export, entirely in memory."""

import copy
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

from native_body_package import geometry
from native_dependency_delta import Export, node_state, read_pinned, ref, texture_consumers
from native_skin_tone_package import BODY, SLOTS, require, sha, skin_surface


def coverage(source_png, removed_png):
    """Count native alpha recovery in texture space. Counts include all atlas texels."""
    pixels = []
    for data in (source_png, removed_png):
        with Image.open(io.BytesIO(data)) as im:
            require(im.format == "PNG" and im.mode == "RGBA" and data[24:26] == b"\x08\x06"
                    and not im.is_animated and not im.info, "Expected native 8-bit RGBA PNG")
            pixels.append(np.asarray(im))
    source, removed = pixels
    require(source.shape == removed.shape, "Body PNG dimensions differ")
    require(np.array_equal(source[..., :3], removed[..., :3]), "Body RGB differs")
    old, new = source[..., 3], removed[..., 3]
    facts = {
        "width": source.shape[1], "height": source.shape[0], "rgbExact": True,
        "sourceAlphaSha256": sha(old.tobytes()), "removedAlphaSha256": sha(new.tobytes()),
        "sourceNonOpaquePixels": int((old < 255).sum()),
        "alphaIncreasedPixels": int((new > old).sum()), "alphaDecreasedPixels": int((new < old).sum()),
        "restoredAtMaskCutoffPixels": int(((old < 128) & (new >= 128)).sum()),
        "residualBelowCutoffPixels": int((new < 128).sum()), "residualNonOpaquePixels": int((new < 255).sum()),
    }
    require(facts["residualNonOpaquePixels"] == 0,
            f'Removed Body PNG retains {facts["residualNonOpaquePixels"]} nonopaque texels '
            f'({facts["residualBelowCutoffPixels"]} below cutoff)')
    require(facts["restoredAtMaskCutoffPixels"] > 0, "Removed Body PNG has no visible mask recovery")
    return facts


def body_data(export):
    doc = export.doc
    require(BODY in export.names["materials"], "Missing native Body skin material")
    material = export.names["materials"].index(BODY)
    owners = [(mi, pi, p) for mi, mesh in enumerate(doc["meshes"]) for pi, p in enumerate(mesh["primitives"])
              if ref(doc["materials"], p["material"])["name"] == BODY]
    require(len(owners) == 1, "Expected one Body material primitive")
    mi, pi, prim = owners[0]
    nodes = [i for i, n in enumerate(doc["nodes"]) if n.get("mesh") == mi]
    require(len(nodes) == 1, "Expected one node owning the Body skin primitive")
    owner = nodes[0]
    node = doc["nodes"][owner]
    topology = prim.get("mode", 4) == 4 and set(prim) <= {"mode", "attributes", "indices", "material", "extras"}
    require(topology and not prim.get("extras", {}).get("targetNames"), "Expected unmorphed Body triangles")
    attributes = prim["attributes"]
    require(set(attributes) == {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"},
            "Unsupported Body attributes")

    # Resolve and check embedded accessor bounds before the skin reader uses indexed UV0.
    def stream(accessor, width, kinds):
        values, normalized = export.accessor(accessor)
        require(values.shape[1] == width and values.dtype.kind in kinds and not normalized,
                "Unsupported Body accessor encoding")
        return values

    indices = stream(prim["indices"], 1, "u").ravel()
    require(len(indices) % 3 == 0, "Invalid Body triangle count")
    widths = {"POSITION": 3, "NORMAL": 3, "TEXCOORD_0": 2, "JOINTS_0": 4, "WEIGHTS_0": 4}
    fields = {}
    for key, ai in attributes.items():
        values = stream(ai, widths[key], "u" if key == "JOINTS_0" else "f")
        require(indices.max() < len(values), "Invalid Body vertex index for " + key)
        fields[key] = values[indices]
    weights = fields["WEIGHTS_0"]
    require(np.all(weights >= 0) and np.allclose(weights.sum(axis=1), 1, rtol=0, atol=1e-5),
            "Invalid Body skin weights")
    skin = ref(doc["skins"], node["skin"])
    names = [export.name("nodes", j) for j in skin["joints"]]
    ibm = stream(skin["inverseBindMatrices"], 16, "f")
    joints = fields.pop("JOINTS_0")
    require(joints.max() < len(names) and len(set(names)) == len(ibm) == len(names), "Invalid Body joint table")
    active = joints[weights > 0]
    active_ids = np.unique(active)
    by_name = {names[j]: sha(ibm[j].tobytes()) for j in active_ids}
    # Joint ordinals change when clothing bones disappear. Canonical ordinals use only weighted names.
    canonical = {n: i for i, n in enumerate(sorted(by_name))}
    palette = np.asarray([canonical.get(n, -1) for n in names], dtype="<i4")
    field_hashes = {key: sha(v.tobytes()) for key, v in fields.items()}
    field_hashes["weightedJointNames"] = sha(palette[active].tobytes())
    states = node_state(export)
    frames = {}
    for start in [*by_name, node["name"], export.name("nodes", skin["skeleton"])]:
        name = start
        seen = set()
        while name is not None:
            require(name not in seen, "Cycle in Body joint hierarchy")
            seen.add(name)
            state = states[name]
            frames[name] = {k: state[k] for k in ("parent", "matrix", "rotation", "scale", "translation") if k in state}
            name = state["parent"]

    mat = doc["materials"][material]
    texture = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    tex = ref(doc["textures"], texture)
    ref(doc["samplers"], tex["sampler"])
    image = ref(doc["images"], tex["source"])
    require(image["mimeType"] == "image/png" and sum(t["source"] == tex["source"] for t in doc["textures"]) == 1,
            "Body requires one texture for the embedded PNG")
    consumers = texture_consumers(doc)
    for index in consumers:
        referenced = ref(doc["textures"], index)
        ref(doc["images"], referenced["source"])
        ref(doc["samplers"], referenced["sampler"])
    require(consumers[texture] == [f"materials[{material}].{slot}" for slot in SLOTS],
            "Unexpected Body skin texture consumer")
    require(sum(i["bufferView"] == image["bufferView"] for i in doc["images"]) == 1,
            "Another image shares the Body PNG view")
    ii, png, routing = skin_surface(export.glb, BODY)
    require(routing["baseColorFactor"][3] == 1, "Body base alpha factor changes the effective mask cutoff")
    info = {"material": material, "texture": texture, "image": ii, "pngSha256": sha(png), "node": owner,
            "mesh": mi, "primitive": pi, "skin": node["skin"], "skinJoints": len(names), "slots": list(SLOTS)}
    surface = {"bodyNode": node["name"], "skinRoot": export.name("nodes", skin["skeleton"]),
               "routing": routing, "fields": field_hashes, "weightedInverseBinds": by_name, "frames": frames}
    return png, info, surface


def build_donor(source: Path, removed: Path, *, source_sha256: str, removed_sha256: str) -> tuple[bytes, dict]:
    """Return an original-layout VRM and a CPU readback. Native operation lineage is a caller prerequisite."""
    source_ref, original = read_pinned(Path(source), source_sha256)
    removed_ref, removal = read_pinned(Path(removed), removed_sha256)
    before, after = Export(original), Export(removal)
    old, source_info, source_surface = body_data(before)
    new, removed_info, removed_surface = body_data(after)
    for key in source_surface:
        require(source_surface[key] == removed_surface[key], "Body surface correspondence differs at " + key)
    pixels = coverage(old, new)

    ii = source_info["image"]
    source_bin = before.glb.bin
    candidate = geometry.encode(copy.deepcopy(before.doc), source_bin, ii, new)
    actual = Export(candidate)
    view_id = len(before.doc["bufferViews"])
    start = len(source_bin) + (-len(source_bin) % 4)
    end = start + len(new)
    require(actual.doc["images"][ii]["bufferView"] == view_id and actual.buffer_length == end
            and actual.view(view_id) == {"buffer": 0, "byteOffset": start, "byteLength": len(new)},
            "Unexpected donor PNG layout")
    normalized = copy.deepcopy(actual.doc)
    normalized["bufferViews"].pop()
    normalized["images"][ii]["bufferView"] = before.doc["images"][ii]["bufferView"]
    normalized["buffers"][0]["byteLength"] = before.buffer_length
    require(normalized == before.doc and actual.glb.bin[:len(source_bin)] == source_bin,
            "Donor source structure or original BIN bytes changed")
    require(actual.glb.bin[start:end] == new and all(a == b for i, (a, b) in
            enumerate(zip(before.image_hashes, actual.image_hashes, strict=True)) if i != ii),
            "Donor image readback differs")
    def signature(value):
        return sha(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode())

    report = {
        "schema": "native-removal-skin-donor-v1", "status": "cpu-donor-verified",
        "source": source_ref | source_info, "removed": removed_ref | removed_info,
        "donor": {"sha256": sha(candidate), "bytes": len(candidate)}, "coverage": pixels,
        "surface": {"materialName": BODY, **source_surface["routing"], "indexedStreams": source_surface["fields"],
                    "weightedJoints": len(source_surface["weightedInverseBinds"]),
                    "weightedInverseBindsSha256": signature(source_surface["weightedInverseBinds"]),
                    "jointFrames": len(source_surface["frames"]), "jointFramesSha256": signature(source_surface["frames"])},
        "preserved": {"originalBinaryBytes": len(source_bin), "originalBufferViews": view_id,
                      "originalAccessors": len(before.doc["accessors"]), "otherImages": len(before.image_hashes) - 1,
                      "originalDocumentExceptBodyImageAndAppendLayout": True},
        "nativeGroupAttributionVerified": False, "runtimeFitVerified": False,
    }
    return candidate, report
