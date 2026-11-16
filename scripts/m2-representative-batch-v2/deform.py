"""One constrained source-space map and immutable body-to-garment transfer."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
import numpy as np
from scipy.interpolate import BSpline, PchipInterpolator
from scipy.optimize import LinearConstraint, minimize

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/m2-representative-batch-v1'))
legacy_spec = importlib.util.spec_from_file_location('representative_v1_geometry', ROOT/'scripts/m2-representative-batch-v1/deform.py')
legacy = importlib.util.module_from_spec(legacy_spec); legacy_spec.loader.exec_module(legacy)
GLB, require, sha, numeric = legacy.GLB, legacy.require, legacy.sha, legacy.numeric


def primitive(g, token):
    return next(p for m in g.doc['meshes'] for p in m['primitives'] if token in g.doc['materials'][p['material']]['name'])


def section_widths(P, F, levels):
    triangles = P[F]; widths = []
    for y in levels:
        selected = triangles[(triangles[:, :, 1].min(1) <= y)&(triangles[:, :, 1].max(1) >= y)]
        points = []
        for i in range(3):
            a, b = selected[:, i], selected[:, (i+1)%3]; dy = b[:, 1]-a[:, 1]
            t = (y-a[:, 1])/np.where(abs(dy) > 1e-12, dy, np.inf)
            q = a+t[:, None]*(b-a)
            points.extend(q[(t >= 0)&(t <= 1)&(abs(dy) > 1e-12)&(q[:, 2] < -.025)])
        require(bool(points), 'Face contour source section is empty')
        widths.append(np.ptp(np.array(points)[:, 0])/2)
    return np.array(widths)


class Source:
    def __init__(self, raw):
        self.g = GLB(raw); self.context = legacy.source_context(self.g)
        p = primitive(self.g, 'Body_00_SKIN')
        self.P = np.array(self.g.accessor(p['attributes']['POSITION']), float)
        self.F = np.array(self.g.accessor(p['indices']), int).reshape(-1, 3)
        face = primitive(self.g, 'Face_00_SKIN'); Q = np.array(self.g.accessor(face['attributes']['POSITION']), float)-self.context['joints']['head']
        faces = np.array(self.g.accessor(face['indices']), int).reshape(-1, 3)
        self.face_lo = float(Q[np.unique(faces), 1].min()+1e-5)
        self.face_hi = float(self.context['eyeMin'][1]-self.context['joints']['head'][1]-.006)
        require(self.face_hi-self.face_lo > .04, 'Reviewed lower-face support missing')
        self.face_y = np.linspace(self.face_lo, self.face_hi, 101)
        self.face_width = section_widths(Q, faces, self.face_y)
        self.face_source = PchipInterpolator(self.face_y, self.face_width)
        self.anchors = {}

    def bind(self, P):
        key = numeric(P)
        if key in self.anchors: return self.anchors[key]
        # Closest source triangle/point is calculated once, then immutable for every preset.
        best = np.full(len(P), np.inf); indices = np.zeros(len(P), int); bary = np.zeros((len(P), 3)); derivatives = np.zeros((len(P), 3, 3))
        for i, tri in enumerate(self.P[self.F]):
            a, b, c = tri; E = np.column_stack([b-a, c-a]); gram = E.T@E
            if np.linalg.det(gram) < 1e-20: continue
            pinv = np.linalg.solve(gram, E.T); uv = (P-a)@pinv.T
            candidates = []
            inside = (uv[:, 0] >= 0)&(uv[:, 1] >= 0)&(uv.sum(1) <= 1)
            q = a+uv@E.T; B = np.column_stack([1-uv.sum(1), uv])
            candidates.append((np.where(inside, ((P-q)**2).sum(1), np.inf), B, E@pinv))
            for start, end in [(0, 1), (1, 2), (2, 0)]:
                edge = tri[end]-tri[start]; length = edge@edge
                t = np.clip((P-tri[start])@edge/length, 0, 1); Q = tri[start]+t[:, None]*edge
                B = np.zeros((len(P), 3)); B[:, start] = 1-t; B[:, end] = t
                derivative = np.broadcast_to(np.outer(edge, edge)/length, (len(P), 3, 3)).copy()
                derivative[(t == 0)|(t == 1)] = 0
                candidates.append((((P-Q)**2).sum(1), B, derivative))
            for distance, B, derivative in candidates:
                selected = distance < best
                best[selected] = distance[selected]; indices[selected] = i; bary[selected] = B[selected]
                derivatives[selected] = derivative if derivative.ndim == 2 else derivative[selected]
        require(np.isfinite(best).all(), 'Garment donor mapping has no source surface')
        source_triangles = self.P[self.F[indices]]
        anchor = np.einsum('ni,nij->nj', bary, source_triangles)
        E = np.stack([source_triangles[:, 1]-source_triangles[:, 0], source_triangles[:, 2]-source_triangles[:, 0]], axis=2)
        pseudoinverse = np.linalg.solve(E.transpose(0, 2, 1)@E, E.transpose(0, 2, 1))
        binding = {'faces': indices, 'bary': bary, 'anchor': anchor, 'offset': P-anchor,
                   'derivative': pseudoinverse@derivatives, 'sourcePositionSha256': key,
                   'bindingSha256': sha(indices.astype('<u4').tobytes()+bary.astype('<f8').tobytes()),
                   'maximumSourceOffsetM': float(np.sqrt(best).max())}
        self.anchors[key] = binding
        return binding


class Mapper:
    def __init__(self, source, parameters):
        self.source = source; self.p = parameters; self.c = source.context
        self.curve, self.curve_report = self.face_curve()
        self.donor_delta = self.field(source.P)-source.P
        self.transfer_report = []

    def face_curve(self):
        s = self.source; p = self.p; y = s.face_y; source = s.face_width
        # Keep the numerical parameter values. Request the original jaw/cheek width intent,
        # then solve once in a continuous monotone/concave lower-face feasible set.
        jaw = 1-legacy.smooth((y+.005)/.045); cheek = legacy.bump((y-.005)/.045)
        request = source*(1+p['jawWidth']*jaw+p['cheekWidth']*cheek)
        count = 12; degree = 3; knots = np.r_[np.zeros(4), np.linspace(0, 1, count-2)[1:-1], np.ones(4)]
        t = (y-s.face_lo)/(s.face_hi-s.face_lo); basis = BSpline(knots, np.eye(count), degree)
        B = basis(t); D1 = basis(t, 1); D2 = basis(t, 2); scale = source[-1]
        end_slope = float(s.face_source(s.face_hi, 1)*(s.face_hi-s.face_lo)/scale)
        end_points = np.vstack([B[0], B[-1], D1[-1]])
        endpoint_values = np.array([source[0]/scale, 1, end_slope])
        # Cubic-spline second derivative is linear between knots. Constraining
        # each knot is sufficient. Its nonpositive value plus the positive
        # fixed final slope also guarantees monotonicity over the whole curve.
        constraints = [LinearConstraint(basis(np.unique(knots), 2), -np.inf, 0), LinearConstraint(end_points, endpoint_values, endpoint_values)]
        quadratic = source[0]/scale+(1-source[0]/scale)*(2*t-t*t)+end_slope*(t*t-t)
        initial = np.linalg.lstsq(B, quadratic, rcond=None)[0]
        target = request/scale; smoothing = .0002
        def objective(c):
            residual = B@c-target; curvature = D2@c
            return float(residual@residual+smoothing*(curvature@curvature))
        def gradient(c): return 2*B.T@(B@c-target)+2*smoothing*D2.T@(D2@c)
        hessian = 2*B.T@B+2*smoothing*D2.T@D2
        solved = minimize(objective, initial, jac=gradient, hess=lambda _: hessian, constraints=constraints,
                          method='trust-constr', options={'gtol': 1e-10, 'maxiter': 250})
        require(solved.success, 'Common face curve solve failed: '+solved.message)
        curve = BSpline(knots, solved.x*scale, degree); dense = np.linspace(0, 1, 401)
        require(curve(dense, 1).min() >= -1e-9 and curve(dense, 2).max() <= 1e-8, 'Face curve derivative constraints failed')
        actual = curve(t)
        return curve, {'sourceYMetres': y.tolist(), 'sourceHalfWidthsM': source.tolist(), 'requestedHalfWidthsM': request.tolist(),
            'actualHalfWidthsM': actual.tolist(), 'maximumProjectionDifferenceM': float(abs(actual-request).max()),
            'normalizedYDomainM': [s.face_lo, s.face_hi], 'degree': degree, 'knots': knots.tolist(), 'coefficientsM': (solved.x*scale).tolist(),
            'activeMonotonicConstraints': int(np.count_nonzero(curve(t, 1) < 1e-6)),
            'activeConcavityConstraints': int(np.count_nonzero(abs(curve(t, 2)) < 1e-6)),
            'upperEyeBoundaryValueAndSlopePreserved': True, 'intentStatus': 'partial-constrained-projection',
            'solver': 'One trust-constr convex quadratic width-curve fit; cubic B-spline, nonnegative first derivative, nonpositive second derivative',
            'iterations': int(solved.nit)}

    def field(self, P):
        P = np.asarray(P, float); p = self.p; j = self.c['joints']; H = j['head']; x, y, z = (P-H).T
        only_limbs = {k: (p[k] if k in ['shoulderMass', 'upperArmRadius', 'thighRadius'] else 0) for k in p}
        D = legacy.field(P, only_limbs, self.c)-P
        hip = j['hips'][1]-.035; waist = (j['hips'][1]+j['chest'][1])/2; chest = j['chest'][1]
        w_hip = 1-legacy.smooth((P[:, 1]-hip)/(waist-hip)); w_chest = legacy.smooth((P[:, 1]-waist)/(chest-waist)); w_waist = 1-w_hip-w_chest
        support = legacy.smooth((P[:, 1]-(hip-.17))/.17)*(1-legacy.smooth((P[:, 1]-(chest+.10))/.10))
        dx = P[:, 0]-j['hips'][0]; hand_limit = min(abs(j['leftHand'][0]-j['hips'][0])-.08, abs(j['leftLowerArm'][0]-j['hips'][0])+.10)
        mask = support*(1-legacy.smooth((abs(dx)-.12)/max(.08, hand_limit-.12)))
        cz = np.interp(P[:, 1], [j['hips'][1], chest], [j['hips'][2], j['chest'][2]])
        width = w_hip*p['hipWidth']+w_waist*p['waistWidth']+w_chest*p['chestWidth']
        depth = w_hip*p['hipDepth']+w_waist*p['waistDepth']+w_chest*p['chestDepth']
        D[:, 0] += dx*width*mask; D[:, 2] += (P[:, 2]-cz)*depth*mask
        s = self.source; yc = np.clip(y, s.face_lo, s.face_hi); t = (yc-s.face_lo)/(s.face_hi-s.face_lo)
        original = s.face_source(yc); delta = self.curve(t)-original
        mouth_lo, mouth_hi = self.c['mouthMin']-H, self.c['mouthMax']-H
        anchor = max(abs(mouth_lo[0]), abs(mouth_hi[0]))+.004
        lip_y = legacy.smooth((y-mouth_lo[1]+.012)/.008)*(1-legacy.smooth((y-mouth_hi[1]-.004)/.008))
        def lateral(value):
            u = np.maximum(abs(value)-anchor, 0); f = np.clip(u/.02, 0, 1)
            return np.sign(value)*np.where(u < .02, .02*(f**3-.5*f**4), u-.01)
        plain = x/np.maximum(original, 1e-5); fixed_lip = lateral(x)/np.maximum(lateral(original), 1e-5)
        ratio = (1-lip_y)*plain+lip_y*fixed_lip
        front = 1-legacy.smooth((z+.025)/.03)
        region = legacy.smooth((y-(s.face_lo-.02))/.02)*(y < s.face_hi)
        D[:, 0] += ratio*delta*front*region
        chin = 1-legacy.smooth((y-s.face_lo)/(mouth_lo[1]-.004-s.face_lo))
        D[:, 1] -= p['chinLengthM']*chin*front*region
        D[:, 2] -= p['chinProjectionM']*chin*front*region
        return P+D

    def transfer(self, P):
        binding = self.source.bind(P); delta = self.donor_delta[self.source.F[binding['faces']]]
        displacement = np.einsum('ni,nij->nj', binding['bary'], delta)
        delta_edges = np.stack([delta[:, 1]-delta[:, 0], delta[:, 2]-delta[:, 0]], axis=2)
        J = np.eye(3)+delta_edges@binding['derivative']
        mapped = P+displacement
        error = np.linalg.norm(mapped-(binding['anchor']+displacement)-binding['offset'], axis=1).max()
        self.transfer_report.append({k: binding[k] for k in ['sourcePositionSha256', 'bindingSha256', 'maximumSourceOffsetM']})
        self.transfer_report[-1].update(vertices=len(P), sourceOffsetPreservationMaxErrorM=float(error), minimumJacobianDeterminant=float(np.linalg.det(J).min()))
        return mapped, J

    def group(self, g, primitives, P, full_avatar, fixed_protected=None):
        ids = np.unique(np.concatenate([g.accessor(p['indices']) for p in primitives]))
        protected = legacy.protect(g, primitives, self.c, P) if full_avatar else np.zeros(len(P), bool)
        protected[np.setdiff1d(np.arange(len(P)), ids)] = True
        if fixed_protected is not None: protected = fixed_protected.copy()
        cloth = np.unique(np.concatenate([g.accessor(p['indices']) for p in primitives if not full_avatar or '_CLOTH' in g.doc['materials'][p['material']]['name']])) if any(not full_avatar or '_CLOTH' in g.doc['materials'][p['material']]['name'] for p in primitives) else np.array([], int)
        cloth = cloth[~protected[cloth]]
        mapped = self.field(P); mapped[protected] = P[protected]
        columns = []
        for axis in range(3):
            epsilon = np.zeros(3); epsilon[axis] = 1e-5
            columns.append((self.field(P+epsilon)-self.field(P-epsilon))/2e-5)
        J = np.stack(columns, axis=2); J[protected] = np.eye(3)
        if len(cloth): mapped[cloth], J[cloth] = self.transfer(P[cloth])
        determinants = np.linalg.det(J); worst = int(np.argmin(determinants))
        require(np.isfinite(mapped).all() and determinants[worst] > .12, 'Common v2 field/transfer folded or too small: '+json.dumps({
            'determinant': float(determinants[worst]), 'vertex': worst, 'inputPositionM': P[worst].tolist(),
            'materials': [g.doc['materials'][p['material']]['name'] for p in primitives], 'donorVertex': bool(worst in cloth)}))
        return mapped, J, protected, cloth


def rewrite(raw, mapper, identifier, full_avatar=False):
    g = GLB(raw); doc = copy.deepcopy(g.doc); blob = bytearray(g.binary); groups = {}; traces = []
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            require(p.get('mode', 4) == 4 and 'TANGENT' not in p['attributes'], 'Unsupported source primitive/tangent')
            groups.setdefault((p['attributes']['POSITION'], p['attributes']['NORMAL']), []).append(p)
    def write(index, values, kind=None):
        values = np.asarray(values, dtype='<f4'); blob.extend(b'\0'*(-len(blob)%4))
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': values.nbytes}); blob.extend(values.tobytes())
        row = copy.deepcopy(doc['accessors'][index]); row.update(bufferView=len(doc['bufferViews'])-1, byteOffset=0, componentType=5126)
        if kind: row['type'] = kind
        if row['type'] == 'VEC3': row.update(min=values.min(0).tolist(), max=values.max(0).tolist())
        doc['accessors'].append(row); return len(doc['accessors'])-1
    any_changed = False
    for (pi, ni), primitives in groups.items():
        P, N = np.array(g.accessor(pi), float), np.array(g.accessor(ni), float)
        mapped, J, protected, cloth = mapper.group(g, primitives, P, full_avatar)
        changed = np.linalg.norm(mapped-P, axis=1) > 1e-10; any_changed |= bool(changed.any()); normals = legacy.normal_map(N, J)
        position_index = write(pi, mapped) if changed.any() else pi; normal_index = write(ni, normals) if np.max(abs(normals-N)) > 1e-8 else ni
        targets = primitives[0].get('targets', []); require(all(p.get('targets', []) == targets for p in primitives), 'Shared morph targets disagree')
        require(not targets or not len(cloth), 'Clothing morph donor endpoints not supported by exact sources')
        updated = []; endpoint_error = 0.; added_normals = 0; zero = None
        for target_number, target in enumerate(targets):
            D = np.array(g.accessor(target['POSITION']), float); E = P+D
            try: end, Je, _, _ = mapper.group(g, primitives, E, full_avatar, protected)
            except Exception as error: raise ValueError('Morph endpoint '+str(target_number)+': '+str(error)) from error
            delta = end-mapped
            delta[protected] = D[protected]
            item = copy.deepcopy(target)
            if not np.array_equal(delta.astype('<f4'), D.astype('<f4')): item['POSITION'] = write(target['POSITION'], delta)
            source_normal = np.array(g.accessor(target['NORMAL']), float) if 'NORMAL' in target else np.zeros_like(N)
            nd = legacy.normal_map(N+source_normal, Je)-normals; nd[protected] = source_normal[protected]
            if np.max(abs(nd-source_normal)) > 1e-8:
                item['NORMAL'] = write(target.get('NORMAL', ni), nd, 'VEC3'); added_normals += int('NORMAL' not in target)
            elif 'NORMAL' not in target and changed.any():
                if zero is None: zero = write(ni, np.zeros_like(N), 'VEC3')
                item['NORMAL'] = zero; added_normals += 1
            endpoint_error = max(endpoint_error, float(np.linalg.norm(mapped.astype('<f4')+delta.astype('<f4')-end, axis=1).max())); updated.append(item)
        for p in primitives:
            p['attributes'].update(POSITION=position_index, NORMAL=normal_index)
            if targets: p['targets'] = copy.deepcopy(updated)
        traces.append({'sourcePositionAccessor': pi, 'vertices': len(P), 'changedVertices': int(changed.sum()),
            'maxDisplacementM': float(np.linalg.norm(mapped-P, axis=1).max()), 'minimumJacobianDeterminant': float(np.linalg.det(J).min()),
            'protectedVertices': int(protected.sum()), 'protectedMaxDisplacementM': float(np.linalg.norm(mapped[protected]-P[protected], axis=1).max(initial=0)),
            'morphTargets': len(targets), 'addedMorphNormalTargets': added_normals, 'morphEndpointMaxErrorM': endpoint_error,
            'garmentDonorVertices': len(cloth), 'garmentNormalsMethod': 'Inverse transpose of actual piecewise donor-transfer Jacobian; fixed closest source triangle'})
    if not any_changed: return raw, {'groups': traces, 'geometryUnchanged': True, 'images': legacy.image_rows(g)}
    doc['asset']['generator'] = 'm2-representative-batch-v2 constrained field and fixed donor transfer'
    if full_avatar: doc['extensions']['VRM']['meta']['title'] = identifier
    doc['buffers'][0]['byteLength'] = len(blob); text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); text += b' '*(-len(text)%4); blob.extend(b'\0'*(-len(blob)%4))
    data = struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(blob))+struct.pack('<I4s', len(text), b'JSON')+text+struct.pack('<I4s', len(blob), b'BIN\0')+blob
    new = GLB(data)
    require(new.doc['nodes'] == g.doc['nodes'] and new.doc['skins'] == g.doc['skins'] and legacy.image_rows(new) == legacy.image_rows(g), 'Source skeleton/images changed')
    return data, {'groups': traces, 'geometryUnchanged': False, 'images': legacy.image_rows(g)}
