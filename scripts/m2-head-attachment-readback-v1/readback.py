"""Prepare now; explicitly requested candidate contact readback is a later step."""
import argparse
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-attachment-readback-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, local, require


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pinned(ref):
    path = local(ROOT, ref['path'])
    require(path.is_file(), 'Missing pinned input: ' + ref['path'])
    raw = path.read_bytes()
    require(sha(raw) == ref['sha256'], 'Pinned input changed: ' + ref['path'])
    return raw


def pointer_value(value, pointer):
    for part in pointer.strip('/').split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def functions(spec):
    namespace = {'np': np}
    identities = []
    for key, name in [('segment', 'segment_hits'), ('head', 'contacts')]:
        ref = spec['inputs'][key]
        node = next(n for n in ast.parse(pinned(ref)).body if isinstance(n, ast.FunctionDef) and n.name == name)
        exec(compile(ast.Module([node], []), ref['path'] + ':function-only', 'exec'), namespace)
        identities.append({'name': name, 'resource': ref, 'ASTSHA256': sha(ast.dump(node).encode())})
    ref = spec['inputs']['common']
    loader = importlib.util.spec_from_file_location('pinned_head_endpoint_readback', ROOT / ref['path'])
    module = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(module)
    require('igl' not in sys.modules, 'Readback unexpectedly imported a solver')
    return namespace['contacts'], module.float32_readback, identities


def load_inputs():
    spec = json.loads((BASE / 'spec.json').read_bytes())
    for ref in spec['inputs'].values():
        pinned(ref)
    contract = json.loads(pinned(spec['inputs']['sourceContract']))
    semantic = json.loads(pinned(spec['inputs']['semanticContract']))
    require(semantic['schema'] == 'semantic-head-attachment-slim-source-v1' and
        semantic['id'] == 'male-head-attachment-slim-v1', 'Wrong semantic experiment contract')
    require(semantic['source'] == contract['sourceBody'], 'Semantic/source contract identity differs')
    source = GLB(pinned(contract['sourceBody']))
    records = json.loads(pinned(spec['inputs']['endpointRecords']))
    offset = 0
    for row in records:
        p = source.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
        require(row['offset'] == offset and row['count'] == len(row['sourceIndices']), 'Endpoint partition is incomplete')
        require(p['attributes']['POSITION'] == row['positionAccessor'] and
            source.doc['materials'][p['material']]['name'] == row['material'], 'Endpoint primitive identity differs')
        ids = np.asarray(row['sourceIndices'], int)
        referenced = np.unique(source.accessor(p['indices']))
        require(len(np.unique(ids)) == len(ids) and np.isin(ids, referenced).all(), 'Endpoint selection has duplicate or foreign source indices')
        require(-1 <= row['endpoint'] < len(p.get('targets', [])), 'Endpoint number is not an original source target')
        offset += row['count']
    baseline = {}
    for frame in contract['contactBaseline']['frames']:
        ref = frame['reference']
        value = pointer_value(json.loads(pinned(ref)), ref['jsonPointer'])
        require(len(value) == frame['sourceStrictPairCount'] and
            sha(encode(value)) == frame['sourceStrictPairsSHA256CanonicalJSON'], 'Exact original strict baseline differs')
        baseline[frame['target']] = set(map(tuple, value))
    face = contract['faceSurface']
    mouth = contract['mouthSurface']
    for primitive in [face, mouth]:
        p = source.doc['meshes'][primitive['mesh']]['primitives'][primitive['primitive']]
        require(p['attributes']['POSITION'] == primitive['positionAccessor'] and p['indices'] == primitive['indexAccessor'], 'Original contact index accessor differs')
        require(sha(np.asarray(source.accessor(p['indices']), dtype='<f8').tobytes()) == primitive['indexArraySHA256Float64LE'], 'Original contact triangle numbering changed')
    require(face['positionAccessor'] == mouth['positionAccessor'], 'Contacts need the original shared face POSITION')
    primitive = source.doc['meshes'][face['mesh']]['primitives'][face['primitive']]
    require(sorted(baseline) == list(range(-1, len(primitive.get('targets', [])))), 'Baseline misses original base/expression frames')
    return spec, contract, semantic, source, records, baseline, offset


