"""Read actual exported tops, preserved data and all supplied static state gaps."""

import copy
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
import build
from geometry import gap, skin, shape_checks, updated_normals


def main():
    spec = json.loads((build.BASE / "spec.json").read_bytes())
    batch = json.loads((build.BASE / "generated/manifest.json").read_bytes())
    template, weights, rows = build.load_inputs(spec)
    checks = []

    def check(name, passed, detail=None):
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    check(
        "one-common-amplitude-within-cap",
        0 < batch["commonAmplitudeM"] <= spec["rule"]["displacementCapM"],
    )
    after = []
    for row in rows:
        case = row["case"]
        record = next(r for r in batch["cases"] if r["id"] == case["id"])
        for name, ref in record["files"].items():
            build.checked(ref)
        target = build.mesh(record["files"]["top.glb"], spec["templateMaterial"])
        old, new = row["top"]["model"], target["model"]
        check(
            "nodes-skins-" + case["id"],
            old.doc["nodes"] == new.doc["nodes"]
            and old.doc["skins"] == new.doc["skins"],
        )
        check(
            "materials-textures-images-" + case["id"],
            old.doc["materials"] == new.doc["materials"]
            and old.doc.get("textures") == new.doc.get("textures")
            and old.images() == new.images(),
        )
        for source_skin in old.doc["skins"]:
            check(
                "inverse-binds-" + case["id"],
                np.array_equal(
                    old.acc(source_skin["inverseBindMatrices"]),
                    new.acc(source_skin["inverseBindMatrices"]),
                ),
            )
        body = build.GLB(build.ROOT / case["body"]["path"])

        def bones(model):
            return {
                model.doc["nodes"][node]["name"]: matrix
                for skin in model.doc["skins"]
                for node, matrix in zip(
                    skin["joints"], model.acc(skin["inverseBindMatrices"])
                )
            }

        body_bones = bones(body)
        check(
            "actual-body-binding-" + case["id"],
            all(
                name in body_bones and np.array_equal(value, body_bones[name])
                for name, value in bones(new).items()
            ),
        )
        for mi, mesh in enumerate(old.doc["meshes"]):
            for pi, a in enumerate(mesh["primitives"]):
                b = new.doc["meshes"][mi]["primitives"][pi]
                label = case["id"] + "/" + str(mi) + "/" + str(pi)
                check(
                    "topology-" + label,
                    np.array_equal(old.acc(a["indices"]), new.acc(b["indices"])),
                )
                for attribute, index in a["attributes"].items():
                    if a is row["top"]["primitive"] and attribute in [
                        "POSITION",
                        "NORMAL",
                    ]:
                        continue
                    check(
                        "preserved-" + label + "/" + attribute,
                        np.array_equal(
                            old.acc(index), new.acc(b["attributes"][attribute])
                        ),
                    )
        expected = (
            row["top"]["positions"]
            + weights[:, None]
            * batch["commonAmplitudeM"]
            * np.array(spec["rule"]["sourceDirection"])
        ).astype("<f4")
        check(
            "exact-recipe-position-" + case["id"],
            np.array_equal(expected, target["positions"].astype("<f4")),
        )
        check(
            "unchanged-outside-patch-" + case["id"],
            np.array_equal(
                row["top"]["positions"][weights == 0], target["positions"][weights == 0]
            ),
        )
        n, normal_report = updated_normals(
            row["top"]["positions"],
            target["positions"],
            target["faces"],
            row["top"]["normals"],
        )
        check(
            "split-normal-recalculation-" + case["id"],
            np.array_equal(n.astype("<f4"), target["normals"].astype("<f4")),
        )
        lengths = np.linalg.norm(target["normals"], axis=1)
        check(
            "finite-unit-normals-" + case["id"],
            np.isfinite(target["normals"]).all()
            and lengths.min() > 0.999
            and lengths.max() < 1.001,
        )
        shape = shape_checks(
            row["top"]["positions"],
            target["positions"],
            target["faces"],
            spec["shapeThresholds"],
        )
        check("fold-edge-smoothness-" + case["id"], shape["passed"], shape)
        aliases = {}
        for index, position in enumerate(template["positions"]):
            aliases.setdefault(tuple(position), []).append(index)
        check(
            "position-aliases-have-no-new-crack-" + case["id"],
            all(
                np.max(
                    np.linalg.norm(
                        target["positions"][ids] - target["positions"][ids[0]], axis=1
                    )
                )
                < 1e-7
                for ids in aliases.values()
            ),
        )
        core = np.flatnonzero(np.any(weights[target["faces"]] > 0, axis=1))
        for state in row["states"]:
            points = (
                skin(target["positions"], state["topLive"])
                if state["topLive"]
                else target["positions"]
            )
            measured = gap(
                points,
                target["faces"],
                state["bottom"],
                row["bottom"]["faces"],
                core,
                row["candidates"],
                state["camera"],
            )
            check(
                "actual-all-affected-patch-gap-" + case["id"] + "/" + state["name"],
                measured["minimumGapM"] >= spec["rule"]["clearanceTargetM"],
                measured,
            )
            after.append({"case": case["id"], "state": state["name"], **measured})
        fit = json.loads(build.checked(record["files"]["fit.json"]))
        entry = json.loads(build.checked(record["files"]["equipment-entry.json"]))
        check(
            "body-bottom-new-top-identity-" + case["id"],
            fit["body"] == case["body"]
            and fit["bottom"]["sha256"] == case["bottom"]["sha256"]
            and entry["sha256"] == record["files"]["top.glb"]["sha256"]
            and entry["compatibleAvatarSha256"] == case["body"]["sha256"]
            and entry["id"] != record["sourceTopId"],
        )
        check(
            "repeat-glb-serialization-" + case["id"],
            build.rewrite(row["top"], target["positions"], target["normals"])
            == build.checked(record["files"]["top.glb"]),
        )
    bad = copy.deepcopy(spec["cases"][0]["top"])
    bad["sha256"] = "0" * 64
    try:
        build.checked(bad)
    except ValueError as error:
        check("negative-source-sha-rejected", True, str(error))
    else:
        check("negative-source-sha-rejected", False)
    result = {
        "schema": "vest-layer-fit-static-qa-v1",
        "status": "passed" if all(c["passed"] for c in checks) else "failed",
        "checks": checks,
        "affectedPatchFaces": len(core),
        "actualAfterStates": after,
        "producerSpecSha256": build.sha((build.BASE / "spec.json").read_bytes()),
        "remainingUnexplainedPixel": {
            "case": "female-round-full-v2",
            "sourceBuild": "ed2153a2d822",
            "pixel": [482, 454],
            "status": "unexplained-and-retained",
        },
        "runtimeAccepted": False,
        "scope": "Actual exported GLB readback and 9 supplied static states, full affected 52-face patch. No walking/running/sitting or visual acceptance.",
    }
    (build.BASE / "qa-report.json").write_bytes(build.encoded(result))
    print(
        json.dumps(
            {
                "status": result["status"],
                "checks": len(checks),
                "passed": sum(c["passed"] for c in checks),
                "afterMinimumGapM": min(r["minimumGapM"] for r in after),
            }
        )
    )
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
