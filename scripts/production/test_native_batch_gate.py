import sys
import json
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from native_batch_gate import (CHECK_TO_ADAPTER, GateError, budget_classification_index,
                               dynamic_trace_index, evaluate, glasses_candidate_index,
                               microphone_candidate_index, surface_admission_index)


class NativeBatchGateTests(unittest.TestCase):
    def test_dynamic_trace_is_exact_body_diagnostic_evidence(self):
        path = Path('evidence/m2-native-dynamic-runtime-trace-v3a/summary.json')
        indexed = dynamic_trace_index(path)
        self.assertEqual(len(indexed), 2)
        for row in indexed.values():
            self.assertEqual(row['status'], 'technical-pass-diagnostic-only')
            self.assertEqual(row['clears'], [])
            self.assertEqual(len(row['bodySha256']), 64)

    def test_dynamic_trace_wrong_record_is_rejected(self):
        source = json.loads(Path('evidence/m2-native-dynamic-runtime-trace-v3a/summary.json').read_text())
        source['bodies'][0]['recordSha256'] = '0' * 64
        with tempfile.TemporaryDirectory(dir=Path('output')) as temp:
            path = Path(temp) / 'trace.json'
            path.write_text(json.dumps(source), encoding='utf8')
            with self.assertRaises(ValueError):
                dynamic_trace_index(path)

    def test_budget_classification_keeps_four_layers_diagnostic(self):
        path = Path('evidence/m2-native-batch-runtime-seam-v1/budget-classification-v1.json')
        indexed = budget_classification_index(path)
        self.assertEqual(len(indexed), 2)
        for row in indexed.values():
            self.assertIn('transport', row)
            self.assertIn('decodeCanvas', row)
            self.assertIn('gpu', row)
            self.assertIn('ordinaryPC', row)
            self.assertEqual(row['scope'].split(';')[-1].strip(), 'no admission')

    def test_surface_static_identity_is_attached_without_runtime_clear(self):
        indexed = surface_admission_index(Path('evidence/m2-native-surface-texture-admission-v1/REPORT.json'))
        self.assertEqual(len(indexed), 2)
        for row in indexed.values():
            self.assertTrue(row['static']['bodyShaExact'])
            self.assertEqual(row['clears'], [])
            self.assertEqual(row['runtime']['status'], 'blocked')

    def test_glasses_candidate_is_attached_without_fit_clear(self):
        indexed = glasses_candidate_index(Path('evidence/m2-native-batch-runtime-seam-v1/native-glasses-runtime-candidate-v1/report.json'))
        self.assertEqual(len(indexed), 2)
        for row in indexed.values():
            self.assertTrue(row['standApplied'])
            self.assertTrue(row['sitApplied'])
            self.assertFalse(row['verified'])
            self.assertEqual(row['clears'], [])

    def test_microphone_candidate_is_attached_without_browser_clear(self):
        indexed = microphone_candidate_index(Path('evidence/m2-native-batch-runtime-seam-v1/microphone-final-v1/result.json'))
        self.assertEqual(len(indexed), 2)
        for row in indexed.values():
            self.assertEqual(row['status'], 'cpu-candidate-only')
            self.assertFalse(row['verified'])
            self.assertEqual(row['clears'], [])
    def test_adapter_tasks_are_explicit_and_no_runtime_auto_accept(self):
        report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'))
        self.assertEqual(report['schema'], 'native-production-readiness-v1')
        self.assertEqual(report['summary']['items'], 2)
        self.assertEqual(report['acceptedForRuntime'], [])
        self.assertGreater(report['summary']['adapterTaskCount'], 0)
        for row in report['items']:
            self.assertEqual(row['lanes']['authoring'], 'verified')
            self.assertEqual(row['lanes']['bodyPackage'], 'verified')
            self.assertEqual(row['lanes']['coverage'], 'verified')
            self.assertEqual(row['lanes']['runtimeCatalog'], 'unverified')
            self.assertTrue(row['blockers'])
            self.assertTrue({item['check'] for item in row['adapterTasks']} <= set(CHECK_TO_ADAPTER))

    def test_same_batch_has_reusable_unchanged_checks(self):
        report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'))
        for row in report['items']:
            self.assertIn('garmentsAndCoverage', row['reusableChecks'])
            self.assertIn('feetAndFloor', row['reusableChecks'])
            self.assertIn('seatContact', row['reusableChecks'])

    def test_pending_adapter_tasks_pin_the_dependency_evidence(self):
        report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'))
        for row in report['items']:
            self.assertTrue(row['adapterTasks'])
            for task in row['adapterTasks']:
                self.assertEqual(task['evidence']['role'], 'dependency-follow-up')
                self.assertEqual(task['evidence']['report']['path'], row['source']['provenance']['path'])
                self.assertEqual(task['evidence']['report']['sha256'], row['source']['provenance']['sha256'])

    def test_completed_consumer_qa_marks_only_the_runtime_lanes(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            runtime_report=Path('evidence/m2-native-record-plan-v4/runtime/dual-restore/report.json'),
        )
        for row in report['items']:
            self.assertEqual(row['lanes']['runtimeCatalog'], 'verified')
            self.assertEqual(row['lanes']['record'], 'verified')
            self.assertEqual(row['lanes']['restore'], 'verified')
            self.assertIsNotNone(row['runtimeEvidence'])
            self.assertEqual(report['acceptedForRuntime'], [])

    def test_runtime_report_with_wrong_body_identity_does_not_clear_lanes(self):
        source = json.loads(Path('evidence/m2-native-record-plan-v4/runtime/dual-restore/report.json').read_text(encoding='utf-8'))
        source['inputs'][0]['body']['sha256'] = '0' * 64
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'wrong-runtime.json'
            report_path.write_text(json.dumps(source), encoding='utf-8')
            report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
                              runtime_report=report_path)
        row = next(item for item in report['items'] if item['bodyType'] == 'native-contour-roundness-a-v1')
        self.assertIsNone(row['runtimeEvidence'])
        self.assertEqual(row['lanes']['runtimeCatalog'], 'unverified')

    def test_shared_adapter_evidence_removes_only_the_expression_task(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            adapter_report=Path('evidence/m2-native-eye-admission-v9/adapter-regression.json'),
        )
        for row in report['items']:
            self.assertEqual(row['adapterEvidence']['targetCount'], 57)
            self.assertNotIn('facialExpressions', {item['check'] for item in row['adapterTasks']})
            self.assertIn('handAndMicrophone', {item['check'] for item in row['adapterTasks']})
            self.assertEqual(row['resolvedChecks']['facialExpressions']['status'], 'passed')
            self.assertEqual(
                row['resolvedChecks']['facialExpressions']['evidence']['report']['path'],
                'evidence/m2-native-eye-admission-v9/adapter-regression.json',
            )
            self.assertIn('handAndMicrophone', row['blockers'][-1])
            self.assertNotIn('facialExpressions', row['blockers'][-1])

    def test_registered_microphone_fit_removes_only_the_grip_task(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            microphone_report=Path('evidence/m2-native-batch-runtime-v1/microphone-registration.json'),
        )
        for row in report['items']:
            self.assertEqual(row['accessoryEvidence']['microphone']['bodyType'], row['bodyType'])
            self.assertNotIn('handAndMicrophone', {item['check'] for item in row['adapterTasks']})
            self.assertIn('headAttachments', {item['check'] for item in row['adapterTasks']})
            self.assertEqual(row['resolvedChecks']['handAndMicrophone']['status'], 'passed')
            self.assertEqual(
                row['resolvedChecks']['handAndMicrophone']['evidence']['report']['path'],
                'evidence/m2-native-batch-runtime-v1/microphone-registration.json',
            )
            self.assertNotIn('handAndMicrophone', row['blockers'][-1])

    def test_combined_shared_evidence_rebuilds_pending_blocker(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            adapter_report=Path('evidence/m2-native-eye-admission-v9/adapter-regression.json'),
            microphone_report=Path('evidence/m2-native-batch-runtime-v1/microphone-registration.json'),
        )
        for row in report['items']:
            pending = row['blockers'][-1]
            self.assertNotIn('facialExpressions', pending)
            self.assertNotIn('handAndMicrophone', pending)
            self.assertEqual(set(row['resolvedChecks']), {'facialExpressions', 'handAndMicrophone'})

    def test_unknown_adapter_schema_cannot_clear_expression_task(self):
        batch = Path('assets-source/native-parameter-game-packages-v1/import-batch.json')
        source = json.loads(Path('evidence/m2-native-eye-admission-v9/adapter-regression.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'unknown-adapter.json'
            source['schema'] = 'unrecognized-adapter-v1'
            report_path.write_text(json.dumps(source), encoding='utf-8')
            with self.assertRaises(GateError):
                evaluate(batch, adapter_report=report_path)

    def test_source_adaptation_audit_is_attached_without_clearing_tasks(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            adaptation_report=Path('evidence/m2-native-batch-adaptation-v1/adaptation-admissions.json'),
        )
        for row in report['items']:
            self.assertIn('candidateAdaptationEvidence', row)
            self.assertEqual(row['candidateAdaptationEvidence']['scope'],
                             'source-side structure and texture contract; no runtime or visual admission')
            self.assertIn('dynamicMotion', row['candidateAdaptationEvidence'])
            self.assertTrue(row['adapterTasks'])

    def test_runtime_head_audit_is_attached_without_faking_budget_pass(self):
        report = evaluate(
            Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
            runtime_head_audit=Path('evidence/m2-native-batch-runtime-seam-v1/runtime-record-budget-head-attachment-audit.json'),
        )
        for row in report['items']:
            self.assertIn('runtimeHeadAuditEvidence', row)
            self.assertEqual(row['runtimeHeadAuditEvidence']['budget']['status'], 'over-budget')
            self.assertTrue(row['adapterTasks'])

    def test_exact_glasses_admission_clears_only_head_attachment(self):
        batch = json.loads(Path('assets-source/native-parameter-game-packages-v1/import-batch.json').read_text(encoding='utf-8'))
        catalog = json.loads(Path('prototype/src/native-production-catalog.json').read_text(encoding='utf-8'))
        profiles = {row['bodyType']: row['profile']['sha256'] for row in catalog['entries']}
        glasses = json.loads(Path('prototype/src/glasses-temple-fit-manifest.json').read_text(encoding='utf-8'))
        accessory = json.loads(Path('prototype/public/assets/m1c/accessories.json').read_text(encoding='utf-8'))
        accessory_sha = next(row['sha256'] for row in accessory['items'] if row['id'] == 'studio-glasses-v1')
        candidates = []
        for item in batch['items']:
            spec = json.loads(Path(item['spec']).read_text(encoding='utf-8'))
            entry = next(row for row in glasses['profiles'] if row['bodySHA256'] == spec['bodySha256'])
            candidates.append({
                'bodyType': spec['bodyType'], 'bodySha256': spec['bodySha256'],
                'profileSha256': entry['sha256'], 'accessorySha256': accessory_sha,
                'runtimeFit': 'passed', 'closeReopen': 'passed',
            })
        report = {'schema': 'native-glasses-admission-v1', 'status': 'passed', 'visualReview': 'passed',
                  'scope': 'test-only exact glasses admission', 'candidates': candidates}
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'glasses-admission.json'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            result = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
                              adapter_report=Path('evidence/m2-native-eye-admission-v9/adapter-regression.json'),
                              glasses_report=report_path)
        for row in result['items']:
            checks = {item['check'] for item in row['adapterTasks']}
            self.assertNotIn('headAttachments', checks)
            self.assertNotIn('facialExpressions', checks)
            self.assertEqual(row['resolvedChecks']['headAttachments']['status'], 'passed')
            self.assertEqual(row['glassesAdmissionEvidence']['scope'], 'test-only exact glasses admission')
            self.assertIn('dynamicMotion', checks)

    def test_candidate_only_glasses_report_cannot_clear_head_attachment(self):
        source = json.loads(Path('prototype/src/glasses-temple-fit-manifest.json').read_text(encoding='utf-8'))
        accessory = json.loads(Path('prototype/public/assets/m1c/accessories.json').read_text(encoding='utf-8'))
        accessory_sha = next(row['sha256'] for row in accessory['items'] if row['id'] == 'studio-glasses-v1')
        profile = source['profiles'][0]
        report = {'schema': 'native-glasses-admission-v1', 'status': 'candidate-only', 'visualReview': 'pending',
                  'candidates': [{'bodyType': profile['body'], 'bodySha256': profile['bodySHA256'],
                                 'profileSha256': profile['sha256'], 'accessorySha256': accessory_sha,
                                 'runtimeFit': 'candidate', 'closeReopen': 'pending'}]}
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'glasses-admission.json'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            with self.assertRaises(GateError):
                evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
                         glasses_report=report_path)

    def test_four_layer_budget_admission_clears_only_budget_task(self):
        batch = json.loads(Path('assets-source/native-parameter-game-packages-v1/import-batch.json').read_text(encoding='utf-8'))
        candidates = []
        for item in batch['items']:
            spec = json.loads(Path(item['spec']).read_text(encoding='utf-8'))
            candidates.append({
                'bodyType': spec['bodyType'], 'bodySha256': spec['bodySha256'],
                'budgetVersion': 'test-budget-v1', 'recordSha256': 'a' * 64,
                'layers': {'transport': 'passed', 'decodeCanvas': 'passed',
                           'gpu': 'passed', 'ordinaryPC': 'passed'},
            })
        report = {'schema': 'native-budget-admission-v1', 'status': 'passed',
                  'scope': 'test-only four-layer budget admission', 'candidates': candidates}
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'budget-admission.json'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            result = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
                              budget_report=report_path)
        for row in result['items']:
            checks = {item['check'] for item in row['adapterTasks']}
            self.assertNotIn('runtimeRecordAndBudget', checks)
            self.assertEqual(row['resolvedChecks']['runtimeRecordAndBudget']['status'], 'passed')
            self.assertEqual(row['budgetAdmissionEvidence']['budgetVersion'], 'test-budget-v1')
            self.assertIn('headAttachments', checks)

    def test_budget_admission_requires_ordinary_pc_layer(self):
        batch = json.loads(Path('assets-source/native-parameter-game-packages-v1/import-batch.json').read_text(encoding='utf-8'))
        spec = json.loads(Path(batch['items'][0]['spec']).read_text(encoding='utf-8'))
        report = {'schema': 'native-budget-admission-v1', 'status': 'passed', 'candidates': [{
            'bodyType': spec['bodyType'], 'bodySha256': spec['bodySha256'],
            'budgetVersion': 'test-budget-v1', 'recordSha256': 'b' * 64,
            'layers': {'transport': 'passed', 'decodeCanvas': 'passed', 'gpu': 'passed', 'ordinaryPC': 'unmeasured'},
        }]}
        with tempfile.TemporaryDirectory(dir='output') as temp_dir:
            report_path = Path(temp_dir) / 'budget-admission.json'
            report_path.write_text(json.dumps(report), encoding='utf-8')
            with self.assertRaises(GateError):
                evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'),
                         budget_report=report_path)


if __name__ == '__main__':
    unittest.main()