def reconstruct_face(decoded, records, source, contract):
    """Use original vertex IDs. Missing required indices never fall back silently."""
    descriptor = contract['faceSurface']
    p = source.doc['meshes'][descriptor['mesh']]['primitives'][descriptor['primitive']]
    accessor = descriptor['positionAccessor']
    P = np.asarray(source.accessor(accessor), dtype=np.float32)
    targets = p.get('targets', [])
    required = np.unique(np.concatenate([source.accessor(contract[k]['indexAccessor']) for k in ['faceSurface', 'mouthSurface']]))
    frames = {}
    for target in range(-1, len(targets)):
        frame = P.copy() if target == -1 else P + np.asarray(source.accessor(targets[target]['POSITION']), dtype=np.float32)
        covered = np.zeros(len(P), bool)
        for row in records:
            if row['positionAccessor'] != accessor or row['endpoint'] != target:
                continue
            ids = np.asarray(row['sourceIndices'], int)
            values = decoded[row['offset']:row['offset'] + row['count']]
            overlap = covered[ids]
            require(np.array_equal(frame[ids[overlap]].astype(float), values[overlap]), 'Duplicate source index has inconsistent decoded coordinates')
            frame[ids] = values
            covered[ids] = True
        require(covered[required].all(), 'Missing candidate Face/Mouth source indices for target ' + str(target))
        frames[target] = frame.astype(float)
    return frames


def check_numeric_report(report, request, spec):
    require(report.get('schema') == spec['candidateReportSchema'] and report.get('status') == spec['candidateSuccessStatus'], 'Candidate is not a passed new-semantic numerical result')
    require(report.get('sourceRequestId') == request['sourceRequestId'] and report.get('id') == request['candidateId'], 'Candidate report/request identity differs')
    require(report.get('methodSpecSha256') == spec['inputs']['semanticContract']['sha256'], 'Candidate did not use the exact semantic method spec')
    require(report.get('sourceEndpointRecords') == spec['inputs']['endpointRecords'], 'Candidate report used a different source occurrence partition')
    require(report.get('failures') == [] and report.get('finite') is True, 'Failed or incomplete numerical candidate cannot run contacts')
    actual = report['actual']
    require(actual['finite'] and np.isfinite(actual['minimumDeterminant']) and actual['minimumDeterminant'] > .12, 'Original tet determinant gate did not pass')
    for key in ['maximumProtectedNodeDisplacementM', 'maximumProtectedEndpointDisplacementM', 'maximumFrameDisplacementM']:
        require(np.isfinite(report[key]) and report[key] <= 2e-6, 'Retained fixed-eye/neck/frame gate did not pass: ' + key)
    bake = report['float32MorphBakeReadback']
    require(bake['finite'] and np.isfinite(bake['maximumErrorM']) and bake['maximumErrorM'] <= 2e-6, 'Float32 bake gate did not pass')
    sections = report['original101HorizontalSectionsFloat32']
    require(sections['passed'] and sections['sectionCount'] == 101 and sections['missingSections'] == 0 and
        np.isfinite(sections['maximumErrorM']) and sections['maximumErrorM'] <= .002, 'Original formal101-section gate did not pass')


def fixed_endpoint_readback(decoded, records, source, semantic):
    rows = []
    for row in records:
        fixed = row['role'] == 'neck-preservation' or semantic['materialRoles'][row['material']] == 'fixed-eye'
        if not fixed:
            continue
        P = np.asarray(source.accessor(row['positionAccessor']), float)
        p = source.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
        if row['endpoint'] >= 0:
            P += np.asarray(source.accessor(p['targets'][row['endpoint']]['POSITION']), float)
        wanted = P[np.asarray(row['sourceIndices'], int)]
        actual = decoded[row['offset']:row['offset'] + row['count']]
        maximum = float(np.linalg.norm(actual - wanted, axis=1).max())
        rows.append({'material': row['material'], 'endpoint': row['endpoint'], 'count': row['count'],
            'role': 'fixed-neck' if row['role'] == 'neck-preservation' else 'fixed-eye',
            'maximumActualFloat32DisplacementM': maximum, 'passed': maximum <= 2e-6})
    return rows


