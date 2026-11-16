"""Observe represented pair topology and precision. Never grants admission."""
import ast
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-representative-head-cage-v1/diagnostic-v1'
PROBE = BASE / 'inputs/probe-pair.py'
pins = json.loads((BASE / 'input-pins.json').read_bytes())
pin = next(r for r in pins['files'] if r['path'] == PROBE.relative_to(ROOT).as_posix())
if hashlib.sha256(PROBE.read_bytes()).hexdigest() != pin['sha256']:
    raise ValueError('Reviewed exact predicate source changed')
NAMES = ['vector', 'sub', 'dot', 'cross', 'exact_edge', 'add', 'scale', 'clamp01', 'disjoint_distance_squared', 'inspect']
namespace = {'np': np, 'Fraction': Fraction}
tree = ast.parse((ROOT / 'scripts/m2-hairstyle-v1/check-head-space.py').read_bytes())
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'segment_hits')
exec(compile(ast.Module([node], []), 'original-strict-predicate', 'exec'), namespace)
tree = ast.parse(PROBE.read_bytes())
nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in NAMES]
assert {n.name for n in nodes} == set(NAMES)
exec(compile(ast.Module(nodes, []), 'reviewed-exact-pair-functions', 'exec'), namespace)
inspect_pair = namespace['inspect']


def pair_record(pair, source, target, source_strict, target_strict):
    A, B = (np.asarray(v, float) for v in source)
    C, D = (np.asarray(v, float) for v in target)
    try:
        before, after = inspect_pair(A, B), inspect_pair(C, D)
        ulps = np.spacing(abs(np.vstack([C, D]).astype(np.float32))).astype(float)
        source_inclusive = bool(before['exactInclusiveHits'])
        target_inclusive = bool(after['exactInclusiveHits'])
        if target_strict and not source_strict:
            kind = 'strict-boundary-crossing-unresolved' if source_inclusive else 'represented-new-intersection-unresolved'
        elif source_strict and target_strict:
            kind = 'source-strict-contact-retained-unassessed'
        elif source_strict:
            kind = 'source-strict-contact-no-longer-strict-unassessed'
        else:
            kind = 'represented-boundary-observation-unresolved'
        result = {'pair': list(pair), 'sourceStrict': bool(source_strict), 'targetStrict': bool(target_strict),
            'newStrict': bool(target_strict and not source_strict), 'sourceInclusive': source_inclusive,
            'targetInclusive': target_inclusive, 'classification': kind,
            'sourceSegmentM': before['intersectionSegmentLengthM'], 'targetSegmentM': after['intersectionSegmentLengthM'],
            'sourceDistanceM': before['exactRepresentedTriangleMinimumDistanceM'],
            'targetDistanceM': after['exactRepresentedTriangleMinimumDistanceM'],
            'targetPerVertexPerAxisFloat32UlpM': ulps.tolist(),
            'targetPerVertexHalfUlpBoxRadiiM': np.linalg.norm(ulps / 2, axis=1).tolist(),
            'modifierRelativeErrorBoundM': None,
            'precisionClassification': 'unknown-conservative-error-budget; scale observations do not establish safety',
            'legacyGateStillFails': bool(target_strict and not source_strict),
            'productionAdmitted': False}
        if result['newStrict']:
            result.update(sourceTrianglePointsM=[A.tolist(), B.tolist()], targetTrianglePointsM=[C.tolist(), D.tolist()],
                          sourceExactInclusive=before['exactInclusiveHits'], targetExactInclusive=after['exactInclusiveHits'])
        return result
    except (ValueError, ZeroDivisionError, FloatingPointError) as error:
        return {'pair': list(pair), 'sourceStrict': bool(source_strict), 'targetStrict': bool(target_strict),
                'newStrict': bool(target_strict and not source_strict), 'classification': 'degenerate-or-unresolved',
                'error': str(error), 'productionAdmitted': False, 'legacyGateStillFails': bool(target_strict and not source_strict)}


def observe_frame(case, target_index, P, Q, mouth, skin, old_pairs, new_pairs):
    pairs = old_pairs | new_pairs
    if case['sex'] == 'male' and target_index == 0:
        pairs = pairs | {(47, 1007)}
    return [pair_record(pair, (P[mouth[pair[0]]], P[skin[pair[1]]]),
                        (Q[mouth[pair[0]]], Q[skin[pair[1]]]), pair in old_pairs, pair in new_pairs)
            for pair in sorted(pairs)]
