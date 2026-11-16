"""Build one common bounded top-layer rule across the fixed static input batch."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np
from geometry import skin, gap, selection, updated_normals, shape_checks

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets-source/m2-vest-layer-fit-v1"
loader = importlib.util.spec_from_file_location(
    "layer_glb", ROOT / "scripts/m2-male-face-v1/glb.py"
)
reader = importlib.util.module_from_spec(loader)
loader.loader.exec_module(reader)
GLB = reader.GLB


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def checked(ref):
    path = (ROOT / ref["path"]).resolve()
    require(path.is_relative_to(ROOT), "Input path leaves root")
    raw = path.read_bytes()
    require(
        sha(raw) == ref["sha256"] and len(raw) == ref["bytes"],
        "Input SHA/bytes mismatch: " + ref["path"],
    )
    return raw


def mesh(ref, material):
    checked(ref)
    model = GLB(ROOT / ref["path"])
    p = next(
        p
        for m in model.doc["meshes"]
        for p in m["primitives"]
        if material in model.doc["materials"][p["material"]]["name"]
    )
    return {
        "model": model,
        "primitive": p,
        "positions": model.acc(p["attributes"]["POSITION"]).astype(float),
        "faces": model.acc(p["indices"]).astype(int).reshape(-1, 3),
        "normals": model.acc(p["attributes"]["NORMAL"]).astype(float),
    }


def live_mesh(pose, role, material=None):
    return next(
        m
        for m in pose["meshes"]
        if m["role"] == role
        and (material is None or m["materials"][0]["name"] == material)
    )


def load_inputs(spec):
    template = mesh(spec["templateTop"], spec["templateMaterial"])
    weights = selection(template["positions"], template["faces"], spec["selection"])
    reference = json.loads(checked(spec["referencePose"]))
    receipt = json.loads(checked(spec["poseReceipt"]))
    require(receipt["build"] == "ed2153a2d822", "Static pose receipt identity differs")
    reference_top = live_mesh(reference, "top", spec["templateMaterial"])
    reference_bottom = live_mesh(reference, "pants")
    support = np.unique(
        template["faces"][np.any(weights[template["faces"]] > 0, axis=1)]
    )
    low, high = template["positions"][support].min(0), template["positions"][
        support
    ].max(0)
    rows = []
    for case in spec["cases"]:
        checked(case["body"])
        equipment = json.loads(checked(case["equipmentManifest"]))
        pose = json.loads(checked(case["posed"]))
        require(
            pose["bodySha256"] == case["body"]["sha256"], "Pose body identity differs"
        )
        top = mesh(case["top"], spec["templateMaterial"])
        bottom = mesh(case["bottom"], "TrainingPants")
        require(
            np.array_equal(top["faces"], template["faces"]),
            "Common top topology differs",
        )
        top_live = live_mesh(pose, "top", spec["templateMaterial"])
        bottom_live = live_mesh(pose, "pants")
        require(
            np.array_equal(
                np.array(top_live["positions"]).astype("<f4"),
                top["positions"].astype("<f4"),
            ),
            "Actual top source differs",
        )
        require(
            np.array_equal(
                np.array(bottom_live["positions"]).astype("<f4"),
                bottom["positions"].astype("<f4"),
            ),
            "Actual bottom source differs",
        )
        triangles = bottom["positions"][bottom["faces"]]
        candidates = np.flatnonzero(
            (triangles[:, :, 1].max(1) >= low[1])
            & (triangles[:, :, 1].min(1) <= high[1])
            & (triangles[:, :, 0].max(1) >= low[0])
            & (triangles[:, :, 0].min(1) <= high[0])
            & (triangles[:, :, 2].mean(1) < 0)
        )
        states = [
            {
                "name": "source-bind",
                "topLive": None,
                "bottom": bottom["positions"],
                "camera": None,
            },
            {
                "name": "recorded-paused",
                "topLive": top_live,
                "bottom": np.array(bottom_live["worldPositions"]),
                "camera": pose["camera"],
            },
            {
                "name": "virtual-original-palette",
                "topLive": reference_top,
                "bottom": skin(bottom["positions"], reference_bottom),
                "camera": reference["camera"],
            },
        ]
        for live, source in [(top_live, top), (bottom_live, bottom)]:
            require(
                np.max(
                    np.linalg.norm(
                        skin(source["positions"], live)
                        - np.array(live["worldPositions"]),
                        axis=1,
                    )
                )
                < 1e-6,
                "Skin palette cannot reproduce captured input",
            )
        rows.append(
            {
                "case": case,
                "top": top,
                "bottom": bottom,
                "states": states,
                "candidates": candidates,
                "equipment": equipment,
            }
        )
    return template, weights, rows


def evaluate(rows, weights, direction, amplitude, core):
    results = []
    for row in rows:
        points = row["top"]["positions"] + weights[:, None] * amplitude * direction
        for state in row["states"]:
            top = skin(points, state["topLive"]) if state["topLive"] else points
            measured = gap(
                top,
                row["top"]["faces"],
                state["bottom"],
                row["bottom"]["faces"],
                core,
                row["candidates"],
                state["camera"],
            )
            results.append(
                {"case": row["case"]["id"], "state": state["name"], **measured}
            )
    return results


def solve(rows, weights, spec):
    rule = spec["rule"]
    direction = np.array(rule["sourceDirection"], float)
    require(
        abs(np.linalg.norm(direction) - 1) < 1e-12,
        "Layer direction must be unit length",
    )
    core = spec["selection"]["coreTriangles"]
    aim = rule["clearanceTargetM"] + rule["exportReserveM"]
    history = []

    def minimum(amplitude):
        states = evaluate(rows, weights, direction, amplitude, core)
        worst = min(states, key=lambda r: r["minimumGapM"])
        history.append(
            {
                "amplitudeM": amplitude,
                "minimumGapM": worst["minimumGapM"],
                "case": worst["case"],
                "state": worst["state"],
            }
        )
        return worst["minimumGapM"], states

    before, initial = minimum(0.0)
    high = rule["displacementCapM"]
    end, at_cap = minimum(high)
    require(
        end >= aim,
        "Required layer clearance exceeds fixed displacement cap: "
        + json.dumps(at_cap),
    )
    low = 0.0
    if before >= aim:
        high = 0.0
    else:
        for _ in range(rule["maxIterations"]):
            if high - low <= rule["solveToleranceM"]:
                break
            middle = (low + high) / 2
            value, _ = minimum(middle)
            if value >= aim:
                high = middle
            else:
                low = middle
        require(
            high - low <= rule["solveToleranceM"],
            "Bounded common amplitude solve did not converge",
        )
    return high, initial, history


def rewrite(source, positions, normals):
    model = source["model"]
    doc = copy.deepcopy(model.doc)
    blob = bytearray(model.bin)
    primitive = next(
        p
        for m in doc["meshes"]
        for p in m["primitives"]
        if p["attributes"]["POSITION"] == source["primitive"]["attributes"]["POSITION"]
    )

    def append(original, values):
        values = np.asarray(values, dtype="<f4")
        blob.extend(b"\0" * (-len(blob) % 4))
        offset = len(blob)
        blob.extend(values.tobytes())
        doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": offset, "byteLength": values.nbytes}
        )
        row = copy.deepcopy(doc["accessors"][original])
        row.update(
            bufferView=len(doc["bufferViews"]) - 1,
            byteOffset=0,
            min=values.min(0).tolist(),
            max=values.max(0).tolist(),
        )
        doc["accessors"].append(row)
        return len(doc["accessors"]) - 1

    primitive["attributes"]["POSITION"] = append(
        primitive["attributes"]["POSITION"], positions
    )
    primitive["attributes"]["NORMAL"] = append(
        primitive["attributes"]["NORMAL"], normals
    )
    doc["asset"]["generator"] = "m2-vest-layer-fit-v1 bounded shared local layer rule"
    doc["buffers"][0]["byteLength"] = len(blob)
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    blob.extend(b"\0" * (-len(blob) % 4))
    return (
        struct.pack("<4sII", b"glTF", 2, 28 + len(text) + len(blob))
        + struct.pack("<I4s", len(text), b"JSON")
        + text
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )


def build_plan(spec):
    template, weights, rows = load_inputs(spec)
    amplitude, before, history = solve(rows, weights, spec)
    direction = np.asarray(spec["rule"]["sourceDirection"], float)
    outputs = {}
    manifest = {
        "schema": "vest-layer-fit-batch-v1",
        "version": 1,
        "specSha256": sha((BASE / "spec.json").read_bytes()),
        "canonicalSpecSha256": sha(encoded(spec)),
        "commonAmplitudeM": amplitude,
        "rule": spec["rule"],
        "selection": {
            "coreTriangles": spec["selection"]["coreTriangles"],
            "seedVertices": spec["selection"]["seedVertices"],
            "weightedVertices": [
                {"vertex": int(i), "weight": float(weights[i])}
                for i in np.flatnonzero(weights)
            ],
        },
        "beforeStates": before,
        "solveTrace": history,
        "cases": [],
        "runtimeAccepted": False,
        "runtimeEvidenceCorrectionsRemaining": 1,
    }
    rounded = []
    for row in rows:
        case = row["case"]
        source = row["top"]
        points = (
            (source["positions"] + weights[:, None] * amplitude * direction)
            .astype("<f4")
            .astype(float)
        )
        normals, normal_report = updated_normals(
            source["positions"], points, source["faces"], source["normals"]
        )
        checks = shape_checks(
            source["positions"], points, source["faces"], spec["shapeThresholds"]
        )
        require(
            checks["passed"],
            "Changed top folded or exceeded edge-smoothness limits: "
            + json.dumps(checks),
        )
        require(
            np.max(np.linalg.norm(points - source["positions"], axis=1))
            <= spec["rule"]["displacementCapM"] + 1e-7,
            "Exported displacement exceeds cap",
        )
        data = rewrite(source, points, normals)
        require(
            data == rewrite(source, points, normals),
            "Repeated GLB byte serialization differs",
        )
        folder = case["id"]
        identifier = "m2-vest-layer-fit-v1-" + folder + "-top"
        old = next(item for item in row["equipment"]["items"] if item["slot"] == "top")
        bottom = next(
            item for item in row["equipment"]["items"] if item["slot"] == "bottom"
        )
        entry = copy.deepcopy(old)
        for field in ["fitResource", "materialRecipes", "sourceResource"]:
            entry.pop(field, None)
        entry.update(
            id=identifier,
            styleId=old.get("styleId", old["id"]),
            fitId=identifier + "-fit-v1",
            url=spec["publicPrefix"] + folder + "/top.glb",
            sha256=sha(data),
            bytes=len(data),
            compatibleAvatarSha256=case["body"]["sha256"],
            sourceSpec="assets-source/m2-vest-layer-fit-v1/spec.json",
            method="Shared bounded outward top layer fit with explicit added displacement after source body adaptation",
            limits=[
                "Static source and supplied paused-pose fit. Walking, running, turning, sitting and dance acceptance pending."
            ],
        )
        fit = {
            "schema": "vest-layer-fit-v1",
            "version": 1,
            "id": entry["fitId"],
            "body": case["body"],
            "bottom": {"id": bottom["id"], **case["bottom"]},
            "sourceTop": {"id": old["id"], **case["top"]},
            "top": {
                "id": identifier,
                "url": entry["url"],
                "sha256": sha(data),
                "bytes": len(data),
            },
            "commonAmplitudeM": amplitude,
            "rule": spec["rule"],
            "extraLayerShiftDeclared": True,
            "unchangedUVTopologySkinIBMTextureMaterial": True,
            "runtimeAccepted": False,
            "runtimeDependencyEnforcement": "Root integration pending",
        }
        vertex_changes = [
            {
                "vertex": int(i),
                "weight": float(weights[i]),
                "beforeM": source["positions"][i].tolist(),
                "afterM": points[i].tolist(),
                "deltaM": (points[i] - source["positions"][i]).tolist(),
            }
            for i in np.flatnonzero(weights)
        ]
        report = {
            "case": folder,
            "shape": checks,
            "normals": normal_report,
            "vertexChanges": vertex_changes,
            "repeatAssetBytesIdentical": True,
            "runtimeAccepted": False,
        }
        outputs[folder + "/top.glb"] = data
        outputs[folder + "/fit.json"] = encoded(fit)
        outputs[folder + "/equipment-entry.json"] = encoded(entry)
        outputs[folder + "/report.json"] = encoded(report)
        manifest["cases"].append(
            {
                "id": folder,
                "sourceTopId": old["id"],
                "newTopId": identifier,
                "bodySha256": case["body"]["sha256"],
                "bottomId": bottom["id"],
                "bottomSha256": case["bottom"]["sha256"],
                "files": {
                    name: {
                        "path": "assets-source/m2-vest-layer-fit-v1/generated/"
                        + folder
                        + "/"
                        + name,
                        "sha256": sha(outputs[folder + "/" + name]),
                        "bytes": len(outputs[folder + "/" + name]),
                    }
                    for name in [
                        "top.glb",
                        "fit.json",
                        "equipment-entry.json",
                        "report.json",
                    ]
                },
            }
        )
        rounded.append((row, points))
    after = []
    for row, points in rounded:
        for state in row["states"]:
            actual = skin(points, state["topLive"]) if state["topLive"] else points
            measured = gap(
                actual,
                row["top"]["faces"],
                state["bottom"],
                row["bottom"]["faces"],
                spec["selection"]["coreTriangles"],
                row["candidates"],
                state["camera"],
            )
            require(
                measured["minimumGapM"] >= spec["rule"]["clearanceTargetM"],
                "Rounded exported geometry misses clearance target",
            )
            after.append(
                {"case": row["case"]["id"], "state": state["name"], **measured}
            )
    manifest["afterStates"] = after
    outputs["manifest.json"] = encoded(manifest)
    return outputs


def main():
    spec = json.loads((BASE / "spec.json").read_bytes())
    try:
        outputs = build_plan(spec)
    except Exception as error:
        failure = {
            "status": "failed",
            "error": str(error),
            "runtimeAccepted": False,
            "specSha256": sha((BASE / "spec.json").read_bytes()),
            "canonicalSpecSha256": sha(encoded(spec)),
        }
        destination = BASE / "generated/FAILED.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        require(
            not destination.exists() or destination.read_bytes() == encoded(failure),
            "Different failure already retained",
        )
        destination.write_bytes(encoded(failure))
        raise
    for name, data in outputs.items():
        path = BASE / "generated" / name
        require(
            not path.exists() or path.read_bytes() == data,
            "Existing output differs; keep candidate identity and failure evidence",
        )
    for name, data in outputs.items():
        path = BASE / "generated" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
    print(
        json.dumps(
            {
                "status": "static-source-fit",
                "commonAmplitudeM": json.loads(outputs["manifest.json"])[
                    "commonAmplitudeM"
                ],
                "cases": len(spec["cases"]),
                "runtimeAccepted": False,
            }
        )
    )


if __name__ == "__main__":
    main()
