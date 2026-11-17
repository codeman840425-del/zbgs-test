import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from native_batch_gate import CHECK_TO_ADAPTER, evaluate


class NativeBatchGateTests(unittest.TestCase):
    def test_adapter_tasks_are_explicit_and_no_runtime_auto_accept(self):
        report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'))
        self.assertEqual(report['schema'], 'native-production-readiness-v1')
        self.assertEqual(report['summary']['items'], 2)
        self.assertEqual(report['acceptedForRuntime'], [])
        self.assertGreater(report['summary']['adapterTaskCount'], 0)
        for row in report['items']:
            self.assertEqual(row['lanes']['authoring'], 'verified')
            self.assertEqual(row['lanes']['runtimeCatalog'], 'unverified')
            self.assertTrue(row['blockers'])
            self.assertTrue({item['check'] for item in row['adapterTasks']} <= set(CHECK_TO_ADAPTER))

    def test_same_batch_has_reusable_unchanged_checks(self):
        report = evaluate(Path('assets-source/native-parameter-game-packages-v1/import-batch.json'))
        for row in report['items']:
            self.assertIn('garmentsAndCoverage', row['reusableChecks'])
            self.assertIn('feetAndFloor', row['reusableChecks'])
            self.assertIn('seatContact', row['reusableChecks'])

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


if __name__ == '__main__':
    unittest.main()
