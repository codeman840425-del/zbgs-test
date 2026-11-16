"""Parameterize the unchanged pinned torso-coverage rule over three exact inputs."""

import ast
import collections
import hashlib
import json
from pathlib import Path
import sys
import struct
import time

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "assets-source/m2-vest-body-coverage-v1"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
        "utf-8"
    )


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked(ref):
    path = (ROOT / ref["path"]).resolve()
    require(path.is_relative_to(ROOT), "Input path escapes source root")
    raw = path.read_bytes()
    require(
        len(raw) == ref["bytes"] and sha(raw) == ref["sha256"],
        "Input SHA/bytes mismatch: " + ref["path"],
    )
    return raw


def original_rule(raw):
    tree = ast.parse(raw)
    load = next(
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "load"
    )

    def assigned(node, name):
        return isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == name for t in node.targets
        )

    start = next(i for i, n in enumerate(tree.body) if assigned(n, "bp"))
    end = next(i for i, n in enumerate(tree.body) if assigned(n, "report"))
    return compile(
        ast.Module(body=[load], type_ignores=[]), "<pinned-torso-load>", "exec"
    ), compile(
        ast.Module(body=tree.body[start : end + 1], type_ignores=[]),
        "<pinned-torso-rule>",
        "exec",
    )


def context(spec, case, loader):
    entry = json.loads(checked(case["entry"]))
    fit = json.loads(checked(case["fit"]))
    checked(case["body"])
    checked(case["top"])
    require(
        entry["sha256"] == case["top"]["sha256"]
        and entry["id"] == fit["top"]["id"]
        and fit["top"]["sha256"] == entry["sha256"],
        "New top resource/entry/fit identity differs",
    )
    require(
        entry["compatibleAvatarSha256"]
        == fit["body"]["sha256"]
        == case["body"]["sha256"],
        "Exact body dependency differs",
    )
    ns = {
        "np": np,
        "collections": collections,
        "hashlib": hashlib,
        "json": json,
        "struct": struct,
    }
    exec(loader, ns)
    bd, br, bsha = ns["load"](ROOT / case["body"]["path"])
    td, tr, tsha = ns["load"](ROOT / case["top"]["path"])
    require(
        bsha == case["body"]["sha256"] and tsha == case["top"]["sha256"],
        "Loaded source identity differs",
    )
    checked(spec["originalBody"])
    original, read_original, _ = ns["load"](ROOT / spec["originalBody"]["path"])
    reference = original["meshes"][0]["primitives"][0]
    actual = bd["meshes"][0]["primitives"][0]
    require(
        np.array_equal(br(actual["indices"]), read_original(reference["indices"])),
        "Body topology differs from semantic landmark contract",
    )
    relation = {
        "indexExact": True,
        "positionCountEqual": len(br(actual["attributes"]["POSITION"]))
        == len(read_original(reference["attributes"]["POSITION"])),
        "attributes": {},
    }
    require(relation["positionCountEqual"], "Body vertex layout differs")
    for key in ["JOINTS_0", "WEIGHTS_0", "TEXCOORD_0"]:
        relation["attributes"][key] = np.array_equal(
            br(actual["attributes"][key]), read_original(reference["attributes"][key])
        )
        require(
            relation["attributes"][key], "Body semantic/UV dependency differs: " + key
        )
    names = lambda doc: [doc["nodes"][i]["name"] for i in doc["skins"][0]["joints"]]
    require(names(bd) == names(original), "Body skin joint order differs")
    relation["jointNamesExact"] = True
    ns.update(bd=bd, br=br, bsha=bsha, td=td, tr=tr, tsha=tsha, bodyRelation=relation)
    return ns, entry, fit


def generate(spec, case, loader, rule):
    ns = {}
    try:
        ns, entry, fit = context(spec, case, loader)
        exec(rule, ns)
    except Exception as error:
        diagnostic = {
            "error": str(error),
            "stage": "pinned-original-rule",
            "case": case["id"],
            "bodySha256": case["body"]["sha256"],
            "topSha256": case["top"]["sha256"],
        }
        if "candidates" in ns:
            diagnostic["hemFanCandidates"] = [
                {"center": int(c), "faceCount": len(f)} for c, f in ns["candidates"]
            ]
        if "centers" in ns:
            diagnostic["degree16Centers"] = ns["centers"].tolist()
        if "accepted" in ns:
            diagnostic["admittedFacesBeforeComponent"] = len(ns["accepted"])
        return None, diagnostic, ns
    report = ns["report"]
    report.update(
        id=entry["id"] + "-body-coverage-v1",
        topId=entry["id"],
        topSha256=entry["sha256"],
        avatarSha256=case["body"]["sha256"],
        sourceCase=case["id"],
        sourceRuleSha256=spec["ruleSource"]["sha256"],
        sourceSpec="assets-source/m2-vest-body-coverage-v1/spec.json",
        topFitIdentity={
            "id": fit["id"],
            "sha256": case["fit"]["sha256"],
            "path": case["fit"]["path"],
            "targetBodySha256": fit["body"]["sha256"],
            "topAssetSha256": fit["top"]["sha256"],
        },
        status="source-safe-coverage-candidate; runtime and exposed-boundary validation pending",
        runtimeAccepted=False,
    )
    require(
        report["bodyIndexComponentType"] == 5125, "Runtime full Body index type differs"
    )
    return report, None, ns


