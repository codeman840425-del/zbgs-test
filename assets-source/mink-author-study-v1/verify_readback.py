"""Check stored identities and the author's analytic two-sphere result without solving."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(__file__).resolve().parent
EVIDENCE = ROOT / 'evidence/mink-author-study-v1'


def main():
    receipt = json.loads((PACKAGE / 'prepared/source-receipt.json').read_bytes())
    for row in receipt['sourceFiles']:
        data = (ROOT / receipt['sourceRoot'] / row['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == row['sha256']
        assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == row['gitBlob']
    report = json.loads((PACKAGE / 'generated/report.json').read_bytes())
    traces = json.loads((PACKAGE / 'generated/trace.json').read_bytes())
    assert report['status'] == 'original-author-headless-samples-passed'
    assert len(traces['ur5eOriginalExample']) == 200
    assert len(traces['authorActiveCollisionTest']) == 4
    analytic = []
    for row in traces['authorActiveCollisionTest']:
        q = row['qAfter']
        actual_sphere_gap = math.hypot(.25 + q[1], q[0]) - .2
        expected = .005 + (1. - .85) * (.05 - .005)
        assert abs(actual_sphere_gap - row['distanceAfterM'][0]) < 1e-14
        assert abs(actual_sphere_gap - expected) < 1e-9
        assert row['activeCollisionRows'] == 1
        assert all(abs(end - start - velocity * row['dt']) < 1e-14 for start, end, velocity in
                   zip(row['qBefore'], row['qAfter'], row['velocity']))
        analytic.append({'dt': row['dt'], 'analyticSphereGapM': actual_sphere_gap,
                         'authorExpectedGapM': expected,
                         'remainingCenterTargetErrorM': abs(.25 + q[1])})
    result = {'schema': 'mink-author-study-independent-readback-v1',
              'status': 'stored-source-and-readback-verified',
              'upstreamGitBlobAndSHA256Count': len(receipt['sourceFiles']),
              'robotSteps': 200, 'analyticActiveContactSteps': analytic,
              'additionalSolveCalls': 0}
    output = EVIDENCE / 'readback-verification.json'
    if output.exists():
        raise ValueError('Refusing to overwrite stored verification')
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
