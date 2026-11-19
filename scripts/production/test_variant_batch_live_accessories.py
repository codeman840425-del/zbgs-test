import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from production_paths import project_output
import test_variant_batch as fixtures
from variant_batch import run


ROOT = Path(__file__).resolve().parents[2]


class LiveAccessoryBatchTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.VariantBatchTests()
        self.request = self.fixture.request()
        self.item = self.request['items'][0]
        self.query = self.fixture.query()
        self.query[self.item['bodyType']]['liveAccessories'] = {
            'glasses': {'status':'registered', 'choices':[{'enabled':False}, {'enabled':True}]},
            'mic': {'status':'unavailable', 'reason':'exact-body-fit-unregistered', 'choices':[{'enabled':False}]},
        }

    def plan(self, *, diagnostic=True):
        return self.fixture.plan(fixtures.matrix(), self.request, queries=self.query, diagnostic=diagnostic)['items'][0]

    def test_individual_selection_checks_exact_body_and_kind(self):
        self.item['liveAccessories'] = {'mic': False, 'glasses': True}
        row = self.plan()
        self.assertEqual(row['request']['edits'][1:], [{'domain':'liveAccessory', 'kind':'glasses', 'enabled':True}])
        self.assertEqual(row['selection']['liveAccessories'], self.item['liveAccessories'])

        self.item['liveAccessories']['mic'] = True
        row = self.plan()
        self.assertEqual((row['status'], row['stableId']), ('rejected', self.item['stableId']))
        self.assertIn('liveAccessories.mic unavailable for this body: exact-body-fit-unregistered', row['reason'])
        self.assertNotIn('request', row)

    def test_conditional_glasses_use_the_requested_hair_before_emitting_a_job(self):
        query = self.query[self.item['bodyType']]
        query['appearanceDefaults'] = {'hairStyle': 'original'}
        query['appearanceChoices'] = {'hairStyle': [{'value': 'original'}, {'value': 'female-bob-v1'}]}
        slot = query['liveAccessories']['glasses']
        slot['constraints'] = {'headDependency': {'hairStyle': 'original', 'faceGeometry': 'neutral'}}
        slot['allowedHairStyles'] = ['original']
        self.item['liveAccessories'] = {'glasses': True}
        self.assertEqual(self.plan()['status'], 'candidate')
        self.item['appearance'] = {'hairStyle': 'female-bob-v1'}
        rejected = self.plan()
        self.assertEqual(rejected['status'], 'rejected')
        self.assertIn('female-bob-v1', rejected['reason'])
        self.assertNotIn('request', rejected)
        self.item['liveAccessories']['glasses'] = False
        self.assertEqual(self.plan()['status'], 'candidate')
        self.item.pop('appearance')
        self.item['liveAccessories']['glasses'] = True
        del slot['allowedHairStyles']
        self.assertEqual(self.plan()['status'], 'rejected')

    def test_unknown_accessory_keys_and_non_booleans_are_rejected(self):
        for selection, message in ((None, 'object'), ([], 'object'), ({'headset':True}, 'Unknown liveAccessories field'),
                                   ({'glasses':1}, 'glasses must be boolean'), ({'mic':'false'}, 'mic must be boolean')):
            with self.subTest(selection=selection):
                self.item['liveAccessories'] = selection
                row = self.plan()
                self.assertEqual((row['status'], row['stableId']), ('rejected', self.item['stableId']))
                self.assertIn(message, row['reason'])
        del self.item['liveAccessories']
        self.item['liveAccesories'] = {'glasses':True}
        row = self.plan()
        self.assertEqual((row['status'], row['stableId']), ('rejected', self.item['stableId']))
        self.assertIn('Unknown batch item field: liveAccesories', row['reason'])

    def test_formal_default_outfit_approval_requires_accessories_off(self):
        baseline = self.plan(diagnostic=False)['request']
        self.item['liveAccessories'] = {'mic':False, 'glasses':False}
        self.assertEqual(self.plan(diagnostic=False)['request'], baseline)
        self.item['liveAccessories']['glasses'] = True
        row = self.plan(diagnostic=False)
        self.assertEqual(row['status'], 'rejected')
        self.assertIn('Whole-outfit review requires live accessories disabled', row['reason'])

    def test_shared_accessories_keep_individual_errors_and_use_the_loaded_body(self):
        inputs = ROOT / 'assets-source/variant-matrix-v1'
        matrix_path = inputs / 'uniform-top-texture-matrix.json'
        request = json.loads((inputs / 'uniform-top-texture-request.json').read_bytes())
        female, male = request['items']
        request['sharedLook']['liveAccessories'] = {'glasses':True, 'mic':True}
        female['liveAccessories'] = {'mic':False}
        request['items'] += [
            {**male, 'identity':{**male['identity'], 'id':'host-off'}, 'liveAccessories':{'glasses':False, 'mic':False}},
            {**male, 'identity':{**male['identity'], 'id':'host-unknown'}, 'liveAccessories':{'headset':False}},
        ]
        output = project_output(ROOT / 'output', __file__)
        output.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=output, prefix='variant-live-') as workspace:
            work = Path(workspace)
            request_path = work / 'request.json'
            request_path.write_text(json.dumps(request), encoding='utf-8')
            planned = run(matrix_path, request_path, work / 'plan', ROOT, diagnostic=True)
            self.assertEqual((planned['candidateCount'], planned['rejectedCount']), (2, 2))
            first, blocked, off, invalid = planned['items']
            batch = json.loads((work / 'plan' / planned['creationBatches'][0]['path']).read_bytes())['requests']
            self.assertEqual([row['identity']['id'] for row in batch], [female['identity']['id'], 'host-off'])
            self.assertEqual(first['selection']['liveAccessories'], {'glasses':True, 'mic':False})
            self.assertEqual(batch[0]['edits'][1:], [{'domain':'liveAccessory', 'kind':'glasses', 'enabled':True}])
            self.assertEqual(off['selection']['liveAccessories'], {'glasses':False, 'mic':False})
            self.assertEqual(len(batch[1]['edits']), 1)
            self.assertEqual(blocked['stableId'], male['identity']['id'])
            self.assertIn('exact-body-fit-unregistered', blocked['reason'])
            self.assertEqual(invalid['stableId'], 'host-unknown')
            self.assertIn('Unknown liveAccessories field', invalid['reason'])

            request['sharedLook']['liveAccessories']['headset'] = False
            request_path.write_text(json.dumps(request), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Unknown liveAccessories field'):
                run(matrix_path, request_path, work / 'invalid', ROOT, diagnostic=True)
            self.assertFalse((work / 'invalid').exists())
