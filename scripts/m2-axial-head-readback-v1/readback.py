"""New axial-G postreadback. Default preparation never reads a candidate."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-head-readback-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, local, require


def load():
    spec = json.loads((BASE / 'spec.json').read_bytes())
    ref = spec['inputs']['oldPureHelpers']
    require(hashlib.sha256(local(ROOT, ref['path']).read_bytes()).hexdigest() == ref['sha256'], 'Pure helper source changed before import')
    loader = importlib.util.spec_from_file_location('source_only_postreadback_helpers', ROOT / ref['path'])
    helpers = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(helpers)
    for ref in list(spec['inputs'].values()) + list(spec['coefficients'].values()):
        helpers.pinned(ref)
    contract = json.loads(helpers.pinned(spec['inputs']['sourceContract']))
    inventory = json.loads(helpers.pinned(spec['inputs']['inventory']))
    source = GLB(helpers.pinned(contract['sourceBody']))
    require(inventory['schema'] == 'original-vrm-position-use-inventory-v1' and
        inventory['source']['sha256'] == contract['sourceBody']['sha256'], 'Wrong original POSITION inventory')
    audit = json.loads(helpers.pinned(spec['inputs']['coefficientAudit']))
    require(audit['status'] == 'independent-coefficient-audit-complete-not-geometry-admission' and
        audit['originalInputsUnchanged'], 'Independent coefficient preflight is incomplete')
    if 'evaluationAudit' in spec['inputs']:
        reviewed = json.loads(helpers.pinned(spec['inputs']['evaluationAudit']))
        require(reviewed['status'] == 'complete-numerical-readback-only-not-production-admission' and
            reviewed['realSourceEndpointOccurrences'] == 120935, 'Complete numerical audit is missing')
    if spec['evaluationSpec'] is not None:
        evaluation = json.loads(helpers.pinned(spec['evaluationSpec']))
        require(evaluation['schema'] == 'axial-head-evaluation-spec-v1' and evaluation['id'] == spec['evaluationMethodId'] and
            evaluation['source'] == contract['sourceBody'], 'Wrong new evaluation source spec')
        for key, ref in [('functionSpec', spec['inputs']['functionSpec']), ('coefficientAudit', spec['inputs']['coefficientAudit']),
                ('sourceInventory', spec['inputs']['inventory'])]:
            require(evaluation[key] == ref, 'New evaluation dependency differs: ' + key)
        for request_id, ref in spec['coefficients'].items():
            require(next(c for c in evaluation['cases'] if c['sourceRequestId'] == request_id)['coefficients'] == ref,
                'New evaluation coefficients differ')
    baseline = {}
    for frame in contract['contactBaseline']['frames']:
        ref = frame['reference']
        pairs = helpers.pointer_value(json.loads(helpers.pinned(ref)), ref['jsonPointer'])
        require(len(pairs) == frame['sourceStrictPairCount'] and helpers.sha(helpers.encode(pairs)) ==
            frame['sourceStrictPairsSHA256CanonicalJSON'], 'Frozen source strict baseline differs')
        baseline[frame['target']] = set(map(tuple, pairs))
    return spec, helpers, contract, inventory, source, baseline


def source_records(source, inventory):
    rows, offset = [], 0
    actual = {}
    for mi, mesh in enumerate(source.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            actual.setdefault(p['attributes']['POSITION'], []).append((mi, pi, p))
    require(set(actual) == {g['position']['accessor'] for g in inventory['positionGroups']}, 'Missing or foreign original POSITION group')
    for group in inventory['positionGroups']:
        accessor = group['position']['accessor']
        primitives = actual[accessor]
        ids = np.unique(np.concatenate([source.accessor(p['indices']) for _, _, p in primitives])).astype(int).tolist()
        require(ids == group['actualReferencedSourceIndices'] and len(source.accessor(accessor)) == group['position']['count'], 'Inventory does not cover real complete source union')
        targets = primitives[0][2].get('targets', [])
        require(all(p.get('targets', []) == targets for _, _, p in primitives) and
            group['sharedTargetsListsConsistent'] and group['sharedOriginalTargetReferences'] == targets,
            'Shared POSITION has inconsistent original targets')
        references = [{'mesh': mi, 'primitive': pi, 'material': source.doc['materials'][p['material']]['name'],
            'indexAccessor': p['indices']} for mi, pi, p in primitives]
        require({(r['mesh'], r['primitive']) for r in references} ==
            {(r['mesh'], r['primitive']) for r in group['primitives']}, 'Inventory omitted a source primitive')
        for endpoint in range(-1, len(targets)):
            rows.append({'positionAccessor': accessor, 'endpoint': endpoint,
                'targetPositionAccessor': None if endpoint == -1 else targets[endpoint]['POSITION'],
                'references': references, 'sourceIndices': ids, 'offset': offset, 'count': len(ids)})
            offset += len(ids)
    return {'schema': 'axial-source-endpoint-records-v1', 'source': inventory['source'],
        'records': rows, 'sourceEndpointOccurrences': offset, 'geometryEvaluated': False}


def validate_records(document, expected):
    require(document['schema'] == expected['schema'], 'Old or unknown endpoint record schema')
    require(all(document.get('source', {}).get(k) == expected['source'][k] for k in ['path', 'sha256']), 'Wrong original source record identity')
    rows = document['records']
    wanted = {(r['positionAccessor'], r['endpoint']): r for r in expected['records']}
    require(len(rows) == len(wanted), 'Missing or fabricated original endpoint record')
    seen, offset = set(), 0
    for row in rows:
        key = (row['positionAccessor'], row['endpoint'])
        require(key in wanted and key not in seen, 'Foreign or duplicate source endpoint')
        seen.add(key)
        original = wanted[key]
        require(row['targetPositionAccessor'] == original['targetPositionAccessor'], 'Wrong original morph POSITION accessor')
        require(row['offset'] == offset and row['count'] == len(row['sourceIndices']) == original['count'], 'Incomplete endpoint partition')
        require(len(set(row['sourceIndices'])) == row['count'] and sorted(row['sourceIndices']) == original['sourceIndices'], 'Missing or foreign source union indices')
        signature = lambda refs: sorted((r['mesh'], r['primitive'], r['material'], r['indexAccessor']) for r in refs)
        require(signature(row['references']) == signature(original['references']), 'Primitive/material references omitted or confused')
        offset += row['count']
    require(offset == expected['sourceEndpointOccurrences'], 'Wrong complete source occurrence count')
    return rows


def adapted_records(rows):
    # Only trace labels are supplied to the frozen Float32 helper. No old
    # SLIM/domain classification or old mapped partition is consumed.
    return [{**r, 'mesh': r['references'][0]['mesh'], 'primitive': r['references'][0]['primitive'],
        'role': 'complete-original-POSITION-union'} for r in rows]


def expected_masks(spec, helpers, source, contract):
    eye = []
    for mi, mesh in enumerate(source.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            name = source.doc['materials'][p['material']]['name']
            if any(t in name for t in ['EyeIris', 'EyeHighlight', 'EyeWhite']):
                eye.append({'mesh': mi, 'primitive': pi, 'material': name, 'positionAccessor': p['attributes']['POSITION'],
                    'sourceIndices': np.unique(source.accessor(p['indices'])).astype(int).tolist()})
    labels = json.loads(helpers.pinned(spec['inputs']['neckSourceLabels']))
    neck = [{'positionAccessor': r['positionAccessor'], 'endpoint': r['endpoint'], 'sourceIndices': r['sourceIndices']}
        for r in labels if r['role'] == 'neck-preservation']
    require(sum(len(r['sourceIndices']) for r in neck) == 68, 'Original neck source mask differs')
    with np.load(io.BytesIO(helpers.pinned(spec['inputs']['frameSource'])), allow_pickle=False) as domain:
        frame = domain['nodesM'][domain['frameNodes']]
    require(frame.shape == (8, 3), 'Original8 frame source guards differ')
    return {'schema': 'axial-fixed-source-masks-v1', 'source': contract['sourceBody'],
        'fixedEye': eye, 'neck': neck, 'frameSourcePointsM': frame.tolist()}


def validate_masks(document, expected, spec):
    for key in ['schema', 'source', 'fixedEye', 'frameSourcePointsM']:
        require(document[key] == expected[key], 'Wrong fixed source mask field: ' + key)
    neck = [{k: r[k] for k in ['positionAccessor', 'endpoint', 'sourceIndices']} for r in document['neck']]
    require(neck == expected['neck'], 'Wrong complete original neck source mask')
    require(document['neckMaskSource'] == spec['inputs']['neckSourceLabels'] and
        document['frameSource'] == spec['inputs']['frameSource'] and document['oldMappedEndpointPartitionUsed'] is False,
        'Wrong neck/frame provenance or old mapped partition reuse')


def numeric_gate(report, request, spec):
    require(spec['evaluationSpec'] is not None, 'New evaluation spec has not been explicitly pinned')
    require(report['schema'] == spec['candidateReportSchema'] and report['status'] == spec['successStatus'] and
        report['methodId'] == spec['evaluationMethodId'], 'Not a passed new axial-G candidate')
    require(report['id'] == request['candidateId'] and report['sourceRequestId'] == request['sourceRequestId'] and
        request['sourceRequestId'] in spec['allowedRequests'], 'Candidate/original request identity differs')
    require(report['id'] == request['sourceRequestId'].removesuffix('-v2') + '-axial-head-v1', 'Wrong new axial candidate ID')
    require(report['source'] == request['source'], 'Candidate report source differs')
    for name, expected in [('sourceSpec', spec['evaluationSpec']), ('functionSpec', spec['inputs']['functionSpec']),
            ('coefficientAudit', spec['inputs']['coefficientAudit']), ('sourceInventory', spec['inputs']['inventory']),
            ('coefficients', spec['coefficients'][request['sourceRequestId']])]:
        require(request[name] == report[name] == expected, 'Wrong axial identity: ' + name)
    require(report['methodSpecSha256'] == spec['evaluationSpec']['sha256'], 'Wrong new evaluation method SHA')
    require(report['sourceRecords'] == request['sourceRecords'] and report['fixedSourceMasks'] == request['fixedSourceMasks'], 'Producer partition/mask identity differs')
    require(request['sourceRecords'] == spec['inputs']['producerRecords'] and
        request['fixedSourceMasks'] == spec['inputs']['producerMasks'], 'Unpinned new producer partition/masks')
    require(report['rawArrays'] == request['mappedEndpoints'], 'Passed numeric report and raw arrays are not the same resource')
    require(report['failures'] == [] and report['finite'], 'Failed/incomplete candidate must not execute55 strict')
    require(isinstance(report.get('actualGJacobian'), dict), 'Missing actual G.J gate; tet metrics cannot substitute')
    jac = report['actualGJacobian']
    require(jac['finite'] and np.isfinite(jac['minimumDeterminant']) and jac['minimumDeterminant'] > .12, 'Actual G.J determinant failed; tet fields do not substitute')
    for key in ['maximumFixedEyeDisplacementM', 'maximumFixedNeckDisplacementM', 'maximumProtectedEndpointDisplacementM', 'maximumFrameDisplacementM']:
        require(np.isfinite(report[key]) and report[key] <= 2e-6, 'Fixed source guard failed: ' + key)
    bake = report['float32MorphBakeReadback']
    require(bake['finite'] and np.isfinite(bake['maximumErrorM']) and bake['maximumErrorM'] <= 2e-6, 'Float32 bake gate failed')
    sections = report['original101HorizontalSectionsFloat32']
    require(sections['passed'] and sections['sectionCount'] == 101 and sections['missingSections'] == 0 and
        np.isfinite(sections['maximumErrorM']) and sections['maximumErrorM'] <= .002, 'Original101/2mm gate failed')


def execute(request):
    started = time.monotonic()
    spec, helper, contract, inventory, source, baseline = load()
    require(request['schema'] == 'axial-head-postreadback-request-v1' and request['source'] == contract['sourceBody'], 'Wrong new request/source')
    report = json.loads(helper.pinned(request['report']))
    numeric_gate(report, request, spec)
    audit = json.loads(helper.pinned(spec['inputs']['evaluationAudit']))
    for ref in [request['sourceSpec'], request['report'], request['mappedEndpoints'], request['sourceRecords'], request['fixedSourceMasks']]:
        require(audit['pins'].get(ref['path']) == ref['sha256'], 'Independent numerical audit does not bind: ' + ref['path'])
    for ref in [request['sourceSpec'], request['functionSpec'], request['coefficients'], request['coefficientAudit']]:
        helper.pinned(ref)
    expected = source_records(source, inventory)
    rows = validate_records(json.loads(helper.pinned(request['sourceRecords'])), expected)
    mask = json.loads(helper.pinned(request['fixedSourceMasks']))
    validate_masks(mask, expected_masks(spec, helper, source, contract), spec)
    total = expected['sourceEndpointOccurrences']
    with np.load(io.BytesIO(helper.pinned(request['mappedEndpoints'])), allow_pickle=False) as data:
        original, mapped, saved, J = [data[key] for key in ['sourceEndpointsM', 'mappedEndpointsM', 'float32BakeRoundTripM', 'sourceJacobians']]
    require(original.shape == mapped.shape == saved.shape == (total, 3) and J.shape == (total, 3, 3), 'Missing full source endpoint/J arrays')
    require(all(np.isfinite(a).all() for a in [original, mapped, saved, J]), 'Nonfinite actual source arrays')
    for row in rows:
        P = np.asarray(source.accessor(row['positionAccessor']), float)
        if row['endpoint'] >= 0:
            P += np.asarray(source.accessor(row['targetPositionAccessor']), float)
        require(np.array_equal(original[row['offset']:row['offset'] + row['count']], P[row['sourceIndices']]), 'Actual source endpoint partition differs')
    determinants = np.linalg.det(J)
    require(np.isfinite(determinants).all() and determinants.min() > .12, 'Saved actual G.J fails original.12')
    contacts, bake_function, identities = helper.functions(spec)
    adapted = adapted_records(rows)
    bake, decoded, _ = bake_function(mapped, adapted, source)
    require(bake['finite'] and bake['maximumErrorM'] <= 2e-6 and np.array_equal(decoded, saved), 'Saved Float32 output does not match real bake formula')
    frames = helper.reconstruct_face(decoded, adapted, source, contract)
    mouth = np.asarray(source.accessor(contract['mouthSurface']['indexAccessor']), int).reshape(-1, 3)
    skin = np.asarray(source.accessor(contract['faceSurface']['indexAccessor']), int).reshape(-1, 3)
    checked = []
    contact_error = None
    peak_rss = 0
    try:
        for target, P in frames.items():
            peak_rss = max(peak_rss, psutil.Process().memory_info().rss)
            require(time.monotonic() - started <= 600 and peak_rss <= 3 * 1024 ** 3, 'Single-case600s/3GiB budget exceeded')
            current = contacts(P, mouth, skin)
            checked.append({'target': target, 'sourceExistingPairs': sorted(baseline[target]), 'candidateStrictPairs': sorted(current),
                'newStrictPairs': sorted(current - baseline[target]), 'passed': not (current - baseline[target])})
    except Exception as error:
        contact_error = str(error)
    fixed = []
    for row in rows:
        ids = np.asarray(row['sourceIndices'])
        selected = set()
        for eye in mask['fixedEye']:
            if eye['positionAccessor'] == row['positionAccessor']:
                selected.update(eye['sourceIndices'])
        for neck in mask['neck']:
            if neck['positionAccessor'] == row['positionAccessor'] and neck['endpoint'] == row['endpoint']:
                selected.update(neck['sourceIndices'])
        keep = np.isin(ids, sorted(selected))
        if keep.any():
            start, end = row['offset'], row['offset'] + row['count']
            error = float(np.linalg.norm(decoded[start:end][keep] - original[start:end][keep], axis=1).max())
            fixed.append({'positionAccessor': row['positionAccessor'], 'endpoint': row['endpoint'], 'maximumDisplacementM': error, 'passed': error <= 2e-6})
    vrm = helper.actual_vrm_readback(request.get('candidateVrm'), source, decoded, adapted)
    # Validate every shared primitive consumer, beyond the representative used
    # by the old helper's trace labels.
    if request.get('candidateVrm') is not None:
        candidate = GLB(helper.pinned(request['candidateVrm']))
        for row in rows:
            for ref in row['references']:
                p = candidate.doc['meshes'][ref['mesh']]['primitives'][ref['primitive']]
                P = np.asarray(candidate.accessor(p['attributes']['POSITION']), dtype=np.float32)
                if row['endpoint'] >= 0:
                    P += np.asarray(candidate.accessor(p['targets'][row['endpoint']]['POSITION']), dtype=np.float32)
                require(np.array_equal(P[row['sourceIndices']].astype(float), decoded[row['offset']:row['offset'] + row['count']]), 'Shared primitive actual VRM endpoints differ')
    failures = []
    if contact_error is not None:
        failures.append('Incomplete contact pass: ' + contact_error)
    if any(not r['passed'] for r in checked):
        failures.append('New strict FaceMouth/Face_SKIN pairs in original base or single expression endpoint')
    if any(not r['passed'] for r in fixed):
        failures.append('Actual Float32 fixed eye/neck endpoint displacement >2um')
    complete = {r['target'] for r in checked} == set(baseline)
    if not complete and contact_error is None:
        failures.append('Original55-state strict coverage incomplete')
    return {'schema': 'axial-head-postreadback-result-v1', 'methodId': spec['methodId'],
        'id': request['candidateId'], 'candidateId': request['candidateId'], 'sourceRequestId': request['sourceRequestId'],
        'status': 'contacts-and-fixed-endpoints-passed-semantic-review-pending' if not failures else 'failed-not-admissible',
        'failures': failures, 'statesExpected': len(baseline), 'statesCompleted': len(checked), 'strictStateCoverageComplete': complete,
        'newStrictPairCount': sum(len(r['newStrictPairs']) for r in checked),
        'readbackSpec': {'path': (BASE / 'spec.json').relative_to(ROOT).as_posix(), 'sha256': helper.sha((BASE / 'spec.json').read_bytes())},
        'readbackScriptSHA256': helper.sha(Path(__file__).read_bytes()),
        **{key: request[key] for key in ['source', 'sourceSpec', 'functionSpec', 'coefficients', 'coefficientAudit', 'sourceRecords', 'fixedSourceMasks']},
        'evaluationAudit': spec['inputs']['evaluationAudit'], 'evaluationReport': request['report'], 'rawArrays': request['mappedEndpoints'],
        'inputRequest': request, 'frames': checked, 'fixedEndpoints': fixed, 'savedActualGJacobianMinimumDeterminant': float(determinants.min()),
        'functionIdentities': identities, 'actualVrmReadback': vrm, 'normalAndSemanticReview': 'pending-separate-geometric-and-author-shading-normal-readback',
        'oldSLIMMethodConsumed': False, 'sourceBaselineRecomputed': False, 'newStrictPairsWaived': False,
        'seconds': time.monotonic() - started, 'observedPeakRssBytes': peak_rss,
        'budget': {'maximumSeconds': 600, 'maximumRssBytes': 3 * 1024 ** 3, 'checkBoundary': 'Before each original expression contact frame'},
        'runtimeAccepted': False}


def prepare():
    spec, helper, contract, inventory, source, baseline = load()
    records = source_records(source, inventory)
    masks = expected_masks(spec, helper, source, contract)
    producer_checked = False
    if 'producerRecords' in spec['inputs']:
        validate_records(json.loads(helper.pinned(spec['inputs']['producerRecords'])), records)
        validate_masks(json.loads(helper.pinned(spec['inputs']['producerMasks'])), masks, spec)
        producer_checked = True
    _, _, identities = helper.functions(spec)
    return {'schema': 'axial-head-postreadback-preparation-v1', 'status': 'prepared-no-candidate-executed',
        'source': contract['sourceBody'], 'fullUnionRecords': len(records['records']),
        'sourceEndpointOccurrences': records['sourceEndpointOccurrences'], 'POSITIONGroups': len(inventory['positionGroups']),
        'actualReferencedPositionIds': inventory['allOriginalReferencedPositionIndices'], 'originalStrictFrames': len(baseline),
        'recordCountsByAccessor': [{'positionAccessor': g['position']['accessor'], 'targetCount': g['sharedTargetCount'],
            'sourceIndices': len(g['actualReferencedSourceIndices'])} for g in inventory['positionGroups']],
        'evaluationSpecPinned': spec['evaluationSpec'] is not None, 'functionIdentities': identities,
        'realProducerRecordsAndMasksVerifiedWithoutCandidateArrays': producer_checked,
        'sourceRecords': records, 'fixedSourceMasks': masks, 'candidateArraysRead': False, 'contactsExecuted': False, 'runtimeAccepted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-candidate', type=Path)
    parser.add_argument('--out', type=Path, default=BASE / 'prepared.json')
    args = parser.parse_args()
    output = args.out.resolve()
    require(output.is_relative_to(BASE.resolve()) and not output.exists(), 'Use unused output inside this package')
    try:
        result = execute(json.loads(args.execute_candidate.read_bytes())) if args.execute_candidate else prepare()
    except Exception as error:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({'status': 'failed-no-admission', 'error': str(error)}, indent=2) + '\n')
        raise
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'candidateExecuted': bool(args.execute_candidate)}))
    if result['status'] == 'failed-not-admissible':
        raise SystemExit(2)
