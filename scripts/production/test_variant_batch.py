import hashlib
import io
import json
import os
import struct
import subprocess
import unittest
from contextlib import redirect_stdout
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from production_paths import project_output
from variant_batch import FIXED_MATRIX, SCHEMA, OUT_SCHEMA, main, plan, run
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

    def test_rejects_drive_root_traversal_and_linked_destinations_before_writing(self):
        workspace = Path(__file__).resolve().parents[2]
        with TemporaryDirectory(dir=workspace / 'experiments') as temp:
            fixture = Path(temp).resolve()
            operator = fixture / 'operator'
            outside = fixture / 'outside'
            subprocess.run(['git', 'init', '-q', str(operator)], check=True)
            outside.mkdir()
            redirect = operator / 'redirect'
            if os.name == 'nt':
                subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(redirect), str(outside)],
                               check=True, capture_output=True)
            else:
                redirect.symlink_to(outside, target_is_directory=True)
            script = operator / 'scripts' / 'production' / 'variant_batch.py'
            script.parent.mkdir(parents=True)
            matrix_path = operator / 'unused-matrix.json'
            request_path = operator / 'unused-request.json'
            drive_target = Path(workspace.anchor) / ('gamemake-variant-negative-' + fixture.name)
            for output in (drive_target / 'plan', operator / '..' / 'escaped', redirect / 'plan'):
                with self.subTest(output=output), patch('variant_batch.__file__', str(script)), \
                     patch.object(Path, 'mkdir', side_effect=AssertionError('write before boundary check')):
                    self.assertFalse(output.exists())
                    with self.assertRaisesRegex(ValueError, 'inside the production tool main checkout'):
                        run(matrix_path, request_path, output, operator)
                    for inputs in ([str(matrix_path), str(request_path)], [str(request_path)]):
                        args = [str(script), *inputs, '--root', str(operator), '--output', str(output)]
                        with patch('sys.argv', args), redirect_stdout(io.StringIO()) as stdout:
                            self.assertEqual(main(), 1)
                        self.assertIn('inside the production tool main checkout', stdout.getvalue())
                    self.assertFalse(output.exists())
            self.assertFalse(drive_target.exists())

            escaped_request = operator / 'redirect' / 'request.json'
            fixed_dir = (operator / FIXED_MATRIX).parent
            fixed_dir.parent.mkdir()
            if os.name == 'nt':
                subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/j', str(fixed_dir), str(outside)],
                               check=True, capture_output=True)
            else:
                fixed_dir.symlink_to(outside, target_is_directory=True)
            output = operator / 'must-not-write'
            with patch('variant_batch.__file__', str(script)), \
                 patch.object(Path, 'read_bytes', side_effect=AssertionError('input read before boundary check')), \
                 patch.object(Path, 'mkdir', side_effect=AssertionError('write before boundary check')):
                with self.assertRaisesRegex(ValueError, 'Request must be inside the selected input checkout'):
                    run(matrix_path, escaped_request, output, operator, True)
                with self.assertRaisesRegex(ValueError, 'Matrix must be inside the selected input checkout'):
                    run(operator / 'redirect' / 'matrix.json', request_path, output, operator, True)
                with self.assertRaisesRegex(ValueError, 'Default matrix must be inside the fixed runtime checkout'):
                    run(None, request_path, output, operator, True)
                with self.assertRaisesRegex(ValueError, 'Request must be inside the selected input checkout'):
                    run(None, escaped_request.relative_to(operator), output, operator / 'runtime-fixture', True,
                        input_root=operator)
            self.assertFalse(output.exists())
            self.assertEqual(list(outside.iterdir()), [])

    def test_cli_uses_synthetic_external_review_without_touching_fixed_candidate(self):
        # No real catalogue, record, authority index or production asset is changed.
        workspace = Path(__file__).resolve().parents[2]
        with (
            TemporaryDirectory(dir=workspace / 'experiments', prefix='synthetic-variant-batch-') as temp,
            TemporaryDirectory(dir=workspace / 'experiments', prefix='synthetic-variant-output-') as output_dir,
        ):
            root = Path(temp).resolve()
            operator_output = Path(output_dir).resolve()

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
            headless = root / "scripts/headless-avatar-node.mjs"
            headless.parent.mkdir(parents=True, exist_ok=True)
            headless.write_text("export const THREE = {Scene: class {}};\n", encoding="utf-8")
            runtime = root / "prototype/src/character-production.js"
            runtime.parent.mkdir(parents=True, exist_ok=True)
            response = {"query": {"body": self.query()[MATCH[1]]["body"], "appearance": {
                "defaultRecipe": {"appearance": {}}, "appearance": {}, "equipment": {"sets": [
                    {"index": 7, "role": "configured", "resources": {"top": member}},
                ]}}}}
            runtime.write_text("export async function performCharacterProduction(){return " +
                               json.dumps(response) + ";}\n", encoding="utf-8")
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

            def cli(output, index, matrix_input=fixed_matrix, request_input=request, input_root=None):
                inputs = [str(request_input)] if matrix_input is None else [str(matrix_input), str(request_input)]
                args = ["variant_batch.py", *inputs, "--root", str(root),
                        "--output", str(operator_output / output)]
                if input_root:
                    args.extend(["--input-root", str(input_root)])
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
            self.assertEqual(result["source"], {"matrix": evidence_pin(fixed_matrix, root), "request": evidence_pin(request, root)})
            self.assertIsNone(result["items"][0]["selection"]["admissionEvidence"])
            self.assertEqual(result["items"][0]["selection"]["wholeOutfitAdmission"]["approval"],
                             {"syntheticTestOnly": True})
            batch = operator_output / "after-review" / result["creationBatches"][0]["path"]
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
            # A later operator may own the short recipe while an exact older
            # runtime owns the bodies and equipment. Both inputs keep their pins.
            input_root = operator_output / "author-inputs"
            input_root.mkdir()
            detached_matrix = input_root / "matrix.json"
            detached_request = input_root / "request.json"
            detached_matrix.write_bytes(matrix_bytes)
            detached_request.write_bytes(request.read_bytes())
            separate = run(detached_matrix, detached_request, operator_output / "separate-inputs", root, True, input_root=input_root)
            self.assertEqual((separate["candidateCount"], separate["source"]["matrix"]["path"]), (1, "matrix.json"))
            self.assertEqual(separate["source"]["request"]["sha256"], evidence_pin(request)["sha256"])
            # Use the exact same relative name in the two checkouts for files
            # with different schemas. The default may only read the runtime matrix.
            operator_request = input_root / FIXED_MATRIX
            operator_request.parent.mkdir(parents=True)
            operator_data = self.request("operator-host")
            operator_data["items"][0]["outfit"]["equipment"] = [member]
            operator_request.write_text(json.dumps(operator_data), encoding="utf-8")
            status, stdout = cli("default-with-review", synthetic_index, None, Path(FIXED_MATRIX), input_root)
            self.assertEqual(status, 0, stdout)
            default_plan = json.loads(stdout)
            self.assertEqual(default_plan["acceptedCount"], 1)
            self.assertEqual(default_plan["items"][0]["stableId"], "operator-host")
            self.assertEqual(default_plan["source"], {
                "matrix": {**evidence_pin(fixed_matrix, root), "origin": "runtime-root"},
                "request": {**evidence_pin(operator_request, input_root), "origin": "input-root"},
            })
            status, stdout = cli("default-outside-request", synthetic_index, None, request, input_root)
            self.assertEqual(status, 1, stdout)
            self.assertIn("Request must be inside the selected input checkout", stdout)
            self.assertFalse((operator_output / "default-outside-request").exists())
            operator_request.write_bytes(matrix_bytes)
            status, stdout = cli("explicit-shadow", synthetic_index, operator_request, detached_request, input_root)
            self.assertEqual(status, 1, stdout)
            self.assertIn("compiled fixed matrix", stdout)
            with self.assertRaisesRegex(ValueError, "selected input checkout"):
                run(detached_matrix, request, operator_output / "escaped-input", root, True, input_root=input_root)
            status, stdout = cli("alternate", synthetic_index, write("alternate-matrix.json", data))
            self.assertEqual(status, 1, stdout)
            self.assertIn("compiled fixed matrix", stdout)
            write(row["recipeSource"], {"synthetic": "changed"})
            status, stdout = cli("changed-recipe", synthetic_index)
            self.assertEqual(status, 1, stdout)
            self.assertIn("recipeSource", stdout)
            self.assertFalse((operator_output / "changed-recipe").exists())