def actual_vrm_readback(ref, source, decoded, records):
    if ref is None:
        return {'status': 'pending-no-actual-VRM-provided', 'passed': None}
    candidate = GLB(pinned(ref))
    for key in ['nodes', 'skins', 'materials', 'textures', 'images', 'extensions']:
        require(candidate.doc.get(key) == source.doc.get(key), 'Actual VRM changed source ' + key)
    require(candidate.binary.startswith(source.binary), 'Actual VRM lost the frozen source binary prefix')
    for old_mesh, new_mesh in zip(source.doc['meshes'], candidate.doc['meshes'], strict=True):
        for a, b in zip(old_mesh['primitives'], new_mesh['primitives'], strict=True):
            require(a['material'] == b['material'] and a.get('mode', 4) == b.get('mode', 4), 'Actual VRM primitive identity changed')
            require(np.array_equal(source.accessor(a['indices']), candidate.accessor(b['indices'])), 'Actual VRM triangle order changed')
            require(set(a['attributes']) == set(b['attributes']), 'Actual VRM source attribute set changed')
            for key in ['POSITION', 'NORMAL']:
                values = np.asarray(candidate.accessor(b['attributes'][key]))
                require(values.shape == np.asarray(source.accessor(a['attributes'][key])).shape and np.isfinite(values).all(), 'Actual VRM has invalid ' + key)
            for key in set(a['attributes']) - {'POSITION', 'NORMAL'}:
                require(np.array_equal(source.accessor(a['attributes'][key]), candidate.accessor(b['attributes'][key])), 'Actual VRM changed ' + key)
            require(len(a.get('targets', [])) == len(b.get('targets', [])), 'Actual VRM original morph target count changed')
    for row in records:
        p = candidate.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
        P = np.asarray(candidate.accessor(p['attributes']['POSITION']), dtype=np.float32)
        if row['endpoint'] >= 0:
            P += np.asarray(candidate.accessor(p['targets'][row['endpoint']]['POSITION']), dtype=np.float32)
        require(np.array_equal(P[row['sourceIndices']].astype(float), decoded[row['offset']:row['offset'] + row['count']]), 'Actual VRM endpoint differs from decoded proposed bake')
    return {'status': 'actual-VRM-source-contract-and-decoded-endpoints-matched', 'passed': True,
        'normalDirectionQuality': 'not-measured', 'runtimeOrVisualAccepted': False}


