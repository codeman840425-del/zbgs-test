import hashlib
import json
from pathlib import Path
import unittest

from qa_record_palette_cost import compare


class RecordPaletteCostTests(unittest.TestCase):
    def setUp(self):
        evidence = Path(__file__).resolve().parents[2] / 'evidence'
        case = evidence / 'm2-signed-hair-cache-budget-v1'
        signed = (evidence / 'm2-uniform-agent-handoff-v1/records.json').read_bytes()
        self.records = json.loads(signed)
        self.digest = hashlib.sha256(signed).hexdigest()
        self.cpu = json.loads((case / 'cpu/default-measure.json').read_bytes())
        self.chrome = json.loads((case / 'runtime/replay.json').read_bytes())

    def check(self):
        return compare(self.cpu, self.chrome, self.records, self.digest)

    def test_signed_capture_matches_per_part(self):
        result = self.check()
        self.assertEqual(result['derivedTextureObjects'], 8)
        self.assertEqual(result['derivedCanvasRgba8Bytes'], 22 * 1024 ** 2)
        self.assertFalse(result['runtimeAdmission'])

    def test_omitted_eyebrow_is_detected(self):
        del self.cpu['records'][0]['reviewedLegacyAppearanceCache']['groups']['brow']
        with self.assertRaisesRegex(ValueError, 'Incomplete per-record'):
            self.check()

    def test_double_counted_outline_is_detected(self):
        self.cpu['records'][0]['reviewedLegacyAppearanceCache']['groups']['lips']['distinctDerivedTextures'] = 4
        with self.assertRaisesRegex(ValueError, 'lips: estimated cost differs'):
            self.check()

    def test_different_signed_actor_is_detected(self):
        self.chrome['observed']['first']['recordSha256'] = self.records[1]['integrity']['recordSha256']
        with self.assertRaisesRegex(ValueError, 'Different signed actors'):
            self.check()

    def test_live_handle_after_disposal_is_detected(self):
        self.chrome['observed']['disposePeer']['handles'][0]['live'] = True
        with self.assertRaisesRegex(ValueError, 'Disposal differs'):
            self.check()


if __name__ == '__main__':
    unittest.main()