def write_new(path, raw):
    require(
        not path.exists() or path.read_bytes() == raw,
        "Existing candidate differs; preserve its identity",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(raw)


def main():
    started = time.perf_counter()
    spec = json.loads((BASE / "spec.json").read_bytes())
    source = checked(spec["ruleSource"])
    loader, rule = original_rule(source)
    old_mask = json.loads(checked(spec["originalMask"]))
    json.loads(checked(spec["layerManifest"]))
    manifest = {
        "schema": "vest-body-coverage-batch-v1",
        "version": 1,
        "sourceSpecSha256": sha((BASE / "spec.json").read_bytes()),
        "ruleSource": spec["ruleSource"],
        "layerManifestSha256": spec["layerManifest"]["sha256"],
        "cases": [],
        "runtimeAccepted": False,
        "topologyWiringCorrectionsUsed": 0,
    }
    for case in spec["cases"]:
        report, failure, ns = generate(spec, case, loader, rule)
        folder = BASE / "generated" / case["id"]
        if failure:
            raw = encoded(failure)
            write_new(folder / "FAILED.json", raw)
            manifest["cases"].append(
                {"id": case["id"], "status": "failed", "failure": failure}
            )
            continue
        original = set(old_mask["selectedFaceIds"])
        selected = set(report["selectedFaceIds"])
        report["originalMaskDifference"] = {
            "sameBodyIndexTopology": report["bodyIndexAccessorSha256"]
            == old_mask["bodyIndexAccessorSha256"],
            "unchangedFaces": sorted(selected & original),
            "newSafeFaces": sorted(selected - original),
            "originalFacesNotSelected": sorted(original - selected),
        }
        detail = encoded(report)
        fit = {k: v for k, v in report.items() if k != "sourceSelectionSamples"}
        fit["sourceSelectionReport"] = "source-selection-report.json"
        fit["sourceSelectionReportSha256"] = sha(detail)
        raw = encoded(fit)
        write_new(folder / "source-selection-report.json", detail)
        write_new(folder / "coverage-fit.json", raw)
        manifest["cases"].append(
            {
                "id": case["id"],
                "status": "source-safe-candidate",
                "bodySha256": case["body"]["sha256"],
                "topId": report["topId"],
                "topSha256": report["topSha256"],
                "selectedFaces": len(selected),
                "descriptor": {
                    "url": spec["publicPrefix"] + case["id"] + "/coverage-fit.json",
                    "sha256": sha(raw),
                },
                "files": {
                    "fit": {
                        "path": (folder / "coverage-fit.json")
                        .relative_to(ROOT)
                        .as_posix(),
                        "sha256": sha(raw),
                        "bytes": len(raw),
                    },
                    "report": {
                        "path": (folder / "source-selection-report.json")
                        .relative_to(ROOT)
                        .as_posix(),
                        "sha256": sha(detail),
                        "bytes": len(detail),
                    },
                },
            }
        )
    write_new(BASE / "generated/manifest.json", encoded(manifest))
    costs = {
        "sourceGenerationWallSeconds": time.perf_counter() - started,
        "cases": len(spec["cases"]),
        "sourceRuleUnchanged": True,
        "GPUUsed": False,
        "scope": "This generator invocation only. No motion/browser acceptance.",
    }
    with (BASE / "cost-runs.jsonl").open("ab") as output:
        output.write(encoded(costs))
    print(
        json.dumps(
            {
                "cases": [
                    (r["id"], r["status"], r.get("selectedFaces"))
                    for r in manifest["cases"]
                ],
                "seconds": costs["sourceGenerationWallSeconds"],
            }
        )
    )
    return (
        0
        if all(r["status"] == "source-safe-candidate" for r in manifest["cases"])
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
