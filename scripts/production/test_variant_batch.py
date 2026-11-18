import hashlib
import io
import json
import struct
import subprocess
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from variant_batch import FIXED_MATRIX, QUERY_SCRIPT, SCHEMA, OUT_SCHEMA, main, plan
from outfit_admission import binding_key, evidence_pin, outfit_binding


MEMBER = {"id": "female-uniform-item", "slot": "top", "sha256": "e" * 64}
MATCH = ("uniform-top-v1", "female-base-v1", "v1")
COMMIT = "1"*40
FIT_SHA = "2"*64


def matrix(status="runtime-admitted"):
    row = {
        "bodyType": "female-base-v1",
        "variantVersion": "v1",
        "bodySha256": "a" * 64,
        "resourceManifest": "/assets/body/resource.json",
        "resourceManifestSha256": "b" * 64,
        "fitManifest": "/assets/body/fit.json",
        "coverageManifest": "/assets/body/coverage.json",
        "coverageManifestSha256": "c" * 64,
        "status": status,
    }
    if status == "runtime-admitted":
        row["admissionEvidence"] = "/evidence/admission.json"
        row["recipeSha256"] = "d" * 64
    return {"schema": "zbgs-style-variant-matrix-v1", "styles": [{
        "styleId": "uniform-top-v1", "label": "制服", "variants": [row]
    }]}


