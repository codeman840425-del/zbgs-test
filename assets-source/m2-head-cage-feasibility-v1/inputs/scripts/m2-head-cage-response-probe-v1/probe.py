"""Run only the unchanged Head.fit response branch, never its shape solve."""
import argparse
import ast
import copy
import hashlib
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-head-cage-response-probe-v1'
sys.path.insert(0, str(ROOT / 'scripts/m2-representative-head-cage-v1'))
import head as original
from head import Head, GLB, bpy, io, np, require


def extracted_functions():
    path = ROOT / 'scripts/m2-representative-head-cage-v1/head.py'
    tree = ast.parse(path.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    fit = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'fit')
    require(isinstance(fit.body[1], ast.If), 'Original response branch differs')
    response = copy.deepcopy(fit)
    response.name = 'response_only'
    response.body = copy.deepcopy(fit.body[:2]) + [ast.Return(ast.Attribute(ast.Name('self', ast.Load()), 'response', ast.Load()))]
    end = next(i for i, n in enumerate(fit.body) if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'cage')
    targets = copy.deepcopy(fit)
    targets.name = 'requested_points_only'
    targets.body = copy.deepcopy(fit.body[2:end]) + [ast.Return(ast.Name('target', ast.Load()))]
    module = ast.fix_missing_locations(ast.Module([response, targets], []))
    calls = [n.func.attr for n in ast.walk(module) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)]
    require('lstsq' not in calls and 'fit' not in calls, 'Shape solver reached extraction')
    namespace = dict(original.__dict__)
    exec(compile(module, str(path) + ':response-extraction', 'exec'), namespace)
    return namespace['response_only'], namespace['requested_points_only'], hashlib.sha256(ast.dump(module).encode()).hexdigest()


def identity(head):
    maximum = 0.
    landmarks = None
    for accessor, _, P, _ in head.records:
        Q = head.evaluate(accessor, P)
        maximum = max(maximum, float(abs(Q - P).max()))
        if accessor == head.face_accessor:
            landmarks = head.sample(Q).tolist()
    return {'maximumPointErrorM': maximum, 'landmarksM': landmarks,
            'maximumLandmarkErrorM': float(abs(np.asarray(landmarks) - head.landmark_source).max()),
            'eyeHairRestored': maximum <= head.setup['identityToleranceM']}


