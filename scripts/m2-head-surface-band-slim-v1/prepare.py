"""Prepare one common band and exact targets. No igl import, solve or export."""
import importlib.util
import json
import sys

from adapter import BASE, ROOT, common, load, np, requested_function, reused_functions, save

out = BASE / 'prepared'
if out.exists():
    raise ValueError('Keep original band preparation')
out.mkdir()
report = {'schema': 'surface-band-head-slim-preparation-v1', 'status': 'checking', 'cases': [],
    'solverCalled': False, 'characterExported': False, 'runtimeAccepted': False}
try:
    method, old_spec, domain, embedding, domain_report, guide, response, records, source = load()
    original_checks = common.input_checks(domain, embedding, guide, records, source, method['toleranceM'])
    audit = json.loads((ROOT / method['bandAudit']).read_bytes())
    band = audit['sourceRequestTriangleBand']
    P, F = np.asarray(response['sourcePointsM']), np.asarray(response['sourceFaceTriangles'], int)
    origin = np.asarray(response['rawHeadRestOriginM'])
    triangles, ids = np.asarray(band['sourceTriangleIndices'], int), np.asarray(band['sourceVertexIndices'], int)
    levels = np.asarray(band['sourceLevelsM'])
    y = (P - origin)[F, 1]
    crossing = (y.min(1)[:, None] <= levels) & (y.max(1)[:, None] >= levels)
    if not np.array_equal(np.flatnonzero(crossing.any(1)), triangles) or not np.array_equal(np.unique(F[triangles]), ids):
        raise ValueError('Band differs from original all-101 triangle interval rule')
    if not crossing.any(0).all() or len(ids) != 363 or len(triangles) != 600:
        raise ValueError('Expected original 600-triangle/363-source-vertex support')
    nodes = domain['nodesM']
    lookup = {tuple(point): i for i, point in enumerate(nodes)}
    mapped = np.asarray([lookup[tuple(point)] for point in P[ids]], np.int64)
    unique = np.unique(mapped)
    if not np.array_equal(unique, band['nativeNodes']) or len(unique) != 343:
        raise ValueError('Exact original source-to-native node map differs')
    if np.setdiff1d(domain['guideSourceIndices'], ids).size or np.setdiff1d(domain['guideNodes'], unique).size:
        raise ValueError('Band misses an original23 source vertex/node')
    if np.intersect1d(unique, np.r_[domain['protectedNodes'], domain['frameNodes']]).size:
        raise ValueError('Band intersects retained fixed-eye/neck/frame')
    loader = importlib.util.spec_from_file_location('fixed_formula_dependencies', ROOT / old_spec['sourceReader'])
    reader = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(reader)
    requested, formula_ast = requested_function(source, response, reader)
    domain = {**domain, 'guideNodes': unique}
    source_map = [{'sourceVertex': int(i), 'nativeNode': int(n), 'sourcePositionM': P[i].tolist()} for i, n in zip(ids, mapped)]
    save(out / 'source-band.json', {'schema': 'surface-band-native-source-map-v1', 'rule': band['rule'],
        'sourceTriangles': triangles.tolist(), 'sourceVertices': ids.tolist(), 'sourceLevelsM': levels.tolist(),
        'nativeNodes': unique.tolist(), 'sourceVertexToNode': source_map,
        'exactMergeOnly': True, 'classificationReference': method['classification'], 'original23Covered': True})
    for identifier in method['requests']:
        original = next(row for row in guide['cases'] if row['id'] == identifier)
        values = requested(P[ids], original['parameters'])
        targets = []
        for node in unique:
            duplicates = values[mapped == node]
            if not np.array_equal(duplicates, np.repeat(duplicates[:1], len(duplicates), axis=0)):
                raise ValueError('Same source coordinate requests different targets; never average')
            targets.append(duplicates[0])
        targets = np.asarray(targets)
        old_targets = np.asarray(original['requestedVertexPointsM'])
        original_nodes = np.asarray([lookup[tuple(point)] for point in guide['sourcePointsM']], int)
        actual23 = np.asarray([targets[np.flatnonzero(unique == node)[0]] for node in original_nodes])
        if not np.array_equal(actual23, old_targets):
            raise ValueError('Original23 requested targets differ')
        b, bc, _, duplicates = common.constraints(domain, targets)
        exact = nodes.copy()
        exact[b] = bc
        controlled = np.flatnonzero(np.isin(domain['tetrahedra'], b).all(1))
        metrics, J, determinant = common.tetra_metrics(nodes, exact, domain['tetrahedra'][controlled], b, bc, method['softP'])
        diagnostic_face = P.copy()
        for i in np.unique(F):
            diagnostic_face[i] = exact[lookup[tuple(P[i])]]
        sections = common.horizontal_sections({response['sourceFacePositionAccessor']: diagnostic_face.astype(np.float32).astype(float)},
            response, original, origin, 'Uncontrolled nodes held at source only for target arithmetic; no SLIM or actual GLB')
        np.savez_compressed(out / (identifier + '-targets.npz'), guideNodes=unique, guideTargetsM=targets,
            constraintIndices=b, constraintTargetsM=bc, sourceVertexIndices=ids, sourceVertexNodes=mapped,
            controlledTetIndices=controlled, exactTargetJacobians=J, exactTargetDeterminants=determinant)
        request = {**original, 'requestedVertexPointsM': targets.tolist(),
            'original23RequestedVertexPointsM': original['requestedVertexPointsM'],
            'guideInputMeaning': 'All343 exact native nodes of fixed original source101 triangle band',
            'sourceRequestId': original['id']}
        save(out / (identifier + '-request.json'), request)
        report['cases'].append({'id': identifier, 'guideNodes': len(unique), 'uniqueControls': len(b),
            'freeNodes': len(nodes) - len(b), 'original23TargetsByteEqual': True,
            'duplicateSourceCoordinates': len(ids) - len(unique), 'duplicateTargetConflicts': 0,
            'duplicateControlTargets': duplicates, 'fullyControlledTets': len(controlled),
            'minimumExactTargetDeterminant': metrics['minimumDeterminant'],
            'exactTargetTetsAtOrBelowPoint12': int((determinant <= .12).sum()),
            'exactTargetRiskMeaning': 'Soft guide diagnostic only; not an actual solve failure or formal infeasibility certificate',
            'targetOnly101Sections': sections, 'targetOnly101IsNotAnAdmissionGate': True})
    fn, _ = reused_functions()
    _, difference = fn()
    (out / 'evaluate-adapter.diff').write_bytes(difference.encode())
    (out / 'original-target-formula.ast').write_bytes(formula_ast.encode())
    sample = {'passed': np.bool_(True), 'failed': np.bool_(False), 'count': np.int64(101)}
    save(out / 'serialization-regression.json', sample)
    if json.loads((out / 'serialization-regression.json').read_bytes()) != {'passed': True, 'failed': False, 'count': 101}:
        raise ValueError('NumPy scalar serializer regression failed')
    conflict = {'nodesM': np.zeros((1, 3)), 'guideNodes': np.asarray([0]),
        'protectedNodes': np.asarray([0]), 'frameNodes': np.asarray([], int)}
    try:
        common.constraints(conflict, np.ones((1, 3)))
    except ValueError as error:
        report['conflictingNodeTargetRejectionRegression'] = str(error)
    else:
        raise ValueError('Conflicting exact-node targets were not rejected')
    if 'igl' in sys.modules:
        raise ValueError('Preparation must not import solver')
    report.update(status='prepared-with-soft-target-risk-not-solved', source=method['source'],
        methodSpecSha256=common.digest(BASE / 'spec.json'), consumedInputs=method['inputs'],
        originalSourceAndEmbeddingChecks=original_checks,
        originalNodesAndTetsChanged=False, embeddingOrderChanged=False)
except Exception as error:
    report.update(status='preparation-failed-no-solve', error=f'{type(error).__name__}: {error}')
    raise
finally:
    save(out / 'report.json', report)
print(json.dumps({'status': report['status'], 'cases': [{k: row[k] for k in ['id', 'guideNodes', 'uniqueControls',
    'fullyControlledTets', 'minimumExactTargetDeterminant', 'exactTargetTetsAtOrBelowPoint12']} for row in report['cases']]}))
