"""Fit an existing independent crew sock template to the native male reference pose."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_representative_batch_v2 import nearest_binding

loader = importlib.util.spec_from_file_location('native_source', ROOT / 'assets-source/native-male-crew-socks-fit-v1/build.py')
native = importlib.util.module_from_spec(loader)
loader.loader.exec_module(native)
crew, qa, GLB, require = native.crew, native.qa, native.GLB, native.require
from flow import Validator

BASE = 'assets-source/m2-socks-layer-v1/'
TARGET = 'assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json'
SOURCE = BASE + 'generated/male-entry.json'
TRACE = BASE + 'generated/build-report.json'
PREFLIGHT = 'assets-source/native-male-crew-socks-fit-v1/generated/preflight.json'
ID = 'native-7586-template-plain-crew-socks-v1'


def read(path):
    return json.loads((ROOT / path).read_bytes())


def normalize(values):
    lengths = np.linalg.norm(values, axis=-1, keepdims=True)
    require(lengths.min() > 1e-12, 'Zero-length direction')
    return values / lengths


def region(attrs, triangles, ankle, knee, sign):
    points = attrs['POSITION']
    y_limit = ankle[1] + (knee[1] - ankle[1]) / 2
    ids = np.flatnonzero((points[triangles, 0].mean(1) * sign > 0) & (points[triangles, 1].min(1) < y_limit))
    return ids, np.unique(triangles[ids])


def register(old, new, old_ids, new_ids, ankle0, ankle1):
    # The two exported editions use opposite facing conventions. Start with a
    # proper 180-degree yaw, then anchor local shape to matching Body atlas UVs.
    rotation = np.array([-1., 1., -1.])
    def align(x):
        return (x - ankle0) * rotation + ankle1
    uv_tree = cKDTree(new['TEXCOORD_0'][new_ids])
    anchors = {}
    for idx, matches in zip(old_ids, uv_tree.query_ball_point(old['TEXCOORD_0'][old_ids], 1e-7)):
        if not matches:
            continue
        ids = new_ids[matches]
        distance = np.linalg.norm(new['POSITION'][ids] - align(old['POSITION'][idx]), axis=1)
        j = ids[np.argmin(distance)]
        # Independently reject unrelated atlas material/side, opposing normals,
        # and two plausible vertices from spatially separate target charts.
        if distance.min() > .02 or np.dot(old['NORMAL'][idx] * rotation, new['NORMAL'][j]) < .8:
            continue
        if np.linalg.norm(new['POSITION'][ids] - new['POSITION'][j], axis=1).max() > .0005:
            continue
        key = tuple(old['POSITION'][idx])
        if key in anchors:
            require(np.linalg.norm(new['POSITION'][anchors[key][1]] - new['POSITION'][j]) < .0005, 'Conflicting atlas landmarks')
        else:
            anchors[key] = (int(idx), int(j))
    pairs = np.array(sorted(anchors.values()))
    require(len(pairs) >= 40, 'Insufficient common author atlas landmarks')
    base = align(old['POSITION'][pairs[:, 0]])
    target = new['POSITION'][pairs[:, 1]]
    # The regularizer uses source shell thickness squared in metre coordinates.
    field = RBFInterpolator(base, target - base, kernel='thin_plate_spline', smoothing=.0005**2)
    return lambda x: align(x) + field(align(x)), pairs


def garment_part(template, trace, authored, target, side, source_bones, target_bones, skin, draft):
    old, old_faces = authored
    new, new_faces = target
    ankle0, ankle1 = source_bones[side+'Foot'], target_bones[side+'Foot']
    _, old_ids = region(old, old_faces, ankle0, source_bones[side+'LowerLeg'], np.sign(ankle0[0]))
    face_ids, new_ids = region(new, new_faces, ankle1, target_bones[side+'LowerLeg'], np.sign(ankle1[0]))
    deform, landmarks = register(old, new, old_ids, new_ids, ankle0, ankle1)
    p, faces = template
    n, m = trace['surfaceVertices'], trace['surfaceTriangles']
    require(len(p) == n*2 and faces[:m].max() < n, 'Template sheet layout changed')
    # Derive its original contact surface and two thickness layers from the
    # actual paired vertices of the independent garment, retaining its topology.
    diff = p[:n] - p[n:]
    require(np.allclose(np.linalg.norm(diff, axis=1), draft['thicknessM'], atol=1e-7), 'Template thickness does not match original recipe')
    source_contact = p[:n] - diff * draft['outerOffsetM'] / draft['thicknessM']
    predicted = deform(source_contact)
    selected, bary, contact, _, d2 = nearest_binding(predicted, new['POSITION'], new_faces[face_ids])
    idx = new_faces[face_ids[selected]]
    normal = normalize(np.einsum('ni,nij->nj', bary, new['NORMAL'][idx]))
    require(np.min(np.sum(normal * normalize(diff) * [-1,1,-1], axis=1)) > 0, 'Target fold or wrong-facing projection')
    dense = np.zeros((n, len(skin['joints'])))
    for corner in range(3):
        for channel in range(4):
            np.add.at(dense, (np.arange(n), new['JOINTS_0'][idx[:,corner],channel]),
                      bary[:,corner] * new['WEIGHTS_0'][idx[:,corner],channel])
    joints = np.argsort(-dense, axis=1, kind='stable')[:,:4]
    w = np.take_along_axis(dense, joints, axis=1)
    require(np.max(abs(w.sum(1)-1)) < 1e-6, 'Lossy target binding')
    w /= w.sum(1)[:,None]
    return {'faces': faces, 'sheet': faces[:m], 'contact': contact, 'normals': normal, 'weights': w,
            'joints': joints, 'bodyFaceIds': face_ids, 'binding': {'side': side, 'templateVertices': n,
                'atlasAnchorPairs': landmarks.tolist(), 'targetFaceOfEachPatternVertex': face_ids[selected].tolist(),
                'barycentricOfEachPatternVertex': bary.tolist(), 'registrationProjectionMaxM': float(np.sqrt(d2.max()))}}


def build_shell(part, spec, ease):
    offsets = ease[:,None] + spec['outerOffsetM']
    p, normal = part['contact'], part['normals']
    vertices = np.vstack([p + offsets * normal, p + (offsets - spec['thicknessM']) * normal]).astype('<f4')
    faces = part['faces']
    edges, components = crew.topology(vertices, faces)
    require(components == 1 and all(len(uses) == 2 for uses in edges.values()), 'Template shell is not a closed manifold')
    return {'POSITION': vertices, 'NORMAL': crew.normals(vertices.astype(float), faces).astype('<f4'),
            'JOINTS_0': np.tile(part['joints'], (2,1)), 'WEIGHTS_0': np.tile(part['weights'], (2,1)).astype('<f4')}, faces


def load_context():
    spec = read(BASE + 'spec.json')
    original = read(SOURCE)
    path = ROOT / SOURCE
    template_path = path.parent / original['url']
    require(crew.sha(template_path) == original['sha256'], 'Template identity changed')
    t = GLB(template_path.read_bytes())
    bits = [(np.array(t.accessor(prim['attributes']['POSITION'])), np.array(t.accessor(prim['indices']),int).reshape(-1,3))
            for prim in t.doc['meshes'][0]['primitives']]
    old_g, old, old_faces, *_ = crew.source(spec['bodies']['male'])
    old_bones = crew.bone_positions(old_g.doc)
    body = read(TARGET)['avatar']
    g, new, new_faces, skin, mi, pi = crew.source(body)
    world = native.world_transforms(g.doc)
    humans = {name: row['node'] for name, row in g.doc['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    target_bones = {name: world(i)[:3,3] for name,i in humans.items()}
    pre = read(PREFLIGHT)
    require(pre['body'] == body, 'Calibration target changed')
    trace = next(r['trace'] for r in read(TRACE)['bodies'] if r['bodyType'] == 'male')
    parts = [garment_part(bit, row, (old,old_faces), (new,new_faces), row['side'], old_bones,
                         target_bones, skin, spec) for bit, row in zip(bits,trace['sides'])]
    for part in parts:
        side = part['binding']['side']
        used = set(part['joints'][part['weights'] > 0].tolist())
        expected = {skin['joints'].index(humans[side+key]) for key in ['LowerLeg','Foot','Toes']}
        require(used == expected, 'Garment skin crosses anatomical target or misses a required joint')
    view = copy.copy(g)
    view.doc = dict(g.doc, extensions=dict(g.doc['extensions'], VRM={'humanoid': {'humanBones': [
        {'bone': key, 'node': i} for key,i in humans.items()]}}))
    return spec, original, body, g, view, new, new_faces, skin, parts, pre


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--first-export', action='store_true', help='Reproduce the recorded uncorrected template export')
    args = parser.parse_args()
    spec, template, body, g, view, new, tris, skin, parts, pre = load_context()
    out = HERE / ('first-export' if args.first_export else 'corrected')
    out.mkdir(exist_ok=True)
    assembled = []
    for part in parts:
        ease = np.zeros(len(part['contact']))
        if not args.first_export:
            from clearance import required_ease
            ease, measurement = required_ease(part, new['POSITION'], tris, spec)
            part['binding']['localClearanceCorrection'] = measurement
        assembled.append(build_shell(part, spec, ease))
    data, bindings = crew.export(view, skin, assembled, ID, spec['color'])
    target = out / (ID + '.glb')
    target.write_bytes(data)
    if not args.first_export and not (HERE/'editable.obj').exists():
        from pattern import write_obj
        write_obj(HERE/'editable.obj', assembled)
    pairing_status = {'bottom': 'offline-candidate', 'shoes': 'known-visible-sock-over-shoe-pixels; candidate-only',
                      'runtimeAccepted': False}
    entry = {'id': ID, 'name': 'Plain crew socks', 'slot': 'socks', 'version': 1, 'styleId': spec['styleId'],
             'fitId': ID + '-fit', 'url': target.name, 'sha256': crew.sha(target), 'bytes': len(data),
             'compatibleAvatarSha256': body['sha256'], 'preserveOriginalBody': True, 'requiresRawSkeleton': True,
             'bindings': bindings, 'restMatrix': np.eye(4).ravel().tolist(), 'sourceLicense': pre['sourceLicense'],
             'pairingStatus': pairing_status,
             'pairedWith': {key: [{k: pre['pairing'][slot][k] for k in ('id','sha256')}] for key,slot in [('shoes','shoes'),('lower','bottom')]}}
    crew.write(out / 'entry.json', entry)
    bound = Validator(ROOT).equipment(entry, body['sha256'], g, (out / 'entry.json').relative_to(ROOT).as_posix())
    qa_rows = []
    for part, (mesh, faces) in zip(parts, assembled):
        positions = mesh['POSITION'].astype(float)
        contacts = {}
        for key, (q, f) in {'self': (positions,faces), 'body': (new['POSITION'], tris[part['bodyFaceIds']]),
                              **{slot: qa.arrays(GLB((ROOT / row['path']).read_bytes())) for slot,row in pre['pairing'].items()}}.items():
            pairs = qa.intersections(positions, faces, q, f, key == 'self')
            contacts[key] = {'trianglePairs': len(pairs), 'firstPairs': pairs[:8]}
        qa_rows.append({'side': part['binding']['side'], 'contacts': contacts, 'sheetProjectionMaxM': part['binding']['registrationProjectionMaxM']})
    crew.write(out / 'binding.json', {'templateSha256': template['sha256'], 'targetSha256': body['sha256'],
               'material': spec['color'], 'perSide': [p['binding'] for p in parts]})
    crew.write(out / 'qa.json', {'targetBinding': bound, 'restPose': qa_rows, 'runtimeAccepted': False})
    crew.write(out / 'fit.json', {'schema': 'zbgs-socks-layer-fit-v1', 'id': entry['fitId'], 'version': 1, 'styleId': spec['styleId'],
               'garmentId': ID, 'garmentSha256': entry['sha256'], 'baseAvatarSha256': body['sha256'], 'slot': 'socks', 'sourceBodyPath': body['path'],
               'preserveOriginalBody': True, 'sourceTemplate': template['sha256'], 'physics': 'skinning-only', 'bodyCoverageMasks': [],
               'outerOffsetM': spec['outerOffsetM'], 'thicknessM': spec['thicknessM'], 'pairingCandidates': list(pre['pairing'].values()),
               'pairingStatus': pairing_status, 'sourceLicense': pre['sourceLicense'], 'runtimeAccepted': False})
    print(json.dumps(qa_rows))


if __name__ == '__main__':
    main()
