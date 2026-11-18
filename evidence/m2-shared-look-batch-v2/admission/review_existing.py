"""Join the already captured pants-and-socks facts without issuing admission."""
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/production"))
from native_batch_gate import room_candidate_index
from outfit_admission import (evidence_pin, exact_entry, normalized_equipment, record_outfit, require, verify_guard_report,
                              verify_room_report, verify_runtime_readback)


EVIDENCE = Path(__file__).resolve().parent.parent


def read(path):
    return json.loads(path.read_bytes())


def evidence_report():
    records_path = EVIDENCE / "records.json"
    inventory_path = EVIDENCE / "inventory.json"
    game_path = EVIDENCE / "game/report.json"
    guards_path = EVIDENCE / "guards/report.json"
    budget_path = EVIDENCE / "admission/static-budget.json"
    media_path = EVIDENCE / "media.json"
    diagnostic_path = EVIDENCE / "diagnostic/plan.json"
    release_path = EVIDENCE / "release/plan.json"
    review_path = ROOT / "scripts/runtime-package/game-record-production-outfit-selection-reviewed.json"
    diagnostic, release = map(read,(diagnostic_path,release_path))
    records, inventory, game, guards, budget = map(read,(records_path,inventory_path,game_path,guards_path,budget_path))
    runtime = inventory["runtime"]
    reviewed = read(review_path)
    require(all(runtime[key] == reviewed[key] for key in ("sourceCommit","sourceDigest")), "Reviewed build pin differs")
    require(guards["status"] == "passed" and not guards["pageErrors"] and
            {row["name"] for row in guards["cases"]} == {
                "mismatched-sock-sha", "mismatched-body-sha", "another-bodys-sock", "missing-sock",
                "tampered-complete-record", "resource-503", "valid-remove-and-retry",
            } and all(row["activeUnchanged"] for row in guards["cases"]), "Guard report is incomplete")
    require(budget["sourceCommit"] == runtime["sourceCommit"] and
            budget["inputSha256"] == evidence_pin(records_path,ROOT)["sha256"] and
            budget["ordinaryPCPerformance"] == "unmeasured", "Budget evidence is not for these exact source records")
    require(release["acceptedCount"] == 0, "This report expects a diagnostic-only batch")
    media = read(media_path)
    items = []
    for record in records:
        identity = record["identity"]["id"]
        sha = record["integrity"]["recordSha256"]
        recipe_sha = record["integrity"]["recipeSha256"]
        recipe = record["appearanceRecipe"]
        base, equipment = recipe["base"], recipe["equipment"]
        body_type, body_sha = base["bodyType"], base["sha256"]
        pins = record_outfit(record)
        planned = exact_entry(diagnostic["items"],"stableId",identity)
        selected = planned["selection"]
        require(planned["status"] == "candidate" and selected["bodySha256"] == body_sha and
                selected["outfit"]["role"] == equipment["role"] and
                normalized_equipment(selected["outfit"]["equipment"]) == pins,
                "Diagnostic plan did not select this complete outfit")
        runtime_pin = {key:runtime[key] for key in ("sourceCommit","sourceDigest","buildId")}
        verify_runtime_readback(game,inventory,record,runtime_pin)
        verify_guard_report(guards,record,runtime_pin)
        room_path = EVIDENCE / f"room-{identity}/report.json"
        room = read(room_path)
        room_index = room_candidate_index(room_path, ROOT)[body_sha]
        verify_room_report(room,record,runtime_pin)
        movie = exact_entry(media,"path",f"room-{identity}/room-produced-1x.webm")
        require(movie["decodedFrames"] > 0 and movie["lastTimestampMs"] > 0, "Room movie is missing")
        measured = exact_entry(budget["records"],"recordSha256",sha)
        garments = {item["id"]:item["sha256"] for item in measured["models"]
                    if item["class"] == "garment" and item["selected"]}
        require(measured["avatarSha256"] == body_sha and garments == {item["id"]:item["sha256"] for item in pins},
                "Static budget omitted selected garments")
        license_paths = [ROOT/"docs/ASSETS.md",ROOT/"assets-source/m2-socks-layer-v1/provenance.json",
                         ROOT/("assets-source/foundation-male/source.json" if body_type == "male"
                               else "assets-source/foundation/source.json")]
        items.append({
            "id":identity,"body":base,"role":equipment["role"],"equipment":pins,
            "recipeSha256":recipe_sha,"recordSha256":sha,
            "variant":{key:selected[key] for key in ("styleId","variantVersion","recipeSha256","resourceManifest",
                                                       "resourceManifestSha256","fitManifest","coverageManifest",
                                                       "coverageManifestSha256")},
            "lanes":{
                "equipmentFit":{"status":"technical-candidate","packageInventory":evidence_pin(inventory_path,ROOT)},
                "normalSpeedMotion":{"status":"technical-playback","tasks":["walk","sit","stand","walk"],
                                     "room":room_index["report"],"input":room_index["inputRecord"],
                                     "video":evidence_pin(EVIDENCE/movie["path"],ROOT),"measurement":movie},
                "recordAndRestore":{"status":"technical-pass","recordInput":evidence_pin(records_path,ROOT),
                                    "gameReport":evidence_pin(game_path,ROOT)},
                "selectionGuards":{"status":"technical-pass-same-recipe","report":evidence_pin(guards_path,ROOT),
                                   "inputRecordSha256":exact_entry(guards["before"]["active"],"id",identity)["recordSha256"]},
                "runtimeRecordAndBudget":{"status":"blocked","static":measured["status"],"ordinaryPC":"unmeasured",
                                         "report":evidence_pin(budget_path,ROOT),
                                         "excesses":[{"resource":model["id"],"metrics":model["assetExcesses"]}
                                                     for model in measured["models"] if model["assetExcesses"]]},
                "humanVisualReview":{"status":"pending"},
                "provenanceAndRights":{"status":"source-records-only","sources":[evidence_pin(path,ROOT) for path in license_paths]},
            },
            "outstanding":["Verify outfit fit and contact for this release.",
                           "Resolve static body and top excesses and complete exact-record four-layer budget admission.",
                           "Obtain scoped human visual review for this fixed build and outfit.",
                           "Confirm intended distribution scope against these exact source records."],
            "admitted":False,
        })
    return {"schema":"zbgs-whole-outfit-technical-readiness-v1","status":"review-required",
            "runtime":{key:runtime[key] for key in ("sourceCommit","sourceDigest","buildId")},
            "diagnosticPlan":evidence_pin(diagnostic_path,ROOT),"formalPlan":evidence_pin(release_path,ROOT),
            "reviewedRuntime":evidence_pin(review_path,ROOT),"items":items,"acceptedForRuntime":[]}


if __name__ == "__main__":
    print(json.dumps(evidence_report(),ensure_ascii=False,indent=2))
