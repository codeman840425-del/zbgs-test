import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import native_admission_cycle as cycle


class NativeAdmissionCycleTests(unittest.TestCase):
    def test_confined_rejects_external_path(self):
        with self.assertRaises(ValueError):
            cycle.confined(Path(tempfile.gettempdir()) / 'outside-cycle.json')

    def test_blocked_gate_still_writes_record_plan_without_requests(self):
        gate = {
            'schema': 'native-production-readiness-v1',
            'acceptedForRuntime': [],
            'items': [{'id': 'body-a', 'bodyType': 'body-a'}],
        }
        record_batch = {
            'schema': 'native-record-batch-request-v1',
            'acceptedCount': 0,
            'rejectedCount': 1,
        }
        with tempfile.TemporaryDirectory(dir=cycle.ROOT) as temp:
            root = Path(temp)
            with (
                patch.object(cycle.native_batch_gate, 'evaluate', return_value=gate) as evaluate,
                patch.object(cycle.native_record_batch, 'run', return_value=record_batch) as run,
            ):
                result = cycle.cycle(
                    cycle.ROOT / 'assets-source/native-parameter-game-packages-v1/import-batch.json',
                    root / 'gate.json', root / 'records',
                    runtime_report=None, adapter_report=None, microphone_report=None,
                    adaptation_report=None, runtime_head_audit=None,
                )
            evaluate.assert_called_once()
            run.assert_called_once()
            self.assertEqual(result['status'], 'blocked')
            self.assertEqual(result['acceptedForRuntime'], [])
            self.assertEqual(json.loads((root / 'gate.json').read_text())['acceptedForRuntime'], [])

    def test_refuses_existing_gate(self):
        with tempfile.TemporaryDirectory(dir=cycle.ROOT) as temp:
            root = Path(temp)
            gate_path = root / 'gate.json'
            gate_path.write_text('{}')
            with self.assertRaises(FileExistsError):
                cycle.cycle(
                    cycle.ROOT / 'assets-source/native-parameter-game-packages-v1/import-batch.json',
                    gate_path, root / 'records',
                )

    def test_failed_record_planning_rolls_back_new_cycle_outputs(self):
        with tempfile.TemporaryDirectory(dir=cycle.ROOT) as temp:
            root = Path(temp)
            gate_path = root / 'gate.json'
            records_path = root / 'records'
            with (
                patch.object(cycle.native_batch_gate, 'evaluate', return_value={
                    'schema': 'native-production-readiness-v1', 'acceptedForRuntime': [], 'items': []}),
                patch.object(cycle.native_record_batch, 'run', side_effect=RuntimeError('planner failed')),
            ):
                with self.assertRaises(RuntimeError):
                    cycle.cycle(
                        cycle.ROOT / 'assets-source/native-parameter-game-packages-v1/import-batch.json',
                        gate_path, records_path,
                    )
            self.assertFalse(gate_path.exists())
            self.assertFalse(records_path.exists())


if __name__ == '__main__':
    unittest.main()
