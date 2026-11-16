"""Read back source safe faces and review supplied running-pose boundaries."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import types

sys.dont_write_bytecode = True
import numpy as np
import build


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def pose_review(spec, case, report, ns, attribution):
    pose = json.loads(build.checked(case["runningPose"]))
    require = build.require
    require(
        pose["bodySha256"] == case["body"]["sha256"],
        "Running pose body identity differs",
    )
    body = next(m for m in pose["meshes"] if m["role"] == "body")
    top = next(
        m
        for m in pose["meshes"]
        if m["role"] == "top"
        and m["materials"][0]["name"]
        == ns["td"]["materials"][ns["tp"]["material"]]["name"]
    )
    require(
        np.array_equal(
            np.array(body["positions"]).astype("<f4"), ns["P"].astype("<f4")
        ),
        "Running Body vertex layout differs",
    )
    fit = json.loads(build.checked(case["fit"]))
    require(
        hashlib.sha256((build.ROOT / case["upstreamFitPath"]).read_bytes()).hexdigest()
        == case["fit"]["sha256"],
        "Copied corrected fit differs from upstream identity",
    )
    layer = module(
        "coverage_layer_geometry",
        build.ROOT / "scripts/m2-vest-layer-fit-v1/geometry.py",
    )
    new_top_world = layer.skin(ns["T"].astype(float), top)
    body_world = np.array(body["worldPositions"])
    representatives = [
        int(np.flatnonzero(ns["inv"] == i)[0]) for i in range(len(ns["U"]))
    ]
    segments = new_top_world[np.array(representatives)[np.array(ns["ringEdges"])]]
    zone = new_top_world[ns["TF"][np.any(ns["unsafe"][ns["TF"]], axis=1)]]
    za = zone[:, 0]
    zab = zone[:, 1] - za
    zac = zone[:, 2] - za
    zn = np.cross(zab, zac)
    zn /= np.linalg.norm(zn, axis=1)[:, None]
    d00 = (zab * zab).sum(1)
    d01 = (zab * zac).sum(1)
    d11 = (zac * zac).sum(1)
    ss = segments[:, 1] - segments[:, 0]
    scope = {
        "np": np,
        "zone": zone,
        "za": za,
        "zab": zab,
        "zac": zac,
        "zn": zn,
        "d00": d00,
        "d01": d01,
        "d11": d11,
        "zden": d00 * d11 - d01 * d01,
        "segments": segments,
        "ss": ss,
        "den": (ss * ss).sum(1),
    }
    zone_distance = types.FunctionType(ns["zoneClearance"].__code__, scope)
    hem_distance = types.FunctionType(ns["clearance"].__code__, scope)
    boundary_vertices = np.unique(report["sourceBoundaryEdges"])
    distances = [
        {
            "bodyVertex": int(i),
            "neckSleeveZoneDistanceM": zone_distance(body_world[i]),
            "hemPerimeterDistanceM": hem_distance(body_world[i]),
        }
        for i in boundary_vertices
    ]
    diagnostic = module(
        "coverage_pose_projection",
        build.ROOT / "scripts/diagnose-representative-vest-source.py",
    )
    projected, _ = diagnostic.project(new_top_world, pose["camera"])
    triangles = projected[ns["TF"]]
    selected = set(report["selectedFaceIds"])
    barycentric = np.vstack(
        [
            np.eye(3),
            np.array([[1 / 3] * 3, [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]),
        ]
    )
    missing = []
    samples = 0
    for face in report["selectedFaceIds"]:
        for bc in barycentric:
            point = bc @ body_world[ns["BF"][face]]
            screen, _ = diagnostic.project(point[None], pose["camera"])
            hit = diagnostic.cover(
                screen[0, :2], triangles[:, :, :2], triangles[:, :, 2]
            )
            samples += 1
            if hit is None:
                missing.append({"bodyFace": int(face), "barycentric": bc.tolist()})
    observed = next(r for r in attribution["cases"] if r["id"] == case["id"])
    face_by_indices = {tuple(face): i for i, face in enumerate(ns["BF"])}
    pixels = [
        p for p in observed["pixels"] if p["bodyAhead"] and p["nearestRole"] == "body"
    ]
    mapped = [face_by_indices.get(tuple(p["body"]["indices"])) for p in pixels]
    return {
        "sourceBuild": attribution["sourceBuild"],
        "mode": pose["mode"],
        "virtualNewTopInRecordedRun": True,
        "observedPaleBodyPixels": len(pixels),
        "observedPixelsOnGeneratedSafeFaces": sum(i in selected for i in mapped),
        "observedBodyFaces": sorted({int(i) for i in mapped if i is not None}),
        "uncoveredObservedBodyFaces": sorted(
            {int(i) for i in mapped if i is not None and i not in selected}
        ),
        "selectedFaceProjectedSamples": samples,
        "samplesOutsideTopProjection": missing,
        "boundaryVertexDistances": distances,
        "minimumPosedNeckSleeveDistanceM": min(
            d["neckSleeveZoneDistanceM"] for d in distances
        ),
        "minimumPosedHemDistanceM": min(d["hemPerimeterDistanceM"] for d in distances),
        "limits": [
            "Pose pixels are comparison evidence only and never select hidden faces. New top is evaluated virtually in the recorded live palette.",
            "Projected overlap and boundary distances at this single run pose do not grant motion or exposed-skin acceptance. Rest 25mm margin is not an animated threshold.",
        ],
    }


def main():
    spec = json.loads((build.BASE / "spec.json").read_bytes())
    batch = json.loads((build.BASE / "generated/manifest.json").read_bytes())
    loader, rule = build.original_rule(build.checked(spec["ruleSource"]))
    original_mask = json.loads(build.checked(spec["originalMask"]))
    attribution = json.loads(build.checked(spec["attribution"]))
    checks = []
    relations = []
    reviews = []

    def check(name, passed, detail=None):
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    immutable = []
    for case in spec["cases"]:
        for key in ["body", "top", "entry", "fit", "runningPose"]:
            immutable.append(case[key])
        row = next(r for r in batch["cases"] if r["id"] == case["id"])
        check(
            "source-case-admitted-" + case["id"],
            row["status"] == "source-safe-candidate",
        )
        fit = json.loads(build.checked(row["files"]["fit"]))
        report = json.loads(build.checked(row["files"]["report"]))
        recomputed, failure, ns = build.generate(spec, case, loader, rule)
        check(
            "fresh-original-rule-same-selection-" + case["id"],
            failure is None and fit["selectedFaceIds"] == recomputed["selectedFaceIds"],
        )
        relations.append({"case": case["id"], **ns["bodyRelation"]})
        check(
            "original-body-index-and-skin-relationship-" + case["id"],
            all(ns["bodyRelation"]["attributes"].values())
            and ns["bodyRelation"]["indexExact"]
            and ns["bodyRelation"]["jointNamesExact"],
        )
        check(
            "existing-runtime-schema-" + case["id"],
            fit["schema"] == "zbgs-outfit-body-coverage-candidate.1"
            and fit["bodyIndexComponentType"] == 5125
            and fit["bodyFaceCount"] == len(ns["BF"]),
        )
        check(
            "exact-body-new-top-dependencies-" + case["id"],
            fit["avatarSha256"] == case["body"]["sha256"]
            and fit["topSha256"] == case["top"]["sha256"]
            and fit["topId"] == json.loads(build.checked(case["entry"]))["id"],
        )
        check(
            "exact-selected-face-identities-" + case["id"],
            fit["selectedTriangles"] == ns["BF"][fit["selectedFaceIds"]].tolist()
            and len(set(fit["selectedFaceIds"])) == len(fit["selectedFaceIds"]),
        )
        check(
            "old-thresholds-retained-" + case["id"],
            all(
                fit["method"][key] == original_mask["method"][key]
                for key in [
                    "minBodyAllowedWeight",
                    "topBoundaryWeightThreshold",
                    "boundaryMarginM",
                    "outwardRayMinM",
                    "outwardRayMaxM",
                    "outwardNormalDotMin",
                    "samplesPerFace",
                    "componentSeedFaces",
                ]
            ),
        )
        check(
            "actual-20-point-hem-" + case["id"],
            len(fit["method"]["realHemCapFaces"]) == 20
            and len(fit["method"]["realHemRingWeldVertices"]) == 20,
        )
        minimum_zone = minimum_hem = np.inf
        minimum_ray = np.inf
        maximum_ray = 0.0
        minimum_dot = 1.0
        count = 0
        for face, detail in report["sourceSelectionSamples"].items():
            indices = ns["BF"][int(face)]
            samples = [
                (int(vertex), None, sample)
                for vertex, sample in zip(indices, detail["vertexSamples"])
            ] + [
                (None, np.array(s["barycentric"]), s) for s in detail["interiorSamples"]
            ]
            for vertex, bc, sample in samples:
                q = ns["P"][vertex] if vertex is not None else bc @ ns["P"][indices]
                normal = (
                    ns["N"][vertex] if vertex is not None else bc @ ns["N"][indices]
                )
                normal = normal / np.linalg.norm(normal)
                zone = ns["zoneClearance"](q)
                hem = ns["clearance"](q)
                hit = ns["ray"](q, normal)
                check_values = (
                    hit is not None
                    and hit["topFace"] == sample["hit"]["topFace"]
                    and abs(hit["distanceM"] - sample["hit"]["distanceM"]) < 1e-10
                )
                if not check_values:
                    raise ValueError("Actual saved ray sample differs")
                minimum_zone = min(minimum_zone, zone)
                minimum_hem = min(minimum_hem, hem)
                minimum_ray = min(minimum_ray, hit["distanceM"])
                maximum_ray = max(maximum_ray, hit["distanceM"])
                minimum_dot = min(
                    minimum_dot, float(ns["norm"][hit["topFace"]] @ normal)
                )
                count += 1
        check(
            "actual-seven-point-distance-ray-gates-" + case["id"],
            count == 7 * len(fit["selectedFaceIds"])
            and minimum_zone >= 0.025
            and minimum_hem >= 0.025
            and minimum_ray > 0.0001
            and maximum_ray <= 0.03
            and minimum_dot > 0.15,
            {
                "samples": count,
                "minimumNeckSleeveM": minimum_zone,
                "minimumHemM": minimum_hem,
                "rayRangeM": [minimum_ray, maximum_ray],
                "minimumOutwardDot": minimum_dot,
            },
        )
        review = pose_review(spec, case, report, ns, attribution)
        reviews.append({"case": case["id"], **review})
        check(
            "observed-body-pixels-in-generated-selection-" + case["id"],
            review["observedPixelsOnGeneratedSafeFaces"]
            == review["observedPaleBodyPixels"],
        )
    bad = copy.deepcopy(spec["cases"][0]["top"])
    bad["sha256"] = "0" * 64
    try:
        build.checked(bad)
    except ValueError as error:
        check("negative-source-sha-rejected", True, str(error))
    else:
        check("negative-source-sha-rejected", False)
    check(
        "all-source-assets-unchanged",
        all(
            build.sha((build.ROOT / r["path"]).read_bytes()) == r["sha256"]
            for r in immutable
        ),
    )
    result = {
        "schema": "vest-body-coverage-static-qa-v1",
        "status": "passed" if all(c["passed"] for c in checks) else "failed",
        "checks": checks,
        "bodyRelationships": relations,
        "runningPoseReview": reviews,
        "runtimeAccepted": False,
        "limits": [
            "Source-safe masks and one supplied running-pose review only. Full walk/run/sit/rise, exposed boundaries, switching and full-body restore remain pending."
        ],
    }
    (build.BASE / "qa-report.json").write_bytes(build.encoded(result))
    print(
        json.dumps(
            {
                "status": result["status"],
                "checks": len(checks),
                "passed": sum(c["passed"] for c in checks),
                "running": [
                    {
                        "id": r["case"],
                        "expectedPixels": r["observedPaleBodyPixels"],
                        "onSelected": r["observedPixelsOnGeneratedSafeFaces"],
                        "outsideTopSamples": len(r["samplesOutsideTopProjection"]),
                    }
                    for r in reviews
                ],
            }
        )
    )
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
