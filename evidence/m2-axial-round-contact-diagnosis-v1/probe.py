"""Six frozen failed occurrences only. No full-frame contacts or shape solve."""
import ast
import argparse
from fractions import Fraction
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np
from scipy.interpolate import PPoly

ROOT = Path('F:/gamemake')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plane_distances(A, B):
    normal = np.cross(B[1] - B[0], B[2] - B[0])
    normal /= np.linalg.norm(normal)
    return ((A - B[0]) @ normal).tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=OUT / 'pairs.json')
    args = parser.parse_args()
    output = args.out.resolve()
    if not output.is_relative_to(OUT.resolve()) or output.exists():
        raise ValueError('Preserve existing diagnosis; choose unused --out inside this evidence directory')
    contact_path = ROOT / 'scripts/m2-representative-head-cage-v1/contact_classification.py'
    loader = importlib.util.spec_from_file_location('frozen_contact_observer', contact_path)
    observer = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(observer)
    inspect_pair = observer.inspect_pair
    function_path = ROOT / 'scripts/m2-axial-head-evaluation-v1/evaluate.py'
    node = next(n for n in ast.parse(function_path.read_bytes()).body if isinstance(n, ast.FunctionDef) and n.name == 'operator')
    namespace = {'np': np, 'PPoly': PPoly}
    exec(compile(ast.Module([node], []), 'pinned-G-operator-only', 'exec'), namespace)
    operator = namespace['operator']
    strict_path = ROOT / 'assets-source/m2-axial-head-readback-v1/results/male-round-stocky-v2.json'
    strict = json.loads(strict_path.read_bytes())
    assert sha(strict_path) == 'd3a9c8c843d1e56156a82ad3776d62b483e22cd12c3afe9dc66f50a1381ff055'
    assert strict['status'] == 'failed-not-admissible' and strict['newStrictPairCount'] == 6
    refs = strict['inputRequest']
    for key in ['source', 'sourceSpec', 'functionSpec', 'coefficients', 'report', 'sourceRecords', 'fixedSourceMasks', 'mappedEndpoints']:
        assert sha(ROOT / refs[key]['path']) == refs[key]['sha256'], key
    source = GLB((ROOT / refs['source']['path']).read_bytes())
    curves = json.loads((ROOT / refs['coefficients']['path']).read_bytes())
    records = json.loads((ROOT / refs['sourceRecords']['path']).read_bytes())['records']
    by_key = {(r['positionAccessor'], r['endpoint']): r for r in records}
    p_mouth = source.doc['meshes'][1]['primitives'][1]
    p_skin = source.doc['meshes'][1]['primitives'][5]
    assert source.doc['materials'][p_mouth['material']]['name'] == 'M00_000_00_FaceMouth_00_FACE'
    assert source.doc['materials'][p_skin['material']]['name'] == 'M00_000_00_Face_00_SKIN'
    assert p_mouth['attributes']['POSITION'] == p_skin['attributes']['POSITION'] == 21
    mouth_faces = np.asarray(source.accessor(p_mouth['indices']), int).reshape(-1, 3)
    skin_faces = np.asarray(source.accessor(p_skin['indices']), int).reshape(-1, 3)
    base = np.asarray(source.accessor(21), float)
    with np.load(ROOT / refs['mappedEndpoints']['path'], allow_pickle=False) as data:
        mapped, decoded = data['mappedEndpointsM'], data['float32BakeRoundTripM']
    target_names = source.doc['meshes'][1].get('extras', {}).get('targetNames', [])
    bindings = source.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']
    rows = []
    for frame in strict['frames']:
        if not frame['newStrictPairs']:
            continue
        target = frame['target']
        record = by_key[(21, target)]
        lookup = {v: record['offset'] + i for i, v in enumerate(record['sourceIndices'])}
        D = np.asarray(source.accessor(p_skin['targets'][target]['POSITION']), float)
        source64 = base + D
        source32 = (base.astype(np.float32) + D.astype(np.float32)).astype(float)
        for mouth_id, skin_id in frame['newStrictPairs']:
            ids = np.concatenate([mouth_faces[mouth_id], skin_faces[skin_id]])
            positions = np.asarray([lookup[int(v)] for v in ids])
            A, B = source64[ids[:3]], source64[ids[3:]]
            Q = mapped[positions]
            Q32 = decoded[positions]
            reevaluated, _, _ = operator(source64[ids], curves)
            assert np.array_equal(reevaluated, Q), 'Stored six vertices do not reproduce frozen G'
            stages = {'sourceFloat64': inspect_pair(A, B),
                'sourceRuntimeFloat32': inspect_pair(source32[ids[:3]], source32[ids[3:]]),
                'mappedFloat64': inspect_pair(Q[:3], Q[3:]),
                'mappedBakeFloat32': inspect_pair(Q32[:3], Q32[3:])}
            assert stages['mappedBakeFloat32']['strictHitEdges']
            source_has_strict = bool(stages['sourceFloat64']['strictHitEdges'])
            assert source_has_strict == ((mouth_id, skin_id) in set(map(tuple, frame['sourceExistingPairs'])))
            witnesses = []
            for hit in stages['mappedFloat64']['exactInclusiveHits']:
                edge_weights = np.zeros(3)
                edge_weights[hit['edge']] = 1 - hit['t']
                edge_weights[(hit['edge'] + 1) % 3] = hit['t']
                if hit['direction'] == 'mouth-to-skin':
                    am, bs = edge_weights, np.asarray(hit['barycentric'])
                else:
                    am, bs = np.asarray(hit['barycentric']), edge_weights
                source_witnesses = np.asarray([am @ A, bs @ B])
                true_mapped, _, _ = operator(source_witnesses, curves)
                linear = np.asarray([am @ Q[:3], bs @ Q[3:]])
                witnesses.append({'linearIntersectionPointM': hit['pointM'],
                    'mouthBarycentric': am.tolist(), 'skinBarycentric': bs.tolist(),
                    'correspondingSourcePointsM': source_witnesses.tolist(),
                    'GAtCorrespondingSourcePointsM': true_mapped.tolist(),
                    'sourcePointSeparationM': float(np.linalg.norm(source_witnesses[0] - source_witnesses[1])),
                    'actualGPointSeparationM': float(np.linalg.norm(true_mapped[0] - true_mapped[1])),
                    'linearMappedPointSeparationM': float(np.linalg.norm(linear[0] - linear[1])),
                    'perTriangleGVersusStraightTriangleErrorM': np.linalg.norm(true_mapped - linear, axis=1).tolist()})
            ulp = np.spacing(abs(Q32.astype(np.float32))).astype(float)
            labels = [b for b in bindings if any(v['mesh'] == 1 and v['index'] == target for v in b.get('binds', []))]
            rows.append({'target': target, 'originalTargetName': target_names[target], 'VRMBindings': labels,
                'pair': [mouth_id, skin_id], 'sourceVertexIds': {'mouth': ids[:3].tolist(), 'skin': ids[3:].tolist()},
                'sourceTargetPositionAccessor': p_skin['targets'][target]['POSITION'],
                'trianglesM': {'sourceFloat64': [A.tolist(), B.tolist()], 'sourceRuntimeFloat32': [source32[ids[:3]].tolist(), source32[ids[3:]].tolist()],
                    'mappedFloat64': [Q[:3].tolist(), Q[3:].tolist()], 'mappedBakeFloat32': [Q32[:3].tolist(), Q32[3:].tolist()]},
                'stages': stages, 'maximumFloat32BakeVertexErrorM': float(np.linalg.norm(Q32 - Q, axis=1).max()),
                'perVertexDisplacementM': np.linalg.norm(Q - source64[ids], axis=1).tolist(),
                'float32UlpPerAxisMaximumM': ulp.max(0).tolist(),
                'mappedFloat64SignedVertexPlaneDistancesM': {'mouthToSkinPlane': plane_distances(Q[:3], Q[3:]), 'skinToMouthPlane': plane_distances(Q[3:], Q[:3])},
                'planeDistanceMeaning': 'Signed vertex distances to the other finite triangle plane. Not a volume penetration depth or minimum separating translation.',
                'continuousGVersusStraightOutputWitnesses': witnesses,
                'classification': 'pending-summary-no-waiver', 'failureRetained': True})
    assert len(rows) == 6
    pins = [strict_path, contact_path, function_path, ROOT / 'assets-source/m2-representative-head-cage-v1/diagnostic-v1/inputs/probe-pair.py',
        ROOT / 'scripts/m2-hairstyle-v1/check-head-space.py'] + [ROOT / refs[key]['path'] for key in ['source', 'sourceSpec', 'functionSpec', 'coefficients', 'sourceRecords', 'mappedEndpoints']]
    result = {'schema': 'axial-round-six-contact-diagnosis-v1', 'sourceRequestId': 'male-round-stocky-v2',
        'occurrences': rows, 'scope': 'Only six stored failed pair occurrences in source, Float64 mapped vertices and Float32 proposed bake.',
        'predicate': {'strictInteriorThreshold': 1e-7, 'strictDeterminantThresholdM3': 1e-12,
            'exactInclusive': 'Exact rational arithmetic on represented IEEE input coordinates. Full coplanar handling is outside this frozen predicate.'},
        'GReadback': 'Only stored coefficients interpreted by pinned operator at the36 corner occurrences and reported barycentric witnesses. No curve fitting, shape solve, new mesh or55-frame scan.',
        'pins': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in pins],
        'failureChanged': False, 'geometryExported': False, 'runtimeAccepted': False}
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    for row in rows:
        print(json.dumps({'target': row['target'], 'pair': row['pair'],
            'sourceDistanceM': row['stages']['sourceFloat64']['exactRepresentedTriangleMinimumDistanceM'],
            'sourceInclusive': bool(row['stages']['sourceFloat64']['exactInclusiveHits']),
            'float64SegmentM': row['stages']['mappedFloat64']['intersectionSegmentLengthM'],
            'float32SegmentM': row['stages']['mappedBakeFloat32']['intersectionSegmentLengthM'],
            'bakeErrorM': row['maximumFloat32BakeVertexErrorM'],
            'GPointSeparationsM': [w['actualGPointSeparationM'] for w in row['continuousGVersusStraightOutputWitnesses']]}))


if __name__ == '__main__':
    main()
