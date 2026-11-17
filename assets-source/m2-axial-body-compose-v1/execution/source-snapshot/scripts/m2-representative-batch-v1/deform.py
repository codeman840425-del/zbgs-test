"""Common metre-space regional volume/face field and lossless GLB container update."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys

import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def numeric(values):
    return sha(np.asarray(values).tobytes())


def smooth(value):
    value = np.clip(value, 0, 1)
    return value*value*(3-2*value)


def bump(value):
    return np.maximum(0, 1-value*value)**2


def source_context(g):
    d = g.doc; skin = d['skins'][0]
    matrices = np.array(g.accessor(skin['inverseBindMatrices'])).reshape(-1, 4, 4)
    require(np.max(abs(matrices[:, :3, :3]-np.eye(3))) < 1e-7, 'Only reviewed translation rest binds supported')
    human = {row['bone']: row['node'] for row in d['extensions']['VRM']['humanoid']['humanBones']}
    joints = {name: -matrices[skin['joints'].index(node), 3, :3].astype(float) for name, node in human.items() if node in skin['joints']}
    mouth = next(p for m in d['meshes'] for p in m['primitives'] if 'FaceMouth' in d['materials'][p['material']]['name'])
    P = np.array(g.accessor(mouth['attributes']['POSITION']))[np.unique(g.accessor(mouth['indices']))]
    eyes = [np.array(g.accessor(p['attributes']['POSITION']))[np.unique(g.accessor(p['indices']))] for m in d['meshes'] for p in m['primitives'] if '_EYE' in d['materials'][p['material']]['name'] or 'FaceEyeline' in d['materials'][p['material']]['name']]
    E = np.vstack(eyes)
    return {'joints': joints, 'mouthMin': P.min(0), 'mouthMax': P.max(0), 'eyeMin': E.min(0), 'eyeMax': E.max(0)}


def field(points, parameters, context):
    P = np.asarray(points, float); p = parameters; j = context['joints']; H = j['head']
    x, y, z = (P-H).T
    # Lower front tissue. Eye/lip envelopes and source semantic tags protect features.
    front = smooth((-z-.025)/.04); lower = 1-smooth((y-.015)/.045)
    face_low = smooth((y+.095)/.05)
    face_width = 1-smooth((abs(x)-.11)/.025)
    mouth = context['mouthMin']-H, context['mouthMax']-H
    mouth_x = max(abs(mouth[0][0]), abs(mouth[1][0]))+.004
    lip = (1-smooth((abs(x)-mouth_x)/.025))*smooth((y-mouth[0][1]+.012)/.008)*(1-smooth((y-mouth[1][1]-.004)/.008))
    eye_start = context['eyeMin'][1]-H[1]-.006
    eye = smooth((y-eye_start)/.006)
    mask = front*lower*face_low*face_width*(1-eye)
    jaw = 1-smooth((y+.005)/.045)
    cheek = bump((y-.005)/.045)
    chin = (1-smooth((y-mouth[0][1]+.016)/.020))*np.exp(-(x/.04)**4)*front*face_low*face_width*(1-lip)
    D = np.zeros_like(P)
    # Integrate the lip transition instead of multiplying a shrinking x by a
    # narrow mask. This coordinate has derivative in [0,1] at the fixed lip edge.
    u = np.maximum(abs(x)-mouth_x, 0); t = np.clip(u/.02, 0, 1)
    lateral_coordinate = np.sign(x)*np.where(u < .02, .02*(t**3-.5*t**4), u-.01)
    D[:, 0] = lateral_coordinate*(p['jawWidth']*jaw+p['cheekWidth']*cheek)*mask
    D[:, 1] = -p['chinLengthM']*chin
    D[:, 2] = -p['chinProjectionM']*chin
    # Torso volumes taper before the wrist and neck. Joint positions never move.
    cx = j['hips'][0]; dx = P[:, 0]-cx
    hand_limit = min(abs(j['leftHand'][0]-cx)-.08, abs(j['leftLowerArm'][0]-cx)+.10)
    lateral = 1-smooth((abs(dx)-.12)/max(.08, hand_limit-.12))
    upper = 1-smooth((P[:, 1]-(j['neck'][1]-.07))/.06)
    low = smooth((P[:, 1]-j['leftLowerLeg'][1]-.02)/.12)
    body_mask = lateral*upper*low
    torso = [('waist', (j['hips'][1]+j['chest'][1])/2, .16), ('hip', j['hips'][1]-.035, .17), ('chest', j['chest'][1], .20)]
    for name, height, half_height in torso:
        weight = bump((P[:, 1]-height)/half_height)*body_mask
        cz = np.interp(P[:, 1], [j['hips'][1], j['chest'][1]], [j['hips'][2], j['chest'][2]])
        D[:, 0] += dx*p[name+'Width']*weight
        D[:, 2] += (P[:, 2]-cz)*p[name+'Depth']*weight
    # Radial mass around the actual upper-arm and thigh axes, with endpoint taper.
    for side in ['left', 'right']:
        for first, second, parameter in [('UpperArm', 'LowerArm', 'upperArmRadius'), ('UpperLeg', 'LowerLeg', 'thighRadius')]:
            A, B = j[side+first], j[side+second]; axis = B-A
            t = (P-A) @ axis/np.dot(axis, axis)
            radial = P-(A+np.clip(t, 0, 1)[:, None]*axis)
            radius_limit = .095 if first == 'UpperArm' else .15
            weight = smooth(t/.15)*(1-smooth((t-.78)/.22))*bump(np.linalg.norm(radial, axis=1)/radius_limit)*upper
            D += radial*(p[parameter]*weight)[:, None]
        center = j[side+'UpperArm']; offset = P-center
        weight = bump(np.linalg.norm(offset, axis=1)/.115)*upper
        D += offset*(p['shoulderMass']*weight)[:, None]
    return P+D


def jacobian(P, parameters, context, protected):
    columns = []
    for axis in range(3):
        delta = np.zeros(3); delta[axis] = 1e-5
        columns.append((field(P+delta, parameters, context)-field(P-delta, parameters, context))/2e-5)
    result = np.stack(columns, axis=2); result[protected] = np.eye(3)
    return result


def normal_map(N, J):
    result = np.array(N, float)
    changed = np.max(abs(J-np.eye(3)), axis=(1, 2)) > 1e-6
    if changed.any():
        transformed = np.linalg.solve(J[changed].transpose(0, 2, 1), result[changed, :, None])[:, :, 0]
        transformed *= (np.linalg.norm(result[changed], axis=1)/np.maximum(np.linalg.norm(transformed, axis=1), 1e-12))[:, None]
        result[changed] = transformed
    return result


def image_rows(g):
    rows = []
    for image in g.doc.get('images', []):
        require('bufferView' in image, 'External images are outside this exact-source producer')
        v = g.doc['bufferViews'][image['bufferView']]; raw = g.binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']]
        rows.append({'sha256': sha(raw), 'bytes': len(raw), 'mimeType': image.get('mimeType')})
    return rows


def protect(g, primitives, context, P):
    protected = np.zeros(len(P), bool)
    for primitive in primitives:
        name = g.doc['materials'][primitive['material']]['name']
        if any(token in name for token in ['HAIR', '_EYE', 'FaceMouth', 'Eyeline', 'Eyelash', 'FaceBrow']):
            protected[np.unique(g.accessor(primitive['indices']))] = True
    # External lips use the skin material, so include their measured local envelope.
    H = context['joints']['head']; x, y, z = (P-H).T
    lo, hi = context['mouthMin']-H, context['mouthMax']-H
    protected |= (abs(x) < max(abs(lo[0]), abs(hi[0]))+.004)&(y > lo[1]-.004)&(y < hi[1]+.004)&(z < -.04)
    return protected


def rewrite(raw, parameters, context, identifier, full_avatar=False):
    g = GLB(raw); doc = copy.deepcopy(g.doc); blob = bytearray(g.binary); traces = []; groups = {}
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            require(not primitive.get('mode', 4) != 4 and 'TANGENT' not in primitive['attributes'], 'Unsupported primitive/tangent structure')
            groups.setdefault((primitive['attributes']['POSITION'], primitive['attributes']['NORMAL']), []).append(primitive)
    def write(index, values, kind=None):
        values = np.asarray(values, dtype='<f4'); blob.extend(b'\0'*(-len(blob) % 4))
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes}); blob.extend(values.tobytes())
        row = copy.deepcopy(doc['accessors'][index]); row.update(bufferView=len(doc['bufferViews'])-1, byteOffset=0, componentType=5126)
        if kind: row['type'] = kind
        if row['type'] == 'VEC3': row.update(min=values.min(0).tolist(), max=values.max(0).tolist())
        doc['accessors'].append(row); return len(doc['accessors'])-1
    any_changed = False
    for (position_index, normal_index), primitives in groups.items():
        P, N = [np.array(g.accessor(i), float) for i in [position_index, normal_index]]
        protected = protect(g, primitives, context, P) if full_avatar else np.zeros(len(P), bool)
        mapped = field(P, parameters, context); mapped[protected] = P[protected]
        changed = np.linalg.norm(mapped-P, axis=1) > 1e-10; any_changed |= bool(changed.any())
        J = jacobian(P, parameters, context, protected); determinant = np.linalg.det(J)
        require(np.isfinite(mapped).all() and determinant.min() > .12, 'Common field local Jacobian is folded/too small: '+str(float(determinant.min())))
        normals = normal_map(N, J)
        position_new = write(position_index, mapped) if changed.any() else position_index
        normal_new = write(normal_index, normals) if np.max(abs(normals-N)) > 1e-8 else normal_index
        targets = primitives[0].get('targets', [])
        require(all(p.get('targets', []) == targets for p in primitives), 'Shared accessor has inconsistent morph targets')
        target_updates = []; max_endpoint_error = 0.; added_normal_targets = 0; zero_normal = None
        for target in targets:
            D = np.array(g.accessor(target['POSITION']), float); E = P+D
            endpoint = field(E, parameters, context); endpoint[protected] = E[protected]
            delta = D.copy(); affected = changed | (np.linalg.norm(endpoint-E, axis=1) > 1e-10)
            delta[affected] = endpoint[affected]-mapped[affected]
            replacement = copy.deepcopy(target)
            if not np.array_equal(delta.astype('<f4'), D.astype('<f4')): replacement['POSITION'] = write(target['POSITION'], delta)
            Je = jacobian(E, parameters, context, protected)
            source_normal_delta = np.array(g.accessor(target['NORMAL']), float) if 'NORMAL' in target else np.zeros_like(N)
            end_normals = normal_map(N+source_normal_delta, Je); normal_delta = end_normals-normals
            normal_delta[protected] = source_normal_delta[protected]
            if np.max(abs(normal_delta-source_normal_delta)) > 1e-8:
                replacement['NORMAL'] = write(target.get('NORMAL', normal_index), normal_delta, 'VEC3'); added_normal_targets += int('NORMAL' not in target)
            elif 'NORMAL' not in target and changed.any():
                if zero_normal is None: zero_normal = write(normal_index, np.zeros_like(N), 'VEC3')
                replacement['NORMAL'] = zero_normal; added_normal_targets += 1
            error = np.linalg.norm(mapped.astype('<f4').astype(float)+delta.astype('<f4')-endpoint, axis=1).max()
            max_endpoint_error = max(max_endpoint_error, float(error)); target_updates.append(replacement)
        for primitive in primitives:
            primitive['attributes'].update(POSITION=position_new, NORMAL=normal_new)
            if targets: primitive['targets'] = copy.deepcopy(target_updates)
        traces.append({'sourcePositionAccessor': position_index, 'sourceNormalAccessor': normal_index, 'vertices': len(P),
            'changedVertices': int(changed.sum()), 'maxDisplacementM': float(np.linalg.norm(mapped-P, axis=1).max()),
            'minimumJacobianDeterminant': float(determinant.min()), 'protectedVertices': int(protected.sum()), 'protectedMaxDisplacementM': 0.,
            'sourcePositionSha256': numeric(P.astype('<f4')), 'positionSha256': numeric(mapped.astype('<f4')),
            'morphTargets': len(targets), 'addedMorphNormalTargets': added_normal_targets, 'morphEndpointMaxErrorM': max_endpoint_error})
    if not any_changed:
        return raw, {'groups': traces, 'geometryUnchanged': True, 'images': image_rows(g)}
    doc['asset']['generator'] = 'm2-representative-batch-v1 common regional field'
    if full_avatar: doc['extensions']['VRM']['meta']['title'] = identifier
    doc['buffers'][0]['byteLength'] = len(blob)
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); text += b' '*(-len(text) % 4); blob.extend(b'\0'*(-len(blob) % 4))
    result = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    derived = GLB(result)
    require(image_rows(derived) == image_rows(g) and derived.doc['nodes'] == g.doc['nodes'] and derived.doc['skins'] == g.doc['skins'], 'Source image/skeleton identity changed')
    return result, {'groups': traces, 'geometryUnchanged': False, 'images': image_rows(g)}
