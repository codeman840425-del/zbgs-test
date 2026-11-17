import sys
import json
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from native_batch_gate import CHECK_TO_ADAPTER, GateError, evaluate


class NativeBatchGateTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
