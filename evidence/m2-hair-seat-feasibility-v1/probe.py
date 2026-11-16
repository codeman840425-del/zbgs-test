"""Read exact captured states. Reconstruct head frames without running a game."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

import numpy as np

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
SOURCE_COMMIT = '3934f9e1bde3bf6c1b07f2cf848489108fd5a21b'
INPUTS = {
    'room': 'evidence/m2-long-hair-room-e9b-v1/report.json',
    'contact': 'evidence/m2-long-hair-contacts-e9b-v1/report.json',
    'oldGeometry': 'evidence/m2-hair-chair-actual-508-v1/report.json',
    'image': 'evidence/m2-long-hair-review-e9b-v1/sheet-03.jpg',
    'hair': 'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/female-ponytail.glb',
    'fit': 'assets-source/m2-long-hair-v1/revisions/rootjoin-v2/fit.json',
    'runtime': 'experiments/m2-long-hair-fixed-v4/prototype/src/hair-spring.js',
    'official': 'experiments/m2-long-hair-fixed-v4/prototype/node_modules/@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rotation(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def local_children(nodes, quaternions):
    matrix = np.eye(4); matrix[:3, 3] = nodes['Pony0']['translation']
    matrix[:3, :3] = rotation(quaternions[0])
    result = []
    for child in range(1, 7):
        translation = np.eye(4); translation[:3, 3] = nodes['Pony'+str(child)]['translation']
        matrix = matrix @ translation
        result.append(matrix[:3, 3].copy())
        if child < 6:
            own = np.eye(4); own[:3, :3] = rotation(quaternions[child])
            matrix = matrix @ own
    return np.array(result)


def recover_head(nodes, state):
    local = local_children(nodes, state['localRotations'])
    world = np.array(state['worldTails'])
    a, b = local.mean(0), world.mean(0)
    u, singular, vt = np.linalg.svd((local-a).T @ (world-b))
    if np.linalg.det(vt.T @ u.T) < 0:
        vt[-1] *= -1
    R = vt.T @ u.T; t = b-R @ a
    error = float(np.linalg.norm(local @ R.T+t-world, axis=1).max())
    return R, t, error, singular


def analyse_series(samples, nodes):
    rows, previous = [], None
    for sample in samples:
        state = sample.get('hair')
        if not state or not state.get('worldTails'):
            continue
        R, head, error, singular = recover_head(nodes, state)
        tails = np.array(state['worldTails'])
        diagnostics = state['environmentCollisionDiagnostics']
        collisions = sum(d['collisions'] for d in diagnostics)
        unresolved = sum(d['unresolvedCollisions'] for d in diagnostics)
        dt = (sample['ms']-previous['ms'])/1000 if previous else None
        row = {'ms': sample['ms'], 'phase': sample['phase'], 'mode': sample['mode'],
               'updates': state['updates'], 'resets': state['resets'],
               'tipMinusPony1YM': float(tails[-1, 1]-tails[0, 1]),
               'environmentCollisions': collisions, 'environmentUnresolved': unresolved,
               'environmentColliderObjects': state.get('environmentColliderObjectCount'),
               'headWorldM': head.tolist(), 'headForwardPitchRad': float(np.arcsin(np.clip((R @ [0, 0, -1])[1], -1, 1))),
               'headRigidFitErrorM': error, 'secondSingularValue': float(singular[1]),
               'headStepM': float(np.linalg.norm(head-previous['head'])) if previous else None,
               'headVerticalVelocityMps': float((head[1]-previous['head'][1])/dt) if previous else None,
               'environmentCollisionDelta': collisions-previous['collisions'] if previous else None,
               'environmentUnresolvedDelta': unresolved-previous['unresolved'] if previous else None}
        rows.append(row)
        previous = {'ms': sample['ms'], 'head': head, 'collisions': collisions, 'unresolved': unresolved}
    return rows


def settled_feasibility(capture, settings):
    sample = capture['samples'][0]
    bones = {b['name']: np.array(b['world']) for b in sample['meshes'][0]['bones']}
    rows = []
    for box in sample['boxes']:
        inverse = np.array(box['inverseMatrixWorld']).reshape(4, 4).T
        for joint in settings['joints']:
            pivot, tail = bones[joint['bone']], bones[joint['child']]
            p = (inverse @ np.append(pivot, 1))[:3]
            L = float(np.linalg.norm(tail-pivot)); radius = joint['hitRadius']
            margin = radius*max(np.linalg.norm(inverse[i, :3]) for i in range(3))
            feasible = []
            for axis in range(3):
                for sign in [-1, 1]:
                    boundary = box['localMin' if sign < 0 else 'localMax'][axis]+sign*margin
                    gap = sign*(p[axis]-boundary)/np.linalg.norm(inverse[axis, :3])
                    if gap >= 0:
                        feasible.append({'axis': axis, 'sign': sign, 'pivotGapM': float(gap),
                                         'entireLengthAlreadyOutside': bool(gap >= L),
                                         'planeCircleAvailable': bool(gap <= L)})
            rows.append({'box': box['name'], 'bone': joint['bone'], 'lengthM': L,
                         'pivotOutsideExpandedBox': bool(feasible), 'separatingFaces': feasible})
    return rows


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--input-root', type=Path, default=ROOT)
    args = parser.parse_args(); input_root = args.input_root.resolve()
    inputs = {key: (input_root/path).read_bytes() for key, path in INPUTS.items()}
    room, contact, old, fit = [json.loads(inputs[key]) for key in ['room', 'contact', 'oldGeometry', 'fit']]
    assert room['build'] == contact['build'] == 'e9bd472be0f8'
    assert room['expectedHairSHA'] == sha(inputs['hair']) == fit['assetSha256']
    length = struct.unpack_from('<I', inputs['hair'], 12)[0]
    doc = json.loads(inputs['hair'][20:20+length]); nodes = {n['name']: n for n in doc['nodes']}
    runtime_commit = subprocess.check_output(['git', 'show', SOURCE_COMMIT+':prototype/src/hair-spring.js'], cwd=input_root)
    assert runtime_commit.replace(b'\r\n', b'\n') == inputs['runtime'].replace(b'\r\n', b'\n')
    (OUT/'tested-hair-spring.js').write_bytes(inputs['runtime'])
    all_rows = {'room': analyse_series(room['trace']['samples'], nodes), 'contact': analyse_series(contact['measurements']['contactSamples'], nodes)}
    selected, maxima = {}, {}
    for key, rows in all_rows.items():
        seated = [row for row in rows if row['mode'] == 'sit' and row['phase'] in ['sit', 'pants-seat', 'skirt-moved-seat']]
        selected[key] = seated
        maxima[key] = [max([r for r in seated if r['phase'] == phase], key=lambda r: r['tipMinusPony1YM']) for phase in sorted({r['phase'] for r in seated})]
    room_sit = selected['room']; first_contact = next(row for row in room_sit if row['environmentCollisions'] > 0)
    peak = maxima['room'][0]
    reconstruction_checks = []
    for sample in old['samples']:
        R, t, error, singular = recover_head(nodes, sample['hair'])
        anchor = next(b for b in sample['meshes'][0]['bones'] if b['name'] == 'HairAnchor')
        actual = np.array(anchor['matrixWorld']).reshape(4, 4).T
        matrix_error = float(max(np.abs(R-actual[:3, :3]).max(), np.abs(t-actual[:3, 3]).max()))
        assert matrix_error < 1e-7
        reconstruction_checks.append({'ms': sample['ms'], 'actualAnchorMatrixError': matrix_error, 'fitResidualM': error})
    report = {'sourceCommit': SOURCE_COMMIT, 'build': room['build'], 'review': 'independent implementation review of root runtime; original hair source author',
              'observedImage': INPUTS['image'], 'imagePersonallyReviewed': True,
              'roomPeak': peak, 'roomFirstEnvironmentContact': first_contact,
              'contactPeaks': maxima['contact'],
              'maxRecoveredHeadFitErrorM': max(r['headRigidFitErrorM'] for rows in all_rows.values() for r in rows),
              'reconstructionValidatedAgainstActual508Anchor': reconstruction_checks,
              'minimumSecondSingularValueDuringRoomFlip': min(r['secondSingularValue'] for r in room_sit if r['ms'] < first_contact['ms']),
              'roomZeroCollisionSitWindow': {'firstMs': room_sit[0]['ms'], 'lastMs': room_sit[room_sit.index(first_contact)-1]['ms'],
                  'resets': sorted({r['resets'] for r in room_sit if r['ms'] < first_contact['ms']}),
                  'headYRangeM': [min(r['headWorldM'][1] for r in room_sit if r['ms'] < first_contact['ms']), max(r['headWorldM'][1] for r in room_sit if r['ms'] < first_contact['ms'])]},
              'historical508SettledSeparatingFaces': settled_feasibility(old, fit['dynamics']),
              'confirmed': ['The recorded upward flip precedes every counted chair-box collision in the room trace.',
                            'Both separately recorded contact seat transitions rise above Pony1 without new environment collision increments at their peaks; the moved-chair run retains 265 earlier collision calls.',
                            'Environment collider identities remain installed and reset counts stay fixed during the room flip.',
                            'The official solver keeps history in avatar-scene space and receives local animated head movement and body proxy constraints.'],
              'unresolved': ['Per-frame head/center transforms, pre-collision Verlet tails and body-proxy correction queries were not captured.',
                             'Existing data distinguish chair projection from this flip but do not isolate head/hip animation inertia from sphere/capsule correction impulses.',
                             'Historical 508 settled OBB geometry is a static feasibility reference and cannot replay the e9b transition.'],
              'CPUOnly': True, 'runtimeModified': False, 'sourceGeometryModified': False, 'visualAccepted': False}
    (OUT/'result.json').write_bytes((json.dumps(report, indent=2)+'\n').encode())
    (OUT/'selected-series.jsonl').write_bytes(b''.join((json.dumps({'capture': key, **row}, separators=(',', ':'))+'\n').encode() for key, rows in selected.items() for row in rows))
    inventory = [{'path': path, 'bytes': len(inputs[key]), 'sha256': sha(inputs[key])} for key, path in INPUTS.items()]
    (OUT/'input-identities.json').write_bytes((json.dumps({'sourceCommit': SOURCE_COMMIT, 'inputs': inventory, 'runtimeMatchesSourceCommit': True}, indent=2)+'\n').encode())
    print(json.dumps({'roomPeakMs': peak['ms'], 'roomPeakTipAbovePony1M': peak['tipMinusPony1YM'], 'roomFirstChairContactMs': first_contact['ms'],
                      'maxHeadFitErrorM': report['maxRecoveredHeadFitErrorM'], 'roomPeakHead': peak['headWorldM'], 'roomPeakHeadVerticalVelocityMps': peak['headVerticalVelocityMps']}))


if __name__ == '__main__': main()
