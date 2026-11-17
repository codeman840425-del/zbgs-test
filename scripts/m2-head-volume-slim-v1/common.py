"""Pinned native-domain input/readback; no SLIM import or solve here."""
import ast
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-volume-slim-v1'
SPEC = BASE / 'spec.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_json(value):
    if isinstance(value, float) and not math.isfinite(value):
        return {'nonFinite': str(value)}
    if isinstance(value, dict):
        return {key: safe_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [safe_json(item) for item in value]
    return value


def save(path, value):
    path.write_bytes((json.dumps(safe_json(value), indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode())


def receipt(spec):
    return {'specSha256': digest(SPEC), 'inputs': spec['inputs'],
        'scripts': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)}
            for p in sorted(Path(__file__).parent.glob('*.py'))]}


def load_inputs():
    spec = json.loads(SPEC.read_bytes())
    for row in spec['inputs']:
        if digest(ROOT / row['path']) != row['sha256']:
            raise ValueError('Pinned input changed: ' + row['path'])
    domain = dict(np.load(ROOT / spec['domain'], allow_pickle=False))
    embedding = dict(np.load(ROOT / spec['embedding'], allow_pickle=False))
    domain_report = json.loads((ROOT / spec['domainReport']).read_bytes())
    if domain_report['status'] != 'volume-embedding-preflight-passed-not-a-shape':
        raise ValueError('Exact domain preflight did not pass')
    native = json.loads((ROOT / spec['nativeGuide']).read_bytes())
    guide = next(row for row in native['sexes'] if row['sex'] == 'male')
    response = json.loads((ROOT / spec['response']).read_bytes())
    records = json.loads((ROOT / spec['endpointRecords']).read_bytes())
    loader = importlib.util.spec_from_file_location('native_source_reader', ROOT / spec['sourceReader'])
    reader = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(reader)
    source = reader.GLB((ROOT / spec['source']['path']).read_bytes())
    return spec, domain, embedding, domain_report, guide, response, records, source


def interpolate(positions, embedding):
    # Qhull order belongs to these barycentrics. Positive tet order is unrelated.
    return np.einsum('ni,nij->nj', embedding['barycentric'], positions[embedding['simplexVertexIndices']])


def constraints(domain, guide_targets):
    nodes = domain['nodesM']
    ids, targets, provenance, duplicates = [], [], [], []
    seen = {}
    for role, selected, points in [('guide', domain['guideNodes'], guide_targets),
            ('protected', domain['protectedNodes'], nodes[domain['protectedNodes']]),
            ('frame', domain['frameNodes'], nodes[domain['frameNodes']])]:
        for index, point in zip(selected, points, strict=True):
            index = int(index)
            if index in seen:
                previous = seen[index]
                if not np.array_equal(targets[previous], point):
                    raise ValueError(f'Exact duplicate target conflict node={index} roles={provenance[previous]},{role}')
                provenance[previous].append(role)
                duplicates.append({'node': index, 'role': role, 'targetIdentical': True})
            else:
                seen[index] = len(ids)
                ids.append(index)
                targets.append(np.asarray(point, float))
                provenance.append([role])
    return np.asarray(ids, np.int32), np.asarray(targets, float), provenance, duplicates


def input_checks(domain, embedding, guide, records, source, tolerance):
    nodes, tets, endpoints = domain['nodesM'], domain['tetrahedra'], domain['sourceEndpointsM']
    if nodes.shape != (5742, 3) or tets.shape != (37114, 4) or endpoints.shape != (113713, 3):
        raise ValueError('Reviewed male domain dimensions changed')
    if not np.array_equal(domain['guideSourceIndices'], guide['guideVertexIndices']):
        raise ValueError('Native source guide indices differ')
    if not np.array_equal(nodes[domain['guideNodes']], guide['sourcePointsM']):
        raise ValueError('Native guide source coordinates differ')
    offset = 0
    for record in records:
        if record['offset'] != offset:
            raise ValueError('Endpoint record offsets are not a complete partition')
        primitive = source.doc['meshes'][record['mesh']]['primitives'][record['primitive']]
        P = np.asarray(source.accessor(record['positionAccessor']), float)
        if record['endpoint'] >= 0:
            P += np.asarray(source.accessor(primitive['targets'][record['endpoint']]['POSITION']), float)
        selected = P[np.asarray(record['sourceIndices'], int)]
        if len(selected) != record['count'] or not np.array_equal(selected, endpoints[offset:offset + len(selected)]):
            raise ValueError('Endpoint source/index identity differs')
        offset += len(selected)
    if offset != len(endpoints):
        raise ValueError('Endpoint records do not cover all occurrences')
    reference_edges = np.transpose(nodes[tets[:, 1:]] - nodes[tets[:, :1]], (0, 2, 1))
    reference_det = np.linalg.det(reference_edges)
    if not np.isfinite(reference_det).all() or (reference_det <= 0).any():
        raise ValueError('Positive original tet orientation required')
    restored = interpolate(nodes, embedding)
    error = np.linalg.norm(restored - endpoints, axis=1)
    if not np.isfinite(restored).all() or error.max() > tolerance:
        raise ValueError('Original Qhull-order embedding identity failed')
    cases = {}
    for identifier in ['male-long-lean-v2', 'male-round-stocky-v2']:
        request = next(row for row in guide['cases'] if row['id'] == identifier)
        b, _, roles, duplicates = constraints(domain, np.asarray(request['requestedVertexPointsM']))
        cases[identifier] = {'uniqueSoftControls': len(b), 'freeVertices': len(nodes) - len(b),
            'duplicateTargets': duplicates, 'roles': {role: sum(role in row for row in roles) for role in ['guide', 'protected', 'frame']}}
    return {'status': 'inputs-prepared-no-solver-called', 'sourceEndpointOccurrences': len(endpoints),
        'sourceRecordsChecked': len(records), 'embeddingIdentityMaximumErrorM': float(error.max()),
        'positiveTetMinimumVolumeM3': float(reference_det.min() / 6), 'cases': cases,
        'embeddingOrder': 'Only embedding.simplexVertexIndices + barycentric; never domain.tetrahedra order',
        'sourceOccurrenceToNodeUsed': False, 'solverCalled': False}