class EarAccessoryBatchTests(unittest.TestCase):
    def test_original_uniform_pair_can_override_ear_slot_and_reject_one_unknown_style(self):
        root = Path(__file__).resolve().parents[2]
        pair_path = root / "assets-source/variant-matrix-v1/paired-ear-style-batch.json"
        request = json.loads(pair_path.read_bytes())
        female, male = request["items"]
        style = request["sharedLook"]["accessories"]["ears"]
        self.assertEqual(style, {"styleId": "round-gold-stud-3mm-v1", "version": 1, "selection": "pair"})
        male_override = {"styleId": "compact-gold-stud-v1", "version": 1, "selection": "left"}
        male["accessories"] = {"ears": male_override}
        bad = deepcopy(female)
        bad["identity"]["id"] = "unknown-ear-style"
        bad["accessories"] = {"ears": {**style, "styleId": "unknown-stud-v1"}}
        request["items"].insert(1, bad)

        output = project_output(root / "output", __file__)
        output.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=output, prefix="variant-ear-") as temp:
            work = Path(temp)
            request_path = work / "request.json"
            request_path.write_text(json.dumps(request), encoding="utf-8")
            report = run(None, request_path, work / "plan", root, diagnostic=True)
            self.assertEqual((report["acceptedCount"], report["candidateCount"], report["rejectedCount"]), (0, 2, 1))
            self.assertEqual(report["items"][1]["stableId"], "unknown-ear-style")
            self.assertIn("no unique registered fit for this body", report["items"][1]["reason"])
            batch = json.loads((work / "plan" / report["creationBatches"][0]["path"]).read_bytes())["requests"]
            self.assertEqual([job["identity"]["id"] for job in batch], [female["identity"]["id"], male["identity"]["id"]])
            for job, expected in zip(batch, (style, male_override), strict=True):
                self.assertEqual(job["edits"][1:], [{"domain": "accessory", "kind": "ears", **expected}])
            female_fit, male_fit = [report["items"][i]["selection"]["accessories"]["ears"]["resource"] for i in (0, 2)]
            self.assertEqual(female_fit["fitSha256"], "14651cb2aebd8b350dec8c94f804097032561007c34d43d754bc1b4070fd1722")
            self.assertEqual(male_fit["fitSha256"], "92bb47d13238fbec1677b359e9260473b63685234af9f27c8e844575399f7596")

    def test_individual_ear_selection_requires_an_exact_fit_and_default_approval_stays_default(self):
        fixture = VariantBatchTests()
        request = fixture.request()
        query = fixture.query()
        item = request["items"][0]
        current = query[item["bodyType"]]
        style = {"styleId": "registered-stud-v1", "version": 1, "selection": "pair"}
        item["accessories"] = {"ears": style.copy()}
        rejected = fixture.plan(matrix(), request, queries=query, diagnostic=True)["items"][0]
        self.assertIn("no unique registered fit for this body", rejected["reason"])

        resource = {"styleId": style["styleId"], "version": 1, "fitSha256": "f" * 64}
        choice = {"selection": "pair", "resource": resource, "reason": "Ear style fit pin differs"}
        current["accessories"] = {"ears": {"choices": [choice]}}
        rejected = fixture.plan(matrix(), request, queries=query, diagnostic=True)["items"][0]
        self.assertIn("Ear style fit pin differs", rejected["reason"])
        del choice["reason"]
        rejected = fixture.plan(matrix(), request, queries=query)["items"][0]
        self.assertIn("Whole-outfit review requires rigid accessories disabled", rejected["reason"])
        self.assertNotIn("request", rejected)

        item["accessories"]["ears"]["selection"] = "none"
        baseline = fixture.plan(matrix(), fixture.request(), queries=query)["items"][0]
        off = fixture.plan(matrix(), request, queries=query)["items"][0]
        self.assertEqual(off["request"], baseline["request"])
        self.assertIsNone(off["selection"]["accessories"]["ears"]["resource"])
        for bad, reason in (({"hat": style}, "Unknown accessories field: hat"),
                            ({"ears": {**style, "version": True}}, "exact styleId and integer version"),
                            ({"ears": {**style, "version": 2}}, "no unique registered fit for this body"),
                            ({"ears": {**style, "side": "pair"}}, "requires styleId, version and selection")):
            with self.subTest(bad=bad):
                item["accessories"] = bad
                rejected = fixture.plan(matrix(), request, queries=query, diagnostic=True)["items"][0]
                self.assertEqual((rejected["status"], rejected["stableId"]), ("rejected", item["stableId"]))
                self.assertIn(reason, rejected["reason"])


if __name__ == "__main__":
    unittest.main()