def execute(request):
    spec, contract, semantic, source, records, baseline, total = load_inputs()
    require(request['schema'] == 'head-attachment-postreadback-request-v1', 'Wrong postreadback request schema')
    require(request['sourceRequestId'] in spec['allowedRequests'], 'Unreviewed original request')
    expected_id = request['sourceRequestId'].removesuffix('-v2') + '-attachment-slim-v1'
    require(request['candidateId'] == expected_id and request['source'] == contract['sourceBody'], 'Candidate/source identity differs')
    require(request['methodSpec'] == spec['inputs']['semanticContract'] and request['endpointRecords'] == spec['inputs']['endpointRecords'], 'Candidate method or source occurrence identity differs')
    report = json.loads(pinned(request['report']))
    check_numeric_report(report, request, spec)
    raw = pinned(request['mappedEndpoints'])
    import io
    with np.load(io.BytesIO(raw), allow_pickle=False) as data:
        mapped, saved = data['mappedEndpointsM'], data['float32BakeRoundTripM']
    require(mapped.shape == saved.shape == (total, 3) and np.isfinite(mapped).all() and np.isfinite(saved).all(), 'Nonfinite or incomplete actual endpoint arrays')
    contacts, bake_function, identities = functions(spec)
    bake, decoded, _ = bake_function(mapped, records, source)
    require(bake['finite'] and bake['maximumErrorM'] <= 2e-6 and np.array_equal(decoded, saved), 'Saved actual Float32 proposed bake does not match frozen bake formula')
    frames = reconstruct_face(decoded, records, source, contract)
    mouth = np.asarray(source.accessor(contract['mouthSurface']['indexAccessor']), int).reshape(-1, 3)
    skin = np.asarray(source.accessor(contract['faceSurface']['indexAccessor']), int).reshape(-1, 3)
    rows = []
    for target, P in frames.items():
        observed = contacts(P, mouth, skin)
        old = baseline[target]
        rows.append({'target': target, 'sourceExistingPairs': sorted(old), 'candidateStrictPairs': sorted(observed),
            'newStrictPairs': sorted(observed - old), 'sourcePairsStillPresent': sorted(observed & old),
            'passed': not (observed - old)})
    fixed = fixed_endpoint_readback(decoded, records, source, semantic)
    actual_vrm = actual_vrm_readback(request.get('candidateVrm'), source, decoded, records)
    passed = all(r['passed'] for r in rows + fixed)
    return {'schema': 'head-attachment-postreadback-result-v1', 'candidateId': request['candidateId'],
        'status': 'contacts-and-fixed-endpoints-passed-semantic-review-pending' if passed else 'failed-not-admissible',
        'inputRequest': request, 'functionIdentities': identities, 'frames': rows, 'fixedEndpointReadback': fixed,
        'proposedFloat32Bake': bake, 'actualVrmReadback': actual_vrm,
        'baselineRecomputed': False, 'newStrictPairsWaived': False, 'rootAttachmentAndEyeCoverage': 'pending-authoritative-source-correspondences-and-game-review',
        'runtimeAccepted': False}


def prepare():
    spec, contract, semantic, source, records, baseline, total = load_inputs()
    _, _, identities = functions(spec)
    # Source-only coverage identity, without calling contacts on source endpoints.
    coverage = np.zeros((len(baseline), contract['facePositionCount']), bool)
    for row in records:
        if row['positionAccessor'] == contract['faceSurface']['positionAccessor']:
            coverage[row['endpoint'] + 1, row['sourceIndices']] = True
    required = np.unique(np.concatenate([source.accessor(contract[k]['indexAccessor']) for k in ['faceSurface', 'mouthSurface']]))
    require(coverage[:, required].all(), 'Original endpoint records omit necessary Face/Mouth indices')
    return {'schema': 'head-attachment-postreadback-preparation-v1', 'status': 'prepared-no-candidate-contact-executed',
        'inputs': spec['inputs'], 'source': contract['sourceBody'], 'functionIdentities': identities,
        'endpointRecords': len(records), 'endpointOccurrences': total, 'strictBaselineFrames': len(baseline),
        'sourceExistingStrictPairCounts': [{'target': k, 'count': len(v)} for k, v in sorted(baseline.items())],
        'allFaceMouthOriginalIndicesCoveredAtEveryEndpoint': True,
        'fixedMaterials': [m for m, role in semantic['materialRoles'].items() if role == 'fixed-eye'],
        'adaptiveMaterials': [m for m, role in semantic['materialRoles'].items() if role == 'adaptive-attachment'],
        'actualBindingsForFuturePlayback': source.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups'],
        'candidateContactsExecuted': False, 'failedCandidatesRead': False, 'runtimeAccepted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-candidate', type=Path)
    parser.add_argument('--out', type=Path, default=BASE / 'prepared.json')
    args = parser.parse_args()
    output = args.out.resolve()
    require(output.is_relative_to(BASE.resolve()), 'Output must stay in this source package')
    require(not output.exists(), 'Preserve existing output; choose unused output')
    try:
        result = execute(json.loads(args.execute_candidate.read_bytes())) if args.execute_candidate else prepare()
    except Exception as error:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(encode({'status': 'failed-no-admission', 'error': str(error), 'runtimeAccepted': False}))
        raise
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(encode(result))
    print(json.dumps({'status': result['status'], 'candidateContactsExecuted': bool(args.execute_candidate), 'runtimeAccepted': False}))
    if result['status'] == 'failed-not-admissible':
        raise SystemExit(2)
