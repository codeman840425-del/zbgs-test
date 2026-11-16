"""Pinned per-query causal analysis. No game, asset or solver state mutation."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
CAPTURE = 'evidence/m2-hair-seat-collision-e9b-v1/collision-observer/report.json'
CAPTURE_SHA = 'dc4e4d321db63e5ffefb9e394a5d5813df95017ae4912f44f6a56afb22bbe8b0'
OFFICIAL = 'experiments/m2-long-hair-fixed-v4/prototype/node_modules/@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js'
OFFICIAL_SHA = 'bfbde90b326aa80575e5001edf52c4500d80596032d213fb0fc93e72a7b47f66'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def analyse(record):
    frames = record['capture']['frames']
    stats = {kind: {'queries': 0, 'negative': 0, 'maxInputPointMutationM': 0., 'maxEligibleCorrectionM': 0.} for kind in ['body', 'room']}
    shape_stats = {}; timeline = []; first_room = None; sequential_error = 0.; direction_error = 0.; length_ratio = []
    for index, frame in enumerate(frames):
        tails = np.array(frame['dynamics']['worldTails'])
        row = {'frame': index, 'ms': frame['ms'], 'mode': frame['mode'], 'sitProgress': frame['sitProgress'],
               'tipAbovePony1M': float(tails[-1, 1]-tails[0, 1]), 'headWorldYM': frame['headWorld'][13],
               'bodyNegative': 0, 'roomNegative': 0, 'bodyEligibleCorrectionM': 0., 'roomEligibleCorrectionM': 0.}
        assert len(frame['queries']) == 30
        for joint in range(6):
            queries = frame['queries'][5*joint:5*joint+5]
            assert all(q['bone'] == 'Pony'+str(joint) for q in queries)
            pivot = np.array(queries[0]['pivotMatrix']).reshape(4, 4).T[:3, 3]
            length = np.linalg.norm(np.array(queries[0]['pointBefore'])-pivot)
            length_ratio.append(float(length/np.linalg.norm(tails[joint]-pivot)))
            endpoint = None
            for qi, query in enumerate(queries):
                kind = query['category']; distance = query['signedDistance']; stat = stats[kind]
                before, after, target = [np.array(query[key]) for key in ['pointBefore', 'pointAfter', 'targetAfter']]
                stat['queries'] += 1
                stat['maxInputPointMutationM'] = max(stat['maxInputPointMutationM'], float(np.linalg.norm(after-before)))
                shape = shape_stats.setdefault(query['shape'], {'category': kind, 'queries': 0, 'negative': 0, 'minimumSignedGapM': float('inf'), 'maxEligibleCorrectionM': 0.})
                shape['queries'] += 1; shape['minimumSignedGapM'] = min(shape['minimumSignedGapM'], distance)
                endpoint = after.copy()
                if distance < 0:
                    shape['negative'] += 1; stat['negative'] += 1; row[kind+'Negative'] += 1
                    amount = float(np.linalg.norm(target)*-distance)
                    shape['maxEligibleCorrectionM'] = max(shape['maxEligibleCorrectionM'], amount)
                    stat['maxEligibleCorrectionM'] = max(stat['maxEligibleCorrectionM'], amount)
                    row[kind+'EligibleCorrectionM'] += amount
                    if kind == 'room' and first_room is None:
                        first_room = {'frame': index, 'ms': frame['ms'], 'shape': query['shape'], 'signedDistanceM': distance}
                    endpoint += target*-distance
                    endpoint = pivot+(endpoint-pivot)/np.linalg.norm(endpoint-pivot)*length
                if qi+1 < len(queries):
                    sequential_error = max(sequential_error, float(np.linalg.norm(endpoint-np.array(queries[qi+1]['pointBefore']))))
            # Compare direction after the official correction/length rule with the
            # actual rendered child. Its authored rest length remains separate.
            a, b = endpoint-pivot, tails[joint]-pivot
            direction_error = max(direction_error, float(np.linalg.norm(a/np.linalg.norm(a)-b/np.linalg.norm(b))))
        timeline.append(row)
    peak = max(timeline, key=lambda row: row['tipAbovePony1M'])
    assert sequential_error < 1e-10 and direction_error < 1e-10
    return {'frames': len(frames), 'stats': stats, 'perShape': shape_stats, 'peak': peak, 'firstRoomNegative': first_room,
            'firstRoomAfterPeakMs': first_room['ms']-peak['ms'], 'maxSequentialQueryRuleErrorM': sequential_error,
            'maxFinalChildDirectionRuleError': direction_error,
            'observedSolverLengthToChildOriginLengthRatio': [min(length_ratio), max(length_ratio)],
            'bodyContributionConfirmedZero': stats['body']['negative'] == 0 and stats['body']['maxInputPointMutationM'] == 0}, timeline


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--input-root', type=Path, default=ROOT)
    args = parser.parse_args(); source = args.input_root
    raw = (source/CAPTURE).read_bytes(); official = (source/OFFICIAL).read_bytes()
    assert digest(raw) == CAPTURE_SHA and digest(official) == OFFICIAL_SHA
    record = json.loads(raw)
    assert record['build'] == 'e9bd472be0f8' and record['status'] == 'captured'
    assert record['capture']['wrappersRestored'] and not record['capture']['observationErrors']
    assert record['identity']['primary']['actualSha256'] == '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
    assert record['fit']['assetSha256'] == '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385'
    result, timeline = analyse(record)
    result.update(build=record['build'], capture={'path': CAPTURE, 'sha256': CAPTURE_SHA, 'bytes': len(raw)},
                  identities={'bodySha256': record['identity']['primary']['actualSha256'], 'hairSha256': record['fit']['assetSha256'], 'fitVersion': record['fit']['version']},
                  official={'path': OFFICIAL, 'sha256': OFFICIAL_SHA, 'version': '3.5.5'},
                  confirmed=['All 9378 body shape queries return positive gaps and leave their input point unchanged. The official negative-distance branch applies zero body correction.',
                             'The observed upward peak occurs 570.3ms before the first environment correction.',
                             'The official correction/normalization rule reproduces sequential query inputs and final child direction within numerical precision.'],
                  replay={'admitted': False, 'attempts': ['replay-attempt-1', 'replay-attempt-2'],
                          'limit': 'Simplified full hierarchy replays failed to match captured private-tail history and world-matrix update order. Their head-reference results provide no admitted product prediction.'},
                  boundedCandidate={'proposal': 'For this exact hairstyle only, author a raw-head reference option in its fit config while keeping the historical avatar-scene default and all collision/force settings.',
                                    'reason': 'The measured rise occurs in unconstrained spring motion while the local head/hips trajectory moves relative to the avatar-scene history frame.',
                                    'status': 'One proposed candidate. Requires one exact-version seated/walk/run/reset visual and query check before acceptance. No runtime or source configuration changed.'},
                  currentLimit='The current avatar-scene implementation has a recorded seated-transition flip. Dynamic long-hair acceptance remains incomplete.',
                  CPUOnly=True, GPUUsed=False, runtimeModified=False, sourceGeometryModified=False)
    (OUT/'result.json').write_bytes((json.dumps(result, indent=2)+'\n').encode())
    selected = [row for row in timeline if abs(row['frame']-result['peak']['frame']) <= 4 or abs(row['frame']-result['firstRoomNegative']['frame']) <= 4]
    (OUT/'selected-timeline.json').write_bytes((json.dumps(selected, indent=2)+'\n').encode())
    print(json.dumps({'frames': result['frames'], 'body': result['stats']['body'], 'peak': result['peak'],
                      'firstRoomNegative': result['firstRoomNegative'], 'maxQueryRuleErrorM': result['maxSequentialQueryRuleErrorM'],
                      'maxChildDirectionError': result['maxFinalChildDirectionRuleError']}))


if __name__ == '__main__': main()
