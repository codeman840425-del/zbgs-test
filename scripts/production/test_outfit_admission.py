"""Synthetic authority fixtures only. These tests grant no real admission."""
import json
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch

import outfit_admission as gate


class SyntheticWholeOutfitAdmission(TestCase):
    def setUp(self):
        temp = TemporaryDirectory(dir=gate.ROOT,prefix="synthetic-outfit-admission-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.body = "a"*64
        self.record_sha = "b"*64
        self.runtime = {"sourceCommit":"1"*40,"sourceDigest":"2"*64,"buildId":"2"*12}
        self.equipment = [
            {"id":"test-top","slot":"top","sha256":"c"*64},
            {"id":"test-socks","slot":"socks","sha256":"d"*64},
        ]
        self.binding = {
            "styleId":"synthetic-style-v1","variantVersion":"v1","bodyType":"synthetic-body",
            "bodySha256":self.body,"role":"synthetic-outfit","equipment":self.equipment,
            "recipeSha256":"e"*64,"resourceManifest":"synthetic-equipment.json#test-top",
            "resourceManifestSha256":"f"*64,"fitManifest":"synthetic-fit.json","fitManifestSha256":"3"*64,
            "coverageManifest":"synthetic-coverage.json","coverageManifestSha256":"4"*64,
        }
        self.record = {
            "schema":"character-record-v1",
            "identity":{"id":"synthetic-character"},
            "appearanceRecipe":{
                "base":{"bodyType":"synthetic-body","sha256":self.body},
                "appearance":{"hairStyle":"original","lipColor":"original"},
                "geometry":{"mouthWidth":0,"browSample":"none","noseSample":"none","eyeSample":"none"},
                "equipment":{"role":"synthetic-outfit","resources":dict(zip(("top","socks"),self.equipment))},
            },
            "integrity":{"recordSha256":self.record_sha,"recipeSha256":"5"*64},
            "resourceIdentities":[],
            "liveAccessories":{"selections":{"mic":{"enabled":False}}},
            "equipmentMaterials":{"selections":[{"selection":None}]},
        }
        fixed = self.write("synthetic-build.json",{
            "shortId":self.runtime["buildId"],"sourceDigest":self.runtime["sourceDigest"],"inputs":["sample.js"],
        })
        reviewed = self.write("synthetic-reviewed.json",{
            "schema":"reviewed-game-character-runtime-v1",**self.runtime,
            "files":{"record-consumer.html":{"bytes":1,"sha256":"6"*64},
                     "build-info.json":{key:fixed[key] for key in ("bytes","sha256")}},
        })
        self.budget = {
            "schema":"native-budget-admission-v1","status":"passed","scope":"synthetic only",
            "candidates":[{"bodyType":"synthetic-body","bodySha256":self.body,"recordSha256":self.record_sha,
                           "budgetVersion":"synthetic-v1",
                           "layers":{key:"passed" for key in ("transport","decodeCanvas","gpu","ordinaryPC")}}],
        }
        self.approval = {
            "schema":gate.SCHEMA,"status":"passed","scope":"synthetic test only",
            "runtime":self.runtime,"binding":self.binding,"recordSha256":self.record_sha,
            "record":self.write("synthetic-record.json", self.record),"reviewedRuntime":reviewed,"buildInfo":fixed,
            "lanes":{name:{"status":"passed","evidence":[self.write(name+".json",{"synthetic":True})]}
                     for name in gate.LANES},
        }
        self.approval["lanes"]["runtimeRecordAndBudget"]["evidence"] = [self.write("synthetic-budget.json",self.budget)]
        build = {"shortId":self.runtime["buildId"],"sourceDigest":self.runtime["sourceDigest"]}
        self.approval["lanes"]["normalSpeedMotion"]["evidence"] = [
            self.write("synthetic-room.json",{
                "status":"technical-pass-visual-candidate","errors":[],"build":build,"recordSha256":self.record_sha,
                "restored":{"applied":True,"recordSha256":self.record_sha},
                "tasks":[{"kind":kind,"state":"completed"} for kind in ("walk","sit","stand","walk")],
            }),
            self.write("synthetic-footage.webm",{"synthetic":True}),
        ]
        game = {"id":"synthetic-character","sha":self.record_sha,"expectedSha":self.record_sha,"body":"synthetic-body",
                **{key:True for key in ("look","props","materials","hairCenter")}}
        self.approval["lanes"]["recordAndRestore"]["evidence"] = [
            self.write("synthetic-game.json",{
                "status":"technical-pass-visual-candidate","errors":[],"failedAssetResponses":[],"build":build,
                "first":[{**game,"root":"synthetic-root-a"}],"reopened":[{**game,"root":"synthetic-root-b"}],
            }),
            self.write("synthetic-inventory.json",{
                "schema":"game-character-record-package-v1","runtime":self.runtime,
                "records":[{"recordSha256":self.record_sha,"bodyType":"synthetic-body","avatarSha256":self.body,
                             "equipmentIds":[item["id"] for item in self.equipment]}],
                "files":[{"sha256":self.body},*self.equipment],
            }),
        ]
        actor = {"id":"synthetic-character","recipeSha256":"5"*64,"resourceIdentities":[],
                 "visibleEquipment":[item["id"] for item in self.equipment]}
        self.approval["lanes"]["selectionGuards"]["evidence"] = [self.write("selectionGuards.json",{
            "status":"passed","pageErrors":[],"build":build,"before":{"active":[actor]},"reopened":{"active":[actor]},
            "cases":[{"actor":actor["id"],"activeUnchanged":True,"result":{"ok":False}},
                     {"actor":actor["id"],"activeUnchanged":True,"resultRevision":3}],
        })]

    def write(self, name, content):
        path = self.root / name
        path.write_text(json.dumps(content),encoding="utf-8")
        return gate.evidence_pin(path)

    def load(self, approval):
        pin = self.write("synthetic-approval.json",approval)
        self.write("synthetic-index.json",{"schema":gate.INDEX_SCHEMA,"approvals":[pin]})
        with patch.object(gate,"INDEX",self.root/"synthetic-index.json"):
            return gate.load_reviewed_admissions()

    def test_synthetic_exact_review_leaves_the_repository_index_untouched(self):
        maintained = gate.INDEX.read_bytes()
        loaded = self.load(self.approval)
        self.assertEqual(len(loaded),1)
        self.assertEqual(loaded[gate.binding_key(self.binding)]["recordSha256"],self.record_sha)
        self.assertEqual(gate.INDEX.read_bytes(),maintained)

    def test_missing_human_review_and_unreviewed_rights_reject(self):
        for lane in ("humanVisualReview","provenanceAndRights"):
            approval = deepcopy(self.approval)
            approval["lanes"][lane]["status"] = "pending"
            with self.assertRaisesRegex(ValueError,lane):
                self.load(approval)

    def test_pending_target_pc_or_changed_budget_record_rejects(self):
        self.budget["candidates"][0]["layers"]["ordinaryPC"] = "unmeasured"
        budget = self.approval["lanes"]["runtimeRecordAndBudget"]
        budget["evidence"] = [self.write("synthetic-budget.json",self.budget)]
        with self.assertRaisesRegex(ValueError,"four resource layers"):
            self.load(self.approval)
        self.budget["candidates"][0]["layers"]["ordinaryPC"] = "passed"
        self.budget["candidates"][0]["recordSha256"] = "7"*64
        budget["evidence"] = [self.write("synthetic-budget.json",self.budget)]
        with self.assertRaisesRegex(ValueError,"exact approved record"):
            self.load(self.approval)

    def test_changed_record_sock_or_pinned_artifact_rejects(self):
        approval = deepcopy(self.approval)
        record = deepcopy(self.record)
        record["appearanceRecipe"]["equipment"]["resources"]["socks"]["sha256"] = "8"*64
        approval["record"] = self.write("synthetic-changed-record.json",record)
        with self.assertRaisesRegex(ValueError,"equipment differs"):
            self.load(approval)
        self.write("selectionGuards.json",{"synthetic":"changed"})
        with self.assertRaisesRegex(ValueError,"Evidence file pin differs"):
            self.load(self.approval)

    def test_matching_file_hash_cannot_substitute_a_different_motion_build(self):
        lane = self.approval["lanes"]["normalSpeedMotion"]["evidence"]
        room = json.loads(gate.pinned_file(lane[0]).read_bytes())
        room["build"]["sourceDigest"] = "9"*64
        lane[0] = self.write("synthetic-other-room.json",room)
        with self.assertRaisesRegex(ValueError,"different fixed build"):
            self.load(self.approval)


if __name__ == "__main__":
    main()
