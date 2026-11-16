"""Read actual posed waist samples. Along-Z subset order is not penetration or visual acceptance."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
helper_path = ROOT / 'scripts/diagnose-representative-vest-source.py'
helper_spec = importlib.util.spec_from_file_location('vest_source_diagnosis', helper_path)
helper = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(helper)
PHASES = ['idle', 'walk', 'run-turn', 'sit', 'seated', 'stand', 'leave', 'dance-technical', 'final-idle']
IDS = ['female', 'female-round-full-v2', 'female-soft-wide-v2']
VIEWS = ['room', 'inspect-half-front']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def finite(values, shape=None):
    array = np.asarray(values, dtype=float)
    if (shape is not None and array.shape != shape) or not np.isfinite(array).all():
        raise ValueError('Missing, nonfinite or wrongly shaped numerical samples')
    return array


def local_points(world, inverse_root):
    points = finite(world)
    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError('World positions must be Nx3')
    transformed = np.column_stack((points, np.ones(len(points)))) @ inverse_root.T
    if np.max(abs(transformed[:, 3] - 1), initial=0) > 1e-7:
        raise ValueError('Root transform is not affine')
    return finite(transformed[:, :3])


def topology(metadata):
    vertex_ids = metadata['vertexIds']
    if not vertex_ids or sorted(set(vertex_ids)) != vertex_ids:
        raise ValueError('Sample vertex IDs must be nonempty, unique and sorted')
    if any(not isinstance(value, int) or value < 0 for value in vertex_ids):
        raise ValueError('Invalid vertex ID')
    rest = finite(metadata['rest'], (len(vertex_ids), 3))
    lookup = {vertex: index for index, vertex in enumerate(vertex_ids)}
    triangles = metadata['triangles']
    if not triangles or len({t['ordinal'] for t in triangles}) != len(triangles):
        raise ValueError('Missing or duplicate triangle ordinals')
    indices = np.asarray([[lookup[v] for v in t['indices']] for t in triangles], dtype=int)
    if indices.shape != (len(triangles), 3):
        raise ValueError('Invalid triangle mapping')
    centroids = rest[indices].mean(1)
    eligible = np.flatnonzero((centroids[:, 1] >= .98) & (centroids[:, 1] <= 1.04)
                             & (abs(centroids[:, 0]) <= .10) & (centroids[:, 2] < 0))
    return {'metadata': metadata, 'indices': indices, 'eligible': eligible}


def measure_frame(sample, surfaces):
    root = finite(sample['rootMatrix'], (16,)).reshape(4, 4).T
    inverse_root = np.linalg.inv(root)
    finite(sample['cameraWorld'], (16,))
    finite(sample['cameraProjection'], (16,))
    finite(sample['position'], (3,))
    finite([sample['ms'], sample['simulationTime'], sample['samplingMs']], (3,))
    if len(sample['meshes']) != len(surfaces):
        raise ValueError('Sample mesh collection changed')
    tops, top_references, pants = [], [], []
    for index, (mesh, surface) in enumerate(zip(sample['meshes'], surfaces)):
        metadata = surface['metadata']
        if (mesh['role'], mesh['name']) != (metadata['role'], metadata['name']):
            raise ValueError('Sample mesh order or identity changed')
        points = local_points(mesh['world'], inverse_root)
        if len(points) != len(metadata['vertexIds']):
            raise ValueError('Sample vertex count changed')
        if not mesh['visible'] or not mesh['ancestorVisible']:
            continue
        triangles = points[surface['indices']]
        if mesh['role'] == 'top':
            tops.extend(triangles)
            top_references.extend({'meshIndex': index, 'triangleOrdinal': t['ordinal'], 'indices': t['indices']} for t in metadata['triangles'])
        elif mesh['role'] == 'pants':
            pants.extend((index, int(t), triangles[t].mean(0)) for t in surface['eligible'])
    if not tops or not pants:
        raise ValueError('No visible top or eligible pants centroids')
    top_triangles = np.asarray(tops)
    rows = []
    for mesh_index, triangle_index, point in pants:
        triangle = surfaces[mesh_index]['metadata']['triangles'][triangle_index]
        hit = helper.cover(point[:2], top_triangles[:, :, :2], -top_triangles[:, :, 2])
        row = {'pantsMeshIndex': mesh_index, 'pantsTriangleOrdinal': triangle['ordinal'],
               'pantsIndices': triangle['indices'], 'pantsCentroidLocalM': point.tolist()}
        if hit is None:
            row['status'] = 'no-sampled-top-cover-unknown'
        else:
            top_index, barycentric, negative_top_z = hit
            top_z = -negative_top_z
            gap = float(point[2] - top_z)
            row.update(status='pants-ahead-of-sampled-top' if gap > 1e-7 else 'sampled-top-ahead-or-within-tolerance',
                       selectedTopTriangleIndex=int(top_index), selectedTopTriangle=top_references[top_index], topBarycentric=barycentric.tolist(),
                       topPointLocalM=[float(point[0]), float(point[1]), top_z], alongZDifferenceM=gap)
        rows.append(row)
    return rows


def analyze_case(folder, case, expected, build, pin):
    report = json.loads(pin(folder / 'report.json'))
    samples = json.loads(pin(folder / 'samples.json'))
    problems = []
    identity = report['identity']
    primary = identity['primary']
    assert report['id'] == case[0] and report['view'] == case[1]
    assert report['build'] == build and report['status'] == 'captured-visual-pending'
    assert primary['id'] == expected['id']
    assert primary['actualSha256'] == primary['declaredSha256'] == expected['sha256']
    for key in ['runtimeBuild', 'servedBuild']:
        assert identity[key]['shortId'] == build and identity[key]['sourceDigest'].startswith(build)
        assert identity[key].get('development') is not True
    assert identity['runtimeBuild']['sourceDigest'] == identity['servedBuild']['sourceDigest']
    assert report['errors'] == [] and not report.get('sampleError')
    assert [t['kind'] for t in report['tasks']] == ['walk', 'walk', 'sit', 'stand', 'walk', 'dance']
    assert all(t['result']['state'] == 'completed' for t in report['tasks'])
    video = folder / 'normal1x.webm'
    video_bytes = pin(video)
    assert len(video_bytes) > 4 and video_bytes[:4] == bytes.fromhex('1a45dfa3'), 'Missing or invalid WebM header'
    surfaces = [topology(m) for m in report['surfaces']['meshes']]
    assert all(any(s['metadata']['role'] == role for s in surfaces) for role in ['top', 'pants'])
    rows = samples['rows']
    assert rows, 'No geometry rows'
    times = finite([r['ms'] for r in rows])
    assert np.all(np.diff(times) >= 99.999), 'Nonmonotonic or unexpected geometry sample interval'
    frames = samples['frames']
    assert frames, 'No rAF observations'
    finite([[r['ms'], r['dt']] for r in frames])
    assert all(r['dt'] >= 0 for r in frames)
    analysis = []
    for sample in rows:
        row = {'pagePerformanceMs': sample['ms'], 'secondsSinceFirstGeometrySample': (sample['ms'] - times[0]) / 1000,
               'simulationTime': sample['simulationTime'], 'phase': sample['phase']}
        try:
            assert sample['phase'] in PHASES, 'Unknown phase'
            row['centroids'] = measure_frame(sample, surfaces)
            row['status'] = 'measured-subset'
        except (AssertionError, ValueError, KeyError, TypeError, np.linalg.LinAlgError) as error:
            row.update(status='unknown-invalid-sample', error=str(error))
            problems.append({'pagePerformanceMs': sample.get('ms'), 'phase': sample.get('phase'), 'error': str(error)})
        analysis.append(row)
    phases = []
    for phase in PHASES:
        selected = [r for r in analysis if r['phase'] == phase]
        valid = [r for r in selected if r['status'] == 'measured-subset']
        if not valid:
            problems.append({'phase': phase, 'error': 'No valid geometry sample for required phase'})
        centroids = [c for row in valid for c in row['centroids']]
        gaps = [c['alongZDifferenceM'] for c in centroids if 'alongZDifferenceM' in c]
        positive = [r for r in valid if any(c['status'] == 'pants-ahead-of-sampled-top' for c in r['centroids'])]
        phases.append({'phase': phase, 'sampleFrames': len(selected), 'validFrames': len(valid),
                       'pagePerformanceMsRange': [selected[0]['pagePerformanceMs'], selected[-1]['pagePerformanceMs']] if selected else None,
                       'secondsSinceFirstSampleRange': [selected[0]['secondsSinceFirstGeometrySample'], selected[-1]['secondsSinceFirstGeometrySample']] if selected else None,
                       'pantsAheadSampleFrames': len(positive), 'pantsAheadSampleTimesSeconds': [r['secondsSinceFirstGeometrySample'] for r in positive],
                       'coveredCentroidObservations': len(gaps),
                       'noSampledTopCoverUnknown': sum(c['status'] == 'no-sampled-top-cover-unknown' for c in centroids),
                       'minimumAlongZDifferenceM': min(gaps) if gaps else None,
                       'maximumAlongZDifferenceM': max(gaps) if gaps else None})
    return {'id': case[0], 'view': case[1], 'status': 'analyzed-sampled-subset-with-limits' if not problems else 'incomplete-or-invalid',
            'problems': problems, 'bodyIdentity': primary, 'buildSourceDigest': identity['runtimeBuild']['sourceDigest'],
            'sampleFrames': len(rows), 'maximumSampleGapMs': float(np.diff(times).max(initial=0)),
            'videoExistsWithWebMHeader': True, 'videoDecodeOrDurationVerified': False,
            'excludedMeshes': report['surfaces'].get('excluded', []), 'phases': phases, 'frames': analysis}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    capture = args.capture.resolve()
    files = {}
    def pin(path):
        raw = path.read_bytes()
        files[str(path)] = {'path': str(path), 'sha256': sha(raw), 'bytes': len(raw)}
        return raw
    summary = json.loads(pin(capture / 'report.json'))
    assert summary['build'] == args.build and summary['status'] == 'captured-visual-pending', 'Wait for the complete capture report'
    expected_cases = {(identifier, view) for identifier in IDS for view in VIEWS}
    assert len(summary['cases']) == 6 and {(r['id'], r['view']) for r in summary['cases']} == expected_cases
    index_bytes = pin(capture / 'executed-runtime-index.json')
    assert sha(index_bytes) == summary['runtimeIndexSha256']
    index = json.loads(index_bytes)
    expected = {'female': {'id': 'beta-base-female-m1', 'sha256': '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}}
    for identifier in IDS[1:]:
        selected = [p for p in index['presets'] if p['id'] == identifier]
        assert len(selected) == 1
        expected[identifier] = selected[0]['profile']
    pin(capture / 'executed-script.cjs')
    for path in [Path(__file__), helper_path, ROOT/'scripts/qa_representative_batch_v2.py', ROOT/'scripts/m2-male-face-v1/glb.py', ROOT/'prototype/src/foundation-avatar.js']:
        pin(path)
    args.out.mkdir(parents=True, exist_ok=False)
    result = {'schema': 'vest-layer-chain-analysis-v1', 'build': args.build, 'capture': str(capture), 'cases': [],
              'method': 'Inverse sampled actor rootMatrix, then actual posed pants triangle centroids versus frontmost sampled top triangle at equal actor-local XY. Reuses source diagnostic cover(). These VRM0 avatars have a rotated child scene, so actor.root-local +Z is front. cover() uses negative actor-local Z as its minimization depth. Positive pantsZ-topZ means pants ahead of that sampled top subset.',
              'actorLocalFrontAxis': '+Z after inverse actor.root; source rest centroid eligibility remains -Z',
              'centroidRestSelection': {'yRangeM': [.98, 1.04], 'absoluteXMaximumM': .10, 'zMaximumExclusiveM': 0},
              'limits': ['Only captured rest-AABB topology and fixed eligible pants centroids. Additional posed front top triangles may lie outside this subset. A hit does not establish complete-top coverage; no hit remains unknown.',
                         'Along-Z order is not Euclidean penetration, full-surface intersection, physical cloth clearance, camera occlusion or a visible-pixel conclusion.',
                         'Sample times are page performance time and seconds since first geometry sample, not synchronized WebM timestamps. Intervals between samples are unobserved.',
                         'Finite checks and all-phase sample coverage do not constitute normal-speed human visual acceptance. WebM existence/header checked; video duration/playback not decoded.']}
    for case in sorted(expected_cases):
        name = case[0] + '-' + case[1]
        try:
            row = analyze_case(capture/name, case, expected[case[0]], args.build, pin)
            data_path = args.out/(name+'.json')
            data_path.write_bytes((json.dumps(row, allow_nan=False, separators=(',', ':'))+'\n').encode())
            result['cases'].append({k: v for k, v in row.items() if k != 'frames'})
            result['cases'][-1]['data'] = data_path.name
        except Exception as error:
            result['cases'].append({'id':case[0], 'view':case[1], 'status':'incomplete-or-invalid', 'error':str(error)})
    result['inputsStable'] = all(sha(Path(path).read_bytes()) == entry['sha256'] for path, entry in files.items())
    result['status'] = 'analyzed-sampled-subsets-with-limits' if result['inputsStable'] and all(r['status']=='analyzed-sampled-subset-with-limits' for r in result['cases']) else 'incomplete-or-invalid'
    result['files'] = list(files.values())
    (args.out/'report.json').write_bytes((json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2)+'\n').encode())
    print(json.dumps({'status':result['status'], 'cases':[{'id':r['id'], 'view':r['view'], 'status':r['status'], 'error':r.get('error')} for r in result['cases']]}))
    return 0 if result['status']=='analyzed-sampled-subsets-with-limits' else 1


if __name__ == '__main__':
    raise SystemExit(main())