def sample(sex, source, requests, spec, response_only, targets_only):
    started = time.monotonic()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    g = GLB((ROOT / source['path']).read_bytes())
    head = Head(g, spec['setup'])
    before = identity(head)
    P = np.asarray(g.accessor(head.face_accessor), float)
    vertex_weights = head.weights(P.astype(np.float32))
    direct_weights = head.weights(head.landmark_source.astype(np.float32))
    descriptions = []
    for i, (_, a, b, t) in enumerate(head.landmarks):
        descriptions.append({'a': a, 'b': b, 't': t,
            'triangleIds': [j for j, face in enumerate(head.skin_faces) if a in face and b in face],
            'sourceVertexWeights': [float(vertex_weights[a]), float(vertex_weights[b])],
            'interpolatedVertexWeight': float((1 - t) * vertex_weights[a] + t * vertex_weights[b]),
            'directPointWeight': float(direct_weights[i])})
    observed = []
    evaluate = head.evaluate
    control_count = len(head.controls)
    def capture(accessor, points, parameters=None):
        Q = evaluate(accessor, points, parameters)
        index = len(observed)
        axis, control = divmod(index, control_count)
        require(axis < 3 and accessor == head.face_accessor and parameters is None, 'Unexpected response evaluation')
        ring = head.controls[control]
        ids = [4 * ring, 4 * ring + 1]
        observed.append({'probeAxis': axis, 'controlIndex': control, 'ring': ring,
            'actualCageControlDeltasM': (io.coords(head.cage)[ids] - head.rest[ids]).tolist(),
            'landmarkDisplacementsM': (head.sample(Q) - head.landmark_source).tolist()})
        return Q
    head.evaluate = capture
    try:
        matrices = np.asarray(response_only(head, None))
    finally:
        head.evaluate = evaluate
        head.set_cage(head.rest)
    after = identity(head)
    require(len(observed) == 3 * control_count, 'Incomplete response samples')
    tensor = np.zeros((3, len(head.landmarks), control_count, 3))
    for state in observed:
        tensor[state['probeAxis'], :, state['controlIndex'], :] = np.asarray(state['landmarkDisplacementsM']) / spec['setup']['cageResponseProbeM']
    require(np.array_equal(matrices, np.asarray([tensor[a, :, :, a] for a in range(3)])), 'Same-axis response extraction changed')
    require(before['maximumPointErrorM'] <= 2e-6 and after['maximumPointErrorM'] <= 2e-6, 'Identity restoration failed')
    requested = []
    for row in requests:
        points = targets_only(head, row['parameters'])
        requested.append({**row, 'requestedLandmarksM': points.tolist(), 'requestedFlatAxisMajor': points.T.ravel().tolist()})
    cross = tensor.copy()
    for axis in range(3):
        cross[axis, :, :, axis] = 0
    return {'schema': 'head-cage-response-probe-v1', 'sex': sex, 'source': source, 'units': {'positions': 'metres', 'response': 'metres/metre', 'probe': 'metres'},
        'responseBaseline': '(probedSample-sourceLandmarksM)/nominalProbeM; no evaluated-baseline drift subtraction',
        'sourceTarget': -1, 'sourceTargetMeaning': 'Original mesh base, not authored Neutral morph0',
        'nominalProbeM': spec['setup']['cageResponseProbeM'], 'responseMatrices': matrices.tolist(), 'responseTensor': tensor.tolist(),
        'flattenedResponseAxisMajor': tensor.transpose(3, 1, 0, 2).reshape(3 * len(head.landmarks), 3 * control_count).tolist(),
        'rowOrder': 'outputXYZ axis-major then landmark', 'columnOrder': 'probeXYZ axis-major then control index',
        'restCagePositionsM': head.rest.tolist(), 'controls': head.controls,
        'controlVertexIndices': [[4 * ring, 4 * ring + 1] for ring in head.controls], 'controlSigns': [[-1, 1], [1, 1], [1, 1]],
        'sourceLandmarksM': head.landmark_source.tolist(), 'sourceFlatAxisMajor': head.landmark_source.T.ravel().tolist(),
        'landmarks': descriptions, 'sourcePointsM': P.tolist(), 'sourceFaceTriangles': head.skin_faces.tolist(),
        'sourceFacePositionAccessor': head.face_accessor, 'rawHeadRestOriginM': head.H.tolist(),
        'samplingMeaning': 'Interpolate actual transformed source edge vertices. Direct-point weights are separately observed and are not the response sampling rule.',
        'probes': observed, 'identityBefore': before, 'identityAfter': after,
        'identityLandmarkDriftM': (np.asarray(after['landmarksM']) - before['landmarksM']).tolist(),
        'maximumCrossAxisResponse': float(abs(cross).max()), 'requests': requested,
        'seconds': time.monotonic() - started, 'shapeSolveCalled': False, 'characterExported': False, 'runtimeAccepted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    spec = json.loads((BASE / 'spec.json').read_bytes())
    result = {'schema': 'head-response-probe-manifest-v1', 'cases': [], 'runtimeAccepted': False, 'shapeSolveCalled': False, 'characterExported': False}
    try:
        require(bpy.app.build_hash.decode() == spec['tool']['buildHash'], 'Actual Blender build differs')
        refs = spec['sourcePins'] + [spec['parentSpec']] + list(spec['sources'].values())
        for row in refs:
            require(io.sha((ROOT / row['path']).read_bytes()) == row['sha256'], 'Input changed: ' + row['path'])
        response_only, targets_only, ast_sha = extracted_functions()
        result.update(extractedAstSha256=ast_sha, inputs=refs, tool=spec['tool'], numpyVersion=np.__version__, blenderPython=sys.version)
        for sex, source in spec['sources'].items():
            data = sample(sex, source, [r for r in spec['requests'] if r['sex'] == sex], spec, response_only, targets_only)
            path = args.out / (sex + '.json')
            path.write_bytes(io.encoded(data))
            result['cases'].append({'sex': sex, 'path': path.relative_to(ROOT).as_posix(), 'sha256': io.sha(path.read_bytes()), 'bytes': path.stat().st_size})
            print(json.dumps({'sex': sex, 'responseShape': np.asarray(data['responseTensor']).shape, 'seconds': data['seconds']}), flush=True)
        result['status'] = 'response-probe-complete'
    except Exception as error:
        result.update(status='failed-no-retry', error=str(error))
        raise
    finally:
        (args.out / 'manifest.json').write_bytes(io.encoded(result))
