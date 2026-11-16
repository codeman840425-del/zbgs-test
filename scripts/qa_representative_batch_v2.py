"""Independent v2 source geometry checks, called only with explicit revision 2."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy.interpolate import BSpline, PchipInterpolator

_BINDINGS = {}


def primitive(model, token):
    return next(p for m in model.doc['meshes'] for p in m['primitives']
                if token in model.doc['materials'][p['material']]['name'])


def positions(model, p):
    return model.acc(p['attributes']['POSITION']).astype(float)


def triangles(model, p):
    return model.acc(p['indices']).astype(int).reshape(-1, 3)


def sections(points, faces, levels):
    """Intersect actual triangles with horizontal planes, using front face only."""
    mesh = points[faces]
    widths = []
    for y in levels:
        selected = mesh[(mesh[:, :, 1].min(1) <= y) & (mesh[:, :, 1].max(1) >= y)]
        intersections = []
        for i, j in ((0, 1), (1, 2), (2, 0)):
            a, b = selected[:, i], selected[:, j]
            dy = b[:, 1] - a[:, 1]
            valid = abs(dy) > 1e-12
            fraction = np.divide(y - a[:, 1], dy, out=np.full(len(dy), np.inf), where=valid)
            q = a + np.where(valid, fraction, 0)[:, None] * (b - a)
            keep = valid & (fraction >= 0) & (fraction <= 1) & (q[:, 2] < -.025)
            intersections.extend(q[keep, 0])
        widths.append(float(np.ptp(intersections) / 2) if len(intersections) else None)
    return widths


def nearest_binding(points, body, faces):
    """Euclidean closest points on all original triangles, no producer mapping import."""
    cache_key = hashlib.sha256(points.tobytes() + body.tobytes() + faces.tobytes()).hexdigest()
    if cache_key in _BINDINGS:
        return _BINDINGS[cache_key]
    best = np.full(len(points), np.inf)
    chosen = np.zeros(len(points), int)
    weights = np.zeros((len(points), 3))
    projection = np.zeros((len(points), 3, 3))
    for index, tri in enumerate(body[faces]):
        origin, second, third = tri
        u, v = second - origin, third - origin
        cross = np.cross(u, v)
        area_squared = cross @ cross
        if area_squared < 1e-20:
            continue
        relative = points - origin
        # Solve the 2x2 Gram system explicitly, independently of exporter code.
        uu, vv, uv = u @ u, v @ v, u @ v
        rhs_u, rhs_v = relative @ u, relative @ v
        b = (rhs_u * vv - rhs_v * uv) / area_squared
        c = (rhs_v * uu - rhs_u * uv) / area_squared
        bary = np.column_stack((1 - b - c, b, c))
        q = bary @ tri
        distances = ((points - q) ** 2).sum(1)
        distances[(bary < 0).any(1)] = np.inf
        candidates = [(distances, bary, np.eye(3) - np.outer(cross, cross) / area_squared)]
        for first, last in ((0, 1), (1, 2), (2, 0)):
            edge = tri[last] - tri[first]
            length_squared = edge @ edge
            if length_squared < 1e-20:
                continue
            t = np.clip((points - tri[first]) @ edge / length_squared, 0, 1)
            q = tri[first] + t[:, None] * edge
            bary = np.zeros((len(points), 3))
            bary[:, first], bary[:, last] = 1 - t, t
            derivatives = np.broadcast_to(np.outer(edge, edge) / length_squared, (len(points), 3, 3)).copy()
            derivatives[(t == 0) | (t == 1)] = 0
            candidates.append((((points - q) ** 2).sum(1), bary, derivatives))
        for distances, bary, derivative in candidates:
            select = distances < best
            best[select], chosen[select], weights[select] = distances[select], index, bary[select]
            projection[select] = derivative if derivative.ndim == 2 else derivative[select]
    donor = body[faces[chosen]]
    anchor = np.einsum('ni,nij->nj', weights, donor)
    edges = np.stack((donor[:, 1] - donor[:, 0], donor[:, 2] - donor[:, 0]), axis=2)
    inverse = np.linalg.solve(edges.transpose(0, 2, 1) @ edges, edges.transpose(0, 2, 1))
    result = (chosen, weights, anchor, inverse @ projection, best)
    _BINDINGS[cache_key] = result
    return result


def normal_map(normal, jacobian):
    result = np.linalg.solve(jacobian.transpose(0, 2, 1), normal[..., None])[..., 0]
    return result * (np.linalg.norm(normal, axis=1) / np.maximum(np.linalg.norm(result, axis=1), 1e-12))[:, None]


def transfer_check(audit, source, target, old_body, new_body, body_faces, label, precise_donor=None):
    """Use actual avatar donor deltas, retaining source offset as a metre vector."""
    records = []
    seen = set()
    for old_mesh, new_mesh in zip(source.doc['meshes'], target.doc['meshes']):
        for old, new in zip(old_mesh['primitives'], new_mesh['primitives']):
            pair = (old['attributes']['POSITION'], old['attributes']['NORMAL'])
            if pair in seen:
                continue
            seen.add(pair)
            points, actual = positions(source, old), positions(target, new)
            chosen, bary, anchor, derivative, distance = nearest_binding(points, old_body, body_faces)
            delta = (new_body - old_body)[body_faces[chosen]]
            moved = np.einsum('ni,nij->nj', bary, delta)
            error = np.linalg.norm(actual - points - moved, axis=1)
            offset_error = np.linalg.norm((actual - anchor - moved) - (points - anchor), axis=1)
            normal_delta = precise_donor[body_faces[chosen]] if precise_donor is not None else delta
            edges = np.stack((normal_delta[:, 1] - normal_delta[:, 0], normal_delta[:, 2] - normal_delta[:, 0]), axis=2)
            jacobian = np.eye(3) + edges @ derivative
            normals = normal_map(source.acc(old['attributes']['NORMAL']).astype(float), jacobian)
            normal_error = np.linalg.norm(target.acc(new['attributes']['NORMAL']).astype(float) - normals, axis=1)
            used = np.unique(source.acc(old['indices']))
            prefix = label + '/' + str(pair[0])
            # Float32 export rounding is bounded at submicrometre metre coordinates.
            audit.check('v2-nearest-body-displacement-' + prefix, error[used].max() < 3e-7, float(error[used].max()))
            audit.check('v2-source-offset-vector-preserved-' + prefix, offset_error[used].max() < 3e-7, float(offset_error[used].max()))
            audit.check('v2-transferred-inverse-transpose-normals-' + prefix, normal_error[used].max() < 2e-5, float(normal_error[used].max()))
            records.append({'positionAccessor': pair[0], 'vertices': len(points), 'usedVertices': len(used),
                            'changedVertices': int(np.count_nonzero(np.linalg.norm(actual[used] - points[used], axis=1) > 1e-7)),
                            'maximumDisplacementErrorM': float(error[used].max()), 'maximumOffsetErrorM': float(offset_error[used].max()),
                            'maximumNormalError': float(normal_error[used].max()), 'maximumSourceOffsetM': float(np.sqrt(distance).max()),
                            'minimumBarycentric': float(bary.min()), 'maximumBarycentricSumError': float(abs(bary.sum(1) - 1).max())})
    return records


def verify_variant(audit, entry, old, new, equipment, fit, profile, report, spec):
    identifier = entry['id']
    base = identifier.removesuffix('-v2')
    audit.check('v2-base-preset-id-' + identifier, entry.get('basePresetId') == base)
    old_spec = json.loads(audit.read('assets-source/m2-representative-batch-v1/spec.json'))
    prior = next(v for v in old_spec['variants'] if v['id'] == base)
    audit.check('v2-original-numeric-parameters-' + identifier, entry['parameters'] == prior['parameters'])
    audit.check('v2-partial-face-realization-declared-' + identifier,
                entry.get('parameterRealization') == 'partial-constrained-face-projection'
                and fit.get('parameterRealization') == 'partial-constrained-face-projection'
                and report.get('faceCurve', {}).get('intentStatus') == 'partial-constrained-projection')
    audit.check('v2-new-profile-and-bodytype-' + identifier,
                profile.get('bodyType') == identifier and '-v2' in profile.get('id', '') and '/m2-representative-batch-v2/' in profile.get('url', '')
                and '/m2-representative-batch-v2/' in profile.get('manifestUrl', ''))
    audit.check('v2-contact-dependencies-pending-' + identifier,
                all(fit.get('dependencies', {}).get(key) is None for key in ('forearmCollision', 'handContact', 'seatContact')))
    items = equipment['items']
    audit.check('v2-new-equipment-identities-' + identifier,
                all(i['id'] == identifier + '-' + i['slot'] and i['url'] == i['id'] + '.glb' for i in items))
    p = primitive(old, 'Body_00_SKIN')
    q = primitive(new, 'Body_00_SKIN')
    old_body, new_body, body_faces = positions(old, p), positions(new, q), triangles(old, p)
    independent = IndependentField(audit, old, entry['parameters'], report['faceCurve'])
    morphs = independent.verify(audit, old, new, identifier)
    precise_donor = independent.field(old_body) - old_body
    transfers = []
    directory = audit.resolve(entry['equipmentManifest']['path']).parent
    expected_files = {'avatar.vrm', 'profile.json', 'equipment.json', 'fit.json', 'build-report.json'} | {identifier + '-' + slot + '.glb' for slot in ('top', 'bottom', 'shoes')}
    audit.check('v2-exact-eight-output-files-' + identifier, {f.name for f in directory.iterdir() if f.is_file()} == expected_files)
    for item in items:
        original = next(g for g in spec['sources'][entry['sex']]['equipment'] if g['slot'] == item['slot'])
        source = audit.glb(audit.resolve(original['path']))
        target = audit.glb(directory / Path(item['url']).name)
        transfers.append({'slot': item['slot'], 'groups': transfer_check(audit, source, target, old_body, new_body, body_faces, item['id'], precise_donor)})
    audit.check('v2-three-garments-real-changes-' + identifier,
                all(any(group['changedVertices'] > 0 for group in row['groups']) for row in transfers if row['slot'] in ('top', 'bottom')))
    actual_floor = min(float(positions(new, p)[np.unique(new.acc(p['indices'])), 1].min()) for m in new.doc['meshes'] for p in m['primitives'])
    shoe_item = next(i for i in items if i['slot'] == 'shoes')
    shoe = audit.glb(directory / Path(shoe_item['url']).name)
    shoe_floor = min(float(positions(shoe, p)[np.unique(shoe.acc(p['indices'])), 1].min()) for m in shoe.doc['meshes'] for p in m['primitives'])
    audit.check('v2-actual-floor-readback-' + identifier, abs(profile['sourceFloorY'] - min(actual_floor, shoe_floor)) < 1e-9)
    curve = report['faceCurve']
    y, source, requested, actual = [np.asarray(curve[key], float) for key in
        ('sourceYMetres', 'sourceHalfWidthsM', 'requestedHalfWidthsM', 'actualHalfWidthsM')]
    audit.check('v2-face-101-finite-sections-' + identifier,
                all(a.shape == (101,) and np.isfinite(a).all() for a in (y, source, requested, actual)) and (np.diff(y) > 0).all())
    old_head = next(row['node'] for row in old.doc['extensions']['VRM']['humanoid']['humanBones'] if row['bone'] == 'head')
    # The original source uses translation-only rest binds, verified by the producer contract.
    matrices = audit.bones(old)
    head_name = old.doc['nodes'][old_head]['name']
    head = -matrices[head_name].reshape(4, 4)[3, :3].astype(float)
    face_p, face_q = primitive(old, 'Face_00_SKIN'), primitive(new, 'Face_00_SKIN')
    source_width = sections(positions(old, face_p) - head, triangles(old, face_p), y)
    face_points = positions(new, face_q) - head
    face_faces = triangles(new, face_q)
    mesh_y = np.linspace(face_points[np.unique(face_faces), 1].min() + 1e-5, y[-1], 101)
    mesh_width = sections(face_points, face_faces, mesh_y)
    audit.check('v2-face-source-width-readback-' + identifier, np.max(abs(np.asarray(source_width) - source)) < 1e-9)
    smooth = lambda v: np.clip(v, 0, 1) ** 2 * (3 - 2 * np.clip(v, 0, 1))
    requested_expected = source * (1 + entry['parameters']['jawWidth'] * (1 - smooth((y + .005) / .045))
                                   + entry['parameters']['cheekWidth'] * np.maximum(0, 1 - ((y - .005) / .045) ** 2) ** 2)
    audit.check('v2-face-request-preserves-parameters-' + identifier, np.max(abs(requested_expected - requested)) < 1e-10)
    projection_error = float(abs(actual - requested).max())
    audit.check('v2-face-projection-error-reported-' + identifier,
                abs(curve.get('maximumProjectionDifferenceM', -1) - projection_error) < 1e-10)
    # Reconstruct the declared 12-control cubic curve from 101 values, then check
    # all knot boundaries. Its second derivative is linear inside each knot span.
    knots = np.r_[np.zeros(4), np.linspace(0, 1, 10)[1:-1], np.ones(4)]
    t = (y - y[0]) / (y[-1] - y[0])
    basis = BSpline(knots, np.eye(12), 3)
    coefficients = np.linalg.lstsq(basis(t), actual, rcond=None)[0]
    spline = BSpline(knots, coefficients, 3)
    test = np.unique(knots)
    curve_error = float(abs(spline(t) - actual).max())
    audit.check('v2-face-declared-cubic-reconstruction-' + identifier, curve_error < 1e-10, curve_error)
    audit.check('v2-face-continuous-monotone-concave-' + identifier,
                spline(test, 1).min() >= -1e-9 and spline(test, 2).max() <= 1e-8,
                {'minimumFirstDerivative': float(spline(test, 1).min()), 'maximumSecondDerivative': float(spline(test, 2).max())})
    source_slope = PchipInterpolator(y, source)(y[-1], 1)
    audit.check('v2-face-upper-value-slope-' + identifier,
                abs(actual[-1] - source[-1]) < 1e-8 and abs(spline(1, 1) / (y[-1] - y[0]) - source_slope) < 1e-6)
    mesh_width = np.asarray(mesh_width, float)
    finite = np.isfinite(mesh_width)
    audit.check('v2-exported-face-101-finite-' + identifier, finite.all())
    # This explicit geometry criterion catches the previously diagnosed inward turn.
    # Keep every measured reversal as a failure, independent of the curve solver.
    differences = np.diff(mesh_width)
    audit.check('v2-exported-face-monotone-' + identifier, finite.all() and differences.min() >= -1e-6,
                {'minimumHalfWidthStepM': float(differences.min()), 'sourceMinimumStepM': float(np.diff(source).min())})
    return {'clothTransfers': transfers, 'avatarMapAndMorphs': morphs, 'face': {'sourceYM': y.tolist(), 'sourceHalfWidthsM': source_width,
            'requestedHalfWidthsM': requested.tolist(), 'curveHalfWidthsM': actual.tolist(),
            'exportedMeshYM': mesh_y.tolist(), 'exportedMeshHalfWidthsM': mesh_width.tolist(), 'projectionMaximumDifferenceM': projection_error,
            'exportedMinimumHalfWidthStepM': float(differences.min()), 'scope': 'Actual triangle cross-sections include chin/lip protection and fixed source topology. Actual mesh levels run from its changed chin minimum to the source eye boundary. Curve feasibility alone does not establish exported outline quality.'}}


def verify_batch(audit, manifest, spec, commit):
    identity = {'requestedCommit': commit, 'exactFiles': [], 'priorFailures': []}
    prior = json.loads(audit.read('assets-source/m2-representative-batch-v1/generated/manifest.json'))
    identity['v1ManifestSha256'] = audit.files['assets-source/m2-representative-batch-v1/generated/manifest.json']['sha256']
    audit.check('v2-v1-preserved-eight', len(prior['variants']) == 8 and prior.get('version') == 1)
    for row in manifest['variants']:
        if row['status'] != 'failed':
            continue
        directory = audit.resolve('assets-source/m2-representative-batch-v2/generated/' + row['id'])
        audit.check('v2-failed-has-no-admitted-assets-' + row['id'], {f.name for f in directory.iterdir()} == {'FAILED.json'})
        failure_detail = json.loads(row['error'][row['error'].index('{'):])
        body_ref = spec['sources'][row['sex']]['body']
        audit.ref(body_ref)
        model = audit.glb(audit.resolve(body_ref['path']))
        p = next(p for m in model.doc['meshes'] for p in m['primitives'] if model.doc['materials'][p['material']]['name'] == failure_detail['materials'][0])
        point = positions(model, p)[failure_detail['vertex']]
        audit.check('v2-failed-location-is-actual-original-vertex-' + row['id'], np.array_equal(point, failure_detail['inputPositionM']))
        actual_materials = [model.doc['materials'][p['material']]['name'] for m in model.doc['meshes'] for p in m['primitives'] if failure_detail['vertex'] in model.acc(p['indices']) and np.array_equal(positions(model, p)[failure_detail['vertex']], point)]
        identity.setdefault('currentFailures', []).append({'id': row['id'], **failure_detail, 'actualReferencedMaterialsAtVertex': actual_materials})
    v1_spec = json.loads(audit.read('assets-source/m2-representative-batch-v1/spec.json'))
    by_base = {v['id']: v['parameters'] for v in v1_spec['variants']}
    audit.check('v2-all-eight-original-numeric-parameters',
                len(manifest['variants']) == 8 and all(v.get('parameters') == by_base.get(v.get('basePresetId')) for v in manifest['variants']))
    package = 'assets-source/m2-representative-batch-v2/'
    first = json.loads(audit.read(package + 'attempt-1/manifest.json'))
    identity['numericalPreflight'] = json.loads(audit.read(package + 'numerical-preflight.json'))
    identity['attempt1History'] = json.loads(audit.read(package + 'attempt-1/history.json'))
    identity['priorFailures'] = [{'id': v['id'], 'status': v['status'], 'error': v.get('error')} for v in first['variants']]
    audit.check('v2-attempt1-preserves-eight-parameters',
                {v['id']: v['parameters'] for v in first['variants']} == {v['id']: v['parameters'] for v in manifest['variants']})
    for row in first['variants']:
        if row['status'] == 'failed':
            failure = json.loads(audit.read(package + 'attempt-1/' + row['id'] + '/FAILED.json'))
            audit.check('v2-preserved-first-failure-' + row['id'], failure == row)
        else:
            for key in ('avatar', 'equipmentManifest', 'fit', 'report', 'profile'):
                reference = row[key]
                mapped_path = reference['path'].replace(package + 'generated/', package + 'attempt-1/')
                audit.read(mapped_path, reference['sha256'], reference.get('bytes'))
            gear = json.loads(audit.resolve(package + 'attempt-1/' + row['id'] + '/equipment.json').read_bytes())
            for item in gear['items']:
                audit.read(package + 'attempt-1/' + row['id'] + '/' + Path(item['url']).name, item['sha256'], item.get('bytes'))
    snapshots = {}
    for filename in ('build.py', 'deform.py'):
        snapshots[filename] = audit.read(package + 'attempt-1/producer-source/' + filename)
    current_field = audit.read('scripts/m2-representative-batch-v2/deform.py')
    def method_tree(raw, owner, method):
        parsed = ast.parse(raw)
        cls = next(node for node in parsed.body if isinstance(node, ast.ClassDef) and node.name == owner)
        function = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == method)
        return ast.dump(function, include_attributes=False)
    for owner, method in (('Source', 'bind'), ('Mapper', 'field')):
        audit.check('v2-common-fix-keeps-geometry-' + owner + '.' + method,
                    method_tree(current_field, owner, method) == method_tree(snapshots['deform.py'], owner, method))
    audit.read('scripts/m2-representative-batch-v1/deform.py')
    audit.read('scripts/production/flow.py')
    audit.check('v2-explicit-producer-commit', isinstance(commit, str) and len(commit) == 40)
    if commit:
        for name in list(audit.files):
            result = subprocess.run(['git', '-C', str(audit.root), 'show', commit + ':' + name], capture_output=True)
            actual = audit.files[name]
            matched = result.returncode == 0 and hashlib.sha256(result.stdout).hexdigest() == actual['sha256']
            audit.check('v2-exact-producer-commit-file-' + name, matched)
            identity['exactFiles'].append({'path': name, 'matched': matched})
    return identity


class IndependentField:
    """Evaluate the documented field from recorded curve coefficients and original data.

    This implementation never imports or calls producer deformation/export code.
    """
    def __init__(self, audit, model, parameters, curve):
        self.parameters = parameters
        self.model = model
        bones = audit.bones(model)
        human = model.doc['extensions']['VRM']['humanoid']['humanBones']
        self.joints = {row['bone']: -bones[model.doc['nodes'][row['node']]['name']].reshape(4, 4)[3, :3].astype(float)
                       for row in human if model.doc['nodes'][row['node']]['name'] in bones}
        mouth = primitive(model, 'FaceMouth')
        mouth_points = positions(model, mouth)[np.unique(model.acc(mouth['indices']))]
        self.mouth_lo, self.mouth_hi = mouth_points.min(0) - self.joints['head'], mouth_points.max(0) - self.joints['head']
        self.y = np.asarray(curve['sourceYMetres'])
        self.source = PchipInterpolator(self.y, curve['sourceHalfWidthsM'])
        knots = np.asarray(curve.get('knots', np.r_[np.zeros(4), np.linspace(0, 1, 10)[1:-1], np.ones(4)]))
        t = (self.y - self.y[0]) / np.ptp(self.y)
        if 'coefficientsM' in curve:
            coefficients = np.asarray(curve['coefficientsM'])
        elif 'coefficients' in curve:
            coefficients = np.asarray(curve['coefficients'])
        else:
            coefficients = np.linalg.lstsq(BSpline(knots, np.eye(12), 3)(t), curve['actualHalfWidthsM'], rcond=None)[0]
        self.curve = BSpline(knots, coefficients, 3)
        audit.check('v2-recorded-curve-evaluation', np.max(abs(self.curve(t) - curve['actualHalfWidthsM'])) < 1e-10)

    @staticmethod
    def smooth(value):
        t = np.clip(value, 0, 1)
        return t * t * (3 - 2 * t)

    @staticmethod
    def bump(value):
        return np.maximum(0, 1 - value * value) ** 2

    def field(self, points):
        points = np.asarray(points, float)
        p, j, smooth, bump = self.parameters, self.joints, self.smooth, self.bump
        upper = 1 - smooth((points[:, 1] - (j['neck'][1] - .07)) / .06)
        delta = np.zeros_like(points)
        for side in ('left', 'right'):
            for first, second, key, radius in (('UpperArm', 'LowerArm', 'upperArmRadius', .095),
                                               ('UpperLeg', 'LowerLeg', 'thighRadius', .15)):
                start, end = j[side + first], j[side + second]
                axis = end - start
                t = (points - start) @ axis / (axis @ axis)
                radial = points - (start + np.clip(t, 0, 1)[:, None] * axis)
                weight = smooth(t / .15) * (1 - smooth((t - .78) / .22)) * bump(np.linalg.norm(radial, axis=1) / radius) * upper
                delta += radial * (p[key] * weight)[:, None]
            radial = points - j[side + 'UpperArm']
            weight = bump(np.linalg.norm(radial, axis=1) / .115) * upper
            delta += radial * (p['shoulderMass'] * weight)[:, None]
        hip = j['hips'][1] - .035
        waist = (j['hips'][1] + j['chest'][1]) / 2
        chest = j['chest'][1]
        hip_weight = 1 - smooth((points[:, 1] - hip) / (waist - hip))
        chest_weight = smooth((points[:, 1] - waist) / (chest - waist))
        waist_weight = 1 - hip_weight - chest_weight
        support = smooth((points[:, 1] - hip + .17) / .17) * (1 - smooth((points[:, 1] - chest - .10) / .10))
        x_relative = points[:, 0] - j['hips'][0]
        hand_limit = min(abs(j['leftHand'][0] - j['hips'][0]) - .08, abs(j['leftLowerArm'][0] - j['hips'][0]) + .10)
        mask = support * (1 - smooth((abs(x_relative) - .12) / max(.08, hand_limit - .12)))
        center_z = np.interp(points[:, 1], (j['hips'][1], chest), (j['hips'][2], j['chest'][2]))
        width = hip_weight * p['hipWidth'] + waist_weight * p['waistWidth'] + chest_weight * p['chestWidth']
        depth = hip_weight * p['hipDepth'] + waist_weight * p['waistDepth'] + chest_weight * p['chestDepth']
        delta[:, 0] += x_relative * width * mask
        delta[:, 2] += (points[:, 2] - center_z) * depth * mask
        x, y, z = (points - j['head']).T
        clipped_y = np.clip(y, self.y[0], self.y[-1])
        source = self.source(clipped_y)
        curve_delta = self.curve((clipped_y - self.y[0]) / np.ptp(self.y)) - source
        anchor = max(abs(self.mouth_lo[0]), abs(self.mouth_hi[0])) + .004
        lip_y = smooth((y - self.mouth_lo[1] + .012) / .008) * (1 - smooth((y - self.mouth_hi[1] - .004) / .008))
        def lateral(value):
            u = np.maximum(abs(value) - anchor, 0)
            t = np.clip(u / .02, 0, 1)
            return np.sign(value) * np.where(u < .02, .02 * (t ** 3 - .5 * t ** 4), u - .01)
        ratio = (1 - lip_y) * x / np.maximum(source, 1e-5) + lip_y * lateral(x) / np.maximum(lateral(source), 1e-5)
        front = 1 - smooth((z + .025) / .03)
        region = smooth((y - self.y[0] + .02) / .02) * (y < self.y[-1])
        delta[:, 0] += ratio * curve_delta * front * region
        chin = 1 - smooth((y - self.y[0]) / (self.mouth_lo[1] - .004 - self.y[0]))
        delta[:, 1] -= p['chinLengthM'] * chin * front * region
        delta[:, 2] -= p['chinProjectionM'] * chin * front * region
        return points + delta

    def jacobian(self, points, protected):
        columns = []
        for axis in np.eye(3) * 1e-5:
            columns.append((self.field(points + axis) - self.field(points - axis)) / 2e-5)
        result = np.stack(columns, axis=2)
        result[protected] = np.eye(3)
        return result

    def verify(self, audit, source, target, label):
        groups = {}
        for mi, mesh in enumerate(source.doc['meshes']):
            for pi, p in enumerate(mesh['primitives']):
                key = (p['attributes']['POSITION'], p['attributes']['NORMAL'])
                groups.setdefault(key, []).append((p, target.doc['meshes'][mi]['primitives'][pi]))
        records = []
        body = primitive(source, 'Body_00_SKIN')
        body_points = positions(source, body)
        body_faces = triangles(source, body)
        donor_delta = self.field(body_points) - body_points
        for key, primitives in groups.items():
            points = positions(source, primitives[0][0])
            used = np.unique(np.concatenate([source.acc(p['indices']) for p, _ in primitives]))
            protected = np.ones(len(points), bool)
            protected[used] = False
            cloth = []
            for p, _ in primitives:
                material = source.doc['materials'][p['material']]['name']
                ids = np.unique(source.acc(p['indices']))
                if any(t in material for t in ('HAIR', '_EYE', 'FaceMouth', 'Eyeline', 'Eyelash', 'FaceBrow')):
                    protected[ids] = True
                if '_CLOTH' in material:
                    cloth.extend(ids)
            x, y, z = (points - self.joints['head']).T
            protected |= ((abs(x) < max(abs(self.mouth_lo[0]), abs(self.mouth_hi[0])) + .004)
                          & (y > self.mouth_lo[1] - .004) & (y < self.mouth_hi[1] + .004) & (z < -.04))
            cloth = np.setdiff1d(np.unique(cloth).astype(int), np.flatnonzero(protected))
            # Cloth transfer has its separate actual donor/normal checks. All other
            # vertices use the same independent field at base and morph endpoints.
            selection = used
            mapped = self.field(points)
            mapped[protected] = points[protected]
            transfer_jacobian = None
            if len(cloth):
                chosen, bary, anchor, derivative, distance = nearest_binding(points[cloth], body_points, body_faces)
                delta = donor_delta[body_faces[chosen]]
                displacement = np.einsum('ni,nij->nj', bary, delta)
                mapped[cloth] = points[cloth] + displacement
                edges = np.stack((delta[:, 1] - delta[:, 0], delta[:, 2] - delta[:, 0]), axis=2)
                transfer_jacobian = np.eye(3) + edges @ derivative
            actual = positions(target, primitives[0][1])
            error = np.linalg.norm(actual[selection] - mapped[selection], axis=1)
            prefix = label + '/' + str(key[0])
            audit.check('v2-independent-field-position-' + prefix, error.max(initial=0) < 3e-7, float(error.max(initial=0)))
            jacobian = self.jacobian(points, protected)
            if transfer_jacobian is not None:
                jacobian[cloth] = transfer_jacobian
            normal = source.acc(primitives[0][0]['attributes']['NORMAL']).astype(float)
            predicted_normal = normal_map(normal, jacobian)
            actual_normal = target.acc(primitives[0][1]['attributes']['NORMAL']).astype(float)
            normal_error = np.linalg.norm(actual_normal[selection] - predicted_normal[selection], axis=1)
            audit.check('v2-independent-field-normal-' + prefix, normal_error.max(initial=0) < 2e-5, float(normal_error.max(initial=0)))
            minimum_jacobian = float(np.linalg.det(jacobian[selection]).min(initial=1))
            audit.check('v2-independent-base-jacobian-' + prefix, minimum_jacobian > .12, minimum_jacobian)
            morph_errors, normal_errors, endpoint_determinants = [], [], []
            for before, after in zip(primitives[0][0].get('targets', []), primitives[0][1].get('targets', [])):
                original_delta = source.acc(before['POSITION']).astype(float)
                endpoint = points + original_delta
                mapped_end = self.field(endpoint)
                mapped_end[protected] = endpoint[protected]
                observed_delta = target.acc(after['POSITION']).astype(float)
                morph_errors.append(float(np.linalg.norm((observed_delta - (mapped_end - mapped))[selection], axis=1).max(initial=0)))
                source_normal_delta = source.acc(before['NORMAL']).astype(float) if 'NORMAL' in before else np.zeros_like(normal)
                endpoint_jacobian = self.jacobian(endpoint, protected)
                endpoint_determinants.append(float(np.linalg.det(endpoint_jacobian[selection]).min(initial=1)))
                desired = normal_map(normal + source_normal_delta, endpoint_jacobian) - predicted_normal
                desired[protected] = source_normal_delta[protected]
                observed = target.acc(after['NORMAL']).astype(float) if 'NORMAL' in after else np.zeros_like(normal)
                normal_errors.append(float(np.linalg.norm((observed - desired)[selection], axis=1).max(initial=0)))
            audit.check('v2-independent-morph-jacobians-' + prefix, min(endpoint_determinants, default=1) > .12, endpoint_determinants)
            audit.check('v2-morph-map-endpoints-' + prefix, max(morph_errors, default=0) < 3e-7, morph_errors)
            audit.check('v2-morph-normal-endpoints-' + prefix, max(normal_errors, default=0) < 2e-5, normal_errors)
            records.append({'accessor': key[0], 'fieldVertices': len(selection), 'clothVertices': len(cloth),
                            'positionMaxErrorM': float(error.max(initial=0)), 'normalMaxError': float(normal_error.max(initial=0)),
                            'morphEndpointErrorsM': morph_errors, 'morphNormalErrors': normal_errors,
                            'minimumFieldJacobian': minimum_jacobian, 'endpointMinimumJacobians': endpoint_determinants})
        return records
