"""One native-domain identity gate, then two fixed official 20-iteration requests."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import sys
import time

from common import (BASE, ROOT, constraints, digest, float32_readback, horizontal_sections,
    input_checks, interpolate, load_inputs, np, receipt, save, tetra_metrics)


def evaluate(kind, request, spec, domain, embedding, origin, guide, response, records, source, out):
    import igl
    started = time.monotonic()
    nodes, tets = domain['nodesM'], domain['tetrahedra']
    targets = nodes[domain['guideNodes']] if kind == 'identity' else np.asarray(request['requestedVertexPointsM'])
    b, bc, roles, duplicates = constraints(domain, targets)
    folder = out / ('identity' if kind == 'identity' else request['id'])
    folder.mkdir()
    iterations = 1 if kind == 'identity' else 20
    report = {'schema': 'native-head-slim-result-v1', 'kind': kind, 'request': request,
        'status': 'precompute-running', 'iterations': iterations, 'softP': 1e5,
        'uniqueSoftControls': len(b), 'freeNodes': len(nodes) - len(b), 'duplicateTargets': duplicates,
        'controlRoles': roles, 'characterExported': False, 'runtimeAccepted': False,
        'knownPending': ['Original-triangle strict contacts and expression relation gates',
            'Normals, actual VRM export, skin/IBM/UV/image identity, clothing and game/visual acceptance']}
    save(folder / 'report.json', report)
    try:
        initial, _, _ = tetra_metrics(nodes, nodes, tets, b, bc, spec['softP'])
        report['initial'] = initial
        data = igl.slim_precompute(nodes, tets, nodes.copy(), igl.MappingEnergyType.SYMMETRIC_DIRICHLET, b, bc, 1e5)
        report['status'] = 'fixed-solve-running'
        save(folder / 'report.json', report)
        # Exactly one official call per case. No convergence loop or parameter changes.
        positions = np.asarray(igl.slim_solve(data, iterations)).copy()
        np.savez_compressed(folder / 'solved-nodes.npz', positionsM=positions, constraintIndices=b, constraintTargetsM=bc)
        if positions.shape != nodes.shape or not np.isfinite(positions).all():
            report['fatalNumericFailure'] = True
            raise ValueError('Official solver returned wrong dimensions or nonfinite coordinates')
        actual, J, determinants = tetra_metrics(nodes, positions, tets, b, bc, spec['softP'])
        report['actual'] = actual
        np.savez_compressed(folder / 'tetra-readback.npz', tetraJacobians=J, tetraDeterminants=determinants)
        if not actual['finite']:
            report['fatalNumericFailure'] = True
            raise ValueError('Nonfinite tet J/determinant preserved before SVD or endpoint evaluation')
        mapped = interpolate(positions, embedding)
        finite = bool(np.isfinite(mapped).all())
        if not finite:
            np.savez_compressed(folder / 'nonfinite-mapped-endpoints.npz', mappedEndpointsM=mapped)
            report['fatalNumericFailure'] = True
            raise ValueError('Mapped original source endpoint is nonfinite')
        baking, decoded, base = float32_readback(mapped, records, source)
        protected_error = float(np.linalg.norm(positions[domain['protectedNodes']] - nodes[domain['protectedNodes']], axis=1).max())
        frame_error = float(np.linalg.norm(positions[domain['frameNodes']] - nodes[domain['frameNodes']], axis=1).max())
        errors = np.linalg.norm(mapped - domain['sourceEndpointsM'], axis=1)
        endpoint_reports = [{'mesh': row['mesh'], 'primitive': row['primitive'], 'endpoint': row['endpoint'],
            'role': row['role'], 'sourceCount': row['count'],
            'maximumDisplacementM': float(errors[row['offset']:row['offset'] + row['count']].max())} for row in records]
        protected_endpoint_error = max(row['maximumDisplacementM'] for row in endpoint_reports
            if row['role'] in ['feature-preservation', 'neck-preservation'])
        report.update(actual=actual, finite=finite, maximumProtectedNodeDisplacementM=protected_error,
            maximumAllNodeDisplacementM=float(np.linalg.norm(positions - nodes, axis=1).max()),
            maximumFrameDisplacementM=frame_error, maximumProtectedEndpointDisplacementM=protected_endpoint_error,
            endpointReadbacks=endpoint_reports, float32MorphBakeReadback=baking)
        np.savez_compressed(folder / 'mapped-endpoints.npz', mappedEndpointsM=mapped,
            float32BakeRoundTripM=decoded, tetraJacobians=J, tetraDeterminants=determinants)
        failures = []
        if not actual['finite'] or actual['minimumDeterminant'] <= spec['minimumDeterminant']:
            failures.append('Actual tet J determinant is nonfinite or <= original 0.12 gate')
        if max(protected_error, frame_error, protected_endpoint_error) > spec['toleranceM']:
            failures.append('Protected/frame actual displacement >2um')
        if not baking['finite'] or baking['maximumErrorM'] > spec['toleranceM']:
            failures.append('All selected source/morph Float32 bake precision >2um or nonfinite')
        if kind == 'identity':
            report['maximumAllEndpointIdentityErrorM'] = float(errors.max())
            report['maximumAllNodeIdentityErrorM'] = report['maximumAllNodeDisplacementM']
            if report['maximumAllNodeIdentityErrorM'] > spec['toleranceM']:
                failures.append('Native solver identity changes an original node, including free nodes, >2um')
            if errors.max() > spec['toleranceM']:
                failures.append('Native solver identity changes an original selected endpoint >2um')
        else:
            section = horizontal_sections({accessor: P.astype(np.float32).astype(float) for accessor, P in base.items()},
                response, request, origin, 'Float32 base readback, no actual GLB export')
            report['original101HorizontalSectionsFloat32'] = section
            report['auxiliary101HorizontalSectionsFloat64'] = horizontal_sections(base, response, request, origin,
                'Float64 proposed volume mapping, no actual GLB export')
            if not section['passed']:
                failures.append('Original 101 actual horizontal halfwidth target misses 2mm or has empty sections')
        report.update(failures=failures, status=('identity-passed' if kind == 'identity' else 'numerical-head-candidate-only') if not failures else 'failed-not-admissible')
    except Exception as error:
        report.update(status='failed-not-admissible', error=f'{type(error).__name__}: {error}')
    finally:
        report['seconds'] = time.monotonic() - started
        save(folder / 'report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    report = {'schema': 'native-head-slim-execution-v1', 'status': 'checking-exact-preparation',
        'cases': [], 'characterExported': False, 'runtimeAccepted': False}
    try:
        if not out.is_relative_to(BASE.resolve()) or not out.exists():
            raise ValueError('Expected runner-created source-package output')
        if Path(sys.prefix).resolve() != (ROOT / 'experiments/tools/slim-core-2.6.3/.venv').resolve():
            raise ValueError('Dedicated official binary environment required')
        spec, domain, embedding, domain_report, guide, response, records, source = load_inputs()
        prepared = json.loads((BASE / 'prepared.json').read_bytes())
        if prepared['status'] != 'prepared-not-solved' or prepared['receipt'] != receipt(spec):
            raise ValueError('Pinned preparation is stale')
        for name, version in spec['versions'].items():
            if importlib.metadata.version(name) != version:
                raise ValueError('Numeric binary version changed: ' + name)
        input_checks(domain, embedding, guide, records, source, spec['toleranceM'])
        report.update(receipt=receipt(spec), versions=spec['versions'],
            energyReadbackSource=spec['energyReadbackSource'], source=spec['source'])
        save(out / 'report.json', report)
        identity = evaluate('identity', None, spec, domain, embedding, np.asarray(domain_report['rawHeadOriginM']),
            guide, response, records, source, out)
        report['identityStatus'] = identity['status']
        if identity['status'] != 'identity-passed':
            raise ValueError('Identity gate failed. Neither shape request may run.')
        for identifier in spec['requests']:
            request = next(row for row in guide['cases'] if row['id'] == identifier)
            actual = evaluate('request', request, spec, domain, embedding, np.asarray(domain_report['rawHeadOriginM']),
                guide, response, records, source, out)
            report['cases'].append({'id': identifier, 'status': actual['status']})
            save(out / 'report.json', report)
            if actual.get('fatalNumericFailure'):
                raise ValueError('Nonfinite numerical output preserved; stop before any further request')
        report['status'] = 'fixed-requests-finished-not-production-admission'
    except Exception as error:
        report.update(status='stopped-no-retry', error=f'{type(error).__name__}: {error}')
    finally:
        save(out / 'report.json', report)
    print(json.dumps(report))
    raise SystemExit(0 if report['status'] == 'fixed-requests-finished-not-production-admission' else 2)
