"""Read-only count/proximity plan. Does not call Delaunay or a shape solver."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import itertools
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name('domain-point-readback.json')
if OUT.exists():
    raise SystemExit('Refusing to overwrite evidence')
spec = importlib.util.spec_from_file_location('readonly_legacy', ROOT/'scripts/m2-representative-batch-v1/deform.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
native = json.loads(Path(__file__).with_name('native-vertex-guide.json').read_bytes())
result = {'schema': 'native-head-domain-point-plan-v1', 'tetrahedralizationCalled': False,
          'shapeSolveCalled': False, 'scipyVersion': scipy.__version__, 'sexes': []}
for item in native['sexes']:
    raw = (ROOT/item['source']['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == item['source']['sha256']
    g = legacy.GLB(raw)
    context = legacy.source_context(g)
    neck_y = float(context['joints']['neck'][1]-.005)
    needed, base_nodes, protected, body_points = [], [], [], []
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            name = g.doc['materials'][p['material']]['name']
            ids = np.unique(g.accessor(p['indices']))
            P = np.asarray(g.accessor(p['attributes']['POSITION']), dtype=np.float64)
            ends = [P]+[P+np.asarray(g.accessor(t['POSITION']), dtype=np.float64)
                        for t in p.get('targets', []) if 'POSITION' in t]
            for index, E in enumerate(ends):
                Q = E[ids]
                if 'Body_00_SKIN' in name:
                    part = Q[Q[:, 1]>=neck_y]
                    needed.append(part)
                    body_points.append(Q)
                    if index == 0:
                        base_nodes.append(part)
                if any(n in name for n in ('Face_00_SKIN', 'FaceMouth', 'FaceBrow')):
                    needed.append(Q)
                    if index == 0:
                        base_nodes.append(Q)
                if any(n in name for n in ('_EYE', 'Eyeline', 'Eyelash', 'HAIR')):
                    protected.append(Q)
    needed = np.unique(np.concatenate(needed), axis=0)
    lo, hi = needed.min(0)-.02, needed.max(0)+.02
    protected = np.unique(np.concatenate(protected), axis=0)
    inside = np.all((protected>=lo)&(protected<=hi), axis=1)
    body = np.unique(np.concatenate(body_points), axis=0)
    neck = body[(body[:, 1]<=neck_y)&np.all((body>=lo)&(body<=hi), axis=1)]
    primary_base = np.unique(np.concatenate(base_nodes), axis=0)
    corners = np.asarray(list(itertools.product(*zip(lo, hi))))
    nodes = np.unique(np.concatenate([primary_base, protected[inside], neck, corners]), axis=0)
    distances, indices = cKDTree(nodes).query(nodes, k=2)
    minimum_index = int(distances[:, 1].argmin())
    source_guides = np.asarray(item['sourcePointsM'])
    node_set = {tuple(v) for v in nodes}
    assert all(tuple(v) in node_set for v in source_guides)
    frozen_set = {tuple(v) for v in np.concatenate([protected[inside], neck, corners])}
    overlapping_guide_ids = [i for i, v in zip(item['guideVertexIndices'], source_guides) if tuple(v) in frozen_set]
    result['sexes'].append({'sex': item['sex'], 'source': item['source'],
        'neckStartWorldY': neck_y, 'boundsLowM': lo.tolist(), 'boundsHighM': hi.tolist(),
        'allNeededEndpointUniqueCount': len(needed), 'primaryBaseNodeCount': len(primary_base),
        'protectedInsideUniqueCount': int(inside.sum()), 'protectedOutsideUniqueCount': int((~inside).sum()),
        'neckFrozenUniqueCount': len(neck), 'boxCornerCount': len(corners),
        'exactUniqueNodeCount': len(nodes), 'guideFrozenExactOverlappingIds': overlapping_guide_ids,
        'minimumDistinctNodeDistanceM': float(distances[minimum_index, 1]),
        'nearestPairM': nodes[[minimum_index, indices[minimum_index, 1]]].tolist(),
        'nodesWithNearestBelowOneMicrometre': int((distances[:, 1]<1e-6).sum()),
        'nodesWithNearestBelowOneNanometre': int((distances[:, 1]<1e-9).sum()),
        'limits': 'Exact dedup only. No points merged by proximity. No tet, quality, coverage, or solver acceptance.'})
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
