"""Stop before batch on body, identity, boundary or feature prerequisite failure."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from body import ROOT, body_displacement, extremity_indices, legacy, reference_body
from head import GLB, Head, bpy, contacts, io, np, require

BASE = ROOT / 'assets-source/m2-representative-head-cage-v1'


def receipt(spec):
    require(io.sha(Path(bpy.app.binary_path).read_bytes()) == spec['tool']['sha256'], 'Blender binary SHA mismatch')
    require(bpy.app.build_hash.decode() == spec['tool']['buildHash'], 'Blender build mismatch')
    old = json.loads((ROOT / spec['sourceSpec']['path']).read_bytes())
    require(spec['requests'] == old['variants'], 'Original eight requests changed')
    inputs = [spec['sourceSpec']] + [r['body'] for r in spec['sources'].values()] + [p for r in spec['sources'].values() for p in r['equipment']]
    for row in inputs:
        require(io.sha((ROOT / row['path']).read_bytes()) == row['sha256'], 'Input SHA mismatch: ' + row['path'])
    paths = list(Path(__file__).parent.glob('*.py')) + [BASE / 'spec.json'] + list((BASE / 'method-review').glob('*.json'))
    paths += [ROOT / 'scripts/m2-representative-batch-v1/deform.py', ROOT / 'scripts/m2-representative-batch-v2/deform.py',
              ROOT / 'scripts/m2-representative-cage-trial-v1/preflight.py', ROOT / 'scripts/production/flow.py',
              ROOT / 'scripts/m2-hairstyle-v1/check-head-space.py']
    return {'inputs': inputs, 'producer': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': io.sha(p.read_bytes())} for p in sorted(paths)]}


def numerical_jacobian(head, accessor, points, parameters=None):
    epsilon = head.setup['probeM']
    return np.stack([(head.evaluate(accessor, points + np.eye(3)[axis] * epsilon, parameters) -
                      head.evaluate(accessor, points - np.eye(3)[axis] * epsilon, parameters)) / (2 * epsilon) for axis in range(3)], axis=2)


def run(spec, out):
    result = {'schema': 'representative-head-preflight-v1', 'receipt': receipt(spec), 'sexes': [],
              'status': 'running', 'shapeBatchStarted': False, 'runtimeAccepted': False,
              'blenderPython': sys.version, 'numpyVersion': np.__version__}
    reference = reference_body()
    def save():
        (out / 'preflight.json').write_bytes(io.encoded(result))
    for sex, source in spec['sources'].items():
        started = time.monotonic()
        row = {'sex': sex, 'gates': [], 'status': 'running'}
        result['sexes'].append(row)
        def gate(name, passed, details):
            row['gates'].append({'id': name, 'passed': bool(passed), **details})
            save()
            require(passed, sex + ': ' + name)
        try:
            bpy.ops.object.select_all(action='SELECT')
            bpy.ops.object.delete(use_global=False)
            g = GLB((ROOT / source['body']['path']).read_bytes())
            context = legacy.source_context(g)
            mesh_nodes_identity = all(all(k not in n for k in ['matrix', 'translation', 'rotation', 'scale']) for n in g.doc['nodes'] if 'mesh' in n)
            all_positions = np.concatenate([P for _, _, P, _ in io.group_records(g)])
            height = float(np.ptp(all_positions[:, 1]))
            gate('source-metre-rest-space', mesh_nodes_identity and 1 < height < 2.2,
                 {'meshNodesIdentity': mesh_nodes_identity, 'heightM': height, 'objectScale': [1, 1, 1]})
            extremities = extremity_indices(g)
            body_checks = []
            for request in [r for r in spec['requests'] if r['sex'] == sex]:
                error, distal, minimum = 0., 0., float('inf')
                for accessor, primitives, P, F in io.group_records(g):
                    ends = [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in primitives[0].get('targets', [])]
                    for E in ends:
                        D = body_displacement(E, request['parameters'], context)
                        error = max(error, float(abs(E + D - reference(E, request['parameters'], context)).max()))
                        distal = max(distal, float(np.linalg.norm(D[extremities[accessor]], axis=1).max(initial=0)))
                        epsilon = 1e-5
                        J = np.eye(3) + np.stack([(body_displacement(E + np.eye(3)[a] * epsilon, request['parameters'], context) - body_displacement(E - np.eye(3)[a] * epsilon, request['parameters'], context)) / (2 * epsilon) for a in range(3)], axis=2)
                        minimum = min(minimum, float(np.linalg.det(J).min()))
                body_checks.append({'id': request['basePresetId'], 'maximumComponentErrorM': error,
                                    'maximumDistalDisplacementM': distal, 'minimumBodyOnlyDeterminant': minimum})
            gate('exact-v2-body-factor-and-distal', all(r['maximumComponentErrorM'] == 0 and r['maximumDistalDisplacementM'] < 1e-12 and r['minimumBodyOnlyDeterminant'] > .12 for r in body_checks), {'requests': body_checks})
            head = Head(g, spec['setup'])
            identity = 0.
            coverage = float('inf')
            count = 0
            low, high = head.bounds
            for accessor, ps, P, F in head.records:
                obj = head.objects[accessor][0]
                gate('source-index-' + str(accessor), np.array_equal(io.coords(obj), P) and [list(p.vertices) for p in obj.data.polygons] == F.tolist(),
                     {'vertices': len(P), 'triangles': len(F), 'positionSha256': io.sha(P.tobytes()), 'indexSha256': io.sha(F.astype('<u4').tobytes())})
                for E in [P] + [P + np.asarray(g.accessor(t['POSITION'])) for t in ps[0].get('targets', [])]:
                    Q = head.evaluate(accessor, E)
                    identity = max(identity, float(np.linalg.norm(Q - E, axis=1).max()))
                    affected = E[head.weights(E.astype(np.float32)) > 0]
                    if len(affected):
                        coverage = min(coverage, float(np.minimum(affected - low, high - affected).min()))
                    count += 1
            gate('identity-and-all-endpoint-coverage', identity <= spec['setup']['identityToleranceM'] and coverage > 0,
                 {'identityMaximumErrorM': identity, 'minimumCoverageMarginM': coverage, 'arraysIncludingBase': count,
                  'cageVertices': len(head.rest), 'closedRingConstruction': True, 'restCagePositionsM': head.rest.tolist()})
            shift = np.array([spec['setup']['affineProbeM'], 0, 0])
            head.set_cage(head.rest + shift)
            probe_error, eye_error, hair_error, neck_error = 0., 0., 0., 0.
            mouth_checks = []
            minimum = float('inf')
            for accessor, ps, P, F in head.records:
                for target_index, E in [(-1, P)] + [(i, P + np.asarray(g.accessor(t['POSITION']))) for i, t in enumerate(ps[0].get('targets', []))]:
                    Q = head.evaluate(accessor, E)
                    expected = E + head.weights(E.astype(np.float32))[:, None] * shift
                    probe_error = max(probe_error, float(np.linalg.norm(Q - expected, axis=1).max()))
                    for p in ps:
                        name = g.doc['materials'][p['material']]['name']
                        ids = np.unique(g.accessor(p['indices']))
                        error = float(np.linalg.norm(Q[ids] - E[ids], axis=1).max())
                        if '_EYE' in name or 'Eyeline' in name or 'Eyelash' in name:
                            eye_error = max(eye_error, error)
                        if 'HAIR' in name:
                            hair_error = max(hair_error, error)
                    if target_index in [-1, 0]:
                        minimum = min(minimum, float(np.linalg.det(numerical_jacobian(head, accessor, E)).min()))
                        if accessor == head.face_accessor:
                            before = contacts(E, head.mouth_faces, head.skin_faces)
                            after = contacts(Q, head.mouth_faces, head.skin_faces)
                            mouth_checks.append({'target': target_index, 'sourcePairs': len(before), 'probePairs': len(after), 'addedPairs': sorted(after - before)})
            # Probe the mathematical neck boundary using actual bound object slots.
            accessor = head.face_accessor
            P = np.asarray(g.accessor(accessor), float)
            for offset in [-1e-5, 0, 1e-5]:
                E = P.copy()
                E[:, 1] = head.H[1] + head.neck_start + offset
                neck_error = max(neck_error, float(np.linalg.norm(head.evaluate(accessor, E) - E, axis=1).max()))
            gate('spatial-boundary-and-feature-probe', probe_error <= 2e-6 and eye_error <= 2e-6 and hair_error <= 2e-6 and neck_error < 1e-8 and minimum > .12,
                 {'maximumWeightedAffineErrorM': probe_error, 'maximumEyeDisplacementM': eye_error,
                  'maximumHairDisplacementM': hair_error, 'maximumNeckBoundaryProbeM': neck_error,
                  'minimumProbeDeterminant': minimum, 'derivativeIncludesRecomputedSpatialWeights': True})
            gate('coherent-mouth-expression-probe', all(not r['addedPairs'] for r in mouth_checks),
                 {'contactFrames': mouth_checks, 'scope': 'Actual FaceMouth (includes oral geometry) and Face_SKIN strict pairs, neutral and original target0 under weighted 3mm head probe. All original endpoints additionally passed identity.'})
            head.set_cage(head.rest)
            for accessor, _, P, _ in head.records:
                head.evaluate(accessor, P)
            bpy.ops.wm.save_as_mainfile(filepath=str(out / (sex + '-editable-head-rest.blend')), check_existing=False)
            row['status'] = 'preflight-passed'
            row['seconds'] = time.monotonic() - started
            save()
        except Exception as error:
            row['status'], row['failure'] = 'failed-stop-before-batch', str(error)
            result['status'] = 'failed-stop-before-batch'
            row['seconds'] = time.monotonic() - started
            bpy.ops.wm.save_as_mainfile(filepath=str(out / (sex + '-FAILED.blend')), check_existing=False)
            save()
            return result
    result['status'] = 'preflight-passed'
    save()
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    report = run(json.loads((BASE / 'spec.json').read_bytes()), args.out)
    require(report['status'] == 'preflight-passed', 'Head-only prerequisites failed. Batch stopped.')
