"""Exercise the byte accounting against the retained CDP capture, entirely in memory."""
import copy
from pathlib import Path
import unittest

from compare_rule_cold import counts, differences, inspect_report, inspect_session, read


class CompareColdTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = Path(__file__).resolve().parents[2] / 'evidence/m2-frozen-rule-game-v1'
        cls.records, _ = read(evidence / 'records.json')
        cls.report, _ = read(evidence / 'cold/report.json')
        cls.baseline = inspect_report(evidence / 'cold/report.json', cls.records)

    def test_shared_urls_and_sessions_are_counted_once(self):
        for session in self.baseline['sessions']:
            selected = [r for r in session['streams'].values() if r['group'] in ('body','garment')]
            self.assertEqual(len(selected), 5)
            self.assertEqual(sum(len(r['owners']) for r in selected), 8)
            self.assertEqual(counts(selected), dict(requests=12, payloadBytes=41581296, cdpTransferBytes=41583522))
        with self.assertRaisesRegex(ValueError, 'independent reports'):
            differences(self.baseline, self.baseline)

    def test_saved_bytes_follow_actual_lengths_for_each_session(self):
        fixture = copy.deepcopy(self.baseline)
        fixture.update(reportSha256='1' * 64, runtime={**fixture['runtime'], 'sourceDigest':'2' * 64})
        body = next(r for r in fixture['sessions'][0]['streams'].values() if r['group'] == 'body' and r['requests'] == 2)
        body['requests'] -= 1
        body['payloadBytes'] -= body['bytesPerResponse']
        body['cdpTransferBytes'] -= 12141443
        first, second = differences(self.baseline, fixture)
        self.assertEqual(first['savedBodyAndGarments'], dict(requests=1, payloadBytes=12141256, cdpTransferBytes=12141443))
        self.assertEqual(second['savedBodyAndGarments'], dict(requests=0, payloadBytes=0, cdpTransferBytes=0))

    def test_reissued_actor_unmeasured_transfer_or_aliased_instances_are_rejected(self):
        for field in ('signature','response','instance','survivor'):
            with self.subTest(field=field):
                session = copy.deepcopy(self.report['sessions'][0])
                if field == 'signature':
                    session['actors'][0]['recordSha256'] = '0' * 64
                elif field == 'response':
                    session['responses'][0]['transfer'][0]['transferBytes'] = 0
                elif field == 'instance':
                    session['actors'][0]['skeletonHead'] = session['actors'][1]['skeletonHead']
                else:
                    session['oldSurvivor']['renderedFrames'] = 0
                with self.assertRaises(ValueError):
                    inspect_session(session, self.records)


if __name__ == '__main__':
    unittest.main()
