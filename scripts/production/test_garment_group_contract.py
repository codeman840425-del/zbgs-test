"""Read back the published two-primitive top through the style matrix and exact outfit planner."""

from copy import deepcopy
import json
import unittest

from asset_budget import AssetCost
from flow import GLB, Validator
from native_import import digest
from raw_male_equipment import make_item
from stripped_outfit_equipment import (
    BodyReadback, ROOT, SOURCE, SOURCE_MANIFEST, SOURCE_SHA,
    prove_body, receipt_selectors, verify_source_garment,
)
from variant_batch import plan, resolve_runtime, resource_member
from variant_matrix import validate_matrix_files


EVIDENCE = ROOT / 'evidence/m2-garment-group-input-v1'


def read_json(path):
    return json.loads(path.read_bytes())


class GarmentGroupContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matrix = read_json(EVIDENCE / 'matrix.json')
        cls.request = read_json(EVIDENCE / 'request.json')
        cls.row, = cls.matrix['styles'][0]['variants']
        cls.catalog, _, cls.release_id = cls.row['resourceManifest'].partition('#')
        cls.release_catalog = read_json(ROOT / ('prototype/public' + cls.catalog))
        cls.release_top, = [row for row in cls.release_catalog['items'] if row['id'] == cls.release_id]
        recipe = read_json(ROOT / cls.row['recipeSource'])
        reader = Validator(ROOT)
        outfit = recipe['outfitRecipe']
        cls.source_recipe = json.loads(reader.pin(outfit['path'], outfit['sha256']))
        extraction = recipe['equipmentReport']
        cls.proof = json.loads(reader.pin(extraction['path'], extraction['sha256']))
        cls.raw_top, = [row for row in read_json(ROOT / SOURCE_MANIFEST)['items']
                        if row['id'] == cls.source_recipe['top']['id']]
        cls.receipt, = [row for row in cls.proof['items'] if row['id'] == cls.raw_top['id']]
        cls.model = AssetCost(ROOT / SOURCE)
        cls.raw = (ROOT / ('prototype/public' + cls.release_top['url'])).read_bytes()
        cls.queries, cls.members, _ = resolve_runtime(cls.matrix, cls.request, ROOT, True, False)

    def test_exact_group_keeps_one_matrix_member_and_one_top_pin(self):
        self.assertEqual(validate_matrix_files(self.matrix, ROOT), [])
        self.assertEqual(digest(self.model.raw), SOURCE_SHA)
        self.assertEqual(self.release_top['sha256'], digest(self.raw))
        self.assertEqual(self.receipt['equipment']['sha256'], self.release_top['sha256'])
        self.assertEqual(self.release_top['compatibleAvatarSha256'], self.row['bodySha256'])
        self.assertIs(self.release_top['preserveOriginalBody'], True)
        raw_mesh, = GLB(self.raw).doc['meshes']
        self.assertEqual(len(raw_mesh['primitives']), 2)
        self.assertEqual(
            [part['selector'] for part in receipt_selectors(self.receipt)],
            self.source_recipe['top']['selectors'],
        )
        self.assertEqual(verify_source_garment(self.model, self.raw_top, self.receipt, self.raw),
                         self.receipt['verified'])
        target = Validator(ROOT).pin('prototype/public' + self.row['bodyAsset'], self.row['bodySha256'])
        selectors = [part['selector'] for item in self.proof['items'] for part in receipt_selectors(item)]
        body = prove_body(BodyReadback(self.model.raw), BodyReadback(target), selectors)
        self.assertEqual(len(body['retainedPrimitives']), 15)

        result = self.plan(self.request)
        self.assertEqual((result['candidateCount'], result['acceptedCount'], result['rejectedCount']), (1, 0, 0))
        (item,) = result['items']
        selection = item['request']['edits'][0]['selection']
        self.assertEqual(selection['bodySha256'], self.row['bodySha256'])
        self.assertEqual(selection['role'], 'pants')
        member = resource_member(self.row, ROOT)
        self.assertEqual([pin for pin in selection['equipment'] if pin['slot'] == 'top'], [member])
        self.assertEqual({pin['id'] for pin in selection['equipment']},
                         {row['id'] for row in self.release_catalog['items']})

    def test_wrong_publisher_body_fails_matrix_fit(self):
        matrix = deepcopy(self.matrix)
        matrix['styles'][0]['variants'][0]['bodySha256'] = SOURCE_SHA
        errors = validate_matrix_files(matrix, ROOT)
        self.assertEqual(len(errors), 1)
        self.assertIn('compatibleAvatarSha256 differs from the selected member', errors[0])

    def test_omitted_group_primitive_fails_published_readback(self):
        partial_receipt = {**self.receipt, 'selection': receipt_selectors(self.receipt)[:1]}
        with self.assertRaisesRegex(ValueError, r'zip\(\) argument 2 is shorter'):
            verify_source_garment(self.model, self.raw_top, partial_receipt, self.raw)

    def test_duplicate_group_primitive_fails_emitter_before_export(self):
        top = self.source_recipe['top']
        first, _ = top['selectors']
        with self.assertRaisesRegex(ValueError, 'distinct primitives on the same verified owner and skin'):
            make_item(top, [first, first], self.model, {'sourceSha256': SOURCE_SHA},
                      self.raw_top['sourceLicense'], [])

    def plan(self, request, *, diagnostic=True):
        return plan(self.matrix, request, queries=self.queries, members=self.members, diagnostic=diagnostic)

    def test_outfit_must_retain_the_exact_group_member_once(self):
        for operation, reason in (
            ('omit', 'No unique configured outfit for the requested role and equipment pins'),
            ('duplicate', 'Duplicate outfit equipment ID'),
            ('wrong-body', 'No exact variant'),
        ):
            with self.subTest(operation=operation):
                request = deepcopy(self.request)
                item, = request['items']
                pins = item['outfit']['equipment']
                if operation == 'omit':
                    del pins[0]
                elif operation == 'duplicate':
                    pins.append(pins[0])
                else:
                    item['bodyType'] = 'source-male-ab9a-v1'
                (failure,) = self.plan(request)['items']
                self.assertEqual(failure['status'], 'rejected')
                self.assertIn(reason, failure['reason'])
                self.assertNotIn('request', failure)
        (failure,) = self.plan(self.request, diagnostic=False)['items']
        self.assertEqual(failure['status'], 'rejected')
        self.assertIn('static budget over limit', failure['reason'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
