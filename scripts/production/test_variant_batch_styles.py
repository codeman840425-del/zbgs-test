from copy import deepcopy
import unittest

from outfit_admission import binding_key, outfit_binding
from test_variant_batch import COMMIT, FIT_SHA, MATCH, MEMBER, matrix
from variant_batch import SCHEMA, plan


class ComposedOutfitTests(unittest.TestCase):
    def setUp(self):
        self.matrix = matrix()
        self.shoe = {"id":"platform-sample", "slot":"shoes", "sha256":"f"*64}
        self.second = ("platform-shoes", MATCH[1], "thick")
        second_row = dict(self.matrix["styles"][0]["variants"][0], variantVersion="thick")
        self.matrix["styles"].append({"styleId":self.second[0], "variants":[second_row]})
        self.styles = [{"styleId":style, "variantVersion":version} for style, _, version in (MATCH, self.second)]
        self.request = {
            "schema":SCHEMA, "batchId":"pair-test", "sharedLook":{"styles":self.styles},
            "items":[{"bodyType":MATCH[1], "identity":{"id":"host-one", "name":"One", "gender":"male"}}],
        }
        self.look = {"role":"full-outfit", "index":4, "equipment":[self.shoe, MEMBER]}
        self.query = {"ok":True, "body":{"bodyType":MATCH[1], "sha256":"a"*64},
                      "outfits":[{"role":"top-only", "index":0, "equipment":[MEMBER]}, self.look]}
        self.members = {MATCH:MEMBER, self.second:self.shoe}

    def result(self, **opts):
        opts.setdefault("diagnostic",True)
        return plan(self.matrix,self.request,queries={MATCH[1]:self.query}, members=self.members, **opts)["items"][0]

    def test_all_requested_versions_select_one_full_outfit_in_any_selector_order(self):
        first = self.result()
        self.assertEqual(first["status"], "candidate")
        self.assertEqual(first["selection"]["outfit"]["role"], self.look["role"])
        self.assertEqual(len(first["selection"]["matchedStyles"]), 2)
        self.styles.reverse()
        self.assertEqual(self.result()["request"], first["request"])
        self.members[self.second] = dict(self.shoe, sha256="0"*64)
        self.assertIn("contains all requested exact equipment", self.result()["reason"])

    def test_ambiguous_selection_requires_role_and_lists_choices(self):
        self.query["outfits"].append(dict(self.look, role="full-outfit-two", index=5))
        row = self.result()
        self.assertEqual(row["status"],"rejected")
        self.assertIn("full-outfit, full-outfit-two",row["reason"])
        self.request["sharedLook"]["outfitRole"] = "full-outfit-two"
        self.assertEqual(self.result()["selection"]["outfit"]["role"],"full-outfit-two")

    def test_no_matching_version_digest_or_compatible_outfit_is_local_to_item(self):
        self.request["items"].append({"bodyType":"body-without-fit","identity":{"id":"host-two","name":"Two","gender":"female"}})
        result = plan(self.matrix,self.request,queries={MATCH[1]:self.query}, members=self.members,diagnostic=True)
        self.assertEqual([r["status"] for r in result["items"]], ["candidate","rejected"])
        self.matrix["styles"][1]["variants"][0]["bodySha256"]="0"*64
        self.assertIn("different body digests",self.result()["reason"])

    def test_duplicates_and_mixed_selector_syntax_reject(self):
        self.styles.append(dict(self.styles[0]))
        with self.assertRaisesRegex(ValueError, "Duplicate requested style"):
            self.result()
        self.styles.pop()
        self.request["sharedLook"]["styleId"] = "unrelated"
        with self.assertRaisesRegex(ValueError, "mix individual and grouped"):
            self.result()

    def test_every_requested_style_needs_review_of_same_complete_outfit(self):
        receipts = {}
        fits = dict.fromkeys(self.members,FIT_SHA)
        for style in self.matrix["styles"]:
            row = dict(style["variants"][0],styleId=style["styleId"])
            receipt = {"runtime":{"sourceCommit":COMMIT},"approvedStyle":style["styleId"]}
            receipts[binding_key(outfit_binding(row,self.look,FIT_SHA))] = receipt
        opts = {"diagnostic":False, "fit_shas":fits, "runtime_commit":COMMIT, "admissions":receipts}
        self.assertEqual(len(self.result(**opts)["selection"]["styleAdmissions"]),2)
        one = deepcopy(receipts)
        one.pop(next(reversed(one)))
        self.assertEqual(self.result(**{**opts,"admissions":one})["status"], "rejected")
        self.assertEqual(self.result(**{**opts,"runtime_commit":"3"*40})["status"], "rejected")
