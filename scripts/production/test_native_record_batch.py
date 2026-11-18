import copy
import json
from pathlib import Path
import tempfile
import unittest

from native_record_batch import ROOT, plan, run


CATALOG_PATH = ROOT / 'prototype/src/native-production-catalog.json'


class NativeRecordBatchTests(unittest.TestCase):
    def setUp(self):
        self.catalog = json.loads(CATALOG_PATH.read_bytes())
        self.scratch = tempfile.TemporaryDirectory(dir=ROOT / 'output')
        self.addCleanup(self.scratch.cleanup)
        self.root = ROOT

    def test_real_catalog_produces_deterministic_requests(self):
        first = Path(self.scratch.name) / 'first'
        second = Path(self.scratch.name) / 'second'
        a = run(CATALOG_PATH, first, self.root)
        b = run(CATALOG_PATH, second, self.root)
        self.assertEqual(a['acceptedCount'], 2)
        self.assertEqual(a['mode'], 'technical-candidate')
        self.assertTrue(all(row['runtimeAdmission'] == 'candidate' for row in a['items']))
        self.assertEqual((first / 'batch-request.json').read_bytes(), (second / 'batch-request.json').read_bytes())
        for row in a['items']:
            self.assertEqual(row['status'], 'accepted')
            request = json.loads((first / f"{row['bodyType']}.request.json").read_bytes())
            self.assertEqual(request['operation'], 'create')
            self.assertEqual(request['edits'][0], {'domain': 'outfit', 'index': 0})
            self.assertEqual([edit['kind'] for edit in request['edits'][1:]], ['mic', 'glasses'])

    def test_unknown_grip_fit_is_omitted_without_guessing(self):
        grips = json.loads((ROOT / 'prototype/public/assets/m1c/grips/manifest.json').read_bytes())
        body_sha = self.catalog['entries'][0]['profile']['sha256']
        for entry in grips['items']:
            if entry.get('compatibleAvatarSha256') == body_sha:
                entry['accessorySha256'] = '0' * 64
        rows = plan(self.catalog, self.root, grips=grips)
        accepted = next(row for row in rows if row['status'] == 'accepted')
        self.assertNotIn({'domain': 'liveAccessory', 'kind': 'mic', 'enabled': True}, accepted['request']['edits'])
        self.assertTrue(any('mic omitted' in reason for reason in accepted['omittedCapabilities']))

    def test_duplicate_body_rejects_only_duplicate_item_and_siblings_survive(self):
        catalog = copy.deepcopy(self.catalog)
        catalog['entries'].append(copy.deepcopy(catalog['entries'][0]))
        rows = plan(catalog, self.root)
        self.assertEqual([row['status'] for row in rows], ['accepted', 'accepted', 'rejected'])
        self.assertIn('Duplicate bodyType', rows[-1]['reason'])

    def test_bad_body_identity_is_rejected_without_request_file(self):
        catalog = copy.deepcopy(self.catalog)
        catalog['entries'][0]['profile']['sha256'] = '0' * 64
        output = Path(self.scratch.name) / 'bad'
        batch = run(CATALOG_PATH, output, self.root)
        self.assertEqual(batch['acceptedCount'], 2)
        bad_rows = plan(catalog, self.root)
        self.assertEqual(bad_rows[0]['status'], 'rejected')
        self.assertIn('body bytes', bad_rows[0]['reason'])

    def test_readiness_gate_blocks_technical_candidates_without_emitting_requests(self):
        gate = ROOT / 'evidence/m2-native-production-gate-v5/report.json'
        rows = plan(self.catalog, self.root, readiness_report=gate)
        self.assertEqual([row['status'] for row in rows], ['rejected', 'rejected'])
        self.assertTrue(all('runtime admission pending' in row['reason'] for row in rows))

    def test_readiness_gate_accepts_only_exact_body_types(self):
        gate = json.loads((ROOT / 'evidence/m2-native-production-gate-v5/report.json').read_bytes())
        gate['acceptedForRuntime'] = [gate['items'][0]['id']]
        with tempfile.TemporaryDirectory(dir=ROOT / 'output') as temp:
            path = Path(temp) / 'gate.json'
            path.write_text(json.dumps(gate), encoding='utf-8')
            rows = plan(self.catalog, self.root, readiness_report=path)
        self.assertEqual([row['status'] for row in rows], ['accepted', 'rejected'])
        self.assertIn('native-contour-cheek-b-v1', rows[1]['reason'])

    def test_readiness_gate_cannot_admit_a_different_body_revision(self):
        gate = json.loads((ROOT / 'evidence/m2-native-production-gate-v5/report.json').read_bytes())
        gate['acceptedForRuntime'] = [gate['items'][0]['id']]
        gate['items'][0]['bodySha256'] = '0' * 64
        with tempfile.TemporaryDirectory(dir=ROOT / 'output') as temp:
            path = Path(temp) / 'tampered-gate.json'
            path.write_text(json.dumps(gate), encoding='utf-8')
            rows = plan(self.catalog, self.root, readiness_report=path)
        self.assertEqual(rows[0]['status'], 'rejected')
        self.assertIn('body identity differs', rows[0]['reason'])


if __name__ == '__main__':
    unittest.main()
