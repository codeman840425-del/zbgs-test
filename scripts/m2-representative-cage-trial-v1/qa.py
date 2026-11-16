"""Read baked source geometry, requested intent and actual static contacts."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-representative-cage-trial-v1'
sys.path.insert(0, str(ROOT / 'scripts/m2-socks-layer-v1'))
import qa as contact
from flow import GLB


def rows(g, token=None):
    P, F = [], []
    offset = 0
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            if token and token not in g.doc['materials'][p['material']]['name']:
                continue
            points = np.asarray(g.accessor(p['attributes']['POSITION']), float)
            faces = np.asarray(g.accessor(p['indices']), int).reshape(-1, 3)
            P.extend(points)
            F.extend(faces + offset)
            offset += len(points)
    return np.asarray(P), np.asarray(F)


def invariants(a, b):
    checks = {'nodes': a.doc['nodes'] == b.doc['nodes'], 'skinsAndIBMRefs': a.doc['skins'] == b.doc['skins'],
              'materials': a.doc['materials'] == b.doc['materials'], 'textures': a.doc.get('textures') == b.doc.get('textures'),
              'vrmExtension': a.doc.get('extensions') == b.doc.get('extensions'),
              'originalBinaryPrefix': b.binary.startswith(a.binary)}
    for mi, mesh in enumerate(a.doc['meshes']):
        for pi, p in enumerate(mesh['primitives']):
            q = b.doc['meshes'][mi]['primitives'][pi]
            checks[f'{mi}/{pi}/indices'] = np.array_equal(a.accessor(p['indices']), b.accessor(q['indices']))
            for key in set(p['attributes']) - {'POSITION', 'NORMAL'}:
                checks[f'{mi}/{pi}/{key}'] = key in q['attributes'] and np.array_equal(a.accessor(p['attributes'][key]), b.accessor(q['attributes'][key]))
            N = np.asarray(b.accessor(q['attributes']['NORMAL']))
            checks[f'{mi}/{pi}/normalsFiniteNonzero'] = bool(np.isfinite(N).all() and np.linalg.norm(N, axis=1).min() > .5)
            checks[f'{mi}/{pi}/morphCount'] = len(p.get('targets', [])) == len(q.get('targets', []))
            for i, target in enumerate(q.get('targets', [])):
                checks[f'{mi}/{pi}/morph{i}Finite'] = bool(all(np.isfinite(b.accessor(index)).all() for index in target.values()))
    return {'allPassed': all(checks.values()), 'checks': checks}


def metrics(a, b):
    skin = next(p for m in a.doc['meshes'] for p in m['primitives'] if 'Body_00_SKIN' in a.doc['materials'][p['material']]['name'])
    replacement = next(p for m in b.doc['meshes'] for p in m['primitives'] if 'Body_00_SKIN' in b.doc['materials'][p['material']]['name'])
    P = np.asarray(a.accessor(skin['attributes']['POSITION']))
    Q = np.asarray(b.accessor(replacement['attributes']['POSITION']))
    used = np.unique(a.accessor(skin['indices']))
    maximum = int(used[np.argmax(np.linalg.norm(Q[used] - P[used], axis=1))])
    skin_id = next(n['skin'] for n in a.doc['nodes'] if n.get('mesh') == 0)
    skel = a.doc['skins'][skin_id]
    joints = np.asarray(a.accessor(skin['attributes']['JOINTS_0']), int)
    weights = np.asarray(a.accessor(skin['attributes']['WEIGHTS_0']))
    names = [a.doc['nodes'][i]['name'] for i in skel['joints']]
    protected_extremities = np.array([any(w > .5 and any(t in names[j] for t in ['Hand', 'Finger', 'Thumb', 'Index', 'Middle', 'Ring', 'Little', 'Foot', 'Toe']) for j, w in zip(joint, weight)) for joint, weight in zip(joints, weights)])
    extremities = used[protected_extremities[used]]
    maximum_record = {'vertex': maximum, 'sourceM': P[maximum].tolist(), 'targetM': Q[maximum].tolist(),
        'deltaM': (Q[maximum] - P[maximum]).tolist(), 'distanceM': float(np.linalg.norm(Q[maximum] - P[maximum])),
        'weights': [{'bone': names[j], 'weight': float(w)} for j, w in zip(joints[maximum], weights[maximum]) if w > 0]}
    semantic = {r['bone']: r['node'] for r in a.doc['extensions']['VRM']['humanoid']['humanBones']}
    ibm = np.asarray(a.accessor(skel['inverseBindMatrices'])).reshape(-1, 4, 4)
    centers = {key: -ibm[skel['joints'].index(node), 3, :3] for key, node in semantic.items() if node in skel['joints']}
    sections = {}
    for name, height in [('hip', centers['hips'][1] - .035), ('waist', (centers['hips'][1] + centers['chest'][1]) / 2), ('chest', centers['chest'][1])]:
        selection = used[(abs(P[used, 1] - height) < .015) & (abs(P[used, 0]) < .25)]
        if len(selection):
            sections[name] = {'sourceVertexCount': len(selection), 'sourceWidthM': float(np.ptp(P[selection, 0])), 'actualWidthM': float(np.ptp(Q[selection, 0])),
                              'sourceDepthM': float(np.ptp(P[selection, 2])), 'actualDepthM': float(np.ptp(Q[selection, 2]))}
    face = next(p for m in a.doc['meshes'] for p in m['primitives'] if 'Face_00_SKIN' in a.doc['materials'][p['material']]['name'])
    new_face = next(p for m in b.doc['meshes'] for p in m['primitives'] if 'Face_00_SKIN' in b.doc['materials'][p['material']]['name'])
    A = np.asarray(a.accessor(face['attributes']['POSITION'])) - centers['head']
    B = np.asarray(b.accessor(new_face['attributes']['POSITION'])) - centers['head']
    ids = np.unique(a.accessor(face['indices']))
    for name, height in [('jaw', -.025), ('cheek', .005)]:
        selected = ids[(abs(A[ids, 1] - height) < .008) & (A[ids, 2] < -.025)]
        if len(selected):
            sections[name] = {'sourceVertexCount': len(selected), 'sourceHalfWidthM': float(np.ptp(A[selected, 0]) / 2), 'actualHalfWidthM': float(np.ptp(B[selected, 0]) / 2)}
    return {'maximumReferencedBodyDisplacement': maximum_record,
            'maximumHandFootDisplacementM': float(np.linalg.norm(Q[extremities] - P[extremities], axis=1).max()),
            'sections': sections, 'sourceFaceMinimumY': float(A[ids, 1].min()), 'actualFaceMinimumY': float(B[ids, 1].min())}


def contacts(resources):
    measured = []
    for first, second in [('body', 'top'), ('body', 'bottom'), ('body', 'shoes'), ('top', 'bottom')]:
        P, F = resources[first]
        Q, G = resources[second]
        pairs = contact.intersections(P, F, Q, G)
        samples = P[np.unique(F)]
        # Full vertex-to-triangle distance. This is unsigned and does not
        # classify coplanar overlap, containment, dynamic contact or thickness.
        distance = contact.nearest_distance(samples, Q[G])
        measured.append({'pair': [first, second], 'intersectionPairs': pairs,
                         'intersectionCount': len(pairs), 'samples': len(samples),
                         'minimumUnsignedVertexSurfaceDistanceM': float(distance.min()),
                         'p05UnsignedVertexSurfaceDistanceM': float(np.quantile(distance, .05))})
    return measured


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=BASE / 'verified')
    args = parser.parse_args()
    spec = json.loads((BASE / 'spec.json').read_bytes())
    baselines = {}
    summary = []
    started = time.monotonic()
    for sex, source in spec['sources'].items():
        g = GLB((ROOT / source['body']['path']).read_bytes())
        original_gear = {e['slot']: GLB((ROOT / e['path']).read_bytes()) for e in source['equipment']}
        resources = {'body': rows(g, 'Body_00_SKIN'), **{slot: rows(asset) for slot, asset in original_gear.items()}}
        baselines[sex] = contacts(resources)
        for request in [r for r in spec['requests'] if r['sex'] == sex]:
            folder = args.out / (request['basePresetId'] + '-cage-trial-v1')
            q = GLB((folder / 'avatar.vrm').read_bytes())
            gear = {slot: GLB((folder / (slot + '.glb')).read_bytes()) for slot in original_gear}
            actual = contacts({'body': rows(q, 'Body_00_SKIN'), **{slot: rows(asset) for slot, asset in gear.items()}})
            shape = metrics(g, q)
            for key, values in shape['sections'].items():
                for axis in ['Width', 'Depth', 'HalfWidth']:
                    source_key = 'source' + axis + 'M'
                    parameter = key + ('Width' if axis == 'HalfWidth' else axis)
                    if source_key in values and parameter in request['parameters']:
                        values['requested' + axis + 'M'] = values[source_key] * (1 + request['parameters'][parameter])
                        values['residual' + axis + 'M'] = values['actual' + axis + 'M'] - values['requested' + axis + 'M']
            identity = {'body': invariants(g, q), **{slot: invariants(original_gear[slot], asset) for slot, asset in gear.items()}}
            result = {'id': request['basePresetId'], 'sex': sex, 'requestedParameters': request['parameters'],
                'shape': shape, 'identity': identity, 'contacts': actual,
                'status': 'failed-production-admission', 'reasons': ['Garment spatial Jacobian not measured, original det gate incomplete.',
                'Single whole-avatar cage propagates shoulder/arm radius controls into axial hand displacement with original bones fixed.'],
                'contactScope': 'Exact indexed rest surfaces, inclusive noncoplanar segment-triangle pairs and full vertex-to-triangle unsigned distance. No posed collision/continuous clearance pass.'}
            (folder / 'qa.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
            summary.append({'id': result['id'], 'status': result['status'], 'maxHandFootM': shape['maximumHandFootDisplacementM'],
                            'contactCounts': [r['intersectionCount'] for r in actual], 'identityPassed': all(r['allPassed'] for r in identity.values())})
            print(json.dumps(summary[-1]), flush=True)
    (args.out / 'qa.json').write_bytes((json.dumps({'schema': 'representative-cage-trial-qa-v1', 'variants': summary,
        'sourceRestContacts': baselines, 'elapsedSeconds': time.monotonic() - started,
        'sourceAuthorCheck': True, 'independentReview': False, 'runtimeAccepted': False}, indent=2) + '\n').encode())


if __name__ == '__main__':
    main()