def tetra_metrics(nodes, positions, tets, b, bc, soft_p):
    reference = np.transpose(nodes[tets[:, 1:]] - nodes[tets[:, :1]], (0, 2, 1))
    actual = np.transpose(positions[tets[:, 1:]] - positions[tets[:, :1]], (0, 2, 1))
    J = np.linalg.solve(reference.transpose(0, 2, 1), actual.transpose(0, 2, 1)).transpose(0, 2, 1)
    determinants = np.linalg.det(J)
    volume = np.linalg.det(reference) / 6
    ratio = np.linalg.det(actual) / (volume * 6)
    if not np.isfinite(J).all() or not np.isfinite(determinants).all():
        return {'finite': False, 'energy': None, 'reason': 'Nonfinite actual J/determinant; SVD not attempted'}, J, determinants
    singular = np.linalg.svd(J, compute_uv=False)
    with np.errstate(divide='ignore', invalid='ignore', over='ignore'):
        density = (singular ** 2 + singular ** -2).sum(axis=1)
        elastic = float(np.dot(volume, density))
        soft = float(soft_p * np.square(positions[b] - bc).sum())
    report = {'finite': bool(np.isfinite(J).all() and np.isfinite(determinants).all()),
        'minimumDeterminant': float(determinants.min()), 'maximumDeterminant': float(determinants.max()),
        'minimumVolumeRatio': float(ratio.min()), 'maximumDetVersusVolumeRatioError': float(abs(determinants - ratio).max()),
        'failedTetIndices': np.flatnonzero(~np.isfinite(determinants) | (determinants <= .12)).tolist(),
        'energy': {'source': 'Independent readback of pinned core formula; SLIMData.energy is not exposed by wheel',
            'symmetricDirichletIntegral': elastic, 'softPenalty': soft,
            'normalizationVolumeM3': float(volume.sum()), 'normalizedTotal': (elastic + soft) / float(volume.sum())},
        'maximumSoftControlResidualM': float(np.linalg.norm(positions[b] - bc, axis=1).max())}
    return report, J, determinants


def float32_readback(mapped, records, source):
    base = {}
    for row in records:
        accessor = row['positionAccessor']
        base.setdefault(accessor, np.asarray(source.accessor(accessor), float))
        if row['endpoint'] == -1:
            base[accessor][row['sourceIndices']] = mapped[row['offset']:row['offset'] + row['count']]
    errors, traces = [], []
    restored = np.empty_like(mapped)
    for row in records:
        start, count = row['offset'], row['count']
        target = mapped[start:start + count]
        B = base[row['positionAccessor']][row['sourceIndices']]
        decoded = B.astype(np.float32)
        if row['endpoint'] >= 0:
            decoded = decoded + (target - B).astype(np.float32)
        restored[start:start + count] = decoded.astype(float)
        error = float(np.linalg.norm(decoded.astype(float) - target, axis=1).max())
        errors.append(error)
        traces.append({'mesh': row['mesh'], 'primitive': row['primitive'], 'endpoint': row['endpoint'],
            'role': row['role'], 'count': count, 'maximumErrorM': error})
    return {'maximumErrorM': max(errors), 'finite': bool(np.isfinite(restored).all()), 'records': traces,
        'meaning': 'Float32 base + Float32(mapped endpoint - mapped base), as GLB morph bake; no actual GLB exported'}, restored, base


def horizontal_sections(base, response, request, origin, precision):
    path = ROOT / 'scripts/m2-representative-head-cage-v1/batch.py'
    tree = ast.parse(path.read_bytes())
    function = next(row for row in tree.body if isinstance(row, ast.FunctionDef) and row.name == 'surface_widths')
    namespace = {'np': np}
    exec(compile(ast.Module([function], []), str(path) + ':surface-width-readback', 'exec'), namespace)
    target = np.asarray(next(row for row in response['requests'] if row['id'] == request['id'])['requestedLandmarksM']) - origin
    levels = target[::2, 1]
    desired = (target[1::2, 0] - target[::2, 0]) / 2
    actual = namespace['surface_widths'](base[response['sourceFacePositionAccessor']] - origin,
        np.asarray(response['sourceFaceTriangles'], int), levels)
    errors = [abs(value - goal) for value, goal in zip(actual, desired) if value is not None]
    return {'requestedYMetres': levels.tolist(), 'requestedHalfWidthsM': desired.tolist(),
        'actualHalfWidthsM': actual, 'maximumErrorM': max(errors, default=None),
        'missingSections': sum(value is None for value in actual), 'sectionCount': len(levels),
        'passed': len(levels) == 101 and len(errors) == 101 and max(errors) <= .002,
        'precision': precision, 'actualGlbExported': False,
        'method': 'Exact AST reuse of original surface_widths, at original requestedY, no attached-point substitute'}