class VariantBatchTests(unittest.TestCase):
    def request(self, stable="host-a"):
        return {"schema": SCHEMA, "batchId": "batch-v1", "items": [{
            "stableId": stable, "styleId": "uniform-top-v1", "bodyType": "female-base-v1", "variantVersion": "v1",
            "identity": {"id": stable, "name": "Test Host", "gender": "male"},
            "outfit": {"role": "configured", "equipment": [dict(MEMBER)]},
        }]}

    def query(self):
        return {"female-base-v1": {
            "ok": True,
            "body": {"bodyType": "female-base-v1", "sha256": "a" * 64},
            "outfits": [{"role": "configured", "index": 7, "equipment": [dict(MEMBER)]}],
        }}

    def plan(self, data, request, **options):
        options.setdefault("queries", self.query())
        options.setdefault("members", {MATCH: MEMBER})
        options.setdefault("fit_shas",{MATCH:FIT_SHA})
        options.setdefault("runtime_commit",COMMIT)
        # Synthetic index entry for the exact one-item outfit test fixture.
        row = {**matrix()["styles"][0]["variants"][0],"styleId":MATCH[0]}
        binding = outfit_binding(row,{"role":"configured","equipment":[MEMBER]},FIT_SHA)
        options.setdefault("admissions",{binding_key(binding):{"runtime":{"sourceCommit":COMMIT}}})
        return plan(data, request, **options)

    def test_admitted_row_emits_game_request(self):
        result = self.plan(matrix(), self.request("host-a"))
        self.assertEqual(result["schema"], OUT_SCHEMA)
        self.assertEqual(result["mode"], "runtime-admitted")
        self.assertEqual(result["acceptedCount"], 1)
        request = result["items"][0]["request"]
        self.assertEqual(request, {
            "schema": "character-production-request-v1", "operation": "create", "bodyType": "female-base-v1",
            "identity": {"id": "host-a", "name": "Test Host", "gender": "male"},
            "edits": [{"domain":"outfit", "selection":{"bodySha256":"a"*64, "role":"configured", "equipment":[MEMBER]}}],
        })
        self.assertEqual(result["items"][0]["selection"]["styleId"], "uniform-top-v1")

    def test_candidate_is_rejected_without_fallback(self):
        result = self.plan(matrix("candidate"), self.request("host-b"), admissions={})
        self.assertEqual(result["mode"], "readiness-gated")
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("Whole-outfit runtime admission evidence", result["items"][0]["reason"])

    def test_duplicate_stable_ids_are_isolated(self):
        request = self.request("host-c")
        request["items"].append(dict(request["items"][0]))
        result = self.plan(matrix(), request)
        self.assertEqual(result["acceptedCount"], 1)
        self.assertIn("Duplicate stableId", result["items"][1]["reason"])

    def test_version_selects_exact_matrix_row(self):
        request = self.request("host-d")
        request["items"][0]["variantVersion"] = "v2"
        result = self.plan(matrix(), request)
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("No exact variant", result["items"][0]["reason"])

    def test_diagnostic_mode_can_write_candidate_but_cannot_admit(self):
        result = self.plan(matrix("candidate"), self.request(), diagnostic=True)
        self.assertEqual((result["acceptedCount"], result["candidateCount"], result["rejectedCount"]), (0, 1, 0))
        self.assertEqual(result["mode"], "technical-candidate")
        self.assertIsNone(result["items"][0]["selection"]["admissionEvidence"])
        self.assertEqual(result["items"][0]["request"]["edits"][0]["selection"]["equipment"], [MEMBER])
        result = self.plan(matrix("rejected"), self.request(), diagnostic=True)
        self.assertEqual((result["acceptedCount"], result["candidateCount"], result["rejectedCount"]), (0, 0, 1))

    def test_admitted_status_without_identity_or_query_cannot_emit(self):
        request = self.request()
        del request["items"][0]["identity"]["gender"]
        self.assertIn("identity.id, name and gender", self.plan(matrix(),request)["items"][0]["reason"])
        result = self.plan(matrix(), self.request(), queries={})
        self.assertIn("No verified runtime query", result["items"][0]["reason"])

    def test_outfit_body_and_member_pin_must_be_exact(self):
        query = self.query()
        query["female-base-v1"]["body"]["sha256"] = "w" * 64
        self.assertIn("body differs", self.plan(matrix(),self.request(),queries=query)["items"][0]["reason"])
        wrong_member = {MATCH: {**MEMBER, "sha256": "f" * 64}}
        self.assertIn("exact matrix equipment", self.plan(matrix(),self.request(),members=wrong_member)["items"][0]["reason"])
        request = self.request()
        request["items"][0]["outfit"]["equipment"][0]["sha256"] = "f" * 64
        self.assertIn("No unique configured outfit", self.plan(matrix(),request)["items"][0]["reason"])

    def test_outfit_ambiguity_is_rejected(self):
        query = self.query()
        outfits = query["female-base-v1"]["outfits"]
        outfits.append({**outfits[0], "index": 9})
        self.assertIn("No unique configured outfit", self.plan(matrix(),self.request(),queries=query)["items"][0]["reason"])

    def test_shared_recipe_resolves_resources_once_per_body_and_survives_index_reordering(self):
        request = self.request()
        item = request["items"][0]
        request["sharedLook"] = {"styleId":item["styleId"], "variantVersion":"v1", "outfitRole":"configured"}
        request["items"] = [{"identity":item["identity"], "bodyType":item["bodyType"]}]
        planned = self.plan(matrix(),request)["items"][0]["request"]
        query = self.query()
        query[item["bodyType"]]["outfits"][0]["index"] = 31
        self.assertEqual(self.plan(matrix(),request,queries=query)["items"][0]["request"],planned)
        request["items"].append({"identity":item["identity"],"bodyType":item["bodyType"],"outfit":{"role":"other"}})
        self.assertEqual(self.plan(matrix(),request)["rejectedCount"],1)

    def test_admitted_top_does_not_grant_admission_to_candidate_socks(self):
        data = matrix()
        candidate = matrix("candidate")["styles"][0]["variants"][0]
        data["styles"].append({"styleId": "plain-crew-socks-v1", "variants": [candidate]})
        socks = {"id": "candidate-socks", "slot": "socks", "sha256": "a" * 64}
        request, query = self.request(), self.query()
        request["items"][0]["outfit"]["equipment"].append(socks)
        query["female-base-v1"]["outfits"][0]["equipment"].append(socks)
        result = self.plan(data, request, queries=query)
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("Whole-outfit runtime admission evidence", result["items"][0]["reason"])
        self.assertNotIn("request", result["items"][0])
        diagnostic = self.plan(data, request, queries=query, diagnostic=True)
        self.assertEqual((diagnostic["acceptedCount"],diagnostic["candidateCount"]), (0,1))

    def test_request_cannot_self_approve(self):
        request = self.request()
        request["items"][0]["wholeOutfitAdmission"] = {"status":"passed"}
        result = self.plan(matrix(),request,admissions={})
        self.assertEqual(result["acceptedCount"],0)
        self.assertIn("Whole-outfit runtime admission evidence",result["items"][0]["reason"])

    def test_review_cannot_be_reused_on_other_exact_body_or_style_version(self):
        for change in ("body","version","fit","runtime"):
            data, request, query = matrix(), self.request(), self.query()
            row = data["styles"][0]["variants"][0]
            item = request["items"][0]
            options = {}
            if change == "body":
                row["bodySha256"] = "b"*64
                query[item["bodyType"]]["body"]["sha256"] = row["bodySha256"]
            elif change == "version":
                item["variantVersion"] = row["variantVersion"] = "v2"
                options = {"members": {("uniform-top-v1","female-base-v1","v2"):MEMBER}}
            elif change == "fit":
                options = {"fit_shas": {MATCH:"3"*64}}
            else:
                options = {"runtime_commit": "4"*40}
            result = self.plan(data,request,queries=query,**options)
            self.assertEqual(result["acceptedCount"],0,change)
            self.assertIn("Whole-outfit",result["items"][0]["reason"],change)

    def test_complete_synthetic_outfit_approval_locks_the_sock_sha(self):
        data, request, query = matrix(), self.request(), self.query()
        row = {**data["styles"][0]["variants"][0],"styleId":MATCH[0]}
        chosen = request["items"][0]["outfit"]
        socks = {"id":"test-socks","slot":"socks","sha256":"b"*64}
        chosen["equipment"].append(socks)
        query["female-base-v1"]["outfits"][0]["equipment"].append(socks)
        key = binding_key(outfit_binding(row,chosen,FIT_SHA))
        reviewed = {key:{"runtime":{"sourceCommit":COMMIT}}}
        self.assertEqual(self.plan(data,request,queries=query,admissions=reviewed)["acceptedCount"],1)
        socks["sha256"] = "c"*64
        result = self.plan(data,request,queries=query,admissions=reviewed)
        self.assertEqual(result["acceptedCount"],0)
        self.assertIn("Whole-outfit runtime admission evidence",result["items"][0]["reason"])

    def test_candidate_without_a_parameter_recipe_cannot_use_a_receipt(self):
        result = self.plan(matrix("candidate"), self.request())
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("exact parameter recipe identity", result["items"][0]["reason"])

    def test_receipt_cannot_override_explicit_rejection_or_static_budget(self):
        data = matrix("candidate")
        row = data["styles"][0]["variants"][0]
        row["recipeSha256"] = "d" * 64
        for status, budget_status, reason in (
            ("candidate", "reject-static-over-budget", "static budget over limit"),
            ("rejected", None, "variant explicitly rejected"),
        ):
            row.update(status=status, budgetStatus=budget_status)
            result = self.plan(data, self.request())
            self.assertEqual(result["acceptedCount"], 0)
            self.assertIn(reason, result["items"][0]["reason"])
        row["status"] = "candidate"
        row["budgetStatus"] = "reject-static-over-budget"
        result = self.plan(data, self.request(), diagnostic=True)
        self.assertEqual((result["candidateCount"], result["acceptedCount"]), (1, 0))

    def test_receipt_for_another_style_cannot_admit_candidate(self):
        data = matrix("candidate")
        style = data["styles"][0]
        style["styleId"] = "another-style-v1"
        style["variants"][0].update(recipeSha256="d" * 64, recipeSource="synthetic-author-recipe.json")
        request = self.request()
        request["items"][0]["styleId"] = style["styleId"]
        result = self.plan(data, request, members={(style["styleId"], MATCH[1], MATCH[2]): MEMBER})
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("exact body, version and equipment", result["items"][0]["reason"])

    def test_cli_uses_synthetic_external_review_without_touching_fixed_candidate(self):
        # No real catalogue, record, authority index or production asset is changed.
        workspace = Path(__file__).resolve().parents[2]
        with TemporaryDirectory(dir=workspace, prefix="synthetic-variant-batch-") as temp:
            root = Path(temp).resolve()

            def write(relative, value):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((json.dumps(value) + "\n").encode("utf-8"))
                return path

            def git(*args):
                return subprocess.check_output(["git", "-C", str(root), *args], encoding="utf-8").strip()

            data = matrix("candidate")
            row = data["styles"][0]["variants"][0]
            row["recipeSource"] = "synthetic-author-recipe.json"
            row["recipeSha256"] = evidence_pin(write(row["recipeSource"], {"synthetic": True}))["sha256"]
            inverse_bind = [1 if i % 5 == 0 else 0 for i in range(16)]
            skin = json.dumps({
                "asset": {"version": "2.0"}, "buffers": [{"byteLength": 64}],
                "bufferViews": [{"buffer": 0, "byteLength": 64}],
                "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1, "type": "MAT4"}],
                "nodes": [{"name": "test-bone"}], "skins": [{"inverseBindMatrices": 0, "joints": [0]}],
            }).encode("utf-8")
            skin += b" " * (-len(skin) % 4)
            garment = root / "prototype/public/assets/body/test-garment.glb"
            garment.parent.mkdir(parents=True)
            garment.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(skin) + 64) +
                                struct.pack("<I4s", len(skin), b"JSON") + skin +
                                struct.pack("<I4s16f", 64, b"BIN\0", *inverse_bind))
            garment_pin = evidence_pin(garment)
            member = {**MEMBER, "sha256": garment_pin["sha256"]}
            resource = write("prototype/public/assets/body/resource.json", {"schema": "zbgs-equipment-v1", "items": [{
                **member, "compatibleAvatarSha256": row["bodySha256"], "preserveOriginalBody": True,
                "requiresRawSkeleton": True, "url": "/assets/body/test-garment.glb", "bytes": garment_pin["bytes"],
                "bindings": [{"sourceBone": "test-bone", "targetRawBone": "test-bone", "inverseBindMatrix": inverse_bind}],
            }]})
            manifest_ref = row["resourceManifest"] + "#" + member["id"]
            manifest_sha = evidence_pin(resource)["sha256"]
            row.update(resourceManifest=manifest_ref, resourceManifestSha256=manifest_sha,
                       fitManifest=manifest_ref + ".bindings", fitManifestSha256=manifest_sha,
                       coverageManifest=manifest_ref + ".preserveOriginalBody", coverageManifestSha256=manifest_sha)
            fixed_matrix = write(FIXED_MATRIX, data)
            matrix_bytes = fixed_matrix.read_bytes()
            request_data = self.request()
            request_data["items"][0]["outfit"]["equipment"] = [member]
            request = write("synthetic-request.json", request_data)
            query = root / QUERY_SCRIPT
            query.parent.mkdir(parents=True)
            query_data = self.query()[MATCH[1]]
            query_data["outfits"][0]["equipment"] = [member]
            query.write_text("console.log(JSON.stringify(" + json.dumps(query_data) + "));\n",
                             encoding="utf-8")
            git("init", "-q")
            git("config", "core.autocrlf", "false")
            git("add", ".")
            git("-c", "user.name=Synthetic Fixture", "-c", "user.email=fixture@example.invalid",
                "commit", "-qm", "Synthetic candidate fixture")
            commit = git("rev-parse", "HEAD")
            input_name = "../" + FIXED_MATRIX
            source_sha = hashlib.sha256(input_name.encode() + b"\0" + matrix_bytes + b"\0").hexdigest()
            build = write("synthetic-build-info.json", {"inputs": [input_name]})
            binding = outfit_binding({**row, "styleId": MATCH[0]},
                                     {"role": "configured", "equipment": [member]}, manifest_sha)
            synthetic_index = {binding_key(binding): {
                "runtime": {"sourceCommit": commit, "sourceDigest": source_sha, "buildId": source_sha[:12]},
                "buildInfo": evidence_pin(build), "approval": {"syntheticTestOnly": True},
            }}

            def cli(output, index, matrix_input=fixed_matrix):
                args = ["variant_batch.py", str(matrix_input), str(request), "--root", str(root),
                        "--output", str(root / output)]
                with patch("sys.argv", args), patch("variant_batch.load_reviewed_admissions", return_value=index), \
                     redirect_stdout(io.StringIO()) as stdout:
                    status = main()
                return status, stdout.getvalue()

            status, stdout = cli("before-review", {})
            self.assertEqual(status, 0, stdout)
            self.assertEqual(json.loads(stdout)["acceptedCount"], 0)
            status, stdout = cli("after-review", synthetic_index)
            self.assertEqual(status, 0, stdout)
            result = json.loads(stdout)
            self.assertEqual((result["acceptedCount"], result["rejectedCount"]), (1, 0))
            self.assertIsNone(result["items"][0]["selection"]["admissionEvidence"])
            self.assertEqual(result["items"][0]["selection"]["wholeOutfitAdmission"]["approval"],
                             {"syntheticTestOnly": True})
            batch = root / "after-review" / result["creationBatches"][0]["path"]
            self.assertEqual(json.loads(batch.read_bytes())["requests"][0]["edits"][0]["selection"]["equipment"], [member])
            # The normal D02 batch parser consumes the generated file without a browser.
            parsed = subprocess.run(["node", "-e", """
const fs = require('node:fs');
const {batchCreates, parseRequest} = require('./scripts/character-production-cli.cjs');
batchCreates(parseRequest(fs.readFileSync(process.argv[1])))
  .then(jobs => process.stdout.write(JSON.stringify(jobs)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
""", str(batch)], cwd=workspace, text=True, encoding="utf-8", capture_output=True, check=True)
            self.assertEqual(json.loads(parsed.stdout)[0]["edits"][0]["selection"]["equipment"], [member])
            self.assertEqual(fixed_matrix.read_bytes(), matrix_bytes)
            self.assertEqual(git("rev-parse", "HEAD"), commit)
            status, stdout = cli("alternate", synthetic_index, write("alternate-matrix.json", data))
            self.assertEqual(status, 1, stdout)
            self.assertIn("compiled fixed matrix", stdout)
            write(row["recipeSource"], {"synthetic": "changed"})
            status, stdout = cli("changed-recipe", synthetic_index)
            self.assertEqual(status, 1, stdout)
            self.assertIn("recipeSource", stdout)
            self.assertFalse((root / "changed-recipe").exists())


if __name__ == "__main__":
    unittest.main()
