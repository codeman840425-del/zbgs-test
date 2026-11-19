import unittest

import test_variant_batch as fixtures


class PersonalAppearanceTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.VariantBatchTests()
        self.request = self.fixture.request()
        item = self.request["items"][0]
        self.request["sharedLook"] = {"styleId": item["styleId"], "variantVersion": "v1", "outfitRole": "configured"}
        self.item = {"bodyType": item["bodyType"], "identity": item["identity"]}
        self.request["items"] = [self.item]
        self.query = self.fixture.query()
        exact = self.query[self.item["bodyType"]]
        exact["appearanceDefaults"] = {"skinTone": "original", "hairColor": "original", "lipColor": "original"}
        exact["appearanceChoices"] = {
            "skinTone": [{"value": "original"}, {"value": "warm"}],
            "hairColor": [{"value": "original"}, {"value": "brown"}],
            "lipColor": [{"value": "original"}, {"value": "rose", "supportedSkinTones": ["warm"]}],
        }

    def plan(self, diagnostic=True):
        return self.fixture.plan(fixtures.matrix(), self.request, diagnostic=diagnostic, queries=self.query)["items"][0]

    def test_joint_values_go_to_one_registered_edit(self):
        self.item["appearance"] = {"skinTone": "warm", "lipColor": "rose", "hairColor": "original"}
        row = self.plan()
        self.assertEqual(row["status"], "candidate")
        self.assertEqual(row["request"]["edits"][1], {"domain": "appearance", "values": {"lipColor": "rose", "skinTone": "warm"}})
        self.assertEqual(row["selection"]["appearance"], self.item["appearance"])

    def test_rejects_invalid_or_unavailable_fields_and_combinations(self):
        for value in [None, {}, [], {"skinTone": 1}, {"hairColor": "green"}, {"lipColor": "rose"}, {"noseSample": "round"}]:
            with self.subTest(value=value):
                self.item["appearance"] = value
                self.assertEqual(self.plan()["status"], "rejected")

    def test_outfit_receipt_cannot_authorize_an_unreviewed_appearance(self):
        baseline = self.plan(diagnostic=False)["request"]
        self.item["appearance"] = {"hairColor": "original"}
        self.assertEqual(self.plan(diagnostic=False)["request"], baseline)
        self.item["appearance"] = {"hairColor": "brown"}
        self.assertIn("default appearance only", self.plan(diagnostic=False)["reason"])

    def test_shared_appearance_is_resolved_after_individual_overrides(self):
        self.request["sharedLook"]["appearance"] = {"hairColor":"brown", "skinTone":"original"}
        self.item["appearance"] = {"skinTone":"warm", "lipColor":"rose"}
        actual = self.plan()
        self.assertEqual(actual["selection"]["appearance"], {"hairColor":"brown","skinTone":"warm","lipColor":"rose"})
        self.assertEqual(self.request["sharedLook"]["appearance"]["skinTone"],"original")
        self.item["appearance"] = {"lipColor":"rose"}
        self.assertEqual(self.plan()["status"],"rejected")
        del self.item["appearance"]
        self.assertEqual(self.plan()["request"]["edits"][1]["values"],{"hairColor":"brown"})
