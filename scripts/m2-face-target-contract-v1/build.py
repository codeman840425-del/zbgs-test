"""Produce source-backed face targets only. No deformation or solver imports."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-face-target-contract-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, local, require


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def numeric_hash(points):
    return digest(np.asarray(points, dtype='<f8').tobytes())


def read_pin(ref, root=ROOT):
    path = local(root, ref['path'])
    require(path.is_file(), 'Missing pinned resource: ' + ref['path'])
    data = path.read_bytes()
    require(digest(data) == ref['sha256'], 'Pinned SHA mismatch: ' + ref['path'])
    return data


def read_json(ref):
    return json.loads(read_pin(ref))


def pointer(ref, json_pointer):
    return {**ref, 'jsonPointer': json_pointer}


def source_contract(sex, response, body_ref, reports, spec):
    g = GLB(read_pin(body_ref))
    head = np.asarray(response['rawHeadRestOriginM'])
    face_accessor = response['sourceFacePositionAccessor']
    points = np.asarray(g.accessor(face_accessor), float)
    require(np.array_equal(points, response['sourcePointsM']), 'Source Face POSITION differs')
    protected = []
    mouth = None
    face = None
    groups = {}
    for mesh_id, mesh in enumerate(g.doc['meshes']):
        for primitive_id, p in enumerate(mesh['primitives']):
            groups.setdefault(p['attributes']['POSITION'], []).append(p)
            name = g.doc['materials'][p['material']]['name']
            ids = np.unique(g.accessor(p['indices'])).astype(int)
            descriptor = {'mesh': mesh_id, 'primitive': primitive_id, 'materialName': name,
                'positionAccessor': p['attributes']['POSITION'], 'indexAccessor': p['indices'],
                'indexArraySHA256Float64LE': numeric_hash(g.accessor(p['indices']))}
            if 'Face_00_SKIN' in name:
                face = descriptor
            if 'FaceMouth' in name:
                mouth = descriptor
            if not any(token in name for token in ['_EYE', 'Eyeline', 'Eyelash', 'HAIR']):
                continue
            P = np.asarray(g.accessor(p['attributes']['POSITION']), dtype=np.float32)
            targets = p.get('targets', [])
            endpoints = [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in targets]
            protected.append({**descriptor, 'referencedVertexIndices': ids.tolist(),
                'endpointCount': len(endpoints), 'endpoints': [
                    {'target': target, 'positionDeltaAccessor': None if target == -1 else targets[target]['POSITION'],
                     'pointCount': len(ids), 'sourcePositionsSHA256Float64LE': numeric_hash(E[ids]),
                     'volumeMapping': None, 'mappingStatus': 'pending-domain-embedding'}
                    for target, E in enumerate(endpoints, -1)]})
    require(face is not None and mouth is not None, 'Missing actual face or mouth primitive')
    for group in groups.values():
        require(all(p.get('targets', []) == group[0].get('targets', []) for p in group), 'Shared POSITION has different targets')
    require(face['positionAccessor'] == mouth['positionAccessor'] == face_accessor, 'Contact topology does not share source face POSITION')
    face_indices = np.asarray(g.accessor(face['indexAccessor']), int).reshape(-1, 3)
    require(np.array_equal(face_indices, response['sourceFaceTriangles']), 'Actual face triangles differ')
    frames = reports[0][1]['mouthSkinExpressionChecks']
    baseline = [(f['target'], f['sourceStrictPairs']) for f in frames]
    for _, report in reports:
        require([(f['target'], f['sourceStrictPairs']) for f in report['mouthSkinExpressionChecks']] == baseline,
                'Source strict baseline differs between frozen requests')
    targets = next(p for p in groups[face_accessor] if p['attributes']['POSITION'] == face_accessor).get('targets', [])
    require([f['target'] for f in frames] == list(range(-1, len(targets))), 'Missing strict source endpoint baseline')
    neutral = g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']
    neutral = [v for v in neutral if str(v.get('presetName', '')).lower() == 'neutral']
    return {'schema': 'face-target-source-contract-v1', 'sex': sex, 'sourceBody': body_ref,
        'coordinates': {'space': 'original-glTF-rest-POSITION', 'units': 'metres', 'rawHeadOriginM': head.tolist(),
            'headLocalConversion': 'sourcePosition - rawHeadOriginM'},
        'faceSurface': face, 'mouthSurface': mouth, 'facePositionCount': len(points),
        'facePositionSHA256Float64LE': numeric_hash(points),
        'preservedSourceAttributes': {'policy': 'No geometry generated; original topology, JOINTS, WEIGHTS, IBM, UV, materials and VRM expression bindings remain pinned by exact body SHA.',
            'skinIBMAccessors': [s['inverseBindMatrices'] for s in g.doc['skins']], 'neutralBindingsFromOriginalVRM': neutral},
        'featurePreservation': {'requiredMaximumDisplacementM': 2e-6,
            'scope': 'Referenced eyes, eyeline, eyelashes and hair base plus every original individual morph endpoint. This extends explicit future readback beyond the old base-only displacement check.',
            'anchorDistanceFadeIsNotAcceptanceRequirement': True, 'protectedPrimitives': protected,
            'status': 'source-indices-and-endpoint-identities-complete-mapping-pending'},
        'contactBaseline': {'policy': 'New strict FaceMouth/Face_SKIN pairs remain failures. Existing strict and precision-boundary failures are retained without waiver.',
            'frames': [{'target': f['target'], 'sourceStrictPairCount': len(f['sourceStrictPairs']),
                'sourceStrictPairsSHA256CanonicalJSON': digest(encoded(f['sourceStrictPairs'])),
                'reference': pointer(reports[0][0], '/mouthSkinExpressionChecks/' + str(i) + '/sourceStrictPairs')}
                for i, f in enumerate(frames)],
            'sourceEndpointMeaning': {'-1': 'original base, not Neutral', '0..N': 'each original source morph endpoint at full delta; Neutral binding is recorded separately'},
            'pairTriangleIdentity': {'first': mouth, 'second': face, 'order': 'triangle order in the exact primitive index accessor'},
            'predicate': {'resource': spec['producerInputs'][2], 'functions': ['segment_hits'],
                'strictBarycentricAndSegmentExclusion': 1e-7, 'determinantExclusion': 1e-12,
                'scope': 'Frozen noncoplanar finite strict segment/triangle test; no coplanar or continuous-expression guarantee.'},
            'originalFailedPreflight': spec['originalPreflight'], 'originalPrecisionPairDiagnosis': spec['originalPairDiagnosis'],
            'recomputedHere': False},
        'embedding': {'status': 'not-created', 'originalVertexAndExpressionEndpointMap': None,
            'requiredReadbacks': ['all original vertex/endpoint identity <=2um', 'one affine readback <=2um',
                'same-position duplicate material points share consistent mapping', 'complete necessary domain coverage and positive volume cells'],
            'allMissingMappingsRetainedAsPending': True}, 'runtimeAccepted': False}


def documents(spec=None):
    spec = spec or json.loads((BASE / 'spec.json').read_bytes())
    head_spec, requests = read_json(spec['headSpec']), read_json(spec['requestSpec'])['variants']
    require(head_spec['requests'] == requests, 'Original eight request parameters differ')
    require(len(requests) == 8 and len({r['id'] for r in requests}) == 8, 'Require original eight unique requests')
    for ref in spec['producerInputs'] + [spec['review'], spec['implementationAddendum'],
            spec['nativeVertexGuideProducer'], spec['originalPreflight'], spec['originalPairDiagnosis']]:
        read_pin(ref)
    native_document = read_json(spec['nativeVertexGuide'])
    read_pin(spec['nativeVertexGuideErrorEvidence'])
    require(native_document['schema'] == 'native-source-vertex-guide-v1' and
        not native_document['shapeSolveCalled'] and not native_document['geometryExported'], 'Native guide is not the reviewed request-only artifact')
    require(native_document['originalTargetProducerSha256'] == spec['producerInputs'][0]['sha256'], 'Native guide target formula identity differs')
    frozen = {'np': np, 'require': require}
    for ref, name in [(spec['producerInputs'][1], 'surface_widths'), (spec['producerInputs'][4], 'source_context')]:
        function = next(n for n in ast.parse(read_pin(ref)).body if isinstance(n, ast.FunctionDef) and n.name == name)
        exec(compile(ast.Module([function], []), ref['path'], 'exec'), frozen)
    status = read_json(spec['sourceStatus'])
    require(sum(v['status'] == 'source-passed' for v in status['variants']) == 6, 'Existing source count changed')
    reports = [(ref, read_json(ref)) for ref in spec['diagnosticReports']]
    require(len(reports) == 8 and all(r['status'] == 'diagnostic-failed' and not r['runtimeAccepted'] for _, r in reports), 'Original diagnostic failures must remain retained')
    result = {}
    for sex in ['female', 'male']:
        response = read_json(spec['responses'][sex])
        body_ref = head_spec['sources'][sex]['body']
        require(response['source'] == body_ref, 'Response/source identity differs')
        sex_reports = [(ref, r) for ref, r in reports if r['sex'] == sex]
        result['source-' + sex + '.json'] = source_contract(sex, response, body_ref, sex_reports, spec)
        source_points = np.asarray(response['sourcePointsM'])
        source_glb = GLB(read_pin(body_ref))
        context = frozen['source_context'](source_glb)
        require(np.array_equal(context['joints']['head'], response['rawHeadRestOriginM']), 'Raw head bind origin differs')
        edges = response['landmarks']
        require(len(edges) == 202, 'Require 202 material guide rows')
        sampled = np.asarray([(1 - e['t']) * source_points[e['a']] + e['t'] * source_points[e['b']] for e in edges])
        require(np.array_equal(sampled, response['sourceLandmarksM']), 'Source edge/t interpolation differs')
        H = np.asarray(response['rawHeadRestOriginM'])
        face_triangles = np.asarray(response['sourceFaceTriangles'], int)
        face_lo = float(source_points[np.unique(face_triangles), 1].min() - H[1])
        source_y = np.linspace(face_lo + .00001, context['eyeMin'][1] - H[1] - .006, 101)
        actual_source_widths = frozen['surface_widths'](source_points - H, face_triangles, source_y)
        require(len(actual_source_widths) == 101 and None not in actual_source_widths, 'Original source has missing formal sections')
        native_sex_index, native_source = next((i, s) for i, s in enumerate(native_document['sexes']) if s['sex'] == sex)
        guide_ids = sorted({v for e in edges for v in [e['a'], e['b']]})
        require(native_source['source'] == body_ref and native_source['responseSha256'] == spec['responses'][sex]['sha256'], 'Native guide resource identity differs')
        require(native_source['positionAccessor'] == response['sourceFacePositionAccessor'] and native_source['guideVertexIndices'] == guide_ids, 'Native guide indices differ')
        require(np.array_equal(native_source['sourcePointsM'], source_points[guide_ids]), 'Native guide source vertices differ')
        for request in [q for q in requests if q['sex'] == sex]:
            observed = next(q for q in response['requests'] if q['id'] == request['id'])
            require({k: observed[k] for k in request} == request, 'Response request differs')
            report_ref, report = next((ref, r) for ref, r in sex_reports if r['basePresetId'] == request['basePresetId'])
            target = np.asarray(observed['requestedLandmarksM'])
            require(np.array_equal(target, report['fit']['requestedPointsM']), 'Frozen requested material guide differs')
            local_target = target - H
            section_y = local_target[::2, 1]
            widths = (local_target[1::2, 0] - local_target[::2, 0]) / 2
            sections = report['fit']['crossSections']
            require(np.array_equal(source_y, sections['sourceYMetres']), 'Source section Y differs from original resource/context')
            source_error = float(np.max(abs(np.asarray(actual_source_widths) - sections['sourceHalfWidthsM'])))
            require(source_error < 1e-12, 'Original source true section readback differs')
            require(len(section_y) == len(widths) == 101 and np.all(np.diff(section_y) > 0), 'Missing or unordered 101 sections')
            require(np.array_equal(section_y, sections['requestedYMetres']) and np.array_equal(widths, sections['requestedHalfWidthsM']), 'Frozen formal section targets differ')
            native_case_index, native_case = next((i, q) for i, q in enumerate(native_source['cases']) if q['id'] == request['id'])
            require(native_case['parameters'] == request['parameters'], 'Native guide parameters differ')
            guide_points = np.asarray(native_case['requestedVertexPointsM'])
            lookup = {v: i for i, v in enumerate(guide_ids)}
            interpolated = np.asarray([(1 - e['t']) * guide_points[lookup[e['a']]] + e['t'] * guide_points[lookup[e['b']]] for e in edges])
            error = interpolated - target
            require(np.array_equal(error, native_case['guideInterpolationAllErrorM']), 'Native guide material interpolation readback differs')
            native = {'status': 'reviewed-request-only-guide-no-domain-mapping', 'acceptanceRequired': False,
                'necessaryConditionForSectionAcceptance': False, 'sufficientConditionForSectionAcceptance': False,
                'sourceReference': pointer(spec['nativeVertexGuide'], '/sexes/' + str(native_sex_index)),
                'requestReference': pointer(spec['nativeVertexGuide'], '/sexes/' + str(native_sex_index) + '/cases/' + str(native_case_index)),
                'vertexCount': len(guide_ids), 'positionAccessor': response['sourceFacePositionAccessor'],
                'maximumMaterialInterpolationCoordinateDifferenceM': float(abs(error).max()),
                'volumeNodeMapping': None, 'mappingStatus': 'pending-exact-original-vertex-to-native-volume-node-check'}
            result['targets/' + request['id'] + '.json'] = {'schema': 'face-target-request-contract-v1',
                'id': request['id'], 'sex': sex, 'sourceBody': body_ref, 'originalRequest': request,
                'sourceContract': 'source-' + sex + '.json',
                'materialGuide': {'kind': 'soft-source-edge-guide', 'acceptanceRequired': False,
                    'necessaryConditionForSectionAcceptance': False, 'sufficientConditionForSectionAcceptance': False,
                    'rows': [{'a': e['a'], 'b': e['b'], 't': e['t'], 'sourceTriangleIds': e['triangleIds'],
                        'sourcePositionM': sampled[i].tolist(), 'requestedPositionM': target[i].tolist(),
                        'volumeMapping': None, 'mappingStatus': 'pending-original-vertex-embedding-composed-with-edge-t'} for i, e in enumerate(edges)]},
                'nativeVertexGuide': native,
                'sectionAcceptance': {'kind': 'formal-original-mesh-recut', 'acceptanceRequired': True,
                    'sampleCount': 101, 'sourceYMetres': sections['sourceYMetres'], 'sourceHalfWidthsM': sections['sourceHalfWidthsM'],
                    'requestedYMetres': section_y.tolist(), 'requestedHalfWidthsM': widths.tolist(),
                    'maximumAbsoluteHalfWidthErrorM': .002, 'missingSectionsAllowed': 0,
                    'headLocalFrontFilter': {'axis': 'z', 'comparison': '<', 'metres': -.025},
                    'measurement': 'Intersect final original Face_SKIN triangles with each requested head-local Y plane. Keep front-filtered intersections. Half-width is (maxX-minX)/2. Recompute edges/t/extrema each time.',
                    'frozenMeasurementImplementation': {'resource': spec['producerInputs'][1], 'function': 'surface_widths'},
                    'originalSourceReadback': {'sampleCount': 101, 'missingSections': 0, 'maximumDifferenceFromFrozenSourceHalfWidthsM': source_error},
                    'actualValues': None, 'status': 'targets-complete-no-candidate-measurement'},
                'chinIntent': {'requestedLengthM': request['parameters']['chinLengthM'],
                    'requestedProjectionM': request['parameters']['chinProjectionM'],
                    'sourceChinMinimumHeadLocalYM': sections['sourceChinMinimumY'],
                    'lengthRole': 'Moves material target Y and formal slice Y according to the original formula.',
                    'projectionRole': 'Moves material target Z; formal width gate alone does not independently establish chin projection.',
                    'independentLengthOrProjectionAcceptanceThresholdM': None,
                    'actualValues': None, 'status': 'intent-complete-independent-threshold-not-defined-by-original-version'},
                'previousDiagnosticFailure': {'reference': report_ref, 'status': report['status'], 'failures': report['failures']},
                'newFacePassed': False, 'runtimeAccepted': False}
    result['manifest.json'] = {'schema': 'face-target-contract-manifest-v1', 'version': 1,
        'specSHA256': digest((BASE / 'spec.json').read_bytes()), 'producerSHA256': digest(Path(__file__).read_bytes()),
        'originalRequestCount': 8, 'existingBodySourcePassed': 6, 'existingBodySourceFailed': 2,
        'newFaceCandidateCount': 0, 'newFacePassedCount': 0, 'volumeDomainCreated': False,
        'files': [{'path': path, 'sha256': digest(encoded(data))} for path, data in sorted(result.items())],
        'runtimeAccepted': False}
    return result


def check_output(output, expected):
    for name, value in expected.items():
        path = output / name
        require(path.is_file(), 'Missing contract output: ' + name)
        require(path.read_bytes() == encoded(value), 'Contract identity or semantics mismatch: ' + name)


def produce(output, expected):
    output = output.resolve()
    require(output.is_relative_to(BASE.resolve()) and output != BASE.resolve(), 'Output must be a package child')
    if output.exists():
        check_output(output, expected)
        return 'identical-existing-output'
    stage = output.with_name(output.name + '.stage')
    require(not stage.exists(), 'Existing stage retained; choose an unused output')
    stage.mkdir(parents=True)
    try:
        for name, value in expected.items():
            path = stage / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded(value))
        check_output(stage, expected)
        stage.rename(output)
    except Exception as error:
        (stage / 'FAILED.json').write_bytes(encoded({'status': 'failed-no-success-output', 'error': str(error)}))
        raise
    return 'produced'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=BASE / 'generated')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = documents()
    if args.check:
        check_output(args.out, expected)
        state = 'readback-passed'
    else:
        state = produce(args.out, expected)
    print(json.dumps({'status': state, 'sourceContracts': 2, 'requestContracts': 8,
        'sectionTargets': 808, 'shapeGenerated': False, 'runtimeAccepted': False}))
