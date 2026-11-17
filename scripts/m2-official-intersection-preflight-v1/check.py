"""Official installed CGAL detection smoke; no avatar or admission changes."""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import time

import igl.copyleft.cgal as cgal
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/m2-official-intersection-preflight-v1'


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def detect(a, fa, b, fb, cutoff=1000):
    values = cgal.intersect_other(
        np.ascontiguousarray(a, dtype=np.float64),
        np.ascontiguousarray(fa, dtype=np.int64),
        np.ascontiguousarray(b, dtype=np.float64),
        np.ascontiguousarray(fb, dtype=np.int64),
        detect_only=True, first_only=False, stitch_all=False,
        slow_and_more_precise_rounding=False, cutoff=cutoff)
    assert len(values) == 5, 'Use actual binding tuple, not inaccurate doc success field'
    pairs = np.asarray(values[0], dtype=np.int64).reshape(-1, 2)
    assert all(np.asarray(v).size == 0 for v in values[1:]), 'Detection must not remesh'
    return sorted(map(tuple, pairs.tolist()))


def main():
    report_path = OUT / 'report.json'
    if report_path.exists():
        raise FileExistsError('Archive old output before independent rerun')
    OUT.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()
    a = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]])
    f = np.array([[0, 1, 2]], dtype=np.int64)
    rows = []
    cases = [
        ('separate', a + [0., 0., 1.], False),
        ('transverse', [[.5, .5, -1.], [.5, .5, 1.], [1.5, .5, .25]], True),
        ('coplanar-area', a + [.25, .25, 0.], True),
        ('edge-touch', [[0., 0., 0.], [2., 0., 0.], [1., -1., 0.]], True),
        ('point-touch', [[0., 0., 0.], [-1., 0., 0.], [0., -1., 0.]], True),
        ('tiny-positive-gap', a + [0., 0., 2.**-50], False),
    ]
    for name, b, expected in cases:
        pairs = detect(a, f, b, f)
        assert bool(pairs) == expected, (name, pairs)
        rows.append(dict(name=name, VA=a.tolist(), VB=np.asarray(b).tolist(),
                         pairs=pairs, expectedHit=expected, passed=True))
    # A crossing exactly on the introduced diagonal must not disappear.
    bary = np.array([
        [[1, 0, 0], [.5, .5, 0], [.5, 0, .5]],
        [[0, 1, 0], [0, .5, .5], [.5, .5, 0]],
        [[.5, .5, 0], [0, .5, .5], [.5, 0, .5]],
        [[0, .5, .5], [0, 0, 1], [.5, 0, .5]],
    ], dtype=float)
    fine = (bary @ a).reshape(-1, 3)
    fine_f = np.arange(12).reshape(-1, 3)
    b = np.array([[.5, .5, -1.], [.5, .5, 1.], [1.5, .5, .25]])
    coarse_pairs = detect(a, f, b, f)
    fine_pairs = detect(fine, fine_f, b, f)
    assert coarse_pairs and fine_pairs
    rows.append(dict(name='crossing-on-added-child-boundary',
                     coarsePairs=coarse_pairs, childPairs=fine_pairs,
                     mappedParentPairs=sorted(set((0, j) for _, j in fine_pairs)),
                     childParentBary=bary.tolist(), passed=True))
    # Source passes cutoff to box_intersection_d as a traversal parameter,
    # not as a maximum hit count despite the Python docstring wording.
    many = np.concatenate([a + [3.*i, 0., 0.] for i in range(1100)])
    many_f = np.arange(len(many)).reshape(-1, 3)
    many_pairs = detect(many, many_f, many, many_f, cutoff=1)
    assert many_pairs == [(i, i) for i in range(1100)]
    rows.append(dict(name='cutoff-is-not-hit-count-cap', cutoff=1,
                     expectedPairs=1100, actualPairs=len(many_pairs), passed=True))
    native = sorted(Path(cgal.__file__).parent.glob('*.pyd'))
    report = dict(schema='official-cgal-intersection-preflight-v1',
                  status='api-smoke-passed-not-character-admission',
                  packages={k: importlib.metadata.version(k) for k in ['libigl','numpy','scipy']},
                  scriptSha256=digest(Path(__file__)),
                  native=[dict(name=p.name, sha256=digest(p), bytes=p.stat().st_size) for p in native],
                  cases=rows, elapsedSeconds=time.perf_counter()-start,
                  kernel='Pinned source: detect_only with double inputs selects CGAL::Epick',
                  semantics='Inclusive closed triangle intersection including coplanar, edge and point contact',
                  limits=['No character input, no G, no export, no skin or runtime pass.',
                          'Source parent aggregation deduplicates labels only; it does not classify penetration.',
                          'Cross-mesh detection does not automatically discard geometrically matching seams.',
                          'Different semantics from legacy strict segment predicate; legacy evidence remains unchanged.',
                          'Exact predicates concern supplied floating-point geometry, not unrounded intended surfaces.',
                          'Offline tool only; no CGAL binary added to browser or distributed game.'])
    report_path.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(status=report['status'], cases=len(rows), seconds=report['elapsedSeconds'])))


if __name__ == '__main__':
    main()
